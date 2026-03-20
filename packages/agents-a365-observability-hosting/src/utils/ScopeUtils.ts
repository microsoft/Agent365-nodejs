// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { TurnContext } from '@microsoft/agents-hosting';
import { SpanKind, TimeInput } from '@opentelemetry/api';
import {
  InvokeAgentScope,
  InferenceScope,
  ExecuteToolScope,
  AgentDetails,
  CallerDetails,
  InferenceDetails,
  InvokeAgentDetails,
  InvokeAgentCallerDetails,
  ToolCallDetails,
  AgentRequest,
  InferenceRequest,
  ToolRequest,
  SpanDetails,
} from '@microsoft/agents-a365-observability';
import { resolveEmbodiedAgentIds } from './TurnContextUtils';

/**
 * Unified utilities to populate scope tags from a TurnContext.
 * Provides common tag population and scope-specific helpers.
 */
export class ScopeUtils {


  private static setInputMessageTags(
    scope: InvokeAgentScope | InferenceScope,
    turnContext: TurnContext,
  ): InvokeAgentScope | InferenceScope {
    if (turnContext?.activity?.text) {
      scope.recordInputMessages([turnContext.activity.text]);
    }
    return scope;
  }

  // ----------------------
  // Context-derived helpers
  // ----------------------
  /**
   * Derive tenant details from the TurnContext.
   * @param turnContext Activity context
   * @returns Tenant details if a recipient tenant id is present; otherwise undefined.
   */
  public static deriveTenantDetails(turnContext: TurnContext): { tenantId: string } | undefined {
    const tenantId = turnContext?.activity?.getAgenticTenantId?.();
    return tenantId ? { tenantId } : undefined;
  }

  /**
   * Derive target agent details from the activity recipient.
   * Uses {@link resolveEmbodiedAgentIds} to resolve the agent ID and blueprint ID, which are only
   * set for embodied (agentic) agents — see that function for the rationale.
   * @param turnContext Activity context
   * @param authToken Auth token for resolving agent identity from token claims.
   * @returns Agent details built from recipient properties; otherwise undefined.
   */
  public static deriveAgentDetails(turnContext: TurnContext, authToken: string): AgentDetails | undefined {
    const recipient = turnContext?.activity?.recipient;
    if (!recipient) return undefined;
    const { agentId, agentBlueprintId } = resolveEmbodiedAgentIds(turnContext, authToken);
    return {
      agentId,
      agentName: recipient.name,
      agentAUID: recipient.aadObjectId,
      agentBlueprintId,
      agentUPN: turnContext?.activity?.getAgenticUser?.(),
      agentDescription: recipient.role,
      tenantId: turnContext?.activity?.getAgenticTenantId?.()
    } as AgentDetails;
  }


  /**
   * Derive caller agent details from the activity from.
   * @param turnContext Activity context
   * @returns Agent details built from caller (from) properties; otherwise undefined.
   */
  public static deriveCallerAgent(turnContext: TurnContext): AgentDetails | undefined {
    const from = turnContext?.activity?.from;
    if (!from) return undefined;
    return {
      agentBlueprintId: from.agenticAppBlueprintId,
      agentName: from.name,
      agentAUID: from.aadObjectId,
      agentDescription: from.role,
      tenantId: from.tenantId,
      agentId: from.agenticAppId,
      agentUPN: from.agenticUserId
    } as AgentDetails;
  }


  /**
   * Derive caller identity details (id, upn, name, tenant, client ip) from the activity from.
   * @param turnContext Activity context
   * @returns Caller details when available; otherwise undefined.
   */
  public static deriveCallerDetails(turnContext: TurnContext): CallerDetails | undefined {
    const from = turnContext?.activity?.from;
    if (!from) return undefined;
    return {
      callerId: from.aadObjectId,
      callerUpn: from.agenticUserId,
      callerName: from.name,
      tenantId: from.tenantId,
    } as CallerDetails;
  }

