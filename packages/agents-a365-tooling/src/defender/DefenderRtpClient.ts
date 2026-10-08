// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import { IConfigurationProvider } from '@microsoft/agents-a365-runtime';
import { ToolingConfiguration, defaultToolingConfigurationProvider } from '../configuration';
import {
  DefenderRtpAgentContext,
  DefenderRtpEvaluationResult,
  DefenderRtpHookContext,
  DefenderRtpInterceptionPoint,
  DefenderRtpTokenResolver,
  DefenderRtpVerdict,
  DefenderRtpWarning,
} from './contracts';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

const DEFAULT_FRAMEWORK = 'agent365';
const A365_EXTENSION = 'a365';
const MAX_ERROR_DETAIL_CHARACTERS = 200;
const MAX_CACHED_TOKENS = 100;
const MAX_TRACKED_SESSIONS = 1000;
const TOKEN_REFRESH_SKEW_MILLISECONDS = 5 * 60 * 1000;
const EVALUATED_POINTS: ReadonlySet<string> = new Set(['input', 'pre_tool_call', 'post_tool_call', 'output']);
const ACTOR_KINDS: ReadonlySet<string> = new Set(['human', 'service', 'agent']);
const EXTENSION_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const INVALID_FRAMEWORK_CHARACTERS = /[^a-z0-9_-]+/g;
const TIMESTAMP_WITHOUT_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/**
 * Identifiers and protocol fields, never clamped: they carry no content, and Defender validates
 * them (`tenant.id` must match the token's tenant; `spec`, `timestamp`, `agent.framework` and the
 * roles have fixed formats). Dotted paths, with `[]` for array items.
 */
const UNCLAMPED_PATHS: ReadonlySet<string> = new Set([
  'spec',
  'interception_point',
  'timestamp',
  'request_id',
  'agent',
  'session',
  'tenant',
  'actor',
  'model',
  'trace',
  'input.role',
  'tool_call.id',
  'tool_call.name',
  'tools[].name',
]);
const FAIL_CLOSED_REASON = 'Security validation is unavailable and this agent is configured to fail closed.';
const TRANSFORM_REASON =
  'Microsoft Defender for AI asked to rewrite this content, which this SDK version does not apply yet.';
const DEFAULT_BLOCK_REASON = 'Blocked by Microsoft Defender for AI.';

/** Options for {@link DefenderRtpClient}. */
export interface DefenderRtpClientOptions {
  /** The configuration source; defaults to `defaultToolingConfigurationProvider` (environment variables). */
  configProvider?: IConfigurationProvider<ToolingConfiguration>;
  /** The fetch implementation; defaults to the global `fetch`. */
  fetchImplementation?: typeof fetch;
  /** Creates correlation ids (tests); defaults to `crypto.randomUUID`. */
  idFactory?: () => string;
  /** The clock in epoch milliseconds (tests); defaults to `Date.now`. */
  now?: () => number;
}

interface CachedToken {
  token: string;
  expiresAtMilliseconds: number;
}

/**
 * Client for the Microsoft Defender for AI prevention endpoint (`POST .../v1/protection/evaluate`).
 *
 * Defender evaluates four agent-hooks/0.1 interception points: `input` (the user's message, before
 * the agent runs), `pre_tool_call`, `post_tool_call`, and `output` (the reply, before it is sent).
 * {@link evaluateHookContext} sends a copy of a context emitted by an agent-hooks host, fitted to
 * Defender's request validation (normalized, with content strings clamped) and keeping its session,
 * sequence and tool call ids, and returns the verdict. Each call carries a unique
 * `x-ms-correlation-id` and the agent identity's app-only token for the Defender API.
 */
export class DefenderRtpClient {
  /** The only agent-hooks wire version the prevention endpoint accepts. */
  public static readonly AGENT_HOOKS_SPEC = 'agent-hooks/0.1';

  /** The header Defender logs each evaluation under. */
  public static readonly CORRELATION_ID_HEADER = 'x-ms-correlation-id';

