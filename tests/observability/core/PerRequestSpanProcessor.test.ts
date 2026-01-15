// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { PerRequestSpanProcessor, DEFAULT_FLUSH_GRACE_MS, DEFAULT_MAX_TRACE_AGE_MS } from '@microsoft/agents-a365-observability/src/tracing/PerRequestSpanProcessor';
import { runWithExportToken } from '@microsoft/agents-a365-observability/src/tracing/context/token-context';
import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { ExportResult, ExportResultCode } from '@opentelemetry/core';

describe('PerRequestSpanProcessor', () => {
  let provider: BasicTracerProvider;
  let processor: PerRequestSpanProcessor;
  let exportedSpans: ReadableSpan[][] = [];
  let mockExporter: SpanExporter;

  beforeEach(() => {
    exportedSpans = [];
    mockExporter = {
      export: (spans: ReadableSpan[], resultCallback: (result: ExportResult) => void) => {
        exportedSpans.push([...spans]);
        resultCallback({ code: ExportResultCode.SUCCESS });
      },
      shutdown: async () => {
        await provider.shutdown();
      }
    };

    processor = new PerRequestSpanProcessor(mockExporter, DEFAULT_FLUSH_GRACE_MS, DEFAULT_MAX_TRACE_AGE_MS);
    provider = new BasicTracerProvider({
      spanProcessors: [processor]
    });
  });

  afterEach(async () => {
    await provider.shutdown();
  });

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
      // Shutdown existing processor and provider to avoid resource leak
      await processor.shutdown();
      processor = new PerRequestSpanProcessor(mockExporter, customGrace, DEFAULT_MAX_TRACE_AGE_MS);
      provider = new BasicTracerProvider({
        spanProcessors: [processor]
      });

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
  });
});
