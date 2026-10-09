// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { AgentContext, Interceptor, Verdict, Warning } from '@responsibleai/agent-hooks';
import {
  PurviewDlpActivity,
  PurviewDlpAgentContext,
  PurviewDlpClient,
  PurviewDlpEvaluationResult,
  PurviewDlpTokenResolver,
} from '@microsoft/agents-a365-tooling';

const NO_IDENTITY_ERROR = 'no agent identity was resolved';
const MAX_ERROR_CHARACTERS = 200;
const ERROR_TYPE = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;
const BLOCK_MESSAGES: Readonly<Record<PurviewDlpActivity, string>> = {
  uploadText: 'The request was blocked by a Microsoft Purview data loss prevention policy.',
  downloadText: 'The response was blocked by a Microsoft Purview data loss prevention policy.',
};

/** The agent identity and credentials for the Purview call of one emitted context. */
export interface A365PurviewCall {
  /**
   * The agent identity. The interceptor sets `sessionId` and `sequence` from the emitted context
   * (`session.id`, `sequence`), and `agentName` from the context's `agent.name` when unset.
   */
  agent: PurviewDlpAgentContext;
  /**
   * Resolves the Microsoft Graph token, for example `PurviewDlpTokenResolvers.fromAgenticUser(connection)`.
   */
  tokenResolver: PurviewDlpTokenResolver;
}

/**
 * Returns the agent identity and token resolver for an emitted context, for example from the current turn.
 * Returning null or undefined means no agent identity is available, so Purview cannot be called: the
 * context follows the fail mode, like any other unverified context.
 */
export type A365PurviewCallResolver = (
  context: AgentContext,
) => A365PurviewCall | null | undefined | Promise<A365PurviewCall | null | undefined>;

/** Receives each Purview evaluation, for logging and telemetry (for example the correlation id). */
export type A365PurviewEvaluationListener = (result: PurviewDlpEvaluationResult) => void;

/**
 * An agent-hooks interceptor for Microsoft Purview data loss prevention (DLP). At `input`, the text of the
 * user's message is evaluated as `uploadText`, and Purview's block denies it. At `output`, the reply's text
 * is evaluated as `downloadText`: in the default `audit` response mode it is sent without waiting and
 * allowed at once (Purview DLP restricts only prompts of custom AI apps, and records the reply for audit);
 * in `enforce` mode it is awaited and decided like the input. Other points, and every point while Purview
 * DLP is disabled, are allowed without a call; so is content without text.
 *
 * When no verdict is obtained (transport, authentication or processing failure, a call resolver that
 * throws or resolves no agent identity), or Purview allowed only a truncated copy of text that did not fit
 * `A365_PURVIEW_DLP_MAX_CONTENT_CHARACTERS`, the verdict follows the configured fail mode: allow with a
 * `purview:unverified` warning, or deny with reason `runtime_error:purview_unverified`, which is never
 * reported as a detection.
 */
export class A365PurviewInterceptor implements Interceptor {
  /** The name the interceptor is registered under. */
  public static readonly NAME = 'purview';

  /**
   * @param client The Purview client.
   * @param resolveCall Returns the agent identity and token resolver for a context, for example from the
   * current turn; null or undefined (no agent identity) follows the fail mode without a call.
   * @param onEvaluated Receives each evaluation, including the ones without a verdict and the audited
   * replies, for logging and telemetry (for example the correlation id). Errors it throws are ignored.
   */
  constructor(
    private readonly client: PurviewDlpClient,
    private readonly resolveCall: A365PurviewCallResolver,
    private readonly onEvaluated?: A365PurviewEvaluationListener,
  ) {
    if (!client) {
      throw new TypeError('client is required.');
    }

    if (typeof resolveCall !== 'function') {
      throw new TypeError('resolveCall is required.');
    }
  }

  /**
   * The Purview activity of an agent-hooks interception point.
   *
   * @param interceptionPoint The agent-hooks interception point.
   * @returns `uploadText` for `input`, `downloadText` for `output`, otherwise undefined.
   */
  public static activityOf(interceptionPoint: unknown): PurviewDlpActivity | undefined {
    switch (interceptionPoint) {
    case 'input':
      return 'uploadText';
    case 'output':
      return 'downloadText';
    default:
      return undefined;
    }
  }

