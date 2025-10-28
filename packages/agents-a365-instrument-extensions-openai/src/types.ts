// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

/**
 * Type definitions for OpenAI Agents SDK trace data structures
 *
 * These types are re-exported from @openai/agents-core for convenience.
 * The actual type definitions come from the OpenAI Agents SDK.
 */

export type {
  SpanData,
  AgentSpanData,
  FunctionSpanData,
  GenerationSpanData,
  ResponseSpanData,
  HandoffSpanData,
  CustomSpanData,
  GuardrailSpanData,
  MCPListToolsSpanData,
  TranscriptionSpanData,
  SpeechSpanData,
  SpeechGroupSpanData,
  Span,
} from '@openai/agents-core/dist/tracing/spans';

export type { Trace } from '@openai/agents-core/dist/tracing/traces';

export type { TracingProcessor } from '@openai/agents-core/dist/tracing/processor';

/**
 * Instrumentation options for Agent365 instrumentor
 */
export interface InstrumentationOptions {
  tracerName?: string;
  tracerVersion?: string;
}

/**
 * Context token for span context management
 */
export type ContextToken = unknown;
