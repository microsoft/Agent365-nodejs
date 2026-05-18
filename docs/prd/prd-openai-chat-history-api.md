# Product Requirements Document (PRD)

## OpenAI `sendChatHistoryAsync` API for Agent365-nodejs SDK

| **Document Information** |                                              |
|--------------------------|----------------------------------------------|
| **Version**              | 1.4                                          |
| **Status**               | Draft                                        |
| **Author**               | Agent365 Node.js SDK Team                    |
| **Created**              | January 22, 2026                             |
| **Last Updated**         | January 22, 2026                             |
| **Target Package**       | `@microsoft/agents-a365-tooling-extensions-openai` |

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

### 1.1 Overview

This PRD defines the requirements for implementing a `sendChatHistoryAsync` API in the `@microsoft/agents-a365-tooling-extensions-openai` package. This API will enable developers using the OpenAI Agents SDK to send conversation history to the MCP (Model Context Protocol) platform for real-time threat protection, without the need to manually convert OpenAI-native types to the SDK's `ChatHistoryMessage` format.

### 1.2 Background

The Agent365-nodejs SDK provides a core `sendChatHistory` method in `McpToolServerConfigurationService` (in the `@microsoft/agents-a365-tooling` package) that sends conversation history to the MCP platform. However, this method requires developers to manually construct `ChatHistoryMessage` objects, which creates friction for developers using the OpenAI Agents SDK.

The OpenAI Agents SDK provides conversation management through:
- **`OpenAIConversationsSession`**: A session class with a `getItems(limit?)` method that returns `Promise<AgentInputItem[]>`
- **`AgentInputItem`**: Represents individual conversation messages/interactions

### 1.3 Reference Implementations

This feature maintains parity with implementations in other Agent365 SDKs:
- **.NET SDK**: PR #171 (Agent Framework) and PR #173 (Semantic Kernel) - Implements `SendChatHistoryAsync` methods for different orchestrators
- **Python SDK**: PR #127 - Implements `send_chat_history_async` and `send_chat_history_messages_async` methods for the OpenAI orchestrator

---

## 2. Problem Statement

### 2.1 Current State

Currently, developers using the OpenAI Agents SDK with Agent365-nodejs must:

1. Extract messages from their OpenAI session using `session.getItems()`
2. Manually convert each `AgentInputItem` to the `ChatHistoryMessage` interface
3. Handle role mapping (e.g., mapping OpenAI roles to "user", "assistant", "system")
4. Generate UUIDs for messages without IDs
5. Generate timestamps for messages without timestamps
6. Call `McpToolServerConfigurationService.sendChatHistory()` with the converted messages

This manual process creates:
- **Developer friction**: Extra boilerplate code (approximately 20+ lines)
- **Inconsistency risk**: Different developers may implement conversion logic differently
- **Error-prone integrations**: Missing ID or timestamp handling may vary
- **Maintenance burden**: Changes to OpenAI SDK types require updates across multiple applications

### 2.2 Desired State

Developers should be able to send chat history with a single method call:

```typescript
// Using OpenAI Session directly (most common use case)
const result = await mcpToolRegistrationService.sendChatHistoryAsync(
  turnContext,
  session,       // OpenAI Session instance
  50,            // Optional: limit number of messages
  toolOptions    // Optional: custom tool options
);

// Or using a list of items directly
const items = await session.getItems();
const result = await mcpToolRegistrationService.sendChatHistoryMessagesAsync(
  turnContext,
  items,
  toolOptions    // Optional: custom tool options
);
```

---

## 3. Goals and Non-Goals

### 3.1 Goals

| ID | Goal | Priority |
|----|------|----------|
| **G1** | Provide OpenAI-native API for sending chat history to the MCP platform | P0 |
| **G2** | Support OpenAI Session's `getItems()` method for automatic message extraction | P0 |
| **G3** | Support direct list of `AgentInputItem` messages | P0 |
| **G4** | Pass through role from OpenAI message types | P0 |
| **G5** | Auto-generate UUIDs for messages without IDs | P0 |
| **G6** | Auto-generate timestamps for messages without timestamps | P0 |
| **G7** | Maintain backward compatibility with existing `McpToolServerConfigurationService` | P0 |
| **G8** | Achieve feature parity with .NET and Python SDK implementations | P0 |

