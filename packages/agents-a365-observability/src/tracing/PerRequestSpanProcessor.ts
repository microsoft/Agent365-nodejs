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
const DEFAULT_MAX_TRACE_AGE_MS = 30000;

function isRootSpan(span: ReadableSpan): boolean {
  return !span.parentSpanContext;
}

type TraceBuffer = {
  spans: ReadableSpan[];
  openCount: number;
  rootEnded: boolean;
  rootCtx?: Context;           // holds the request Context (with token in ALS)
  flushTimer?: NodeJS.Timeout; // grace/safety timer
};

type FlushReason = 'trace_completed' | 'root_ended_grace' | 'max_trace_age' | 'force_flush';

/**
 * Buffers spans per trace and exports once the request completes.
 * Token is not stored; we export under the saved request Context so the exporter's tokenResolver
 * can read the token from context.active() at export time.
 */
export class PerRequestSpanProcessor implements SpanProcessor {
  private traces = new Map<string, TraceBuffer>();

  constructor(
    private readonly exporter: SpanExporter,
    private readonly flushGraceMs: number = DEFAULT_FLUSH_GRACE_MS,
    private readonly maxTraceAgeMs: number = DEFAULT_MAX_TRACE_AGE_MS
  ) {}

  onStart(span: ReadableSpan, ctx: Context): void {
    const traceId = span.spanContext().traceId;
    let buf = this.traces.get(traceId);
    if (!buf) {
      buf = { spans: [], openCount: 0, rootEnded: false, rootCtx: undefined };
      this.traces.set(traceId, buf);
      buf.flushTimer = setTimeout(() => this.flushTrace(traceId, 'max_trace_age'), this.maxTraceAgeMs);

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

    // Prefer capturing the root span's context (contains token via ALS).
    if (!buf.rootCtx || isRootSpan(span)) {
      buf.rootCtx = ctx;
    }
  }

  onEnd(span: ReadableSpan): void {
    const traceId = span.spanContext().traceId;
    const buf = this.traces.get(traceId);
    if (!buf) return;

    buf.spans.push(span);
    buf.openCount -= 1;

    // Debug lifecycle: span ended
    logger.info(
      `[PerRequestSpanProcessor] Span end name=${span.name} traceId=${traceId} spanId=${span.spanContext().spanId}` +
        ` root=${isRootSpan(span)} openCount=${buf.openCount} rootEnded=${buf.rootEnded}`
    );

    if (isRootSpan(span)) {
      buf.rootEnded = true;
      if (buf.openCount === 0) {
        // Trace completed: root ended and no open spans remain.
        this.flushTrace(traceId, 'trace_completed');
      }
      else {
        // Schedule a grace flush in case child spans do not arrive
        this.scheduleGraceFlush(traceId);
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
    await this.exporter.shutdown?.();
  }

  private scheduleGraceFlush(traceId: string) {
    const trace = this.traces.get(traceId);
    if (!trace) return;
    if (trace.flushTimer) clearTimeout(trace.flushTimer);

    logger.info(
      `[PerRequestSpanProcessor] Root ended; scheduling grace flush traceId=${traceId} graceMs=${this.flushGraceMs} openCount=${trace.openCount}`
    );

    trace.flushTimer = setTimeout(() => this.flushTrace(traceId, 'root_ended_grace'), this.flushGraceMs);
  }

  private async flushTrace(traceId: string, reason: FlushReason): Promise<void> {
    const trace = this.traces.get(traceId);
    if (!trace) return;

    if (trace.flushTimer) clearTimeout(trace.flushTimer);
    this.traces.delete(traceId);

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

    // Export under the original request Context so exporter can read the token from context.active()
    await new Promise<void>((resolve) => {
      context.with(trace.rootCtx as Context, () => {
        this.exporter.export(spans, (result) => {
          // Log export failures but still resolve to avoid blocking processor
          if (result.code !== 0) {
            logger.error(
              `[PerRequestSpanProcessor] Export failed traceId=${traceId} reason=${reason} code=${result.code}`,
              result.error
            );
          } else {
            logger.info(`[PerRequestSpanProcessor] Export succeeded traceId=${traceId} reason=${reason} spans=${spans.length}`);
          }
          resolve();
        });
      });
    });
  }
}

/** Export constants for use in configuration */
export { DEFAULT_FLUSH_GRACE_MS, DEFAULT_MAX_TRACE_AGE_MS };