  /**
   * Derive conversation id from the TurnContext.
   * @param turnContext Activity context
   * @returns Conversation id when present; otherwise undefined.
   */
  public static deriveConversationId(turnContext: TurnContext): string | undefined {
    return turnContext?.activity?.conversation?.id;
  }

  /**
   * Derive channel (name and description) from the TurnContext.
   * @param turnContext Activity context
   * @returns Object with optional name and description fields.
   */
  public static deriveChannelObject(turnContext: TurnContext): { name?: string; description?: string } {
    return {
      name: turnContext?.activity?.channelId,
      description: turnContext?.activity?.channelIdSubChannel as string | undefined
    };
  }

  /**
   * Create an `InferenceScope` using `details` and values derived from the provided `TurnContext`.
   * Derives `conversationId` and `channel` (name/description) from context.
   * Also records input messages from the context if present.
   * @param details The inference call details (model, provider, tokens, etc.).
   * @param turnContext The current activity context to derive scope parameters from.
   * @param authToken Auth token for resolving agent identity from token claims.
   * @param startTime Optional explicit start time (ms epoch, Date, or HrTime).
   * @param endTime Optional explicit end time (ms epoch, Date, or HrTime).
   * @returns A started `InferenceScope` enriched with context-derived parameters.
   */
  static populateInferenceScopeFromTurnContext(
    details: InferenceDetails,
    turnContext: TurnContext,
    authToken: string,
    startTime?: TimeInput,
    endTime?: TimeInput
  ): InferenceScope {
    const agent = ScopeUtils.deriveAgentDetails(turnContext, authToken);
    const caller = ScopeUtils.deriveCallerDetails(turnContext);
    const conversationId = ScopeUtils.deriveConversationId(turnContext);
    const channel = ScopeUtils.deriveChannelObject(turnContext);

    if (!agent) {
      throw new Error('populateInferenceScopeFromTurnContext: Missing agent details on TurnContext (recipient)');
    }

    const hasChannel = channel.name !== undefined || channel.description !== undefined;
    const request: InferenceRequest | undefined = (conversationId || hasChannel)
      ? {
          conversationId,
          ...(hasChannel ? { channel: { name: channel.name, description: channel.description } } : {}),
        }
      : undefined;

    const spanDetails: SpanDetails | undefined = (startTime || endTime)
      ? { startTime, endTime }
      : undefined;

    const scope = InferenceScope.start(request, details, agent, caller, spanDetails);
    this.setInputMessageTags(scope, turnContext);
    return scope;
  }

  /**
   * Create an `InvokeAgentScope` using `details` and values derived from the provided `TurnContext`.
   * Populates `conversationId` and `request.channel` (name/link) in `details` from the `TurnContext`, overriding any existing values.
   * Derives `callerAgentDetails` (from caller) and `callerDetails` (from user).
   * Also sets execution type and input messages from the context if present.
   * @param details The invoke-agent call details to be augmented and used for the scope.
   * @param turnContext The current activity context to derive scope parameters from.
   * @param authToken Auth token for resolving agent identity from token claims.
   * @param startTime Optional explicit start time (ms epoch, Date, or HrTime).
   * @param endTime Optional explicit end time (ms epoch, Date, or HrTime).
   * @param spanKind Optional span kind override. Defaults to `SpanKind.CLIENT`.
   * @returns A started `InvokeAgentScope` enriched with context-derived parameters.
   */
  static populateInvokeAgentScopeFromTurnContext(
    details: InvokeAgentDetails,
    turnContext: TurnContext,
    authToken: string,
    startTime?: TimeInput,
    endTime?: TimeInput,
    spanKind?: SpanKind
  ): InvokeAgentScope {
    const callerAgent = ScopeUtils.deriveCallerAgent(turnContext);
    const caller = ScopeUtils.deriveCallerDetails(turnContext);
    const conversationId = ScopeUtils.deriveConversationId(turnContext);
    const channel = ScopeUtils.deriveChannelObject(turnContext);

    // Merge agent identity from TurnContext into details.details
    const invokeAgentDetails = ScopeUtils.buildInvokeAgentDetailsCore(details, turnContext, authToken);

    // Build the request only when there is concrete channel or conversationId info
    const hasChannel = channel.name !== undefined || channel.description !== undefined;
    const request: AgentRequest | undefined = (conversationId || hasChannel)
      ? {
          conversationId,
          ...(hasChannel ? { channel: { name: channel.name, description: channel.description } } : {}),
        }
      : undefined;

    // Build caller info with both human caller and caller agent details
    const callerInfo: InvokeAgentCallerDetails = {
      callerDetails: caller,
      callerAgentDetails: callerAgent,
    };

    const spanDetailsObj: SpanDetails | undefined = (startTime || endTime || spanKind)
      ? { startTime, endTime, spanKind }
      : undefined;

    const scope = InvokeAgentScope.start(request, invokeAgentDetails, callerInfo, spanDetailsObj);
    this.setInputMessageTags(scope, turnContext);
    return scope;
  }

