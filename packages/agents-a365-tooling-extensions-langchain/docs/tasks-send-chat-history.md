# Implementation Tasks: Send Chat History API for LangChain Orchestrator

This document tracks the implementation tasks for the Send Chat History API feature as defined in [PRD: Send Chat History API](./prd-send-chat-history.md).

**Target Package**: `@microsoft/agents-a365-tooling-extensions-langchain`

---

## Progress Summary

| Category | Total | Completed | Remaining |
|----------|-------|-----------|-----------|
| Setup | 4 | 4 | 0 |
| Implementation | 12 | 12 | 0 |
| Testing | 15 | 15 | 0 |
| Documentation | 4 | 4 | 0 |
| **Total** | **35** | **35** | **0** |

---

## Setup Tasks

### SETUP-01: Add uuid dependency to package.json
- [x] **Status**: Completed
- **Description**: Add `uuid` package to dependencies for generating message IDs when not present
- **File**: `packages/agents-a365-tooling-extensions-langchain/package.json`
- **Changes**:
  - Add `"uuid": "catalog:"` to `dependencies`
  - Add `"@types/uuid": "catalog:"` to `devDependencies`
- **Acceptance Criteria**:
  - Package builds successfully after dependency addition
  - TypeScript types for uuid are available

### SETUP-02: Add @langchain/core dependency to package.json
- [x] **Status**: Completed
- **Description**: Add `@langchain/core` package to access `BaseMessage`, `BaseChatMessageHistory`, and related types
- **File**: `packages/agents-a365-tooling-extensions-langchain/package.json`
- **Changes**:
  - Add `"@langchain/core": "catalog:"` to `dependencies`
- **Acceptance Criteria**:
  - LangChain core types are importable in the package

### SETUP-03: Add @langchain/langgraph as optional peer dependency
- [x] **Status**: Completed
- **Description**: Add `@langchain/langgraph` as an optional peer dependency for `CompiledStateGraph` and `StateSnapshot` types
- **File**: `packages/agents-a365-tooling-extensions-langchain/package.json`
- **Changes**:
  - Add to `peerDependencies`:
    ```json
    "@langchain/langgraph": ">=0.2.0"
    ```
  - Add to `peerDependenciesMeta`:
    ```json
    "@langchain/langgraph": {
      "optional": true
    }
    ```
- **Acceptance Criteria**:
  - Package builds and installs without `@langchain/langgraph` installed
  - TypeScript compiles successfully with optional types

### SETUP-04: Verify pnpm-workspace.yaml catalog entries
- [x] **Status**: Completed
- **Description**: Confirm that required packages are defined in the pnpm workspace catalog
- **File**: `pnpm-workspace.yaml`
- **Verification**:
  - `@langchain/core` is defined (currently: `"@langchain/core": "^1.1.8"`)
  - `uuid` is defined in overrides (currently: `"uuid": "^9.0.0"`)
  - `@types/uuid` is defined in overrides (currently: `"@types/uuid": "^9.0.0"`)
- **Acceptance Criteria**:
  - All catalog references resolve correctly during `pnpm install`

---

## Implementation Tasks

### IMPL-01: Add required imports to McpToolRegistrationService.ts
- [x] **Status**: Completed
- **Description**: Add import statements for LangChain types, uuid, and runtime types needed for chat history functionality
- **File**: `packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService.ts`
- **Changes**:
  ```typescript
  import { v4 as uuidv4 } from 'uuid';
  import { BaseMessage } from '@langchain/core/messages';
  import { BaseChatMessageHistory } from '@langchain/core/chat_history';
  import { RunnableConfig } from '@langchain/core/runnables';
  import { OperationResult, OperationError } from '@microsoft/agents-a365-runtime';
  import { ChatHistoryMessage } from '@microsoft/agents-a365-tooling';
  ```
- **Acceptance Criteria**:
  - All imports resolve without TypeScript errors
  - No circular dependency issues

### IMPL-02: Add conditional import for @langchain/langgraph types
- [x] **Status**: Completed
- **Description**: Add type imports for `CompiledStateGraph` and `StateSnapshot` with proper handling for optional peer dependency
- **File**: `packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService.ts`
- **Changes**:
  - Import types from `@langchain/langgraph` for use in method signatures
  - Consider using `import type` syntax for type-only imports
