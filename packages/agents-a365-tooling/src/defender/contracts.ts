// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * An agent-hooks/0.1 context (AGENT-HOOKS-0.1 §4) emitted by an agent-hooks host, for example an
 * `AgentContext` from `@responsibleai/agent-hooks`. The Defender client reads it as plain JSON and
 * never modifies it.
 */
export type DefenderRtpHookContext = Readonly<Record<string, unknown>>;

/** The agent-hooks interception points the Defender prevention endpoint evaluates. */
export type DefenderRtpInterceptionPoint = 'input' | 'pre_tool_call' | 'post_tool_call' | 'output';

/** Who triggered the run (agent-hooks `actor.kind`). */
export type DefenderRtpActorKind = 'human' | 'service' | 'agent';

/**
 * Identity of the agent and turn an evaluation is for. Fills context fields the host did not set.
 */
export interface DefenderRtpAgentContext {
  /** The agent identity (application) id the token is requested for. */
  agentId: string;
  /**
   * The agent's tenant id, used to acquire the token and always sent as `tenant.id`: Defender requires
   * it to equal the token's tenant.
   */
  tenantId: string;
  /**
   * The agent's Entra object id, sent as `agent.id`. Defaults to the context's `agent.id`, then
   * {@link agentId} (equal for Agent ID agent identities).
   */
  agentObjectId?: string;
  /** The agent's display name (`agent.name`) when the context has none. */
  agentName?: string;
  /** The agent framework (`agent.framework`, lowercase `[a-z0-9_-]`) when the context has none. */
  framework?: string;
  /** The turn's request id (`request_id`), for example the activity id. */
  requestId?: string;
  /** Who triggered the run (`actor.id`), for example the user's Entra object id. */
  userId?: string;
  /**
   * The kind of actor (`actor.kind`): `human` (default), `service` for autonomous runs, or `agent`
   * for agent-to-agent calls.
   */
  actorKind?: DefenderRtpActorKind;
  /** The model the agent uses (`model.id`) when the context has none. */
  modelName?: string;
}

/**
 * Resolves the access token for a Defender evaluation: the agent identity's own app-only token, in
 * the agent's tenant, for the Defender API, carrying the `RealtimeProtection.Evaluate.All` role.
 *
 * Use the same authority as Observability S2S export: the blueprint credential obtains the agent
 * identity's assertion (FMI), and the agent identity exchanges it for the requested scope, for
 * example with `DefenderRtpTokenResolvers.fromAgenticConnection`. The client caches the returned
 * token per agent, tenant and scope until five minutes before it expires.
 *
 * @param agentId The agent identity (application) id; the token's `appid`.
 * @param tenantId The agent's tenant; the token's `tid` must equal the context `tenant.id`.
 * @param scopes The scopes to request.
 * @param signal Aborts when the configured Defender timeout elapses.
 * @returns The access token. Returning nothing, or throwing, makes the evaluation follow the fail mode.
 */
export type DefenderRtpTokenResolver = (
  agentId: string,
  tenantId: string,
  scopes: string[],
  signal: AbortSignal,
) => Promise<string | null | undefined> | string | null | undefined;

/** A warning attached to a Defender verdict. */
export interface DefenderRtpWarning {
  /** Machine-readable reason, for example `prevention_annotated`. */
  reason?: string;
  /** Human-readable message. */
  message?: string;
}

/** The agent-hooks verdict returned by the Defender prevention endpoint. */
export interface DefenderRtpVerdict {
  /** `allow`, `deny`, or `transform`. */
  decision: 'allow' | 'deny' | 'transform';
  /** Defender's reason, for example `prevention_blocked`. */
  reason?: string;
  /** Defender's message for the block. */
  message?: string;
  /** Warnings, for example an annotation of content Defender allowed. */
  warnings: DefenderRtpWarning[];
  /** Threat labels, for example `PromptInjection`. */
  resultLabels: string[];
  /** For `transform`: the path of the content to rewrite. */
  transformPath?: string;
}

/**
 * The outcome of one Defender evaluation. `evaluated` is false when no verdict was obtained;
 * `allowed` then follows the configured fail mode (`A365_DEFENDER_RTP_FAIL_MODE`). It also follows
 * the fail mode when Defender allowed a `truncated` copy of the content.
 */
export interface DefenderRtpEvaluationResult {
  /** Whether the action may proceed. */
  allowed: boolean;
  /** Whether Defender returned a verdict. */
  evaluated: boolean;
  /**
   * True when Defender evaluated a copy that leaves part of the content under decision out: a string
   * longer than `A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS`, more content than its share of the copy,
   * or object keys that are equal once made well formed. A block of the copy stands; an allow does not
   * cover the rest, so `allowed` then follows the fail mode and `error` says why.
   */
  truncated?: boolean;
  /** The agent-hooks interception point that was evaluated. */
  interceptionPoint: string;
  /** The `x-ms-correlation-id` sent with the call; Defender logs the evaluation under it. */
  correlationId: string;
  /** The agent-hooks `session.id`, when known. */
  sessionId?: string;
  /** Defender's verdict, when one was returned. */
  verdict?: DefenderRtpVerdict;
  /** The HTTP status, when a response was received. */
  httpStatus?: number;
  /**
   * Why the action could not be verified: no verdict was obtained (for example `http 403: ...`), or
   * Defender allowed only a truncated copy of the content.
   */
  error?: string;
  /** Time spent on the evaluation, in milliseconds. */
  latencyMilliseconds: number;
  /** A user-facing reason when the action is blocked. */
  blockReason?: string;
}

/**
 * The part of an Agents SDK connection (`AuthProvider`, for example the `MsalTokenProvider` from
 * `connectionManager.getDefaultConnection()`) used to obtain the agent identity's assertion.
 */
export interface DefenderRtpAgenticConnection {
  getAgenticApplicationToken(tenantId: string, agentAppInstanceId: string): Promise<string>;
}
