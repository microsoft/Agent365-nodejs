// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { SpanKind } from '@opentelemetry/api';
import { OpenTelemetryScope } from './OpenTelemetryScope';
import { AgentDetails, UserDetails, OutputResponse, Request, SpanDetails, OutputMessage, OutputMessages } from '../contracts';
import { OpenTelemetryConstants } from '../constants';
import { isStringArray, toOutputMessages, serializeMessages } from '../message-utils';

/**
 * Provides OpenTelemetry tracing scope for output message tracing with parent span linking.
 */
export class OutputScope extends OpenTelemetryScope {
  private _outputMessages: OutputMessage[];
  private _outputMessagesDirty = false;

  /**
   * Creates and starts a new scope for output message tracing.
   *
   * @param request Request payload (channel, conversationId, content, sessionId).
   * @param response The response containing initial output messages.
   * @param agentDetails The agent producing the output. Tenant ID is derived from `agentDetails.tenantId`.
   * @param userDetails Optional human caller identity details.
   * @param spanDetails Optional span configuration (parentContext, startTime, endTime, spanLinks).
   * @returns A new OutputScope instance.
   */
  public static start(
    request: Request,
    response: OutputResponse,
    agentDetails: AgentDetails,
    userDetails?: UserDetails,
    spanDetails?: SpanDetails
  ): OutputScope {
    return new OutputScope(request, response, agentDetails, userDetails, spanDetails);
  }

  private constructor(
    request: Request,
    response: OutputResponse,
    agentDetails: AgentDetails,
    userDetails?: UserDetails,
    spanDetails?: SpanDetails
  ) {
    // Validate tenantId is present (required for telemetry)
    if (!agentDetails.tenantId) {
      throw new Error('OutputScope: tenantId is required on agentDetails');
    }

    // spanKind for OutputScope is always CLIENT
    const resolvedSpanDetails: SpanDetails = { ...spanDetails, spanKind: SpanKind.CLIENT };

    super(
      OpenTelemetryConstants.OUTPUT_MESSAGES_OPERATION_NAME,
      agentDetails.agentName
        ? `${OpenTelemetryConstants.OUTPUT_MESSAGES_OPERATION_NAME} ${agentDetails.agentName}`
        : `${OpenTelemetryConstants.OUTPUT_MESSAGES_OPERATION_NAME} ${agentDetails.agentId}`,
      agentDetails,
      resolvedSpanDetails,
      userDetails,
    );

    // Initialize accumulated messages list from the response (convert plain strings to OTEL format if needed)
    this._outputMessages = isStringArray(response.messages) ? toOutputMessages(response.messages) : [...response.messages];

    // Set initial output messages attribute
    this.setTagMaybe(
      OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY,
      serializeMessages(this._outputMessages)
    );

    // Set conversation and channel
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, request.conversationId);
    this.setTagMaybe(OpenTelemetryConstants.CHANNEL_NAME_KEY, request.channel?.name);
    this.setTagMaybe(OpenTelemetryConstants.CHANNEL_LINK_KEY, request.channel?.description);
  }

  /**
   * Records the output messages for telemetry tracking.
   * Appends the provided messages to the accumulated output messages list.
   * Accepts plain strings (auto-wrapped as OTEL OutputMessage) or structured OutputMessage objects.
   * The updated attribute is flushed when the scope is disposed.
   * @param messages Array of output message strings or OutputMessage objects to append.
   */
  public recordOutputMessages(messages: OutputMessages): void {
    const otelMessages = isStringArray(messages) ? toOutputMessages(messages) : messages;
    this._outputMessages.push(...otelMessages);
    this._outputMessagesDirty = true;
  }

  public override [Symbol.dispose](): void {
    if (this._outputMessagesDirty) {
      this.setTagMaybe(
        OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY,
        serializeMessages(this._outputMessages)
      );
    }
    super[Symbol.dispose]();
  }

  public override dispose(): void {
    this[Symbol.dispose]();
  }
}
