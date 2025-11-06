// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

/**
 * Trace processor for OpenAI Agents SDK
 * Converts OpenAI Agents SDK spans to OpenTelemetry spans
 */

import { context, trace as OtelTrace, Span as OtelSpan, Tracer as OtelTracer } from '@opentelemetry/api';
import { OpenTelemetryConstants, InferenceOperationType } from '@microsoft/agents-a365-observability';
import * as Constants from './Constants';
import * as Utils from './Utils';
import {
  Span as AgentsSpan,
  SpanData,
  MCPListToolsSpanData
} from '@openai/agents-core/dist/tracing/spans';
import { Trace as AgentTrace } from '@openai/agents-core/dist/tracing/traces';
import { TracingProcessor } from '@openai/agents-core/dist/tracing/processor';

/**
 * Context token for span context management
 */
type ContextToken = unknown;

/**
 * Processor for OpenAI Agents SDK traces
 */
export class OpenAIAgentsTraceProcessor implements TracingProcessor {
  private static readonly MAX_HANDOFFS_IN_FLIGHT = 1000;

  private readonly tracer: OtelTracer;
  private readonly rootSpans: Map<string, OtelSpan> = new Map();
  private readonly otelSpans: Map<string, OtelSpan> = new Map();
  private readonly tokens: Map<string, ContextToken> = new Map();
  private readonly reverseHandoffsDict: Map<string, string> = new Map();
  // Track span names for later access (since OTel Span doesn't expose name)
  private readonly spanNames: Map<OtelSpan, string> = new Map();

  private readonly keyMappings: Map<string, string> = new Map([
    ['mcp_tools' + Constants.GEN_AI_RESPONSE_CONTENT_KEY, OpenTelemetryConstants.GEN_AI_EVENT_CONTENT],
    ['mcp_tools' + Constants.GEN_AI_REQUEST_CONTENT_KEY, OpenTelemetryConstants.GEN_AI_TOOL_ARGS_KEY],
    ['function' + Constants.GEN_AI_RESPONSE_CONTENT_KEY, OpenTelemetryConstants.GEN_AI_EVENT_CONTENT],
    ['function' + Constants.GEN_AI_REQUEST_CONTENT_KEY, OpenTelemetryConstants.GEN_AI_TOOL_ARGS_KEY],
    ['generation' + Constants.GEN_AI_RESPONSE_CONTENT_KEY, OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY],
    ['generation' + Constants.GEN_AI_REQUEST_CONTENT_KEY, OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY],
  ]);

  constructor(tracer: OtelTracer) {
    this.tracer = tracer;
  }

  private getNewKey(spanType: string, key: string): string | null {
    return this.keyMappings.get(`${spanType}${key}`) ?? null;
  }

  /**
   * Called to initialize the processor
   */
  public async start(): Promise<void> {
    // Initialization logic if needed
  }

  /**
   * Called when a trace starts
   */
  public async onTraceStart(_trace: AgentTrace): Promise<void> {
    // Trace start - no root span creation needed
  }

  /**
   * Called when a trace ends
   */
  public async onTraceEnd(trace: AgentTrace): Promise<void> {
    const rootSpan = this.rootSpans.get(trace.traceId);
    if (rootSpan) {
      this.rootSpans.delete(trace.traceId);
      rootSpan.end();
    }
  }

  /**
   * Called when a span starts
   */
  public async onSpanStart(span: AgentsSpan<SpanData>): Promise<void> {
    const spanId = span.spanId;
    const parentId = span.parentId;
    const traceId = span.traceId;
    const startedAt = span.startedAt;
    const spanData = span.spanData;

    if (!startedAt || !spanId || !traceId) {
      return;
    }

    const startTime = new Date(startedAt).getTime();

    // Find parent span
    const parentSpan = parentId
      ? this.otelSpans.get(parentId)
      : this.rootSpans.get(traceId);

    // Create context with parent
    const parentContext = parentSpan
      ? OtelTrace.setSpan(context.active(), parentSpan)
      : context.active();

    const spanName = Utils.getSpanName(span);

    // Start OpenTelemetry span
    const otelSpan = this.tracer.startSpan(
      spanName,
      {
        startTime,
        attributes: {
          [OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY]: Utils.getSpanKind(spanData),
          [OpenTelemetryConstants.GEN_AI_SYSTEM_KEY]: 'openai',
        },
      },
      parentContext
    );

    if (!parentSpan) {
      this.rootSpans.set(traceId, otelSpan);
    }

    // Store span and activate context
    this.otelSpans.set(spanId, otelSpan);
    this.spanNames.set(otelSpan, spanName);
    const newContext = OtelTrace.setSpan(context.active(), otelSpan);
    const token = context.with(newContext, () => context.active());
    this.tokens.set(spanId, token);
  }