  /**
   * Build InvokeAgentDetails by merging provided details with agent info from the TurnContext.
   * @param details Base invoke-agent details to augment
   * @param turnContext Activity context
   * @param authToken Auth token for resolving agent identity from token claims.
   * @returns New InvokeAgentDetails with merged `details.details` (agent identity).
   */
  public static buildInvokeAgentDetails(details: InvokeAgentDetails, turnContext: TurnContext, authToken: string): InvokeAgentDetails {
    return ScopeUtils.buildInvokeAgentDetailsCore(details, turnContext, authToken);
  }

  private static buildInvokeAgentDetailsCore(details: InvokeAgentDetails, turnContext: TurnContext, authToken: string): InvokeAgentDetails {
    const agent = ScopeUtils.deriveAgentDetails(turnContext, authToken);
    const conversationId = ScopeUtils.deriveConversationId(turnContext);

    // Merge derived agent identity into details.details
    const mergedAgent: AgentDetails = {
      ...details.details,
      ...(agent ?? {}),
      conversationId: conversationId ?? details.details?.conversationId,
    };

    return {
      ...details,
      details: mergedAgent,
    };
  }

  /**
   * Create an `ExecuteToolScope` using `details` and values derived from the provided `TurnContext`.
   * Derives `conversationId` and `channel` (name/link) from context.
   * @param details The tool call details (name, type, args, call id, etc.).
   * @param turnContext The current activity context to derive scope parameters from.
   * @param authToken Auth token for resolving agent identity from token claims.
   * @param startTime Optional explicit start time (ms epoch, Date, or HrTime). Useful when recording a
   *        tool call after execution has already completed.
   * @param endTime Optional explicit end time (ms epoch, Date, or HrTime).
   * @param spanKind Optional span kind override. Defaults to `SpanKind.INTERNAL`.
   * @returns A started `ExecuteToolScope` enriched with context-derived parameters.
   */
  static populateExecuteToolScopeFromTurnContext(
    details: ToolCallDetails,
    turnContext: TurnContext,
    authToken: string,
    startTime?: TimeInput,
    endTime?: TimeInput,
    spanKind?: SpanKind
  ): ExecuteToolScope {
    const agent = ScopeUtils.deriveAgentDetails(turnContext, authToken);
    const caller = ScopeUtils.deriveCallerDetails(turnContext);
    const conversationId = ScopeUtils.deriveConversationId(turnContext);
    const channel = ScopeUtils.deriveChannelObject(turnContext);

    if (!agent) {
      throw new Error('populateExecuteToolScopeFromTurnContext: Missing agent details on TurnContext (recipient)');
    }

    const hasChannel = channel.name !== undefined || channel.description !== undefined;
    const request: ToolRequest | undefined = (conversationId || hasChannel)
      ? {
          conversationId,
          ...(hasChannel ? { channel: { name: channel.name, description: channel.description } } : {}),
        }
      : undefined;

    const spanDetailsObj: SpanDetails | undefined = (startTime || endTime || spanKind)
      ? { startTime, endTime, spanKind }
      : undefined;

    const scope = ExecuteToolScope.start(request, details, agent, caller, spanDetailsObj);
    return scope;
  }

}
