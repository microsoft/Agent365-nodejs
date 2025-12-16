// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { TurnContext } from '@microsoft/agents-hosting';
import {
  InvokeAgentScope,
  InferenceScope,
  ExecuteToolScope,
  AgentDetails,
  TenantDetails,
  CallerDetails,
  InferenceDetails,
  InvokeAgentDetails,
  ToolCallDetails,
  ExecutionType
} from '@microsoft/agents-a365-observability';
import {
  getExecutionTypePair,
} from './TurnContextUtils';

/**
 * Unified utilities to populate scope tags from a TurnContext.
 * Provides common tag population and scope-specific helpers.
 */
export class ScopeUtils {


  private static setInputMessageTags(scope: InvokeAgentScope | InferenceScope, turnContext: TurnContext): InvokeAgentScope | InferenceScope {
    if (turnContext?.activity?.text) {
      scope.recordInputMessages([turnContext.activity.text]);
    }
    return scope;
  }
  
  // ----------------------
  // Context-derived helpers
  // ----------------------
  /**
   * Derive tenant details from the TurnContext (recipient preferred, fallback to from).
   * @param turnContext Activity context
   * @returns Tenant details if a tenant id is present; otherwise undefined.
   */
  public static deriveTenantDetails(turnContext: TurnContext): TenantDetails | undefined {
    const tenantId = turnContext?.activity?.recipient?.tenantId
      ?? turnContext?.activity?.from?.tenantId;
    return tenantId ? { tenantId } : undefined;
  }

  /**
   * Derive target agent details from the activity recipient.
   * @param turnContext Activity context
   * @returns Agent details built from recipient properties; otherwise undefined.
   */
  public static deriveAgentDetailsFromRecipient(turnContext: TurnContext): AgentDetails | undefined {
    const r = turnContext?.activity?.recipient;
    if (!r) return undefined;
    return {
      agentId: r.agenticAppId,
      agentName: r.name,
      agentAUID: r.aadObjectId,
      agentDescription: r.role,
      tenantId: r.tenantId
    } as AgentDetails;
  }

  
  /**
   * Derive caller agent details from the activity from.
   * @param turnContext Activity context
   * @returns Agent details built from caller (from) properties; otherwise undefined.
   */
  public static deriveCallerAgent(turnContext: TurnContext): AgentDetails | undefined {
    const f = turnContext?.activity?.from;
    if (!f) return undefined;
    return {
      agentBlueprintId: f.agenticAppBlueprintId,
      agentName: f.name,
      agentAUID: f.aadObjectId,
      agentDescription: f.role,
      tenantId: f.tenantId,
      agentId: f.agenticAppId
    } as AgentDetails;
  }


