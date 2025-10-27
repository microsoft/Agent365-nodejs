// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { SpanKind } from '@opentelemetry/api';
import { OpenTelemetryScope } from './OpenTelemetryScope';
import { OpenTelemetryConstants } from '../constants';
import { InferenceDetails, InferenceResponse, InferenceOperationType, AgentDetails, TenantDetails } from '../contracts';

/**
 * Provides tracing scope for LLM/AI model inference calls
 */
export class InferenceScope extends OpenTelemetryScope {
  /**
   * Creates and starts a new scope for inference tracing
   * @param details The inference details
   * @param agentDetails The agent details
   * @param tenantDetails The tenant details
   * @returns A new scope instance
   */
  public static start(details: InferenceDetails, agentDetails: AgentDetails, tenantDetails: TenantDetails): InferenceScope {
    return new InferenceScope(details, agentDetails, tenantDetails);
  }

  private constructor(details: InferenceDetails, agentDetails: AgentDetails, tenantDetails: TenantDetails) {
    super(
      SpanKind.CLIENT,
      InferenceOperationType.CHAT,
      `${InferenceOperationType.CHAT} ${details.modelName}`,
      agentDetails,
      tenantDetails
    );

    // Set model information
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_REQUEST_MODEL_KEY, details.modelName);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_PROVIDER_NAME_KEY, details.provider);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_REQUEST_MODEL_KEY, details.modelVersion);

    // Set request parameters
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_REQUEST_TEMPERATURE_KEY, details.temperature);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_REQUEST_MAX_TOKENS_KEY, details.maxTokens);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_REQUEST_TOP_P_KEY, details.topP);

    // Set prompt content if enabled
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY, details.prompt);
  }

  /**
   * Records response information for inference telemetry tracking
   * @param response The inference response details
   */
  public recordResponse(response: InferenceResponse): void {
    if (InferenceScope.enableTelemetry) {
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_EVENT_CONTENT, response.content);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_RESPONSE_ID_KEY, response.responseId);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_RESPONSE_FINISH_REASONS_KEY, response.finishReason);

      // Token usage metrics
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_USAGE_INPUT_TOKENS_KEY, response.inputTokens);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_USAGE_OUTPUT_TOKENS_KEY, response.outputTokens);
    }
  }

}
