// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { SpanKind } from '@opentelemetry/api';
import { OpenTelemetryScope } from './OpenTelemetryScope';
import { ToolCallDetails, AgentDetails, TenantDetails } from '../contracts';
import { OpenTelemetryConstants } from '../constants';

/**
 * Provides OpenTelemetry tracing scope for AI tool execution operations
 */
export class ExecuteToolScope extends OpenTelemetryScope {
  /**
   * Creates and starts a new scope for tool execution tracing
   * @param details The tool call details
   * @param agentDetails The agent details
   * @param tenantDetails The tenant details
   * @returns A new scope instance
   */
  public static start(details: ToolCallDetails, agentDetails: AgentDetails, tenantDetails: TenantDetails): ExecuteToolScope {
    return new ExecuteToolScope(details, agentDetails, tenantDetails);
  }

  private constructor(details: ToolCallDetails, agentDetails: AgentDetails, tenantDetails: TenantDetails) {
    super(
      SpanKind.INTERNAL,
      OpenTelemetryConstants.EXECUTE_TOOL_OPERATION_NAME,
      `${OpenTelemetryConstants.EXECUTE_TOOL_OPERATION_NAME} ${details.toolName}`,
      agentDetails,
      tenantDetails
    );

    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_TOOL_NAME_KEY, details.toolName);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_TOOL_ARGS_KEY, details.arguments);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_TOOL_TYPE_KEY, details.toolType);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_TOOL_CALL_ID_KEY, details.toolCallId);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_TOOL_DESCRIPTION_KEY, details.description);
  }

  /**
   * Records response information for telemetry tracking
   * @param response The tool execution response
   */
  public recordResponse(response: string): void {
    if (ExecuteToolScope.enableTelemetry) {
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_TOOL_CALL_RESULT_KEY, response);
    }
  }
}