  private readonly configProvider: IConfigurationProvider<ToolingConfiguration>;
  private readonly fetchImplementation?: typeof fetch;
  private readonly idFactory: () => string;
  private readonly now: () => number;
  private readonly tokens = new Map<string, CachedToken>();
  private readonly inFlightTokens = new Map<string, Promise<string>>();
  private readonly sequences = new Map<string, number>();

  /**
   * @param options The configuration source and test seams.
   * @throws When Defender RTP is enabled but the configuration cannot be used (for example no
   * endpoint is configured).
   */
  constructor(options: DefenderRtpClientOptions = {}) {
    this.configProvider = options.configProvider ?? defaultToolingConfigurationProvider;
    this.fetchImplementation = options.fetchImplementation;
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? Date.now;
    DefenderRtpClient.validate(this.configuration);
  }

  /** The configuration this client uses. */
  public get configuration(): ToolingConfiguration {
    return this.configProvider.getConfiguration();
  }

  /**
   * Whether Defender evaluates the given agent-hooks interception point.
   *
   * @param interceptionPoint The agent-hooks interception point, for example `pre_tool_call`.
   * @returns True for `input`, `pre_tool_call`, `post_tool_call` and `output`.
   */
  public static isEvaluatedInterceptionPoint(interceptionPoint: unknown): interceptionPoint is DefenderRtpInterceptionPoint {
    return typeof interceptionPoint === 'string' && EVALUATED_POINTS.has(interceptionPoint);
  }

  /**
   * Evaluates an agent-hooks context with Defender. The context is not modified: a copy is fitted to
   * Defender's request validation and sent. One deadline (the configured timeout) covers the token
   * acquisition and the request.
   *
   * @param context The agent-hooks/0.1 context emitted by the host.
   * @param agent The agent identity and turn; fills fields the context does not set.
   * @param tokenResolver Resolves the agent identity's Defender token.
   * @param signal Cancels the evaluation; the returned promise then rejects with its reason.
   * @returns The result, or null when Defender RTP is disabled or the point is not one Defender
   * evaluates. When no verdict is obtained (token, transport, timeout or HTTP failure) the result
   * is not evaluated and follows the configured fail mode.
   * @throws When the context or agent identity is invalid (for example no `session.id`), or the
   * endpoint is not an absolute https URL.
   */
  public async evaluateHookContext(
    context: DefenderRtpHookContext,
    agent: DefenderRtpAgentContext,
    tokenResolver: DefenderRtpTokenResolver,
    signal?: AbortSignal,
  ): Promise<DefenderRtpEvaluationResult | null> {
    const configuration = this.configuration;
    if (!configuration.isDefenderRtpEnabled) {
      return null;
    }

    if (!isObject(context)) {
      throw new TypeError('context is required.');
    }

    DefenderRtpClient.requireArguments(agent, tokenResolver);
    const point = context['interception_point'];
    if (!DefenderRtpClient.isEvaluatedInterceptionPoint(point)) {
      return null;
    }

    DefenderRtpClient.requireIdentity(agent);
    const endpoint = DefenderRtpClient.endpoint(configuration);
    signal?.throwIfAborted();
    const hook = this.prepare(context, agent, configuration);
    const sessionId = readString(asObject(hook['session'])?.['id']);
    const started = this.now();
    const deadline = createDeadline(configuration.defenderRtpTimeoutMilliseconds, signal);
    try {
      let token: string;
      try {
        token = await untilAborted(this.getAccessToken(agent, tokenResolver, configuration), deadline.signal);
      } catch (error) {
        if (signal?.aborted) {
          throw signal.reason;
        }

        const detail = deadline.signal.aborted ? 'timeout' : describeError(error);
        return this.failure(point, this.idFactory(), sessionId, `entra token unavailable: ${detail}`, undefined, started, configuration);
      }

      return await this.post(hook, endpoint, point, sessionId, token, started, configuration, deadline.signal, signal);
    } finally {
      deadline.dispose();
    }
  }

