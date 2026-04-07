// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { TurnContext } from '@microsoft/agents-hosting';
import { ExecutionType, OpenTelemetryConstants } from '@microsoft/agents-a365-observability';
import {RoleTypes} from '@microsoft/agents-activity';
import { Utility as RuntimeUtility } from '@microsoft/agents-a365-runtime';

/**
 * TurnContext utility methods.
 */

function normalizePairs(pairs: Array<[string, string | undefined]>): Array<[string, string]> {
  return pairs
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => [k, String(v)]);
}

/**
 * Extracts caller-related OpenTelemetry baggage pairs from the TurnContext.
 * @param turnContext The current TurnContext (activity context)
 * @returns Array of [key, value] pairs for caller identity
 */
export function getCallerBaggagePairs(turnContext: TurnContext): Array<[string, string]> {
  if (!turnContext|| !turnContext.activity?.from) { 
    return [];
  }
  const from = turnContext.activity.from;
    
  const upn = from.agenticUserId;
  const pairs: Array<[string, string | undefined]> = [
    [OpenTelemetryConstants.USER_ID_KEY, from.aadObjectId],
    [OpenTelemetryConstants.USER_NAME_KEY, from.name],
    [OpenTelemetryConstants.USER_EMAIL_KEY, upn],
    [OpenTelemetryConstants.GEN_AI_CALLER_AGENT_APPLICATION_ID_KEY, from.agenticAppBlueprintId]
  ];
  return normalizePairs(pairs);
}

/**
 * Extracts the execution type baggage key-value pair based on caller and recipient agentic status.
 * @param turnContext The current TurnContext (activity context)
 * @returns Array of [key, value] for execution type
 */
export function getExecutionTypePair(turnContext: TurnContext): Array<[string, string]> {
  if (!turnContext || !turnContext.activity?.from || !turnContext.activity?.recipient) { 
    return [];
  }
  const from = turnContext.activity.from;  
  let executionType = ExecutionType.HumanToAgent;

    if (from.role) {
      switch (from.role) {
        case RoleTypes.AgenticUser:
          executionType = ExecutionType.Agent2Agent;
          break;
        case RoleTypes.User:
          executionType = ExecutionType.HumanToAgent;
          break;
        }
    }
  return [[OpenTelemetryConstants.GEN_AI_EXECUTION_TYPE_KEY, executionType]];
}

/**
 * Resolves the agent instance ID and blueprint ID for embodied (agentic) agents only.
 * For the non-embodied agent case, we cannot reliably determine whether the token contains an app ID,
 * or whether the app ID present in the token claims actually corresponds to this agent. Therefore,
 * we only set agentId and agentBlueprintId for embodied (agentic) agents.
 * @param turnContext Activity context
 * @param authToken Auth token for resolving blueprint ID from token claims.
 * @returns Object with agentId and agentBlueprintId, both undefined for non-embodied agents.
 */
export function resolveEmbodiedAgentIds(turnContext: TurnContext, authToken: string): { agentId: string | undefined; agentBlueprintId: string | undefined } {
  const isAgentic = turnContext?.activity?.isAgenticRequest?.();
  const rawAgentId = isAgentic ? turnContext.activity.getAgenticInstanceId?.() : undefined;
  const rawBlueprintId = isAgentic ? RuntimeUtility.getAgentIdFromToken(authToken) : undefined;
  return {
    agentId: rawAgentId || undefined,
    agentBlueprintId: rawBlueprintId || undefined,
  };
}

/**
 * Extracts agent/recipient-related OpenTelemetry baggage pairs from the TurnContext.
 * @param turnContext The current TurnContext (activity context)
 * @param authToken Optional auth token for resolving agent blueprint ID from token claims.
 * @returns Array of [key, value] pairs for agent identity and description
 */
export function getTargetAgentBaggagePairs(turnContext: TurnContext, authToken?: string): Array<[string, string]> {
  if (!turnContext || !turnContext.activity?.recipient) {
    return [];
  }
  const recipient = turnContext.activity.recipient;
  const { agentId } = authToken ? resolveEmbodiedAgentIds(turnContext, authToken) : { agentId: turnContext.activity?.isAgenticRequest?.() ? turnContext.activity.getAgenticInstanceId?.() : undefined };
  const agentName = recipient.name;
  const aadObjectId = recipient.aadObjectId;
  const agentDescription  = recipient.role;
  const pairs: Array<[string, string | undefined]> = [
    [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY, agentId],
    [OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY, agentName],
    [OpenTelemetryConstants.GEN_AI_AGENT_DESCRIPTION_KEY, agentDescription],
    [OpenTelemetryConstants.GEN_AI_AGENT_AUID_KEY, aadObjectId],
  ];
  return normalizePairs(pairs);
}

/**
 * Extracts the tenant ID baggage key-value pair using the Activity's getAgenticTenantId() helper.
 * @param turnContext The current TurnContext (activity context)
 * @returns Array of [key, value] for tenant ID
 */
export function getTenantIdPair(turnContext: TurnContext): Array<[string, string]> {
  const tenantId = turnContext.activity?.getAgenticTenantId?.();
  return tenantId ? [[OpenTelemetryConstants.TENANT_ID_KEY, tenantId]] : [];
}

/**
 * Extracts channel baggage pairs from the TurnContext.
 * @param turnContext The current TurnContext (activity context)
 * @returns Array of [key, value] pairs for channel name and subchannel description
 */
export function getChannelBaggagePairs(turnContext: TurnContext): Array<[string, string]> {
  if (!turnContext) { 
    return [];
  }  
  const pairs: Array<[string, string | undefined]> = [
    [OpenTelemetryConstants.CHANNEL_NAME_KEY, turnContext.activity?.channelId],
    [OpenTelemetryConstants.CHANNEL_LINK_KEY, turnContext.activity?.channelIdSubChannel as string | undefined]
  ];
  return normalizePairs(pairs);
}

/**
 * Extracts conversation ID and item link baggage key-value pairs from the provided turn context.
 * @param turnContext The current TurnContext (activity context)
 * @returns Array of [key, value] pairs for conversation ID and item link
 */
export function getConversationIdAndItemLinkPairs(turnContext: TurnContext): Array<[string, string]> {
  if (!turnContext) { 
    return [];
  }
  const conversationId = turnContext.activity?.conversation?.id;
  const itemLink = turnContext.activity?.serviceUrl;
  const pairs: Array<[string, string | undefined]> = [
    [OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, conversationId],
    [OpenTelemetryConstants.GEN_AI_CONVERSATION_ITEM_LINK_KEY, itemLink]
  ];
  return normalizePairs(pairs);
}
