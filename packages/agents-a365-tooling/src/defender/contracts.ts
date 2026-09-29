// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { TurnContext } from '@microsoft/agents-hosting';

export type DefenderRtpInspectionPoint =
  | 'before_agent'
  | 'after_agent'
  | 'before_tool'
  | 'after_tool';

/**
 * Tool metadata included in a Security4AI AISession.
 */
export interface DefenderRtpToolDefinition {
  name: string;
  description?: string;
  toolId?: string;
  toolType?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * Identity and correlation fields shared by all four lifecycle evaluations.
 */
export interface DefenderRtpAgentContext {
  sessionId?: string;
  requestId?: string;
  agentId?: string;
  tenantId?: string;
  blueprintId?: string;
  agentName?: string;
  agentObjectId?: string;
  platformAgentId?: string;
  platformType?: string;
  userId?: string;
  modelName?: string;
  instructions?: string;
}

export interface DefenderRtpAgentEvaluationRequest extends DefenderRtpAgentContext {
  messages: string[];
  tools?: DefenderRtpToolDefinition[];
}

export interface DefenderRtpToolEvaluationRequest extends DefenderRtpAgentContext {
  tool: DefenderRtpToolDefinition;
  arguments?: Record<string, unknown>;
  toolCallId?: string;
}

export interface DefenderRtpToolResponseEvaluationRequest
  extends DefenderRtpToolEvaluationRequest {
  result: unknown;
}

/**
 * Security4AI AISession protobuf-JSON payload accepted by the draft 3P webhook.
 */
export interface DefenderRtpAiSession {
  environment: {
    agent: Record<string, unknown>;
  };
  callerIdentity: Record<string, string>;
  sessionContext: {
    a365: {
      id: string;
    };
  };
  activities: Array<Record<string, unknown>>;
  evaluationPolicy: {
    type: 'EVALUATION_POLICY_TYPE_BLOCKING';
    threatScenarios: Array<{
      type: 'THREAT_SCENARIO_TYPE_ALL';
    }>;
  };
  timestamp: string;
}

export interface DefenderRtpDecision {
  blockAction: boolean;
  reasonCode: number | null;
  reason: string | null;
  diagnostics: string | null;
}

/**
 * Normalized outcome. evaluated=false means no Defender verdict was obtained and allowed follows
 * the configured fail mode.
 */
export interface DefenderRtpEvaluationResult {
  allowed: boolean;
  evaluated: boolean;
  inspectionPoint: DefenderRtpInspectionPoint;
  correlationId: string;
  decision: DefenderRtpDecision;
  httpStatus: number | null;
  error: string | null;
  latencyMilliseconds: number;
}

/**
 * Uses an already acquired Defender access token.
 */
export interface DefenderRtpAccessTokenContext {
  accessToken: string;
  turnContext?: TurnContext;
}

/**
 * Lets a host integrate its own cached Agent Identity token provider.
 */
export interface DefenderRtpTokenProviderContext {
  getAccessToken: (scope: string) => string | Promise<string>;
  tokenScope: string;
  turnContext?: TurnContext;
}

/**
 * Direct client-credentials flow used by an allowlisted 3P customer application.
 */
export interface DefenderRtpClientCredentialContext {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  tokenScope?: string;
  turnContext?: TurnContext;
}

/**
 * Built-in FMI three-hop authentication context.
 */
export interface DefenderRtpFmiAuthenticationContext {
  tenantId: string;
  agentId: string;
  blueprintClientId: string;
  blueprintClientSecret: string;
  tokenScope: string;
  turnContext?: TurnContext;
}

export type DefenderRtpAuthenticationContext =
  | DefenderRtpAccessTokenContext
  | DefenderRtpTokenProviderContext
  | DefenderRtpClientCredentialContext
  | DefenderRtpFmiAuthenticationContext;
