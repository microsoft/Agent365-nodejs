// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import { IConfigurationProvider } from '@microsoft/agents-a365-runtime';
import { ToolingConfiguration, defaultToolingConfigurationProvider } from '../configuration';
import {
  PurviewDlpAccessToken,
  PurviewDlpActivity,
  PurviewDlpAgentContext,
  PurviewDlpDecision,
  PurviewDlpEvaluateOptions,
  PurviewDlpEvaluationResult,
  PurviewDlpTokenResolver,
} from './contracts';
import {
  createDeadline,
  cut,
  describeError,
  isNonNegativeInteger,
  isObject,
  networkErrorCode,
  nonEmpty,
  parseHttpsUrl,
  readExpiry,
  sdkError,
  tokenCacheKeyOf,
  trimTrailingSlashes,
  untilAborted,
  wellFormed,
} from './internal';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

const ACTIVITIES: ReadonlySet<string> = new Set(['uploadText', 'downloadText']);
const PROCESS_CONTENT_PATH = '/dataSecurityAndGovernance/processContent';
const DEFAULT_AGENT_VERSION = '1.0';
const BLOCK = 'block';
const BLOCK_ACCESS = 'blockaccess';
const MAX_CACHED_TOKENS = 100;
const MAX_TRACKED_SESSIONS = 1000;
const TOKEN_REFRESH_SKEW_MILLISECONDS = 5 * 60 * 1000;

const FAIL_CLOSED_REASON = 'Data loss prevention validation is unavailable and this agent is configured to fail closed.';
const TRUNCATED_FAIL_CLOSED_REASON =
  'The content is too long to be fully validated by Microsoft Purview, and this agent is configured to fail closed.';
const PARTLY_READ_ERROR = 'the content was only partly read; Purview evaluated a truncated copy';
const BLANK_PART_ERROR = 'the content was only partly read, and the part read has no text; Purview was not called';
const BLOCK_REASONS: Readonly<Record<PurviewDlpActivity, string>> = {
  uploadText: 'The request was blocked by a Microsoft Purview data loss prevention policy.',
  downloadText: 'The response was blocked by a Microsoft Purview data loss prevention policy.',
};

/** Options for {@link PurviewDlpClient}. */
export interface PurviewDlpClientOptions {
  /** The configuration source; defaults to `defaultToolingConfigurationProvider` (environment variables). */
  configProvider?: IConfigurationProvider<ToolingConfiguration>;
  /** The fetch implementation; defaults to the global `fetch`. */
  fetchImplementation?: typeof fetch;
  /** Creates request ids (tests); defaults to `crypto.randomUUID`. */
  idFactory?: () => string;
  /** The clock in epoch milliseconds (tests); defaults to `Date.now`. */
  now?: () => number;
}

interface CachedToken {
  token: PurviewDlpAccessToken;
  expiresAtMilliseconds: number;
}

interface ResolvedToken {
  token: PurviewDlpAccessToken;
  expiresAtMilliseconds?: number;
}

/** The agent identity and conversation of one evaluation, with every default applied. */
interface Identity {
  agentId: string;
  sessionId: string;
  sequence: number;
  blueprintId?: string;
  applicationId: string;
  agentName: string;
  agentVersion: string;
}

/**
 * Client for Microsoft Purview data loss prevention (DLP) through the Microsoft Graph `processContent` API
 * (`POST {graph}/me/dataSecurityAndGovernance/processContent`, or `/users/{id}/...`).
 *
 * {@link evaluate} sends the text of a prompt (`uploadText`) or a reply (`downloadText`) to Purview, which
 * applies the tenant's DLP policies for the agent's application and records the interaction for audit, and
 * returns whether the content may proceed: a policy action with `restrictionAction: block` blocks it. Each
 * call carries a new `client-request-id` and a Microsoft Graph token from a {@link PurviewDlpTokenResolver},
 * for example the agentic user's (`PurviewDlpTokenResolvers.fromAgenticUser`).
 */
export class PurviewDlpClient {
  /** The header Microsoft Graph logs each request under. */
  public static readonly CLIENT_REQUEST_ID_HEADER = 'client-request-id';

