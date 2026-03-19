// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { SpanKind, TimeInput } from '@opentelemetry/api';
import { OpenTelemetryScope } from './OpenTelemetryScope';
import {
  InvokeAgentDetails,
  TenantDetails,
  CallerDetails,
  AgentDetails,
  AgentRequest
} from '../contracts';
import { ParentContext } from '../context/trace-context-propagation';
import { OpenTelemetryConstants } from '../constants';

/**
 * Provides OpenTelemetry tracing scope for AI agent invocation operations.
 */
export class InvokeAgentScope extends OpenTelemetryScope {
  /**
   * Creates and starts a new scope for agent invocation tracing.
   * @param invokeAgentDetails The details of the agent invocation (agent identity via `.details`, endpoint, sessionId).
   * @param tenantDetails The tenant details.
   * @param request Optional request payload (content, executionType, channel).
   * @param callerAgentDetails The details of the caller agent.
   * @param callerDetails The details of the non-agentic caller.
   * @param conversationId Optional conversation id to tag on the span (`gen_ai.conversation.id`).
   * @param parentContext Optional parent context for cross-async-boundary tracing.
   *   Accepts a ParentSpanRef (manual traceId/spanId) or an OTel Context (e.g. from extractTraceContext).
   * @param startTime Optional explicit start time (ms epoch, Date, or HrTime).
   * @param endTime Optional explicit end time (ms epoch, Date, or HrTime).
   * @param spanKind Optional span kind override. Defaults to `SpanKind.CLIENT`.
   *   Use `SpanKind.SERVER` when the agent is receiving an inbound request.
   * @returns A new InvokeAgentScope instance.
   */
  public static start(
    invokeAgentDetails: InvokeAgentDetails,
    tenantDetails: TenantDetails,
    request?: AgentRequest,
    callerAgentDetails?: AgentDetails,
    callerDetails?: CallerDetails,
    conversationId?: string,
    parentContext?: ParentContext,
    startTime?: TimeInput,
    endTime?: TimeInput,
    spanKind?: SpanKind
  ): InvokeAgentScope {
    return new InvokeAgentScope(invokeAgentDetails, tenantDetails, request, callerAgentDetails, callerDetails, conversationId, parentContext, startTime, endTime, spanKind);
  }

  private constructor(
    invokeAgentDetails: InvokeAgentDetails,
    tenantDetails: TenantDetails,
    request?: AgentRequest,
    callerAgentDetails?: AgentDetails,
    callerDetails?: CallerDetails,
    conversationId?: string,
    parentContext?: ParentContext,
    startTime?: TimeInput,
    endTime?: TimeInput,
    spanKind?: SpanKind
  ) {
    const agent = invokeAgentDetails.details;

    super(
      spanKind ?? SpanKind.CLIENT,
      OpenTelemetryConstants.INVOKE_AGENT_OPERATION_NAME,
      agent.agentName
        ? `${OpenTelemetryConstants.INVOKE_AGENT_OPERATION_NAME} ${agent.agentName}`
        : OpenTelemetryConstants.INVOKE_AGENT_OPERATION_NAME,
      agent,
      tenantDetails,
      parentContext,
      startTime,
      endTime,
      callerDetails
    );

    // Set provider name from agent details
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_PROVIDER_NAME_KEY, agent.providerName);

    // Set session ID and endpoint information
    this.setTagMaybe(OpenTelemetryConstants.SESSION_ID_KEY, invokeAgentDetails.sessionId);

    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_BLUEPRINT_ID_KEY, agent.agentBlueprintId);

    if (invokeAgentDetails.endpoint) {
      this.setTagMaybe(OpenTelemetryConstants.SERVER_ADDRESS_KEY, invokeAgentDetails.endpoint.host);

      // Only record port if it is different from 443 (default HTTPS port)
      if (invokeAgentDetails.endpoint.port && invokeAgentDetails.endpoint.port !== 443) {
        this.setTagMaybe(OpenTelemetryConstants.SERVER_PORT_KEY, invokeAgentDetails.endpoint.port);
      }
    }

    // Set channel tags from request (aligned with .NET/Python: channel lives inside request)
    if (request?.channel) {
      this.setTagMaybe(OpenTelemetryConstants.CHANNEL_NAME_KEY, request.channel.name);
      this.setTagMaybe(OpenTelemetryConstants.CHANNEL_LINK_KEY, request.channel.description);
    }

    // Use explicit conversationId param, falling back to agent.conversationId
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, conversationId ?? agent.conversationId);

    // Set caller agent details tags
    if (callerAgentDetails) {
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_NAME_KEY, callerAgentDetails.agentName);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_ID_KEY, callerAgentDetails.agentId);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_APPLICATION_ID_KEY, callerAgentDetails.agentBlueprintId);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_USER_ID_KEY, callerAgentDetails.agentAUID);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_UPN_KEY, callerAgentDetails.agentUPN);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_PLATFORM_ID_KEY, callerAgentDetails.platformId);
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