  /** @inheritdoc */
  public async intercept(context: AgentContext): Promise<Verdict> {
    const activity = A365PurviewInterceptor.activityOf(context?.interception_point);
    if (!activity) {
      return { decision: 'allow' };
    }

    let result: PurviewDlpEvaluationResult | null;
    try {
      const configuration = this.client.configuration;
      if (!configuration.isPurviewDlpEnabled) {
        return { decision: 'allow' };
      }

      if (activity === 'downloadText' && configuration.purviewDlpResponseMode === 'audit') {
        this.audit(context);
        return { decision: 'allow' };
      }

      result = await this.evaluate(context, activity);
    } catch (error) {
      // An invalid configuration is never a verdict: it follows the fail mode.
      result = this.client.unavailable(activity, describeError(error, true));
    }

    if (!result) {
      return { decision: 'allow' };
    }

    const verdict = A365PurviewInterceptor.toVerdict(result);
    this.notify(result);
    return verdict;
  }

  /**
   * Maps a Purview evaluation to the agent-hooks verdict the host composes.
   *
   * @param result The Purview evaluation.
   * @returns `allow` when Purview allowed the content; on a block, a `purview:block` deny with the
   * `client-request-id` as evidence. A result without a verdict, or Purview's allow of truncated text, is
   * unverified: an allow with a `purview:unverified` warning, or a `runtime_error:purview_unverified` deny.
   */
  public static toVerdict(result: PurviewDlpEvaluationResult): Verdict {
    if (!result) {
      throw new TypeError('result is required.');
    }

    const name = A365PurviewInterceptor.NAME;
    // A block stands even when the text was truncated; only an allow of all of it is authoritative.
    const authoritative = result.evaluated && !result.truncated;
    if (result.evaluated && (result.decision?.blockAction === true || (authoritative && !result.allowed))) {
      return {
        decision: 'deny',
        reason: `${name}:block`,
        message: result.blockReason ?? BLOCK_MESSAGES[result.activity] ?? BLOCK_MESSAGES.uploadText,
        evidence: {
          artefact: `${name}-verdict`,
          verification_pointers: { correlation: `urn:a365:${name}:${encodeURIComponent(result.correlationId)}` },
        },
      };
    }

    if (authoritative) {
      return { decision: 'allow' };
    }

    const warnings: Warning[] = [{ reason: `${name}:unverified`, message: result.error ?? 'no verdict was returned' }];
    return result.allowed
      ? { decision: 'allow', warnings }
      : {
        decision: 'deny',
        reason: `runtime_error:${name}_unverified`,
        // The client sets the reason when it fails closed.
        ...(result.blockReason ? { message: result.blockReason } : {}),
        warnings,
      };
  }

  /**
   * Evaluates the context's text. Never rejects for a missing identity or an invalid context: those become
   * not-evaluated results, which follow the fail mode.
   */
  private async evaluate(context: AgentContext, activity: PurviewDlpActivity): Promise<PurviewDlpEvaluationResult | null> {
    let limit: number;
    try {
      limit = this.client.configuration.purviewDlpMaxContentCharacters;
    } catch (error) {
      return this.client.unavailable(activity, describeError(error, true));
    }

    let text: string;
    let complete: boolean;
    try {
      ({ text, complete } = contentText(contentOf(context, activity), limit));
    } catch (error) {
      // The content is the host's, so only the type of what it raised is reported.
      return this.client.unavailable(activity, `content could not be read: ${describeError(error, false)}`);
    }

    if (!text.trim()) {
      // Nothing to evaluate, so no identity is needed. Content whose first characters are blank but that goes
      // on past the limit is not empty: the rest was never read, so it follows the fail mode.
      return complete
        ? null
        : this.client.unavailable(
          activity,
          `content exceeded A365_PURVIEW_DLP_MAX_CONTENT_CHARACTERS (${limit}) before any text; Purview was not called`,
        );
    }

    // Read before anything is awaited: a reply is evaluated after the interceptor has returned.
    const turn = turnOf(context);
    let call: A365PurviewCall | null | undefined;
    try {
      call = await this.resolveCall(context);
    } catch (error) {
      // The host's error may carry anything, so only its type is reported.
      return this.client.unavailable(activity, `${NO_IDENTITY_ERROR}: ${describeError(error, false)}`);
    }

    // Without an agent identity Purview cannot be called: the content is unverified, not allowed.
    if (!call) {
      return this.client.unavailable(activity, NO_IDENTITY_ERROR);
    }

    try {
      return await this.client.evaluate(activity, text, agentFor(call.agent, turn), call.tokenResolver);
    } catch (error) {
      // The client throws only for invalid arguments or configuration, with the SDK's own messages.
      return this.client.unavailable(activity, describeError(error, true));
    }
  }

  /**
   * Sends the reply to Purview without waiting. The evaluation is bounded by the client's own timeout,
   * never by the emitter's cancellation, and reports to the listener; nothing it raises escapes.
   */
  private audit(context: AgentContext): void {
    this.evaluate(context, 'downloadText').then(
      (result) => {
        if (result) {
          this.notify(result);
        }
      },
      () => undefined,
    );
  }

