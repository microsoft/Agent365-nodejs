// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { context, type Context } from '@opentelemetry/api';
import type { ReadableSpan, SpanProcessor, SpanExporter } from '@opentelemetry/sdk-trace-base';
import logger from '../utils/logging';

/** Default grace period (ms) to wait for child spans after root span ends */
const DEFAULT_FLUSH_GRACE_MS = 250;

/** Default maximum age (ms) for a trace before forcing flush */
const DEFAULT_MAX_TRACE_AGE_MS = 1800000; // 30 minutes

/** Guardrails to prevent unbounded memory growth / export bursts */
const DEFAULT_MAX_BUFFERED_TRACES = 1000;
const DEFAULT_MAX_SPANS_PER_TRACE = 5000;
const DEFAULT_MAX_CONCURRENT_EXPORTS = 20;

function readEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isRootSpan(span: ReadableSpan): boolean {
  return !span.parentSpanContext;
}

type TraceBuffer = {
  spans: ReadableSpan[];
  openCount: number;
  rootEnded: boolean;
  rootCtx?: Context; // holds the request Context (with token in ALS)
  startedAtMs: number;
  rootEndedAtMs?: number;
  droppedSpans: number;
};

type FlushReason = 'trace_completed' | 'root_ended_grace' | 'max_trace_age' | 'force_flush';

/**
 * Buffers spans per trace and exports once the request completes.
 * Token is not stored; we export under the saved request Context so that getExportToken()
 * can read the token from the active OpenTelemetry Context at export time.
 */
export class PerRequestSpanProcessor implements SpanProcessor {
  private traces = new Map<string, TraceBuffer>();
  private sweepTimer?: NodeJS.Timeout;
  private isSweeping = false;

  private readonly exporter: SpanExporter;
  private readonly flushGraceMs: number;
  private readonly maxTraceAgeMs: number;

  private readonly maxBufferedTraces: number;
  private readonly maxSpansPerTrace: number;
  private readonly maxConcurrentExports: number;

  private inFlightExports = 0;
  private exportWaiters: Array<() => void> = [];

  constructor(exporter: SpanExporter, flushGraceMs?: number, maxTraceAgeMs?: number) {
    this.exporter = exporter;
    this.flushGraceMs = flushGraceMs ?? readEnvInt('A365_PER_REQUEST_FLUSH_GRACE_MS', DEFAULT_FLUSH_GRACE_MS);
    this.maxTraceAgeMs = maxTraceAgeMs ?? readEnvInt('A365_PER_REQUEST_MAX_TRACE_AGE_MS', DEFAULT_MAX_TRACE_AGE_MS);

    // Defaults are intentionally high but bounded; override via env vars if needed.
    // Set to 0 (or negative) to disable a guardrail.
    this.maxBufferedTraces = readEnvInt('A365_PER_REQUEST_MAX_TRACES', DEFAULT_MAX_BUFFERED_TRACES);
    this.maxSpansPerTrace = readEnvInt('A365_PER_REQUEST_MAX_SPANS_PER_TRACE', DEFAULT_MAX_SPANS_PER_TRACE);
    this.maxConcurrentExports = readEnvInt('A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS', DEFAULT_MAX_CONCURRENT_EXPORTS);
  }

  onStart(span: ReadableSpan, ctx: Context): void {
    const traceId = span.spanContext().traceId;
    let buf = this.traces.get(traceId);
    if (!buf) {
      if (this.traces.size >= this.maxBufferedTraces) {
        logger.warn(
          `[PerRequestSpanProcessor] Dropping new trace due to maxBufferedTraces=${this.maxBufferedTraces} traceId=${traceId}`
        );
        return;
      }

      buf = {
        spans: [],
        openCount: 0,
        rootEnded: false,
        rootCtx: undefined,
        startedAtMs: Date.now(),
        droppedSpans: 0,
      };
      this.traces.set(traceId, buf);

      this.ensureSweepTimer();

      logger.info(
        `[PerRequestSpanProcessor] Trace started traceId=${traceId} maxTraceAgeMs=${this.maxTraceAgeMs}`
      );
    }
    buf.openCount += 1;

    // Debug lifecycle: span started
    logger.info(
      `[PerRequestSpanProcessor] Span start name=${span.name} traceId=${traceId} spanId=${span.spanContext().spanId}` +
        ` root=${isRootSpan(span)} openCount=${buf.openCount}`
    );

    // Capture a context to export under.
    // - Use the first seen context as a fallback.
    // - If/when the root span starts, prefer its context (contains token via ALS).
    if (isRootSpan(span)) {
      buf.rootCtx = ctx;
    } else {
      buf.rootCtx ??= ctx;
    }
  }

