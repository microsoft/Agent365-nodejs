// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { SpanKind } from '@opentelemetry/api';
import { OpenTelemetryScope } from './OpenTelemetryScope';
import { OpenTelemetryConstants } from '../constants';
import {
  InferenceDetails,
  AgentDetails,
  UserDetails,
  Request,
  SpanDetails,
} from '../contracts';

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

    super(
      SpanKind.CLIENT,
      details.operationName.toString(),
      `${details.operationName} ${details.model}`,
      agentDetails,
      spanDetails?.parentContext,
      spanDetails?.startTime,
      spanDetails?.endTime,
      userDetails,
      spanDetails?.spanLinks
    );

    // Set core inference information
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_REQUEST_MODEL_KEY, details.model);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_PROVIDER_NAME_KEY, details.providerName);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_USAGE_INPUT_TOKENS_KEY, details.inputTokens);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_USAGE_OUTPUT_TOKENS_KEY, details.outputTokens);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_RESPONSE_FINISH_REASONS_KEY, details.finishReasons);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_THOUGHT_PROCESS_KEY, details.thoughtProcess);
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, request.conversationId);
    this.setTagMaybe(OpenTelemetryConstants.CHANNEL_NAME_KEY, request.channel?.name);
    this.setTagMaybe(OpenTelemetryConstants.CHANNEL_LINK_KEY, request.channel?.description);

    // Set endpoint information if provided
    if (details.endpoint) {
      this.setTagMaybe(OpenTelemetryConstants.SERVER_ADDRESS_KEY, details.endpoint.host);

      // Only record port if it is different from 443 (default HTTPS port)
      if (details.endpoint.port && details.endpoint.port !== 443) {
        this.setTagMaybe(OpenTelemetryConstants.SERVER_PORT_KEY, details.endpoint.port);
      }
    }
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