  private readonly configProvider: IConfigurationProvider<ToolingConfiguration>;
  private readonly fetchImplementation?: typeof fetch;
  private readonly idFactory: () => string;
  private readonly now: () => number;
  private readonly tokens = new Map<string, CachedToken>();
  private readonly inFlightTokens = new Map<string, Promise<ResolvedToken>>();
  private readonly sequences = new Map<string, number>();
  /** The highest sequence of a session no longer tracked: a session seen again resumes above it. */
  private evictedSequence = -1;

  /**
   * @param options The configuration source and test seams.
   * @throws When Purview DLP is enabled but the configuration cannot be used (for example the Graph base
   * URL is not an absolute https URL).
   */
  constructor(options: PurviewDlpClientOptions = {}) {
    this.configProvider = options.configProvider ?? defaultToolingConfigurationProvider;
    this.fetchImplementation = options.fetchImplementation;
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? Date.now;
    PurviewDlpClient.validate(this.configuration);
  }

  /** The configuration this client uses. */
  public get configuration(): ToolingConfiguration {
    return this.configProvider.getConfiguration();
  }

  /**
   * Whether the value is a Purview activity this client evaluates.
   *
   * @param activity The activity, for example `uploadText`.
   * @returns True for `uploadText` and `downloadText`.
   */
  public static isActivity(activity: unknown): activity is PurviewDlpActivity {
    return typeof activity === 'string' && ACTIVITIES.has(activity);
  }

  /**
   * Describes an exception for a result's `error`: its type (for example `TypeError`), with the message only
   * when the SDK raised it (an invalid argument or setting). Another exception, for example from a host's
   * configuration provider or token resolver, may carry a token or a response body, so only its type is kept.
   *
   * @param error The exception.
   * @returns The description, on one line.
   */
  public static describeError(error: unknown): string {
    return describeError(error);
  }

  /**
   * Evaluates text with Purview DLP. One deadline (the configured timeout) covers the token acquisition
   * and the request.
   *
   * Text longer than `purviewDlpMaxContentCharacters` is cut and sent with `isTruncated: true`, so Purview
   * sees only its beginning. A block still stands, but an allow does not cover the rest: the result is
   * marked `truncated`, and `allowed` follows the fail mode. The same holds for text the caller marks as
   * only the first part of the content (`options.truncated`).
   *
   * @param activity `uploadText` for a prompt, `downloadText` for a reply.
   * @param text The text to evaluate.
   * @param agent The agent identity and conversation (`sessionId` is required).
   * @param tokenResolver Resolves the Microsoft Graph token, and the user to evaluate for.
   * @param signal Cancels the evaluation; the returned promise then rejects with its reason.
   * @param options Whether the text is only the first part of the content.
   * @returns The result, or null without a call when Purview DLP is disabled or the text is empty. When
   * no verdict is obtained (token, transport, timeout, HTTP or processing failure) the result is not
   * evaluated and follows the configured fail mode.
   * @throws When the arguments are invalid (for example no `agentId` or `sessionId`), or the Graph base URL
   * is not an absolute https URL.
   */
  public async evaluate(
    activity: PurviewDlpActivity,
    text: string,
    agent: PurviewDlpAgentContext,
    tokenResolver: PurviewDlpTokenResolver,
    signal?: AbortSignal,
    options: PurviewDlpEvaluateOptions = {},
  ): Promise<PurviewDlpEvaluationResult | null> {
    const configuration = this.configuration;
    if (!configuration.isPurviewDlpEnabled) {
      return null;
    }

    if (!PurviewDlpClient.isActivity(activity)) {
      throw sdkError(new TypeError("activity must be 'uploadText' or 'downloadText'."));
    }

    if (typeof text !== 'string') {
      throw sdkError(new TypeError('text must be a string.'));
    }

    PurviewDlpClient.requireArguments(agent, tokenResolver);
    const partial = options?.truncated === true;
    if (text.trim().length === 0) {
      // Blank text has nothing to evaluate, unless it is only the first part of the content: the rest was not
      // read, so it is unverified.
      return partial ? { ...this.unavailable(activity, BLANK_PART_ERROR), truncated: true } : null;
    }

    const identity = this.identity(agent);
    const baseUrl = PurviewDlpClient.graphBaseUrl(configuration);
    signal?.throwIfAborted();
    const maxCharacters = configuration.purviewDlpMaxContentCharacters;
    const tooLong = text.length > maxCharacters;
    const truncated = tooLong || partial;
    const data = wellFormed(tooLong ? cut(text, maxCharacters) : text);
    // One id per call: the client-request-id, and the content entry's identifier in Purview.
    const requestId = this.idFactory();
    const started = this.now();
    const deadline = createDeadline(configuration.purviewDlpTimeoutMilliseconds, signal);
    const truncation = tooLong
      ? `content exceeded A365_PURVIEW_DLP_MAX_CONTENT_CHARACTERS (${maxCharacters}); Purview evaluated a truncated copy`
      : PARTLY_READ_ERROR;
    const complete = (result: PurviewDlpEvaluationResult): PurviewDlpEvaluationResult =>
      truncated ? PurviewDlpClient.ofTruncatedContent(result, truncation, configuration) : result;
    try {
      let token: PurviewDlpAccessToken;
      try {
        token = await untilAborted(this.getAccessToken(agent, tokenResolver, configuration, deadline.signal), deadline.signal);
      } catch (error) {
        if (signal?.aborted) {
          throw signal.reason;
        }

        const detail = deadline.signal.aborted ? 'timeout' : describeError(error);
        return complete(this.failure(activity, requestId, `token unavailable: ${detail}`, undefined, started, configuration));
      }

      const body = this.body(activity, data, truncated, identity, requestId);
      const url = `${baseUrl}${token.userId ? `/users/${encodeURIComponent(token.userId)}` : '/me'}${PROCESS_CONTENT_PATH}`;
      return complete(await this.post(url, body, activity, requestId, token.accessToken, started, configuration, deadline.signal, signal));
    } finally {
      deadline.dispose();
    }
  }

