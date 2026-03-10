// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { context, trace, Span, SpanKind, SpanStatusCode, Tracer } from "@opentelemetry/api";
import { BaseTracer, Run } from "@langchain/core/tracers/base";
import { isTracingSuppressed } from "@opentelemetry/core";
import { logger, OpenTelemetryConstants, defaultObservabilityConfigurationProvider } from "@microsoft/agents-a365-observability";
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
    if (operation === "invoke_agent") {
      spanName = `${operation} ${run.name}`;
    } else if (operation === "execute_tool") {
      spanName = `${operation} ${run.name}`;
    } else if (operation === "chat") {
      spanName = `${operation} ${Utils.getModel(run) || run.name}`.trim();
    }

    if (this.runs.size >= LangChainTracer.MAX_RUNS) {
      logger.warn(`[LangChainTracer] Max runs (${LangChainTracer.MAX_RUNS}) reached, skipping span`);
      return;
    }

    const startTime = run.start_time ?? Date.now();
    const span = this.tracer.startSpan(spanName, {
      kind: SpanKind.INTERNAL,
      startTime,
      attributes: { [OpenTelemetryConstants.GEN_AI_SYSTEM_KEY]: "langchain" },
    }, activeContext);

    this.runs.set(run.id, { run, span, startTime, lastAccessTime: startTime });
  }

  protected async _endTrace(run: Run) {
    if (isTracingSuppressed(context.active())) {
      return;
    }
    // Skip internal runs
    const operation = Utils.getOperationType(run);
    if (run.tags?.includes("langsmith:hidden") || run.name?.startsWith("Branch") || operation === "unknown") {
      logger.info(`Skipping internal run: ${run.name} (parent: ${run.parent_run_id})`);
      this.parentByRunId.delete(run.id);
      return;
    }

    const entry = this.runs.get(run.id);
    if (!entry) {
      this.parentByRunId.delete(run.id);
      return;
    }

    const { span } = entry;
    try {
      entry.lastAccessTime = Date.now();

      if (run.error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        const errorMsg = String(run.error);
        span.setAttribute(OpenTelemetryConstants.ERROR_MESSAGE_KEY, errorMsg.length > 8192 ? errorMsg.substring(0, 8178) + '...[truncated]' : errorMsg);

      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }

      // Set all attributes
      Utils.setOperationTypeAttribute(operation, span);
      Utils.setAgentAttributes(run, span);
      Utils.setModelAttribute(run, span);
      Utils.setProviderNameAttribute(run, span);
      Utils.setSessionIdAttribute(run, span);
      Utils.setTokenAttributes(run, span);

      // Content attributes gated by content recording setting
      const contentRecording = defaultObservabilityConfigurationProvider.getConfiguration().isContentRecordingEnabled;
      if (contentRecording) {
        Utils.setToolAttributes(run, span);
        Utils.setInputMessagesAttribute(run, span);
        Utils.setOutputMessagesAttribute(run, span);
        Utils.setSystemInstructionsAttribute(run, span);
      }

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
}