### 3.2 Non-Goals

| ID | Non-Goal | Rationale |
|----|----------|-----------|
| **NG1** | Modifications to the core `McpToolServerConfigurationService` | Out of scope; changes should be additive |
| **NG2** | Support for other orchestrator SDKs (Claude, LangChain) | Each orchestrator has its own extension package |
| **NG3** | Persistent storage of chat history | Handled by MCP platform |
| **NG4** | Chat history retrieval APIs (read operations) | Not part of current threat protection feature |
| **NG5** | Synchronous API variants | Node.js SDK follows async patterns throughout |

---

## 4. User Stories

### 4.1 Primary User Stories

| ID | User Story | Priority | Acceptance Criteria |
|----|------------|----------|---------------------|
| **US-01** | As an OpenAI agent developer, I want to send my agent's Session history to the MCP platform so that my conversations are protected by real-time threat detection | P0 | Session items are converted and sent successfully |
| **US-02** | As an OpenAI agent developer, I want to send a list of messages to the MCP platform without manual conversion so that I can focus on agent logic | P0 | List of OpenAI messages converts and sends correctly |
| **US-03** | As an OpenAI agent developer, I want missing message IDs to be auto-generated so that I don't need to track IDs manually | P0 | UUIDs generated for messages without IDs |
| **US-04** | As an OpenAI agent developer, I want missing timestamps to use current UTC time so that all messages have valid timestamps | P0 | Current UTC timestamp used when not provided |
| **US-05** | As an OpenAI agent developer, I want to receive clear success/failure results so that I can handle errors appropriately | P0 | `OperationResult` returned with error details on failure |
| **US-06** | As an OpenAI agent developer, I want to limit the number of messages sent so that I can control API payload size | P1 | Limit parameter respected when extracting from session |

### 4.2 Secondary User Stories

| ID | User Story | Priority | Acceptance Criteria |
|----|------------|----------|---------------------|
| **US-07** | As an OpenAI agent developer, I want to pass custom `ToolOptions` so that I can customize orchestrator identification | P1 | ToolOptions parameter accepted and applied |
| **US-08** | As an OpenAI agent developer, I want detailed logging of conversion operations so that I can debug issues | P1 | Debug-level logs for conversion operations |
| **US-09** | As an OpenAI agent developer, I want my message roles to be preserved so that system, user, and assistant messages are sent as-is | P1 | Roles passed through without modification |

---

## 5. Technical Requirements

### 5.1 API Design

#### 5.1.1 TypeScript Interfaces

```typescript
import { TurnContext } from '@microsoft/agents-hosting';
import { OperationResult, ToolOptions } from '@microsoft/agents-a365-tooling';

// From OpenAI Agents SDK
import { AgentInputItem } from '@openai/agents';
import { OpenAIConversationsSession } from '@openai/agents-openai';
```

#### 5.1.2 Method Signatures

