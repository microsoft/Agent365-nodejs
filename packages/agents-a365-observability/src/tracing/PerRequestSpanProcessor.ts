// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { context, type Context } from '@opentelemetry/api';
import type { ReadableSpan, SpanProcessor, SpanExporter } from '@opentelemetry/sdk-trace-base';

function isRootSpan(span: ReadableSpan): boolean {
  const parentContext = span.parentSpanContext;
  return !parentContext || !parentContext.spanId || parentContext.spanId === '0000000000000000';
}

type TraceBuffer = {
  spans: ReadableSpan[];
  openCount: number;
  rootEnded: boolean;
  rootCtx?: Context;           // holds the request Context (with token in ALS)
  flushTimer?: NodeJS.Timeout; // grace/safety timer
};

/**
 * Buffers spans per trace and exports once the request completes.
 * Token is not stored; we export under the saved request Context so the exporter's tokenResolver
 * can read the token from context.active() at export time.
 */
export class PerRequestSpanProcessor implements SpanProcessor {
  private traces = new Map<string, TraceBuffer>();

  constructor(
    private readonly exporter: SpanExporter,
    private readonly flushGraceMs: number = 250,
    private readonly maxTraceAgeMs: number = 30000
  ) {}

  onStart(span: ReadableSpan, ctx: Context): void {
    const traceId = span.spanContext().traceId;
    let buf = this.traces.get(traceId);
    if (!buf) {
      buf = { spans: [], openCount: 0, rootEnded: false, rootCtx: undefined };
      this.traces.set(traceId, buf);
      buf.flushTimer = setTimeout(() => this.flushTrace(traceId), this.maxTraceAgeMs);
    }
    buf.openCount += 1;

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
    buf.openCount = Math.max(0, buf.openCount - 1);

    if (isRootSpan(span)) {
      buf.rootEnded = true;
      if (buf.openCount === 0) this.flushTrace(traceId);
      else this.scheduleGraceFlush(traceId);
    } else if (buf.rootEnded && buf.openCount === 0) {
      this.flushTrace(traceId);
    }
  }

  async forceFlush(): Promise<void> {
    await Promise.all([...this.traces.keys()].map(id => this.flushTrace(id)));
  }

  async shutdown(): Promise<void> {
    await this.forceFlush();
    await this.exporter.shutdown?.();
  }

  private scheduleGraceFlush(traceId: string) {
    const buf = this.traces.get(traceId);
    if (!buf) return;
    if (buf.flushTimer) clearTimeout(buf.flushTimer);
    buf.flushTimer = setTimeout(() => this.flushTrace(traceId), this.flushGraceMs);
  }

  private async flushTrace(traceId: string): Promise<void> {
    const buf = this.traces.get(traceId);
    if (!buf) return;

    if (buf.flushTimer) clearTimeout(buf.flushTimer);
    this.traces.delete(traceId);

    const spans = buf.spans;
    if (spans.length === 0) return;

    // Export under the original request Context so tokenResolver can read the token from context.active()
    await new Promise<void>((resolve) => {
      context.with(buf.rootCtx ?? context.active(), () => {
        this.exporter.export(spans, () => resolve());
      });
    });
  }
}
