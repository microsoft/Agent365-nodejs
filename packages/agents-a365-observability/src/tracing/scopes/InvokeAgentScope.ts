// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { SpanKind } from '@opentelemetry/api';
import { OpenTelemetryScope } from './OpenTelemetryScope';
import {
  InvokeAgentDetails,
  CallerDetails,
  Request,
  SpanDetails,
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
   * @param invokeAgentDetails The details of the agent invocation (agent identity via `.details`, endpoint).
   *   Tenant ID is derived from `invokeAgentDetails.details.tenantId`.
   * @param callerDetails Optional caller information. Supports three scenarios:
   *   - Human caller only: `{ userDetails: { callerId, callerName, ... } }`
   *   - Agent caller only: `{ callerAgentDetails: { agentId, agentName, ... } }`
   *   - Both (A2A with human in chain): `{ userDetails: { ... }, callerAgentDetails: { ... } }`
   * @param spanDetails Optional span configuration (parentContext, startTime, endTime, spanKind).
   * @returns A new InvokeAgentScope instance.
   */
  public static start(
    request: Request,
    invokeAgentDetails: InvokeAgentDetails,
    callerDetails?: CallerDetails,
    spanDetails?: SpanDetails
  ): InvokeAgentScope {
    return new InvokeAgentScope(request, invokeAgentDetails, callerDetails, spanDetails);
  }

  private constructor(
    request: Request,
    invokeAgentDetails: InvokeAgentDetails,
    callerDetails?: CallerDetails,
    spanDetails?: SpanDetails
  ) {
    const agent = invokeAgentDetails.details;
    if (!agent) {
      throw new Error('InvokeAgentScope: details is required on invokeAgentDetails');
    }

    // Derive tenant details from agent.tenantId (required for telemetry)
    if (!agent.tenantId) {
      throw new Error('InvokeAgentScope: tenantId is required on invokeAgentDetails.details');
    }
    const tenantDetails = { tenantId: agent.tenantId };

    super(
      spanDetails?.spanKind ?? SpanKind.CLIENT,
      OpenTelemetryConstants.INVOKE_AGENT_OPERATION_NAME,
      agent.agentName
        ? `${OpenTelemetryConstants.INVOKE_AGENT_OPERATION_NAME} ${agent.agentName}`
        : OpenTelemetryConstants.INVOKE_AGENT_OPERATION_NAME,
      agent,
      tenantDetails,
      spanDetails?.parentContext,
      spanDetails?.startTime,
      spanDetails?.endTime,
      callerDetails?.userDetails
    );

    // Set provider name from agent details
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_PROVIDER_NAME_KEY, agent.providerName);

    // Set session ID
    this.setTagMaybe(OpenTelemetryConstants.SESSION_ID_KEY, invokeAgentDetails.sessionId);

    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_BLUEPRINT_ID_KEY, agent.agentBlueprintId);

    if (invokeAgentDetails.endpoint) {
      this.setTagMaybe(OpenTelemetryConstants.SERVER_ADDRESS_KEY, invokeAgentDetails.endpoint.host);

      // Only record port if it is different from 443 (default HTTPS port)
      if (invokeAgentDetails.endpoint.port && invokeAgentDetails.endpoint.port !== 443) {
        this.setTagMaybe(OpenTelemetryConstants.SERVER_PORT_KEY, invokeAgentDetails.endpoint.port);
      }
    }

    // Set channel tags from request
    if (request?.channel) {
      this.setTagMaybe(OpenTelemetryConstants.CHANNEL_NAME_KEY, request.channel.name);
      this.setTagMaybe(OpenTelemetryConstants.CHANNEL_LINK_KEY, request.channel.description);
    }

    // Use explicit conversationId from request, falling back to agent.conversationId
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, request?.conversationId ?? agent.conversationId);

    // Set caller agent details tags for A2A scenarios
    const callerAgent = callerDetails?.callerAgentDetails;
    if (callerAgent) {
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_NAME_KEY, callerAgent.agentName);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_ID_KEY, callerAgent.agentId);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_APPLICATION_ID_KEY, callerAgent.agentBlueprintId);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_USER_ID_KEY, callerAgent.agentAUID);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_UPN_KEY, callerAgent.agentUPN);
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