```typescript
/**
 * Extended McpToolRegistrationService with chat history support.
 */
export class McpToolRegistrationService {
  // ... existing methods ...

  /**
   * Sends chat history from an OpenAI Session to the MCP platform for real-time threat protection.
   *
   * This method extracts messages from the provided OpenAI Session using `getItems()`,
   * converts them to the `ChatHistoryMessage` format, and sends them to the MCP platform.
   *
   * @param turnContext - The turn context containing conversation information.
   * @param session - The OpenAI Session instance to extract messages from.
   * @param limit - Optional limit on the number of messages to retrieve from the session.
   * @param toolOptions - Optional tool options for customization.
   * @returns A Promise resolving to an OperationResult indicating success or failure.
   * @throws Error if turnContext is null/undefined.
   * @throws Error if session is null/undefined.
   * @throws Error if required turn context properties are missing.
   *
   * @example
   * ```typescript
   * const session = new OpenAIConversationsSession(sessionOptions);
   * const result = await service.sendChatHistoryAsync(turnContext, session, 50);
   * if (result.succeeded) {
   *   console.log('Chat history sent successfully');
   * } else {
   *   console.error('Failed to send chat history:', result.errors);
   * }
   * ```
   */
  async sendChatHistoryAsync(
    turnContext: TurnContext,
    session: OpenAIConversationsSession,
    limit?: number,
    toolOptions?: ToolOptions
  ): Promise<OperationResult>;

  /**
   * Sends a list of OpenAI messages to the MCP platform for real-time threat protection.
   *
   * This method converts the provided AgentInputItem messages to `ChatHistoryMessage` format
   * and sends them to the MCP platform.
   *
   * @param turnContext - The turn context containing conversation information.
   * @param messages - Array of AgentInputItem messages to send.
   * @param options - Optional ToolOptions for customization.
   * @returns A Promise resolving to an OperationResult indicating success or failure.
   * @throws Error if turnContext is null/undefined.
   * @throws Error if messages is null/undefined.
   * @throws Error if required turn context properties are missing.
   *
   * @example
   * ```typescript
   * const items = await session.getItems();
   * const result = await service.sendChatHistoryMessagesAsync(turnContext, items);
   * ```
   */
  async sendChatHistoryMessagesAsync(
    turnContext: TurnContext,
    messages: AgentInputItem[],
    options?: ToolOptions
  ): Promise<OperationResult>;
}
```

### 5.2 Data Contracts

#### 5.2.1 Existing Contracts (No Changes Required)

The following contracts from `@microsoft/agents-a365-tooling` remain unchanged:

```typescript
// From packages/agents-a365-tooling/src/models/ChatHistoryMessage.ts
interface ChatHistoryMessage {
  id: string;
  role: string;  // "user" | "assistant" | "system"
  content: string;
  timestamp: Date;
}

// From packages/agents-a365-tooling/src/contracts.ts
interface ToolOptions {
  orchestratorName?: string;
}
```

#### 5.2.2 OpenAI SDK Types (External Reference)

The following types are from the OpenAI Agents SDK:

```typescript
// OpenAI Session (from @openai/agents-openai)
// See: https://github.com/openai/openai-agents-js/blob/main/packages/agents-openai/src/index.ts
import { OpenAIConversationsSession } from '@openai/agents-openai';

class OpenAIConversationsSession {
  sessionId: string | undefined;
  getItems(limit?: number): Promise<AgentInputItem[]>;
  addItems(...items: AgentInputItem[]): Promise<void>;
  popItem(): Promise<AgentInputItem | undefined>;
  clearSession(): Promise<void>;
}

// AgentInputItem is a union type representing various input items
// See: https://openai.github.io/openai-agents-js/openai/agents/type-aliases/agentinputitem/
type AgentInputItem =
  | UserMessageItem
  | AssistantMessageItem
  | SystemMessageItem
  | HostedToolCallItem
  | FunctionCallItem
  | ComputerUseCallItem
  | ShellCallItem
  | ApplyPatchCallItem
  | FunctionCallResultItem
  | ComputerCallResultItem
  | ShellCallResultItem
  | ApplyPatchCallResultItem
  | ReasoningItem
  | CompactionItem
  | UnknownItem;

// Individual message item types contain:
// - type: string (discriminator, e.g., "user_message", "assistant_message")
// - role: string (e.g., "user", "assistant", "system")
// - content: string | ContentPart[]
// - id?: string
// Note: Timestamp property availability needs runtime verification
```

### 5.3 Role Handling

The `role` property from `AgentInputItem` is used directly without transformation. We do not validate or map roles - whatever role is provided by the OpenAI SDK is passed through as-is to the `ChatHistoryMessage`.

### 5.4 Content Extraction Priority

1. If message has `.content` as `string` -> use directly (reject if empty)
2. If message has `.content` as `ContentPart[]` -> concatenate all text parts (reject if result is empty)
3. If message has `.text` attribute -> use directly (reject if empty)
4. If content is empty/None -> **reject the message** (skip with warning log)

### 5.5 Error Handling

