// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { trace, SpanKind, Span, SpanStatusCode, Attributes, context } from '@opentelemetry/api';
import { OpenTelemetryConstants } from '../constants';
import { isAgent365TelemetryEnabled } from '../util';
import { EnhancedAgentDetails, TenantDetails } from '../contracts';
import logger from '../../utils/logging';

/**
 * Base class for OpenTelemetry tracing scopes
 */
export abstract class OpenTelemetryScope implements Disposable {
  private static readonly tracer = trace.getTracer(OpenTelemetryConstants.SOURCE_NAME);

  protected readonly span: Span;
  private readonly startTime: number;

  protected static enableTelemetry = isAgent365TelemetryEnabled();

  private errorType?: string;
  private exception?: Error;
  private hasEnded = false;

  /**
   * Initializes a new instance of the OpenTelemetryScope class
   * @param kind The kind of span (CLIENT, SERVER, INTERNAL, etc.)
   * @param operationName The name of the operation being traced
   * @param spanName The name of the span for display purposes
   * @param agentDetails Optional agent details
   * @param tenantDetails Optional tenant details
   */
  protected constructor(
    kind: SpanKind,
    operationName: string,
    spanName: string,
    agentDetails?: EnhancedAgentDetails,
    tenantDetails?: TenantDetails
  ) {
    const currentContext = context.active();
    logger.info(`[A365Observability] Starting span: ${spanName}, operation: ${operationName} for tenantId: ${tenantDetails?.tenantId || 'unknown'}, agentId: ${agentDetails?.agentId || 'unknown'}`);

    // Start span with current context to establish parent-child relationship
    this.span = OpenTelemetryScope.tracer.startSpan(spanName, {
      kind,
      attributes: {
        [OpenTelemetryConstants.GEN_AI_SYSTEM_KEY]: OpenTelemetryConstants.GEN_AI_SYSTEM_VALUE,
        [OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY]: operationName,
      },
    }, currentContext);

    logger.info(`[A365Observability] Span[${this.span.spanContext().spanId}] ${spanName}, operation: ${operationName} started successfully`);

    this.startTime = Date.now();

    // Set agent details if provided
    if (agentDetails) {
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY, agentDetails.agentId);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY, agentDetails.agentName);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_DESCRIPTION_KEY, agentDetails.agentDescription);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, agentDetails.conversationId);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_ICON_URI_KEY, agentDetails.iconUri);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_AUID_KEY, agentDetails.agentAUID);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_UPN_KEY, agentDetails.agentUPN);
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_AGENT_BLUEPRINT_ID_KEY, agentDetails.agentBlueprintId);
    }

    // Set tenant details if provided
    if (tenantDetails) {
      this.setTagMaybe(OpenTelemetryConstants.TENANT_ID_KEY, tenantDetails.tenantId);
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
   * Records an error that occurred during the operation
   * @param error The error that occurred
   */
  public recordError(error: Error): void {
    if (OpenTelemetryScope.enableTelemetry) {
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
  }

  /**
   * Records multiple attribute key/value pairs for telemetry tracking.
   * @param attributes Collection of attribute key/value pairs (array or iterable of [key, value] or object map).
   */
  public recordAttributes(attributes: Iterable<[string, any]> | Record<string, any> | null | undefined): void {
    if (!attributes) return;
    // Support both array/iterable of pairs and object maps
    if (Array.isArray(attributes) || (typeof (attributes as any)[Symbol.iterator] === 'function' && typeof attributes !== 'string')) {
      for (const [key, value] of attributes as Iterable<[string, any]>) {
        if (!key || typeof key !== 'string' || !key.trim()) continue;
        this.span.setAttribute(key, value);
      }
    } else if (typeof attributes === 'object') {
      for (const key of Object.keys(attributes)) {
        if (!key || typeof key !== 'string' || !key.trim()) continue;
        this.span.setAttribute(key, (attributes as Record<string, any>)[key]);
      }
    }
  }

  /**
   * Sets a tag on the span if telemetry is enabled
   * @param name The tag name
   * @param value The tag value
   */
  protected setTagMaybe<T extends string | number | boolean>(name: string, value: T | null | undefined): void {
    if (OpenTelemetryScope.enableTelemetry && value != null) {
      this.span.setAttributes({ [name]: value as string | number | boolean });
    }
  }

  /**
   * Add baggage to the current context
   * @param key The baggage key
   * @param value The baggage value
   */
  protected addBaggage(key: string, value: string): void {
    if (OpenTelemetryScope.enableTelemetry) {
      // Note: OpenTelemetry JS doesn't have direct baggage API in span
      // This would typically be handled through the baggage API
      this.span.setAttributes({ [`baggage.${key}`]: value });
    }
  }

  /**
   * Finalizes the scope and records metrics
   */
  private end(): void {
    if (this.hasEnded) {
      logger.info(`[A365Observability] Span already ended for span[${this.span.spanContext().spanId}]`);
      return;
    }

    const duration = (Date.now() - this.startTime) / 1000; // Convert to seconds

    const finalTags:Attributes = {};
    if (this.errorType) {
      finalTags[OpenTelemetryConstants.ERROR_TYPE_KEY] = this.errorType;
      this.span.setAttributes({ [OpenTelemetryConstants.ERROR_TYPE_KEY]: this.errorType });
    }

    // Record duration metric (would typically use a meter here)
    // For now, we'll add it as a span attribute
    this.span.setAttributes({ 'operation.duration': duration });

    this.hasEnded = true;
    logger.info(`[A365Observability] Ending span[${this.span.spanContext().spanId}], duration: ${duration}s`);
  }

  /**
   * Disposes the scope and finalizes telemetry data collection
   */
  public [Symbol.dispose](): void {
    if (!this.hasEnded) {
      this.end();
      this.span.end();
    }
  }

  /**
   * Legacy dispose method for compatibility
   */
  public dispose(): void {
    this[Symbol.dispose]();
  }

}
