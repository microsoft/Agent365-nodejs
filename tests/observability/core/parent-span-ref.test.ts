// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { describe, it, expect, beforeEach, beforeAll, afterAll } from '@jest/globals';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace, context as otelContext } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  ParentSpanRef,
  runWithParentSpanRef,
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

  beforeAll(() => {
    // OTel API global tracer provider can only be set once per process.
    // Set it once for this test file, and reset the exporter per test for isolation.
    contextManager = new AsyncLocalStorageContextManager();
    contextManager.enable();
    otelContext.setGlobalContextManager(contextManager);

    exporter = new InMemorySpanExporter();
    const processor = new SimpleSpanProcessor(exporter);
    provider = new BasicTracerProvider({
      spanProcessors: [processor]
    });
    trace.setGlobalTracerProvider(provider);
  });

  beforeEach(() => {
    exporter.reset();
  });

  afterAll(async () => {
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

  it.each([
    [
      'InvokeAgentScope',
      (parentRef: ParentSpanRef) => {
        const invokeAgentDetails: InvokeAgentDetails = {
          agentId: 'test-agent',
          agentName: 'Test Agent',
        };
        return InvokeAgentScope.start(invokeAgentDetails, testTenantDetails, undefined, undefined, parentRef);
      },
      (name: string) => name.toLowerCase().includes('invokeagent') || name.toLowerCase().includes('invoke_agent'),
    ],
    [
      'InferenceScope',
      (parentRef: ParentSpanRef) => {
        const inferenceDetails: InferenceDetails = {
          operationName: InferenceOperationType.CHAT,
          model: 'gpt-4',
          providerName: 'openai',
        };
        return InferenceScope.start(inferenceDetails, testAgentDetails, testTenantDetails, undefined, undefined, parentRef);
      },
      (name: string) => name.toLowerCase().includes('chat'),
    ],
    [
      'ExecuteToolScope',
      (parentRef: ParentSpanRef) => {
        const toolDetails: ToolCallDetails = {
          toolName: 'test-tool',
          arguments: '{"param": "value"}',
        };
        return ExecuteToolScope.start(toolDetails, testAgentDetails, testTenantDetails, undefined, undefined, parentRef);
      },
      (name: string) => name.toLowerCase().includes('execute_tool'),
    ],
  ])('should create a child span with correct parent relationship (%s)', async (_label, createScope, nameMatches) => {
    const tracer = provider.getTracer('test');
    const rootSpan = tracer.startSpan('root-span');
    const parentSpanContext = rootSpan.spanContext();

    const parentRef: ParentSpanRef = {
      traceId: parentSpanContext.traceId,
      spanId: parentSpanContext.spanId,
    };

    const childScope = createScope(parentRef);
    expect(childScope.getSpanContext().traceId).toBe(parentSpanContext.traceId);

    childScope.dispose();
    rootSpan.end();

    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    const childSpan = spans.find((s) => nameMatches(s.name));
    expect(childSpan).toBeDefined();
    expect(childSpan!.spanContext().traceId).toBe(parentSpanContext.traceId);
    expect(childSpan!.parentSpanContext?.spanId).toBe(parentSpanContext.spanId);
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
    it('should return the span context from a scope (and be usable as ParentSpanRef)', async () => {
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

      // Create a ParentSpanRef from this scope and ensure it can parent another scope.
      const parentRef: ParentSpanRef = { traceId: spanContext.traceId, spanId: spanContext.spanId };
      const inferenceDetails: InferenceDetails = {
        operationName: InferenceOperationType.CHAT,
        model: 'gpt-4',
      };
      const childScope = InferenceScope.start(inferenceDetails, testAgentDetails, testTenantDetails, undefined, undefined, parentRef);
      expect(childScope.getSpanContext().traceId).toBe(spanContext.traceId);

      scope.dispose();
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
