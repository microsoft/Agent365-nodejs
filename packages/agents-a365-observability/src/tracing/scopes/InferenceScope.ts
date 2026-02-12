// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { SpanKind, TimeInput } from '@opentelemetry/api';
import { OpenTelemetryScope } from './OpenTelemetryScope';
import { OpenTelemetryConstants } from '../constants';
import {
  InferenceDetails,
  AgentDetails,
  TenantDetails,
  SourceMetadata
} from '../contracts';
import { ParentSpanRef } from '../context/parent-span-context';

/**
 * Provides OpenTelemetry tracing scope for generative AI inference operations.
 */
export class InferenceScope extends OpenTelemetryScope {
  /**
   * Creates and starts a new scope for inference tracing.
   * @param details The inference call details
   * @param agentDetails The agent details
   * @param tenantDetails The tenant details
   * @param conversationId Optional conversation id to tag on the span (`gen_ai.conversation.id`).
   * @param sourceMetadata Optional source metadata; only `name` (channel name) and `description` (channel link/URL) are used for tagging.
   * @param parentSpanRef Optional explicit parent span reference for cross-async-boundary tracing.
   * @param startTime Optional explicit start time (ms epoch, Date, or HrTime).
   * @param endTime Optional explicit end time (ms epoch, Date, or HrTime).
   * @returns A new InferenceScope instance
   */
  public static start(
    details: InferenceDetails,
    agentDetails: AgentDetails,
    tenantDetails: TenantDetails,
    conversationId?: string,
    sourceMetadata?: Pick<SourceMetadata, "name" | "description">,
    parentSpanRef?: ParentSpanRef,
    startTime?: TimeInput,
    endTime?: TimeInput
  ): InferenceScope {
    return new InferenceScope(details, agentDetails, tenantDetails, conversationId, sourceMetadata, parentSpanRef, startTime, endTime);
  }

  private constructor(
    details: InferenceDetails,
    agentDetails: AgentDetails,
    tenantDetails: TenantDetails,
    conversationId?: string,
    sourceMetadata?: Pick<SourceMetadata, "name" | "description">,
    parentSpanRef?: ParentSpanRef,
    startTime?: TimeInput,
    endTime?: TimeInput
  ) {
    super(
      SpanKind.CLIENT,
      details.operationName.toString(),
      `${details.operationName} ${details.model}`,
      agentDetails,
      tenantDetails,
      parentSpanRef,
      startTime,
      endTime
    );

    // Set core inference information matching C# implementation
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY, details.operationName.toString());
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_REQUEST_MODEL_KEY, details.model);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_PROVIDER_NAME_KEY, details.providerName);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_USAGE_INPUT_TOKENS_KEY, details.inputTokens?.toString());
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_USAGE_OUTPUT_TOKENS_KEY, details.outputTokens?.toString());
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_RESPONSE_FINISH_REASONS_KEY, details.finishReasons?.join(','));
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_RESPONSE_ID_KEY, details.responseId);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, conversationId);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_NAME_KEY, sourceMetadata?.name);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_DESCRIPTION_KEY, sourceMetadata?.description);    
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