| Error Condition | Expected Behavior |
|-----------------|-------------------|
| `turnContext` is null/undefined | Throw `Error('turnContext is required')` |
| `session` is null/undefined | Throw `Error('session is required')` |
| `messages` is null/undefined | Throw `Error('messages is required')` |
| `messages` is empty array | Return `OperationResult.success` (no-op) |
| `turnContext.activity` is null | Throw `Error('Activity is required...')` |
| Missing conversation ID | Throw `Error('Conversation ID is required...')` |
| Missing message ID | Throw `Error('Message ID is required...')` |
| Missing user message text | Throw `Error('User message is required...')` |
| HTTP error from MCP platform | Return `OperationResult.failed()` with error |
| Network timeout | Return `OperationResult.failed()` with error |
| Conversion error | Return `OperationResult.failed()` with error |

---

## 6. Implementation Details

### 6.1 File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/agents-a365-tooling-extensions-openai/src/McpToolRegistrationService.ts` | Modified | Add `sendChatHistoryAsync` and `sendChatHistoryMessagesAsync` methods |
| `packages/agents-a365-tooling-extensions-openai/package.json` | Possibly Modified | Verify `@openai/agents` dependency version, add `uuid` dependency |

### 6.2 New Files

| File | Purpose |
|------|---------|
| `tests/tooling-extensions-openai/sendChatHistoryAsync.test.ts` | Unit tests for session-based method |
| `tests/tooling-extensions-openai/sendChatHistoryMessagesAsync.test.ts` | Unit tests for direct messages method |
| `tests/tooling-extensions-openai/messageConversion.test.ts` | Unit tests for conversion logic |

### 6.3 Implementation Pseudocode