  /**
   * Derive caller identity details (id, upn, name, tenant, client ip) from the activity from.
   * @param turnContext Activity context
   * @returns Caller details when available; otherwise undefined.
   */
  public static deriveCallerDetails(turnContext: TurnContext): CallerDetails | undefined {
    const f = turnContext?.activity?.from;
    if (!f) return undefined;
    return {
      callerId: f.aadObjectId,
      callerUpn: f.agenticUserId,
      callerName: f.name,
      tenantId: f.tenantId,
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
   * Derive source metadata (channel name and description/link) from the TurnContext.
   * @param turnContext Activity context
   * @returns Object with optional name and description fields.
   */
  public static deriveSourceMetadataObject(turnContext: TurnContext): { name?: string; description?: string } {
    return {
      name: turnContext?.activity?.channelId,
      description: turnContext?.activity?.channelIdSubChannel as string | undefined
    };
  }

  /**
   * Create an `InferenceScope` using `details` and values derived from the provided `TurnContext`.
   * Derives `agentDetails`, `tenantDetails`, `conversationId`, and `sourceMetadata` (channel name/link) from context.
   * Also records input messages from the context if present.
   * @param details The inference call details (model, provider, tokens, etc.).
   * @param turnContext The current activity context to derive scope parameters from.
   * @returns A started `InferenceScope` enriched with context-derived parameters.
   */
  static populateInferenceScopeFromTurnContext(
    details: InferenceDetails,
    turnContext: TurnContext
  ): InferenceScope {
    /**
     * Create and start an InferenceScope with context-derived agent, tenant, conversation id and source metadata.
     * Also records input messages when present.
     * @param details Inference call details
     * @param turnContext Activity context
     * @returns Started InferenceScope enriched with context.
     */
    const agent = ScopeUtils.deriveAgentDetailsFromRecipient(turnContext);
    const tenant = ScopeUtils.deriveTenantDetails(turnContext);
    const conversationId = ScopeUtils.deriveConversationId(turnContext);
    const sourceMetadata = ScopeUtils.deriveSourceMetadataObject(turnContext);

    const scope = InferenceScope.start(details, agent!, tenant!, conversationId, sourceMetadata);
    this.setInputMessageTags(scope, turnContext);
    return scope;
  }

  /**
   * Create an `InvokeAgentScope` using `details` and values derived from the provided `TurnContext`.
   * Augments `details` with `conversationId` and `request.sourceMetadata` (channel name/link).
   * Derives `tenantDetails`, `callerAgentDetails` (from recipient), and `callerDetails` (from from-user).
   * Overrides `conversationId` and `request.sourceMetadata` (channel name/link) in `details` using context values.
   * Also sets execution type and input messages from the context if present.
   * @param details The invoke-agent call details to be augmented and used for the scope.
   * @param turnContext The current activity context to derive scope parameters from.
   * @returns A started `InvokeAgentScope` enriched with context-derived parameters.
   */
  static populateInvokeAgentScopeFromTurnContext(
    details: InvokeAgentDetails,
    turnContext: TurnContext
  ): InvokeAgentScope {
    /**
     * Create and start an InvokeAgentScope using details combined with context-derived values.
     * Augments details.conversationId and details.request.sourceMetadata, then records input messages.
     * @param details Invoke-agent call details
     * @param turnContext Activity context
     * @returns Started InvokeAgentScope enriched with context.
     */
    const tenant = ScopeUtils.deriveTenantDetails(turnContext);
    const callerAgent = ScopeUtils.deriveCallerAgent(turnContext);
    const caller = ScopeUtils.deriveCallerDetails(turnContext);
    const invokeAgentDetails = ScopeUtils.buildInvokeAgentDetails(details, turnContext);

    const scope = InvokeAgentScope.start(invokeAgentDetails, tenant!, callerAgent, caller);
    this.setInputMessageTags(scope, turnContext);
    return scope;
  }

  /**
   * Build InvokeAgentDetails by merging provided details with agent info, conversation id and source metadata from the TurnContext.
   * @param details Base invoke-agent details to augment
   * @param turnContext Activity context
   * @returns New InvokeAgentDetails suitable for starting an InvokeAgentScope.
   */
  public static buildInvokeAgentDetails(details: InvokeAgentDetails, turnContext: TurnContext): InvokeAgentDetails {
    const agent = ScopeUtils.deriveAgentDetailsFromRecipient(turnContext);
    const srcMeta = ScopeUtils.deriveSourceMetadataObject(turnContext);
    const executionTypePair = getExecutionTypePair(turnContext);
    return {
      ...details,
      ...agent,
      conversationId: ScopeUtils.deriveConversationId(turnContext),
      request: {
        ...details.request,
        executionType: executionTypePair.length > 0 ? (executionTypePair[0][1] as ExecutionType) : details.request?.executionType, 
        sourceMetadata: { id: details.request?.sourceMetadata?.id, ...srcMeta }
      }
    };
  }

  /**
   * Create an `ExecuteToolScope` using `details` and values derived from the provided `TurnContext`.
   * Derives `agentDetails`, `tenantDetails`, `conversationId`, and `sourceMetadata` (channel name/link) from context.
   * @param details The tool call details (name, type, args, call id, etc.).
   * @param turnContext The current activity context to derive scope parameters from.
   * @returns A started `ExecuteToolScope` enriched with context-derived parameters.
   */
  static populateExecuteToolScopeFromTurnContext(
    details: ToolCallDetails,
    turnContext: TurnContext
  ): ExecuteToolScope {
    /**
     * Create and start an ExecuteToolScope with context-derived agent, tenant, conversation id and source metadata.
     * @param details Tool call details
     * @param turnContext Activity context
     * @returns Started ExecuteToolScope enriched with context.
     */
    const agent = ScopeUtils.deriveAgentDetailsFromRecipient(turnContext);
    const tenant = ScopeUtils.deriveTenantDetails(turnContext);
    const conversationId = ScopeUtils.deriveConversationId(turnContext);
    const sourceMetadata = ScopeUtils.deriveSourceMetadataObject(turnContext);
    const scope = ExecuteToolScope.start(details, agent!, tenant!, conversationId, sourceMetadata);
    return scope;
  }
}
