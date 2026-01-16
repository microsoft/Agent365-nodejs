// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { PerRequestSpanProcessor, DEFAULT_FLUSH_GRACE_MS, DEFAULT_MAX_TRACE_AGE_MS } from '@microsoft/agents-a365-observability/src/tracing/PerRequestSpanProcessor';
import { runWithExportToken } from '@microsoft/agents-a365-observability/src/tracing/context/token-context';
import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { ExportResult, ExportResultCode } from '@opentelemetry/core';
import { context, trace } from '@opentelemetry/api';

describe('PerRequestSpanProcessor', () => {
  let provider: BasicTracerProvider;
  let processor: PerRequestSpanProcessor;
  let exportedSpans: ReadableSpan[][] = [];
  let mockExporter: SpanExporter;

  const getActiveTraceCount = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const traces: Map<string, unknown> | undefined = (processor as any).traces;
    return traces?.size ?? 0;
  };

  beforeEach(() => {
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

    processor = new PerRequestSpanProcessor(mockExporter, DEFAULT_FLUSH_GRACE_MS, DEFAULT_MAX_TRACE_AGE_MS);
    provider = new BasicTracerProvider({
      spanProcessors: [processor]
    });
  });

  afterEach(async () => {
    await provider.shutdown();
    jest.useRealTimers();
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

    it('should respect custom grace flush timeout', async () => {
      exportedSpans = [];
      const customGrace = 30;
      await recreateProvider(new PerRequestSpanProcessor(mockExporter, customGrace, DEFAULT_MAX_TRACE_AGE_MS));

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
  });
});