  /**
   * Acquires and caches the agent identity's Defender token without evaluating anything, so the
   * first evaluation does not wait for Entra. A cached token is reused until five minutes before it
   * expires; within those five minutes prefetch waits for the refresh, while evaluations keep using
   * the cached token. Call it at startup and periodically.
   *
   * @param agent The agent identity and tenant.
   * @param tokenResolver Resolves the agent identity's Defender token.
   * @param signal Cancels the wait.
   * @throws When no token can be acquired.
   */
  public async prefetchAccessToken(
    agent: DefenderRtpAgentContext,
    tokenResolver: DefenderRtpTokenResolver,
    signal?: AbortSignal,
  ): Promise<void> {
    const configuration = this.configuration;
    if (!configuration.isDefenderRtpEnabled) {
      return;
    }

    DefenderRtpClient.requireArguments(agent, tokenResolver);
    DefenderRtpClient.requireIdentity(agent);
    const acquisition = this.getAccessToken(agent, tokenResolver, configuration, true);
    await (signal ? untilAborted(acquisition, signal) : acquisition);
  }

  /**
   * A result for an evaluation that could not be made (for example an invalid context): it follows
   * the configured fail mode, like a transport failure.
   *
   * @param interceptionPoint The agent-hooks interception point.
   * @param error Why no verdict was obtained.
   * @param sessionId The agent-hooks session id, when known.
   * @param httpStatus The HTTP status, when a response was received.
   * @param latencyMilliseconds Time spent before the failure.
   * @returns The not-evaluated result.
   */
  public unavailable(
    interceptionPoint: string,
    error: string,
    sessionId?: string,
    httpStatus?: number,
    latencyMilliseconds = 0,
  ): DefenderRtpEvaluationResult {
    return this.result(interceptionPoint, this.idFactory(), sessionId, error, httpStatus, latencyMilliseconds, this.configuration);
  }

  // ---- agent-hooks context ---------------------------------------------------------------

  /**
   * A copy of the context that meets Defender's request validation: `target` equals the point's
   * field, `tool_call` and `tool_result` carry only spec members, every content string is clamped,
   * the timestamp is UTC, and loosely filled optional fields are repaired or dropped.
   */
  private prepare(
    context: DefenderRtpHookContext,
    agent: DefenderRtpAgentContext,
    configuration: ToolingConfiguration,
  ): JsonObject {
    const hook = toJsonObject(context);
    hook['spec'] = DefenderRtpClient.AGENT_HOOKS_SPEC;
    hook['timestamp'] = this.utcTimestamp(hook['timestamp']);

    const agentNode = asObject(hook['agent']);
    const agentId = firstNonEmpty(agent.agentObjectId, readString(agentNode?.['id']), agent.agentId);
    const sessionId = readString(asObject(hook['session'])?.['id']);
    requireString(agentId, 'agent.id');
    requireString(sessionId, 'session.id');
    if (!isNonNegativeInteger(hook['sequence'])) {
      hook['sequence'] = this.nextSequence(sessionId);
    }

    const preparedAgent: JsonObject = {
      id: agentId,
      framework: sanitizeFramework(firstNonEmpty(readString(agentNode?.['framework']), agent.framework)),
    };
    const name = firstNonEmpty(readString(agentNode?.['name']), agent.agentName);
    if (name) {
      preparedAgent['name'] = name;
    }

    const version = readString(agentNode?.['version']);
    if (version) {
      preparedAgent['version'] = version;
    }

    hook['agent'] = preparedAgent;

    if (!readString(asObject(hook['tenant'])?.['id'])) {
      hook['tenant'] = { ...asObject(hook['tenant']), id: agent.tenantId };
    }

    if (hook['actor'] == null && agent.userId) {
      hook['actor'] = { id: agent.userId, kind: agent.actorKind ?? 'human' };
    }

    if (hook['request_id'] == null && agent.requestId) {
      hook['request_id'] = agent.requestId;
    }

    if (hook['model'] == null && agent.modelName) {
      hook['model'] = { id: agent.modelName };
    }

    dropInvalidOptionalFields(hook);

    switch (hook['interception_point']) {
    case 'input': {
      const input = asObject(hook['input']);
      const role = readString(input?.['role']);
      hook['input'] = {
        content: input?.['content'] ?? '',
        role: role === 'system' || role === 'external' ? role : 'user',
      };
      break;
    }

    case 'output':
      hook['output'] = { content: asObject(hook['output'])?.['content'] ?? '' };
      break;

    case 'pre_tool_call':
    case 'post_tool_call': {
      const toolCall = asObject(hook['tool_call']);
      const toolName = readString(toolCall?.['name']);
      requireString(toolName, 'tool_call.name');
      hook['tool_call'] = {
        id: firstNonEmpty(readString(toolCall?.['id'])) ?? this.generatedToolCallId(),
        name: toolName,
        args: toArguments(toolCall?.['args']),
      };

      if (hook['interception_point'] === 'post_tool_call') {
        const toolResult = asObject(hook['tool_result']);
        hook['tool_result'] = { value: toolResult?.['value'] ?? null, is_error: toolResult?.['is_error'] === true };
      }

      const tools = hook['tools'];
      if (!Array.isArray(tools) || tools.length === 0) {
        hook['tools'] = [toolFromExtensions(hook, toolName)];
      }

      break;
    }
    }

    // Clamp once, then derive the target from the clamped field so the two stay equal.
    const prepared = clampStrings(hook, configuration.defenderRtpMaxContentCharacters) as JsonObject;
    prepared['target'] = targetOf(prepared);
    return prepared;
  }