- **Acceptance Criteria**:
  - Types are available for method signatures
  - Package builds even when `@langchain/langgraph` is not installed

### IMPL-03: Implement mapRole private helper method
- [x] **Status**: Completed
- **Description**: Create private method to map LangChain message types to standard role strings
- **File**: `packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService.ts`
- **Method Signature**:
  ```typescript
  private mapRole(message: BaseMessage): string
  ```
- **Role Mapping**:
  | LangChain Type | `getType()` Return | Mapped Role |
  |----------------|-------------------|-------------|
  | `HumanMessage` | `'human'` | `'user'` |
  | `AIMessage` | `'ai'` | `'assistant'` |
  | `SystemMessage` | `'system'` | `'system'` |
  | `ToolMessage` | `'tool'` | `'tool'` |
  | `FunctionMessage` | `'function'` | `'function'` |
  | `ChatMessage` | `'chat'` | Use `message.role` property |
  | Default | Any other | `'user'` |
- **Acceptance Criteria**:
  - All standard LangChain message types are mapped correctly
  - ChatMessage uses its `role` property
  - Unknown types default to `'user'`

### IMPL-04: Implement extractContent private helper method
- [x] **Status**: Completed
- **Description**: Create private method to extract text content from various LangChain message content formats
- **File**: `packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService.ts`
- **Method Signature**:
  ```typescript
  private extractContent(message: BaseMessage): string
  ```
- **Content Extraction Priority**:
  1. Try `message.text` accessor (handles ContentPart arrays)
  2. Fall back to `message.content` if it's a string
  3. Concatenate text from `ContentPart[]` if content is an array
  4. Return empty string if no text content can be extracted
- **Acceptance Criteria**:
  - String content is extracted directly
  - ContentPart arrays have their text parts concatenated
  - Image-only content returns empty string
  - Errors during extraction are caught and return empty string

### IMPL-05: Implement convertSingleMessage private helper method
- [x] **Status**: Completed
- **Description**: Create private method to convert a single `BaseMessage` to `ChatHistoryMessage` format
- **File**: `packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService.ts`
- **Method Signature**:
  ```typescript
  private convertSingleMessage(message: BaseMessage): ChatHistoryMessage | null
  ```
- **Implementation**:
  - Extract content using `extractContent()`
  - Return `null` if content is empty or whitespace-only
  - Use `message.id` if present, otherwise generate UUID
  - Map role using `mapRole()`
  - Set timestamp to current date
- **Acceptance Criteria**:
  - Messages with empty content return `null`
  - Existing message IDs are preserved
  - New UUIDs are generated for messages without IDs
  - Conversion errors return `null` (not throw)

### IMPL-06: Implement convertToChatHistoryMessages private helper method
- [x] **Status**: Completed
- **Description**: Create private method to convert an array of `BaseMessage` to `ChatHistoryMessage[]`
- **File**: `packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService.ts`
- **Method Signature**:
  ```typescript
  private convertToChatHistoryMessages(messages: BaseMessage[]): ChatHistoryMessage[]
  ```
- **Implementation**:
  - Map each message using `convertSingleMessage()`
  - Filter out `null` results
  - Return filtered array (may be empty)
- **Acceptance Criteria**:
  - Successfully converted messages are included
  - Failed conversions are silently skipped
  - Empty input returns empty array

### IMPL-07: Implement sendChatHistoryFromMessagesAsync method (Level 4 - Lowest)
- [x] **Status**: Completed
- **Description**: Implement the lowest-level API that accepts raw `BaseMessage[]` and sends to MCP platform
- **File**: `packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService.ts`
- **Method Signature**:
  ```typescript
  async sendChatHistoryFromMessagesAsync(
    turnContext: TurnContext,
    messages: BaseMessage[],
    limit?: number,
    toolOptions?: ToolOptions
  ): Promise<OperationResult>
  ```
