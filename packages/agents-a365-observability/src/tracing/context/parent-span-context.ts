// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { context, trace, Context, SpanContext, TraceFlags } from '@opentelemetry/api';
import logger from '../../utils/logging';

/**
 * Reference to a parent span for explicit parent-child linking across async boundaries.
 * Used when automatic context propagation fails (e.g., WebSocket callbacks, external event handlers).
 */
export interface ParentSpanRef {
  /**
   * Trace ID (32-character hex string)
   */
  traceId: string;

  /**
   * Span ID (16-character hex string)
   */
  spanId: string;
}

/**
 * Creates a new Context with an explicit parent span reference.
 * This allows child spans to be correctly parented even when async context is broken.
 *
 * @param base The base context to extend (typically context.active())
 * @param parent The parent span reference containing traceId and spanId
 * @returns A new Context with the parent span set
 */
export function createContextWithParentSpanRef(base: Context, parent: ParentSpanRef): Context {
  logger.info(`[ParentSpanContext] Creating context with parent span: traceId=${parent.traceId}, spanId=${parent.spanId}`);

  // Create a SpanContext from the parent reference
  const parentSpanContext: SpanContext = {
    traceId: parent.traceId,
    spanId: parent.spanId,
    traceFlags: TraceFlags.SAMPLED,
  };

  // Create a non-recording span with the parent context
  const parentSpan = trace.wrapSpanContext(parentSpanContext);

  // Set this span in the base context
  const contextWithParent = trace.setSpan(base, parentSpan);

  return contextWithParent;
}

/**
 * Runs a callback function within a context that has an explicit parent span reference.
 * This is useful for creating child spans in async callbacks where context propagation is broken.
 *
 * @param parent The parent span reference
 * @param callback The function to execute with the parent context
 * @returns The result of the callback
 */
export function runWithParentSpanRef<T>(parent: ParentSpanRef, callback: () => T): T {
  const base = context.active();
  const contextWithParent = createContextWithParentSpanRef(base, parent);
  logger.info('[ParentSpanContext] Running callback with parent span context.');
  return context.with(contextWithParent, callback);
}