  // ---- transport ---------------------------------------------------------------------------

  private async post(
    hook: JsonObject,
    endpoint: string,
    point: string,
    sessionId: string | undefined,
    accessToken: string,
    started: number,
    configuration: ToolingConfiguration,
    signal: AbortSignal,
    callerSignal: AbortSignal | undefined,
  ): Promise<DefenderRtpEvaluationResult> {
    const correlationId = this.idFactory();
    const fail = (error: string, httpStatus?: number): DefenderRtpEvaluationResult =>
      this.failure(point, correlationId, sessionId, error, httpStatus, started, configuration);

    let status: number | undefined;
    try {
      let response: Response;
      try {
        response = await this.fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            [DefenderRtpClient.CORRELATION_ID_HEADER]: correlationId,
          },
          body: JSON.stringify(hook),
          signal,
        });
      } catch (error) {
        if (callerSignal?.aborted) {
          throw callerSignal.reason;
        }

        return fail(signal.aborted ? 'request timeout' : `request failed: ${networkErrorCode(error)}`);
      }

      status = response.status;
      let body: string;
      try {
        body = await response.text();
      } catch (_error) {
        if (callerSignal?.aborted) {
          throw callerSignal.reason;
        }

        return fail(signal.aborted ? 'request timeout' : 'response body could not be read', status);
      }

      if (!response.ok) {
        const detail = errorDetail(body);
        return fail(detail ? `http ${status}: ${detail}` : `http ${status}`, status);
      }

      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch (_error) {
        return fail('non-JSON response', status);
      }

      const verdict = parseVerdict(payload);
      if (!verdict) {
        return fail('response contained no verdict', status);
      }

      const allowed = verdict.decision === 'allow';
      return {
        allowed,
        evaluated: true,
        interceptionPoint: point,
        correlationId,
        ...(sessionId ? { sessionId } : {}),
        verdict,
        httpStatus: status,
        latencyMilliseconds: this.now() - started,
        // transform also blocks: the rewrite cannot be applied here, and releasing the original
        // content would defeat it.
        ...(allowed
          ? {}
          : { blockReason: verdict.decision === 'transform' ? TRANSFORM_REASON : verdict.message ?? DEFAULT_BLOCK_REASON }),
      };
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

  private failure(
    point: string,
    correlationId: string,
    sessionId: string | undefined,
    error: string,
    httpStatus: number | undefined,
    started: number,
    configuration: ToolingConfiguration,
  ): DefenderRtpEvaluationResult {
    return this.result(point, correlationId, sessionId, error, httpStatus, this.now() - started, configuration);
  }

  private result(
    point: string,
    correlationId: string,
    sessionId: string | undefined,
    error: string,
    httpStatus: number | undefined,
    latencyMilliseconds: number,
    configuration: ToolingConfiguration,
  ): DefenderRtpEvaluationResult {
    const failClosed = configuration.defenderRtpFailClosed;
    return {
      allowed: !failClosed,
      evaluated: false,
      interceptionPoint: point,
      correlationId,
      ...(sessionId ? { sessionId } : {}),
      ...(httpStatus !== undefined ? { httpStatus } : {}),
      error,
      latencyMilliseconds,
      ...(failClosed ? { blockReason: FAIL_CLOSED_REASON } : {}),
    };
  }

  // ---- authentication ----------------------------------------------------------------------

  private getAccessToken(
    agent: DefenderRtpAgentContext,
    tokenResolver: DefenderRtpTokenResolver,
    configuration: ToolingConfiguration,
    waitForRefresh = false,
  ): Promise<string> {
    const scope = configuration.defenderRtpAuthenticationScope;
    const key = [agent.tenantId, agent.agentId, scope].join(':');
    const cached = this.tokens.get(key);
    const now = this.now();
    if (cached && now < cached.expiresAtMilliseconds - TOKEN_REFRESH_SKEW_MILLISECONDS) {
      return Promise.resolve(cached.token);
    }

    // One acquisition per agent, tenant and scope, bounded by the configured timeout and not tied
    // to any single caller's deadline or cancellation. It leaves the in-flight map when it
    // completes, and only a successful one is cached.
    let acquisition = this.inFlightTokens.get(key);
    if (!acquisition) {
      const started = this.acquireToken(key, agent, tokenResolver, scope, configuration.defenderRtpTimeoutMilliseconds);
      acquisition = started.finally(() => {
        if (this.inFlightTokens.get(key) === acquisition) {
          this.inFlightTokens.delete(key);
        }
      });
      acquisition.catch(() => undefined);
      this.inFlightTokens.set(key, acquisition);
    }

    // Within five minutes of expiry the cached token is still valid: evaluations use it while the
    // refresh runs, so a slow or failed early refresh neither delays nor fails them.
    if (!waitForRefresh && cached && now < cached.expiresAtMilliseconds) {
      return Promise.resolve(cached.token);
    }

    return acquisition;
  }

  private async acquireToken(
    key: string,
    agent: DefenderRtpAgentContext,
    tokenResolver: DefenderRtpTokenResolver,
    scope: string,
    timeoutMilliseconds: number,
  ): Promise<string> {
    const timeout = AbortSignal.timeout(timeoutMilliseconds);
    const resolved = Promise.resolve().then(() => tokenResolver(agent.agentId, agent.tenantId, [scope], timeout));
    const token = await untilAborted(resolved, timeout);
    if (typeof token !== 'string' || !token.trim()) {
      throw new Error('The Defender token resolver returned no token.');
    }

    const expiresAtMilliseconds = readExpiry(token);
    if (expiresAtMilliseconds !== undefined) {
      const now = this.now();
      if (expiresAtMilliseconds <= now) {
        throw new Error('The Defender token resolver returned an expired token.');
      }

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

      this.tokens.set(key, { token, expiresAtMilliseconds });
    }

    return token;
  }

  // ---- helpers -----------------------------------------------------------------------------

  private nextSequence(sessionId: string): number {
    const next = (this.sequences.get(sessionId) ?? 0) + 1;
    this.sequences.delete(sessionId);
    this.sequences.set(sessionId, next);
    while (this.sequences.size > MAX_TRACKED_SESSIONS) {
      const oldest = this.sequences.keys().next().value as string;
      this.sequences.delete(oldest);
    }

    return next;
  }

  private generatedToolCallId(): string {
    return `tooluse_${this.idFactory().replace(/-/g, '').slice(0, 12)}`;
  }

  /** Defender requires an RFC 3339 UTC instant; a timestamp without an offset is read as UTC. */
  private utcTimestamp(value: Json | undefined): string {
    const text = readString(value);
    const parsed = text ? Date.parse(TIMESTAMP_WITHOUT_OFFSET.test(text) ? `${text}Z` : text) : Number.NaN;
    return new Date(Number.isNaN(parsed) ? this.now() : parsed).toISOString();
  }

  private static validate(configuration: ToolingConfiguration): void {
    if (!configuration.isDefenderRtpEnabled) {
      return;
    }

    DefenderRtpClient.endpoint(configuration);
    void configuration.defenderRtpTimeoutMilliseconds;
    void configuration.defenderRtpMaxContentCharacters;
  }

  /** The configured endpoint, which must be an absolute https URL so the token is never sent in plaintext. */
  private static endpoint(configuration: ToolingConfiguration): string {
    const endpoint = configuration.defenderRtpEndpoint;
    let protocol: string | undefined;
    try {
      protocol = new URL(endpoint).protocol;
    } catch (_error) {
      protocol = undefined;
    }

    if (protocol !== 'https:') {
      throw new Error('A365_DEFENDER_RTP_ENDPOINT must be an absolute https URL.');
    }

    return endpoint;
  }

  private static requireArguments(agent: DefenderRtpAgentContext, tokenResolver: DefenderRtpTokenResolver): void {
    if (!isObject(agent)) {
      throw new TypeError('agent is required.');
    }

    if (typeof tokenResolver !== 'function') {
      throw new TypeError('tokenResolver is required.');
    }
  }

  private static requireIdentity(agent: DefenderRtpAgentContext): void {
    requireString(agent.agentId, 'agent.agentId');
    requireString(agent.tenantId, 'agent.tenantId');
  }
}

