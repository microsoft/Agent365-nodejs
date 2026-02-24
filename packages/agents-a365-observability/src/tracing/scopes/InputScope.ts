// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { SpanKind, TimeInput } from '@opentelemetry/api';
import { OpenTelemetryScope } from './OpenTelemetryScope';
import { AgentDetails, TenantDetails, CallerDetails, AgentRequest } from '../contracts';
import { ParentContext } from '../context/trace-context-propagation';
import { OpenTelemetryConstants } from '../constants';

/**
 * Provides OpenTelemetry tracing scope for input message tracing with parent span linking.
 */
export class InputScope extends OpenTelemetryScope {
  private _inputMessages: string[];
  private _inputMessagesDirty = false;

  /**
   * Creates and starts a new scope for input message tracing.
   * @param request The agent request containing the input content, execution type, and source metadata.
   * @param agentDetails The details of the agent receiving the input.
   * @param tenantDetails The tenant details.
   * @param callerDetails Optional caller identity details (id, upn, name, tenant, client ip).
   * @param conversationId Optional conversation identifier.
   * @param parentContext Optional parent context for cross-async-boundary tracing.
   *   Accepts a ParentSpanRef (manual traceId/spanId) or an OTel Context (e.g. from extractTraceContext).
   * @param startTime Optional explicit start time (ms epoch, Date, or HrTime).
   * @param endTime Optional explicit end time (ms epoch, Date, or HrTime).
   * @returns A new InputScope instance.
   */
  public static start(
    request: AgentRequest,
    agentDetails: AgentDetails,
    tenantDetails: TenantDetails,
    callerDetails?: CallerDetails,
    conversationId?: string,
    parentContext?: ParentContext,
    startTime?: TimeInput,
    endTime?: TimeInput
  ): InputScope {
    return new InputScope(request, agentDetails, tenantDetails, callerDetails, conversationId, parentContext, startTime, endTime);
  }

  private constructor(
    request: AgentRequest,
    agentDetails: AgentDetails,
    tenantDetails: TenantDetails,
    callerDetails?: CallerDetails,
    conversationId?: string,
    parentContext?: ParentContext,
    startTime?: TimeInput,
    endTime?: TimeInput
  ) {
    super(
      SpanKind.CLIENT,
      OpenTelemetryConstants.INPUT_MESSAGES_OPERATION_NAME,
      agentDetails.agentName
        ? `${OpenTelemetryConstants.INPUT_MESSAGES_OPERATION_NAME} ${agentDetails.agentName}`
        : `${OpenTelemetryConstants.INPUT_MESSAGES_OPERATION_NAME} ${agentDetails.agentId}`,
      agentDetails,
      tenantDetails,
      parentContext,
      startTime,
      endTime
    );

    // Initialize accumulated messages list from the request content
    this._inputMessages = request.content ? [request.content] : [];

    // Set initial input messages attribute
    if (this._inputMessages.length > 0) {
      this.setTagMaybe(
        OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY,
        JSON.stringify(this._inputMessages)
      );
    }

    // Set execution type if provided
    this.setTagMaybe(
      OpenTelemetryConstants.GEN_AI_EXECUTION_TYPE_KEY,
      request.executionType
    );

    // Set source metadata if provided
    this.setTagMaybe(
      OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_NAME_KEY,
      request.sourceMetadata?.name
    );
    this.setTagMaybe(
      OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_DESCRIPTION_KEY,
      request.sourceMetadata?.description
    );

    // Set conversation id
    this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, conversationId);

    // Set caller details if provided
    if (callerDetails) {
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_ID_KEY, callerDetails.callerId);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_UPN_KEY, callerDetails.callerUpn);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_NAME_KEY, callerDetails.callerName);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_TENANT_ID_KEY, callerDetails.tenantId);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_CLIENT_IP_KEY, callerDetails.callerClientIp);
    }
  }

  /**
   * Records the input messages for telemetry tracking.
   * Appends the provided messages to the accumulated input messages list.
   * The updated attribute is flushed when the scope is disposed.
   * @param messages Array of input messages to append.
   */
  public recordInputMessages(messages: string[]): void {
    this._inputMessages.push(...messages);
    this._inputMessagesDirty = true;
  }

  public override [Symbol.dispose](): void {
    if (this._inputMessagesDirty) {
      this.setTagMaybe(
        OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY,
        JSON.stringify(this._inputMessages)
      );
    }
    super[Symbol.dispose]();
  }

  public override dispose(): void {
    this[Symbol.dispose]();
  }
}
