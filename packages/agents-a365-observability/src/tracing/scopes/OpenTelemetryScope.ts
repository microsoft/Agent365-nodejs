// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { trace, SpanKind, Span, SpanStatusCode, context, AttributeValue, SpanContext, TimeInput } from '@opentelemetry/api';
import { OpenTelemetryConstants } from '../constants';
import { AgentDetails, UserDetails, SpanDetails } from '../contracts';
import { createContextWithParentSpanRef } from '../context/parent-span-context';
import { isParentSpanRef } from '../context/trace-context-propagation';
import logger from '../../utils/logging';

/**
 * Base class for OpenTelemetry tracing scopes
 */
export abstract class OpenTelemetryScope implements Disposable {
  private static readonly tracer = trace.getTracer(OpenTelemetryConstants.SOURCE_NAME);

  protected readonly span: Span;
  private readonly wallClockStartMs: number;
  private customStartTime?: TimeInput;
  private customEndTime?: TimeInput;
  private errorType?: string;
  private exception?: Error;
  private hasEnded = false;

  /**
   * Initializes a new instance of the OpenTelemetryScope class
   * @param operationName The name of the operation being traced
   * @param spanName The name of the span for display purposes
   * @param agentDetails Optional agent details. Tenant ID is read from `agentDetails.tenantId`.
   * @param spanDetails Optional span configuration including parent context, start/end times,
   *        span kind, and span links. Subclasses may override `spanDetails.spanKind` before
   *        calling this constructor; defaults to `SpanKind.CLIENT`.
   * @param userDetails Optional human caller identity details (id, upn, name, client ip).
   */
  protected constructor(
    operationName: string,
    spanName: string,
    agentDetails?: AgentDetails,
    spanDetails?: SpanDetails,
    userDetails?: UserDetails,
  ) {
    const parentContext = spanDetails?.parentContext;
    const startTime = spanDetails?.startTime;
    const endTime = spanDetails?.endTime;
    const spanLinks = spanDetails?.spanLinks;
    const kind = spanDetails?.spanKind ?? SpanKind.CLIENT;

    // Determine the context to use for span creation
    let currentContext = context.active();
    if (parentContext) {
      if (isParentSpanRef(parentContext)) {
        // Existing ParentSpanRef path (backward compatible)
        currentContext = createContextWithParentSpanRef(currentContext, parentContext);
        logger.info(`[A365Observability] Using explicit parent span: traceId=${parentContext.traceId}, spanId=${parentContext.spanId}`);
      } else {
        // OTel Context path (from extractContextFromHeaders or propagation.extract)
        currentContext = parentContext;
      }
    }

    logger.info(`[A365Observability] Starting span: ${spanName}, operation: ${operationName} for tenantId: ${agentDetails?.tenantId || 'unknown'}, agentId: ${agentDetails?.agentId || 'unknown'}`);

    // Start span with current context to establish parent-child relationship
    this.span = OpenTelemetryScope.tracer.startSpan(spanName, {
      kind,
      startTime,
      links: spanLinks,
      attributes: {
        [OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY]: operationName,
      },
    }, currentContext);

    logger.info(`[A365Observability] Span[${this.span.spanContext().spanId}] ${spanName}, operation: ${operationName} started successfully`);

    this.wallClockStartMs = Date.now();
    if (startTime !== undefined) {
      this.customStartTime = startTime;
    }
    this.customEndTime = endTime;

    // Set agent details if provided
    if (agentDetails) {
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY, agentDetails.agentId);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY, agentDetails.agentName);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_DESCRIPTION_KEY, agentDetails.agentDescription);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_PLATFORM_ID_KEY, agentDetails.platformId);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_ICON_URI_KEY, agentDetails.iconUri);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_AUID_KEY, agentDetails.agentAUID);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_EMAIL_KEY, agentDetails.agentEmail);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_BLUEPRINT_ID_KEY, agentDetails.agentBlueprintId);
    }

    // Set tenant ID from agent details
    this.setTagMaybe(OpenTelemetryConstants.TENANT_ID_KEY, agentDetails?.tenantId);

    // Set caller details if provided
    if (userDetails) {
      this.setTagMaybe(OpenTelemetryConstants.USER_ID_KEY, userDetails.userId);
      this.setTagMaybe(OpenTelemetryConstants.USER_EMAIL_KEY, userDetails.userEmail);
      this.setTagMaybe(OpenTelemetryConstants.USER_NAME_KEY, userDetails.userName);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CALLER_CLIENT_IP_KEY, userDetails.callerClientIp);
    }
  }

  /**
   * Makes this span active for the duration of the async callback execution
   */
  public withActiveSpanAsync<T>(callback: () => Promise<T>): Promise<T> {
    const newContext = trace.setSpan(context.active(), this.span);
    return context.with(newContext, callback);
  }

  /**
   * Gets the span context for this scope.
   * This can be used to create a ParentSpanRef for explicit parent-child linking across async boundaries.
   * @returns The SpanContext containing traceId and spanId
   */
  public getSpanContext(): SpanContext {
    return this.span.spanContext();
  }

  /**
   * Records an error that occurred during the operation
   * @param error The error that occurred
   */
  public recordError(error: Error): void {
    logger.error(`[A365Observability] Records an error that occurred during the operation span[${this.span.spanContext().spanId}]: ${error.message}`);
    // Check if it's an HTTP error with status code
    if ('status' in error && typeof error.status === 'number') {
      this.errorType = error.status.toString();
    } else {
      this.errorType = error.constructor.name;
    }

    this.exception = error;
    this.span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message
    });

    this.span.recordException(error);
  }

  /**
   * Records multiple attribute key/value pairs for telemetry tracking.
   * @param attributes Collection of attribute key/value pairs (array or iterable of [key, value] or object map).
   */
  public recordAttributes(attributes: Iterable<[string, AttributeValue]> | Record<string, AttributeValue> | null | undefined): void {
    if (!attributes) return;
    // Support both array/iterable of pairs and object maps
    if (Array.isArray(attributes)) {
      for (const [key, value] of attributes as Array<[string, AttributeValue]>) {
        if (!key || typeof key !== 'string' || !key.trim()) continue;
        this.span.setAttribute(key, value);
      }
    } else if (
      typeof attributes === 'object' &&
      typeof (attributes as Iterable<[string, AttributeValue]>)[Symbol.iterator] === 'function' &&
      !Array.isArray(attributes) &&
      typeof attributes !== 'string'
    ) {
      for (const [key, value] of attributes as Iterable<[string, AttributeValue]>) {
        if (!key || typeof key !== 'string' || !key.trim()) continue;
        this.span.setAttribute(key, value);
      }
    } else if (
      typeof attributes === 'object') {
      for (const key of Object.keys(attributes)) {
        if (!key || typeof key !== 'string' || !key.trim()) continue;
        this.span.setAttribute(key, (attributes as Record<string, AttributeValue>)[key]);
      }
    }
  }

  /**
   * Sets a tag on the span if the value is not null or undefined.
   * @param name The tag name
   * @param value The tag value
   */
  protected setTagMaybe<T extends string | number | boolean | string[] | number[]>(name: string, value: T | null | undefined): void {
    if (value != null) {
      this.span.setAttributes({ [name]: value as string | number | boolean | string[] | number[] });
    }
  }

  /**
   * Add baggage to the current context
   * @param key The baggage key
   * @param value The baggage value
   */
  protected addBaggage(key: string, value: string): void {
    // Note: OpenTelemetry JS doesn't have direct baggage API in span
    // This would typically be handled through the baggage API
    this.span.setAttributes({ [`baggage.${key}`]: value });
  }

  /**
   * Converts a `TimeInput` value to milliseconds since epoch.
   * OTel's `TimeInput` can be a `number` (ms epoch), a `Date`, or an `HrTime` tuple `[seconds, nanoseconds]`.
   */
  private static timeInputToMs(t: TimeInput): number {
    if (typeof t === 'number') return t;
    if (t instanceof Date) return t.getTime();
    if (Array.isArray(t) && t.length === 2) return t[0] * 1000 + t[1] / 1_000_000;
    logger.warn(`[A365Observability] timeInputToMs received unexpected TimeInput (type=${typeof t}, isArray=${Array.isArray(t)}); falling back to Date.now()`);
    return Date.now();
  }

  /**
   * Sets a custom end time for the scope.
   * When set, {@link dispose} will pass this value to `span.end()` instead of using the current wall-clock time.
   * This is useful when the actual end time of the operation is known before the scope is disposed.
   * @param endTime The end time as milliseconds since epoch, a Date, or an HrTime tuple.
   */
  public setEndTime(endTime: TimeInput): void {
    this.customEndTime = endTime;
  }

  /**
   * Records a cancellation event on the span.
   * Sets the span status to ERROR with the cancellation reason and marks the error type as 'TaskCanceledException'.
   * @param reason Optional cancellation reason. Defaults to 'Task was cancelled'.
   */
  public recordCancellation(reason?: string): void {
    const message = reason ?? 'Task was cancelled';
    logger.info(`[A365Observability] Recording cancellation on span[${this.span.spanContext().spanId}]: ${message}`);
    this.span.setStatus({
      code: SpanStatusCode.ERROR,
      message
    });
    this.errorType = OpenTelemetryConstants.ERROR_TYPE_CANCELLED;
  }

  /**
   * Finalizes the scope and records metrics
   */
  private end(): void {
    if (this.hasEnded) {
      logger.info(`[A365Observability] Span already ended for span[${this.span.spanContext().spanId}]`);
      return;
    }

    // Calculate duration: use custom start/end when provided, otherwise fall back to wall-clock.
    const startMs = this.customStartTime !== undefined
      ? OpenTelemetryScope.timeInputToMs(this.customStartTime)
      : this.wallClockStartMs;
    const endMs = this.customEndTime !== undefined
      ? OpenTelemetryScope.timeInputToMs(this.customEndTime)
      : Date.now();
    const durationMs = Math.max(0, endMs - startMs);

    if (this.errorType) {
      this.span.setAttributes({ [OpenTelemetryConstants.ERROR_TYPE_KEY]: this.errorType });
    }

    this.hasEnded = true;
    logger.info(`[A365Observability] Ending span[${this.span.spanContext().spanId}], duration: ${(durationMs / 1000).toFixed(3)}s`);
  }

  /**
   * Disposes the scope and finalizes telemetry data collection
   */
  public [Symbol.dispose](): void {
    if (!this.hasEnded) {
      this.end();
      if (this.customEndTime !== undefined) {
        this.span.end(this.customEndTime);
      } else {
        this.span.end();
      }
    }
  }

  /**
   * Legacy dispose method for compatibility
   */
  public dispose(): void {
    this[Symbol.dispose]();
  }

}
