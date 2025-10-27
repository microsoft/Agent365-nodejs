// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { SpanKind } from '@opentelemetry/api';
import { OpenTelemetryScope } from './OpenTelemetryScope';
import { InvokeAgentDetails, AgentDetails, TenantDetails } from '../contracts';
import { OpenTelemetryConstants } from '../constants';

/**
 * Provides OpenTelemetry tracing scope for agent invocation operations
 */
export class InvokeAgentScope extends OpenTelemetryScope {

  /**
   * Creates and starts a new scope for agent invocation tracing
   * @param details The agent invocation details
   * @param agentDetails The agent details
   * @param tenantDetails The tenant details
   * @returns A new scope instance
   */
  public static start(details: InvokeAgentDetails, agentDetails: AgentDetails, tenantDetails: TenantDetails): InvokeAgentScope {
    return new InvokeAgentScope(details, agentDetails, tenantDetails);
  }

  private constructor(details: InvokeAgentDetails, agentDetails: AgentDetails, tenantDetails: TenantDetails) {
    super(
      SpanKind.CLIENT,
      OpenTelemetryConstants.INVOKE_AGENT_OPERATION_NAME,
      `${OpenTelemetryConstants.INVOKE_AGENT_OPERATION_NAME} ${details.agentName}`,
      agentDetails,
      tenantDetails
    );

    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY, details.agentId);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY, details.agentName);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_DESCRIPTION_KEY, details.agentDescription);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, details.conversationId);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_ICON_URI_KEY, details.iconUri);

    if (details.request) {
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY, details.request.content);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_EXECUTION_TYPE_KEY, details.request.executionType?.toString());
      this.setTagMaybe(OpenTelemetryConstants.SESSION_ID_KEY, details.request.sessionId);

      if (details.request.sourceMetadata) {
        this.setTagMaybe(OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_ID_KEY, details.request.sourceMetadata.id);
        this.setTagMaybe(OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_NAME_KEY, details.request.sourceMetadata.name);
        this.setTagMaybe(OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_DESCRIPTION_KEY, details.request.sourceMetadata.description);
      }
    }
  }

  /**
   * Records response information for telemetry tracking
   * @param response The invocation response
   */
  public recordResponse(response: string): void {
    if (InvokeAgentScope.enableTelemetry) {
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_EVENT_CONTENT, response);
    }
  }
}
