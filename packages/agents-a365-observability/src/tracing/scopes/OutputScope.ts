// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { SpanKind, TimeInput } from '@opentelemetry/api';
import { OpenTelemetryScope } from './OpenTelemetryScope';
import { AgentDetails, TenantDetails, CallerDetails, OutputResponse, Channel } from '../contracts';
import { ParentContext } from '../context/trace-context-propagation';
import { OpenTelemetryConstants } from '../constants';

/**
 * Provides OpenTelemetry tracing scope for output message tracing with parent span linking.
 */
export class OutputScope extends OpenTelemetryScope {
  private _outputMessages: string[];
  private _outputMessagesDirty = false;

  /**
   * Creates and starts a new scope for output message tracing.
   * @param response The response containing initial output messages.
   * @param agentDetails The details of the agent producing the output.
   * @param tenantDetails The tenant details.
   * @param callerDetails Optional caller identity details (id, upn, name, client ip).
   * @param conversationId Optional conversation identifier.
   * @param channel Optional channel metadata; only `name` and `description` are used for tagging.
   * @param parentContext Optional parent context for cross-async-boundary tracing.
   *   Accepts a ParentSpanRef (manual traceId/spanId) or an OTel Context (e.g. from extractTraceContext).
   * @param startTime Optional explicit start time (ms epoch, Date, or HrTime).
   * @param endTime Optional explicit end time (ms epoch, Date, or HrTime).
   * @returns A new OutputScope instance.
   */
  public static start(
    response: OutputResponse,
    agentDetails: AgentDetails,
    tenantDetails: TenantDetails,
    callerDetails?: CallerDetails,
    conversationId?: string,
    channel?: Pick<Channel, "name" | "description">,
    parentContext?: ParentContext,
    startTime?: TimeInput,
    endTime?: TimeInput
  ): OutputScope {
    return new OutputScope(response, agentDetails, tenantDetails, callerDetails, conversationId, channel, parentContext, startTime, endTime);
  }

  private constructor(
    response: OutputResponse,
    agentDetails: AgentDetails,
    tenantDetails: TenantDetails,
    callerDetails?: CallerDetails,
    conversationId?: string,
    channel?: Pick<Channel, "name" | "description">,
    parentContext?: ParentContext,
    startTime?: TimeInput,
    endTime?: TimeInput
  ) {
    super(
      SpanKind.CLIENT,
      OpenTelemetryConstants.OUTPUT_MESSAGES_OPERATION_NAME,
      agentDetails.agentName
        ? `${OpenTelemetryConstants.OUTPUT_MESSAGES_OPERATION_NAME} ${agentDetails.agentName}`
        : `${OpenTelemetryConstants.OUTPUT_MESSAGES_OPERATION_NAME} ${agentDetails.agentId}`,
      agentDetails,
      tenantDetails,
      parentContext,
      startTime,
      endTime,
      callerDetails
    );

    // Initialize accumulated messages list from the response
    this._outputMessages = [...response.messages];

    // Set initial output messages attribute
    this.setTagMaybe(
      OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY,
      JSON.stringify(this._outputMessages)
    );

    // Set conversation, execution type, and channel
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, conversationId);
    this.setTagMaybe(OpenTelemetryConstants.CHANNEL_NAME_KEY, channel?.name);
    this.setTagMaybe(OpenTelemetryConstants.CHANNEL_LINK_KEY, channel?.description);

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
