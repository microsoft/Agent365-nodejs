// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * The Purview activity of the evaluated text: `uploadText` for content the user sends the agent (the
 * prompt), `downloadText` for content the agent returns (the reply).
 */
export type PurviewDlpActivity = 'uploadText' | 'downloadText';

/**
 * How the agent's reply (`downloadText`) is handled: `audit` sends it to Purview without waiting and
 * never blocks it; `enforce` waits for Purview and blocks the reply like a prompt.
 */
export type PurviewDlpResponseMode = 'audit' | 'enforce';

/**
 * Identity of the agent and the conversation an evaluation is for.
 */
export interface PurviewDlpAgentContext {
  /** The agent identity (application) id, sent as `agents[0].identifier`. */
  agentId: string;
  /** The agent's tenant, for token acquisition (required by `PurviewDlpTokenResolvers.fromAgenticUser`). */
  tenantId?: string;
  /**
   * The agentic user's id (`activity.getAgenticUser()`), for token acquisition (required by
   * `PurviewDlpTokenResolvers.fromAgenticUser`).
   */
  agenticUserId?: string;
  /**
   * The agent blueprint's application id (`activity.recipient.agenticAppBlueprintId`), sent as
   * `agents[0].blueprintId`; left out when unknown.
   */
  blueprintId?: string;
  /**
   * The application id Purview DLP policies are scoped to, sent as the `applicationLocation`.
   * Defaults to {@link blueprintId}, then {@link agentId}.
   */
  applicationId?: string;
  /** The agent's display name; defaults to {@link agentId}. Purview requires a name. */
  agentName?: string;
  /** The agent's version; defaults to `1.0`. */
  agentVersion?: string;
  /**
   * The conversation or session id, sent as the content entry's `correlationId`, which groups the
   * conversation's messages in Purview. Required.
   */
  sessionId?: string;
  /**
   * The position of the content in the conversation, sent as `sequenceNumber`. When unset, the
   * client numbers each session's evaluations itself.
   */
  sequence?: number;
}

/** A Microsoft Graph access token for `processContent`, and the user whose content is evaluated. */
export interface PurviewDlpAccessToken {
  /** The access token. A delegated token needs `Content.Process.User`. */
  accessToken: string;
  /**
   * The user to evaluate the content for, as `POST /users/{userId}/...`; for example with an app-only
   * token that carries `Content.Process.All`. When unset, the token's own user is used (`/me`), which
   * requires a delegated token, for example the agentic user's.
   */
  userId?: string;
}

/**
 * Resolves the Microsoft Graph token for a Purview evaluation, for example
 * `PurviewDlpTokenResolvers.fromAgenticUser(connection)`.
 *
 * @param agent The agent identity and conversation.
 * @param scopes The scopes to request (the configured Purview DLP scope).
 * @param signal Aborts when the evaluation's deadline elapses.
 * @returns The token, and the user to evaluate for (`/users/{userId}`), or nothing for `/me`.
 * Returning nothing, or throwing, makes the evaluation follow the fail mode.
 */
export type PurviewDlpTokenResolver = (
  agent: PurviewDlpAgentContext,
  scopes: string[],
  signal: AbortSignal,
) => Promise<PurviewDlpAccessToken | null | undefined> | PurviewDlpAccessToken | null | undefined;

/**
 * Returns a Microsoft Graph access token, for `PurviewDlpTokenResolvers.fromAccessTokenProvider`.
 *
 * @param scopes The scopes to request.
 * @param signal Aborts when the evaluation's deadline elapses.
 * @param agent The agent identity and conversation.
 */
export type PurviewDlpAccessTokenProvider = (
  scopes: string[],
  signal: AbortSignal,
  agent: PurviewDlpAgentContext,
) => Promise<string | null | undefined> | string | null | undefined;

/** Options for `PurviewDlpClient.evaluate`. */
export interface PurviewDlpEvaluateOptions {
  /**
   * Whether the text is only the first part of the content (for example of a message too large to read
   * whole). It is sent with `isTruncated: true`, Purview's allow does not cover the rest and follows the fail
   * mode, and blank text is not evaluated but follows the fail mode too.
   */
  truncated?: boolean;
}

/** What Purview decided, read from the `policyActions` of the `processContent` response. */
export interface PurviewDlpDecision {
  /**
   * Whether a policy action blocks the content: its `restrictionAction` is `block` or its `action` is
   * `blockAccess`.
   */
  blockAction: boolean;
  /**
   * The `restrictionAction` of the blocking action, when it has one; when nothing blocks, of the first action
   * that has one (for example `warn` or `audit`).
   */
  restrictionAction?: string;
  /** How many policy actions Purview returned. */
  actionCount: number;
}

/**
 * The outcome of one Purview evaluation. `evaluated` is false when no verdict was obtained; `allowed`
 * then follows the configured fail mode (`A365_PURVIEW_DLP_FAIL_MODE`). It also follows the fail mode
 * when Purview allowed `truncated` text.
 */
export interface PurviewDlpEvaluationResult {
  /** Whether the content may proceed. */
  allowed: boolean;
  /** Whether Purview returned a verdict. */
  evaluated: boolean;
  /**
   * Whether the text was longer than `A365_PURVIEW_DLP_MAX_CONTENT_CHARACTERS` and was sent cut. A block
   * stands; an allow does not cover the rest, so `allowed` then follows the fail mode and `error` says why.
   */
  truncated: boolean;
  /** The Purview activity that was evaluated. */
  activity: PurviewDlpActivity;
  /** The `client-request-id` sent with the call; Microsoft Graph logs the request under it. */
  correlationId: string;
  /** Purview's decision; empty when no verdict was obtained. */
  decision: PurviewDlpDecision;
  /** Purview's `protectionScopeState` (`modified` or `notModified`), when returned. */
  protectionScopeState?: string;
  /** The HTTP status, when a response was received. */
  httpStatus?: number;
  /** Time spent on the evaluation, in milliseconds. */
  latencyMilliseconds: number;
  /**
   * Why the content could not be verified, for example `http 403` or `request timeout`. It names the
   * failure or the exception type only, never a response body or token.
   */
  error?: string;
  /** A user-facing reason when the content is blocked. */
  blockReason?: string;
}

/**
 * The part of an Agents SDK connection (`AuthProvider`, for example the `MsalTokenProvider` from
 * `connectionManager.getDefaultConnection()`) used to obtain the agentic user's token.
 */
export interface PurviewDlpAgenticUserConnection {
  getAgenticUserToken(tenantId: string, agentAppInstanceId: string, agenticUserId: string, scopes: string[]): Promise<string>;
}
