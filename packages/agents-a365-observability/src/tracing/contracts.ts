// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

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
 * Represents metadata about the source of an invocation
 */
export interface SourceMetadata {
  /** Unique identifier for the source (e.g., agent ID, user ID, system component ID) */
  id?: string;

  /** Human-readable name of the source */
  name?: string;

  /** Optional icon identifier or URL for visual representation of the source */
  iconUri?: string;

  /** The role of the source invoking the agent */
  role?: InvocationRole;

  /** Optional description providing additional context about the source */
  description?: string;
}

/**
 * Represents a request to an agent with telemetry context
 */
export interface AgentRequest {
  /** The content of the request */
  content: string;

  /** The type of invocation (how the agent was called) */
  executionType?: ExecutionType;

  /** Optional session identifier for grouping related requests */
  sessionId?: string;

  /** Optional metadata about the source of the invocation */
  sourceMetadata?: SourceMetadata;
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
}

/**
 * Details for invoking another agent
 */
export interface InvokeAgentDetails extends AgentDetails {
  /** The request payload for the agent invocation */
  request?: AgentRequest;
}


/**
 * Details for an LLM/AI model inference call
 */
export interface InferenceDetails {
  /** The name/identifier of the model being used */
  modelName: string;

  /** The provider of the model (e.g., openai, azure, anthropic) */
  provider?: string;

  /** The specific model version or variant */
  modelVersion?: string;

  /** Temperature parameter for the model */
  temperature?: number;

  /** Maximum tokens to generate */
  maxTokens?: number;

  /** Top-p parameter for the model */
  topP?: number;

  /** Input prompt or messages to the model */
  prompt?: string;
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
