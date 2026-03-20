// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { SpanKind, TimeInput } from '@opentelemetry/api';
import type { ParentContext } from './context/trace-context-propagation';

/**
 * Represents different types of agent invocations
 */
export enum ExecutionType {
  /** Direct human-to-agent invocation (e.g., through UI, API call) */
  HumanToAgent = 'HumanToAgent',

  /** Agent-to-agent invocation (e.g., one agent calling another) */
  Agent2Agent = 'Agent2Agent',

  /** Event-driven agent invocation (e.g., scheduled, webhook, message queue) */
  EventToAgent = 'EventToAgent',

  /** Unknown or unspecified invocation type */
  Unknown = 'Unknown'
}


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
    CHAT = 'Chat',
    TEXT_COMPLETION  = 'TextCompletion',
    GENERATE_CONTENT  = 'GenerateContent'
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
 * Represents a request to an agent with telemetry context
 */
export interface AgentRequest {
  /** The content of the request */
  content?: string;

  /** The type of invocation (how the agent was called) */
  executionType?: ExecutionType;

  /** Optional session identifier for grouping related requests */
  sessionId?: string;

  /** Optional channel for the invocation */
  channel?: Channel;

  /** Optional conversation identifier */
  conversationId?: string;
}

/**
 * Represents a request context for inference operations
 */
export interface InferenceRequest {
  /** Optional conversation identifier */
  conversationId?: string;

  /** Optional channel; only `name` (channel name) and `description` (channel link/URL) are used for tagging. */
  channel?: Pick<Channel, "name" | "description">;
}

/**
 * Represents a request context for tool execution operations
 */
export interface ToolRequest {
  /** Optional conversation identifier */
  conversationId?: string;

  /** Optional channel; only `name` (channel name) and `description` (channel link/URL) are used for tagging. */
  channel?: Pick<Channel, "name" | "description">;
}

/**
 * Details about a tenant
 */
export interface TenantDetails {
  /** The unique identifier for the tenant */
  tenantId: string;
}

/**
 * Details about an AI agent
 */
export interface AgentDetails {
  /** The unique identifier for the AI agent */
  agentId: string;

  /** The identifier for the conversation or session */
  conversationId?: string;

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

  /** The agent user principal name (UPN) */
  agentUPN?: string;

  /** The agent blueprint/application ID */
  agentBlueprintId?: string;

  /** The tenant ID for the agent */
  tenantId?: string;

  /** The provider name (e.g., az.ai.agent365, openai, anthropic) */
  providerName?: string;
}

/**
 * Details of a tool call made by an agent
 */
export interface ToolCallDetails {
  /** The name of the tool being executed */
  toolName: string;

  /** Tool arguments/parameters */
  arguments?: string;

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
 * Details about a caller
 */
export interface CallerDetails {
  /** The unique identifier for the caller */
  callerId?: string;

  /** The user principal name (UPN) of the caller */
  callerUpn?: string;

  /** The display name of the caller */
  callerName?: string;

  /** The user ID of the caller */
  callerUserId?: string;

  /** The tenant ID of the caller */
  tenantId?: string;

  /** The client IP address for the caller */
  callerClientIp?: string;
}

/**
 * Caller details for agent invocation scopes.
 * Supports human callers, agent callers, or both (A2A with a human in the chain).
 */
export interface InvokeAgentCallerDetails {
  /** Optional human/non-agentic caller identity */
  callerDetails?: CallerDetails;

  /** Optional calling agent identity for A2A (agent-to-agent) scenarios */
  callerAgentDetails?: AgentDetails;
}

/*
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
 * Details for invoking another agent.
 */
export interface InvokeAgentDetails {
  /** The agent identity details. */
  details: AgentDetails;

  /** The endpoint for the agent invocation */
  endpoint?: ServiceEndpoint;

  /** Session ID for the invocation */
  sessionId?: string;
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
 * Represents a request context for output message operations
 */
export interface OutputRequest {
  /** Optional conversation identifier */
  conversationId?: string;

  /** Optional channel; only `name` (channel name) and `description` (channel link/URL) are used for tagging. */
  channel?: Pick<Channel, "name" | "description">;
}

/**
 * Represents a response containing output messages from an agent.
 * Used with OutputScope for output message tracing.
 */
export interface OutputResponse {
  /** The output messages from the agent */
  messages: string[];
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
}

