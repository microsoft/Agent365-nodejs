// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { SpanStatusCode } from '@opentelemetry/api';
import {
  OpenTelemetryConstants,
  truncateValue,
  serializeMessages,
  A365_MESSAGE_SCHEMA_VERSION,
  MessageRole,
  InputMessages,
  OutputMessages,
} from '@microsoft/agents-a365-observability';
import type { ChatMessage, OutputMessage, MessagePart } from '@microsoft/agents-a365-observability';
import * as Constants from './Constants';
import { Span as AgentsSpan, SpanData } from '@openai/agents-core/dist/tracing/spans';

/**
 * Safely stringify an object to JSON
 * @param obj - The object to stringify
 * @returns JSON string representation or string conversion if JSON.stringify fails
 */
export function safeJsonDumps(obj: unknown): string {
  try {
    return truncateValue(JSON.stringify(obj));
  } catch {
    return truncateValue(String(obj));
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
    return Constants.GEN_AI_SPAN_KIND_CHAIN_KEY;
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
    attributes[Constants.GEN_AI_REQUEST_CONTENT_KEY] = serializeMessages(wrapRawContentAsInputMessages(genData.input));
  }

  if (genData.output) {
    attributes[Constants.GEN_AI_RESPONSE_CONTENT_KEY] = serializeMessages(wrapRawContentAsOutputMessages(genData.output));
  }

  if (genData.usage) {
    const usage = genData.usage as Record<string, unknown>;
    if (usage.input_tokens !== undefined) {
      attributes[OpenTelemetryConstants.GEN_AI_USAGE_INPUT_TOKENS_KEY] = usage.input_tokens;
    }
    if (usage.output_tokens !== undefined) {
      attributes[OpenTelemetryConstants.GEN_AI_USAGE_OUTPUT_TOKENS_KEY] = usage.output_tokens;
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
    attributes[Constants.GEN_AI_REQUEST_CONTENT_KEY] =
      typeof funcData.input === 'string' ? truncateValue(funcData.input) : safeJsonDumps(funcData.input);
  }

  if (funcData.output !== undefined && funcData.output !== null) {
    const output = typeof funcData.output === 'object' ? safeJsonDumps(funcData.output) : truncateValue(String(funcData.output));
    attributes[Constants.GEN_AI_RESPONSE_CONTENT_KEY] = output;
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
    attributes[Constants.GEN_AI_RESPONSE_CONTENT_KEY] = safeJsonDumps(mcpData.result);
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

// ---------------------------------------------------------------------------
// Structured message builders (OTEL gen-ai message format)
// ---------------------------------------------------------------------------

type OpenAIInputMessage = { role: string; content: string | unknown[] | unknown };
type OpenAIOutputItem = { role?: string; content?: unknown[]; type?: string; text?: string; [key: string]: unknown };

/**
 * Map an OpenAI role string to a MessageRole value.
 */
function mapOpenAIRole(role: string): MessageRole | string {
  switch (role) {
  case 'user':
    return MessageRole.USER;
  case 'assistant':
    return MessageRole.ASSISTANT;
  case 'system':
    return MessageRole.SYSTEM;
  case 'tool':
    return MessageRole.TOOL;
  default:
    return role;
  }
}

function getModalityFromMimeType(mimeType: unknown): string {
  return String(mimeType ?? 'file').split('/')[0] || 'file';
}

function mapGenericBlock(blockType: string | undefined, block: Record<string, unknown>): MessagePart {
  return { type: blockType ?? 'unknown', content: safeJsonDumps(block) } as MessagePart;
}

function parseToolCallArguments(args: unknown): Record<string, unknown> | undefined {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args) as Record<string, unknown>;
    } catch {
      return { raw: args };
    }
  }

  if (args && typeof args === 'object') {
    return args as Record<string, unknown>;
  }

  return undefined;
}

function getToolCallId(block: Record<string, unknown>): string | undefined {
  if (block.call_id != null) return String(block.call_id);
  if (block.id != null) return String(block.id);
  return undefined;
}

function wrapRawContentAsMessages(raw: unknown, role: MessageRole): InputMessages | OutputMessages {
  const content = typeof raw === 'string' ? raw : safeJsonDumps(raw);
  return {
    version: A365_MESSAGE_SCHEMA_VERSION,
    messages: [{ role, parts: [{ type: 'text', content }] }],
  };
}