  /**
   * A result for an evaluation that could not be made (for example no agent identity): it follows the
   * configured fail mode, like a transport failure.
   *
   * @param activity The Purview activity.
   * @param error Why no verdict was obtained.
   * @param latencyMilliseconds Time spent before the failure.
   * @returns The not-evaluated result.
   */
  public unavailable(activity: PurviewDlpActivity, error: string, latencyMilliseconds = 0): PurviewDlpEvaluationResult {
    return this.result(activity, this.idFactory(), error, undefined, latencyMilliseconds, this.configuration);
  }

  // ---- request -----------------------------------------------------------------------------

  private identity(agent: PurviewDlpAgentContext): Identity {
    const agentId = nonEmpty(agent.agentId);
    if (!agentId) {
      throw sdkError(new TypeError('agent.agentId is required.'));
    }

    const sessionId = nonEmpty(agent.sessionId);
    if (!sessionId) {
      throw sdkError(new TypeError('agent.sessionId is required.'));
    }

    const blueprintId = nonEmpty(agent.blueprintId);
    return {
      agentId,
      sessionId,
      sequence: isNonNegativeInteger(agent.sequence) ? agent.sequence : this.nextSequence(sessionId),
      ...(blueprintId ? { blueprintId } : {}),
      // DLP policies for an agent are scoped to its blueprint's application.
      applicationId: nonEmpty(agent.applicationId) ?? blueprintId ?? agentId,
      // Purview rejects a content entry without a name (inline, as a processing error).
      agentName: nonEmpty(agent.agentName) ?? agentId,
      agentVersion: nonEmpty(agent.agentVersion) ?? DEFAULT_AGENT_VERSION,
    };
  }

