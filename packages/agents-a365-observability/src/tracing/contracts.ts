// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { SpanKind, TimeInput, Link } from '@opentelemetry/api';
import type { ParentContext } from './context/trace-context-propagation';


/**
 * Represents different roles that can invoke an agent
 */
export enum InvocationRole {
  /** Human user invoking the agent */
  Human = 'Human',

  /** Another agent invoking this agent */
  Agent = 'Agent',

  /** Event-driven invocation (e.g., scheduled, webhook, message queue) */
  Event = 'Event',

  /** Unknown or unspecified role */
  Unknown = 'Unknown'
}

/**
 * Represents different operation for types for model inference
 */
export enum InferenceOperationType {
  CHAT = 'Chat'
}

/**
 * Represents channel for an invocation
 */
export interface Channel {
  /** Unique identifier for the channel (e.g., Teams channel ID, Slack workspace ID) */
  id?: string;

  /** Human-readable name of the channel (e.g., "Teams", "Slack", "web") */
  name?: string;

  /** Optional icon identifier or URL for visual representation of the channel */
  iconUri?: string;

  /** The role of the entity invoking through this channel */
  role?: InvocationRole;

  /** Optional description or link providing additional context about the channel */
  description?: string;
}

/**
 * Represents a request with telemetry context.
 * Used across all scope types for channel and conversation tracking.
 */
export interface Request {
  /** The content of the request. */
  content?: InputMessagesParam;

  /** Optional session identifier for grouping related requests */
  sessionId?: string;

  /** Optional channel for the invocation */
  channel?: Channel;

  /** Optional conversation identifier */
  conversationId?: string;
}


/**
 * Details about an AI agent
 */
export interface AgentDetails {
  /** The unique identifier for the AI agent */
  agentId: string;

  /** The human-readable name of the AI agent */
  agentName?: string;

  /** A description of the AI agent's purpose or capabilities */
  agentDescription?: string;

  /** Optional icon identifier or URL for visual representation of the agent */
  iconUri?: string;
  
  /** Optional platform identifier for the agent */
  platformId?: string;

  /** The agent user ID (AUID) */
  agentAUID?: string;

  /** The agent email address */
  agentEmail?: string;

  /** The agent blueprint/application ID */
  agentBlueprintId?: string;

  /** The tenant ID for the agent */
  tenantId?: string;

  /** The provider name (e.g., az.ai.agent365, openai, anthropic) */
  providerName?: string;

  /** The version of the agent (e.g., '1.0.0', '2025-05-01') */
  agentVersion?: string;
}

/**
 * Details of a tool call made by an agent
 */
export interface ToolCallDetails {
  /** The name of the tool being executed */
  toolName: string;

  /** Tool arguments/parameters. Objects are serialized to JSON automatically. */
  arguments?: Record<string, unknown> | string;

  /** The unique identifier for the tool call */
  toolCallId?: string;

  /** Optional description of the tool or its purpose */
  description?: string;

  /** The type of the tool being executed */
  toolType?: string;

  /** The endpoint for the tool execution */
  endpoint?: ServiceEndpoint;
}

/**
 * Details about the human user caller.
 */
export interface UserDetails {
  /** The unique identifier for the caller */
  userId?: string;

  /** The email address of the caller */
  userEmail?: string;

  /** The display name of the caller */
  userName?: string;

  /** The tenant ID of the caller */
  tenantId?: string;

  /** The client IP address for the caller */
  callerClientIp?: string;
}

/**
 * Caller details for scope creation.
 * Supports human callers, agent callers, or both (A2A with a human in the chain).
 *
 * **Migration note:** In v1 the name `CallerDetails` referred to human caller
 * identity (now {@link UserDetails}). In v2 it was repurposed as a wrapper that
 * groups both human and agent caller information.
 *
 * @see {@link UserDetails} — human caller identity (previously `CallerDetails`)
 * @see CHANGELOG.md — breaking changes section for migration guidance
 */
export interface CallerDetails {
  /** Optional human caller identity */
  userDetails?: UserDetails;

  /** Optional calling agent identity for A2A (agent-to-agent) scenarios */
  callerAgentDetails?: AgentDetails;
}

/**
 * @deprecated Use AgentDetails. EnhancedAgentDetails is now an alias of AgentDetails.
 */
export type EnhancedAgentDetails = AgentDetails;

/**
 * Represents an endpoint for agent invocation
 */
export interface ServiceEndpoint {
  /** The host address */
  host: string;

  /** The port number */
  port?: number;

  /** The protocol (e.g., http, https) */
  protocol?: string;
}

/**
 * Details for invoking agent scope.
 */
export interface InvokeAgentScopeDetails {
  /** The endpoint for the agent invocation */
  endpoint?: ServiceEndpoint;
}

/**
 * Details for an inference call
 */
export interface InferenceDetails {
  /** The operation name/type for the inference */
  operationName: InferenceOperationType;

  /** The model name/identifier */
  model: string;

  /** The provider name (e.g., openai, azure, anthropic) */
  providerName?: string;