```typescript
// packages/agents-a365-tooling-extensions-openai/src/McpToolRegistrationService.ts

import { v4 as uuidv4 } from 'uuid';
import { ChatHistoryMessage, ToolOptions } from '@microsoft/agents-a365-tooling';
import { OperationResult, OperationError } from '@microsoft/agents-a365-runtime';

export class McpToolRegistrationService {
  private configService: McpToolServerConfigurationService = new McpToolServerConfigurationService();
  private readonly orchestratorName: string = "OpenAI";
  private readonly logger = console;

  // ... existing methods ...

  /**
   * Sends chat history from an OpenAI Session.
   */
  async sendChatHistoryAsync(
    turnContext: TurnContext,
    session: OpenAIConversationsSession,
    limit?: number,
    toolOptions?: ToolOptions
  ): Promise<OperationResult> {
    // Validate inputs
    if (!turnContext) {
      throw new Error('turnContext is required');
    }
    if (!session) {
      throw new Error('session is required');
    }

    try {
      // Extract messages from session
      const items = await session.getItems(limit);

      // Delegate to the list-based method
      return await this.sendChatHistoryMessagesAsync(
        turnContext,
        items,
        toolOptions
      );
    } catch (err) {
      if (err instanceof Error && err.message.includes('is required')) {
        throw err; // Re-throw validation errors
      }
      this.logger.error(`Failed to send chat history from session: ${err}`);
      return OperationResult.failed(new OperationError(err as Error));
    }
  }

  /**
   * Sends a list of OpenAI messages.
   */
  async sendChatHistoryMessagesAsync(
    turnContext: TurnContext,
    messages: AgentInputItem[],
    options?: ToolOptions
  ): Promise<OperationResult> {
    // Validate inputs
    if (!turnContext) {
      throw new Error('turnContext is required');
    }
    if (!messages) {
      throw new Error('messages is required');
    }

    // Handle empty list as no-op
    if (messages.length === 0) {
      this.logger.info('Empty message list provided, returning success');
      return OperationResult.success;
    }

    // Set default options
    const effectiveOptions: ToolOptions = {
      orchestratorName: options?.orchestratorName ?? this.orchestratorName
    };

    try {
      // Convert OpenAI messages to ChatHistoryMessage format
      const chatHistoryMessages = this.convertToChatHistoryMessages(messages);

      this.logger.info(`Converted ${chatHistoryMessages.length} OpenAI messages to chat history format`);

      // Delegate to core service
      return await this.configService.sendChatHistory(
        turnContext,
        chatHistoryMessages,
        effectiveOptions
      );
    } catch (err) {
      if (err instanceof Error && err.message.includes('is required')) {
        throw err; // Re-throw validation errors
      }
      this.logger.error(`Failed to send chat history messages: ${err}`);
      return OperationResult.failed(new OperationError(err as Error));
    }
  }

  /**
   * Converts OpenAI AgentInputItem messages to ChatHistoryMessage format.
   */
  private convertToChatHistoryMessages(messages: AgentInputItem[]): ChatHistoryMessage[] {
    return messages
      .map(msg => this.convertSingleMessage(msg))
      .filter((msg): msg is ChatHistoryMessage => msg !== null);
  }

  /**
   * Converts a single OpenAI message to ChatHistoryMessage format.
   */
  private convertSingleMessage(message: AgentInputItem): ChatHistoryMessage | null {
    try {
      return {
        id: this.extractId(message),
        role: this.extractRole(message),
        content: this.extractContent(message),
        timestamp: this.extractTimestamp(message)
      };
    } catch (err) {
      this.logger.error(`Failed to convert message: ${err}`);
      return null;
    }
  }

  /**
   * Extracts the role from an OpenAI message.
   */
  private extractRole(message: AgentInputItem): string {
    return message.role;
  }

  /**
   * Extracts content from an OpenAI message.
   * @throws Error if content is empty (empty strings are rejected).
   */
  private extractContent(message: AgentInputItem): string {
    let content: string | undefined;

    // Handle string content
    if (typeof message.content === 'string') {
      content = message.content;
    }
    // Handle array content (ContentPart[])
    else if (Array.isArray(message.content)) {
      const textParts = message.content
        .filter(part => part.type === 'text' || typeof part === 'string')
        .map(part => typeof part === 'string' ? part : (part as { text?: string }).text || '')
        .filter(text => text.length > 0);

      if (textParts.length > 0) {
        content = textParts.join(' ');
      }
    }
    // Try text property
    else if ('text' in message && typeof message.text === 'string') {
      content = message.text;
    }

    // Reject empty content
    if (!content || content.trim().length === 0) {
      throw new Error('Message content cannot be empty');
    }

    return content;
  }

  /**
   * Extracts or generates an ID for a message.
   */
  private extractId(message: AgentInputItem): string {
    if (message.id) {
      return message.id;
    }

    const generatedId = uuidv4();
    this.logger.debug(`Generated UUID ${generatedId} for message without ID`);
    return generatedId;
  }

  /**
   * Extracts or generates a timestamp for a message.
   * Note: AgentInputItem types do not have a standard timestamp property,
   * so we always generate the current timestamp.
   */
  private extractTimestamp(_message: AgentInputItem): Date {
    // AgentInputItem types do not include timestamp properties.
    // Always use current UTC time.
    return new Date();
  }
}
```

### 6.4 Sequence Diagram

```
Developer          McpToolRegistrationService     McpToolServerConfigurationService     MCP Platform
    |                        |                              |                               |
    | sendChatHistoryAsync   |                              |                               |
    |──────────────────────>|                               |                               |
    |                        |                              |                               |
    |                        | validate inputs              |                               |
    |                        |──────────────┐               |                               |
    |                        |              |               |                               |
    |                        |<─────────────┘               |                               |
    |                        |                              |                               |
    |                        | session.getItems(limit)      |                               |
    |                        |──────────────┐               |                               |
    |                        |              |               |                               |
    |                        |<─────────────┘               |                               |
    |                        |                              |                               |
    |                        | convertToChatHistoryMessages |                               |
    |                        |──────────────┐               |                               |
    |                        |              | for each message:                             |
    |                        |              | - extractRole                                 |
    |                        |              | - extractContent                              |
    |                        |              | - extractId (or generate UUID)                |
    |                        |              | - extractTimestamp (or use now)               |
    |                        |<─────────────┘               |                               |
    |                        |                              |                               |
    |                        | sendChatHistory              |                               |
    |                        |─────────────────────────────>|                               |
    |                        |                              |                               |
    |                        |                              | POST /chat-message            |
    |                        |                              |──────────────────────────────>|
    |                        |                              |                               |
    |                        |                              |              HTTP 200 / Error |
    |                        |                              |<──────────────────────────────|
    |                        |                              |                               |
    |                        |           OperationResult    |                               |
    |                        |<─────────────────────────────|                               |
    |                        |                              |                               |
    |   OperationResult      |                              |                               |
    |<──────────────────────|                               |                               |
```