  /** The `processContent` request: one conversation message from the agent's application. */
  private body(activity: PurviewDlpActivity, data: string, truncated: boolean, identity: Identity, requestId: string): JsonObject {
    const timestamp = new Date(this.now()).toISOString();
    const agent: JsonObject = {
      '@odata.type': 'microsoft.graph.aiAgentInfo',
      identifier: identity.agentId,
      ...(identity.blueprintId ? { blueprintId: identity.blueprintId } : {}),
      name: identity.agentName,
      version: identity.agentVersion,
    };
    return {
      contentToProcess: {
        contentEntries: [
          {
            '@odata.type': 'microsoft.graph.processConversationMetadata',
            identifier: requestId,
            content: { '@odata.type': 'microsoft.graph.textContent', data },
            name: `${identity.agentName} ${activity}`,
            correlationId: identity.sessionId,
            sequenceNumber: identity.sequence,
            isTruncated: truncated,
            createdDateTime: timestamp,
            modifiedDateTime: timestamp,
            contentCategory: 'ai',
            agents: [agent],
          },
        ],
        activityMetadata: { activity },
        integratedAppMetadata: { name: identity.agentName, version: identity.agentVersion },
        protectedAppMetadata: {
          name: identity.agentName,
          version: identity.agentVersion,
          applicationLocation: {
            '@odata.type': 'microsoft.graph.policyLocationApplication',
            value: identity.applicationId,
          },
        },
      },
    };
  }

  /**
   * Purview saw only the beginning of the text. A block still stands, but an allow does not cover the
   * rest, so the content follows the fail mode instead, as if no verdict had been obtained: otherwise text
   * padded past the limit would be authorized unseen.
   */
  private static ofTruncatedContent(
    result: PurviewDlpEvaluationResult,
    error: string,
    configuration: ToolingConfiguration,
  ): PurviewDlpEvaluationResult {
    if (!result.evaluated || result.decision.blockAction) {
      return { ...result, truncated: true };
    }

    const failClosed = configuration.purviewDlpFailClosed;
    return {
      ...result,
      truncated: true,
      allowed: !failClosed,
      error,
      ...(failClosed ? { blockReason: TRUNCATED_FAIL_CLOSED_REASON } : {}),
    };
  }

  // ---- transport ---------------------------------------------------------------------------

