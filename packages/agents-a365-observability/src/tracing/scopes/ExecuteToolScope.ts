// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { SpanKind } from '@opentelemetry/api';
import { OpenTelemetryScope } from './OpenTelemetryScope';
import {
  ToolCallDetails,
  AgentDetails,
  UserDetails,
  Request,
  SpanDetails,
} from '../contracts';
import { OpenTelemetryConstants } from '../constants';

/**
 * Provides OpenTelemetry tracing scope for AI tool execution operations.
 */
export class ExecuteToolScope extends OpenTelemetryScope {
  /**
   * Creates and starts a new scope for tool execution tracing.
   *
   * @param details The tool call details (name, type, args, call id, etc.).
   * @param agentDetails The agent executing the tool. Tenant ID is derived from `agentDetails.tenantId`.
   * @param request Optional request context (conversationId, channel).
   * @param userDetails Optional human caller identity.
   * @param spanDetails Optional span configuration (parentContext, startTime, endTime, spanKind).
   * @returns A new ExecuteToolScope instance.
   */
  public static start(
    details: ToolCallDetails,
    agentDetails: AgentDetails,
    request?: Request,
    userDetails?: UserDetails,
    spanDetails?: SpanDetails
  ): ExecuteToolScope {
    return new ExecuteToolScope(details, agentDetails, request, userDetails, spanDetails);
  }

  private constructor(
    details: ToolCallDetails,
    agentDetails: AgentDetails,
    request?: Request,
    userDetails?: UserDetails,
    spanDetails?: SpanDetails
  ) {
    // Derive tenant details from agentDetails.tenantId (required for telemetry)
    if (!agentDetails.tenantId) {
      throw new Error('ExecuteToolScope: tenantId is required on agentDetails');
    }
    const tenantDetails = { tenantId: agentDetails.tenantId };

    super(
      spanDetails?.spanKind ?? SpanKind.INTERNAL,
      OpenTelemetryConstants.EXECUTE_TOOL_OPERATION_NAME,
      `${OpenTelemetryConstants.EXECUTE_TOOL_OPERATION_NAME} ${details.toolName}`,
      agentDetails,
      tenantDetails,
      spanDetails?.parentContext,
      spanDetails?.startTime,
      spanDetails?.endTime,
      userDetails
    );

    // Destructure the details object
    const { toolName, arguments: args, toolCallId, description, toolType, endpoint } = details;

    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_TOOL_NAME_KEY, toolName);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_TOOL_ARGS_KEY, args);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_TOOL_TYPE_KEY, toolType);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_TOOL_CALL_ID_KEY, toolCallId);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_TOOL_DESCRIPTION_KEY, description);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, request?.conversationId);
    this.setTagMaybe(OpenTelemetryConstants.CHANNEL_NAME_KEY, request?.channel?.name);
    this.setTagMaybe(OpenTelemetryConstants.CHANNEL_LINK_KEY, request?.channel?.description);

    // Set endpoint information if provided
    if (endpoint) {
      this.setTagMaybe(OpenTelemetryConstants.SERVER_ADDRESS_KEY, endpoint.host);

      // Only record port if it is different from 443 (default HTTPS port)
      if (endpoint.port && endpoint.port !== 443) {
        this.setTagMaybe(OpenTelemetryConstants.SERVER_PORT_KEY, endpoint.port);
      }
    }
  }

  /**
   * Records response information for telemetry tracking.
   * @param response The tool execution response
   */
  public recordResponse(response: string): void {
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_TOOL_CALL_RESULT_KEY, response);
  }
}