---

## 7. Dependencies

### 7.1 Internal Dependencies

| Package | Required Version | Purpose |
|---------|-----------------|---------|
| `@microsoft/agents-a365-tooling` | Current | Core `McpToolServerConfigurationService`, `ChatHistoryMessage`, `ToolOptions` |
| `@microsoft/agents-a365-runtime` | Current | `OperationResult`, `OperationError` |
| `@microsoft/agents-hosting` | Current | `TurnContext`, `Authorization` |

### 7.2 External Dependencies

| Package | Required Version | Purpose |
|---------|-----------------|---------|
| `@openai/agents` | `>=0.1.0` | OpenAI Agents SDK types (`OpenAIConversationsSession`, `AgentInputItem`) |
| `uuid` | `>=9.0.0` | UUID generation for messages without IDs |

### 7.3 Dependency Changes Required

Verify in `packages/agents-a365-tooling-extensions-openai/package.json`:

```json
{
  "dependencies": {
    "@openai/agents": ">=0.1.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/uuid": "^9.0.0"
  }
}
```

---

## 8. Testing Strategy

### 8.1 Test Categories

| Category | Coverage Target | Focus |
|----------|-----------------|-------|
| Unit Tests | >=95% lines | Method logic, conversion, validation |
| Integration Tests | Key flows | End-to-end with mocked HTTP |
| Edge Case Tests | 100% identified cases | Null handling, empty content, unknown types |

### 8.2 Unit Test Cases

#### 8.2.1 Input Validation Tests

| Test ID | Test Name | Description |
|---------|-----------|-------------|
| UV-01 | `sendChatHistoryAsync_throws_when_turnContext_null` | Verify Error when turnContext is null |
| UV-02 | `sendChatHistoryAsync_throws_when_session_null` | Verify Error when session is null |
| UV-03 | `sendChatHistoryMessagesAsync_throws_when_turnContext_null` | Verify Error when turnContext is null |
| UV-04 | `sendChatHistoryMessagesAsync_throws_when_messages_null` | Verify Error when messages is null |
| UV-05 | `sendChatHistoryMessagesAsync_returns_success_for_empty_array` | Verify empty array returns success (no-op) |

#### 8.2.2 Conversion Tests

| Test ID | Test Name | Description |
|---------|-----------|-------------|
| CV-01 | `extractRole_returns_role_directly` | Role property is passed through as-is |
| CV-02 | `extractContent_extracts_string_content` | String content extracted directly |
| CV-03 | `extractContent_concatenates_array_content` | Array content concatenated |
| CV-04 | `extractContent_throws_for_empty_content` | Empty/null content throws error, message skipped |
| CV-05 | `extractId_uses_existing_id` | Existing ID preserved |
| CV-06 | `extractId_generates_uuid_when_missing` | UUID generated for missing ID |
| CV-07 | `extractTimestamp_always_uses_current_time` | Current UTC time always used (no timestamp on AgentInputItem) |

#### 8.2.3 Success Path Tests

| Test ID | Test Name | Description |
|---------|-----------|-------------|
| SP-01 | `sendChatHistoryAsync_extracts_and_sends_session_items` | Session items extracted and sent |
| SP-02 | `sendChatHistoryAsync_respects_limit_parameter` | Limit parameter passed to getItems |
| SP-03 | `sendChatHistoryMessagesAsync_returns_success` | Messages sent successfully |
| SP-04 | `sendChatHistoryMessagesAsync_uses_default_orchestrator_name` | Default orchestrator name applied |
| SP-05 | `sendChatHistoryMessagesAsync_uses_custom_tool_options` | Custom ToolOptions applied |

#### 8.2.4 Error Handling Tests

