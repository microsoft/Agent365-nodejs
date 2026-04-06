// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { SpanKind } from '@opentelemetry/api';
import { OpenTelemetryScope } from './OpenTelemetryScope';
import { AgentDetails, UserDetails, OutputResponse, Request, SpanDetails, OutputMessagesParam, ResponseMessagesParam, A365_MESSAGE_SCHEMA_VERSION } from '../contracts';
import { OpenTelemetryConstants } from '../constants';
import { normalizeOutputMessages, serializeMessages } from '../message-utils';

/**
 * Provides OpenTelemetry tracing scope for output message tracing with parent span linking.
 */
export class OutputScope extends OpenTelemetryScope {

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

    // Normalize and set initial output messages
    this._setOutput(response.messages);

    // Set conversation and channel
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, request.conversationId);
    this.setTagMaybe(OpenTelemetryConstants.CHANNEL_NAME_KEY, request.channel?.name);
    this.setTagMaybe(OpenTelemetryConstants.CHANNEL_LINK_KEY, request.channel?.description);
  }

  /**
   * Records the output messages for telemetry tracking.
   * Overwrites any previously recorded output messages on the span.
   * Accepts plain strings (auto-wrapped as OTEL OutputMessage), a versioned OutputMessages wrapper,
   * or a raw dict (treated as a tool call result per OTEL spec, serialized directly).
   * @param messages Array of output message strings, an OutputMessages wrapper, or a dict.
   */
  public recordOutputMessages(messages: ResponseMessagesParam): void {
    this._setOutput(messages);
  }

  private _setOutput(messages: ResponseMessagesParam): void {
    // Dict (Record<string, unknown>) — treat as tool call result, serialize directly
    if (this._isRawDict(messages)) {
      this.setTagMaybe(
        OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY,
        JSON.stringify(messages)
      );
      return;
    }
    const normalized = normalizeOutputMessages(messages);
    const wrapper = { version: A365_MESSAGE_SCHEMA_VERSION, messages: normalized.messages };
    this.setTagMaybe(
      OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY,
      serializeMessages(wrapper)
    );
  }

  /**
   * Check if the value is a raw dict (plain object, not string[] or OutputMessages wrapper).
   */
  private _isRawDict(messages: ResponseMessagesParam): messages is Record<string, unknown> {
    return typeof messages === 'object' && !Array.isArray(messages) && !('version' in messages && 'messages' in messages);
  }
}
