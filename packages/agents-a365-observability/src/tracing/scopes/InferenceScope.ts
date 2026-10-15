// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { SpanKind } from '@opentelemetry/api';
import { OpenTelemetryScope } from './OpenTelemetryScope';
import { OpenTelemetryConstants } from '../constants';
import {
  InferenceDetails,
  InferenceOperationType,
  AgentDetails,
  UserDetails,
  Request,
  SpanDetails,
  InputMessagesParam,
  OutputMessagesParam,
} from '../contracts';

/**
 * Maps each {@link InferenceOperationType} to its canonical lowercase `gen_ai.operation.name`
 * semconv value. Used for both the `gen_ai.operation.name` attribute and the span-name prefix.
 */
const OPERATION_NAME_MAP: Record<InferenceOperationType, string> = {
  [InferenceOperationType.CHAT]: OpenTelemetryConstants.CHAT_OPERATION_NAME,
  [InferenceOperationType.TEXT_COMPLETION]: OpenTelemetryConstants.TEXT_COMPLETION_OPERATION_NAME,
  [InferenceOperationType.GENERATE_CONTENT]: OpenTelemetryConstants.GENERATE_CONTENT_OPERATION_NAME,
};

/** Returns `value` trimmed, or `undefined` if it is missing or blank after trimming. */
function normalizeOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Provides OpenTelemetry tracing scope for generative AI inference operations.
 */
export class InferenceScope extends OpenTelemetryScope {
  /**
   * Creates and starts a new scope for inference tracing.
   *
   * @param request Request payload (channel, conversationId, content, sessionId).
   * @param details The inference call details (model, provider, tokens, etc.).
   * @param agentDetails The agent performing the inference. Tenant ID is derived from `agentDetails.tenantId`.
   * @param userDetails Optional human caller identity.
   * @param spanDetails Optional span configuration (parentContext, startTime, endTime, spanLinks). Note: `spanKind` is ignored; InferenceScope always uses `SpanKind.CLIENT`.
   * @returns A new InferenceScope instance
   */
  public static start(
    request: Request,
    details: InferenceDetails,
    agentDetails: AgentDetails,
    userDetails?: UserDetails,
    spanDetails?: SpanDetails
  ): InferenceScope {
    return new InferenceScope(request, details, agentDetails, userDetails, spanDetails);
  }

  private constructor(
    request: Request,
    details: InferenceDetails,
    agentDetails: AgentDetails,
    userDetails?: UserDetails,
    spanDetails?: SpanDetails
  ) {
    // Validate tenantId is present (required for telemetry)
    if (!agentDetails.tenantId) {
      throw new Error('InferenceScope: tenantId is required on agentDetails');
    }
    // Normalize model/responseModel once: blank/whitespace-only strings are treated as absent,
    // so they are never emitted as empty attributes and never leak into the span-name fallback.
    const normalizedModel = normalizeOrUndefined(details.model);
    const normalizedResponseModel = normalizeOrUndefined(details.responseModel);
    if (!normalizedModel && !normalizedResponseModel) {
      throw new Error('InferenceScope: at least one of model or responseModel is required');
    }
    if (!details.providerName?.trim()) {
      throw new Error('InferenceScope: providerName is required');
    }
    if (details.endpoint?.port !== undefined &&
        (!Number.isInteger(details.endpoint.port) || details.endpoint.port < 1 || details.endpoint.port > 65535)) {
      throw new Error('InferenceScope: endpoint port must be an integer between 1 and 65535');
    }

    // spanKind for InferenceScope is always CLIENT
    const resolvedSpanDetails: SpanDetails = { ...spanDetails, spanKind: SpanKind.CLIENT };

    // Map the operation type to its canonical lowercase semconv value (chat/text_completion/
    // generate_content) for both gen_ai.operation.name and the span-name prefix.
    const operationName = OPERATION_NAME_MAP[details.operationName] ?? OpenTelemetryConstants.CHAT_OPERATION_NAME;

    super(
      operationName,
      `${operationName} ${normalizedModel ?? normalizedResponseModel}`,
      agentDetails,
      resolvedSpanDetails,
      userDetails,
    );

    // Set core inference information
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_REQUEST_MODEL_KEY, normalizedModel);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_RESPONSE_MODEL_KEY, normalizedResponseModel);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_PROVIDER_NAME_KEY, details.providerName);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_USAGE_INPUT_TOKENS_KEY, details.inputTokens);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_USAGE_OUTPUT_TOKENS_KEY, details.outputTokens);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS_KEY, details.cacheReadInputTokens);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS_KEY, details.cacheWriteInputTokens);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_RESPONSE_FINISH_REASONS_KEY, details.finishReasons);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_THOUGHT_PROCESS_KEY, details.thoughtProcess);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, request.conversationId);
    this.setTagMaybe(OpenTelemetryConstants.CHANNEL_NAME_KEY, request.channel?.name);
    this.setTagMaybe(OpenTelemetryConstants.CHANNEL_LINK_KEY, request.channel?.description);

    // Set endpoint information if provided
    if (details.endpoint) {
      this.setTagMaybe(OpenTelemetryConstants.SERVER_ADDRESS_KEY, details.endpoint.host);

      if (details.endpoint.port !== undefined) {
        this.setTagMaybe(OpenTelemetryConstants.SERVER_PORT_KEY, details.endpoint.port);
      }
    }
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

  /** Records the number of input tokens read from a cache. */
  public recordCacheReadInputTokens(inputTokens: number): void {
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS_KEY, inputTokens);
  }

  /** Records the number of input tokens written to a cache. */
  public recordCacheWriteInputTokens(inputTokens: number): void {
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS_KEY, inputTokens);
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

  /**
   * Records the input messages for telemetry tracking.
   * Accepts plain strings (auto-wrapped as OTEL ChatMessage with role `user`) or a versioned InputMessages wrapper.
   * @param messages Array of input message strings or an InputMessages wrapper
   */
  public override recordInputMessages(messages: InputMessagesParam): void {
    super.recordInputMessages(messages);
  }

  /**
   * Records the output messages for telemetry tracking.
   * Accepts plain strings (auto-wrapped as OTEL OutputMessage with role `assistant`) or a versioned OutputMessages wrapper.
   * @param messages Array of output message strings or an OutputMessages wrapper
   */
  public override recordOutputMessages(messages: OutputMessagesParam): void {
    super.recordOutputMessages(messages);
  }
}