// ---- module helpers ----------------------------------------------------------------------------

/**
 * Optional fields a host may fill loosely but Defender validates strictly (a 400 would leave the
 * call unverified): extension namespaces, `model.id`, tool declarations, messages, actor.
 */
function dropInvalidOptionalFields(hook: JsonObject): void {
  if ('extensions' in hook) {
    const extensions = asObject(hook['extensions']);
    const valid = extensions
      ? Object.fromEntries(Object.entries(extensions).filter(([key]) => EXTENSION_KEY_PATTERN.test(key)))
      : {};
    if (Object.keys(valid).length > 0) {
      hook['extensions'] = valid;
    } else {
      delete hook['extensions'];
    }
  }

  if ('model' in hook) {
    const modelId = readString(asObject(hook['model'])?.['id']);
    if (modelId) {
      hook['model'] = { id: modelId };
    } else {
      delete hook['model'];
    }
  }

  if ('tools' in hook) {
    const tools: JsonObject[] = [];
    for (const tool of Array.isArray(hook['tools']) ? hook['tools'] : []) {
      const declaration = asObject(tool);
      const toolName = readString(declaration?.['name']);
      if (!declaration || !toolName) {
        continue;
      }

      const description = declaration['description'];
      const schema = asObject(declaration['schema']);
      tools.push({
        name: toolName,
        ...(typeof description === 'string' ? { description } : {}),
        ...(schema ? { schema } : {}),
      });
    }

    if (tools.length > 0) {
      hook['tools'] = tools;
    } else {
      delete hook['tools'];
    }
  }

  if ('messages' in hook) {
    const messages = hook['messages'];
    const valid = Array.isArray(messages) && messages.every((message) => {
      const item = asObject(message);
      return !!item && !!readString(item['role']) && 'content' in item;
    });
    if (!valid) {
      delete hook['messages'];
    }
  }

  if ('actor' in hook) {
    const actor = asObject(hook['actor']);
    if (actor) {
      const actorId = readString(actor['id']);
      const kind = readString(actor['kind']);
      hook['actor'] = {
        ...(actorId ? { id: actorId } : {}),
        ...(kind && ACTOR_KINDS.has(kind) ? { kind } : {}),
      };
    } else {
      delete hook['actor'];
    }
  }
}