- **Implementation**:
  - Validate `turnContext` is not null/undefined (throw if invalid)
  - Validate `messages` is not null/undefined (throw if invalid)
  - Apply `limit` parameter if specified (`messages.slice(0, limit)`)
  - Set default `toolOptions.orchestratorName` to `this.orchestratorName`
  - Convert messages using `convertToChatHistoryMessages()`
  - **Always** call `configService.sendChatHistory()` even with empty array
  - Catch and wrap errors in `OperationResult.failed()`
  - Re-throw validation errors (messages containing "is required")
- **Acceptance Criteria**:
  - Throws for null/undefined turnContext with message "turnContext is required"
  - Throws for null/undefined messages with message "messages is required"
  - Limit parameter restricts number of messages processed
  - Empty arrays are sent to API (not no-op)
  - HTTP failures return `OperationResult.failed`
  - Successful send returns `OperationResult` from configService

### IMPL-08: Implement sendChatHistoryFromChatHistoryAsync method (Level 3)
- [x] **Status**: Completed
- **Description**: Implement API that retrieves messages from `BaseChatMessageHistory` and delegates to Level 4
- **File**: `packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService.ts`
- **Method Signature**:
  ```typescript
  async sendChatHistoryFromChatHistoryAsync(
    turnContext: TurnContext,
    chatHistory: BaseChatMessageHistory,
    limit?: number,
    toolOptions?: ToolOptions
  ): Promise<OperationResult>
  ```
- **Implementation**:
  - Validate `turnContext` is not null/undefined (throw if invalid)
  - Validate `chatHistory` is not null/undefined (throw if invalid)
  - Call `chatHistory.getMessages()` to retrieve messages
  - Delegate to `sendChatHistoryFromMessagesAsync()`
  - Catch and wrap errors in `OperationResult.failed()`
  - Re-throw validation errors
- **Acceptance Criteria**:
  - Throws for null/undefined turnContext
  - Throws for null/undefined chatHistory
  - Calls `getMessages()` on the chat history instance
  - Properly delegates to Level 4 API
  - Errors from `getMessages()` are caught and returned as failed result

### IMPL-09: Implement sendChatHistoryFromStateAsync method (Level 2)
- [x] **Status**: Completed
- **Description**: Implement API that extracts messages from `StateSnapshot` and delegates to Level 4
- **File**: `packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService.ts`
- **Method Signature**:
  ```typescript
  async sendChatHistoryFromStateAsync<State extends { messages: BaseMessage[] }>(
    turnContext: TurnContext,
    stateSnapshot: StateSnapshot<State>,
    limit?: number,
    toolOptions?: ToolOptions
  ): Promise<OperationResult>
  ```
- **Implementation**:
  - Validate `turnContext` is not null/undefined (throw if invalid)
  - Validate `stateSnapshot` is not null/undefined (throw if invalid)
  - Extract `messages` from `stateSnapshot.values.messages`
  - Throw if messages is missing or not an array
  - Delegate to `sendChatHistoryFromMessagesAsync()`
- **Acceptance Criteria**:
  - Throws for null/undefined turnContext
  - Throws for null/undefined stateSnapshot
  - Throws if `stateSnapshot.values.messages` is missing/not array
  - Properly delegates to Level 4 API

### IMPL-10: Implement sendChatHistoryAsync method (Level 1 - Highest)
- [x] **Status**: Completed
- **Description**: Implement the highest-level API that fetches state from `CompiledStateGraph` and delegates to Level 2
- **File**: `packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService.ts`
- **Method Signature**:
  ```typescript
  async sendChatHistoryAsync<State extends { messages: BaseMessage[] }>(
    turnContext: TurnContext,
    graph: CompiledStateGraph<State>,
    config: RunnableConfig,
    limit?: number,
    toolOptions?: ToolOptions
  ): Promise<OperationResult>
  ```
- **Implementation**:
  - Validate `turnContext` is not null/undefined (throw if invalid)
  - Validate `graph` is not null/undefined (throw if invalid)
  - Validate `config` is not null/undefined (throw if invalid)
  - Call `graph.getState(config)` to get StateSnapshot
  - Delegate to `sendChatHistoryFromStateAsync()`
  - Catch and wrap errors in `OperationResult.failed()`
  - Re-throw validation errors
- **Acceptance Criteria**:
  - Throws for null/undefined turnContext
  - Throws for null/undefined graph
  - Throws for null/undefined config
  - Calls `getState(config)` on the graph
  - Properly delegates to Level 2 API
  - Errors from `getState()` are caught and returned as failed result

