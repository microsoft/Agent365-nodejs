// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Context, propagation, Span } from '@opentelemetry/api';
import { SpanProcessor as BaseSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { OpenTelemetryConstants } from '../constants';
import { GENERIC_ATTRIBUTES, INVOKE_AGENT_ATTRIBUTES } from './util';
import { getResolvedInvocationIdentity } from '../context/invocation-identity-context';
import {
  getInvocationIdentityAttributes,
  hasNonBlankIdentityAttribute,
  INVOCATION_IDENTITY_ATTRIBUTE_KEYS,
} from '../invocation-identity-attributes';
import { diagnoseInvocationIdentitySpan } from '../diagnostics/invocation-identity-diagnostics';

interface SpanWithAttributes {
  attributes?: Record<string, unknown>;
  _attributes?: Record<string, unknown>;
  name?: string;
}

function getSpanAttributes(span: Span): Record<string, unknown> {
  const spanRecord = span as Span & SpanWithAttributes;
  return spanRecord.attributes ?? spanRecord._attributes ?? {};
}

/**
 * Span processor that propagates baggage key/value pairs to span attributes.
 *
 * This processor copies baggage entries onto spans based on the operation type.
 * For invoke_agent operations, it applies both generic and invoke-agent-specific attributes.
 * For other operations, it applies only generic attributes.
 */
export class SpanProcessor implements BaseSpanProcessor {
  private readonly identityEnrichedSpans = new WeakSet<object>();

  /**
   * Called when a span is started.
   * Copies relevant baggage entries to span attributes.
   */
  onStart(span: Span, parentContext?: Context): void {
    const ctx = parentContext;
    if (!ctx) {
      return;
    }

    const spanAttributes = getSpanAttributes(span);
    const existingAttrs = new Set<string>(Object.keys(spanAttributes));
    const identity = getResolvedInvocationIdentity(ctx);

    if (identity) {
      for (const [key, value] of getInvocationIdentityAttributes(identity)) {
        if (value === undefined || hasNonBlankIdentityAttribute(spanAttributes[key])) {
          continue;
        }

        try {
          span.setAttribute(key, value);
        } catch {
          // Span enrichment must not interrupt application execution.
        }
      }

      this.identityEnrichedSpans.add(span as object);
    }

    // Get all baggage entries
    const baggage = propagation.getBaggage(ctx);
    if (!baggage) {
      return;
    }

    const baggageMap = new Map<string, string>();
    baggage.getAllEntries().forEach(([key, entry]) => {
      if (entry.value) {
        baggageMap.set(key, entry.value);
      }
    });

    // Determine if this is an invoke_agent operation
    const operationName =
      baggageMap.get(OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY) ||
      spanAttributes[OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY];

    const spanName = (span as Span & SpanWithAttributes).name || '';
    const isInvokeAgent =
      operationName === OpenTelemetryConstants.INVOKE_AGENT_OPERATION_NAME ||
      spanName.startsWith(OpenTelemetryConstants.INVOKE_AGENT_OPERATION_NAME);

    // Build target key set
    const targetKeys = new Set<string>(GENERIC_ATTRIBUTES);
    if (isInvokeAgent) {
      INVOKE_AGENT_ATTRIBUTES.forEach(key => targetKeys.add(key));
    }

    // Set telemetry SDK attributes
    if (!existingAttrs.has(OpenTelemetryConstants.TELEMETRY_SDK_NAME_KEY)) {
      span.setAttribute(OpenTelemetryConstants.TELEMETRY_SDK_NAME_KEY, OpenTelemetryConstants.TELEMETRY_SDK_NAME_VALUE);
    }
    if (!existingAttrs.has(OpenTelemetryConstants.TELEMETRY_SDK_LANGUAGE_KEY)) {
      span.setAttribute(OpenTelemetryConstants.TELEMETRY_SDK_LANGUAGE_KEY, OpenTelemetryConstants.TELEMETRY_SDK_LANGUAGE_VALUE);
    }
    if (!existingAttrs.has(OpenTelemetryConstants.TELEMETRY_SDK_VERSION_KEY)) {
      span.setAttribute(OpenTelemetryConstants.TELEMETRY_SDK_VERSION_KEY, OpenTelemetryConstants.TELEMETRY_SDK_VERSION_VALUE);
    }

    // Copy baggage to span attributes
    for (const key of targetKeys) {
      if (identity && INVOCATION_IDENTITY_ATTRIBUTE_KEYS.has(key)) {
        continue;
      }

      // Skip if attribute already exists
      if (existingAttrs.has(key)) {
        continue;
      }

      const value = baggageMap.get(key);
      if (!value) {
        continue;
      }

      try {
        span.setAttribute(key, value);
      } catch {
        // Ignore errors setting attributes
      }
    }
  }

  /**
   * Called when a span is ended.
   */
  onEnd(span: ReadableSpan): void {
    if (this.identityEnrichedSpans.has(span as object)) {
      diagnoseInvocationIdentitySpan(span);
    }
  }

  /**
   * Shutdown the processor.
   */
  async shutdown(): Promise<void> {
    // No-op for this processor
  }

  /**
   * Force flush the processor.
   */
  async forceFlush(): Promise<void> {
    // No-op for this processor
  }
}
