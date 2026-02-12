// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { PerRequestSpanProcessor } from '@microsoft/agents-a365-observability/src/tracing/PerRequestSpanProcessor';
import { runWithExportToken, updateExportToken, getExportToken } from '@microsoft/agents-a365-observability/src/tracing/context/token-context';
import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { ExportResult, ExportResultCode } from '@opentelemetry/core';
import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

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

    it('should drop additional traces beyond maxBufferedTraces (drop case)', async () => {
      process.env.A365_PER_REQUEST_MAX_TRACES = '2';
      await recreateProvider(new PerRequestSpanProcessor(mockExporter));

      const tracer = provider.getTracer('test');

      // Keep two traces buffered (root ended but child still open), then attempt a third.
      await new Promise<void>((resolve) => {
        runWithExportToken('token-1', () => {
          const root1 = tracer.startSpan('trace-1', { root: true });
          const ctx1 = trace.setSpan(context.active(), root1);
          const child1 = tracer.startSpan('trace-1-child', undefined, ctx1);
          root1.end();

          runWithExportToken('token-2', () => {
            const root2 = tracer.startSpan('trace-2', { root: true });
            const ctx2 = trace.setSpan(context.active(), root2);
            const child2 = tracer.startSpan('trace-2-child', undefined, ctx2);
            root2.end();

            // This third trace should be dropped because two traces are already buffered.
            runWithExportToken('token-3', () => {
              const root3 = tracer.startSpan('trace-3', { root: true });
              root3.end();
            });

            // Finish the buffered traces so they can flush.
            setTimeout(() => {
              child2.end();
              child1.end();
              setTimeout(resolve, 50);
            }, 10);
          });
        });
      });

      const exportedNames = exportedSpans.flatMap((s) => s.map((sp) => sp.name));
      expect(exportedNames).toContain('trace-1');
      expect(exportedNames).toContain('trace-1-child');
      expect(exportedNames).toContain('trace-2');
      expect(exportedNames).toContain('trace-2-child');
      expect(exportedNames).not.toContain('trace-3');
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

    it('should export with refreshed token when updateExportToken is called before root span ends', async () => {
      const contextManager = new AsyncLocalStorageContextManager();
      contextManager.enable();
      context.setGlobalContextManager(contextManager);

      try {
        let authorizationHeader: string | undefined;
        const tokenCapturingExporter: SpanExporter = {
          export: (spans: ReadableSpan[], resultCallback: (result: ExportResult) => void) => {
            const token = getExportToken() ?? null;
            if (token) {
              authorizationHeader = `Bearer ${token}`;
            }
            exportedSpans.push([...spans]);
            resultCallback({ code: ExportResultCode.SUCCESS });
          },
          shutdown: async () => {}
        };
        await recreateProvider(new PerRequestSpanProcessor(tokenCapturingExporter));
        const tracer = provider.getTracer('test');

        await new Promise<void>((resolve) => {
          runWithExportToken('initial-token', () => {
            const rootSpan = tracer.startSpan('long-running-root');
            const child = tracer.startSpan('child-work');
            child.end();
            updateExportToken('refreshed-token');

            // Root ends → triggers flushTrace which restores rootCtx and calls exporter
            rootSpan.end();

            setTimeout(() => resolve(), 100);
          });
        });

        // Verify the exporter built the auth header with the refreshed token,
        // proving the mutable TokenHolder was visible through the restored rootCtx
        expect(exportedSpans.length).toBeGreaterThanOrEqual(1);
        expect(authorizationHeader).toBe('Bearer refreshed-token');
      } finally {
        contextManager.disable();
        context.disable();
      }
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

    it('should respect custom grace flush timeout', async () => {
      exportedSpans = [];
      const customGrace = 30;
      await recreateProvider(new PerRequestSpanProcessor(mockExporter, customGrace));

      const tracer = provider.getTracer('test');

      await new Promise<void>((resolve) => {
        runWithExportToken('test-token', () => {
          const rootSpan = tracer.startSpan('root');
          const childSpan = tracer.startSpan('child');
          
          rootSpan.end(); // Root ends, child still pending
          
          setTimeout(() => {
            childSpan.end(); // Child ends after grace period should flush
            setTimeout(() => {
              resolve();
            }, 50);
          }, 50);
        });
      });

      expect(exportedSpans.length).toEqual(2);
    });

    it('should handle forceFlush correctly', async () => {
      const tracer = provider.getTracer('test');

      runWithExportToken('test-token', () => {
        const rootSpan = tracer.startSpan('root');
        tracer.startSpan('child');

        rootSpan.end(); // Root ends, child pending
        // Don't end child - let forceFlush handle it
      });

      await processor.forceFlush();

      expect(exportedSpans.length).toBe(1);
    });

    it('should not retain trace buffers after trace completion', async () => {
      const tracer = provider.getTracer('test');

      await new Promise<void>((resolve) => {
        runWithExportToken('test-token', () => {
          const rootSpan = tracer.startSpan('root');
          const childSpan = tracer.startSpan('child');

          childSpan.end();
          rootSpan.end();

          setTimeout(() => resolve(), 100);
        });
      });

      expect(getActiveTraceCount()).toBe(0);
    });

    it('should drop trace buffers after grace flush if children never end', async () => {
      exportedSpans = [];
      const customGrace = 10;
      const customMaxAge = 1000;

      await recreateProvider(new PerRequestSpanProcessor(mockExporter, customGrace, customMaxAge));

      const tracer = provider.getTracer('test');

      // Make the sweep deterministic by controlling time and invoking sweep directly.
      let now = 1_000_000;
      const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
      try {
        runWithExportToken('test-token', () => {
          const rootSpan = tracer.startSpan('root', { root: true });
          const ctxWithRoot = trace.setSpan(context.active(), rootSpan);

          // Start a child span in the same trace and never end it.
          // Pass ctxWithRoot explicitly so we don't depend on a global context manager.
          tracer.startSpan('child', undefined, ctxWithRoot);

          rootSpan.end();
        });

        // Should have exactly one trace buffered (root + child share traceId).
        expect(getActiveTraceCount()).toBe(1);

        // Validate the trace is in the expected lifecycle state.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const traces: Map<string, any> = (processor as any).traces;
        const buf = [...traces.values()][0];
        expect(buf.rootEnded).toBe(true);
        expect(buf.openCount).toBeGreaterThan(0);
        expect(buf.rootEndedAtMs).toBeDefined();

        // Avoid races with the background interval sweeper; drive sweep manually.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sweepTimer: any = (processor as any).sweepTimer;
        if (sweepTimer) {
          clearInterval(sweepTimer);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (processor as any).sweepTimer = undefined;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (processor as any).isSweeping = false;

        now += customGrace + 1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (processor as any).sweep();

        expect(getActiveTraceCount()).toBe(0);
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('should drop trace buffers after max trace age even if no spans end (prevents unbounded growth)', async () => {
      exportedSpans = [];
      const customGrace = 250;
      const customMaxAge = 10;

      await recreateProvider(new PerRequestSpanProcessor(mockExporter, customGrace, customMaxAge));

      const tracer = provider.getTracer('test');

      let now = 2_000_000;
      const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
      try {
        runWithExportToken('test-token', () => {
          tracer.startSpan('root-never-ended');
        });

        expect(getActiveTraceCount()).toBe(1);

        now += customMaxAge + 1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (processor as any).sweep();

        expect(getActiveTraceCount()).toBe(0);
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('should use default values when env vars are not set', async () => {
      delete process.env.A365_PER_REQUEST_MAX_TRACES;
      delete process.env.A365_PER_REQUEST_MAX_SPANS_PER_TRACE;
      delete process.env.A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS;

      await recreateProvider(new PerRequestSpanProcessor(mockExporter));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proc = processor as any;
      expect(proc.maxBufferedTraces).toBe(1000);
      expect(proc.maxSpansPerTrace).toBe(5000);
      expect(proc.maxConcurrentExports).toBe(20);
    });

    it('should fallback to defaults for invalid env var values', async () => {
      process.env.A365_PER_REQUEST_MAX_TRACES = 'not-a-number';
      process.env.A365_PER_REQUEST_MAX_SPANS_PER_TRACE = '';
      process.env.A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS = 'NaN';

      await recreateProvider(new PerRequestSpanProcessor(mockExporter));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proc = processor as any;
      expect(proc.maxBufferedTraces).toBe(1000);
      expect(proc.maxSpansPerTrace).toBe(5000);
      expect(proc.maxConcurrentExports).toBe(20);
    });

    it('should parse valid numeric string env vars correctly', async () => {
      process.env.A365_PER_REQUEST_MAX_TRACES = '50';
      process.env.A365_PER_REQUEST_MAX_SPANS_PER_TRACE = '100';
      process.env.A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS = '5';

      await recreateProvider(new PerRequestSpanProcessor(mockExporter));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proc = processor as any;
      expect(proc.maxBufferedTraces).toBe(50);
      expect(proc.maxSpansPerTrace).toBe(100);
      expect(proc.maxConcurrentExports).toBe(5);
    });

    it('should handle shutdown gracefully', async () => {
      const tracer = provider.getTracer('test');

      runWithExportToken('test-token', () => {
        const span = tracer.startSpan('root');
        span.end();
      });

      // Shutdown should complete without throwing
      await expect(processor.shutdown()).resolves.not.toThrow();
    });

    it('should handle onStart with null parentSpanContext as root span', async () => {
      const tracer = provider.getTracer('test');

      await new Promise<void>((resolve) => {
        runWithExportToken('test-token', () => {
          // Root span has no parent
          const rootSpan = tracer.startSpan('root', { root: true });
          rootSpan.end();

          setTimeout(() => resolve(), 50);
        });
      });

      expect(exportedSpans.length).toBe(1);
      expect(exportedSpans[0][0].name).toBe('root');
    });

    it('should handle empty traces array in forceFlush', async () => {
      // No spans created, forceFlush should still complete
      await expect(processor.forceFlush()).resolves.not.toThrow();
    });
  });
});