### IMPL-11: Add JSDoc comments to all public methods
- [x] **Status**: Completed
- **Description**: Add comprehensive JSDoc documentation to all four public API methods
- **File**: `packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService.ts`
- **Requirements**:
  - Each method should have:
    - Description of what the method does
    - `@param` tags for all parameters
    - `@returns` tag describing return value
    - `@throws` tags for validation errors
    - `@example` code block showing usage
- **Acceptance Criteria**:
  - All public methods have complete JSDoc documentation
  - Examples are valid and demonstrate common usage patterns
  - Documentation matches PRD specifications

### IMPL-12: Verify exports in index.ts
- [x] **Status**: Completed
- **Description**: Ensure `McpToolRegistrationService` is properly exported from the package entry point
- **File**: `packages/agents-a365-tooling-extensions-langchain/src/index.ts`
- **Verification**:
  - `McpToolRegistrationService` is already exported (should be)
  - No additional exports needed for internal helper methods
- **Acceptance Criteria**:
  - `McpToolRegistrationService` is importable from package root
  - New methods are accessible on the exported class

---

## Testing Tasks

### TEST-01: Create test fixture - mockLangChainTypes.ts
- [x] **Status**: Completed
- **Description**: Create mock implementations of LangChain message types for testing
- **File**: `tests/tooling-extensions-langchain/fixtures/mockLangChainTypes.ts`
- **Contents**:
  - Mock `BaseMessage` abstract class
  - Mock `HumanMessage` with `getType()` returning `'human'`
  - Mock `AIMessage` with `getType()` returning `'ai'`
  - Mock `SystemMessage` with `getType()` returning `'system'`
  - Mock `ToolMessage` with `getType()` returning `'tool'`
  - Mock `FunctionMessage` with `getType()` returning `'function'`
  - Mock `ChatMessage` with `role` property and `getType()` returning `'chat'`
  - Helper function `createMockMessage(type, content, id?)` for easy test setup
- **Acceptance Criteria**:
  - All message types can be instantiated with configurable content
  - `getType()` returns correct type string for each class
  - `text` accessor and `content` property work correctly

### TEST-02: Create test fixture - mockCompiledStateGraph.ts
- [x] **Status**: Completed
- **Description**: Create mock implementation of LangGraph `CompiledStateGraph` for testing
- **File**: `tests/tooling-extensions-langchain/fixtures/mockCompiledStateGraph.ts`
- **Contents**:
  - Mock `CompiledStateGraph` class with `getState(config)` method
  - Configurable to return different `StateSnapshot` objects
  - Configurable to throw errors for error testing
- **Acceptance Criteria**:
  - Can be configured to return specific state snapshots
  - Can be configured to throw specific errors
  - Supports generic state type parameter

### TEST-03: Create test fixture - mockBaseChatMessageHistory.ts
- [x] **Status**: Completed
- **Description**: Create mock implementation of `BaseChatMessageHistory` for testing
- **File**: `tests/tooling-extensions-langchain/fixtures/mockBaseChatMessageHistory.ts`
- **Contents**:
  - Mock `BaseChatMessageHistory` class with `getMessages()` method
  - Configurable to return different message arrays
  - Configurable to throw errors for error testing
- **Acceptance Criteria**:
  - Can be configured to return specific message arrays
  - Can be configured to throw specific errors
  - Implements `BaseChatMessageHistory` interface

### TEST-04: Implement input validation tests (UV-01 to UV-10)
- [x] **Status**: Completed
- **Description**: Create tests for all input validation scenarios
- **File**: `tests/tooling-extensions-langchain/inputValidation.test.ts`
- **Test Cases**:
  | Test ID | Method | Condition | Expected |
  |---------|--------|-----------|----------|
  | UV-01 | `sendChatHistoryAsync` | null turnContext | Throws "turnContext is required" |
  | UV-02 | `sendChatHistoryAsync` | null graph | Throws "graph is required" |
  | UV-03 | `sendChatHistoryAsync` | null config | Throws "config is required" |
  | UV-04 | `sendChatHistoryFromStateAsync` | null turnContext | Throws "turnContext is required" |
  | UV-05 | `sendChatHistoryFromStateAsync` | null stateSnapshot | Throws "stateSnapshot is required" |
  | UV-06 | `sendChatHistoryFromStateAsync` | missing messages in state | Throws "stateSnapshot must contain messages" |
  | UV-07 | `sendChatHistoryFromChatHistoryAsync` | null turnContext | Throws "turnContext is required" |
  | UV-08 | `sendChatHistoryFromChatHistoryAsync` | null chatHistory | Throws "chatHistory is required" |
  | UV-09 | `sendChatHistoryFromMessagesAsync` | null turnContext | Throws "turnContext is required" |
  | UV-10 | `sendChatHistoryFromMessagesAsync` | null messages | Throws "messages is required" |