  onEnd(span: ReadableSpan): void {
    const traceId = span.spanContext().traceId;
    const buf = this.traces.get(traceId);
    if (!buf) return;

    if (buf.spans.length >= this.maxSpansPerTrace) {
      buf.droppedSpans += 1;
      if (buf.droppedSpans === 1 || buf.droppedSpans % 100 === 0) {
        logger.warn(
          `[PerRequestSpanProcessor] Dropping ended span due to maxSpansPerTrace=${this.maxSpansPerTrace} ` +
            `traceId=${traceId} droppedSpans=${buf.droppedSpans}`
        );
      }
    } else {
      buf.spans.push(span);
    }
    buf.openCount -= 1;
    if (buf.openCount < 0) {
      logger.warn(
        `[PerRequestSpanProcessor] openCount underflow traceId=${traceId} spanId=${span.spanContext().spanId} resettingToZero`
      );
      buf.openCount = 0;
    }

    // Debug lifecycle: span ended
    logger.info(
      `[PerRequestSpanProcessor] Span end name=${span.name} traceId=${traceId} spanId=${span.spanContext().spanId}` +
        ` root=${isRootSpan(span)} openCount=${buf.openCount} rootEnded=${buf.rootEnded}`
    );

    if (isRootSpan(span)) {
      buf.rootEnded = true;
      buf.rootEndedAtMs = Date.now();
      if (buf.openCount === 0) {
        // Trace completed: root ended and no open spans remain.
        this.flushTrace(traceId, 'trace_completed');
      }
    } else if (buf.rootEnded && buf.openCount === 0) {
      // Common case: root ends first, then children finish shortly after.
      // Flush immediately when the last child ends instead of waiting for grace/max timers.
      this.flushTrace(traceId, 'trace_completed');
    }
  }

  async forceFlush(): Promise<void> {
    await Promise.all([...this.traces.keys()].map((id) => this.flushTrace(id, 'force_flush')));
  }

  async shutdown(): Promise<void> {
    await this.forceFlush();
    this.stopSweepTimerIfIdle();
    await this.exporter.shutdown?.();
  }

  private ensureSweepTimer(): void {
    if (this.sweepTimer) return;

    // Keep one lightweight sweeper. Interval is derived from grace/max-age to keep responsiveness reasonable.
    const intervalMs = Math.max(10, Math.min(this.flushGraceMs, 250));
    this.sweepTimer = setInterval(() => {
      void this.sweep();
    }, intervalMs);

    this.sweepTimer.unref?.();
  }

  private stopSweepTimerIfIdle(): void {
    if (this.traces.size !== 0) return;
    if (!this.sweepTimer) return;
    clearInterval(this.sweepTimer);
    this.sweepTimer = undefined;
  }

  private async sweep(): Promise<void> {
    if (this.isSweeping) return;
    this.isSweeping = true;
    try {
      if (this.traces.size === 0) {
        this.stopSweepTimerIfIdle();
        return;
      }

      const now = Date.now();
      const toFlush: Array<{ traceId: string; reason: FlushReason }> = [];

      for (const [traceId, trace] of this.traces.entries()) {
        // 1) Max age: drop the entire trace buffer without exporting to avoid incomplete trace exports
        if (now - trace.startedAtMs >= this.maxTraceAgeMs) {
          logger.error(
            `[PerRequestSpanProcessor] Dropping trace due to maxTraceAge traceId=${traceId} age=${now - trace.startedAtMs}ms maxTraceAgeMs=${this.maxTraceAgeMs} spans=${trace.spans.length}`
          );
          this.traces.delete(traceId);
          continue;
        }

        // 2) Root ended grace window flush (clears buffers if children never end)
        if (trace.rootEnded && trace.openCount > 0 && trace.rootEndedAtMs) {
          if (now - trace.rootEndedAtMs >= this.flushGraceMs) {
            toFlush.push({ traceId, reason: 'root_ended_grace' });
          }
        }
      }

      // Flush in parallel; flushTrace removes entries eagerly.
      await Promise.all(toFlush.map((x) => this.flushTrace(x.traceId, x.reason)));
      this.stopSweepTimerIfIdle();
    } finally {
      this.isSweeping = false;
    }
  }

  private async flushTrace(traceId: string, reason: FlushReason): Promise<void> {
    const trace = this.traces.get(traceId);
    if (!trace) return;

    this.traces.delete(traceId);
    this.stopSweepTimerIfIdle();

    const spans = trace.spans;
    if (spans.length === 0) return;

    logger.info(
      `[PerRequestSpanProcessor] Flushing trace traceId=${traceId} reason=${reason} spans=${spans.length} rootEnded=${trace.rootEnded}`
    );

    // Must have captured the root context to access the token
    if (!trace.rootCtx) {
      logger.error(`[PerRequestSpanProcessor] Missing rootCtx for trace ${traceId}, cannot export spans`);
      return;
    }

    await this.acquireExportSlot();

    try {
      // Export under the original request Context so exporter can read the token from context.active()
      await new Promise<void>((resolve) => {
        try {
          context.with(trace.rootCtx as Context, () => {
            try {
              this.exporter.export(spans, (result) => {
                // Log export failures but still resolve to avoid blocking processor
                if (result.code !== 0) {
                  logger.error(
                    `[PerRequestSpanProcessor] Export failed traceId=${traceId} reason=${reason} code=${result.code}`,
                    result.error
                  );
                } else {
                  logger.info(
                    `[PerRequestSpanProcessor] Export succeeded traceId=${traceId} reason=${reason} spans=${spans.length}`
                  );
                }
                resolve();
              });
            } catch (err) {
              logger.error(
                `[PerRequestSpanProcessor] Export threw traceId=${traceId} reason=${reason} spans=${spans.length}`,
                err
              );
              resolve();
            }
          });
        } catch (err) {
          logger.error(`[PerRequestSpanProcessor] context.with threw traceId=${traceId} reason=${reason}`, err);
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