  private async post(
    url: string,
    body: JsonObject,
    activity: PurviewDlpActivity,
    requestId: string,
    accessToken: string,
    started: number,
    configuration: ToolingConfiguration,
    signal: AbortSignal,
    callerSignal: AbortSignal | undefined,
  ): Promise<PurviewDlpEvaluationResult> {
    const fail = (error: string, httpStatus?: number): PurviewDlpEvaluationResult =>
      this.failure(activity, requestId, error, httpStatus, started, configuration);

    let status: number | undefined;
    try {
      let response: Response;
      try {
        response = await this.fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            [PurviewDlpClient.CLIENT_REQUEST_ID_HEADER]: requestId,
          },
          body: JSON.stringify(body),
          // A redirect must not carry the content and token elsewhere: it fails like any transport error.
          redirect: 'error',
          signal,
        });
      } catch (error) {
        if (callerSignal?.aborted) {
          throw callerSignal.reason;
        }

        return fail(signal.aborted ? 'request timeout' : `request failed: ${networkErrorCode(error)}`);
      }

      status = response.status;
      // No content: Purview processed the content and applies no inline restriction.
      if (status === 204) {
        discard(response);
        return this.evaluated(activity, requestId, { blockAction: false, actionCount: 0 }, undefined, status, started);
      }

      if (!response.ok) {
        // Only the status: the body can echo the request.
        discard(response);
        return fail(`http ${status}`, status);
      }

      let text: string;
      try {
        text = await response.text();
      } catch (_error) {
        if (callerSignal?.aborted) {
          throw callerSignal.reason;
        }

        return fail(signal.aborted ? 'request timeout' : 'response body could not be read', status);
      }

      // Accepted without a body: the content is processed without an inline decision (as for an offline
      // evaluation), so there is no restriction to apply. A 202 with a body is read like a 200, so a block in it
      // stands.
      if (status === 202 && !text.trim()) {
        return this.evaluated(activity, requestId, { blockAction: false, actionCount: 0 }, undefined, status, started);
      }

      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch (_error) {
        return fail('non-JSON response', status);
      }

      const verdict = readVerdict(payload);
      if ('error' in verdict) {
        return fail(verdict.error, status);
      }

      return this.evaluated(activity, requestId, verdict.decision, verdict.protectionScopeState, status, started);
    } catch (error) {
      if (callerSignal?.aborted) {
        throw callerSignal.reason;
      }

      // Anything else (for example an error type raised by a wrapping fetch) is not a verdict either.
      return fail(signal.aborted ? 'request timeout' : `request failed: ${describeError(error)}`, status);
    }
  }

  private fetch(url: string, init: RequestInit): Promise<Response> {
    return this.fetchImplementation ? this.fetchImplementation(url, init) : fetch(url, init);
  }

  private evaluated(
    activity: PurviewDlpActivity,
    requestId: string,
    decision: PurviewDlpDecision,
    protectionScopeState: string | undefined,
    httpStatus: number,
    started: number,
  ): PurviewDlpEvaluationResult {
    return {
      allowed: !decision.blockAction,
      evaluated: true,
      truncated: false,
      activity,
      correlationId: requestId,
      decision,
      ...(protectionScopeState ? { protectionScopeState } : {}),
      httpStatus,
      latencyMilliseconds: this.now() - started,
      ...(decision.blockAction ? { blockReason: BLOCK_REASONS[activity] } : {}),
    };
  }

  private failure(
    activity: PurviewDlpActivity,
    requestId: string,
    error: string,
    httpStatus: number | undefined,
    started: number,
    configuration: ToolingConfiguration,
  ): PurviewDlpEvaluationResult {
    return this.result(activity, requestId, error, httpStatus, this.now() - started, configuration);
  }

  private result(
    activity: PurviewDlpActivity,
    requestId: string,
    error: string,
    httpStatus: number | undefined,
    latencyMilliseconds: number,
    configuration: ToolingConfiguration,
  ): PurviewDlpEvaluationResult {
    const failClosed = configuration.purviewDlpFailClosed;
    return {
      allowed: !failClosed,
      evaluated: false,
      truncated: false,
      activity,
      correlationId: requestId,
      decision: { blockAction: false, actionCount: 0 },
      ...(httpStatus !== undefined ? { httpStatus } : {}),
      latencyMilliseconds,
      error,
      ...(failClosed ? { blockReason: FAIL_CLOSED_REASON } : {}),
    };
  }

  // ---- authentication ----------------------------------------------------------------------

  /**
   * The token for one evaluation. Tokens of the SDK's own resolvers (`fromAgenticUser`), which depend only
   * on the agent identity and scope, are cached until five minutes before they expire, and concurrent
   * evaluations share one acquisition. A host's resolver is asked every time, as its token may be for a
   * user the agent context does not identify.
   */
  private getAccessToken(
    agent: PurviewDlpAgentContext,
    tokenResolver: PurviewDlpTokenResolver,
    configuration: ToolingConfiguration,
    signal: AbortSignal,
  ): Promise<PurviewDlpAccessToken> {
    const scope = configuration.purviewDlpAuthenticationScope;
    const cacheKey = tokenCacheKeyOf(tokenResolver);
    if (!cacheKey) {
      return this.resolveToken(agent, tokenResolver, scope, signal).then((resolved) => resolved.token);
    }

    const key = cacheKey(agent, scope);
    const cached = this.tokens.get(key);
    const now = this.now();
    if (cached && now < cached.expiresAtMilliseconds - TOKEN_REFRESH_SKEW_MILLISECONDS) {
      return Promise.resolve(cached.token);
    }

    // One acquisition per key, bounded by the configured timeout and not tied to any single caller's
    // deadline or cancellation. It leaves the in-flight map when it completes, and only a successful one
    // is cached.
    let acquisition = this.inFlightTokens.get(key);
    if (!acquisition) {
      const started = this.acquireToken(key, agent, tokenResolver, scope, configuration.purviewDlpTimeoutMilliseconds);
      acquisition = started.finally(() => {
        if (this.inFlightTokens.get(key) === acquisition) {
          this.inFlightTokens.delete(key);
        }
      });
      acquisition.catch(() => undefined);
      this.inFlightTokens.set(key, acquisition);
    }

    // Within five minutes of expiry the cached token is still valid: evaluations use it while the refresh
    // runs, so a slow or failed early refresh neither delays nor fails them.
    if (cached && now < cached.expiresAtMilliseconds) {
      return Promise.resolve(cached.token);
    }

    return acquisition.then((resolved) => resolved.token);
  }

  private async acquireToken(
    key: string,
    agent: PurviewDlpAgentContext,
    tokenResolver: PurviewDlpTokenResolver,
    scope: string,
    timeoutMilliseconds: number,
  ): Promise<ResolvedToken> {
    const resolved = await this.resolveToken(agent, tokenResolver, scope, AbortSignal.timeout(timeoutMilliseconds));
    const expiresAtMilliseconds = resolved.expiresAtMilliseconds;
    if (expiresAtMilliseconds !== undefined) {
      const now = this.now();
      if (this.tokens.size >= MAX_CACHED_TOKENS) {
        for (const [cachedKey, cached] of this.tokens) {
          if (cached.expiresAtMilliseconds <= now) {
            this.tokens.delete(cachedKey);
          }
        }

        if (this.tokens.size >= MAX_CACHED_TOKENS) {
          const [oldest] = [...this.tokens].sort((a, b) => a[1].expiresAtMilliseconds - b[1].expiresAtMilliseconds);
          this.tokens.delete(oldest[0]);
        }
      }

      this.tokens.set(key, { token: resolved.token, expiresAtMilliseconds });
    }

    return resolved;
  }

  /** Asks the resolver for a token, within `signal`, and checks what it returns. */
  private async resolveToken(
    agent: PurviewDlpAgentContext,
    tokenResolver: PurviewDlpTokenResolver,
    scope: string,
    signal: AbortSignal,
  ): Promise<ResolvedToken> {
    const pending = Promise.resolve().then(() => tokenResolver(agent, [scope], signal));
    const value: unknown = await untilAborted(pending, signal);
    const accessToken = isObject(value) ? value['accessToken'] : undefined;
    if (typeof accessToken !== 'string' || !accessToken.trim()) {
      throw sdkError(new Error('The Purview token resolver returned no token.'));
    }

    const userId = isObject(value) ? value['userId'] : undefined;
    if (userId !== undefined && userId !== null && (typeof userId !== 'string' || !userId.trim())) {
      throw sdkError(new Error('The Purview token resolver returned a userId that is not a non-empty string.'));
    }

    const expiresAtMilliseconds = readExpiry(accessToken);
    if (expiresAtMilliseconds !== undefined && expiresAtMilliseconds <= this.now()) {
      throw sdkError(new Error('The Purview token resolver returned an expired token.'));
    }

    return {
      token: { accessToken, ...(typeof userId === 'string' ? { userId: userId.trim() } : {}) },
      ...(expiresAtMilliseconds !== undefined ? { expiresAtMilliseconds } : {}),
    };
  }

  // ---- helpers -----------------------------------------------------------------------------

  /**
   * The next sequence of a session whose agent context has none. The last 1000 sessions are tracked; a
   * session seen again after it was dropped resumes above every sequence given to a dropped session, so its
   * sequence keeps increasing.
   */
  private nextSequence(sessionId: string): number {
    const next = (this.sequences.get(sessionId) ?? this.evictedSequence) + 1;
    this.sequences.delete(sessionId);
    this.sequences.set(sessionId, next);
    while (this.sequences.size > MAX_TRACKED_SESSIONS) {
      const [oldest, sequence] = this.sequences.entries().next().value as [string, number];
      this.sequences.delete(oldest);
      this.evictedSequence = Math.max(this.evictedSequence, sequence);
    }

    return next;
  }

  private static validate(configuration: ToolingConfiguration): void {
    if (!configuration.isPurviewDlpEnabled) {
      return;
    }

    PurviewDlpClient.graphBaseUrl(configuration);
    void configuration.purviewDlpFailClosed;
    void configuration.purviewDlpTimeoutMilliseconds;
    void configuration.purviewDlpMaxContentCharacters;
    void configuration.purviewDlpResponseMode;
  }

  /**
   * The configured Graph base URL, built from its parsed origin and path, so the token is never sent in
   * plaintext or anywhere the URL did not name.
   */
  private static graphBaseUrl(configuration: ToolingConfiguration): string {
    const url = parseHttpsUrl(configuration.purviewDlpGraphBaseUrl);
    if (!url || url.username || url.password || url.search || url.hash) {
      throw sdkError(new Error('A365_PURVIEW_DLP_GRAPH_BASE_URL must be an absolute https URL without credentials, query or fragment.'));
    }

    return trimTrailingSlashes(`${url.origin}${url.pathname}`);
  }

  private static requireArguments(agent: PurviewDlpAgentContext, tokenResolver: PurviewDlpTokenResolver): void {
    if (!isObject(agent)) {
      throw sdkError(new TypeError('agent is required.'));
    }

    if (typeof tokenResolver !== 'function') {
      throw sdkError(new TypeError('tokenResolver is required.'));
    }
  }
}

