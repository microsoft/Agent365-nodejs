// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace, context as otelContext } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  ParentSpanRef,
  runWithParentSpanRef,
  createContextWithParentSpanRef,
  InvokeAgentScope,
  InferenceScope,
  ExecuteToolScope,
  InvokeAgentDetails,
  InferenceDetails,
  InferenceOperationType,
  ToolCallDetails,
  AgentDetails,
  TenantDetails,
} from '@microsoft/agents-a365-observability';

describe('ParentSpanRef - Explicit Parent Span Support', () => {
  let provider: BasicTracerProvider;
  let exporter: InMemorySpanExporter;
  let contextManager: AsyncLocalStorageContextManager;

  beforeEach(() => {
    // Set up context manager
    contextManager = new AsyncLocalStorageContextManager();
    contextManager.enable();
    otelContext.setGlobalContextManager(contextManager);

    // Set up tracing provider with in-memory exporter for testing
    exporter = new InMemorySpanExporter();
    const processor = new SimpleSpanProcessor(exporter);
    provider = new BasicTracerProvider({
      spanProcessors: [processor]
    });
    // Register provider globally so OpenTelemetryScope can use it
    trace.setGlobalTracerProvider(provider);
  });

  afterEach(async () => {
    // Clean up - reset exporter before shutting down
    exporter.reset();
    await provider.shutdown();
    contextManager.disable();
  });

  const testAgentDetails: AgentDetails = {
    agentId: 'test-agent',
    agentName: 'Test Agent',
    agentDescription: 'A test agent',
    conversationId: 'test-conv-123'
  };

  const testTenantDetails: TenantDetails = {
    tenantId: 'test-tenant-456'
  };

  describe('createContextWithParentSpanRef', () => {
    it('should create a context with parent span reference', () => {
      const parentRef: ParentSpanRef = {
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: '0123456789abcdef',
      };

      const baseContext = otelContext.active();
      const newContext = createContextWithParentSpanRef(baseContext, parentRef);

      expect(newContext).toBeDefined();
      expect(newContext).not.toBe(baseContext);
    });

    it('should use default trace flags when not provided', () => {
      const parentRef: ParentSpanRef = {
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: '0123456789abcdef',
      };

      const baseContext = otelContext.active();
      const newContext = createContextWithParentSpanRef(baseContext, parentRef);

      expect(newContext).toBeDefined();
    });
  });

  describe('runWithParentSpanRef', () => {
    it('should execute callback with parent span context', () => {
      const parentRef: ParentSpanRef = {
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: '0123456789abcdef',
      };

      let executed = false;
      const result = runWithParentSpanRef(parentRef, () => {
        executed = true;
        return 'test-result';
      });

      expect(executed).toBe(true);
      expect(result).toBe('test-result');
    });
  });

  describe('InvokeAgentScope with parentSpanRef', () => {
    it('should create a child span with correct parent relationship', async () => {
      // Create a root span to get a parent reference
      const tracer = provider.getTracer('test');
      const rootSpan = tracer.startSpan('root-span');
      const parentSpanContext = rootSpan.spanContext();
      
      const parentRef: ParentSpanRef = {
        traceId: parentSpanContext.traceId,
        spanId: parentSpanContext.spanId,
      };

      // Create a child scope with explicit parent reference
      const invokeAgentDetails: InvokeAgentDetails = {
        agentId: 'test-agent',
        agentName: 'Test Agent',
      };

      const childScope = InvokeAgentScope.start(
        invokeAgentDetails,
        testTenantDetails,
        undefined,
        undefined,
        parentRef
      );

      // Get the child span context
      const childSpanContext = childScope.getSpanContext();

      // Verify trace ID is the same
      expect(childSpanContext.traceId).toBe(parentSpanContext.traceId);

      // Dispose scopes
      childScope.dispose();
      rootSpan.end();

      // Force flush to ensure all spans are exported
      await provider.forceFlush();

      // Export and verify spans
      const spans = exporter.getFinishedSpans();
      expect(spans.length).toBeGreaterThanOrEqual(2);

      // Find the child span (case-insensitive search)
      const childSpan = spans.find(s => s.name.toLowerCase().includes('invokeagent') || s.name.includes('invoke_agent'));
      expect(childSpan).toBeDefined();
      expect(childSpan!.spanContext().traceId).toBe(parentSpanContext.traceId);
      expect(childSpan!.parentSpanContext?.spanId).toBe(parentSpanContext.spanId);
    });
  });

  describe('InferenceScope with parentSpanRef', () => {
    it('should create a child span with correct parent relationship', async () => {
      const tracer = provider.getTracer('test');
      const rootSpan = tracer.startSpan('root-span');
      const parentSpanContext = rootSpan.spanContext();
      
      const parentRef: ParentSpanRef = {
        traceId: parentSpanContext.traceId,
        spanId: parentSpanContext.spanId,
      };

      const inferenceDetails: InferenceDetails = {
        operationName: InferenceOperationType.CHAT,
        model: 'gpt-4',
        providerName: 'openai',
      };

      const childScope = InferenceScope.start(
        inferenceDetails,
        testAgentDetails,
        testTenantDetails,
        undefined,
        undefined,
        parentRef
      );

      const childSpanContext = childScope.getSpanContext();
      expect(childSpanContext.traceId).toBe(parentSpanContext.traceId);

      childScope.dispose();
      rootSpan.end();

      await provider.forceFlush();

      const spans = exporter.getFinishedSpans();
      const childSpan = spans.find(s => s.name.toLowerCase().includes('chat'));
      expect(childSpan).toBeDefined();
      expect(childSpan!.spanContext().traceId).toBe(parentSpanContext.traceId);
      expect(childSpan!.parentSpanContext?.spanId).toBe(parentSpanContext.spanId);
    });
  });

  describe('ExecuteToolScope with parentSpanRef', () => {
    it('should create a child span with correct parent relationship', async () => {
      const tracer = provider.getTracer('test');
      const rootSpan = tracer.startSpan('root-span');
      const parentSpanContext = rootSpan.spanContext();
      
      const parentRef: ParentSpanRef = {
        traceId: parentSpanContext.traceId,
        spanId: parentSpanContext.spanId,
      };

      const toolDetails: ToolCallDetails = {
        toolName: 'test-tool',
        arguments: '{"param": "value"}',
      };

      const childScope = ExecuteToolScope.start(
        toolDetails,
        testAgentDetails,
        testTenantDetails,
        undefined,
        undefined,
        parentRef
      );

      const childSpanContext = childScope.getSpanContext();
      expect(childSpanContext.traceId).toBe(parentSpanContext.traceId);

      childScope.dispose();
      rootSpan.end();

      await provider.forceFlush();

      const spans = exporter.getFinishedSpans();
      const childSpan = spans.find(s => s.name.includes('execute_tool'));
      expect(childSpan).toBeDefined();
      expect(childSpan!.spanContext().traceId).toBe(parentSpanContext.traceId);
      expect(childSpan!.parentSpanContext?.spanId).toBe(parentSpanContext.spanId);
    });
  });

  describe('runWithParentSpanRef with nested scope creation', () => {
    it('should correctly parent spans created inside runWithParentSpanRef', async () => {
      const tracer = provider.getTracer('test');
      const rootSpan = tracer.startSpan('root-span');
      const parentSpanContext = rootSpan.spanContext();
      
      const parentRef: ParentSpanRef = {
        traceId: parentSpanContext.traceId,
        spanId: parentSpanContext.spanId,
      };

      // Run a callback with parent context
      runWithParentSpanRef(parentRef, () => {
        // Create a scope inside - it should automatically inherit the parent
        const invokeAgentDetails: InvokeAgentDetails = {
          agentId: 'nested-agent',
        };

        const nestedScope = InvokeAgentScope.start(
          invokeAgentDetails,
          testTenantDetails
        );

        const nestedSpanContext = nestedScope.getSpanContext();
        expect(nestedSpanContext.traceId).toBe(parentSpanContext.traceId);

        nestedScope.dispose();
      });

      rootSpan.end();

      await provider.forceFlush();

      const spans = exporter.getFinishedSpans();
      const nestedSpan = spans.find(s => s.name.includes('invoke_agent'));
      expect(nestedSpan).toBeDefined();
      expect(nestedSpan!.spanContext().traceId).toBe(parentSpanContext.traceId);
      expect(nestedSpan!.parentSpanContext?.spanId).toBe(parentSpanContext.spanId);
    });
  });

  describe('getSpanContext method', () => {
    it('should return the span context from a scope', () => {
      const invokeAgentDetails: InvokeAgentDetails = {
        agentId: 'test-agent',
      };

      const scope = InvokeAgentScope.start(invokeAgentDetails, testTenantDetails);
      const spanContext = scope.getSpanContext();

      expect(spanContext).toBeDefined();
      expect(spanContext.traceId).toBeDefined();
      expect(spanContext.spanId).toBeDefined();
      expect(spanContext.traceId.length).toBe(32); // 32 hex chars
      expect(spanContext.spanId.length).toBe(16); // 16 hex chars

      scope.dispose();
    });

    it('should allow creating a ParentSpanRef from a scope', async () => {
      const invokeAgentDetails: InvokeAgentDetails = {
        agentId: 'parent-agent',
      };

      const parentScope = InvokeAgentScope.start(invokeAgentDetails, testTenantDetails);
      const parentSpanContext = parentScope.getSpanContext();

      // Create a ParentSpanRef from the scope
      const parentRef: ParentSpanRef = {
        traceId: parentSpanContext.traceId,
        spanId: parentSpanContext.spanId,
      };

      expect(parentRef.traceId).toBe(parentSpanContext.traceId);
      expect(parentRef.spanId).toBe(parentSpanContext.spanId);

      // Now create a child scope using this reference
      const inferenceDetails: InferenceDetails = {
        operationName: InferenceOperationType.CHAT,
        model: 'gpt-4',
      };

      const childScope = InferenceScope.start(
        inferenceDetails,
        testAgentDetails,
        testTenantDetails,
        undefined,
        undefined,
        parentRef
      );

      const childSpanContext = childScope.getSpanContext();
      expect(childSpanContext.traceId).toBe(parentSpanContext.traceId);

      parentScope.dispose();
      childScope.dispose();

      await provider.forceFlush();

      const spans = exporter.getFinishedSpans();
      const parentSpan = spans.find(s => s.name.toLowerCase().includes('invoke_agent'));
      const childSpan = spans.find(s => s.name.toLowerCase().includes('chat'));
      
      expect(parentSpan).toBeDefined();
      expect(childSpan).toBeDefined();
      expect(childSpan!.spanContext().traceId).toBe(parentSpan!.spanContext().traceId);
      expect(childSpan!.parentSpanContext?.spanId).toBe(parentSpan!.spanContext().spanId);
    });
  });
});
