// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { SpanKind } from '@opentelemetry/api';
import { OpenTelemetryScope } from './OpenTelemetryScope';
import { AgentDetails, UserDetails, OutputResponse, Request, SpanDetails } from '../contracts';
import { OpenTelemetryConstants } from '../constants';

/**
 * Provides OpenTelemetry tracing scope for output message tracing with parent span linking.
 */
export class OutputScope extends OpenTelemetryScope {
  private _outputMessages: string[];
  private _outputMessagesDirty = false;

  /**
   * Creates and starts a new scope for output message tracing.
   *
   * @param request Request payload (channel, conversationId, content, sessionId).
   * @param response The response containing initial output messages.
   * @param agentDetails The agent producing the output. Tenant ID is derived from `agentDetails.tenantId`.
   * @param userDetails Optional human caller identity details.
   * @param spanDetails Optional span configuration (parentContext, startTime, endTime).
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
    // Derive tenant details from agentDetails.tenantId (required for telemetry)
    if (!agentDetails.tenantId) {
      throw new Error('OutputScope: tenantId is required on agentDetails');
    }
    const tenantDetails = { tenantId: agentDetails.tenantId };

    super(
      SpanKind.CLIENT,
      OpenTelemetryConstants.OUTPUT_MESSAGES_OPERATION_NAME,
      agentDetails.agentName
        ? `${OpenTelemetryConstants.OUTPUT_MESSAGES_OPERATION_NAME} ${agentDetails.agentName}`
        : `${OpenTelemetryConstants.OUTPUT_MESSAGES_OPERATION_NAME} ${agentDetails.agentId}`,
      agentDetails,
      tenantDetails,
      spanDetails?.parentContext,
      spanDetails?.startTime,
      spanDetails?.endTime,
      userDetails
    );

    // Initialize accumulated messages list from the response
    this._outputMessages = [...response.messages];

    // Set initial output messages attribute
    this.setTagMaybe(
      OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY,
      JSON.stringify(this._outputMessages)
    );

    // Set conversation and channel
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, request?.conversationId);
    this.setTagMaybe(OpenTelemetryConstants.CHANNEL_NAME_KEY, request?.channel?.name);
    this.setTagMaybe(OpenTelemetryConstants.CHANNEL_LINK_KEY, request?.channel?.description);

  }

  /**
   * Records the output messages for telemetry tracking.
   * Appends the provided messages to the accumulated output messages list.
   * The updated attribute is flushed when the scope is disposed.
   * @param messages Array of output messages to append.
   */
  public recordOutputMessages(messages: string[]): void {
    this._outputMessages.push(...messages);
    this._outputMessagesDirty = true;
  }

  public override [Symbol.dispose](): void {
    if (this._outputMessagesDirty) {
      this.setTagMaybe(
        OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY,
        JSON.stringify(this._outputMessages)
      );
    }
    super[Symbol.dispose]();
  }

  public override dispose(): void {
    this[Symbol.dispose]();
  }
}
