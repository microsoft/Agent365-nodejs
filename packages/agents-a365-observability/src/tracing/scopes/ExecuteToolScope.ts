// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { SpanKind, TimeInput } from '@opentelemetry/api';
import { OpenTelemetryScope } from './OpenTelemetryScope';
import { ToolCallDetails, AgentDetails, TenantDetails, SourceMetadata } from '../contracts';
import { ParentSpanRef } from '../context/parent-span-context';
import { OpenTelemetryConstants } from '../constants';

/**
 * Provides OpenTelemetry tracing scope for AI tool execution operations.
 */
export class ExecuteToolScope extends OpenTelemetryScope {
  /**
   * Creates and starts a new scope for tool execution tracing.
   * @param details The tool call details
   * @param agentDetails The agent details
   * @param tenantDetails The tenant details
   * @param conversationId Optional conversation id to tag on the span (`gen_ai.conversation.id`).
   * @param sourceMetadata Optional source metadata; only `name` (channel name) and `description` (channel link/URL) are used for tagging.
   * @param parentSpanRef Optional explicit parent span reference for cross-async-boundary tracing.
   * @param startTime Optional explicit start time (ms epoch, Date, or HrTime). Useful when recording a
   *        tool call after execution has already completed.
   * @param endTime Optional explicit end time (ms epoch, Date, or HrTime). When provided, the span will
   *        use this timestamp when disposed instead of the current wall-clock time.
   * @returns A new ExecuteToolScope instance.
   */
  public static start(
    details: ToolCallDetails,
    agentDetails: AgentDetails,
    tenantDetails: TenantDetails,
    conversationId?: string,
    sourceMetadata?: Pick<SourceMetadata, "name" | "description">,
    parentSpanRef?: ParentSpanRef,
    startTime?: TimeInput,
    endTime?: TimeInput
  ): ExecuteToolScope {
    return new ExecuteToolScope(details, agentDetails, tenantDetails, conversationId, sourceMetadata, parentSpanRef, startTime, endTime);
  }

  private constructor(
    details: ToolCallDetails,
    agentDetails: AgentDetails,
    tenantDetails: TenantDetails,
    conversationId?: string,
    sourceMetadata?: Pick<SourceMetadata, "name" | "description">,
    parentSpanRef?: ParentSpanRef,
    startTime?: TimeInput,
    endTime?: TimeInput
  ) {
    super(
      SpanKind.INTERNAL,
      OpenTelemetryConstants.EXECUTE_TOOL_OPERATION_NAME,
      `${OpenTelemetryConstants.EXECUTE_TOOL_OPERATION_NAME} ${details.toolName}`,
      agentDetails,
      tenantDetails,
      parentSpanRef,
      startTime,
      endTime
    );

    // Destructure the details object to match C# pattern
    const { toolName, arguments: args, toolCallId, description, toolType, endpoint } = details;

    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_TOOL_NAME_KEY, toolName);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_TOOL_ARGS_KEY, args);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_TOOL_TYPE_KEY, toolType);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_TOOL_CALL_ID_KEY, toolCallId);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_TOOL_DESCRIPTION_KEY, description);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, conversationId);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_NAME_KEY, sourceMetadata?.name);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_DESCRIPTION_KEY, sourceMetadata?.description);    


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
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_EVENT_CONTENT, response);
  }
}
