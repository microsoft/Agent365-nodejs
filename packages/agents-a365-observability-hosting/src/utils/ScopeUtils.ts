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
  ToolCallDetails,
  Request,
  SpanDetails,
  InvokeAgentScopeDetails,
  InvocationRole,
  ResolvedInvocationIdentity,
  getResolvedInvocationIdentity,
} from '@microsoft/agents-a365-observability';
import { resolveEmbodiedAgentIds } from './TurnContextUtils';

function hasNonBlankValue(value: unknown): boolean {
  return typeof value === 'string'
    ? value.trim().length > 0
    : value !== null && value !== undefined;
}

function mergeResolvedAgentDetails(
  resolved: AgentDetails | undefined,
  explicit: AgentDetails,
): AgentDetails {
  const merged = { ...(resolved ?? {}) } as Record<string, unknown>;

  for (const [key, value] of Object.entries(explicit)) {
    if (hasNonBlankValue(value)) {
      merged[key] = value;
    }
  }

  return merged as unknown as AgentDetails;
}

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
   * Derive target agent details from the activity recipient.
   * Uses {@link resolveEmbodiedAgentIds} to resolve the agent ID and blueprint ID, which are only
   * set for embodied (agentic) agents — see that function for the rationale.
   * @param turnContext Activity context
   * @param authToken Auth token for resolving agent identity from token claims.
   * @returns Agent details built from recipient properties; otherwise undefined.
   */
  public static deriveAgentDetails(turnContext: TurnContext, authToken: string): AgentDetails | undefined {
    const resolvedIdentity = getResolvedInvocationIdentity();
    if (resolvedIdentity) {
      return ScopeUtils.deriveResolvedAgentDetails(turnContext, resolvedIdentity);
    }

    const recipient = turnContext?.activity?.recipient;
    if (!recipient) return undefined;
    const { agentId, agentBlueprintId } = resolveEmbodiedAgentIds(turnContext, authToken);
    return {
      agentId,
      agentName: recipient.name,
      agentAUID: recipient.aadObjectId,
      agentBlueprintId,
      agentEmail: turnContext?.activity?.getAgenticUser?.(),
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
    const resolvedIdentity = getResolvedInvocationIdentity();
    if (resolvedIdentity) {
      const hasCallerAgent = resolvedIdentity.callerAgentUserOid
        || resolvedIdentity.callerAgentBlueprintId
        || resolvedIdentity.callerAgentInstanceId;
      if (!hasCallerAgent) {
        return undefined;
      }

      const from = turnContext?.activity?.from;
      return {
        agentId: resolvedIdentity.callerAgentInstanceId,
        agentAUID: resolvedIdentity.callerAgentUserOid,
        agentBlueprintId: resolvedIdentity.callerAgentBlueprintId,
        agentName: from?.name,
        agentDescription: from?.role,
        agentEmail: from?.agenticUserId,
        tenantId: resolvedIdentity.tenantId,
      } as AgentDetails;
    }

    const from = turnContext?.activity?.from;
    if (!from) return undefined;
    return {
      agentBlueprintId: from.agenticAppBlueprintId,
      agentName: from.name,
      agentAUID: from.aadObjectId,
      agentDescription: from.role,
      tenantId: from.tenantId,
      agentId: from.agenticAppId,
      agentEmail: from.agenticUserId
    } as AgentDetails;
  }


  /**
   * Derive caller identity details (id, email, name, tenant) from the activity from.
   * @param turnContext Activity context
   * @returns User details when available; otherwise undefined.
   */
  public static deriveCallerDetails(turnContext: TurnContext): UserDetails | undefined {
    const resolvedIdentity = getResolvedInvocationIdentity();
    if (resolvedIdentity) {
      if (!resolvedIdentity.humanOid) {
        return undefined;
      }

      const from = turnContext?.activity?.from;
      return {
        userId: resolvedIdentity.humanOid,
        userName: resolvedIdentity.role === InvocationRole.Human ? from?.name : undefined,
        tenantId: resolvedIdentity.tenantId,
      };
    }

    const from = turnContext?.activity?.from;
    if (!from) return undefined;
    return {
      userId: from.aadObjectId,
      userEmail: from.agenticUserId,
      userName: from.name,
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
   * Merges agent identity from context into `details` via `buildInvokeAgentDetailsCore`.
   * Derives `callerAgentDetails` (from caller) and `userDetails` (human caller).
   * Also records input messages from the context if present.
   * @param details The agent details to be augmented with context-derived identity.
   * @param turnContext The current activity context to derive scope parameters from.
   * @param authToken Auth token for resolving agent identity from token claims.
   * @param startTime Optional explicit start time (ms epoch, Date, or HrTime).
   * @param endTime Optional explicit end time (ms epoch, Date, or HrTime).
   * @param spanKind Optional span kind override. Defaults to `SpanKind.CLIENT`.
   * @returns A started `InvokeAgentScope` enriched with context-derived parameters.
   */
  static populateInvokeAgentScopeFromTurnContext(
    details: AgentDetails,
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

    // Merge agent identity from TurnContext into details.details
    const agentDetails = ScopeUtils.buildInvokeAgentDetailsCore(details, turnContext, authToken);

    // Build the request with channel and conversationId from context
    const hasChannel = channel.name !== undefined || channel.description !== undefined;
    const request: Request = {
      conversationId,
      ...(hasChannel ? { channel: { name: channel.name, description: channel.description } } : {}),
    };

    // Build caller info with both human caller and caller agent details
    const callerDetails: CallerDetails | undefined =
      getResolvedInvocationIdentity() && !caller && !callerAgent
        ? undefined
        : {
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
   * Build agent details by merging provided details with agent info from the TurnContext.
   * @param details Base agent details to augment
   * @param turnContext Activity context
   * @param authToken Auth token for resolving agent identity from token claims.
   * @returns Merged AgentDetails with context-derived identity.
   */
  public static buildInvokeAgentDetails(details: AgentDetails, turnContext: TurnContext, authToken: string): AgentDetails {
    return ScopeUtils.buildInvokeAgentDetailsCore(details, turnContext, authToken);
  }

  private static buildInvokeAgentDetailsCore(details: AgentDetails, turnContext: TurnContext, authToken: string): AgentDetails {
    const derivedAgentDetails = ScopeUtils.deriveAgentDetails(turnContext, authToken);

    if (getResolvedInvocationIdentity()) {
      return mergeResolvedAgentDetails(derivedAgentDetails, details);
    }

    // Merge derived agent identity into details
    const mergedAgent: AgentDetails = {
      ...details,
      ...(derivedAgentDetails ?? {}),
    };

    return mergedAgent;
  }

  private static deriveResolvedAgentDetails(
    turnContext: TurnContext,
    identity: ResolvedInvocationIdentity,
  ): AgentDetails | undefined {
    const recipient = turnContext?.activity?.recipient;
    const hasResolvedTarget = identity.targetAgentId
      || identity.targetAgentAuid
      || identity.targetAgentBlueprintId
      || identity.tenantId;

    if (!recipient && !hasResolvedTarget) {
      return undefined;
    }

    return {
      agentId: identity.targetAgentId,
      agentName: recipient?.name,
      agentAUID: identity.targetAgentAuid,
      agentBlueprintId: identity.targetAgentBlueprintId,
      agentEmail: recipient?.agenticUserId,
      agentDescription: recipient?.role,
      tenantId: identity.tenantId,
    } as AgentDetails;
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