- **Acceptance Criteria**:
  - All 10 validation test cases pass
  - Error messages match expected strings exactly

### TEST-05: Implement message conversion tests - role mapping (CV-01 to CV-06)
- [x] **Status**: Completed
- **Description**: Create tests for role mapping functionality
- **File**: `tests/tooling-extensions-langchain/messageConversion.test.ts`
- **Test Cases**:
  | Test ID | Message Type | Expected Role |
  |---------|-------------|---------------|
  | CV-01 | HumanMessage | `'user'` |
  | CV-02 | AIMessage | `'assistant'` |
  | CV-03 | SystemMessage | `'system'` |
  | CV-04 | ToolMessage | `'tool'` |
  | CV-05 | FunctionMessage | `'function'` |
  | CV-06 | ChatMessage (custom role) | Uses `message.role` property |
- **Acceptance Criteria**:
  - Each message type maps to correct role string
  - ChatMessage preserves custom role

### TEST-06: Implement message conversion tests - content extraction (CV-07 to CV-11)
- [x] **Status**: Completed
- **Description**: Create tests for content extraction from various formats
- **File**: `tests/tooling-extensions-langchain/messageConversion.test.ts`
- **Test Cases**:
  | Test ID | Content Type | Expected Behavior |
  |---------|-------------|-------------------|
  | CV-07 | ContentPart[] (mixed text/image) | Text parts concatenated |
  | CV-08 | Message with existing id | ID preserved |
  | CV-09 | Message without id | UUID generated |
  | CV-10 | Empty string content | Message skipped (null) |
  | CV-11 | Image-only ContentPart[] | Message skipped (null) |
- **Acceptance Criteria**:
  - ContentPart arrays extract and concatenate text
  - Existing IDs are preserved, missing IDs get UUIDs
  - Messages without extractable text return null

### TEST-07: Implement success path tests for sendChatHistoryAsync (SP-01)
- [x] **Status**: Completed
- **Description**: Create tests for successful graph-based API flow
- **File**: `tests/tooling-extensions-langchain/sendChatHistoryAsync.test.ts`
- **Test Cases**:
  - SP-01: Valid graph and config - fetches state, converts messages, sends to API
  - Verify `graph.getState(config)` is called
  - Verify messages are extracted from state
  - Verify `configService.sendChatHistory()` is called with converted messages
- **Acceptance Criteria**:
  - Complete flow from graph to API call is verified
  - Return value matches configService response

### TEST-08: Implement success path tests for sendChatHistoryFromStateAsync (SP-02)
- [x] **Status**: Completed
- **Description**: Create tests for successful StateSnapshot-based API flow
- **File**: `tests/tooling-extensions-langchain/sendChatHistoryFromStateAsync.test.ts`
- **Test Cases**:
  - SP-02: Valid StateSnapshot - messages extracted and sent successfully
  - Verify messages are extracted from `stateSnapshot.values.messages`
  - Verify delegation to sendChatHistoryFromMessagesAsync
- **Acceptance Criteria**:
  - Messages are correctly extracted from state values
  - Delegation chain works correctly

### TEST-09: Implement success path tests for sendChatHistoryFromChatHistoryAsync (SP-03)
- [x] **Status**: Completed
- **Description**: Create tests for successful BaseChatMessageHistory-based API flow
- **File**: `tests/tooling-extensions-langchain/sendChatHistoryFromChatHistoryAsync.test.ts`
- **Test Cases**:
  - SP-03: Valid BaseChatMessageHistory - messages retrieved and sent
  - Verify `chatHistory.getMessages()` is called
  - Verify delegation to sendChatHistoryFromMessagesAsync
