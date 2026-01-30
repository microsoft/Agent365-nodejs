// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { PerRequestSpanProcessor } from '@microsoft/agents-a365-observability/src/tracing/PerRequestSpanProcessor';
import { runWithExportToken } from '@microsoft/agents-a365-observability/src/tracing/context/token-context';
import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { ExportResult, ExportResultCode } from '@opentelemetry/core';
import { context, trace } from '@opentelemetry/api';

describe('PerRequestSpanProcessor', () => {
  let provider: BasicTracerProvider;
  let processor: PerRequestSpanProcessor;
  let exportedSpans: ReadableSpan[][] = [];
  let mockExporter: SpanExporter;
  let originalEnv: NodeJS.ProcessEnv;

  const getActiveTraceCount = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const traces: Map<string, unknown> | undefined = (processor as any).traces;
    return traces?.size ?? 0;
  };

  beforeEach(() => {
    originalEnv = { ...process.env };
    exportedSpans = [];
    mockExporter = {
      export: (spans: ReadableSpan[], resultCallback: (result: ExportResult) => void) => {
        exportedSpans.push([...spans]);
        resultCallback({ code: ExportResultCode.SUCCESS });
      },
      shutdown: async () => {
        // No-op: provider shutdown is handled explicitly in afterEach.
      }
    };

    processor = new PerRequestSpanProcessor(mockExporter);
    provider = new BasicTracerProvider({
      spanProcessors: [processor]
    });
  });

  afterEach(async () => {
    await provider.shutdown();
    jest.useRealTimers();
    process.env = originalEnv;
  });

  const recreateProvider = async (newProcessor: PerRequestSpanProcessor) => {
    // Important: ensure old provider is fully shut down before replacing it.
    // Otherwise, providers/processors/timers can accumulate across a Jest run.
    await provider.shutdown();
    processor = newProcessor;
    provider = new BasicTracerProvider({
      spanProcessors: [processor]
    });
  };

  describe('per-request export with token context', () => {
    it('should cap the number of buffered traces (maxBufferedTraces)', async () => {
      process.env.A365_PER_REQUEST_MAX_TRACES = '2';
      await recreateProvider(new PerRequestSpanProcessor(mockExporter));

      const tracer = provider.getTracer('test');

      // The guardrail caps *concurrently buffered* traces. To make that observable,
      // keep trace-1 buffered (root ended but child still open) while starting trace-2.
      await new Promise<void>((resolve) => {
        runWithExportToken('token-1', () => {
          const root1 = tracer.startSpan('trace-1', { root: true });
          const ctx1 = trace.setSpan(context.active(), root1);
          const child1 = tracer.startSpan('trace-1-child', undefined, ctx1);

          // End root but leave child open so the trace remains buffered.
          root1.end();

          runWithExportToken('token-2', () => {
            const root2 = tracer.startSpan('trace-2');
            root2.end();
          });

          // Finish trace-1 so it can flush.
          setTimeout(() => {
            child1.end();
            setTimeout(resolve, 50);
          }, 10);
        });
      });

      // With max traces=2, both traces are allowed (trace-2 should NOT be dropped).
      const exportedNames = exportedSpans.flatMap((s) => s.map((sp) => sp.name));
      expect(exportedNames).toContain('trace-1');
      expect(exportedNames).toContain('trace-1-child');
      expect(exportedNames).toContain('trace-2');
    });

    it('should evict LRU trace when maxBufferedTraces exceeded', async () => {
      process.env.A365_PER_REQUEST_MAX_TRACES = '2';
      await recreateProvider(new PerRequestSpanProcessor(mockExporter));

      const tracer = provider.getTracer('test');

      // Create two traces with distinct activity times
      await new Promise<void>((resolve) => {
        runWithExportToken('token-1', () => {
          const root1 = tracer.startSpan('trace-1', { root: true });
          root1.end();
        });

        // Wait to ensure trace-1 is older than trace-2
        setTimeout(() => {
          runWithExportToken('token-2', () => {
            const root2 = tracer.startSpan('trace-2', { root: true });
            root2.end();
          });

          // Wait again, then start trace-3 which should evict trace-1 (LRU)
          setTimeout(() => {
            runWithExportToken('token-3', () => {
              const root3 = tracer.startSpan('trace-3', { root: true });
              root3.end();
            });

            setTimeout(resolve, 100);
          }, 50);
        }, 50);
      });

      const exportedNames = exportedSpans.flatMap((s) => s.map((sp) => sp.name));
      // All three traces should be exported
      // trace-1 was flushed before eviction (micro-batched on end)
      // When trace-3 starts, trace-1's entry is evicted from the map
      expect(exportedNames).toContain('trace-1');
      expect(exportedNames).toContain('trace-2');
      expect(exportedNames).toContain('trace-3');
    });

    it('should cap the number of buffered spans per trace (maxSpansPerTrace)', async () => {
      process.env.A365_PER_REQUEST_MAX_SPANS_PER_TRACE = '2';
      await recreateProvider(new PerRequestSpanProcessor(mockExporter));

      const tracer = provider.getTracer('test');

      await new Promise<void>((resolve) => {
        runWithExportToken('test-token', () => {
          const rootSpan = tracer.startSpan('root', { root: true });
          const ctxWithRoot = trace.setSpan(context.active(), rootSpan);

          const child1 = tracer.startSpan('child-1', undefined, ctxWithRoot);
          const child2 = tracer.startSpan('child-2', undefined, ctxWithRoot);
          child1.end();
          child2.end();
          // Ending root after 2 children makes the drop deterministic: root is the 3rd ended span.
          rootSpan.end();

          setTimeout(resolve, 50);
        });
      });

      // We exported a single trace flush, but only 2 ended spans should be buffered/exported.
      expect(exportedSpans.length).toBe(1);
      expect(exportedSpans[0].length).toBe(2);

      const exportedNames = exportedSpans[0].map((sp) => sp.name);
      expect(exportedNames).toContain('child-1');
      expect(exportedNames).toContain('child-2');
      expect(exportedNames).not.toContain('root');
    });

    it('should respect max concurrent exports (A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS)', async () => {
      process.env.A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS = '2';

      let inFlight = 0;
      let maxInFlight = 0;

      // Hold each export "in flight" for a bit. If concurrency limiting is broken,
      // all 3 exports would start immediately and maxInFlight would hit 3.
      const exportHoldMs = 50;

      exportedSpans = [];
      mockExporter = {
        export: (spans: ReadableSpan[], resultCallback: (result: ExportResult) => void) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          exportedSpans.push([...spans]);

          setTimeout(() => {
            inFlight -= 1;
            resultCallback({ code: ExportResultCode.SUCCESS });
          }, exportHoldMs);
        },
        shutdown: async () => {
          // No-op: provider shutdown is handled explicitly in afterEach.
        }
      };

      await recreateProvider(new PerRequestSpanProcessor(mockExporter));


      const tracer = provider.getTracer('test');

      // Create multiple independent traces that will flush around the same time.
      runWithExportToken('token-1', () => {
        const span = tracer.startSpan('trace-1');
        span.end();
      });
      runWithExportToken('token-2', () => {
        const span = tracer.startSpan('trace-2');
        span.end();
      });
      runWithExportToken('token-3', () => {
        const span = tracer.startSpan('trace-3');
        span.end();
      });

      // Wait long enough for 3 exports to be attempted and completed.
      await new Promise<void>((resolve) => setTimeout(resolve, exportHoldMs * 6));

      expect(maxInFlight).toBeLessThanOrEqual(2);
      const exportedNames = exportedSpans.flatMap((s) => s.map((sp) => sp.name));
      expect(exportedNames).toContain('trace-1');
      expect(exportedNames).toContain('trace-2');
      expect(exportedNames).toContain('trace-3');
    });

    it('should capture root span context and export under that context', async () => {
      const tracer = provider.getTracer('test');

      // Run within a context with a token set
      await new Promise<void>((resolve) => {
        runWithExportToken('test-token-123', () => {
          const rootSpan = tracer.startSpan('root-span');
          rootSpan.end();

          // Wait a bit for async processing
          setTimeout(() => {
            resolve();
          }, 100);
        });
      });

      expect(exportedSpans.length).toBeGreaterThan(0);
      expect(exportedSpans[0][0].name).toBe('root-span');
    });

    it('should collect multiple spans from a single trace', async () => {
      const tracer = provider.getTracer('test');

      await new Promise<void>((resolve) => {
        runWithExportToken('test-token', () => {
          const rootSpan = tracer.startSpan('root-span');
          const child1 = tracer.startSpan('child-1');
          const child2 = tracer.startSpan('child-2');

          child1.end();
          child2.end();
          rootSpan.end();

          setTimeout(() => {
            resolve();
          }, 100);
        });
      });

      expect(exportedSpans.length).toEqual(3);
      // Should have spans from the same trace exported together
      const spanNames = exportedSpans.flatMap((s: ReadableSpan[]) => s.map((span) => span.name));
      expect(spanNames).toContain('root-span');
      expect(spanNames).toContain('child-1');
      expect(spanNames).toContain('child-2');
    });

    it('should handle multiple independent traces', async () => {
      const tracer = provider.getTracer('test');

      await new Promise<void>((resolve) => {
        let completed = 0;
        const checkDone = () => {
          completed++;
          if (completed === 3) {
            setTimeout(() => {
              resolve();
            }, 100);
          }
        };

        runWithExportToken('token-1', () => {
          const span1 = tracer.startSpan('trace-1-span');
          span1.end();
          checkDone();
        });

        runWithExportToken('token-2', () => {
          const span2 = tracer.startSpan('trace-2-span');
          span2.end();
          checkDone();
        });

        runWithExportToken('token-3', () => {
          const span3 = tracer.startSpan('trace-3-span');
          span3.end();
          checkDone();
        });
      });

      // Should have collected 3 independent traces
      expect(exportedSpans.length).toBeGreaterThanOrEqual(3);
      // Verify we have different span names from different traces
      const spanNames = exportedSpans.flatMap((spans) => spans.map((s) => s.name));
      expect(spanNames).toContain('trace-1-span');
      expect(spanNames).toContain('trace-2-span');
      expect(spanNames).toContain('trace-3-span');
    });

    it('should correctly identify root spans', async () => {
      const tracer = provider.getTracer('test');

      await new Promise<void>((resolve) => {
        runWithExportToken('test-token', () => {
          const rootSpan = tracer.startSpan('actual-root');
          const childSpan = tracer.startSpan('child-of-root');
          const grandchildSpan = tracer.startSpan('grandchild');

          grandchildSpan.end();
          childSpan.end();
          rootSpan.end();

          setTimeout(() => {
            resolve();
          }, 100);
        });
      });

      expect(exportedSpans.length).toBe(3);
      // Verify the order: grandchild, child-of-root, actual-root
      expect(exportedSpans[0][0].name).toBe('grandchild');
      expect(exportedSpans[1][0].name).toBe('child-of-root');
      expect(exportedSpans[2][0].name).toBe('actual-root');
    });

    it('should export spans via micro-batching with setImmediate', async () => {
      exportedSpans = [];
      await recreateProvider(new PerRequestSpanProcessor(mockExporter));

      const tracer = provider.getTracer('test');

      await new Promise<void>((resolve) => {
        runWithExportToken('test-token', () => {
          const rootSpan = tracer.startSpan('root');
          const childSpan = tracer.startSpan('child');
          
          rootSpan.end();
          childSpan.end();
          
          // Spans should be exported via setImmediate (next tick)
          setTimeout(() => {
            resolve();
          }, 50);
        });
      });

      // Both spans should be exported (micro-batched)
      const exportedNames = exportedSpans.flatMap((s) => s.map((sp) => sp.name));
      expect(exportedNames).toContain('root');
      expect(exportedNames).toContain('child');
    });

    it('should handle forceFlush correctly', async () => {
      const tracer = provider.getTracer('test');

      runWithExportToken('test-token', () => {
        const rootSpan = tracer.startSpan('root');
        tracer.startSpan('child'); // Started but never ended

        rootSpan.end(); // Only root ends
        // Child span is started but never ended, so it won't be added to queue or exported
      });

      await processor.forceFlush();

      // Only the ended root span will be exported (child was never ended)
      expect(exportedSpans.length).toBe(1);
    });

    it('should retain trace entries to handle late-ending spans', async () => {
      const tracer = provider.getTracer('test');

      await new Promise<void>((resolve) => {
        runWithExportToken('test-token', () => {
          const rootSpan = tracer.startSpan('root', { root: true });
          const ctxWithRoot = trace.setSpan(context.active(), rootSpan);
          const childSpan = tracer.startSpan('child', undefined, ctxWithRoot);

          childSpan.end();
          rootSpan.end();

          setTimeout(() => resolve(), 100);
        });
      });

      // Traces are now retained to handle late spans (not deleted after flush)
      expect(getActiveTraceCount()).toBe(1);
    });

    it('should handle late-ending spans without dropping them', async () => {
      exportedSpans = [];
      await recreateProvider(new PerRequestSpanProcessor(mockExporter));

      const tracer = provider.getTracer('test');

      await new Promise<void>((resolve) => {
        runWithExportToken('test-token', () => {
          const rootSpan = tracer.startSpan('root', { root: true });
          const ctxWithRoot = trace.setSpan(context.active(), rootSpan);

          const child = tracer.startSpan('child', undefined, ctxWithRoot);

          // Root ends first
          rootSpan.end();

          // Child ends after a delay (simulates late-ending span)
          setTimeout(() => {
            child.end();
            setTimeout(resolve, 50);
          }, 100);
        });
      });

      // Both spans should be exported (no drops for late-ending spans)
      const exportedNames = exportedSpans.flatMap((s) => s.map((sp) => sp.name));
      expect(exportedNames).toContain('root');
      expect(exportedNames).toContain('child');
      expect(exportedSpans.length).toBeGreaterThanOrEqual(2);
    });

    it('should flush immediately when maxBatchSize is reached', async () => {
      process.env.A365_PER_REQUEST_MAX_BATCH_SIZE = '2';
      exportedSpans = [];
      await recreateProvider(new PerRequestSpanProcessor(mockExporter));

      const tracer = provider.getTracer('test');

      await new Promise<void>((resolve) => {
        runWithExportToken('test-token', () => {
          const rootSpan = tracer.startSpan('root');
          const child1 = tracer.startSpan('child-1');
          const child2 = tracer.startSpan('child-2');

          // End spans; first two should flush immediately when batch size reached
          rootSpan.end();
          child1.end(); // batch size = 2, should flush immediately

          setTimeout(() => {
            child2.end(); // should trigger another flush
            setTimeout(resolve, 50);
          }, 10);
        });
      });

      // All spans should be exported
      const exportedNames = exportedSpans.flatMap((s) => s.map((sp) => sp.name));
      expect(exportedNames).toContain('root');
      expect(exportedNames).toContain('child-1');
      expect(exportedNames).toContain('child-2');
    });
  });
});