// ---- module helpers ----------------------------------------------------------------------------

/**
 * Reads Purview's decision from a `processContent` response, checking the shape of every node it reads. A
 * policy action blocks when its `restrictionAction` is `block` or its `action` is `blockAccess` (any case), as in
 * Microsoft's own Purview integrations; a block stands even beside processing errors or malformed actions.
 * Otherwise processing errors (Graph reports a permanent bad request inline, with HTTP 200), or a response
 * without a well-formed list of policy actions, mean no verdict was obtained.
 */
function readVerdict(payload: unknown): { decision: PurviewDlpDecision; protectionScopeState?: string } | { error: string } {
  if (!isObject(payload)) {
    return { error: 'response was not a JSON object' };
  }

  const actions = payload['policyActions'];
  let blocks = false;
  let blocking: string | undefined;
  let first: string | undefined;
  let malformed = !Array.isArray(actions);
  for (const action of Array.isArray(actions) ? actions : []) {
    if (!isObject(action)) {
      malformed = true;
      continue;
    }

    const restriction = optionalString(action['restrictionAction']);
    const kind = optionalString(action['action']);
    if (restriction === null || kind === null) {
      malformed = true;
    }

    if (restriction) {
      first ??= restriction;
    }

    if (restriction?.toLowerCase() === BLOCK || kind?.toLowerCase() === BLOCK_ACCESS) {
      blocks = true;
      blocking ??= restriction || undefined;
    }
  }

  const state = payload['protectionScopeState'];
  const protectionScopeState = typeof state === 'string' && state ? state : undefined;
  const restrictionAction = blocks ? blocking : first;
  const decision: PurviewDlpDecision = {
    blockAction: blocks,
    ...(restrictionAction ? { restrictionAction } : {}),
    actionCount: Array.isArray(actions) ? actions.length : 0,
  };
  if (decision.blockAction) {
    return { decision, ...(protectionScopeState ? { protectionScopeState } : {}) };
  }

  const errors = payload['processingErrors'];
  if (errors !== undefined && errors !== null && !Array.isArray(errors)) {
    return { error: 'response had processingErrors that are not a list' };
  }

  if (Array.isArray(errors) && errors.length > 0) {
    return { error: `processing errors: ${errors.length}` };
  }

  if (malformed) {
    return { error: Array.isArray(actions) ? 'response had a policy action of another shape' : 'response had no list of policy actions' };
  }

  return { decision, ...(protectionScopeState ? { protectionScopeState } : {}) };
}

/** A string member, undefined when it is absent, or null when it has another type. */
function optionalString(value: unknown): string | undefined | null {
  if (value === undefined || value === null) {
    return undefined;
  }

  return typeof value === 'string' ? value : null;
}

/** Releases a response body that is not read. */
function discard(response: Response): void {
  try {
    response.body?.cancel().catch(() => undefined);
  } catch (_error) {
    // The body is already released.
  }
}