function toolFromExtensions(hook: JsonObject, toolName: string): JsonObject {
  const a365 = asObject(asObject(hook['extensions'])?.[A365_EXTENSION]);
  const description = readString(asObject(a365?.['tool'])?.['description']);
  return { name: toolName, ...(description ? { description } : {}) };
}

function toArguments(args: Json | undefined): JsonObject {
  const value = args ?? {};
  return asObject(value) ?? { input: value };
}

/** The point's field that `target` must equal. */
function targetOf(hook: JsonObject): Json {
  switch (hook['interception_point']) {
  case 'input':
    return clone(hook['input'] ?? null);
  case 'output':
    return clone(hook['output'] ?? null);
  case 'pre_tool_call':
    return clone(asObject(hook['tool_call'])?.['args'] ?? null);
  case 'post_tool_call':
    return clone(asObject(hook['tool_result'])?.['value'] ?? null);
  default:
    return hook['target'] ?? null;
  }
}

/** Reads an agent-hooks verdict; anything else is not a verdict. */
function parseVerdict(payload: unknown): DefenderRtpVerdict | undefined {
  if (!isObject(payload)) {
    return undefined;
  }

  const decision = payload['decision'];
  if (decision !== 'allow' && decision !== 'deny' && decision !== 'transform') {
    return undefined;
  }

  const reason = text(payload['reason']);
  const message = text(payload['message']);
  const transformPath = text(isObject(payload['transform']) ? payload['transform']['path'] : undefined);
  const warnings: DefenderRtpWarning[] = (Array.isArray(payload['warnings']) ? payload['warnings'] : [])
    .filter(isObject)
    .map((warning) => {
      const warningReason = text(warning['reason']);
      const warningMessage = text(warning['message']);
      return {
        ...(warningReason ? { reason: warningReason } : {}),
        ...(warningMessage ? { message: warningMessage } : {}),
      };
    });
  const resultLabels = (Array.isArray(payload['result_labels']) ? payload['result_labels'] : [])
    .map(text)
    .filter((label): label is string => label !== undefined);
  return {
    decision,
    ...(reason ? { reason } : {}),
    ...(message ? { message } : {}),
    warnings,
    resultLabels,
    ...(transformPath ? { transformPath } : {}),
  };
}

