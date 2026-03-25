// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { SpanKind } from '@opentelemetry/api';
import { OpenTelemetryScope } from './OpenTelemetryScope';
import {
  InvokeAgentScopeDetails,
  CallerDetails,
  Request,
  SpanDetails,
  AgentDetails,
} from '../contracts';
import { OpenTelemetryConstants } from '../constants';

/**
 * Provides OpenTelemetry tracing scope for AI agent invocation operations.
 */
export class InvokeAgentScope extends OpenTelemetryScope {
  /**
   * Creates and starts a new scope for agent invocation tracing.
   *
   * @param request Request payload (channel, conversationId, content, sessionId).
   * @param invokeScopeDetails Scope-level details
   * @param agentDetails The agent identity. Tenant ID is derived from `agentDetails.tenantId` (required).
   * @param callerDetails Optional caller information. Supports three scenarios:
   *   - Human caller only: `{ userDetails: { userId, userName, ... } }`
   *   - Agent caller only: `{ callerAgentDetails: { agentId, agentName, ... } }`
   *   - Both (A2A with human in chain): `{ userDetails: { ... }, callerAgentDetails: { ... } }`
   * @param spanDetails Optional span configuration (parentContext, startTime, endTime, spanKind).
   * @returns A new InvokeAgentScope instance.
   */
  public static start(
    request: Request,
    invokeScopeDetails: InvokeAgentScopeDetails,
    agentDetails: AgentDetails,
    callerDetails?: CallerDetails,
    spanDetails?: SpanDetails,
  ): InvokeAgentScope {
    return new InvokeAgentScope(request, invokeScopeDetails, agentDetails, callerDetails, spanDetails);
  }

  private constructor(
    request: Request,
    invokeScopeDetails: InvokeAgentScopeDetails,
    agentDetails: AgentDetails,
    callerDetails?: CallerDetails,
    spanDetails?: SpanDetails
  ) {
    // Validate tenantId is present (required for telemetry)
    if (!agentDetails.tenantId) {
      throw new Error('InvokeAgentScope: tenantId is required on agentDetails');
    }

    super(
      spanDetails?.spanKind ?? SpanKind.CLIENT,
      OpenTelemetryConstants.INVOKE_AGENT_OPERATION_NAME,
      agentDetails.agentName
        ? `${OpenTelemetryConstants.INVOKE_AGENT_OPERATION_NAME} ${agentDetails.agentName}`
        : OpenTelemetryConstants.INVOKE_AGENT_OPERATION_NAME,
      agentDetails,
      spanDetails?.parentContext,
      spanDetails?.startTime,
      spanDetails?.endTime,
      callerDetails?.userDetails
    );

    // Set provider name from agent details
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_PROVIDER_NAME_KEY, agentDetails.providerName);

    // Set session ID from request
    this.setTagMaybe(OpenTelemetryConstants.SESSION_ID_KEY, request.sessionId);

    if (invokeScopeDetails.endpoint) {
      this.setTagMaybe(OpenTelemetryConstants.SERVER_ADDRESS_KEY, invokeScopeDetails.endpoint.host);

      // Only record port if it is different from 443 (default HTTPS port)
      if (invokeScopeDetails.endpoint.port && invokeScopeDetails.endpoint.port !== 443) {
        this.setTagMaybe(OpenTelemetryConstants.SERVER_PORT_KEY, invokeScopeDetails.endpoint.port);
      }
    }

    // Set channel tags from request
    if (request.channel) {
      this.setTagMaybe(OpenTelemetryConstants.CHANNEL_NAME_KEY, request.channel.name);
      this.setTagMaybe(OpenTelemetryConstants.CHANNEL_LINK_KEY, request.channel.description);
    }

    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, request.conversationId);

    // Set caller agent details tags for A2A scenarios
    const callerAgent = callerDetails?.callerAgentDetails;
    if (callerAgent) {
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_NAME_KEY, callerAgent.agentName);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_ID_KEY, callerAgent.agentId);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_APPLICATION_ID_KEY, callerAgent.agentBlueprintId);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_USER_ID_KEY, callerAgent.agentAUID);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_EMAIL_KEY, callerAgent.agentEmail);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_PLATFORM_ID_KEY, callerAgent.platformId);
    }
  }

  /**
   * Records response information for telemetry tracking.
   * @param response The invocation response
   */
  public recordResponse(response: string): void {
    this.recordOutputMessages([response]);
  }

  /**
   * Records the input messages for telemetry tracking.
   * @param messages Array of input messages
   */
  public recordInputMessages(messages: string[]): void {
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY, JSON.stringify(messages));
  }

  /**
   * Records the output messages for telemetry tracking.
   * @param messages Array of output messages
   */
  public recordOutputMessages(messages: string[]): void {
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY, JSON.stringify(messages));
  }
}