- **Acceptance Criteria**:
  - `getMessages()` is invoked on chat history
  - Retrieved messages are passed to lower-level API

### TEST-10: Implement success path tests for sendChatHistoryFromMessagesAsync (SP-04 to SP-08)
- [x] **Status**: Completed
- **Description**: Create tests for lowest-level API success scenarios
- **File**: `tests/tooling-extensions-langchain/sendChatHistoryFromMessagesAsync.test.ts`
- **Test Cases**:
  | Test ID | Scenario | Verification |
  |---------|----------|--------------|
  | SP-04 | Valid BaseMessage array | Messages converted and sent |
  | SP-05 | Messages with limit parameter | Only first N messages sent |
  | SP-06 | Mixed valid/invalid messages | Valid sent, invalid skipped |
  | SP-07 | Custom toolOptions | Options passed to configService |
  | SP-08 | Empty messages array | Empty array sent to API (not no-op) |
- **Acceptance Criteria**:
  - All success scenarios pass
  - Empty array behavior explicitly verified (critical for RTP)
  - Limit parameter correctly restricts message count

### TEST-11: Implement error handling tests (EH-01 to EH-06)
- [x] **Status**: Completed
- **Description**: Create tests for error scenarios
- **File**: `tests/tooling-extensions-langchain/errorHandling.test.ts`
- **Test Cases**:
  | Test ID | Error Scenario | Expected Behavior |
  |---------|---------------|-------------------|
  | EH-01 | HTTP request fails | Returns `OperationResult.failed` with error |
  | EH-02 | Network timeout | Returns `OperationResult.failed` with timeout error |
  | EH-03 | All messages fail conversion | Empty array sent to API |
  | EH-04 | Core service throws validation error | Error re-thrown |
  | EH-05 | `graph.getState()` throws error | Returns `OperationResult.failed` |
  | EH-06 | `chatHistory.getMessages()` throws error | Returns `OperationResult.failed` |
- **Acceptance Criteria**:
  - All error scenarios return appropriate results
  - Validation errors are properly re-thrown
  - Non-validation errors are wrapped in OperationResult.failed

### TEST-12: Create mock TurnContext fixture
- [x] **Status**: Completed
- **Description**: Create or reuse mock TurnContext for testing
- **File**: `tests/tooling-extensions-langchain/fixtures/mockTurnContext.ts`
- **Contents**:
  - Mock `TurnContext` object with required properties
  - Configurable activity and other context properties
- **Acceptance Criteria**:
  - Can be used across all test files
  - Provides realistic context for testing

### TEST-13: Create mock McpToolServerConfigurationService fixture
- [x] **Status**: Completed
- **Description**: Create mock for the underlying configuration service
- **File**: `tests/tooling-extensions-langchain/fixtures/mockConfigService.ts`
- **Contents**:
  - Mock `McpToolServerConfigurationService` with `sendChatHistory()` method
  - Configurable to return success or failure results
  - Configurable to track calls for verification
- **Acceptance Criteria**:
  - Can return configurable `OperationResult`
  - Tracks calls for test assertions
  - Can be configured to throw errors

### TEST-14: Update jest.config.cjs for new test files
- [x] **Status**: Completed
- **Description**: Ensure Jest configuration includes the new test directory
- **File**: `tests/jest.config.cjs`
- **Changes**:
  - Add module name mapper for `@microsoft/agents-a365-tooling-extensions-langchain`
  - Ensure test file patterns include new test files
- **Acceptance Criteria**:
  - `pnpm test` discovers and runs new tests
  - Coverage reports include new implementation files

### TEST-15: Run full test suite and verify coverage
- [x] **Status**: Completed
- **Description**: Execute all tests and verify coverage meets targets
- **Commands**:
  ```bash
  pnpm test
  pnpm test:coverage
  ```
- **Coverage Targets**:
  - Line Coverage: >= 80%
  - Branch Coverage: >= 75%
  - Function Coverage: >= 90%
- **Acceptance Criteria**:
  - All tests pass
  - Coverage targets are met
  - No regressions in existing tests

---

## Documentation Tasks

