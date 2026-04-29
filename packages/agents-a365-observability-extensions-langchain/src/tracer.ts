// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { context, trace, Span, SpanKind, SpanStatusCode, Tracer } from "@opentelemetry/api";
import { BaseTracer, Run } from "@langchain/core/tracers/base";
import { isTracingSuppressed } from "@opentelemetry/core";
import { logger, OpenTelemetryConstants } from "@microsoft/agents-a365-observability";
import * as Utils from "./Utils";

type RunWithSpan = { run: Run; span: Span; startTime: number; lastAccessTime: number };

export class LangChainTracer extends BaseTracer {
  private static readonly MAX_RUNS = 10_000;
  private tracer: Tracer;
  private runs = new Map<string, RunWithSpan>();
  private parentByRunId = new Map<string, string | undefined>();


  constructor(tracer: Tracer) {
    super();
    this.tracer = tracer;
  }

  name = "OpenTelemetryLangChainTracer";

  protected persistRun(_run: Run): Promise<void> {
    return Promise.resolve();
  }

  async onRunCreate(run: Run) {
    this.parentByRunId.set(run.id, run.parent_run_id);
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
    let kind: SpanKind = SpanKind.INTERNAL;
    if (operation === "invoke_agent") {
      spanName = `${operation} ${run.name}`;
      kind = SpanKind.SERVER;
    } else if (operation === "execute_tool") {
      spanName = `${operation} ${run.name}`;
      kind = SpanKind.CLIENT;
    } else if (operation === "chat") {
      spanName = `${operation} ${Utils.getModel(run) || run.name}`.trim();
      kind = SpanKind.CLIENT;
    }

    if (this.runs.size >= LangChainTracer.MAX_RUNS) {
      logger.warn(`[LangChainTracer] Max runs (${LangChainTracer.MAX_RUNS}) reached, skipping span`);
      this.parentByRunId.delete(run.id);
      return;
    }

    const startTime = run.start_time ?? Date.now();
    const span = this.tracer.startSpan(spanName, {
      kind,
      startTime,
      attributes: { [OpenTelemetryConstants.GEN_AI_PROVIDER_NAME_KEY]: "langchain" },
    }, activeContext);

    this.runs.set(run.id, { run, span, startTime, lastAccessTime: startTime });
  }

  protected async _endTrace(run: Run) {
    if (isTracingSuppressed(context.active())) {
      // Even when suppressed, end any span that was started before suppression kicked in
      // to avoid abandoned spans that are never exported or closed.
      const suppressedEntry = this.runs.get(run.id);
      if (suppressedEntry) {
        suppressedEntry.span.end(run.end_time ?? undefined);
      }
      this.parentByRunId.delete(run.id);
      this.runs.delete(run.id);
      return;
    }
    // Skip internal runs
    const operation = Utils.getOperationType(run);
    if (run.tags?.includes("langsmith:hidden") || run.name?.startsWith("Branch") || operation === "unknown") {
      logger.info(`Skipping internal run: ${run.name} (parent: ${run.parent_run_id})`);
      return;
    }

    const entry = this.runs.get(run.id);
    if (!entry) {
      return;
    }

    const { span } = entry;
    try {
      entry.lastAccessTime = Date.now();

      if (run.error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.setAttribute(OpenTelemetryConstants.ERROR_MESSAGE_KEY, String(run.error));
        const errorType = (run.error as { name?: string })?.name ?? (run.error as { constructor?: { name?: string } })?.constructor?.name;
        if (typeof errorType === "string" && errorType.length > 0) {
          span.setAttribute(OpenTelemetryConstants.ERROR_TYPE_KEY, errorType);
        }
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }

      // Set all attributes
      Utils.setOperationTypeAttribute(operation, span);
      Utils.setAgentAttributes(run, span);
      if (operation === "invoke_agent") {
        const callerName = this.findCallerAgentName(run);
        if (callerName) {
          span.setAttribute(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_NAME_KEY, callerName);
        }
      }
      Utils.setModelAttribute(run, span);
      Utils.setProviderNameAttribute(run, span);
      Utils.setSessionIdAttribute(run, span);
      Utils.setTokenAttributes(run, span);

      // Content attributes — always recorded (aligned with Python/.NET SDKs)
      Utils.setToolAttributes(run, span);
      Utils.setInputMessagesAttribute(run, span);
      Utils.setOutputMessagesAttribute(run, span);
      Utils.setSystemInstructionsAttribute(run, span);

    } catch (error) {
      logger.error(`[LangChainTracer] Error setting span attributes for run ${run.name}: ${error instanceof Error ? error.message : String(error)}`);
      span.setStatus({ code: SpanStatusCode.ERROR });
    } finally {
      span.end(run.end_time ?? undefined);
      this.runs.delete(run.id);
      this.parentByRunId.delete(run.id);
      await super._endTrace(run);
    }
  }

  private getNearestParentSpanContext(run: Run) {
    let pid = run.parent_run_id;

    while (pid) {
      const entry = this.runs.get(pid);
      if (entry) return entry.span.spanContext();
      pid = this.parentByRunId.get(pid);
    }
    return undefined;
  }

  private findCallerAgentName(run: Run): string | undefined {
    let pid = run.parent_run_id;
    while (pid) {
      const entry = this.runs.get(pid);
      if (entry && Utils.getOperationType(entry.run) === "invoke_agent") {
        return entry.run.name;
      }
      pid = this.parentByRunId.get(pid);
    }
    return undefined;
  }
}
