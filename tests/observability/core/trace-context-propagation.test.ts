// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, beforeAll, afterAll } from '@jest/globals';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace, context as otelContext, propagation, TraceFlags } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
  ParentSpanRef,
  injectTraceContext,
  extractTraceContext,
  runWithExtractedTraceContext,
  isParentSpanRef,
  InvokeAgentScope,
  TenantDetails,
} from '@microsoft/agents-a365-observability';

describe('Trace Context Propagation', () => {
  let provider: BasicTracerProvider;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let flushProvider: any;
  let exporter: InMemorySpanExporter;
  let contextManager: AsyncLocalStorageContextManager;

  const testTenantDetails: TenantDetails = { tenantId: 'test-tenant' };

  beforeAll(() => {
    contextManager = new AsyncLocalStorageContextManager();
    contextManager.enable();
    otelContext.setGlobalContextManager(contextManager);
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());

    exporter = new InMemorySpanExporter();
    const processor = new SimpleSpanProcessor(exporter);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const globalProvider: any = trace.getTracerProvider();
    if (globalProvider && typeof globalProvider.addSpanProcessor === 'function') {
      globalProvider.addSpanProcessor(processor);
      flushProvider = globalProvider;
    } else {
      provider = new BasicTracerProvider({ spanProcessors: [processor] });
      trace.setGlobalTracerProvider(provider);
      flushProvider = provider;
    }
  });

  beforeEach(() => exporter.reset());

  afterAll(async () => {
    exporter.reset();
    await provider?.shutdown?.();
    contextManager.disable();
    otelContext.disable();
  });

  describe('isParentSpanRef', () => {
    it('should return true for ParentSpanRef', () => {
      expect(isParentSpanRef({ traceId: '0123456789abcdef0123456789abcdef', spanId: '0123456789abcdef' })).toBe(true);
    });

    it('should return false for OTel Context', () => {
      expect(isParentSpanRef(otelContext.active())).toBe(false);
    });
  });

  describe('injectTraceContext', () => {
    it('should inject traceparent header from active span', () => {
      const tracer = trace.getTracer('test');
      const span = tracer.startSpan('sender');
      const { traceId, spanId, traceFlags } = span.spanContext();
      const ctx = trace.setSpan(otelContext.active(), span);

      otelContext.with(ctx, () => {
        const headers: Record<string, string> = {};
        const result = injectTraceContext(headers);
        expect(result).toBe(headers);

        const traceparent = headers['traceparent'];
        expect(traceparent).toBeDefined();

        // W3C traceparent format: {version}-{trace-id}-{parent-id}-{trace-flags}
        const parts = traceparent.split('-');
        expect(parts).toHaveLength(4);
        expect(parts[0]).toBe('00'); // version
        expect(parts[1]).toBe(traceId);
        expect(parts[2]).toBe(spanId);
        expect(parts[3]).toBe(traceFlags.toString(16).padStart(2, '0'));
      });

      span.end();
    });

    it('should be a no-op when no active span exists', () => {
      const headers: Record<string, string> = {};
      injectTraceContext(headers);
      expect(headers['traceparent']).toBeUndefined();
    });
  });

  describe('extractTraceContext', () => {
    it('should extract valid traceparent into Context with correct traceId/spanId', () => {
      const traceId = '0af7651916cd43dd8448eb211c80319c';
      const spanId = 'b7ad6b7169203331';

      const extracted = extractTraceContext({ traceparent: `00-${traceId}-${spanId}-01` });
      const span = trace.getSpan(extracted);

      expect(span).toBeDefined();
      expect(span!.spanContext().traceId).toBe(traceId);
      expect(span!.spanContext().spanId).toBe(spanId);
      expect(span!.spanContext().traceFlags).toBe(TraceFlags.SAMPLED);
    });

    it('should return base context for missing or malformed headers', () => {
      expect(trace.getSpan(extractTraceContext({}))).toBeUndefined();
      expect(trace.getSpan(extractTraceContext({ traceparent: 'invalid' }))).toBeUndefined();
    });
  });

  describe('end-to-end inject → extract round-trip', () => {
    it('should preserve trace and parent-child relationship across services', async () => {
      const tracer = trace.getTracer('test');
      const senderSpan = tracer.startSpan('sender');
      const senderCtx = trace.setSpan(otelContext.active(), senderSpan);

      const headers: Record<string, string> = {};
      otelContext.with(senderCtx, () => injectTraceContext(headers));

      const result = runWithExtractedTraceContext(headers, () => {
        const child = tracer.startSpan('receiver');
        expect(child.spanContext().traceId).toBe(senderSpan.spanContext().traceId);
        child.end();
        return 'ok';
      });
      expect(result).toBe('ok');

      senderSpan.end();
      await flushProvider.forceFlush();

      const spans = exporter.getFinishedSpans();
      const receiver = spans.find(s => s.name === 'receiver');
      expect(receiver!.spanContext().traceId).toBe(senderSpan.spanContext().traceId);
      expect(receiver!.parentSpanContext?.spanId).toBe(senderSpan.spanContext().spanId);
    });
  });

  describe('scope with extracted Context as ParentContext', () => {
    it('should create scope as child of extracted trace context', async () => {
      const traceId = '0af7651916cd43dd8448eb211c80319c';
      const spanId = 'b7ad6b7169203331';
      const extractedCtx = extractTraceContext({ traceparent: `00-${traceId}-${spanId}-01` });

      const scope = InvokeAgentScope.start({ agentId: 'ctx-agent' }, testTenantDetails, undefined, undefined, extractedCtx);
      expect(scope.getSpanContext().traceId).toBe(traceId);
      scope.dispose();

      await flushProvider.forceFlush();

      const span = exporter.getFinishedSpans().find(s => s.name.toLowerCase().includes('invoke_agent'));
      expect(span!.parentSpanContext?.spanId).toBe(spanId);
    });
  });

  describe('ParentSpanRef with isRemote', () => {
    it('should propagate isRemote=true to child span parentSpanContext', async () => {
      const parentRef: ParentSpanRef = {
        traceId: '3af7651916cd43dd8448eb211c80319c',
        spanId: 'e7ad6b7169203331',
        traceFlags: TraceFlags.SAMPLED,
        isRemote: true,
      };

      const scope = InvokeAgentScope.start({ agentId: 'remote-agent' }, testTenantDetails, undefined, undefined, parentRef);
      scope.dispose();

      await flushProvider.forceFlush();

      const span = exporter.getFinishedSpans().find(s => s.spanContext().traceId === parentRef.traceId);
      expect(span!.parentSpanContext?.spanId).toBe(parentRef.spanId);
      expect(span!.parentSpanContext?.isRemote).toBe(true);
    });
  });
});
