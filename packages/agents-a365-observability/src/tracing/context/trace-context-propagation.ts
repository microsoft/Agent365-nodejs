// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { context, propagation, Context } from '@opentelemetry/api';
import { ParentSpanRef } from './parent-span-context';

/**
 * Carrier type for HTTP headers used in trace context propagation.
 * Compatible with Node.js IncomingHttpHeaders and plain string maps.
 */
export type HeadersCarrier = Record<string, string | string[] | undefined>;

/**
 * A parent context for span creation. Accepts either:
 * - {@link ParentSpanRef}: explicit traceId/spanId pair (manual approach)
 * - {@link Context}: an OTel Context, typically from {@link extractContextFromHeaders} or `propagation.extract()`
 */
export type ParentContext = ParentSpanRef | Context;

/**
 * Type guard to distinguish a {@link ParentSpanRef} from an OTel {@link Context}.
 */
export function isParentSpanRef(value: ParentContext): value is ParentSpanRef {
  if (typeof value !== 'object' || value === null) return false;

  const maybeCtx = value as Context;
  if (
    typeof maybeCtx.getValue === 'function' &&
    typeof maybeCtx.setValue === 'function' &&
    typeof maybeCtx.deleteValue === 'function'
  ) {
    return false;
  }

  const maybeRef = value as ParentSpanRef;
  return (
    'traceId' in maybeRef &&
    typeof maybeRef.traceId === 'string' &&
    'spanId' in maybeRef &&
    typeof maybeRef.spanId === 'string'
  );
}

/**
 * Injects the current trace context (`traceparent`/`tracestate` headers) into
 * the provided headers object using the globally registered W3C propagator.
 *
 * @param headers Mutable object where trace context headers will be written.
 * @param ctx Optional OTel Context to inject from. Defaults to the active context.
 * @returns The same `headers` object, for chaining convenience.
 *
 * @example
 * ```typescript
 * const headers: Record<string, string> = {};
 * injectContextToHeaders(headers);
 * await fetch('http://service-b/process', { headers });
 * ```
 */
export function injectContextToHeaders(
  headers: Record<string, string>,
  ctx?: Context
): Record<string, string> {
  propagation.inject(ctx ?? context.active(), headers);
  return headers;
}

/**
 * Extracts trace context from incoming HTTP headers using the globally
 * registered W3C propagator. Returns an OTel {@link Context} that can be
 * passed to scope classes as a {@link ParentContext}.
 *
 * @param headers The incoming HTTP request headers containing `traceparent`/`tracestate`.
 * @param baseCtx Optional base context to extend. Defaults to the active context.
 * @returns An OTel Context containing the extracted trace information.
 *
 * @example
 * ```typescript
 * const parentCtx = extractContextFromHeaders(req.headers);
 * const scope = InvokeAgentScope.start(request, invokeAgentDetails, undefined, { parentContext: parentCtx });
 * ```
 */
export function extractContextFromHeaders(
  headers: HeadersCarrier,
  baseCtx?: Context
): Context {
  return propagation.extract(baseCtx ?? context.active(), headers);
}

/**
 * Extracts trace context from incoming HTTP headers and runs the callback
 * within that context. Any spans created inside the callback will be
 * parented to the extracted trace.
 *
 * @param headers The incoming HTTP request headers containing `traceparent`/`tracestate`.
 * @param callback The function to execute within the extracted context.
 * @returns The result of the callback.
 *
 * @example
 * ```typescript
 * runWithExtractedTraceContext(req.headers, () => {
 *   const scope = InvokeAgentScope.start({}, invokeAgentDetails);
 *   scope.dispose();
 * });
 * ```
 */
export function runWithExtractedTraceContext<T>(headers: HeadersCarrier, callback: () => T): T {
  return context.with(extractContextFromHeaders(headers), callback);
}