/**
 * Map an OpenAI input content block to a MessagePart.
 */
function mapInputContentBlock(block: Record<string, unknown>): MessagePart {
  const blockType = block.type as string | undefined;
  switch (blockType) {
  case 'input_text':
    return { type: 'text', content: String(block.text ?? '') };
  case 'input_image':
    return { type: 'image' as string, modality: 'image', ...stripBinaryFields(block) } as MessagePart;
  case 'input_file':
    return {
      type: 'file' as string,
      modality: getModalityFromMimeType(block.mime_type),
      ...stripBinaryFields(block),
    } as MessagePart;
  default:
    return mapGenericBlock(blockType, block);
  }
}

/**
 * Strip large binary fields from a content block for telemetry.
 */
function stripBinaryFields(block: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(block)) {
    if (key === 'type') continue;
    if (typeof value === 'string' && value.length > 1024) {
      result[key] = '[truncated]';
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Map an OpenAI output content block to a MessagePart.
 */
function mapOutputContentBlock(block: Record<string, unknown>): MessagePart {
  const blockType = block.type as string | undefined;
  switch (blockType) {
  case 'output_text':
    return { type: 'text', content: String(block.text ?? '') };
  case 'refusal':
    return { type: 'text', content: String(block.refusal ?? '') };
  case 'tool_call':
  case 'function_call': {
    const parsedArgs = parseToolCallArguments(block.arguments ?? block.args);
    return {
      type: 'tool_call',
      name: String(block.name ?? block.function ?? ''),
      id: getToolCallId(block),
      arguments: parsedArgs,
    };
  }
  case 'reasoning':
    return { type: 'reasoning', content: String(block.text ?? block.content ?? '') };
  default:
    return mapGenericBlock(blockType, block);
  }
}

/**
 * Build structured InputMessages from an OpenAI _input message array.
 * Includes all roles (system, user, assistant, tool).
 */
export function buildStructuredInputMessages(
  arr: OpenAIInputMessage[]
): InputMessages {
  const messages: ChatMessage[] = [];

  for (const msg of arr) {
    if (!msg || typeof msg !== 'object') continue;

    const role = mapOpenAIRole(msg.role ?? 'user');
    let parts: MessagePart[];

    if (typeof msg.content === 'string') {
      parts = [{ type: 'text', content: msg.content }];
    } else if (Array.isArray(msg.content)) {
      parts = (msg.content as Record<string, unknown>[]).map(mapInputContentBlock);
    } else {
      parts = [{ type: 'text', content: safeJsonDumps(msg.content) }];
    }

    messages.push({ role, parts });
  }

  return { version: A365_MESSAGE_SCHEMA_VERSION, messages };
}

/**
 * Build structured OutputMessages from an OpenAI response.output array.
 */
export function buildStructuredOutputMessages(
  arr: OpenAIOutputItem[]
): OutputMessages {
  const messages: OutputMessage[] = [];

  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;

    const role = mapOpenAIRole(item.role ?? 'assistant');

    // Items with a content array (standard response format)
    if (Array.isArray(item.content)) {
      const parts = (item.content as Record<string, unknown>[]).map(mapOutputContentBlock);
      messages.push({ role, parts });
      continue;
    }

    // Items that are themselves content blocks (e.g., type: 'message' with text)
    if (item.type && typeof item.type === 'string') {
      const parts = [mapOutputContentBlock(item as Record<string, unknown>)];
      messages.push({ role, parts });
      continue;
    }

    // Fallback: stringify the item
    messages.push({
      role,
      parts: [{ type: 'text', content: safeJsonDumps(item) }],
    });
  }

  return { version: A365_MESSAGE_SCHEMA_VERSION, messages };
}

/**
 * Wrap opaque raw content as InputMessages (for generation span data).
 */
export function wrapRawContentAsInputMessages(raw: unknown): InputMessages {
  return wrapRawContentAsMessages(raw, MessageRole.USER) as InputMessages;
}

/**
 * Wrap opaque raw content as OutputMessages (for generation span data).
 */
export function wrapRawContentAsOutputMessages(raw: unknown): OutputMessages {
  return wrapRawContentAsMessages(raw, MessageRole.ASSISTANT) as OutputMessages;
}
