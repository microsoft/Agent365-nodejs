// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { SpanKind, TimeInput } from '@opentelemetry/api';
import { OpenTelemetryScope } from './OpenTelemetryScope';
import { OpenTelemetryConstants } from '../constants';
import {
  InferenceDetails,
  AgentDetails,
  TenantDetails,
  SourceMetadata,
  CallerDetails
} from '../contracts';
import { ParentContext } from '../context/trace-context-propagation';

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
   * @param parentContext Optional parent context for cross-async-boundary tracing.
   *   Accepts a ParentSpanRef (manual traceId/spanId) or an OTel Context (e.g. from extractTraceContext).
   * @param startTime Optional explicit start time (ms epoch, Date, or HrTime).
   * @param endTime Optional explicit end time (ms epoch, Date, or HrTime).
   * @param callerDetails Optional caller details.
   * @returns A new InferenceScope instance
   */
  public static start(
    details: InferenceDetails,
    agentDetails: AgentDetails,
    tenantDetails: TenantDetails,
    conversationId?: string,
    sourceMetadata?: Pick<SourceMetadata, "name" | "description">,
    parentContext?: ParentContext,
    startTime?: TimeInput,
    endTime?: TimeInput,
    callerDetails?: CallerDetails
  ): InferenceScope {
    return new InferenceScope(details, agentDetails, tenantDetails, conversationId, sourceMetadata, parentContext, startTime, endTime, callerDetails);
  }

  private constructor(
    details: InferenceDetails,
    agentDetails: AgentDetails,
    tenantDetails: TenantDetails,
    conversationId?: string,
    sourceMetadata?: Pick<SourceMetadata, "name" | "description">,
    parentContext?: ParentContext,
    startTime?: TimeInput,
    endTime?: TimeInput,
    callerDetails?: CallerDetails
  ) {
    super(
      SpanKind.CLIENT,
      details.operationName.toString(),
      `${details.operationName} ${details.model}`,
      agentDetails,
      tenantDetails,
      parentContext,
      startTime,
      endTime,
      callerDetails
    );

    // Set core inference information matching C# implementation
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY, details.operationName.toString());
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_REQUEST_MODEL_KEY, details.model);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_PROVIDER_NAME_KEY, details.providerName);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_USAGE_INPUT_TOKENS_KEY, details.inputTokens);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_USAGE_OUTPUT_TOKENS_KEY, details.outputTokens);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_RESPONSE_FINISH_REASONS_KEY, details.finishReasons);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_THOUGHT_PROCESS_KEY, details.thoughtProcess);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, conversationId);
    this.setTagMaybe(OpenTelemetryConstants.CHANNEL_NAME_KEY, sourceMetadata?.name);
    this.setTagMaybe(OpenTelemetryConstants.CHANNEL_LINK_KEY, sourceMetadata?.description);

    // Set endpoint information if provided
    if (details.endpoint) {
      this.setTagMaybe(OpenTelemetryConstants.SERVER_ADDRESS_KEY, details.endpoint.host);

      // Only record port if it is different from 443 (default HTTPS port)
      if (details.endpoint.port && details.endpoint.port !== 443) {
        this.setTagMaybe(OpenTelemetryConstants.SERVER_PORT_KEY, details.endpoint.port.toString());
      }
    }
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
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_USAGE_INPUT_TOKENS_KEY, inputTokens);
  }

  /**
   * Records the number of output tokens for telemetry tracking.
   * @param outputTokens Number of output tokens
   */
  public recordOutputTokens(outputTokens: number): void {
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_USAGE_OUTPUT_TOKENS_KEY, outputTokens);
  }

  /**
   * Records the finish reasons for telemetry tracking.
   * @param finishReasons Array of finish reasons
   */
  public recordFinishReasons(finishReasons: string[]): void {
    if (finishReasons && finishReasons.length > 0) {
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_RESPONSE_FINISH_REASONS_KEY, finishReasons);
    }
  }

}