  /** Number of input tokens used */
  inputTokens?: number;

  /** Number of output tokens generated */
  outputTokens?: number;

  /** Array of finish reasons */
  finishReasons?: string[];

  /** The thought process used by the agent */
  thoughtProcess?: string;

  /** The endpoint for the inference call */
  endpoint?: ServiceEndpoint;
}

/**
 * Details for recording the response from an inference call
 */
export interface InferenceResponse {
  /** The generated response content */
  content: string;

  /** Response ID from the model provider */
  responseId?: string;

  /** Finish reason (e.g., stop, length, content_filter) */
  finishReason?: string;

  /** Number of input tokens used */
  inputTokens?: number;

  /** Number of output tokens generated */
  outputTokens?: number;
}

/**
 * Represents a response containing output messages from an agent.
 * Used with OutputScope for output message tracing.
 * Accepts plain strings, structured OTEL OutputMessage objects, or a raw dict
 * (treated as a tool call result per OTEL spec).
 */
export interface OutputResponse {
  /** The output messages from the agent */
  messages: ResponseMessagesParam;
}

/**
 * Span configuration details for scope creation.
 * Groups OpenTelemetry span options into a single object so the scope
 * method signature remains stable as new options are added.
 */
export interface SpanDetails {
  /** Optional parent context for cross-async-boundary tracing.
   *  Accepts a ParentSpanRef (manual traceId/spanId) or an OTel Context
   *  (e.g. from extractContextFromHeaders). */
  parentContext?: ParentContext;

  /** Optional explicit start time (ms epoch, Date, or HrTime). */
  startTime?: TimeInput;

  /** Optional explicit end time (ms epoch, Date, or HrTime). */
  endTime?: TimeInput;

  /** Optional span kind override. */
  spanKind?: SpanKind;

  /** Optional span links to associate with this span. */
  spanLinks?: Link[];
}

// ---------------------------------------------------------------------------
// OpenTelemetry Semantic Convention – Gen-AI Message Format
// https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-input-messages.json
// https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-output-messages.json
// ---------------------------------------------------------------------------

/**
 * Role of a message participant per OTEL gen-ai semantic conventions.
 */
export enum MessageRole {
  SYSTEM = 'system',
  USER = 'user',
  ASSISTANT = 'assistant',
  TOOL = 'tool'
}

/**
 * Reason a model stopped generating per OTEL gen-ai semantic conventions.
 */
export enum FinishReason {
  STOP = 'stop',
  LENGTH = 'length',
  CONTENT_FILTER = 'content_filter',
  TOOL_CALL = 'tool_call',
  ERROR = 'error'
}

/**
 * Media modality for blob, file, and URI parts.
 */
export enum Modality {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio'
}

// ---- Message part types (discriminated union on `type`) --------------------

/** Plain text content. */
export interface TextPart {
  type: 'text';
  content: string;
}

/** A tool call requested by the model. */
export interface ToolCallRequestPart {
  type: 'tool_call';
  name: string;
  id?: string;
  arguments?: Record<string, unknown> | unknown[];
}

/** Result of a tool call. */
export interface ToolCallResponsePart {
  type: 'tool_call_response';
  id?: string;
  response?: unknown;
}

/** Model reasoning / chain-of-thought content. */
export interface ReasoningPart {
  type: 'reasoning';
  content: string;
}

/** Inline binary data (base64-encoded). */
export interface BlobPart {
  type: 'blob';
  modality: Modality | string;
  mime_type?: string;
  content: string;
}

/** Reference to a pre-uploaded file. */
export interface FilePart {
  type: 'file';
  modality: Modality | string;
  mime_type?: string;
  file_id: string;
}

/** External URI reference. */
export interface UriPart {
  type: 'uri';
  modality: Modality | string;
  mime_type?: string;
  uri: string;
}

/** Extensible server tool call details with a type discriminator. */
export interface GenericServerToolCall {
  type: string;
  [key: string]: unknown;
}

/** Extensible server tool call response with a type discriminator. */
export interface GenericServerToolCallResponse {
  type: string;
  [key: string]: unknown;
}

/** Server-side tool invocation. */
export interface ServerToolCallPart {
  type: 'server_tool_call';
  name: string;
  id?: string;
  server_tool_call: GenericServerToolCall;
}

/** Server-side tool response. */
export interface ServerToolCallResponsePart {
  type: 'server_tool_call_response';
  id?: string;
  server_tool_call_response: GenericServerToolCallResponse;
}

/** Extensible part for custom / future types. */
export interface GenericPart {
  type: string;
  [key: string]: unknown;
}

/**
 * Union of all message part types per OTEL gen-ai semantic conventions.
 *
 * Note: {@link GenericPart} acts as a catch-all for forward compatibility with
 * custom or future part types. Because its `type` is `string` (not a literal),
 * exhaustive `switch`/`case` on `part.type` will not produce compile-time errors
 * for unhandled cases.
 */