/**
 * A short single-line detail from a ProblemDetails or Defender error body. For a validation error
 * (400) it is the failed rules, which Defender reports in `diagnostics.validationErrors`.
 */
function errorDetail(body: string): string {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (_error) {
    return '';
  }

  if (!isObject(payload)) {
    return '';
  }

  const detail = validationErrors(payload['diagnostics'])
    ?? text(payload['detail'])
    ?? text(payload['message'])
    ?? text(payload['title'])
    ?? '';
  return singleLine(detail, MAX_ERROR_DETAIL_CHARACTERS);
}

function validationErrors(diagnostics: unknown): string | undefined {
  let parsed = diagnostics;
  if (typeof diagnostics === 'string') {
    try {
      parsed = JSON.parse(diagnostics);
    } catch (_error) {
      return undefined;
    }
  }

  const errors = isObject(parsed) && Array.isArray(parsed['validationErrors']) ? parsed['validationErrors'] : [];
  const messages = [...new Set(errors
    .map((error) => (isObject(error) ? text(error['message']) : undefined))
    .filter((message): message is string => message !== undefined))];
  return messages.length > 0 ? `validation: ${messages.join('; ')}` : undefined;
}

/** The `exp` of a JWT in epoch milliseconds, or undefined when the token is not a JWT with `exp`. */
function readExpiry(token: string): number | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return undefined;
  }

  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const exp = isObject(payload) ? payload['exp'] : undefined;
    return typeof exp === 'number' && Number.isFinite(exp) ? Math.floor(exp) * 1000 : undefined;
  } catch (_error) {
    return undefined;
  }
}