### DOC-01: Update package README.md
- [x] **Status**: Completed
- **Description**: Update the package README to document the new Send Chat History API
- **File**: `packages/agents-a365-tooling-extensions-langchain/README.md`
- **Content to Add**:
  - Section describing Send Chat History API
  - Usage examples for all four API levels
  - Error handling guidance
  - Prerequisites (optional @langchain/langgraph dependency)
- **Acceptance Criteria**:
  - README clearly explains new functionality
  - Examples are accurate and copy-pasteable

### DOC-02: Update package design.md
- [x] **Status**: Completed
- **Description**: Update the design document with new API architecture
- **File**: `packages/agents-a365-tooling-extensions-langchain/docs/design.md`
- **Content to Add**:
  - Layered API design description
  - Sequence diagrams from PRD
  - Role mapping table
  - Error handling matrix
- **Acceptance Criteria**:
  - Design document accurately reflects implementation
  - Technical details are comprehensive

### DOC-03: Verify TypeScript declaration files are generated
- [x] **Status**: Completed
- **Description**: Ensure TypeScript builds produce correct `.d.ts` files for new methods
- **Verification**:
  ```bash
  cd packages/agents-a365-tooling-extensions-langchain
  pnpm build
  ```
  - Check `dist/esm/McpToolRegistrationService.d.ts` includes new method signatures
  - Check `dist/cjs/McpToolRegistrationService.d.ts` includes new method signatures
- **Acceptance Criteria**:
  - All public methods are in declaration files
  - Generic type parameters are preserved
  - JSDoc comments are included in declarations

### DOC-04: Create CHANGELOG entry
- [x] **Status**: Completed
- **Description**: Add changelog entry for the new feature
- **File**: `packages/agents-a365-tooling-extensions-langchain/CHANGELOG.md`
- **Content**:
  ```markdown
  ## [Unreleased]

  ### Added
  - `sendChatHistoryAsync()` - Send chat history from LangGraph CompiledStateGraph
  - `sendChatHistoryFromStateAsync()` - Send chat history from StateSnapshot
  - `sendChatHistoryFromChatHistoryAsync()` - Send chat history from BaseChatMessageHistory
  - `sendChatHistoryFromMessagesAsync()` - Send chat history from BaseMessage array
  ```
- **Acceptance Criteria**:
  - All four new methods are documented
  - Entry follows existing changelog format

---

## Dependencies Between Tasks

```
SETUP-01 ─┬─► IMPL-01 ─► IMPL-05 (uuid needed for ID generation)
SETUP-02 ─┤
SETUP-03 ─┤
SETUP-04 ─┘

IMPL-03 (mapRole) ─┬─► IMPL-05 (convertSingleMessage)
IMPL-04 (extractContent) ─┘

IMPL-05 (convertSingleMessage) ─► IMPL-06 (convertToChatHistoryMessages)

IMPL-06 ─► IMPL-07 (sendChatHistoryFromMessagesAsync - Level 4)

IMPL-07 ─┬─► IMPL-08 (sendChatHistoryFromChatHistoryAsync - Level 3)
         └─► IMPL-09 (sendChatHistoryFromStateAsync - Level 2)

IMPL-09 ─► IMPL-10 (sendChatHistoryAsync - Level 1)

IMPL-07 through IMPL-10 ─► IMPL-11 (JSDoc)

TEST-01 ─┬─► TEST-04 through TEST-11
TEST-02 ─┤
TEST-03 ─┤
TEST-12 ─┤
TEST-13 ─┘

All IMPL tasks ─► All TEST tasks

TEST-14 ─► TEST-15

All tasks ─► DOC-01 through DOC-04
```

---

## Notes

- **Critical**: Empty message arrays MUST be sent to the API (not treated as no-op). This is required for RTP user message registration.
- **Optional Peer Dependency**: `@langchain/langgraph` should remain optional since `sendChatHistoryFromMessagesAsync` and `sendChatHistoryFromChatHistoryAsync` work without it.
- **Type Safety**: Avoid using `any` types in public API surfaces.
- **Copyright Headers**: All new `.ts` files must include Microsoft copyright header.
- **Consistency**: Follow patterns established in the OpenAI tooling extensions package (PR #157).