| Test ID | Test Name | Description |
|---------|-----------|-------------|
| EH-01 | `sendChatHistoryAsync_returns_failed_on_http_error` | HTTP error returns OperationResult.failed |
| EH-02 | `sendChatHistoryAsync_returns_failed_on_timeout` | Timeout returns OperationResult.failed |
| EH-03 | `sendChatHistoryAsync_returns_failed_on_conversion_error` | Conversion error returns OperationResult.failed |
| EH-04 | `sendChatHistoryAsync_returns_failed_on_session_error` | Session.getItems error returns OperationResult.failed |

### 8.3 Test File Structure

```
tests/
└── tooling-extensions-openai/
    ├── sendChatHistoryAsync.test.ts          # Session-based method tests
    ├── sendChatHistoryMessagesAsync.test.ts  # Direct messages method tests
    ├── messageConversion.test.ts             # Conversion logic tests
    └── fixtures/
        └── mockOpenAITypes.ts                # Mock OpenAI SDK types
```

---

## 9. Success Metrics

### 9.1 Quality Metrics

| Metric | Target |
|--------|--------|
| Unit test line coverage | >=95% |
| Unit test branch coverage | >=90% |
| Integration test success rate | 100% |
| Zero regression in existing functionality | Verified |

---

## 10. Open Questions

### 10.1 Resolved Questions

| Question | Resolution |
|----------|------------|
| Should we support synchronous APIs? | No - Node.js SDK follows async patterns |
| Should filtering of message types occur? | No - include all item types (per FR-14 from Python PRD) |
| What is the exact structure of `AgentInputItem` in the OpenAI Agents SDK? | `AgentInputItem` is a union of 15 types including `UserMessageItem`, `AssistantMessageItem`, `SystemMessageItem`, tool call items, result items, and metadata items. See [AgentInputItem docs](https://openai.github.io/openai-agents-js/openai/agents/type-aliases/agentinputitem/). |
| Should we expose conversion methods publicly for advanced use cases? | No - keep conversion methods private |
| Should empty content strings be allowed or rejected? | **Rejected** - messages with empty content should be skipped with a warning log |
| Is `created_at` in seconds or milliseconds? | N/A - `AgentInputItem` types do not have a standard timestamp property. Always generate current UTC timestamp. |

### 10.2 Unresolved Questions

*No unresolved questions at this time.*

### 10.3 Assumptions

1. The `@openai/agents` package is available via npm and provides stable type definitions
2. `OpenAIConversationsSession.getItems()` returns `Promise<AgentInputItem[]>`
3. The core `McpToolServerConfigurationService.sendChatHistory()` remains unchanged
4. Messages with empty content are rejected (skipped with warning)

---

## Appendix A: Related Documentation

- [Microsoft Agent 365 Developer Docs](https://learn.microsoft.com/microsoft-agent-365/developer/)
- [OpenAI Agents JS SDK](https://openai.github.io/openai-agents-js/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Agent365 .NET SDK PR #171](https://github.com/microsoft/Agent365-dotnet/pull/171) - Agent Framework implementation
- [Agent365 .NET SDK PR #173](https://github.com/microsoft/Agent365-dotnet/pull/173) - Semantic Kernel implementation
- [Agent365 Python SDK PR #127](https://github.com/microsoft/Agent365-python/pull/127) - OpenAI orchestrator implementation

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | January 22, 2026 | Agent365 Node.js SDK Team | Initial PRD |
| 1.1 | January 22, 2026 | Agent365 Node.js SDK Team | Resolved open questions: Updated AgentInputItem type definition to reflect actual union type from OpenAI docs; marked conversion methods as private; changed empty content handling to reject instead of allow; removed timestamp extraction (AgentInputItem has no timestamp property) |
| 1.2 | January 22, 2026 | Agent365 Node.js SDK Team | Removed `SendChatHistoryOptions` interface; `sendChatHistoryAsync` now takes `limit` and `toolOptions` as separate optional parameters |
| 1.3 | January 22, 2026 | Agent365 Node.js SDK Team | Simplified `extractRole` to pass through the role property directly without mapping or validation |
| 1.4 | January 22, 2026 | Agent365 Node.js SDK Team | Updated to use `OpenAIConversationsSession` from `@openai/agents-openai` package (v0.4.0+) instead of defining a local interface |