  /**
   * Hands the evaluation to the listener after the verdict is returned, off the interceptor's timed path,
   * so a slow listener cannot delay the action. Its errors and rejections are ignored, so logging cannot
   * change a verdict.
   */
  private notify(result: PurviewDlpEvaluationResult): void {
    const listener = this.onEvaluated;
    if (!listener) {
      return;
    }

    setImmediate(() => {
      try {
        const pending: unknown = listener(result);
        // Any thenable, including a promise from another realm, which `instanceof Promise` misses.
        if (isThenable(pending)) {
          Promise.resolve(pending).catch(() => undefined);
        }
      } catch (_error) {
        // Ignored by design.
      }
    });
  }
}

/** What the context says about the conversation and the agent. */
interface Turn {
  sessionId?: string;
  sequence?: number;
  agentName?: string;
}

function turnOf(context: AgentContext): Turn {
  const session = context['session'];
  const sessionId = isObject(session) && typeof session['id'] === 'string' && session['id'] ? session['id'] : undefined;
  const sequence = typeof context['sequence'] === 'number' ? context['sequence'] : undefined;
  const agent = context['agent'];
  const agentName = isObject(agent) && typeof agent['name'] === 'string' ? agent['name'] : undefined;
  return { sessionId, sequence, agentName };
}

/**
 * The agent identity for one context: its session id and sequence (which line Purview's conversation up with
 * the host's interception records) from the context, and the context's agent name when none is set.
 */
function agentFor(agent: PurviewDlpAgentContext, turn: Turn): PurviewDlpAgentContext {
  if (!isObject(agent)) {
    // The client rejects it, and the context follows the fail mode.
    return agent;
  }

  const sessionId = turn.sessionId ?? agent.sessionId;
  const sequence = turn.sequence ?? agent.sequence;
  const agentName = typeof agent.agentName === 'string' && agent.agentName.trim() ? agent.agentName : turn.agentName;
  return {
    ...agent,
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(sequence !== undefined ? { sequence } : {}),
    ...(agentName ? { agentName } : {}),
  };
}

function contentOf(context: AgentContext, activity: PurviewDlpActivity): unknown {
  const holder = context[activity === 'uploadText' ? 'input' : 'output'];
  return isObject(holder) ? holder['content'] : undefined;
}

/**
 * The text of a message's content: a string as it is; structured content (for example content parts) as
 * its string and number values in order, one per line, each object read once. Reading stops once the text
 * is longer than `limit`, as the client sends at most that much and marks the content as truncated;
 * `complete` tells whether everything was read.
 */
function contentText(content: unknown, limit: number): { text: string; complete: boolean } {
  if (typeof content === 'string') {
    return { text: content, complete: true };
  }

  const parts: string[] = [];
  // The length of the joined text, separators included.
  let length = 0;
  const pending: unknown[] = [content];
  const seen = new Set<object>();
  while (pending.length > 0 && length <= limit) {
    const node = pending.pop();
    if (typeof node === 'object' && node !== null) {
      if (!seen.has(node)) {
        seen.add(node);
        const children: unknown[] = Array.isArray(node) ? node : Object.values(node);
        for (let index = children.length - 1; index >= 0; index -= 1) {
          pending.push(children[index]);
        }
      }

      continue;
    }

    const text = typeof node === 'string'
      ? node
      : (typeof node === 'number' && Number.isFinite(node)) || typeof node === 'bigint' ? String(node) : '';
    if (text) {
      length += (parts.length > 0 ? 1 : 0) + text.length;
      parts.push(text);
    }
  }

  return { text: parts.join('\n'), complete: pending.length === 0 };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (typeof value === 'object' || typeof value === 'function')
    && value !== null
    && typeof (value as { then?: unknown }).then === 'function';
}

/**
 * The exception type, for example `TypeError`, and with `withMessage` its message: only for the SDK's own
 * errors, as a host's may carry a token or a response body.
 */
function describeError(error: unknown, withMessage: boolean): string {
  if (typeof error !== 'object' || error === null) {
    return 'unknown error';
  }

  const name = (error as { name?: unknown }).name;
  const type = typeof name === 'string' && ERROR_TYPE.test(name) ? name : 'Error';
  if (!withMessage) {
    return type;
  }

  const message = (error as { message?: unknown }).message;
  const description = `${type}: ${typeof message === 'string' ? message : ''}`.replace(/\s+/g, ' ').trim();
  return description.length > MAX_ERROR_CHARACTERS ? `${description.slice(0, MAX_ERROR_CHARACTERS)}...` : description;
}
