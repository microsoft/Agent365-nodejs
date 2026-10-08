// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { AgentContext, Interceptor, Verdict, Warning } from '@responsibleai/agent-hooks';
import {
  DefenderRtpAgentContext,
  DefenderRtpClient,
  DefenderRtpEvaluationResult,
  DefenderRtpTokenResolver,
} from '@microsoft/agents-a365-tooling';

const INVALID_REASON_CHARACTERS = /[^A-Za-z0-9_.-]/g;
const MAX_ERROR_CHARACTERS = 200;
const FAIL_CLOSED_MESSAGE = 'Security validation is unavailable and this agent is configured to fail closed.';

/** The agent identity and credentials for the Defender call of one emitted context. */
export interface A365DefenderCall {
  /** The agent identity and turn; fills context fields the host did not set. */
  agent: DefenderRtpAgentContext;
  /**
   * Resolves the agent identity's Defender token, for example
   * `DefenderRtpTokenResolvers.fromAgenticConnection(connection)`.
   */
  tokenResolver: DefenderRtpTokenResolver;
}

/**
 * Returns the agent identity and token resolver for an emitted context, for example from the
 * current turn. Returning null or undefined allows the context without a call.
 */
export type A365DefenderCallResolver = (
  context: AgentContext,
) => A365DefenderCall | null | undefined | Promise<A365DefenderCall | null | undefined>;

/** Receives each Defender evaluation, for logging and telemetry (for example the correlation id). */
export type A365DefenderEvaluationListener = (result: DefenderRtpEvaluationResult) => void;

/**
 * An agent-hooks interceptor for Microsoft Defender for AI real-time protection. For each context
 * the host emits at `input`, `pre_tool_call`, `post_tool_call` or `output`, a copy fitted to
 * Defender's request validation (normalized, content strings clamped, keeping its session, sequence
 * and tool call ids) is sent to Defender, and Defender's verdict decides: `deny` blocks the action.
 * Other points, and every point while Defender RTP is disabled, are allowed without a call.
 *
 * When no verdict is obtained (transport, authentication or validation failure, or a call resolver
 * that throws), the verdict follows the configured fail mode: allow with a `defender:unverified`
 * warning, or deny with reason `runtime_error:defender_unverified`, which is never reported as a
 * detection.
 */
export class A365DefenderInterceptor implements Interceptor {
  /** The name the interceptor is registered under. */
  public static readonly NAME = 'defender';

  /**
   * @param client The Defender client.
   * @param resolveCall Returns the agent identity and token resolver for a context, for example
   * from the current turn; null or undefined allows the context without a call.
   * @param onEvaluated Receives each evaluation, for logging and telemetry (for example the
   * correlation id). Errors it throws are ignored.
   */
  constructor(
    private readonly client: DefenderRtpClient,
    private readonly resolveCall: A365DefenderCallResolver,
    private readonly onEvaluated?: A365DefenderEvaluationListener,
  ) {
    if (!client) {
      throw new TypeError('client is required.');
    }

    if (typeof resolveCall !== 'function') {
      throw new TypeError('resolveCall is required.');
    }
  }

  /** @inheritdoc */
  public async intercept(context: AgentContext): Promise<Verdict> {
    const point = context?.interception_point;
    if (!DefenderRtpClient.isEvaluatedInterceptionPoint(point)) {
      return { decision: 'allow' };
    }

    let result: DefenderRtpEvaluationResult | null;
    try {
      if (!this.client.configuration.isDefenderRtpEnabled) {
        return { decision: 'allow' };
      }

      const call = await this.resolveCall(context);
      if (!call) {
        return { decision: 'allow' };
      }

      result = await this.client.evaluateHookContext(context, call.agent, call.tokenResolver);
    } catch (error) {
      // An invalid context or identity is never a verdict: it follows the fail mode.
      result = this.client.unavailable(point, describeError(error), sessionIdOf(context));
    }

    if (!result) {
      return { decision: 'allow' };
    }

    this.notify(result);
    return A365DefenderInterceptor.toVerdict(result);
  }

  /**
   * Maps a Defender evaluation to the agent-hooks verdict the host composes.
   *
   * @param result The Defender evaluation.
   * @returns The agent-hooks verdict: Defender's warnings and labels on `allow`; on a block, a
   * `defender:block[:<reason>]` deny with the correlation id as evidence.
   */
  public static toVerdict(result: DefenderRtpEvaluationResult): Verdict {
    if (!result) {
      throw new TypeError('result is required.');
    }

    const name = A365DefenderInterceptor.NAME;
    if (result.evaluated) {
      const labels = result.verdict?.resultLabels?.length ? [...result.verdict.resultLabels] : undefined;
      if (result.allowed) {
        const warnings: Warning[] = (result.verdict?.warnings ?? []).map((warning) => ({
          reason: warning.reason ?? `${name}:warning`,
          message: warning.message ?? '',
        }));
        return {
          decision: 'allow',
          ...(warnings.length > 0 ? { warnings } : {}),
          ...(labels ? { result_labels: labels } : {}),
        };
      }

      const reason = result.verdict?.reason;
      const code = reason ? `:${reason.replace(INVALID_REASON_CHARACTERS, '_')}` : '';
      return {
        decision: 'deny',
        reason: `${name}:block${code}`,
        ...(result.blockReason ? { message: result.blockReason } : {}),
        evidence: {
          artefact: `${name}-verdict`,
          verification_pointers: { correlation: `urn:a365:${name}:${encodeURIComponent(result.correlationId)}` },
        },
        ...(labels ? { result_labels: labels } : {}),
      };
    }

    const unverified: Warning[] = [{ reason: `${name}:unverified`, message: result.error ?? 'no verdict was returned' }];
    return result.allowed
      ? { decision: 'allow', warnings: unverified }
      : {
        decision: 'deny',
        reason: `runtime_error:${name}_unverified`,
        message: result.blockReason ?? FAIL_CLOSED_MESSAGE,
        warnings: unverified,
      };
  }

  /** Logging must not affect the verdict, so listener errors are ignored. */
  private notify(result: DefenderRtpEvaluationResult): void {
    if (!this.onEvaluated) {
      return;
    }

    try {
      const pending: unknown = this.onEvaluated(result);
      if (pending instanceof Promise) {
        pending.catch(() => undefined);
      }
    } catch (_error) {
      // Ignored by design.
    }
  }
}

function describeError(error: unknown): string {
  const description = (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).replace(/\s+/g, ' ').trim();
  return description.length > MAX_ERROR_CHARACTERS ? `${description.slice(0, MAX_ERROR_CHARACTERS)}...` : description;
}

function sessionIdOf(context: AgentContext): string | undefined {
  const sessionId = context?.session?.id;
  return typeof sessionId === 'string' && sessionId ? sessionId : undefined;
}
