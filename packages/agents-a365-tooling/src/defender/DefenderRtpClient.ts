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

/** The copy sent to Defender carries at most this many times `maxContentCharacters` of content. */
const TOTAL_CONTENT_FACTOR = 4;

/** The most nested levels copied from a value; deeper levels are cut (JSON parsers limit depth). */
const MAX_COPY_DEPTH = 32;

/** The least a tool declaration costs: the declaration, its `name` key and a one-character name. */
const MIN_TOOL_DECLARATION_COST = 1 + 'name'.length + 1;

/** The most tool declarations searched, by name only, for the called tool's. */
const MAX_CALLED_TOOL_SCAN = 10_000;

/** Fields rebuilt or copied whole; any other top-level field shares what is left of the budget. */
const BUILT_FIELDS: ReadonlySet<string> = new Set([
  'spec', 'interception_point', 'timestamp', 'sequence', 'agent', 'session', 'target', 'tenant', 'actor',
  'request_id', 'model', 'trace', 'tools', 'extensions', 'messages',
]);

/** The fields that carry each point's content. */
const POINT_FIELDS: Readonly<Record<DefenderRtpInterceptionPoint, readonly string[]>> = {
  input: ['input'],
  output: ['output'],
  pre_tool_call: ['tool_call'],
  post_tool_call: ['tool_call', 'tool_result'],
};

/** A value that did not fit the budget (unlike `undefined`, which JSON leaves out). */
const DROPPED: unique symbol = Symbol('dropped');
type Dropped = typeof DROPPED;

/** Characters of content still available for a copy. */
interface Budget {
  remaining: number;
  /** The most characters of one string. */
  maxString: number;
  /** Set when something was cut or left out. */
  cut: boolean;
  /** Set when two keys of one object became the same once made well formed, and one was left out. */
  collided?: boolean;
}

const FAIL_CLOSED_REASON = 'Security validation is unavailable and this agent is configured to fail closed.';
const TRUNCATED_FAIL_CLOSED_REASON =
  'The content is too long to be fully validated by Microsoft Defender for AI, and this agent is configured to fail closed.';
const INCOMPLETE_FAIL_CLOSED_REASON =
  'The content could not be fully validated by Microsoft Defender for AI, and this agent is configured to fail closed.';
const COLLIDED_KEYS_ERROR =
  'content has object keys that are equal once made well formed; Defender evaluated an incomplete copy';
const UNSCANNED_TOOL_ERROR =
  `the called tool was not among the first ${MAX_CALLED_TOOL_SCAN} tool declarations; Defender evaluated without its declaration`;

