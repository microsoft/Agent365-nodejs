// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { SpanStatusCode } from '@opentelemetry/api';
import { OpenTelemetryConstants } from '@microsoft/agents-a365-observability';
import * as Constants from './constants';
import { Span as AgentsSpan, SpanData } from '@openai/agents-core/dist/tracing/spans';

/**
 * Safely stringify an object to JSON
 * @param obj - The object to stringify
 * @returns JSON string representation or string conversion if JSON.stringify fails
 */
export function safeJsonDumps(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
}

/**
 * Get span name from OpenAI Agents SDK span
 */
export function getSpanName(span: AgentsSpan<SpanData>): string {
  const data = span.spanData;

  // Check if data has a 'name' property (for agent, function, custom spans)
  const dataWithName = data as { name?: string };
  if (dataWithName?.name && typeof dataWithName.name === 'string') {
    return dataWithName.name;
  }

  if (data?.type === 'handoff') {
    const handoffData = data as Record<string, unknown>;
    if (handoffData.to_agent) {
      return `handoff to ${handoffData.to_agent}`;
    }
  }

  return data?.type || 'unknown';
}

/**
 * Get span kind based on span data type
 */
export function getSpanKind(spanData: SpanData | undefined): string {
  if (!spanData?.type) {
    return Constants.GEN_AI_SPAN_KIND_CHAIN_KEY;
  }

  switch (spanData.type) {
  case 'agent':
    return Constants.GEN_AI_SPAN_KIND_AGENT_KEY;
  case 'function':
    return Constants.GEN_AI_SPAN_KIND_TOOL_KEY;
  case 'generation':
  case 'response':
    return Constants.GEN_AI_SPAN_KIND_LLM_KEY;
  case 'handoff':
    return Constants.GEN_AI_SPAN_KIND_TOOL_KEY;
  case 'custom':
  case 'guardrail':
    return Constants.GEN_AI_SPAN_KIND_CHAIN_KEY;
  default:
    return Constants.GEN_AI_SPAN_KIND_CHAIN_KEY;
  }
}

/**
 * Get attributes from generation span data
 */
export function getAttributesFromGenerationSpanData(data: SpanData): Record<string, unknown> {
  const attributes: Record<string, unknown> = {
    [OpenTelemetryConstants.GEN_AI_PROVIDER_NAME_KEY]: 'openai',
  };

  const genData = data as Record<string, unknown>;

  if (typeof genData.model === 'string') {
    attributes[OpenTelemetryConstants.GEN_AI_REQUEST_MODEL_KEY] = genData.model;
  }

  if (genData.model_config || genData.modelConfig) {
    const config = genData.model_config || genData.modelConfig;
    attributes[OpenTelemetryConstants.GEN_AI_EXECUTION_PAYLOAD_KEY] = safeJsonDumps(config);
  }

  if (genData.input) {
    attributes[OpenTelemetryConstants.GEN_AI_REQUEST_CONTENT_KEY] = safeJsonDumps(genData.input);
    attributes[OpenTelemetryConstants.GEN_AI_EXECUTION_TYPE_KEY] = 'application/json';
  }

  if (genData.output) {
    attributes[OpenTelemetryConstants.GEN_AI_RESPONSE_CONTENT_KEY] = safeJsonDumps(genData.output);
    const output = genData.output as Record<string, unknown>;
    if (output.id) {
      attributes[OpenTelemetryConstants.GEN_AI_RESPONSE_ID_KEY] = output.id;
    }
  }

  if (genData.usage) {
    const usage = genData.usage as Record<string, unknown>;
    if (usage.input_tokens !== undefined) {
      attributes[OpenTelemetryConstants.GEN_AI_USAGE_INPUT_TOKENS_KEY] = usage.input_tokens;
    }
    if (usage.output_tokens !== undefined) {
      attributes[OpenTelemetryConstants.GEN_AI_USAGE_OUTPUT_TOKENS_KEY] = usage.output_tokens;
    }
    if (usage.total_tokens !== undefined) {
      attributes[Constants.GEN_AI_LLM_TOKEN_COUNT_TOTAL] = usage.total_tokens;
    }
  }

  return attributes;
}

/**
 * Get attributes from function span data
 */
export function getAttributesFromFunctionSpanData(data: SpanData): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};

  const funcData = data as Record<string, unknown>;

  if (funcData.name) {
    attributes['gen_ai.tool.name'] = funcData.name;
  }

  if (funcData.input) {
    attributes[OpenTelemetryConstants.GEN_AI_REQUEST_CONTENT_KEY] =
      typeof funcData.input === 'string' ? funcData.input : safeJsonDumps(funcData.input);
    attributes[OpenTelemetryConstants.GEN_AI_EXECUTION_TYPE_KEY] = 'application/json';
  }

  if (funcData.output !== undefined && funcData.output !== null) {
    const output = typeof funcData.output === 'object' ? safeJsonDumps(funcData.output) : String(funcData.output);
    attributes[OpenTelemetryConstants.GEN_AI_RESPONSE_CONTENT_KEY] = output;
  }

  return attributes;
}

/**
 * Get attributes from MCP list tools span data
 */
export function getAttributesFromMCPListToolsSpanData(data: SpanData): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};

  const mcpData = data as Record<string, unknown>;

  if (mcpData.result) {
    attributes[OpenTelemetryConstants.GEN_AI_RESPONSE_CONTENT_KEY] = safeJsonDumps(mcpData.result);
    attributes[OpenTelemetryConstants.GEN_AI_EXECUTION_TYPE_KEY] = 'application/json';
  }
  return attributes;
}

/**
 * Get attributes from response span data
 */
export function getAttributesFromResponse(response: unknown): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};

  const resp = response as Record<string, unknown>;

  if (resp.model) {
    attributes[OpenTelemetryConstants.GEN_AI_REQUEST_MODEL_KEY] = resp.model;
  }

  if (resp.usage) {
    const usage = resp.usage as Record<string, unknown>;
    if (usage.input_tokens !== undefined) {
      attributes[OpenTelemetryConstants.GEN_AI_USAGE_INPUT_TOKENS_KEY] = usage.input_tokens;
    }
    if (usage.output_tokens !== undefined) {
      attributes[OpenTelemetryConstants.GEN_AI_USAGE_OUTPUT_TOKENS_KEY] = usage.output_tokens;
    }
    if (usage.total_tokens !== undefined) {
      attributes[Constants.GEN_AI_LLM_TOKEN_COUNT_TOTAL] = usage.total_tokens;
    }
  }

  return attributes;
}

/**
 * Get attributes from input data
 */
export function getAttributesFromInput(input: unknown): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};

  if (typeof input === 'string') {
    attributes[OpenTelemetryConstants.GEN_AI_REQUEST_CONTENT_KEY] = input;
  } else if (Array.isArray(input)) {
    attributes[OpenTelemetryConstants.GEN_AI_REQUEST_CONTENT_KEY] = safeJsonDumps(input);
  }

  return attributes;
}

/**
 * Get span status from OpenAI Agents SDK span
 */
export function getSpanStatus(span: AgentsSpan<SpanData>): { code: SpanStatusCode; message?: string } {
  if (span.error) {
    const message = span.error.message || span.error.data || 'Unknown error';
    return {
      code: SpanStatusCode.ERROR,
      message: String(message),
    };
  }

  return { code: SpanStatusCode.OK };
}
