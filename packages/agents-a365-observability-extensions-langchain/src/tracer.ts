// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { context, trace, Span, SpanKind, SpanStatusCode, Tracer } from "@opentelemetry/api";
import { BaseTracer, Run } from "@langchain/core/tracers/base";
import { isTracingSuppressed } from "@opentelemetry/core";
import { logger, OpenTelemetryConstants } from "@microsoft/agents-a365-observability";
import * as Utils from "./Utils";

type RunWithSpan = { run: Run; span: Span; startTime: number; lastAccessTime: number };

export class LangChainTracer extends BaseTracer {
  private tracer: Tracer;
  private runs: Record<string, RunWithSpan> = {};
  private parentByRunId: Record<string, string | undefined> = {};


  constructor(tracer: Tracer) {
    super();
    this.tracer = tracer;
  }

  name = "OpenTelemetryLangChainTracer";

  protected persistRun(_run: Run): Promise<void> {
    return Promise.resolve();
  }

  async onRunCreate(run: Run) {
    this.parentByRunId[run.id] = run.parent_run_id;
    if (super.onRunCreate) await super.onRunCreate(run);
    this.startTracing(run);
  }

  protected startTracing(run: Run) {
    if (isTracingSuppressed(context.active())) { 
      return;
    }
     
    const operation = Utils.getOperationType(run);

    // Skip internal runs
    if (run.tags?.includes("langsmith:hidden") || run.name?.startsWith("Branch") || operation === "unknown") {
      logger.info(`Skipping internal run: ${run.name} (parent: ${run.parent_run_id})`);
      return;
    }

    const parentCtx = this.getNearestParentSpanContext(run);
    const activeContext = parentCtx
      ? trace.setSpanContext(context.active(), parentCtx)
      : context.active();

    let spanName = run.name;
    if (operation === "invoke_agent") {
      spanName = `${operation} ${run.name}`;
    } else if (operation === "execute_tool") {
      spanName = `${operation} ${run.name}`;
    } else if (operation === "chat") {
      spanName = `${operation} ${Utils.getModel(run) || run.name}`.trim();
    }

    const startTime = Date.now();
    const span = this.tracer.startSpan(spanName, {
      kind: SpanKind.INTERNAL,
      attributes: { [OpenTelemetryConstants.GEN_AI_SYSTEM_KEY]: "langchain" },
    }, activeContext);

    this.runs[run.id] = { run, span, startTime, lastAccessTime: startTime };
  }

  protected async _endTrace(run: Run) {
    if (isTracingSuppressed(context.active())) {
      return;
    }
    // Skip internal runs
    const operation = Utils.getOperationType(run);
    if (run.tags?.includes("langsmith:hidden") || run.name?.startsWith("Branch") || operation === "unknown") {
      logger.info(`Skipping internal run: ${run.name} (parent: ${run.parent_run_id})`);
      return;
    }

    const entry = this.runs[run.id];
    if (!entry) {
      return;
    }

    try {
      const { span } = entry;
      entry.lastAccessTime = Date.now();

      if (run.error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.setAttribute(OpenTelemetryConstants.ERROR_MESSAGE_KEY, String(run.error));

      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }

      // Set all attributes
      Utils.setOperationTypeAttribute(operation, span);
      Utils.setAgentAttributes(run, span);
      Utils.setToolAttributes(run, span);
      Utils.setInputMessagesAttribute(run, span);
      Utils.setOutputMessagesAttribute(run, span);
      Utils.setSystemInstructionsAttribute(run, span);
      Utils.setModelAttribute(run, span);
      Utils.setProviderNameAttribute(run, span);
      Utils.setSessionIdAttribute(run, span);
      Utils.setTokenAttributes(run, span);

      span.end();
    } finally {
      delete this.runs[run.id];
      delete this.parentByRunId[run.id];
      await super._endTrace(run);
    }
  }

  private getNearestParentSpanContext(run: Run) {
    let pid = run.parent_run_id;

    while (pid) {
      const entry = this.runs[pid];
      if (entry) return entry.span.spanContext();
      pid = this.parentByRunId[pid];
    }
    return undefined;
  }
}
