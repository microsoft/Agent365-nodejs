// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, beforeAll, afterAll } from '@jest/globals';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace, context as otelContext, TraceFlags } from '@opentelemetry/api';
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
} from '@microsoft/agents-a365-observability';

describe('ParentSpanRef - Explicit Parent Span Support', () => {
  let provider: BasicTracerProvider;
  // The provider we should flush against (either the global SDK provider or our local fallback).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let flushProvider: any;
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

    // Prefer wiring our exporter into whatever global provider already exists.
    // OTel only allows setting the global tracer provider once; other test files may have done so.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const globalProvider: any = trace.getTracerProvider();
    if (globalProvider && typeof globalProvider.addSpanProcessor === 'function') {
      globalProvider.addSpanProcessor(processor);
      flushProvider = globalProvider;
    } else {
      provider = new BasicTracerProvider({
        spanProcessors: [processor]
      });
      trace.setGlobalTracerProvider(provider);
      flushProvider = provider;
    }
  });

  beforeEach(() => {
    exporter.reset();
  });

  afterAll(async () => {
    exporter.reset();
    await provider?.shutdown?.();
    contextManager.disable();
    otelContext.disable();
  });

  const testAgentDetails: AgentDetails = {
    agentId: 'test-agent',
    agentName: 'Test Agent',
    agentDescription: 'A test agent',
    conversationId: 'test-conv-123',
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
          details: {
            agentId: 'test-agent',
            agentName: 'Test Agent',
            tenantId: 'test-tenant-456'
          }
        };
        return InvokeAgentScope.start({}, invokeAgentDetails, undefined, { parentContext: parentRef });
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
        return InferenceScope.start(undefined, inferenceDetails, testAgentDetails, undefined, { parentContext: parentRef });
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
        return ExecuteToolScope.start(undefined, toolDetails, testAgentDetails, undefined, { parentContext: parentRef });
      },
      (name: string) => name.toLowerCase().includes('execute_tool'),
    ],
  ])('should create a child span with correct parent relationship (%s)', async (_label, createScope, nameMatches) => {
    const tracer = trace.getTracer('test');
    const rootSpan = tracer.startSpan('root-span');
    const parentSpanContext = rootSpan.spanContext();

    const parentRef: ParentSpanRef = {
      traceId: parentSpanContext.traceId,
      spanId: parentSpanContext.spanId,
    };

    const baseCtx = trace.setSpan(otelContext.active(), rootSpan);
    await otelContext.with(baseCtx, async () => {
      const childScope = createScope(parentRef);
      expect(childScope.getSpanContext().traceId).toBe(parentSpanContext.traceId);
      childScope.dispose();
    });

    rootSpan.end();

    await flushProvider.forceFlush();

    const spans = exporter.getFinishedSpans();
    const childSpan = spans.find((s) => nameMatches(s.name));
    expect(childSpan).toBeDefined();
    expect(childSpan!.spanContext().traceId).toBe(parentSpanContext.traceId);
    expect(childSpan!.parentSpanContext?.spanId).toBe(parentSpanContext.spanId);
  });

  describe('runWithParentSpanRef with nested scope creation', () => {
    it('should correctly parent spans created inside runWithParentSpanRef', async () => {
      const tracer = trace.getTracer('test');
      const rootSpan = tracer.startSpan('root-span');
      const parentSpanContext = rootSpan.spanContext();

      const parentRef: ParentSpanRef = {
        traceId: parentSpanContext.traceId,
        spanId: parentSpanContext.spanId,
      };

      // Ensure the sampled parent span is active so createContextWithParentSpanRef can derive traceFlags.
      const baseCtx = trace.setSpan(otelContext.active(), rootSpan);
      await otelContext.with(baseCtx, async () => {
        // Run a callback with parent context
        runWithParentSpanRef(parentRef, () => {
          // Create a scope inside - it should automatically inherit the parent
          const invokeAgentDetails: InvokeAgentDetails = {
            details: { agentId: 'nested-agent', tenantId: 'test-tenant-456' },
          };

          const nestedScope = InvokeAgentScope.start(
            {},
            invokeAgentDetails
          );

          const nestedSpanContext = nestedScope.getSpanContext();
          expect(nestedSpanContext.traceId).toBe(parentSpanContext.traceId);

          nestedScope.dispose();
        });
      });

      rootSpan.end();

      await flushProvider.forceFlush();

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
        details: { agentId: 'test-agent', tenantId: 'test-tenant-456' },
      };

      const scope = InvokeAgentScope.start({}, invokeAgentDetails);
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
      const activeParentSpan = trace.wrapSpanContext(spanContext);
      const baseCtx = trace.setSpan(otelContext.active(), activeParentSpan);
      const childScope = otelContext.with(baseCtx, () =>
        InferenceScope.start(undefined, inferenceDetails, testAgentDetails, undefined, { parentContext: parentRef })
      );
      expect(childScope.getSpanContext().traceId).toBe(spanContext.traceId);

      scope.dispose();
      childScope.dispose();

      await flushProvider.forceFlush();

      const spans = exporter.getFinishedSpans();
      const parentSpan = spans.find(s => s.name.toLowerCase().includes('invoke_agent'));
      const childSpan = spans.find(s => s.name.toLowerCase().includes('chat'));

      expect(parentSpan).toBeDefined();
      expect(childSpan).toBeDefined();
      expect(childSpan!.spanContext().traceId).toBe(parentSpan!.spanContext().traceId);
      expect(childSpan!.parentSpanContext?.spanId).toBe(parentSpan!.spanContext().spanId);
    });
  });

  describe('traceFlags propagation', () => {
    it('should record child spans when parentRef.traceFlags is SAMPLED', async () => {
      const parentRef: ParentSpanRef = {
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: '0123456789abcdef',
        traceFlags: TraceFlags.SAMPLED,
      };

      runWithParentSpanRef(parentRef, () => {
        const invokeAgentDetails: InvokeAgentDetails = {
          details: { agentId: 'sampled-agent', tenantId: 'test-tenant-456' },
        };

        const scope = InvokeAgentScope.start({}, invokeAgentDetails);
        scope.dispose();
      });

      await flushProvider.forceFlush();

      const spans = exporter.getFinishedSpans();
      const childSpan = spans.find(s =>
        s.name.toLowerCase().includes('invokeagent') || s.name.toLowerCase().includes('invoke_agent')
      );

      expect(childSpan).toBeDefined();
      expect(childSpan!.spanContext().traceId).toBe(parentRef.traceId);
      expect(childSpan!.parentSpanContext?.spanId).toBe(parentRef.spanId);
      expect(childSpan!.spanContext().traceFlags).toBe(TraceFlags.SAMPLED);
    });

    it('should not record child spans when parentRef.traceFlags is NONE', async () => {
      const parentRef: ParentSpanRef = {
        traceId: 'abcdef0123456789abcdef0123456789',
        spanId: 'abcdef0123456789',
        traceFlags: TraceFlags.NONE,
      };

      runWithParentSpanRef(parentRef, () => {
        const invokeAgentDetails: InvokeAgentDetails = {
          details: { agentId: 'unsampled-agent', tenantId: 'test-tenant-456' },
        };

        const scope = InvokeAgentScope.start({}, invokeAgentDetails);
        scope.dispose();
      });

      await flushProvider.forceFlush();

      const spans = exporter.getFinishedSpans();
      // When traceFlags is NONE, the span should still be created but not recorded/exported
      const childSpan = spans.find(s =>
        (s.name.toLowerCase().includes('invokeagent') || s.name.toLowerCase().includes('invoke_agent')) &&
        s.spanContext().traceId === parentRef.traceId
      );

      // The span should not be exported when traceFlags is NONE
      expect(childSpan).toBeUndefined();
    });

    it('should default to SAMPLED when parentRef.traceFlags is not provided and no active span matches', async () => {
      const parentRef: ParentSpanRef = {
        traceId: 'fedcba9876543210fedcba9876543210',
        spanId: 'fedcba9876543210',
        // traceFlags is not provided — should default to SAMPLED
      };

      runWithParentSpanRef(parentRef, () => {
        const invokeAgentDetails: InvokeAgentDetails = {
          details: { agentId: 'default-sampled-agent', tenantId: 'test-tenant-456' },
        };

        const scope = InvokeAgentScope.start({}, invokeAgentDetails);
        scope.dispose();
      });

      await flushProvider.forceFlush();

      const spans = exporter.getFinishedSpans();
      const childSpan = spans.find(s =>
        (s.name.toLowerCase().includes('invokeagent') || s.name.toLowerCase().includes('invoke_agent')) &&
        s.spanContext().traceId === parentRef.traceId
      );

      // Should be recorded when traceFlags defaults to SAMPLED
      expect(childSpan).toBeDefined();
      expect(childSpan!.spanContext().traceFlags).toBe(TraceFlags.SAMPLED);
    });

    it('should inherit traceFlags from active span when parentRef.traceFlags is not provided but traceId matches', async () => {
      const tracer = trace.getTracer('test');
      const rootSpan = tracer.startSpan('active-root-span');
      const parentSpanContext = rootSpan.spanContext();

      const parentRef: ParentSpanRef = {
        traceId: parentSpanContext.traceId,
        spanId: parentSpanContext.spanId,
        // traceFlags is not provided
      };

      const baseCtx = trace.setSpan(otelContext.active(), rootSpan);
      await otelContext.with(baseCtx, async () => {
        runWithParentSpanRef(parentRef, () => {
          const invokeAgentDetails: InvokeAgentDetails = {
            details: { agentId: 'inherited-flags-agent', tenantId: 'test-tenant-456' },
          };

          const scope = InvokeAgentScope.start({}, invokeAgentDetails);
          scope.dispose();
        });
      });

      rootSpan.end();

      await flushProvider.forceFlush();

      const spans = exporter.getFinishedSpans();
      const childSpan = spans.find(s =>
        (s.name.toLowerCase().includes('invokeagent') || s.name.toLowerCase().includes('invoke_agent')) &&
        s.spanContext().traceId === parentRef.traceId
      );

      // Should be recorded with traceFlags inherited from active span
      expect(childSpan).toBeDefined();
      expect(childSpan!.spanContext().traceFlags).toBe(parentSpanContext.traceFlags);
    });
  });
});
