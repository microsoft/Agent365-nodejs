// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { TurnContext } from '@microsoft/agents-hosting'
import { ExecutionType, OpenTelemetryConstants } from '@microsoft/agents-a365-observability';

/**
 * TurnContext utility methods.
 */

// Internal keys for observability context injection
const O11ySpanIdKey = 'O11ySpanId';
const O11yTraceIdKey = 'O11yTraceId';

/**
 * Extracts caller-related OpenTelemetry baggage pairs from the TurnContext.
 * @param turnContext The current TurnContext (activity context)
 * @returns Array of [key, value] pairs for caller identity and tenant
 */
export function getCallerBaggagePairs(turnContext: TurnContext): Array<[string, string]> {
  if (!turnContext) { 
    return [];
  }
  const from = turnContext.activity?.from as any || {};
  const userId = from.AgenticUserId ?? from.AadObjectId;
  const pairs: Array<[string, any]> = [
    [OpenTelemetryConstants.GEN_AI_CALLER_ID_KEY, from.Id ?? from.id],
    [OpenTelemetryConstants.GEN_AI_CALLER_NAME_KEY, from.Name ?? from.name],
    [OpenTelemetryConstants.GEN_AI_CALLER_UPN_KEY, from.Name ?? from.name],
    [OpenTelemetryConstants.GEN_AI_CALLER_USER_ID_KEY, userId],
    [OpenTelemetryConstants.GEN_AI_CALLER_TENANT_ID_KEY, from.TenantId ?? from.tenantId]
  ];
  return pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]);
}

/**
 * Extracts the execution type baggage key-value pair based on caller and recipient agentic status.
 * @param turnContext The current TurnContext (activity context)
 * @returns Array of [key, value] for execution type
 */
export function getExecutionTypePair(turnContext: TurnContext): Array<[string, string]> {
  const AGENT_ROLE = 'agenticuser';
  if (!turnContext) { 
    return [];
  }
  const from = turnContext.activity?.from as any || {};
  const recipient = turnContext.activity?.recipient as any || {};
  const isAgenticCaller = !!from.AgenticUserId
    || (from.Role && typeof from.Role === 'string' && from.Role.toLowerCase() === AGENT_ROLE)
    || (from.role && typeof from.role === 'string' && from.role.toLowerCase() === AGENT_ROLE);
  const isAgenticRecipient = !!recipient.AgenticUserId
    || (recipient.Role && typeof recipient.Role === 'string' && recipient.Role.toLowerCase() === AGENT_ROLE)
    || (recipient.role && typeof recipient.role === 'string' && recipient.role.toLowerCase() === AGENT_ROLE);
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
  if (!turnContext) { 
    return [];
  }
  const recipient: any = turnContext.activity?.recipient || turnContext.activity?.Recipient || {};
  const agentId = recipient.AgenticAppId ?? recipient.Id ?? recipient.id;
  const agentName = recipient.Name ?? recipient.name;
  const agentUserId = recipient.AgenticUserId ?? recipient.AadObjectId;
  const agentUpn = recipient.Name ?? recipient.name;
  const agentDescription = recipient.Role ?? recipient.role;
  const pairs: Array<[string, any]> = [
    [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY, agentId],
    [OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY, agentName],
    [OpenTelemetryConstants.GEN_AI_AGENT_AUID_KEY, agentUserId],
    [OpenTelemetryConstants.GEN_AI_AGENT_UPN_KEY, agentUpn],
    [OpenTelemetryConstants.GEN_AI_AGENT_DESCRIPTION_KEY, agentDescription]
  ];
  return pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]);
}

/**
 * Extracts the tenant ID baggage key-value pair, attempting to retrieve from ChannelData if necessary.
 * @param turnContext The current TurnContext (activity context)
 * @returns Array of [key, value] for tenant ID
 */
export function getTenantIdPair(turnContext: TurnContext): Array<[string, string]> {
  if (!turnContext) return [];
  let tenantId = turnContext.activity?.recipient?.tenantId
    ?? turnContext.activity?.recipient?.tenantId;

  // If not found, try to extract from channelData. Accepts both object and JSON string.
  if (!tenantId && turnContext.activity?.channelData) {
    try {
      let channelData = turnContext.activity.channelData;
      if (typeof channelData === 'string') {
        channelData = JSON.parse(channelData);
      }
      if (typeof channelData === 'object' && channelData.tenant && typeof channelData.tenant.id === 'string') {
        tenantId = channelData.tenant.id;
      }
    } catch {}
  }
  return [[OpenTelemetryConstants.TENANT_ID_KEY, tenantId ?? '']];
}

/**
 * Extracts source metadata baggage pairs from the TurnContext.
 * @param turnContext The current TurnContext (activity context)
 * @returns Array of [key, value] pairs for channel name and link
 */
export function getSourceMetadataBaggagePairs(turnContext: TurnContext): Array<[string, string]> {
  if (!turnContext) { 
    return [];
  }
  const channelId = turnContext.activity?.channelId as any || {};    
  const channel = channelId.Channel ?? channelId.channel;
  if(!channel) {
    return [];
  }

  const subChannel = channelId.SubChannel ?? channelId.subChannel;    
  const pairs: Array<[string, any]> = [
    [OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_NAME_KEY, channel],
    [OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_DESCRIPTION_KEY, subChannel]
  ];
  return pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]);
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
  const pairs: Array<[string, any]> = [
    [OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, conversationId],
    [OpenTelemetryConstants.GEN_AI_CONVERSATION_ITEM_LINK_KEY, itemLink]
  ];
  return pairs.filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]);
}

  

/**
 * Injects observability context (span and trace IDs) into the turn context.
 * @param turnContext The current TurnContext (activity context)
 * @param observabilityScope An object with Id and TraceId properties (OpenTelemetryScope)
 */
export function injectObservabilityContext(turnContext: any, observabilityScope: { Id: string; TraceId: string }): void {
  if (!turnContext || !observabilityScope) return;
  // Use a state bag on the context, create if missing
  if (!turnContext.stackState) { 
    turnContext.stackState = {};
  }
  turnContext.stackState[O11ySpanIdKey] = observabilityScope.Id;
  turnContext.stackState[O11yTraceIdKey] = observabilityScope.TraceId;
}
