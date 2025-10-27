// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { SpanKind } from '@opentelemetry/api';
import { OpenTelemetryScope } from './OpenTelemetryScope';
import { OpenTelemetryConstants } from '../constants';
import { 
  InferenceDetails,  
  AgentDetails, 
  TenantDetails 
} from '../contracts';

/**
 * Provides OpenTelemetry tracing scope for generative AI inference operations.
 */
export class InferenceScope extends OpenTelemetryScope {
  /**
   * Creates and starts a new scope for inference tracing.
   * @param details The inference call details
   * @param agentDetails The agent details
   * @param tenantDetails The tenant details
   * @returns A new InferenceScope instance
   */
  public static start(details: InferenceDetails, agentDetails: AgentDetails, tenantDetails: TenantDetails): InferenceScope {
    return new InferenceScope(details, agentDetails, tenantDetails);
  }

  private constructor(details: InferenceDetails, agentDetails: AgentDetails, tenantDetails: TenantDetails) {
    super(
      SpanKind.CLIENT,
      details.operationName.toString(),
      `${details.operationName} ${details.model}`,
      agentDetails,
      tenantDetails
    );

    // Set core inference information matching C# implementation
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY, details.operationName.toString());
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_REQUEST_MODEL_KEY, details.model);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_PROVIDER_NAME_KEY, details.providerName);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_USAGE_INPUT_TOKENS_KEY, details.inputTokens?.toString());
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_USAGE_OUTPUT_TOKENS_KEY, details.outputTokens?.toString());
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_RESPONSE_FINISH_REASONS_KEY, details.finishReasons?.join(','));
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_RESPONSE_ID_KEY, details.responseId);
  }

  /**
   * Records the input messages for telemetry tracking.
   * @param messages Array of input messages
   */
  public recordInputMessages(messages: string[]): void {
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY, messages.join(','));
  }

  /**
   * Records the output messages for telemetry tracking.
   * @param messages Array of output messages
   */
  public recordOutputMessages(messages: string[]): void {
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY, messages.join(','));
  }

  /**
   * Records the number of input tokens for telemetry tracking.
   * @param inputTokens Number of input tokens
   */
  public recordInputTokens(inputTokens: number): void {
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_USAGE_INPUT_TOKENS_KEY, inputTokens.toString());
  }

  /**
   * Records the number of output tokens for telemetry tracking.
   * @param outputTokens Number of output tokens
   */
  public recordOutputTokens(outputTokens: number): void {
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_USAGE_OUTPUT_TOKENS_KEY, outputTokens.toString());
  }

  /**
   * Records the response id for telemetry tracking.
   * @param responseId The response ID
   */
  public recordResponseId(responseId: string): void {
    if (responseId && responseId.trim()) {
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_RESPONSE_ID_KEY, responseId);
    }
  }

  /**
   * Records the finish reasons for telemetry tracking.
   * @param finishReasons Array of finish reasons
   */
  public recordFinishReasons(finishReasons: string[]): void {
    if (finishReasons && finishReasons.length > 0) {
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_RESPONSE_FINISH_REASONS_KEY, finishReasons.join(','));
    }
  }

}
