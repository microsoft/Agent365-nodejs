// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { context, type Context } from '@opentelemetry/api';
import type { ReadableSpan, SpanProcessor, SpanExporter } from '@opentelemetry/sdk-trace-base';
import logger from '../utils/logging';

/** Guardrails to prevent unbounded memory growth / export bursts */
const DEFAULT_MAX_BUFFERED_TRACES = 1000;
const DEFAULT_MAX_SPANS_PER_TRACE = 5000;
const DEFAULT_MAX_CONCURRENT_EXPORTS = 20;
const DEFAULT_MAX_BATCH_SIZE = 64;

function readEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isRootSpan(span: ReadableSpan): boolean {
  return !span.parentSpanContext;
}

type TraceEntry = {
  rootCtx?: Context; // request Context (token via ALS)
  fallbackCtx?: Context; // first-seen context as fallback
  queue: ReadableSpan[]; // small queue for micro-batching
  flushScheduled: boolean; // whether a micro-batch flush is scheduled
  lastActivityMs: number; // for LRU eviction
  exportedCount: number; // total spans exported for this trace
  droppedSpans: number; // spans dropped due to maxSpansPerTrace
};

/**
 * Exports spans on-end with micro-batching to avoid dropping late-ending spans.
 * Token is not stored; we export under the saved request Context so that getExportToken()
 * can read the token from the active OpenTelemetry Context at export time.
 * 
 * Memory considerations:
 * - Trace entries are retained (not deleted after flush) to handle late-ending spans
 * - When maxBufferedTraces is reached, LRU eviction removes the least-recently-active entry
 * - Expected memory footprint: ~1-2KB per trace entry × maxBufferedTraces (default 1000)
 * - Queue sizes are small (bounded by maxBatchSize=64) to minimize buffering
 */
export class PerRequestSpanProcessor implements SpanProcessor {
  private traces = new Map<string, TraceEntry>();

  private readonly maxBufferedTraces: number;
  private readonly maxSpansPerTrace: number;
  private readonly maxConcurrentExports: number;
  private readonly maxBatchSize: number;

  private inFlightExports = 0;
  private exportWaiters: Array<() => void> = [];

  constructor(
    private readonly exporter: SpanExporter,
    _flushGraceMs?: number, // kept for backward compatibility
    _maxTraceAgeMs?: number // kept for backward compatibility
  ) {
    // Defaults are intentionally high but bounded; override via env vars if needed.
    // Set to 0 (or negative) to disable a guardrail.
    this.maxBufferedTraces = readEnvInt('A365_PER_REQUEST_MAX_TRACES', DEFAULT_MAX_BUFFERED_TRACES);
    this.maxSpansPerTrace = readEnvInt('A365_PER_REQUEST_MAX_SPANS_PER_TRACE', DEFAULT_MAX_SPANS_PER_TRACE);
    this.maxConcurrentExports = readEnvInt('A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS', DEFAULT_MAX_CONCURRENT_EXPORTS);
    this.maxBatchSize = readEnvInt('A365_PER_REQUEST_MAX_BATCH_SIZE', DEFAULT_MAX_BATCH_SIZE);
  }

  onStart(span: ReadableSpan, ctx: Context): void {
    const traceId = span.spanContext().traceId;
    let entry = this.traces.get(traceId);
    if (!entry) {
      // Enforce maxBufferedTraces with LRU eviction
      if (this.traces.size >= this.maxBufferedTraces && this.maxBufferedTraces > 0) {
        this.evictLeastRecentlyUsed();
      }

      entry = {
        queue: [],
        flushScheduled: false,
        rootCtx: undefined,
        fallbackCtx: undefined,
        lastActivityMs: Date.now(),
        exportedCount: 0,
        droppedSpans: 0,
      };
      this.traces.set(traceId, entry);

      logger.info(`[PerRequestSpanProcessor] Trace started traceId=${traceId}`);
    }

    entry.lastActivityMs = Date.now();

    // Debug lifecycle: span started
    logger.info(
      `[PerRequestSpanProcessor] Span start name=${span.name} traceId=${traceId} spanId=${span.spanContext().spanId}` +
        ` root=${isRootSpan(span)}`
    );

    // Capture context for export:
    // - If this is the root span, use its context (contains token via ALS)
    // - Otherwise, use the first seen context as a fallback
    // - Both rootCtx and fallbackCtx may be set; rootCtx takes precedence during export
    if (isRootSpan(span)) {
      entry.rootCtx = ctx;
    } else {
      entry.fallbackCtx ??= ctx;
    }
  }