/** Why the copy leaves out part of what Defender needs to decide. */
type Incomplete = 'truncated' | 'collided' | 'tool_truncated' | 'tool_unscanned';
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
 * Defender's request validation and size limits (normalized, well formed, with content strings
 * clamped) and keeping its session, sequence and tool call ids, and returns the verdict. Each call
 * carries a unique `x-ms-correlation-id` and the agent identity's app-only token for the Defender API.
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
  /** The highest sequence of a session no longer tracked: a session seen again resumes above it. */
  private evictedSequence = 0;

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
   * Content under decision (`input` or `output` content, tool call arguments, the tool result) longer
   * than `defenderRtpMaxContentCharacters` is sent truncated, so Defender sees only part of it. A
   * block still stands, but an allow does not cover the rest: the result is marked `truncated`, and
   * `allowed` follows the fail mode.
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
    const maxCharacters = configuration.defenderRtpMaxContentCharacters;
    const { hook, incomplete } = this.prepare(context, agent, maxCharacters);
    const sessionId = readString(asObject(hook['session'])?.['id']);
    const started = this.now();
    const deadline = createDeadline(configuration.defenderRtpTimeoutMilliseconds, signal);
    const complete = (result: DefenderRtpEvaluationResult): DefenderRtpEvaluationResult =>
      incomplete ? DefenderRtpClient.ofIncompleteContent(result, incomplete, maxCharacters, configuration) : result;
    try {
      let token: string;
      try {
        token = await untilAborted(this.getAccessToken(agent, tokenResolver, configuration), deadline.signal);
      } catch (error) {
        if (signal?.aborted) {
          throw signal.reason;
        }

        const detail = deadline.signal.aborted ? 'timeout' : describeError(error);
        return complete(
          this.failure(point, this.idFactory(), sessionId, `entra token unavailable: ${detail}`, undefined, started, configuration),
        );
      }

      return complete(await this.post(hook, endpoint, point, sessionId, token, started, configuration, deadline.signal, signal));
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
   * A copy of the context that meets Defender's request validation, built field by field (the host's
   * context is only read): `target` equals the point's field, `tool_call` and `tool_result` carry only
   * spec members, the timestamp is UTC, and loosely filled optional fields are repaired or dropped.
   * Every string is well formed (a lone surrogate becomes U+FFFD, which Defender's JSON parser
   * requires) and at most `maxCharacters` long, and the copy carries at most four times that much
   * content. The content under decision comes first, with up to half of it (it is sent twice, as
   * `target` too); then, at a tool call, the called tool's declaration (always present, its name
   * copied whole); then the tool call arguments at `post_tool_call`, the other tool declarations, the
   * newest messages, extensions and any other fields share what is left, in that order. Every copied
   * element counts at least one character, and lists and objects
   * are read only as far as the budget reaches, so a huge context is never scanned whole. `incomplete`
   * tells whether, and why, the copy leaves part of the content under decision out: it was cut, or two
   * of its keys became one once made well formed. Optional fields of an unexpected shape are left out,
   * never indexed.
   */
  private prepare(
    context: DefenderRtpHookContext,
    agent: DefenderRtpAgentContext,
    maxCharacters: number,
  ): { hook: JsonObject; incomplete?: Incomplete } {
    const source = context as Record<string, unknown>;
    const point = source['interception_point'] as DefenderRtpInterceptionPoint;

    // Identity and protocol fields carry no content and are not budgeted; Defender validates them, so
    // only their spec members of the right shape are copied.
    const agentNode = asRecord(source['agent']);
    const agentId = firstNonEmpty(stringOf(agent.agentObjectId), stringOf(agentNode?.['id']), stringOf(agent.agentId));
    const sessionNode = asRecord(source['session']);
    const sessionId = stringOf(sessionNode?.['id']);
    requireString(agentId, 'agent.id');
    requireString(sessionId, 'session.id');
    const session: JsonObject = { id: sessionId };
    const startedAt = utcInstant(sessionNode?.['started_at']);
    if (startedAt) {
      session['started_at'] = startedAt;
    }

    const turn = sessionNode?.['turn'];
    if (isNonNegativeInteger(turn)) {
      session['turn'] = turn;
    }

    const preparedAgent: JsonObject = {
      id: agentId,
      framework: sanitizeFramework(firstNonEmpty(stringOf(agentNode?.['framework']), agent.framework)),
    };
    const name = firstNonEmpty(stringOf(agentNode?.['name']), stringOf(agent.agentName));
    if (name) {
      preparedAgent['name'] = name;
    }

    const version = stringOf(agentNode?.['version']);
    if (version) {
      preparedAgent['version'] = version;
    }

    // Defender requires tenant.id to equal the token's tenant, and the token is always the agent's,
    // so a different tenant id could only be rejected. The host's tenant name describes that tenant,
    // so it is kept only when the ids match; no other tenant field is copied.
    const tenantId = wellFormed(agent.tenantId);
    const tenantNode = asRecord(source['tenant']);
    const hostTenantId = stringOf(tenantNode?.['id']);
    const tenantName = !hostTenantId || hostTenantId.toLowerCase() === tenantId.toLowerCase()
      ? stringOf(tenantNode?.['name'])
      : undefined;
    const hook: JsonObject = {
      spec: DefenderRtpClient.AGENT_HOOKS_SPEC,
      interception_point: point,
      timestamp: this.utcTimestamp(source['timestamp']),
      sequence: isNonNegativeInteger(source['sequence']) ? source['sequence'] : this.nextSequence(sessionId),
      agent: preparedAgent,
      session,
      tenant: tenantName ? { id: tenantId, name: tenantName } : { id: tenantId },
    };

    const actor = source['actor'] == null && agent.userId
      ? { id: agent.userId, kind: agent.actorKind ?? 'human' }
      : source['actor'];
    if (isObject(actor)) {
      const actorId = stringOf(actor['id']);
      const kind = stringOf(actor['kind']);
      hook['actor'] = {
        ...(actorId ? { id: actorId } : {}),
        ...(kind && ACTOR_KINDS.has(kind) ? { kind } : {}),
      };
    }

    // A request id that is not a string falls back like a missing one.
    const requestId = stringOf(source['request_id']) || stringOf(agent.requestId) || undefined;
    if (requestId !== undefined) {
      hook['request_id'] = requestId;
    }

    const model = source['model'] == null && agent.modelName ? { id: agent.modelName } : source['model'];
    const modelId = isObject(model) ? stringOf(model['id']) : undefined;
    if (modelId) {
      hook['model'] = { id: modelId };
    }

    const trace = asRecord(source['trace']);
    const traceId = stringOf(trace?.['trace_id']);
    const spanId = stringOf(trace?.['span_id']);
    if (traceId || spanId) {
      hook['trace'] = { ...(traceId ? { trace_id: traceId } : {}), ...(spanId ? { span_id: spanId } : {}) };
    }

    // The content under decision first: it is sent twice (`target` mirrors it), so it may use half of
    // the budget, and twice what it leaves goes to the rest of the context.
    const decision: Budget = { remaining: (TOTAL_CONTENT_FACTOR / 2) * maxCharacters, maxString: maxCharacters, cut: false };
    const toolCall = asRecord(source['tool_call']);
    let toolName: string | undefined;
    switch (point) {
    case 'input': {
      const input = asRecord(source['input']);
      const role = stringOf(input?.['role']);
      hook['input'] = {
        content: fitContent(input?.['content'], decision) ?? '',
        role: role === 'system' || role === 'external' ? role : 'user',
      };
      break;
    }

    case 'output':
      hook['output'] = { content: fitContent(asRecord(source['output'])?.['content'], decision) ?? '' };
      break;

    default: {
      const callName = stringOf(toolCall?.['name']);
      requireString(callName, 'tool_call.name');
      toolName = callName;
      const id = firstNonEmpty(stringOf(toolCall?.['id'])) ?? this.generatedToolCallId();
      if (point === 'pre_tool_call') {
        hook['tool_call'] = { id, name: callName, args: toArguments(fitContent(toolCall?.['args'], decision)) };
      } else {
        const toolResult = asRecord(source['tool_result']);
        hook['tool_call'] = { id, name: callName, args: {} };
        hook['tool_result'] = {
          value: fitContent(toolResult?.['value'], decision) ?? null,
          is_error: toolResult?.['is_error'] === true,
        };
      }
    }
    }

    const rest: Budget = { remaining: 2 * decision.remaining, maxString: maxCharacters, cut: false };
    // At a tool call, Defender decides with the called tool's declaration, so it is charged next.
    const toolList: unknown[] = Array.isArray(source['tools']) ? source['tools'] : [];
    const calledTool = toolName === undefined ? undefined : fitCalledTool(toolList, toolName, source['extensions'], rest);
    if (point === 'post_tool_call') {
      (hook['tool_call'] as JsonObject)['args'] = toArguments(fitContent(toolCall?.['args'], rest));
    }

    const declarations = [
      ...(calledTool ? [calledTool.declaration] : []),
      ...fitOtherTools(toolList, calledTool?.index ?? -1, rest),
    ];
    if (declarations.length > 0) {
      hook['tools'] = declarations;
    }

    const messages = fitMessages(source['messages'], rest);
    if (messages) {
      hook['messages'] = messages;
    }

    const extensions = fitExtensions(source['extensions'], rest);
    if (extensions) {
      hook['extensions'] = extensions;
    }

    // Other fields are copied as they are, without replacing a field built above, reading no more of
    // them than the budget could hold.
    const built = new Set([...BUILT_FIELDS, ...POINT_FIELDS[point]]);
    const names = new Set([...built, ...Object.keys(hook)]);
    let unread = rest.remaining;
    for (const key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key) || built.has(key)) {
        continue;
      }

      if (unread-- <= 0) {
        break;
      }

      if (key.length > maxCharacters) {
        continue;
      }

      const entry = fitEntry(key, source[key], rest, 0, [], names);
      if (entry === DROPPED) {
        break;
      }

      if (entry) {
        Object.defineProperty(hook, entry[0], { value: entry[1], enumerable: true, writable: true, configurable: true });
      }
    }

    hook['target'] = targetOf(hook);
    const incomplete = decision.cut ? 'truncated' : decision.collided ? 'collided' : calledTool?.incomplete;
    return incomplete ? { hook, incomplete } : { hook };
  }

  /**
   * Defender saw only part of what it decides on: the content under decision was cut or two of its
   * keys became one, or the called tool's declaration was cut or not searched for to the end. A block
   * still stands, but an allow does not cover the rest, so the action follows the fail mode instead,
   * as if no verdict had been obtained: otherwise content padded past the limit would be authorized
   * unseen.
   */
  private static ofIncompleteContent(
    result: DefenderRtpEvaluationResult,
    incomplete: Incomplete,
    maxCharacters: number,
    configuration: ToolingConfiguration,
  ): DefenderRtpEvaluationResult {
    if (!result.evaluated || !result.allowed) {
      return { ...result, truncated: true };
    }

    const failClosed = configuration.defenderRtpFailClosed;
    const tooLong = incomplete === 'truncated' || incomplete === 'tool_truncated';
    const errors: Record<Incomplete, string> = {
      truncated: `content exceeded A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS (${maxCharacters}); Defender evaluated a truncated copy`,
      collided: COLLIDED_KEYS_ERROR,
      tool_truncated: `the called tool's declaration exceeded A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS (${maxCharacters}); `
        + 'Defender evaluated a truncated copy',
      tool_unscanned: UNSCANNED_TOOL_ERROR,
    };
    return {
      ...result,
      truncated: true,
      allowed: !failClosed,
      error: errors[incomplete],
      ...(failClosed ? { blockReason: tooLong ? TRUNCATED_FAIL_CLOSED_REASON : INCOMPLETE_FAIL_CLOSED_REASON } : {}),
    };
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
          // A redirect must not carry the context and token elsewhere: it fails like any transport error.
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

  /**
   * The next sequence of a session whose context has none. The last 1000 sessions are tracked; a
   * session seen again after it was dropped resumes above every sequence given to a dropped session,
   * so its sequence keeps increasing.
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

  private generatedToolCallId(): string {
    return `tooluse_${this.idFactory().replace(/-/g, '').slice(0, 12)}`;
  }

  /** Defender requires an RFC 3339 UTC instant; a timestamp without an offset is read as UTC. */
  private utcTimestamp(value: unknown): string {
    return utcInstant(value) ?? new Date(this.now()).toISOString();
  }

  private static validate(configuration: ToolingConfiguration): void {
    if (!configuration.isDefenderRtpEnabled) {
      return;
    }

    DefenderRtpClient.endpoint(configuration);
    void configuration.defenderRtpFailClosed;
    void configuration.defenderRtpTimeoutMilliseconds;
    void configuration.defenderRtpMaxContentCharacters;
  }

  /** The configured endpoint as an absolute https URL, so the token is never sent in plaintext. */
  private static endpoint(configuration: ToolingConfiguration): string {
    const url = parseHttpsUrl(configuration.defenderRtpEndpoint);
    if (!url) {
      throw new Error('A365_DEFENDER_RTP_ENDPOINT must be an absolute https URL.');
    }

    return url.href;
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
 * The called tool's declaration, which Defender decides a tool call with. It is searched for by name
 * only among the first 10000 entries of `tools`; otherwise it is declared by name with the host's
 * `extensions.a365.tool.description`. Its name is copied whole, without cost, and its description and
 * schema within the budget. `incomplete` tells whether Defender misses part of it: its description or
 * schema was cut (`tool_truncated`), or the list is longer than 10000 entries and the tool is not
 * among the first 10000 (`tool_unscanned`); a tool absent from a shorter list is neither.
 */
function fitCalledTool(
  list: unknown[],
  name: string,
  extensions: unknown,
  budget: Budget,
): { declaration: JsonObject; index: number; incomplete?: 'tool_truncated' | 'tool_unscanned' } {
  let index = -1;
  const searched = Math.min(list.length, MAX_CALLED_TOOL_SCAN);
  for (let entry = 0; entry < searched; entry += 1) {
    const tool = list[entry];
    if (isObject(tool) && stringOf(tool['name']) === name) {
      index = entry;
      break;
    }
  }

  // Whether this declaration is cut is tracked apart from the rest of the context.
  const wasCut = budget.cut;
  budget.cut = false;
  const declaration = describeTool(
    name,
    index >= 0 ? list[index] as Record<string, unknown> : calledToolFromExtensions(extensions),
    budget,
  );
  const cut = budget.cut;
  budget.cut = wasCut || cut;
  const incomplete = cut ? 'tool_truncated' : index < 0 && list.length > MAX_CALLED_TOOL_SCAN ? 'tool_unscanned' : undefined;
  return incomplete ? { declaration, index, incomplete } : { declaration, index };
}

/**
 * The other tool declarations (a name, a string description, an object schema) in host order, skipping
 * the called tool's entry, within the budget: only as many entries are read as it can hold, so a huge
 * list is never scanned whole.
 */
function fitOtherTools(list: unknown[], calledIndex: number, budget: Budget): JsonObject[] {
  const declarations: JsonObject[] = [];
  const readable = Math.min(list.length, Math.floor(budget.remaining / MIN_TOOL_DECLARATION_COST));
  for (let index = 0; index < readable && budget.remaining > 0; index += 1) {
    const tool = list[index];
    const name = isObject(tool) ? stringOf(tool['name']) : undefined;
    if (index === calledIndex || !isObject(tool) || !name) {
      continue;
    }

    // The declaration, its `name` key and the name.
    const cost = 1 + 'name'.length + name.length;
    if (budget.remaining < cost) {
      break;
    }

    budget.remaining -= cost;
    declarations.push(describeTool(name, tool, budget));
  }

  return declarations;
}

/** A declaration of `name` with the tool's string description and object schema, as far as they fit. */
function describeTool(name: string, tool: Record<string, unknown>, budget: Budget): JsonObject {
  const declaration: JsonObject = { name };
  if (typeof tool['description'] === 'string') {
    const description = fitEntry('description', tool['description'], budget);
    if (Array.isArray(description)) {
      declaration['description'] = description[1];
    }
  }

  if (isObject(tool['schema'])) {
    const schema = fitEntry('schema', tool['schema'], budget);
    if (Array.isArray(schema) && isObject(schema[1])) {
      declaration['schema'] = schema[1] as JsonObject;
    }
  }

  return declaration;
}

/** The called tool's declaration from the host's `extensions.a365.tool`: its description, if any. */
function calledToolFromExtensions(extensions: unknown): Record<string, unknown> {
  const a365 = isObject(extensions) ? extensions[A365_EXTENSION] : undefined;
  const tool = isObject(a365) ? a365['tool'] : undefined;
  return isObject(tool) && typeof tool['description'] === 'string' && tool['description']
    ? { description: tool['description'] }
    : {};
}

/**
 * The extension namespaces Defender accepts (`^[a-z][a-z0-9_]*$`), within the budget, reading no more
 * keys than it can hold. A namespace name longer than the string limit is left out, as cutting it would
 * break the pattern.
 */
function fitExtensions(extensions: unknown, budget: Budget): JsonObject | undefined {
  if (!isObject(extensions)) {
    return undefined;
  }

  const entries: Array<[string, Json]> = [];
  const seen = new Set<string>();
  let unread = budget.remaining;
  for (const key in extensions) {
    if (unread-- <= 0) {
      break;
    }

    if (!Object.prototype.hasOwnProperty.call(extensions, key)
      || key.length > budget.maxString
      || !EXTENSION_KEY_PATTERN.test(key)) {
      continue;
    }

    const entry = fitEntry(key, extensions[key], budget, 0, [], seen);
    if (entry === DROPPED) {
      break;
    }

    if (entry) {
      entries.push(entry);
    }
  }

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * The newest messages, within the budget. Only as many as it can hold are read, newest first, and the
 * history stops before a message without a role or content, which Defender would reject.
 */
function fitMessages(messages: unknown, budget: Budget): JsonObject[] | undefined {
  if (!Array.isArray(messages)) {
    return undefined;
  }

  const kept: JsonObject[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message: unknown = messages[index];
    const role = isObject(message) ? stringOf(message['role']) : undefined;
    if (!isObject(message) || !role || !('content' in message)) {
      break;
    }

    // The message, its `role` and `content` keys and the role.
    const cost = 1 + 'role'.length + 'content'.length + role.length;
    if (budget.remaining < cost) {
      break;
    }

    budget.remaining -= cost;
    const fitted = fitJson(message['content'], budget);
    if (fitted === DROPPED) {
      budget.remaining += cost;
      break;
    }

    const entries: Array<[string, Json]> = [['role', role], ['content', fitted ?? '']];
    const seen = new Set(['role', 'content']);
    let unread = budget.remaining;
    for (const key in message) {
      if (unread-- <= 0) {
        break;
      }

      if (!Object.prototype.hasOwnProperty.call(message, key) || key === 'role' || key === 'content') {
        continue;
      }

      const entry = fitEntry(key, message[key], budget, 0, [], seen);
      if (entry === DROPPED) {
        break;
      }

      if (entry) {
        entries.push(entry);
      }
    }

    kept.push(Object.fromEntries(entries));
  }

  return kept.length > 0 ? kept.reverse() : undefined;
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

/** The content under decision, within its budget; when it does not fit at all, it is cut entirely. */
function fitContent(value: unknown, budget: Budget): Json | undefined {
  const fitted = fitJson(value, budget);
  if (fitted === DROPPED) {
    budget.cut = true;
    return undefined;
  }

  return fitted;
}

/**
 * A JSON copy of `value` within `budget`, made while reading it (the original is never serialized
 * whole). Strings and keys are well formed and at most `budget.maxString` long; each string, key and
 * other value costs its length (at least one character), and each array or object one more. What no
 * longer fits is cut or left out, and `budget.cut` is set. Big integers and non-finite numbers become
 * text, as JSON has no form for them. Returns `undefined` for what JSON leaves out (undefined,
 * functions, symbols) and `DROPPED` when nothing fits.
 *
 * @throws TypeError when `value` contains a circular reference.
 */
function fitJson(value: unknown, budget: Budget, depth = 0, ancestors: object[] = []): Json | undefined | Dropped {
  let node = value;
  if (typeof node === 'object' && node !== null && typeof (node as { toJSON?: unknown }).toJSON === 'function') {
    node = (node as { toJSON: () => unknown }).toJSON();
  }

  switch (typeof node) {
  case 'string':
    return fitString(node, budget);
  case 'bigint':
    return fitString(node.toString(), budget);
  case 'number':
    return Number.isFinite(node) ? spend(budget, String(node).length, node) : fitString(String(node), budget);
  case 'boolean':
    return spend(budget, node ? 4 : 5, node);
  case 'object':
    break;
  default:
    return undefined;
  }

  if (node === null) {
    return spend(budget, 4, null);
  }

  if (ancestors.includes(node)) {
    throw new TypeError('context must be JSON-serializable: it contains a circular reference.');
  }

  if (depth >= MAX_COPY_DEPTH || budget.remaining < 1) {
    budget.cut = true;
    return DROPPED;
  }

  budget.remaining -= 1;
  ancestors.push(node);
  try {
    if (Array.isArray(node)) {
      const items: Json[] = [];
      for (let index = 0; index < node.length; index += 1) {
        const fitted = fitJson(node[index], budget, depth + 1, ancestors);
        // JSON writes null for what it leaves out of an array.
        const item = fitted === undefined ? spend(budget, 4, null) : fitted;
        if (item === DROPPED) {
          budget.cut = true;
          break;
        }

        items.push(item);
      }

      return items;
    }

    const entries: Array<[string, Json]> = [];
    const seen = new Set<string>();
    // Keys that JSON leaves out cost nothing, so no more are read than the budget could hold.
    let unread = budget.remaining;
    for (const key in node) {
      if (unread-- <= 0) {
        budget.cut = true;
        break;
      }

      if (!Object.prototype.hasOwnProperty.call(node, key)) {
        continue;
      }

      const entry = fitEntry(key, (node as Record<string, unknown>)[key], budget, depth + 1, ancestors, seen);
      if (entry === DROPPED) {
        budget.cut = true;
        break;
      }

      if (entry) {
        entries.push(entry);
      }
    }

    return Object.fromEntries(entries);
  } finally {
    ancestors.pop();
  }
}

/**
 * A property within the budget: `undefined` when JSON leaves it out, `DROPPED` when it does not fit. A
 * key that `seen` already holds (two keys became one once made well formed) is left out, and the budget
 * records the collision, since the copy then misses one of the values.
 */
function fitEntry(
  key: string,
  value: unknown,
  budget: Budget,
  depth = 0,
  ancestors: object[] = [],
  seen?: Set<string>,
): [string, Json] | undefined | Dropped {
  const name = fitString(key, budget);
  if (name === DROPPED) {
    return DROPPED;
  }

  if (seen?.has(name)) {
    budget.remaining += Math.max(1, name.length);
    budget.collided = true;
    return undefined;
  }

  const fitted = fitJson(value, budget, depth, ancestors);
  if (fitted === DROPPED) {
    budget.remaining += Math.max(1, name.length);
    return DROPPED;
  }

  if (fitted === undefined) {
    budget.remaining += Math.max(1, name.length);
    return undefined;
  }

  seen?.add(name);
  return [name, fitted];
}

/**
 * `value`, cut to what the budget allows, and well formed (a lone surrogate becomes U+FFFD); its length
 * (at least one character) is spent. `DROPPED` when nothing fits.
 */
function fitString(value: string, budget: Budget): string | Dropped {
  if (value.length <= budget.maxString && Math.max(1, value.length) <= budget.remaining) {
    budget.remaining -= Math.max(1, value.length);
    return wellFormed(value);
  }

  budget.cut = true;
  const room = Math.min(budget.maxString, budget.remaining);
  if (room < 1) {
    return DROPPED;
  }

  const kept = truncate(value, room);
  budget.remaining -= Math.max(1, kept.length);
  return wellFormed(kept);
}

/** `value` when `cost` characters fit the budget (they are spent), `DROPPED` otherwise. */
function spend<T extends Json>(budget: Budget, cost: number, value: T): T | Dropped {
  if (cost > budget.remaining) {
    return DROPPED;
  }

  budget.remaining -= cost;
  return value;
}

/**
 * `value` with every lone surrogate replaced by U+FFFD. `JSON.stringify` would write a lone surrogate
 * as a `\uD8xx` escape, which strict JSON parsers reject, failing the request.
 */
function wellFormed(value: string): string {
  const native = (value as unknown as { toWellFormed?: () => string }).toWellFormed;
  if (typeof native === 'function') {
    return native.call(value);
  }

  let result = '';
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0xd800 || code > 0xdfff) {
      continue;
    }

    const next = value.charCodeAt(index + 1);
    if (code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
      index += 1;
      continue;
    }

    result += `${value.slice(start, index)}\uFFFD`;
    start = index + 1;
  }

  return start === 0 ? value : result + value.slice(start);
}

function clone<T extends Json>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Cuts a string to at most `maxCharacters` characters, ending with a `...[truncated N chars]`
 * marker when the marker fits, and never splitting a surrogate pair.
 */
function truncate(value: string, maxCharacters: number): string {
  if (value.length <= maxCharacters) {
    return value;
  }

  // At most value.length characters are removed, so this is the longest the marker can be.
  const room = maxCharacters - truncationMarker(value.length).length;
  if (room <= 0) {
    return value.slice(0, surrogateSafeEnd(value, maxCharacters));
  }

  const end = surrogateSafeEnd(value, room);
  return `${value.slice(0, end)}${truncationMarker(value.length - end)}`;
}

function truncationMarker(removedCharacters: number): string {
  return `...[truncated ${removedCharacters} chars]`;
}

/** `end`, moved back by one when the character before it starts a surrogate pair. */
function surrogateSafeEnd(value: string, end: number): number {
  const code = value.charCodeAt(end - 1);
  return code >= 0xd800 && code <= 0xdbff ? end - 1 : end;
}

/** An RFC 3339 UTC instant, or undefined when `value` is not a date; a time without an offset is read as UTC. */
function utcInstant(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const parsed = Date.parse(TIMESTAMP_WITHOUT_OFFSET.test(value) ? `${value}Z` : value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

/** `value` parsed as an absolute https URL with a host (`https:host` reads as `https://host`), or undefined. */
function parseHttpsUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname ? url : undefined;
  } catch (_error) {
    return undefined;
  }
}

function singleLine(value: string, maxCharacters: number): string {
  const line = value.replace(/\s+/g, ' ').trim();
  return line.length > maxCharacters ? `${line.slice(0, maxCharacters)}...` : line;
}

function sanitizeFramework(framework: string | undefined): string {
  const value = trimCharacter((framework ?? '').trim().toLowerCase().replace(INVALID_FRAMEWORK_CHARACTERS, '-'), '-');
  return value || DEFAULT_FRAMEWORK;
}

/** Removes leading and trailing `character`s in linear time (a `-+$` pattern is polynomial). */
function trimCharacter(value: string, character: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === character) {
    start += 1;
  }

  while (end > start && value[end - 1] === character) {
    end -= 1;
  }

  return value.slice(start, end);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isObject(value) ? value : undefined;
}

function asObject(value: Json | undefined): JsonObject | undefined {
  return isObject(value) ? value as JsonObject : undefined;
}

function readString(value: Json | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** A string from the host, made well formed. */
function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' ? wellFormed(value) : undefined;
}

/** A non-empty string, or undefined. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isNonNegativeInteger(value: unknown): value is number {
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
