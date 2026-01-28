# Product Requirements Document: Send Chat History API for LangChain Orchestrator

| **Document Version** | 1.1 |
|---------------------|-----|
| **Status** | Draft |
| **Author** | Microsoft Agent 365 Team |
| **Created** | 2026-01-26 |
| **Last Updated** | 2026-01-26 |
| **Target Package** | `@microsoft/agents-a365-tooling-extensions-langchain` |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals and Non-Goals](#3-goals-and-non-goals)
4. [User Stories](#4-user-stories)
5. [Technical Requirements](#5-technical-requirements)
6. [Implementation Details](#6-implementation-details)
7. [Dependencies](#7-dependencies)
8. [Testing Strategy](#8-testing-strategy)
9. [Success Metrics](#9-success-metrics)
10. [Open Questions](#10-open-questions)

---

## 1. Executive Summary

This PRD defines the requirements for implementing a **Send Chat History API** in the `@microsoft/agents-a365-tooling-extensions-langchain` package. This feature enables LangChain-based agents to send conversation history to the Microsoft Agent 365 MCP platform for real-time threat protection (RTP) analysis.

### Background

The Microsoft Agent 365 SDK provides enterprise-grade capabilities for AI agents, including security monitoring through the MCP platform. Real-time threat protection requires access to conversation history to detect and prevent potential security threats, prompt injection attacks, and policy violations.

This feature parallels the implementation delivered in PR #157 for the OpenAI Agents SDK orchestrator, ensuring consistent capabilities across all supported orchestrators.

### Reference Implementation

- **OpenAI Implementation**: PR #157 added `sendChatHistoryAsync` and `sendChatHistoryMessagesAsync` methods to the OpenAI tooling extensions package
- **Core Infrastructure**: `McpToolServerConfigurationService.sendChatHistory()` in `@microsoft/agents-a365-tooling` provides the underlying HTTP transport

---

## 2. Problem Statement

### Current State

Currently, developers using LangChain with the Microsoft Agent 365 SDK can:
- Register MCP tool servers with their LangChain agents via `McpToolRegistrationService.addToolServersToAgent()`
- Access Microsoft 365 tools through the LangChain `@langchain/mcp-adapters` integration

However, they **cannot**:
- Send conversation history to the MCP platform for security analysis
- Integrate with the real-time threat protection system
- Maintain security parity with other orchestrator implementations

### Desired Future State

Developers should be able to send chat history with minimal code. The API is designed with a layered approach where the highest-level APIs accept LangChain client/state objects directly, making them easiest to use:

```typescript
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-langchain';

const service = new McpToolRegistrationService();

// Option 1: Highest-level API - Send directly from LangGraph CompiledStateGraph
// The developer already has the graph; this is the easiest option
const config = { configurable: { thread_id: '1' } };
const result = await service.sendChatHistoryAsync(turnContext, graph, config);

// Option 2: Send from a StateSnapshot (if developer already has one)
const stateSnapshot = await graph.getState(config);
const result = await service.sendChatHistoryFromStateAsync(turnContext, stateSnapshot);

// Option 3: Send from a BaseChatMessageHistory instance
const messageHistory: BaseChatMessageHistory = getMessageHistory();
const result = await service.sendChatHistoryFromChatHistoryAsync(turnContext, messageHistory);

// Option 4: Lowest-level API - Send raw BaseMessage array
// Used when developer has already extracted messages or has custom message sources
const messages = await messageHistory.getMessages();
const result = await service.sendChatHistoryFromMessagesAsync(turnContext, messages);

if (result.succeeded) {
  console.log('Chat history sent successfully');
}
```

### User Pain Points

1. **Security Gap**: LangChain agents cannot participate in real-time threat protection without manual message conversion
2. **Developer Friction**: No native integration between LangChain message types and the MCP platform
3. **Inconsistency**: Feature disparity between OpenAI and LangChain orchestrator extensions
4. **Complexity**: Developers must manually extract and convert messages from various LangChain memory/state structures

---

## 3. Goals and Non-Goals

### Goals

| ID | Goal | Priority |
|----|------|----------|
| G1 | Provide highest-level API (`sendChatHistoryAsync`) that accepts `CompiledStateGraph` directly for easiest integration | P0 |
| G2 | Provide layered APIs for different entry points: StateSnapshot, BaseChatMessageHistory, and raw BaseMessage arrays | P0 |
| G3 | Maintain API consistency with the OpenAI orchestrator implementation patterns | P0 |
| G4 | Handle all standard LangChain message types (HumanMessage, AIMessage, SystemMessage, ToolMessage, FunctionMessage) | P0 |
| G5 | Send empty message arrays to the API (not no-op) to ensure user message registration with RTP | P0 |
| G6 | Gracefully handle message conversion failures without throwing exceptions | P1 |
| G7 | Support optional message limit parameter for large conversation histories | P1 |
| G8 | Provide clear error messages for validation failures | P1 |

### Non-Goals

| ID | Non-Goal | Rationale |
|----|----------|-----------|
| NG1 | Automatic interception of all LangChain messages | Security analysis should be explicitly invoked by developers |
| NG2 | Support for streaming message chunks (BaseMessageChunk) | Chunks are partial messages; only complete messages should be sent |
| NG3 | Persisting or caching conversation history | The SDK is responsible for transport only |
| NG4 | Modifying or filtering messages before sending | RTP requires unmodified content for accurate analysis |
| NG5 | Support for LangChain Python SDK | This is a TypeScript/Node.js package |
| NG6 | Direct integration with specific checkpointer implementations | The API operates on message arrays, not storage backends |

---

## 4. User Stories

### Primary User Stories

| ID | User Story | Priority | Acceptance Criteria |
|----|------------|----------|---------------------|
| US-01 | As a developer, I want to send chat history directly from my LangGraph CompiledStateGraph so that I can integrate RTP with minimal code | P0 | `sendChatHistoryAsync(turnContext, graph, config)` fetches state from graph and sends messages to MCP platform |
| US-02 | As a developer, I want to send messages from a StateSnapshot when I already have one so that I avoid redundant state fetches | P0 | `sendChatHistoryFromStateAsync(turnContext, stateSnapshot)` extracts messages from StateSnapshot and sends them |
| US-03 | As a developer, I want to send messages from a BaseChatMessageHistory instance so that I can integrate with any LangChain memory backend | P0 | `sendChatHistoryFromChatHistoryAsync(turnContext, chatHistory)` retrieves messages via `getMessages()` and sends them |
| US-04 | As a developer, I want to send raw BaseMessage arrays when I have custom message sources so that I have maximum flexibility | P0 | `sendChatHistoryFromMessagesAsync(turnContext, messages)` accepts `BaseMessage[]` and returns `OperationResult` |

### Secondary User Stories

| ID | User Story | Priority | Acceptance Criteria |
|----|------------|----------|---------------------|
| US-05 | As a developer, I want conversion errors to be handled gracefully so that partial message lists can still be processed | P1 | Messages that fail conversion are skipped; successfully converted messages are sent |
| US-06 | As a developer, I want to limit the number of messages sent so that I can control bandwidth and processing costs | P1 | Optional `limit` parameter restricts the number of messages sent |
| US-07 | As a developer, I want to receive detailed error information when the operation fails so that I can diagnose issues | P1 | `OperationResult.errors` contains `OperationError` instances with descriptive messages |
| US-08 | As a developer, I want empty message arrays to still be sent to the API so that user messages are properly registered with RTP | P1 | Empty arrays are sent to the chat history API, not treated as no-op |

---

## 5. Technical Requirements

### 5.1 TypeScript Interfaces

#### Existing Interface (Unchanged)

```typescript
// From @microsoft/agents-a365-tooling
export interface ChatHistoryMessage {
  id: string;
  role: string;
  content: string;
  timestamp: Date;
}
```

#### LangChain Message Types (External)

```typescript
// From @langchain/core/messages
abstract class BaseMessage {
  content: MessageContent;  // string | ContentPart[]
  name?: string;
  additional_kwargs: Record<string, unknown>;
  response_metadata: Record<string, unknown>;
  id?: string;

  abstract getType(): MessageType;
  get text(): string;  // Accessor for string content
}

// Message type discriminants
type MessageType = 'human' | 'ai' | 'system' | 'tool' | 'function' | 'chat' | 'remove';

// Concrete message classes
class HumanMessage extends BaseMessage { getType() { return 'human'; } }
class AIMessage extends BaseMessage { getType() { return 'ai'; } }
class SystemMessage extends BaseMessage { getType() { return 'system'; } }
class ToolMessage extends BaseMessage { getType() { return 'tool'; } }
class FunctionMessage extends BaseMessage { getType() { return 'function'; } }
class ChatMessage extends BaseMessage { role: string; getType() { return 'chat'; } }
```

#### LangGraph State Types (External)

```typescript
// From @langchain/langgraph
interface StateSnapshot<State = Record<string, unknown>> {
  values: State;
  config: RunnableConfig;
  metadata?: CheckpointMetadata;
  createdAt?: string;
  parentConfig?: RunnableConfig;
}

// Common state pattern for message-based agents
interface MessagesState {
  messages: BaseMessage[];
}
```

### 5.2 API Design

The API is designed with a layered approach, from highest-level (easiest to use) to lowest-level (most flexible):

| Level | Method | Input | Use Case |
|-------|--------|-------|----------|
| 1 (Highest) | `sendChatHistoryAsync` | `CompiledStateGraph` + config | Developer has a LangGraph graph |
| 2 | `sendChatHistoryFromStateAsync` | `StateSnapshot` | Developer already has state snapshot |
| 3 | `sendChatHistoryFromChatHistoryAsync` | `BaseChatMessageHistory` | Developer has a chat history instance |
| 4 (Lowest) | `sendChatHistoryFromMessagesAsync` | `BaseMessage[]` | Developer has raw messages |

All higher-level APIs ultimately delegate to `sendChatHistoryFromMessagesAsync`, which handles the conversion to `ChatHistoryMessage[]` format.

#### Method Signatures

```typescript
import { CompiledStateGraph, StateSnapshot } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { BaseChatMessageHistory } from '@langchain/core/chat_history';
import { RunnableConfig } from '@langchain/core/runnables';

export class McpToolRegistrationService {
  // Existing methods...

  /**
   * Sends chat history from a LangGraph CompiledStateGraph to the MCP platform.
   *
   * This is the highest-level and easiest-to-use API. It retrieves the current state
   * from the graph, extracts messages, converts them to ChatHistoryMessage format,
   * and sends them to the MCP platform for real-time threat protection.
   *
   * @param turnContext - The turn context containing conversation information.
   * @param graph - The LangGraph CompiledStateGraph instance.
   * @param config - The RunnableConfig containing thread_id and other configuration.
   * @param limit - Optional limit on the number of messages to send.
   * @param toolOptions - Optional tool options for customization.
   * @returns A Promise resolving to an OperationResult indicating success or failure.
   * @throws Error if turnContext is null/undefined.
   * @throws Error if graph is null/undefined.
   * @throws Error if config is null/undefined.
   *
   * @example
   * ```typescript
   * const config = { configurable: { thread_id: '1' } };
   * const result = await service.sendChatHistoryAsync(turnContext, graph, config);
   * if (result.succeeded) {
   *   console.log('Chat history sent successfully');
   * }
   * ```
   */
  async sendChatHistoryAsync<State extends { messages: BaseMessage[] }>(
    turnContext: TurnContext,
    graph: CompiledStateGraph<State>,
    config: RunnableConfig,
    limit?: number,
    toolOptions?: ToolOptions
  ): Promise<OperationResult>;

  /**
   * Extracts messages from a LangGraph StateSnapshot and sends them to the MCP platform.
   *
   * Use this API when you already have a StateSnapshot (e.g., from a previous
   * `graph.getState()` call) and want to avoid fetching state again.
   *
   * @param turnContext - The turn context containing conversation information.
   * @param stateSnapshot - The LangGraph StateSnapshot containing message state.
   * @param limit - Optional limit on the number of messages to send.
   * @param toolOptions - Optional tool options for customization.
   * @returns A Promise resolving to an OperationResult indicating success or failure.
   * @throws Error if turnContext is null/undefined.
   * @throws Error if stateSnapshot is null/undefined.
   * @throws Error if stateSnapshot does not contain a messages array.
   *
   * @example
   * ```typescript
   * const config = { configurable: { thread_id: '1' } };
   * const stateSnapshot = await graph.getState(config);
   * const result = await service.sendChatHistoryFromStateAsync(turnContext, stateSnapshot);
   * ```
   */
  async sendChatHistoryFromStateAsync<State extends { messages: BaseMessage[] }>(
    turnContext: TurnContext,
    stateSnapshot: StateSnapshot<State>,
    limit?: number,
    toolOptions?: ToolOptions
  ): Promise<OperationResult>;

  /**
   * Retrieves messages from a BaseChatMessageHistory instance and sends them to the MCP platform.
   *
   * Use this API when working with LangChain's memory abstractions (e.g., InMemoryChatMessageHistory,
   * RedisChatMessageHistory, etc.).
   *
   * @param turnContext - The turn context containing conversation information.
   * @param chatHistory - The BaseChatMessageHistory instance to retrieve messages from.
   * @param limit - Optional limit on the number of messages to send.
   * @param toolOptions - Optional tool options for customization.
   * @returns A Promise resolving to an OperationResult indicating success or failure.
   * @throws Error if turnContext is null/undefined.
   * @throws Error if chatHistory is null/undefined.
   *
   * @example
   * ```typescript
   * const chatHistory = new InMemoryChatMessageHistory();
   * // ... add messages to history ...
   * const result = await service.sendChatHistoryFromChatHistoryAsync(turnContext, chatHistory);
   * ```
   */
  async sendChatHistoryFromChatHistoryAsync(
    turnContext: TurnContext,
    chatHistory: BaseChatMessageHistory,
    limit?: number,
    toolOptions?: ToolOptions
  ): Promise<OperationResult>;

  /**
   * Sends an array of LangChain messages to the MCP platform for real-time threat protection.
   *
   * This is the lowest-level API that accepts raw BaseMessage arrays. Use this when you
   * have already extracted messages or have a custom message source not covered by the
   * higher-level APIs.
   *
   * This method converts the provided BaseMessage array to ChatHistoryMessage format
   * and sends them to the MCP platform. Empty arrays are sent as-is to register the
   * user message with the platform.
   *
   * @param turnContext - The turn context containing conversation information.
   * @param messages - Array of LangChain BaseMessage objects to send.
   * @param limit - Optional limit on the number of messages to send.
   * @param toolOptions - Optional tool options for customization.
   * @returns A Promise resolving to an OperationResult indicating success or failure.
   * @throws Error if turnContext is null/undefined.
   * @throws Error if messages is null/undefined.
   * @throws Error if required turn context properties are missing.
   *
   * @example
   * ```typescript
   * const messages = await messageHistory.getMessages();
   * const result = await service.sendChatHistoryFromMessagesAsync(turnContext, messages, 50);
   * if (result.succeeded) {
   *   console.log('Chat history sent successfully');
   * } else {
   *   console.error('Failed to send chat history:', result.errors);
   * }
   * ```
   */
  async sendChatHistoryFromMessagesAsync(
    turnContext: TurnContext,
    messages: BaseMessage[],
    limit?: number,
    toolOptions?: ToolOptions
  ): Promise<OperationResult>;
}
```

### 5.3 Role Mapping

LangChain message types must be mapped to standard role strings for the ChatHistoryMessage format:

| LangChain Type | `getType()` Return | Mapped Role |
|----------------|-------------------|-------------|
| `HumanMessage` | `'human'` | `'user'` |
| `AIMessage` | `'ai'` | `'assistant'` |
| `SystemMessage` | `'system'` | `'system'` |
| `ToolMessage` | `'tool'` | `'tool'` |
| `FunctionMessage` | `'function'` | `'function'` |
| `ChatMessage` | `'chat'` | Use `message.role` property |

### 5.4 Content Extraction

Content extraction must handle both string and complex content formats:

```typescript
// Priority order for content extraction:
// 1. message.text accessor (preferred - handles ContentPart arrays)
// 2. message.content if it's a string
// 3. Concatenate text from ContentPart[] if content is an array
// 4. Skip message if no text content can be extracted
```

### 5.5 Error Handling Matrix

| Condition | Behavior | Return/Throw |
|-----------|----------|--------------|
| `turnContext` is null/undefined | Throw immediately | `Error('turnContext is required')` |
| `messages` is null/undefined | Throw immediately | `Error('messages is required')` |
| `graph` is null/undefined | Throw immediately | `Error('graph is required')` |
| `config` is null/undefined | Throw immediately | `Error('config is required')` |
| `chatHistory` is null/undefined | Throw immediately | `Error('chatHistory is required')` |
| `stateSnapshot` is null/undefined | Throw immediately | `Error('stateSnapshot is required')` |
| `stateSnapshot.values.messages` missing | Throw immediately | `Error('stateSnapshot must contain messages')` |
| Empty messages array | **Send empty array to API** | Required to register user message with RTP |
| Single message conversion fails | Skip message, continue | Log warning, process remaining |
| All message conversions fail | Send empty array to API | Required to register user message with RTP |
| HTTP request fails | Return failure | `OperationResult.failed(OperationError)` |
| Network timeout | Return failure | `OperationResult.failed(OperationError)` |

> **Important**: Empty message arrays must be sent to the chat history API (not treated as a no-op). This is required to register the user message with the real-time threat protection system, even when there is no prior conversation history.

---

## 6. Implementation Details

### 6.1 File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/McpToolRegistrationService.ts` | Modified | Add `sendChatHistoryAsync` and `sendChatHistoryFromStateAsync` methods, plus private helper methods |
| `src/index.ts` | Unchanged | Already exports `McpToolRegistrationService` |
| `package.json` | Modified | Add `uuid` and `@types/uuid` dependencies |

### 6.2 Implementation Pseudocode

```typescript
// McpToolRegistrationService.ts additions

import { v4 as uuidv4 } from 'uuid';
import { BaseMessage } from '@langchain/core/messages';
import { BaseChatMessageHistory } from '@langchain/core/chat_history';
import { CompiledStateGraph, StateSnapshot } from '@langchain/langgraph';
import { RunnableConfig } from '@langchain/core/runnables';

// Level 1 (Highest): Send from CompiledStateGraph
async sendChatHistoryAsync<State extends { messages: BaseMessage[] }>(
  turnContext: TurnContext,
  graph: CompiledStateGraph<State>,
  config: RunnableConfig,
  limit?: number,
  toolOptions?: ToolOptions
): Promise<OperationResult> {
  // Validate inputs
  if (!turnContext) throw new Error('turnContext is required');
  if (!graph) throw new Error('graph is required');
  if (!config) throw new Error('config is required');

  try {
    // Get state from graph
    const stateSnapshot = await graph.getState(config);

    // Delegate to state-based method
    return this.sendChatHistoryFromStateAsync(turnContext, stateSnapshot, limit, toolOptions);
  } catch (err) {
    if (err instanceof Error && err.message.includes('is required')) {
      throw err;
    }
    return OperationResult.failed(new OperationError(err as Error));
  }
}

// Level 2: Send from StateSnapshot
async sendChatHistoryFromStateAsync<State extends { messages: BaseMessage[] }>(
  turnContext: TurnContext,
  stateSnapshot: StateSnapshot<State>,
  limit?: number,
  toolOptions?: ToolOptions
): Promise<OperationResult> {
  if (!turnContext) throw new Error('turnContext is required');
  if (!stateSnapshot) throw new Error('stateSnapshot is required');

  const messages = stateSnapshot.values?.messages;
  if (!messages || !Array.isArray(messages)) {
    throw new Error('stateSnapshot must contain messages array in values');
  }

  return this.sendChatHistoryFromMessagesAsync(turnContext, messages, limit, toolOptions);
}

// Level 3: Send from BaseChatMessageHistory
async sendChatHistoryFromChatHistoryAsync(
  turnContext: TurnContext,
  chatHistory: BaseChatMessageHistory,
  limit?: number,
  toolOptions?: ToolOptions
): Promise<OperationResult> {
  if (!turnContext) throw new Error('turnContext is required');
  if (!chatHistory) throw new Error('chatHistory is required');

  try {
    // Retrieve messages from the chat history
    const messages = await chatHistory.getMessages();

    // Delegate to messages-based method
    return this.sendChatHistoryFromMessagesAsync(turnContext, messages, limit, toolOptions);
  } catch (err) {
    if (err instanceof Error && err.message.includes('is required')) {
      throw err;
    }
    return OperationResult.failed(new OperationError(err as Error));
  }
}

// Level 4 (Lowest): Send BaseMessage array
async sendChatHistoryFromMessagesAsync(
  turnContext: TurnContext,
  messages: BaseMessage[],
  limit?: number,
  toolOptions?: ToolOptions
): Promise<OperationResult> {
  // Validate inputs
  if (!turnContext) throw new Error('turnContext is required');
  if (!messages) throw new Error('messages is required');

  // Apply limit if specified
  const messagesToProcess = limit ? messages.slice(0, limit) : messages;

  // Set default options
  const effectiveOptions: ToolOptions = {
    orchestratorName: toolOptions?.orchestratorName ?? this.orchestratorName
  };

  try {
    // Convert messages (may result in empty array - that's OK)
    const chatHistoryMessages = this.convertToChatHistoryMessages(messagesToProcess);

    // IMPORTANT: Always send to API, even if empty array
    // Empty array is required to register the user message with RTP
    return await this.configService.sendChatHistory(
      turnContext,
      chatHistoryMessages,
      effectiveOptions
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes('is required')) {
      throw err;
    }
    return OperationResult.failed(new OperationError(err as Error));
  }
}

// Private: Convert BaseMessage[] to ChatHistoryMessage[]
private convertToChatHistoryMessages(messages: BaseMessage[]): ChatHistoryMessage[] {
  return messages
    .map(msg => this.convertSingleMessage(msg))
    .filter((msg): msg is ChatHistoryMessage => msg !== null);
}

// Private: Convert single message
private convertSingleMessage(message: BaseMessage): ChatHistoryMessage | null {
  try {
    const content = this.extractContent(message);
    if (!content || content.trim().length === 0) {
      return null;
    }

    return {
      id: message.id ?? uuidv4(),
      role: this.mapRole(message),
      content: content,
      timestamp: new Date()
    };
  } catch {
    return null;
  }
}

// Private: Map LangChain message type to role
private mapRole(message: BaseMessage): string {
  const type = message.getType();

  switch (type) {
    case 'human':
      return 'user';
    case 'ai':
      return 'assistant';
    case 'system':
      return 'system';
    case 'tool':
      return 'tool';
    case 'function':
      return 'function';
    case 'chat':
      // ChatMessage has a role property
      return (message as { role?: string }).role ?? 'user';
    default:
      return 'user';
  }
}

// Private: Extract text content from message
private extractContent(message: BaseMessage): string {
  // Try the text accessor first (handles ContentPart arrays)
  try {
    const text = message.text;
    if (text && text.trim().length > 0) {
      return text;
    }
  } catch {
    // text accessor might throw for non-text content
  }

  // Fallback to content property
  if (typeof message.content === 'string') {
    return message.content;
  }

  // Handle ContentPart array
  if (Array.isArray(message.content)) {
    const textParts = message.content
      .filter((part): part is { type: string; text: string } =>
        typeof part === 'object' && part !== null && 'text' in part
      )
      .map(part => part.text)
      .filter(text => text && text.length > 0);

    if (textParts.length > 0) {
      return textParts.join(' ');
    }
  }

  return '';
}
```

### 6.3 Sequence Diagram

#### Layered API Delegation

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        API DELEGATION FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Level 1: sendChatHistoryAsync(turnContext, graph, config)                      │
│           │                                                                      │
│           ├──► graph.getState(config) → StateSnapshot                           │
│           │                                                                      │
│           └──► delegates to Level 2                                             │
│                                                                                  │
│  Level 2: sendChatHistoryFromStateAsync(turnContext, stateSnapshot)             │
│           │                                                                      │
│           ├──► stateSnapshot.values.messages → BaseMessage[]                    │
│           │                                                                      │
│           └──► delegates to Level 4                                             │
│                                                                                  │
│  Level 3: sendChatHistoryFromChatHistoryAsync(turnContext, chatHistory)         │
│           │                                                                      │
│           ├──► chatHistory.getMessages() → BaseMessage[]                        │
│           │                                                                      │
│           └──► delegates to Level 4                                             │
│                                                                                  │
│  Level 4: sendChatHistoryFromMessagesAsync(turnContext, messages)               │
│           │                                                                      │
│           ├──► convertToChatHistoryMessages(messages)                           │
│           │                                                                      │
│           └──► configService.sendChatHistory(turnContext, chatHistoryMessages)  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Full Sequence (Level 1 API)

```
Developer       McpToolRegistrationService     CompiledStateGraph    McpToolServerConfigService    MCP Platform
    |                      |                          |                          |                      |
    |  sendChatHistoryAsync(turnContext, graph, config)                          |                      |
    |--------------------->|                          |                          |                      |
    |                      |                          |                          |                      |
    |                      | validate inputs          |                          |                      |
    |                      |---------.                |                          |                      |
    |                      |<--------'                |                          |                      |
    |                      |                          |                          |                      |
    |                      | getState(config)         |                          |                      |
    |                      |------------------------->|                          |                      |
    |                      |                          |                          |                      |
    |                      |        StateSnapshot     |                          |                      |
    |                      |<-------------------------|                          |                      |
    |                      |                          |                          |                      |
    |                      | extract messages from state.values.messages         |                      |
    |                      |---------.                |                          |                      |
    |                      |<--------'                |                          |                      |
    |                      |                          |                          |                      |
    |                      | convertToChatHistoryMessages()                      |                      |
    |                      |---------.                |                          |                      |
    |                      |         | mapRole()      |                          |                      |
    |                      |         | extractContent()|                         |                      |
    |                      |<--------'                |                          |                      |
    |                      |                          |                          |                      |
    |                      | sendChatHistory(turnContext, chatHistoryMessages)   |                      |
    |                      |-------------------------------------------------------->|                   |
    |                      |                          |                          |                      |
    |                      |                          |                          | POST /chathistory    |
    |                      |                          |                          |--------------------->|
    |                      |                          |                          |                      |
    |                      |                          |                          |       200 OK        |
    |                      |                          |                          |<---------------------|
    |                      |                          |                          |                      |
    |                      |                      OperationResult                |                      |
    |                      |<--------------------------------------------------------|                   |
    |                      |                          |                          |                      |
    |   OperationResult    |                          |                          |                      |
    |<---------------------|                          |                          |                      |
```

---

## 7. Dependencies

### 7.1 Internal Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@microsoft/agents-a365-tooling` | `workspace:*` | Core MCP services, `ChatHistoryMessage`, `sendChatHistory()` |
| `@microsoft/agents-a365-runtime` | `workspace:*` | `OperationResult`, `OperationError`, authentication utilities |
| `@microsoft/agents-hosting` | `catalog:` | `TurnContext`, `Authorization` types |

### 7.2 External Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@langchain/core` | `^0.3.x` | `BaseMessage` and subclasses, `MessageContent` types |
| `@langchain/langgraph` | `^0.2.x` | `StateSnapshot` type (optional peer dependency) |
| `@langchain/mcp-adapters` | `catalog:` | Existing dependency for MCP tool integration |
| `langchain` | `catalog:` | Existing dependency for agent creation |
| `uuid` | `^11.x` | Generate message IDs when not present |
| `@types/uuid` | `^10.x` | TypeScript type definitions for uuid |

### 7.3 Package.json Updates

```json
{
  "dependencies": {
    "@langchain/core": "catalog:",
    "uuid": "catalog:"
  },
  "devDependencies": {
    "@types/uuid": "catalog:"
  },
  "peerDependencies": {
    "@langchain/langgraph": ">=0.2.0"
  },
  "peerDependenciesMeta": {
    "@langchain/langgraph": {
      "optional": true
    }
  }
}
```

---

## 8. Testing Strategy

### 8.1 Test Coverage Targets

| Category | Target |
|----------|--------|
| Line Coverage | >= 80% |
| Branch Coverage | >= 75% |
| Function Coverage | >= 90% |

### 8.2 Test Cases

#### Input Validation Tests (UV)

| ID | Test Case | Expected Behavior |
|----|-----------|-------------------|
| UV-01 | `sendChatHistoryAsync` with null `turnContext` | Throws `Error('turnContext is required')` |
| UV-02 | `sendChatHistoryAsync` with null `graph` | Throws `Error('graph is required')` |
| UV-03 | `sendChatHistoryAsync` with null `config` | Throws `Error('config is required')` |
| UV-04 | `sendChatHistoryFromStateAsync` with null `turnContext` | Throws `Error('turnContext is required')` |
| UV-05 | `sendChatHistoryFromStateAsync` with null `stateSnapshot` | Throws `Error('stateSnapshot is required')` |
| UV-06 | `sendChatHistoryFromStateAsync` with missing messages in state | Throws `Error('stateSnapshot must contain messages')` |
| UV-07 | `sendChatHistoryFromChatHistoryAsync` with null `turnContext` | Throws `Error('turnContext is required')` |
| UV-08 | `sendChatHistoryFromChatHistoryAsync` with null `chatHistory` | Throws `Error('chatHistory is required')` |
| UV-09 | `sendChatHistoryFromMessagesAsync` with null `turnContext` | Throws `Error('turnContext is required')` |
| UV-10 | `sendChatHistoryFromMessagesAsync` with null `messages` | Throws `Error('messages is required')` |

#### Message Conversion Tests (CV)

| ID | Test Case | Expected Behavior |
|----|-----------|-------------------|
| CV-01 | Convert `HumanMessage` with string content | Role mapped to `'user'`, content preserved |
| CV-02 | Convert `AIMessage` with string content | Role mapped to `'assistant'`, content preserved |
| CV-03 | Convert `SystemMessage` with string content | Role mapped to `'system'`, content preserved |
| CV-04 | Convert `ToolMessage` with string content | Role mapped to `'tool'`, content preserved |
| CV-05 | Convert `FunctionMessage` with string content | Role mapped to `'function'`, content preserved |
| CV-06 | Convert `ChatMessage` with custom role | Uses message's `role` property |
| CV-07 | Convert message with `ContentPart[]` content | Text parts concatenated |
| CV-08 | Convert message with existing `id` | Existing ID preserved |
| CV-09 | Convert message without `id` | UUID generated |
| CV-10 | Convert message with empty content | Message skipped (returns null) |
| CV-11 | Convert message with only image content | Message skipped (returns null) |

#### Success Path Tests (SP)

| ID | Test Case | Expected Behavior |
|----|-----------|-------------------|
| SP-01 | `sendChatHistoryAsync` with valid graph and config | Fetches state, converts messages, sends to API |
| SP-02 | `sendChatHistoryFromStateAsync` with valid StateSnapshot | Messages extracted and sent successfully |
| SP-03 | `sendChatHistoryFromChatHistoryAsync` with valid BaseChatMessageHistory | Messages retrieved via `getMessages()` and sent |
| SP-04 | `sendChatHistoryFromMessagesAsync` with valid BaseMessage array | Messages converted and sent successfully |
| SP-05 | Send messages with limit parameter | Only first N messages sent |
| SP-06 | Mixed valid/invalid messages | Valid messages sent, invalid skipped |
| SP-07 | Custom `toolOptions` applied | Options passed to underlying service |
| SP-08 | **Empty messages array** | **Empty array sent to API (not no-op)** |

#### Error Handling Tests (EH)

| ID | Test Case | Expected Behavior |
|----|-----------|-------------------|
| EH-01 | HTTP request fails | Returns `OperationResult.failed` with error |
| EH-02 | Network timeout | Returns `OperationResult.failed` with timeout error |
| EH-03 | All messages fail conversion | Empty array sent to API (registers user message) |
| EH-04 | Core service throws validation error | Error re-thrown to caller |
| EH-05 | `graph.getState()` throws error | Returns `OperationResult.failed` with error |
| EH-06 | `chatHistory.getMessages()` throws error | Returns `OperationResult.failed` with error |

### 8.3 Test File Structure

```
tests/
└── tooling-extensions-langchain/
    ├── fixtures/
    │   ├── mockLangChainTypes.ts           # Mock BaseMessage implementations
    │   ├── mockCompiledStateGraph.ts       # Mock CompiledStateGraph
    │   └── mockBaseChatMessageHistory.ts   # Mock BaseChatMessageHistory
    ├── messageConversion.test.ts           # CV-* test cases
    ├── sendChatHistoryAsync.test.ts        # Tests for graph-based API (Level 1)
    ├── sendChatHistoryFromStateAsync.test.ts    # Tests for StateSnapshot API (Level 2)
    ├── sendChatHistoryFromChatHistoryAsync.test.ts # Tests for BaseChatMessageHistory API (Level 3)
    └── sendChatHistoryFromMessagesAsync.test.ts # Tests for raw messages API (Level 4)
```

---

## 9. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Test Coverage | >= 80% line, >= 75% branch | Jest coverage report |
| Build Success | 100% | CI pipeline |
| API Consistency | 100% alignment with OpenAI implementation patterns | Code review |
| Documentation | Complete JSDoc for all public methods | Code review |
| Type Safety | No `any` types in public API | TypeScript strict mode |

---

## 10. Open Questions

### Resolved

| Question | Resolution |
|----------|------------|
| Should we support `BaseMessageChunk`? | No - chunks are partial messages not suitable for RTP analysis |
| Should we support automatic history retrieval from memory? | Yes - via the layered API design. `sendChatHistoryAsync` retrieves from graph, `sendChatHistoryFromChatHistoryAsync` retrieves from chat history |
| How to handle `RemoveMessage` type? | Skip these messages - they are control messages, not content |
| Should we add a method that accepts `BaseChatMessageHistory` directly? | Yes - added `sendChatHistoryFromChatHistoryAsync` which calls `getMessages()` internally |
| Should empty message arrays be no-ops? | No - empty arrays must be sent to the API to register the user message with RTP |

### Unresolved

| Question | Notes |
|----------|-------|
| Should `@langchain/langgraph` be a required or optional peer dependency? | Leaning toward optional since `sendChatHistoryFromMessagesAsync` and `sendChatHistoryFromChatHistoryAsync` work without it |
| How should we handle message metadata (additional_kwargs, response_metadata)? | Currently not included in `ChatHistoryMessage`; may be needed for advanced RTP analysis |

### Assumptions

1. LangChain message types follow the documented interface structure
2. The MCP platform's `/chathistory` endpoint accepts the same payload format for all orchestrators
3. Message timestamps are acceptable as current time when not available from the source
4. The `text` accessor on `BaseMessage` is the preferred way to extract string content

---

## Appendix

### A. Related Documentation

- [LangChain Memory Documentation](https://docs.langchain.com/oss/python/langgraph/add-memory)
- [LangChain BaseMessage API Reference](https://v03.api.js.langchain.com/classes/_langchain_core.messages.BaseMessage.html)
- [OpenAI Chat History API PRD](../../docs/prd/prd-openai-chat-history-api.md) (PR #157)
- [Tooling Package Design Document](../../packages/agents-a365-tooling/docs/design.md)

### B. Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-26 | Microsoft Agent 365 Team | Initial draft |
| 1.1 | 2026-01-26 | Microsoft Agent 365 Team | Revised API design: (1) Layered API approach with `sendChatHistoryAsync` as highest-level accepting `CompiledStateGraph`, (2) Added `sendChatHistoryFromChatHistoryAsync` for `BaseChatMessageHistory`, (3) Renamed lowest-level API to `sendChatHistoryFromMessagesAsync`, (4) Changed empty message handling from no-op to sending empty array to API |