  onEnd(span: ReadableSpan): void {
    const traceId = span.spanContext().traceId;
    const entry = this.traces.get(traceId);
    if (!entry) {
      // Span ended for an evicted or unknown trace; export without saved context
      logger.warn(
        `[PerRequestSpanProcessor] Span ended for unknown trace (likely evicted) traceId=${traceId} spanId=${span.spanContext().spanId}` +
          ` - exporting without saved context`
      );
      void this.exportBatch([span], context.active());
      return;
    }

    entry.lastActivityMs = Date.now();

    // Check maxSpansPerTrace guardrail
    const totalSpans = entry.exportedCount + entry.queue.length;
    if (this.maxSpansPerTrace > 0 && totalSpans >= this.maxSpansPerTrace) {
      entry.droppedSpans += 1;
      if (entry.droppedSpans === 1 || entry.droppedSpans % 100 === 0) {
        logger.warn(
          `[PerRequestSpanProcessor] Dropping ended span due to maxSpansPerTrace=${this.maxSpansPerTrace} ` +
            `traceId=${traceId} droppedSpans=${entry.droppedSpans}`
        );
      }
      return;
    }

    // Enqueue the span
    entry.queue.push(span);

    // Debug lifecycle: span ended
    logger.info(
      `[PerRequestSpanProcessor] Span end name=${span.name} traceId=${traceId} spanId=${span.spanContext().spanId}` +
        ` root=${isRootSpan(span)} queued=${entry.queue.length}`
    );

    // Flush immediately if batch size reached or exceeded, otherwise schedule micro-batch
    if (entry.queue.length >= this.maxBatchSize) {
      // Reset flushScheduled flag before immediate flush
      entry.flushScheduled = false;
      void this.flushTrace(traceId);
    } else if (!entry.flushScheduled) {
      this.scheduleMicroBatchFlush(traceId);
    }
  }

  async forceFlush(): Promise<void> {
    await Promise.all([...this.traces.keys()].map((id) => this.flushTrace(id)));
  }

  async shutdown(): Promise<void> {
    await this.forceFlush();
    await this.exporter.shutdown?.();
  }

  private scheduleMicroBatchFlush(traceId: string): void {
    const entry = this.traces.get(traceId);
    if (!entry) return;

    // Avoid scheduling duplicate flushes
    if (entry.flushScheduled) return;

    entry.flushScheduled = true;
    setImmediate(() => {
      // Entry may have been evicted before callback executes
      if (!this.traces.has(traceId)) return;
      void this.flushTrace(traceId);
    });
  }

  private evictLeastRecentlyUsed(): void {
    // Linear scan to find LRU entry. With maxBufferedTraces=1000, this is acceptable.
    // For higher limits, consider using a min-heap or doubly-linked list.
    let oldestEntry: { traceId: string; lastActivityMs: number } | undefined;

    for (const [traceId, entry] of this.traces.entries()) {
      if (!oldestEntry || entry.lastActivityMs < oldestEntry.lastActivityMs) {
        oldestEntry = { traceId, lastActivityMs: entry.lastActivityMs };
      }
    }

    if (oldestEntry) {
      logger.warn(
        `[PerRequestSpanProcessor] Evicting LRU trace traceId=${oldestEntry.traceId} due to maxBufferedTraces=${this.maxBufferedTraces}`
      );
      
      // Flush any pending spans before eviction to avoid data loss
      void this.flushTrace(oldestEntry.traceId);
      
      // Delete the entry after flushing
      this.traces.delete(oldestEntry.traceId);
    }
  }

  private async flushTrace(traceId: string): Promise<void> {
    const entry = this.traces.get(traceId);
    if (!entry) return;

    entry.flushScheduled = false;

    // Splice the queue to avoid re-exporting the same spans
    const spans = entry.queue.splice(0, entry.queue.length);
    if (spans.length === 0) return;

    entry.exportedCount += spans.length;

    logger.info(
      `[PerRequestSpanProcessor] Flushing trace traceId=${traceId} spans=${spans.length} totalExported=${entry.exportedCount}`
    );

    // Select export context: rootCtx if available, fallback otherwise
    const exportCtx = entry.rootCtx ?? entry.fallbackCtx ?? context.active();
    if (!entry.rootCtx && !entry.fallbackCtx) {
      logger.warn(`[PerRequestSpanProcessor] Missing saved context for trace ${traceId}, using context.active()`);
    }

    await this.exportBatch(spans, exportCtx);
  }

  private async exportBatch(spans: ReadableSpan[], exportCtx: Context): Promise<void> {
    await this.acquireExportSlot();

    try {
      // Export under the saved Context so exporter can read the token from context.active()
      await new Promise<void>((resolve) => {
        try {
          context.with(exportCtx, () => {
            try {
              this.exporter.export(spans, (result) => {
                // Log export failures but still resolve to avoid blocking processor
                if (result.code !== 0) {
                  logger.error(
                    `[PerRequestSpanProcessor] Export failed spans=${spans.length} code=${result.code}`,
                    result.error
                  );
                } else {
                  logger.info(`[PerRequestSpanProcessor] Export succeeded spans=${spans.length}`);
                }
                resolve();
              });
            } catch (err) {
              logger.error(`[PerRequestSpanProcessor] Export threw spans=${spans.length}`, err);
              resolve();
            }
          });
        } catch (err) {
          logger.error(`[PerRequestSpanProcessor] context.with threw spans=${spans.length}`, err);
          resolve();
        }
      });
    } finally {
      this.releaseExportSlot();
    }
  }

  private async acquireExportSlot(): Promise<void> {
    if (this.maxConcurrentExports <= 0) return;
    if (this.inFlightExports < this.maxConcurrentExports) {
      this.inFlightExports += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      this.exportWaiters.push(() => {
        this.inFlightExports += 1;
        resolve();
      });
    });
  }

  private releaseExportSlot(): void {
    if (this.maxConcurrentExports <= 0) return;
    this.inFlightExports = Math.max(0, this.inFlightExports - 1);
    const next = this.exportWaiters.shift();
    if (next) next();
  }
}