/** A deadline for one evaluation that also aborts when the caller's signal aborts. */
function createDeadline(timeoutMilliseconds: number, callerSignal?: AbortSignal): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('The Defender evaluation timed out.')), timeoutMilliseconds);
  const onCallerAbort = (): void => controller.abort(callerSignal?.reason);
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    },
  };
}

/** Settles like `promise`, or rejects with the signal's reason when it aborts first. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/** `Name: message` on one line, for an error a caller may log. */
function describeError(error: unknown): string {
  const description = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return singleLine(description, MAX_ERROR_DETAIL_CHARACTERS);
}

/** The system error code of a failed fetch (for example `ECONNREFUSED`), or the error's name. */
function networkErrorCode(error: unknown): string {
  const cause = error instanceof Error ? (error as Error & { cause?: unknown }).cause : undefined;
  const code = isObject(cause) && typeof cause['code'] === 'string' ? cause['code'] : undefined;
  return code ?? (error instanceof Error ? error.name : 'Error');
}

/**
 * A JSON copy of the context. Big integers become strings and non-finite numbers their names, as
 * neither has a JSON form.
 */
function toJsonObject(context: DefenderRtpHookContext): JsonObject {
  let serialized: string;
  try {
    serialized = JSON.stringify(context, (_key, item: unknown) => {
      if (typeof item === 'bigint') return item.toString();
      if (typeof item === 'number' && !Number.isFinite(item)) return String(item);
      return item;
    });
  } catch (error) {
    throw new TypeError(`context must be JSON-serializable: ${describeError(error)}`);
  }

  return JSON.parse(serialized) as JsonObject;
}

function clone<T extends Json>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Truncates every string value to `maxCharacters` (content, tool arguments and results, tool
 * descriptions and schemas, messages, extensions), except identifiers and protocol fields.
 */
function clampStrings(node: Json, maxCharacters: number, path = ''): Json {
  if (UNCLAMPED_PATHS.has(path)) {
    return node;
  }

  if (typeof node === 'string') {
    return truncate(node, maxCharacters);
  }

  if (Array.isArray(node)) {
    return node.map((item) => clampStrings(item, maxCharacters, `${path}[]`));
  }

  if (isObject(node)) {
    return Object.fromEntries(Object.entries(node).map(([key, value]) =>
      [key, clampStrings(value as Json, maxCharacters, path ? `${path}.${key}` : key)]));
  }

  return node;
}

function truncate(value: string, maxCharacters: number): string {
  if (value.length <= maxCharacters) {
    return value;
  }

  // Do not split a surrogate pair.
  const end = /[\uD800-\uDBFF]/.test(value.charAt(maxCharacters - 1)) ? maxCharacters - 1 : maxCharacters;
  return `${value.slice(0, end)}...[truncated ${value.length - end} chars]`;
}

function singleLine(value: string, maxCharacters: number): string {
  const line = value.replace(/\s+/g, ' ').trim();
  return line.length > maxCharacters ? `${line.slice(0, maxCharacters)}...` : line;
}

function sanitizeFramework(framework: string | undefined): string {
  const value = (framework ?? '').trim().toLowerCase().replace(INVALID_FRAMEWORK_CHARACTERS, '-').replace(/^-+|-+$/g, '');
  return value || DEFAULT_FRAMEWORK;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObject(value: Json | undefined): JsonObject | undefined {
  return isObject(value) ? value as JsonObject : undefined;
}

function readString(value: Json | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** A non-empty string, or undefined. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isNonNegativeInteger(value: Json | undefined): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0);
}

function requireString(value: string | undefined, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} is required.`);
  }
}
