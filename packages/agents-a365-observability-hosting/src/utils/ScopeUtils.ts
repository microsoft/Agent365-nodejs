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
  UserDetails,
  CallerDetails,
  InferenceDetails,
  InvokeAgentScopeDetails,
  ToolCallDetails,
  Request,
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
   * Derive human caller identity details (id, upn, name, tenant) from the activity from.
   * @param turnContext Activity context
   * @returns User details when available; otherwise undefined.
   */
  public static deriveCallerDetails(turnContext: TurnContext): UserDetails | undefined {
    const from = turnContext?.activity?.from;
    if (!from) return undefined;
    return {
      callerId: from.aadObjectId,
      callerUpn: from.agenticUserId,
      callerName: from.name,
      tenantId: from.tenantId,
    } as UserDetails;
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
    const request: Request = {
      conversationId,
      ...(hasChannel ? { channel: { name: channel.name, description: channel.description } } : {}),
    };

    const spanDetails: SpanDetails | undefined = (startTime || endTime)
      ? { startTime, endTime }
      : undefined;

    const scope = InferenceScope.start(request, details, agent, caller, spanDetails);
    this.setInputMessageTags(scope, turnContext);
    return scope;
  }

  /**
   * Create an `InvokeAgentScope` using `details` and values derived from the provided `TurnContext`.
   * Builds a separate `Request` with `conversationId` and `channel` from context.
   * Derives agent identity from context, caller details (agent and human).
   * Also records input messages from the context if present.
   * @param scopeDetails The invoke-agent scope details (endpoint).
   * @param turnContext The current activity context to derive scope parameters from.
   * @param authToken Auth token for resolving agent identity from token claims.
   * @param startTime Optional explicit start time (ms epoch, Date, or HrTime).
   * @param endTime Optional explicit end time (ms epoch, Date, or HrTime).
   * @param spanKind Optional span kind override. Defaults to `SpanKind.CLIENT`.
   * @returns A started `InvokeAgentScope` enriched with context-derived parameters.
   */
  static populateInvokeAgentScopeFromTurnContext(
    scopeDetails: InvokeAgentScopeDetails,
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

    // Derive agent identity from TurnContext
    const agentDetails = ScopeUtils.deriveAgentDetails(turnContext, authToken);
    if (!agentDetails) {
      throw new Error('populateInvokeAgentScopeFromTurnContext: Missing agent details on TurnContext (recipient)');
    }
    // Merge conversationId from context
    agentDetails.conversationId = conversationId ?? agentDetails.conversationId;

    // Build the request with channel and conversationId from context
    const hasChannel = channel.name !== undefined || channel.description !== undefined;
    const request: Request = {
      conversationId,
      ...(hasChannel ? { channel: { name: channel.name, description: channel.description } } : {}),
    };

    // Build caller info with both human caller and caller agent details
    const callerDetails: CallerDetails = {
      userDetails: caller,
      callerAgentDetails: callerAgent,
    };

    const spanDetailsObj: SpanDetails | undefined = (startTime || endTime || spanKind)
      ? { startTime, endTime, spanKind }
      : undefined;

    const scope = InvokeAgentScope.start(request, scopeDetails, agentDetails, callerDetails, spanDetailsObj);
    this.setInputMessageTags(scope, turnContext);
    return scope;
  }

  /**
   * Derive agent details from the TurnContext, merging with conversationId.
   * @param turnContext Activity context
   * @param authToken Auth token for resolving agent identity from token claims.
   * @returns Merged AgentDetails.
   */
  public static buildAgentDetailsFromContext(turnContext: TurnContext, authToken: string): AgentDetails | undefined {
    const agent = ScopeUtils.deriveAgentDetails(turnContext, authToken);
    if (!agent) return undefined;
    const conversationId = ScopeUtils.deriveConversationId(turnContext);
    agent.conversationId = conversationId ?? agent.conversationId;
    return agent;
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
    const request: Request = {
      conversationId,
      ...(hasChannel ? { channel: { name: channel.name, description: channel.description } } : {}),
    };

    const spanDetailsObj: SpanDetails | undefined = (startTime || endTime || spanKind)
      ? { startTime, endTime, spanKind }
      : undefined;

    const scope = ExecuteToolScope.start(request, details, agent, caller, spanDetailsObj);
    return scope;
  }

}