export type MessagePart =
  | TextPart
  | ToolCallRequestPart
  | ToolCallResponsePart
  | ReasoningPart
  | BlobPart
  | FilePart
  | UriPart
  | ServerToolCallPart
  | ServerToolCallResponsePart
  | GenericPart;

/**
 * An input message sent to a model (OTEL gen-ai semantic conventions).
 */
export interface ChatMessage {
  role: MessageRole | string;
  parts: MessagePart[];
  name?: string;
}

export interface InputMessages {
  messages: ChatMessage[];
}
/**
 * An output message produced by a model (OTEL gen-ai semantic conventions).
 * `finish_reason` defaults to `"stop"` per OTel spec when not provided.
 */
export interface OutputMessage extends ChatMessage {
  finish_reason?: FinishReason | string;
}

export interface OutputMessages {
  messages: OutputMessage[];
}

/** Default finish reason applied when none is provided (per OTel spec). */
export const DEFAULT_FINISH_REASON = 'stop' as const;

/** Accepted input for `recordInputMessages`. Supports a single string, an array of strings (backward compat), or the structured wrapper. */
export type InputMessagesParam = string | string[] | InputMessages;

/** Accepted input for `recordOutputMessages`. Supports a single string, an array of strings (backward compat), or the structured wrapper. */
export type OutputMessagesParam = string | string[] | OutputMessages;

/**
 * Accepted input for `OutputResponse.messages`.
 * Supports plain strings, structured OutputMessages, or a raw dict (treated as a tool call result
 * per OTEL spec and serialized directly via JSON.stringify).
 */
export type ResponseMessagesParam = OutputMessagesParam | Record<string, unknown>;

// ---------------------------------------------------------------------------
// Guardrail / Security Contracts
// ---------------------------------------------------------------------------

/**
 * The decision made by a security guardian during guardrail evaluation.
 */
export enum GuardrailDecisionType {
  /** Content or action is allowed to proceed. */
  Allow = 'allow',

  /** Content or action is logged for review but allowed to proceed. */
  Audit = 'audit',

  /** Content or action is denied/blocked. */
  Deny = 'deny',

  /** Content was modified (e.g., redacted, sanitized, rewritten). */
  Modify = 'modify',

  /** Content or action triggered a warning but is allowed to proceed. */
  Warn = 'warn',
}

/**
 * Well-known severity levels for security risks detected by guardrails.
 */
export const GuardrailRiskSeverity = {
  None: 'none',
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  Critical: 'critical',
} as const;

/**
 * Well-known values for the type of content or action a guardrail is applied to.
 * Custom strings are also accepted.
 */
export const GuardrailTargetType = {
  LlmInput: 'llm_input',
  LlmOutput: 'llm_output',
  ToolCall: 'tool_call',
  ToolDefinition: 'tool_definition',
  MemoryStore: 'memory_store',
  MemoryRetrieve: 'memory_retrieve',
  KnowledgeQuery: 'knowledge_query',
  KnowledgeResult: 'knowledge_result',
  Message: 'message',
} as const;

/**
 * Details of a guardrail evaluation for security operations tracing.
 */
export interface GuardrailDetails {
  /** The type of content or action the guardrail is applied to (required). */
  targetType: string;

  /** The decision made by the guardian (required). */
  decisionType: GuardrailDecisionType;

  /** Human-readable name of the guardian. */
  guardianName?: string;

  /** Unique identifier of the guardian. */
  guardianId?: string;

  /** Provider of the guardian service (e.g., azure.ai.content_safety). */
  guardianProviderName?: string;

  /** Version of the guardian. */
  guardianVersion?: string;

  /** Identifier of the target being guarded. */
  targetId?: string;

  /** Human-readable explanation for the decision. */
  decisionReason?: string;

  /** Machine-readable decision code. */
  decisionCode?: string;

  /** Identifier of the policy that triggered the decision. */
  policyId?: string;

  /** Human-readable name of the policy. */
  policyName?: string;

  /** Version of the policy. */
  policyVersion?: string;

  /** Hash of the input content for forensic correlation. */
  contentInputHash?: string;

  /** Whether content was modified by the guardrail. */
  contentModified?: boolean;

  /** External correlation identifier for SIEM systems. */
  externalEventId?: string;
}

/**
 * Represents a single security finding detected during guardian evaluation.
 * Multiple findings may be emitted for a single guardrail span.
 */
export interface GuardrailFinding {
  /** The category of security risk detected (required). */
  riskCategory: string;

  /** The severity level of the detected risk (required). */
  riskSeverity: string;

  /** The decision type for this specific policy finding. */
  policyDecisionType?: string;

  /** Identifier of the policy that triggered the finding. */
  policyId?: string;

  /** Human-readable name of the triggered policy. */
  policyName?: string;

  /** Version of the policy. */
  policyVersion?: string;

  /** Numeric risk/confidence score (0.0 to 1.0). */
  riskScore?: number;

  /**
   * Non-content metadata about the detected risk (MUST NOT contain PII).
   * Example values: "field:bcc", "pattern:ssn", "count:3".
   */
  riskMetadata?: string[];
}
