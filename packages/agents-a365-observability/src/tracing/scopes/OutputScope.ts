// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { SpanKind } from '@opentelemetry/api';
import { OpenTelemetryScope } from './OpenTelemetryScope';
import { AgentDetails, TenantDetails, Response } from '../contracts';
import { ParentSpanRef } from '../context/parent-span-context';
import { OpenTelemetryConstants } from '../constants';

/**
 * Provides OpenTelemetry tracing scope for output message tracing with parent span linking.
 */
export class OutputScope extends OpenTelemetryScope {
  private _outputMessages: string[];

  /**
   * Creates and starts a new scope for output message tracing.
   * @param agentDetails The details of the agent producing the output.
   * @param tenantDetails The tenant details.
   * @param response The response containing initial output messages.
   * @param parentSpanRef Optional explicit parent span reference for cross-async-boundary tracing.
   * @returns A new OutputScope instance.
   */
  public static start(
    agentDetails: AgentDetails,
    tenantDetails: TenantDetails,
    response: Response,
    parentSpanRef?: ParentSpanRef
  ): OutputScope {
    return new OutputScope(agentDetails, tenantDetails, response, parentSpanRef);
  }

  private constructor(
    agentDetails: AgentDetails,
    tenantDetails: TenantDetails,
    response: Response,
    parentSpanRef?: ParentSpanRef
  ) {
    super(
      SpanKind.CLIENT,
      OpenTelemetryConstants.OUTPUT_MESSAGES_OPERATION_NAME,
      `${OpenTelemetryConstants.OUTPUT_MESSAGES_OPERATION_NAME} ${agentDetails.agentId}`,
      agentDetails,
      tenantDetails,
      parentSpanRef
    );

    // Initialize accumulated messages list from the response
    this._outputMessages = [...response.messages];

    // Set initial output messages attribute
    this.setTagMaybe(
      OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY,
      JSON.stringify(this._outputMessages)
    );
  }

  /**
   * Records the output messages for telemetry tracking.
   * Appends the provided messages to the accumulated output messages list.
   * @param messages Array of output messages to append.
   */
  public recordOutputMessages(messages: string[]): void {
    this._outputMessages.push(...messages);
    this.setTagMaybe(
      OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY,
      JSON.stringify(this._outputMessages)
    );
  }
}