  /**
   * Called when a span ends
   */
  public async onSpanEnd(span: AgentsSpan<SpanData>): Promise<void> {
    const spanId = span.spanId;
    const traceId = span.traceId;
    const endedAt = span.endedAt;
    const spanData = span.spanData;

    if (!spanId || !traceId) {
      return;
    }

    // Cleanup context token
    const token = this.tokens.get(spanId);
    if (token) {
      this.tokens.delete(spanId);
      // Context cleanup is automatic in JS
    }

    // Retrieve OpenTelemetry span
    const otelSpan = this.otelSpans.get(spanId);
    if (!otelSpan) {
      return;
    }
    this.otelSpans.delete(spanId);
    this.spanNames.delete(otelSpan);

    // Update span name
    otelSpan.updateName(Utils.getSpanName(span));

    // Process based on span data type
    if (spanData) {
      this.processSpanData(otelSpan, spanData, traceId);
    }

    // Set end time and status
    const endTime = endedAt ? new Date(endedAt).getTime() : undefined;
    const status = Utils.getSpanStatus(span);
    otelSpan.setStatus(status);
    if (endTime) {
      otelSpan.end(endTime);
    } else {
      otelSpan.end();
    }
  }

  /**
   * Process span data based on type
   */
  private processSpanData(otelSpan: OtelSpan, data: SpanData, traceId: string): void {
    const type = data.type;

    switch (type) {
    case 'response':
      this.processResponseSpanData(otelSpan, data);
      break;

    case 'generation':
      this.processGenerationSpanData(otelSpan, data, traceId);
      break;

    case 'function':
      this.processFunctionSpanData(otelSpan, data, traceId);
      break;

    case 'mcp_tools':
      this.processMCPListToolsSpanData(otelSpan, data);
      break;

    case 'handoff':
      this.processHandoffSpanData(otelSpan, data, traceId);
      break;

    case 'agent':
      this.processAgentSpanData(otelSpan, data, traceId);
      break;
    }
  }

  /**
   * Process response span data
   */
  private processResponseSpanData(otelSpan: OtelSpan, data: SpanData): void {
    const responseData = data as Record<string, unknown>;
    // Handle both formats: _response/_input (actual format) and response/input (legacy format)
    const responseObj = responseData._response || responseData.response;
    const inputObj = responseData._input || responseData.input;
    if (responseObj) {
      const resp = responseObj as Record<string, unknown>;

      // Store the output field for GEN_AI_RESPONSE_CONTENT_KEY
      if (resp.output) {
        if (typeof resp.output === 'string') {
          otelSpan.setAttribute(OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY, resp.output);
        } else {
          otelSpan.setAttribute(OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY, JSON.stringify(resp.output));
        }
      }

      // Get attributes but filter out unwanted ones
      const attrs = Utils.getAttributesFromResponse(responseObj);
      Object.entries(attrs).forEach(([key, value]) => {
        if (value !== null && value !== undefined &&
            key !== Constants.GEN_AI_RESPONSE_CONTENT_KEY) {
          otelSpan.setAttribute(key, value as string | number | boolean);
        }
      });

      const modelName = attrs[OpenTelemetryConstants.GEN_AI_REQUEST_MODEL_KEY] ?? '';
      otelSpan.updateName(`${InferenceOperationType.CHAT} ${modelName}`);

    }

    if (inputObj) {
      if (typeof inputObj === 'string') {
        otelSpan.setAttribute(OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY, inputObj);
      } else if (Array.isArray(inputObj)) {
        // Store the complete _input structure as JSON
        otelSpan.setAttribute(
          OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY,
          JSON.stringify(inputObj)
        );

        // Get attributes but filter out unwanted ones
        const attrs = Utils.getAttributesFromInput(inputObj);
        Object.entries(attrs).forEach(([key, value]) => {
          if (value !== null && value !== undefined &&
              key !== Constants.GEN_AI_REQUEST_CONTENT_KEY) {
            otelSpan.setAttribute(key, value as string | number | boolean);
          }
        });
      }
    }
  }

  /**
   * Process generation span data
   */
  private processGenerationSpanData(otelSpan: OtelSpan, data: SpanData, traceId: string): void {
    const attrs = Utils.getAttributesFromGenerationSpanData(data);
    Object.entries(attrs).forEach(([key, value]) => {
      const shouldExcludeKey = key === OpenTelemetryConstants.GEN_AI_EXECUTION_TYPE_KEY
        || key === Constants.GEN_AI_EXECUTION_PAYLOAD_KEY;
      if (value !== null && value !== undefined && !shouldExcludeKey) {
        const newKey = this.getNewKey(data.type, key);
        otelSpan.setAttribute(newKey || key, value as string | number | boolean);
      }
    });

    this.stampCustomParent(otelSpan, traceId);

    // Update span name with model
    const operationName = attrs[OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY];
    const modelName = attrs[OpenTelemetryConstants.GEN_AI_REQUEST_MODEL_KEY];
    if (operationName && modelName) {
      otelSpan.updateName(`${operationName} ${modelName}`);
    }
  }

