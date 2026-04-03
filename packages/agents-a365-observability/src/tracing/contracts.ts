// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { SpanKind, TimeInput, Link } from '@opentelemetry/api';
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
 * Represents a request with telemetry context.
 * Used across all scope types for channel and conversation tracking.
 */
export interface Request {
  /** The content of the request */
  content?: string;

  /** Optional session identifier for grouping related requests */
  sessionId?: string;

  /** Optional channel for the invocation */
  channel?: Channel;

  /** Optional conversation identifier */
  conversationId?: string;
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

  /** Optional span links to associate with this span. */
  spanLinks?: Link[];
}

