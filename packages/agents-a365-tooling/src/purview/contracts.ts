// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { Authorization, TurnContext } from '@microsoft/agents-hosting';

/**
 * The two content gates evaluated by Purview DLP.
 *
 * `uploadText` inspects the inbound prompt before the model sees it; `downloadText` inspects the
 * model's response before it is returned. Both map to the Graph `processContent` activity metadata.
 */
export type PurviewDlpActivity = 'uploadText' | 'downloadText';

/**
 * Identity and correlation fields shared by the prompt and response evaluations. Any field left
 * unset is resolved from the incoming activity when a `TurnContext` is supplied on the
 * authentication context.
 */
export interface PurviewDlpAgentContext {
  agentId?: string;
  tenantId?: string;
  blueprintId?: string;
  /**
   * Entra application (client) id the Purview DLP policy is scoped to (the `processContent`
   * `applicationLocation`). Defaults to `blueprintId`, then `agentId`.
   */
  applicationId?: string;
  agentName?: string;
  sessionId?: string;
  requestId?: string;
  /**
   * Sponsor user object id used for the app-only `/users/{id}` endpoint. Ignored for delegated
   * (agentic user) evaluation, which always targets `/me`.
   */
  sponsorUserId?: string;
}

/**
 * Content submitted to a single Purview DLP gate. Non-empty `messages` are joined into one
 * `textContent` entry.
 */
export interface PurviewDlpEvaluationRequest extends PurviewDlpAgentContext {
  messages: string[];
}

/**
 * The blocking outcome parsed from the Graph `processContent` `policyActions`.
 */
export interface PurviewDlpDecision {
  blockAction: boolean;
  restrictionAction: string | null;
  actionCount: number;
}

/**
 * Normalized outcome. `evaluated=false` means no Purview verdict was obtained and `allowed` follows
 * the configured fail mode.
 */
export interface PurviewDlpEvaluationResult {
  allowed: boolean;
  evaluated: boolean;
  activity: PurviewDlpActivity;
  correlationId: string;
  decision: PurviewDlpDecision;
  protectionScopeState: string | null;
  httpStatus: number | null;
  error: string | null;
  latencyMilliseconds: number;
}

/**
 * Uses an already acquired Microsoft Graph access token. Targets `/me` unless `sponsorUserId` is
 * set, in which case the app-only `/users/{sponsorUserId}` endpoint is used.
 */
export interface PurviewDlpAccessTokenContext {
  accessToken: string;
  sponsorUserId?: string;
  turnContext?: TurnContext;
}

/**
 * Lets a host integrate its own cached Graph token provider. Targets `/me` unless `sponsorUserId`
 * is set.
 */
export interface PurviewDlpTokenProviderContext {
  getAccessToken: (scope: string) => string | Promise<string>;
  tokenScope?: string;
  sponsorUserId?: string;
  turnContext?: TurnContext;
}

/**
 * Delegated agentic-user authentication. Exchanges the agent's agentic token for a Microsoft Graph
 * token and evaluates as `/me` (the agent identity).
 */
export interface PurviewDlpAgenticUserContext {
  authorization: Authorization;
  authHandlerName: string;
  turnContext: TurnContext;
}

/**
 * Direct client-credentials flow used by an allowlisted application. App-only: targets
 * `/users/{sponsorUserId}`.
 */
export interface PurviewDlpClientCredentialContext {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  sponsorUserId: string;
  tokenScope?: string;
  turnContext?: TurnContext;
}

/**
 * Built-in FMI three-hop authentication (Blueprint to Agent Identity). App-only: targets
 * `/users/{sponsorUserId}`.
 */
export interface PurviewDlpFmiAuthenticationContext {
  tenantId: string;
  agentId: string;
  blueprintClientId: string;
  blueprintClientSecret: string;
  sponsorUserId: string;
  tokenScope?: string;
  turnContext?: TurnContext;
}

export type PurviewDlpAuthenticationContext =
  | PurviewDlpAccessTokenContext
  | PurviewDlpTokenProviderContext
  | PurviewDlpAgenticUserContext
  | PurviewDlpClientCredentialContext
  | PurviewDlpFmiAuthenticationContext;