  /**
   * Process function/tool span data
   */
  private processFunctionSpanData(otelSpan: OtelSpan, data: SpanData, traceId: string): void {
    const functionData = data as Record<string, unknown>;
    const attrs = Utils.getAttributesFromFunctionSpanData(data);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value !== null && value !== undefined && key !== OpenTelemetryConstants.GEN_AI_EXECUTION_TYPE_KEY) {
        const newKey = this.getNewKey(data.type, key);
        otelSpan.setAttribute(newKey || key, value as string | number | boolean);
      }
      otelSpan.setAttribute(OpenTelemetryConstants.GEN_AI_TOOL_TYPE_KEY, 'function');
    });

    this.stampCustomParent(otelSpan, traceId);
    // Use function name from data instead of span name
    otelSpan.updateName(`${OpenTelemetryConstants.EXECUTE_TOOL_OPERATION_NAME} ${functionData.name ?? ''}`);
    otelSpan.setAttribute(OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY, OpenTelemetryConstants.EXECUTE_TOOL_OPERATION_NAME);
  }

  /**
   * Process MCP list tools span data
   */
  private processMCPListToolsSpanData(otelSpan: OtelSpan, data: SpanData): void {
    const attrs = Utils.getAttributesFromMCPListToolsSpanData(data);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value !== null && value !== undefined && key !== OpenTelemetryConstants.GEN_AI_EXECUTION_TYPE_KEY) {
        const newKey = this.getNewKey(data.type, key);
        otelSpan.setAttribute(newKey || key, value as string | number | boolean);
      }
    });

    otelSpan.setAttribute(OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY, OpenTelemetryConstants.EXECUTE_TOOL_OPERATION_NAME);
    const serverName = (data as MCPListToolsSpanData).server ?? 'unknown';
    const newSpanName = `${OpenTelemetryConstants.EXECUTE_TOOL_OPERATION_NAME} ${serverName}`;
    otelSpan.updateName(newSpanName);
    if (serverName) {
      otelSpan.setAttribute(OpenTelemetryConstants.GEN_AI_TOOL_NAME_KEY, serverName);
    }
    otelSpan.setAttribute(OpenTelemetryConstants.GEN_AI_TOOL_TYPE_KEY, 'extension');
  }

  /**
   * Process handoff span data
   */
  private processHandoffSpanData(otelSpan: OtelSpan, data: SpanData, traceId: string): void {
    const handoffData = data as Record<string, unknown>;
    if (handoffData.to_agent && handoffData.from_agent) {
      const key = `${handoffData.to_agent}:${traceId}`;
      this.reverseHandoffsDict.set(key, handoffData.from_agent as string);

      // Cap the size
      while (this.reverseHandoffsDict.size > OpenAIAgentsTraceProcessor.MAX_HANDOFFS_IN_FLIGHT) {
        const firstKey = this.reverseHandoffsDict.keys().next().value;
        if (firstKey) {
          this.reverseHandoffsDict.delete(firstKey);
        }
      }
    }
  }

  /**
   * Process agent span data
   */
  private processAgentSpanData(otelSpan: OtelSpan, data: SpanData, traceId: string): void {
    const agentData = data as Record<string, unknown>;
    if (agentData.name) {
      otelSpan.setAttribute(Constants.GEN_AI_GRAPH_NODE_ID, agentData.name as string);
      otelSpan.setAttribute(OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY, OpenTelemetryConstants.INVOKE_AGENT_OPERATION_NAME);

      // Lookup parent node if exists
      const key = `${agentData.name}:${traceId}`;
      const parentNode = this.reverseHandoffsDict.get(key);
      if (parentNode) {
        this.reverseHandoffsDict.delete(key);
        otelSpan.setAttribute(Constants.GEN_AI_GRAPH_NODE_PARENT_ID, parentNode);
      }

      // Update span name for agent
      otelSpan.updateName(`${OpenTelemetryConstants.INVOKE_AGENT_OPERATION_NAME} ${agentData.name}`);
    }
  }

  /**
   * Stamp custom parent reference
   */
  private stampCustomParent(otelSpan: OtelSpan, traceId: string): void {
    const root = this.rootSpans.get(traceId);
    if (!root) {
      return;
    }

    const spanContext = root.spanContext();
    const pidHex = `0x${spanContext.spanId}`;
    otelSpan.setAttribute('custom.parent.span.id', pidHex);
  }

  /**
   * Force flush
   */
  public async forceFlush(): Promise<void> {
    // Implementation depends on tracer provider
  }

  /**
   * Shutdown
   */
  public async shutdown(_timeout?: number): Promise<void> {
    this.rootSpans.clear();
    this.otelSpans.clear();
    this.tokens.clear();
    this.reverseHandoffsDict.clear();
  }
}
