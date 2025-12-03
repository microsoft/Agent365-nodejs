// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { TurnContext } from '@microsoft/agents-hosting';
import { ExecutionType, OpenTelemetryConstants } from '@microsoft/agents-a365-observability';

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
 * @returns Array of [key, value] pairs for caller identity and tenant
 */
export function getCallerBaggagePairs(turnContext: TurnContext): Array<[string, string]> {
  if (!turnContext|| !turnContext.activity?.from) { 
    return [];
  }
  const from = turnContext.activity.from;
    
  const userId = from.agenticUserId ?? from.aadObjectId;
  const pairs: Array<[string, string | undefined]> = [
    [OpenTelemetryConstants.GEN_AI_CALLER_ID_KEY, from.aadObjectId],
    [OpenTelemetryConstants.GEN_AI_CALLER_NAME_KEY, from.name],
    [OpenTelemetryConstants.GEN_AI_CALLER_UPN_KEY, from.name],
    [OpenTelemetryConstants.GEN_AI_CALLER_USER_ID_KEY, userId],
    [OpenTelemetryConstants.GEN_AI_CALLER_TENANT_ID_KEY, from.tenantId]
  ];
  return normalizePairs(pairs);
}

/**
 * Extracts the execution type baggage key-value pair based on caller and recipient agentic status.
 * @param turnContext The current TurnContext (activity context)
 * @returns Array of [key, value] for execution type
 */
export function getExecutionTypePair(turnContext: TurnContext): Array<[string, string]> {
  const AGENT_ROLE = 'agenticuser';
  if (!turnContext || !turnContext.activity?.from || !turnContext.activity?.recipient) { 
    return [];
  }
  const from = turnContext.activity.from;
  const recipient = turnContext.activity.recipient;
  const isAgenticCaller = !!from.agenticUserId || (from.role && from.role.toLowerCase() === AGENT_ROLE);
  const isAgenticRecipient = !!recipient.agenticUserId
    || (recipient.role && recipient.role.toLowerCase() === AGENT_ROLE);
  const executionType = (isAgenticRecipient && isAgenticCaller)
    ? ExecutionType.Agent2Agent
    : ExecutionType.HumanToAgent;
  return [[OpenTelemetryConstants.GEN_AI_EXECUTION_TYPE_KEY, executionType]];
}

/**
 * Extracts agent/recipient-related OpenTelemetry baggage pairs from the TurnContext.
 * @param turnContext The current TurnContext (activity context)
 * @returns Array of [key, value] pairs for agent identity and description
 */
export function getTargetAgentBaggagePairs(turnContext: TurnContext): Array<[string, string]> {
  if (!turnContext || !turnContext.activity?.recipient) { 
    return [];
  }
  const recipient = turnContext.activity.recipient; 
  const agentId = recipient.agenticAppId ?? recipient.id;
  const agentName = recipient.name;
  const agentUserId = recipient.agenticUserId ?? recipient.aadObjectId;
  const agentDescription = recipient.role;
  const pairs: Array<[string, string | undefined]> = [
    [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY, agentId],
    [OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY, agentName],
    [OpenTelemetryConstants.GEN_AI_AGENT_AUID_KEY, agentUserId],
    [OpenTelemetryConstants.GEN_AI_AGENT_DESCRIPTION_KEY, agentDescription]
  ];
  return normalizePairs(pairs);
}

/**
 * Extracts the tenant ID baggage key-value pair, attempting to retrieve from ChannelData if necessary.
 * @param turnContext The current TurnContext (activity context)
 * @returns Array of [key, value] for tenant ID
 */
export function getTenantIdPair(turnContext: TurnContext): Array<[string, string]> {
   let tenantId = turnContext.activity?.recipient?.tenantId;


  // If not found, try to extract from channelData. Accepts both object and JSON string.
  if (!tenantId && turnContext.activity?.channelData) {
    try {
      let channelData: unknown = turnContext.activity.channelData;
      if (typeof channelData === 'string') {
        channelData = JSON.parse(channelData);
      }
      if (
        typeof channelData === 'object' && channelData !== null) {
        tenantId = (channelData as { tenant: { id?: string } })?.tenant?.id;
      }
    } catch (_err) {
      // ignore JSON parse errors
    }
  }
  return [[OpenTelemetryConstants.TENANT_ID_KEY, tenantId ?? '']];}

/**
 * Extracts source metadata baggage pairs from the TurnContext.
 * @param turnContext The current TurnContext (activity context)
 * @returns Array of [key, value] pairs for channel name and link
 */
export function getSourceMetadataBaggagePairs(turnContext: TurnContext): Array<[string, string]> {
  if (!turnContext) { 
    return [];
  }  
  const pairs: Array<[string, string | undefined]> = [
    [OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_NAME_KEY, turnContext.activity?.channelId],
    [OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_DESCRIPTION_KEY, turnContext.activity?.channelIdSubChannel as string | undefined]
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
