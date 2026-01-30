# Implementation Tasks: OpenAI Chat History API

## Overview

This document outlines the implementation tasks for adding `sendChatHistoryAsync` and `sendChatHistoryMessagesAsync` APIs to the `@microsoft/agents-a365-tooling-extensions-openai` package. These APIs enable developers using the OpenAI Agents SDK to send conversation history to the MCP platform for real-time threat protection without manual type conversion.

**Target Package:** `@microsoft/agents-a365-tooling-extensions-openai`

**Estimated Total Tasks:** 18 tasks across 4 phases

**Key Features:**
- Session-based chat history extraction via `sendChatHistoryAsync`
- Direct message list support via `sendChatHistoryMessagesAsync`
- Pass-through of role from OpenAI message types
- Auto-generation of UUIDs for messages without IDs
- Auto-generation of timestamps (always current UTC)

---

## Task List

### Phase 1: Setup and Dependencies

- [ ] Task 1.1: Verify and update package dependencies
  - **File(s):** `packages/agents-a365-tooling-extensions-openai/package.json`, `pnpm-workspace.yaml`
  - **Details:**
    - Update pnpm catalog to use `@openai/agents`, `@openai/agents-core`, and `@openai/agents-openai` with version `^0.4.0` (required for `OpenAIConversationsSession`)
    - Add `uuid` dependency with version `^9.0.0` for UUID generation
    - Add `@types/uuid` to devDependencies with version `^9.0.0`
  - **Acceptance Criteria:**
    - `pnpm install` completes successfully
    - `uuid` package is available for import in the source file
    - `OpenAIConversationsSession` is importable from `@openai/agents-openai`
    - No version conflicts reported

---

### Phase 2: Core Implementation

- [ ] Task 2.1: Add required imports to McpToolRegistrationService
  - **File(s):** `packages/agents-a365-tooling-extensions-openai/src/McpToolRegistrationService.ts`
  - **Details:**
    - Add import for `v4 as uuidv4` from `uuid`
    - Add import for `OperationResult`, `OperationError` from `@microsoft/agents-a365-runtime`
    - Add import for `ChatHistoryMessage` from `@microsoft/agents-a365-tooling`
    - Add import for `AgentInputItem` from `@openai/agents`
    - Add import for `OpenAIConversationsSession` from `@openai/agents-openai`
  - **Acceptance Criteria:**
    - All imports resolve correctly
    - No TypeScript errors on import statements

- [ ] Task 2.2: Implement extractRole private method
  - **File(s):** `packages/agents-a365-tooling-extensions-openai/src/McpToolRegistrationService.ts`
  - **Details:**
    - Add private method `extractRole(message: AgentInputItem): string`
    - Simply return `message.role` directly without any transformation or validation
  - **Acceptance Criteria:**
    - Method returns the role property as-is
    - No role mapping or validation logic

- [ ] Task 2.3: Implement extractContent private method
  - **File(s):** `packages/agents-a365-tooling-extensions-openai/src/McpToolRegistrationService.ts`
  - **Details:**
    - Add private method `extractContent(message: AgentInputItem): string`
    - Implement content extraction logic:
      1. If `message.content` is string, use directly
      2. If `message.content` is array (ContentPart[]), concatenate text parts
      3. Check for `message.text` property as fallback
      4. Throw Error if content is empty or undefined (message will be skipped)
  - **Acceptance Criteria:**
    - String content extracted directly
    - Array content properly concatenated
    - Error thrown for empty content (with descriptive message)

- [ ] Task 2.4: Implement extractId private method
  - **File(s):** `packages/agents-a365-tooling-extensions-openai/src/McpToolRegistrationService.ts`
  - **Details:**
    - Add private method `extractId(message: AgentInputItem): string`
    - If `message.id` exists, return it
    - Otherwise, generate UUID using `uuidv4()`
    - Log debug message when generating UUID
  - **Acceptance Criteria:**
    - Existing IDs preserved
    - Valid UUIDs generated for missing IDs
    - Debug logging present

- [ ] Task 2.5: Implement extractTimestamp private method
  - **File(s):** `packages/agents-a365-tooling-extensions-openai/src/McpToolRegistrationService.ts`
  - **Details:**
    - Add private method `extractTimestamp(_message: AgentInputItem): Date`
    - Always return `new Date()` (current UTC time)
    - Note: AgentInputItem types do not have timestamp properties
  - **Acceptance Criteria:**
    - Returns current Date object
    - Method signature uses underscore prefix for unused parameter

- [ ] Task 2.6: Implement convertSingleMessage private method
  - **File(s):** `packages/agents-a365-tooling-extensions-openai/src/McpToolRegistrationService.ts`
  - **Details:**
    - Add private method `convertSingleMessage(message: AgentInputItem): ChatHistoryMessage | null`
    - Use try-catch to handle conversion errors
    - Call extractId, extractRole, extractContent, extractTimestamp
    - Return null and log error if conversion fails (message will be filtered out)
  - **Acceptance Criteria:**
    - Returns valid ChatHistoryMessage on success
    - Returns null on failure
    - Errors logged appropriately

- [ ] Task 2.7: Implement convertToChatHistoryMessages private method
  - **File(s):** `packages/agents-a365-tooling-extensions-openai/src/McpToolRegistrationService.ts`
  - **Details:**
    - Add private method `convertToChatHistoryMessages(messages: AgentInputItem[]): ChatHistoryMessage[]`
    - Map messages through `convertSingleMessage`
    - Filter out null values using type guard
  - **Acceptance Criteria:**
    - All messages converted or skipped
    - Null values filtered from result

- [ ] Task 2.8: Implement sendChatHistoryMessagesAsync method
  - **File(s):** `packages/agents-a365-tooling-extensions-openai/src/McpToolRegistrationService.ts`
  - **Details:**
    - Add public async method with JSDoc:
      ```typescript
      async sendChatHistoryMessagesAsync(
        turnContext: TurnContext,
        messages: AgentInputItem[],
        toolOptions?: ToolOptions
      ): Promise<OperationResult>
      ```
    - Validate turnContext (throw if null/undefined)
    - Validate messages (throw if null/undefined)
    - Return `OperationResult.success` for empty array (no-op)
    - Set default orchestratorName to "OpenAI"
    - Convert messages and delegate to `this.configService.sendChatHistory()`
    - Handle errors: re-throw validation errors, return OperationResult.failed for others
  - **Acceptance Criteria:**
    - Method signature matches PRD specification
    - Input validation works correctly
    - Empty array handled as no-op
    - Delegates to core service correctly

- [ ] Task 2.9: Implement sendChatHistoryAsync method
  - **File(s):** `packages/agents-a365-tooling-extensions-openai/src/McpToolRegistrationService.ts`
  - **Details:**
    - Add public async method with JSDoc:
      ```typescript
      async sendChatHistoryAsync(
        turnContext: TurnContext,
        session: OpenAIConversationsSession,
        limit?: number,
        toolOptions?: ToolOptions
      ): Promise<OperationResult>
      ```
    - Validate turnContext (throw if null/undefined)
    - Validate session (throw if null/undefined)
    - Extract messages using `session.getItems(limit)`
    - Delegate to `sendChatHistoryMessagesAsync()`
    - Handle errors: re-throw validation errors, return OperationResult.failed for others
  - **Acceptance Criteria:**
    - Method signature matches PRD specification
    - Session validation works
    - Limit parameter passed to getItems
    - Delegates correctly to sendChatHistoryMessagesAsync

- [ ] Task 2.10: Add logger property to McpToolRegistrationService
  - **File(s):** `packages/agents-a365-tooling-extensions-openai/src/McpToolRegistrationService.ts`
  - **Details:**
    - Add private readonly logger property: `private readonly logger = console;`
    - Ensure consistent logging throughout new methods (info, warn, error, debug levels)
  - **Acceptance Criteria:**
    - Logger property exists
    - All new methods use logger for appropriate log levels

---

### Phase 3: Testing

- [ ] Task 3.1: Create test fixtures for mock OpenAI types
  - **File(s):** `tests/tooling-extensions-openai/fixtures/mockOpenAITypes.ts` (new file)
  - **Details:**
    - Create mock `AgentInputItem` objects for different message types:
      - UserMessageItem with string content
      - AssistantMessageItem with string content
      - SystemMessageItem with string content
      - Message with array content (ContentPart[])
      - Message without ID
      - Message with empty content
      - Message with unknown type/role
    - Create mock `OpenAIConversationsSession` class with controllable `getItems()` behavior
  - **Acceptance Criteria:**
    - All fixture types defined
    - Mock session class supports configurable returns
    - Copyright header present

- [ ] Task 3.2: Create unit tests for sendChatHistoryAsync
  - **File(s):** `tests/tooling-extensions-openai/sendChatHistoryAsync.test.ts` (new file)
  - **Details:**
    - Test cases per PRD section 8.2:
      - UV-01: throws when turnContext is null
      - UV-02: throws when session is null
      - SP-01: extracts and sends session items successfully
      - SP-02: respects limit parameter
      - EH-01: returns failed on HTTP error
      - EH-02: returns failed on timeout
      - EH-04: returns failed on session.getItems error
    - Use Jest mocking for axios and session
  - **Acceptance Criteria:**
    - All test cases pass
    - Code coverage >= 95% for sendChatHistoryAsync
    - Copyright header present

- [ ] Task 3.3: Create unit tests for sendChatHistoryMessagesAsync
  - **File(s):** `tests/tooling-extensions-openai/sendChatHistoryMessagesAsync.test.ts` (new file)
  - **Details:**
    - Test cases per PRD section 8.2:
      - UV-03: throws when turnContext is null
      - UV-04: throws when messages is null
      - UV-05: returns success for empty array (no-op)
      - SP-03: returns success on successful send
      - SP-04: uses default orchestrator name "OpenAI"
      - SP-05: uses custom ToolOptions when provided
      - EH-03: returns failed on conversion error
  - **Acceptance Criteria:**
    - All test cases pass
    - Code coverage >= 95% for sendChatHistoryMessagesAsync
    - Copyright header present

- [ ] Task 3.4: Create unit tests for message conversion logic
  - **File(s):** `tests/tooling-extensions-openai/messageConversion.test.ts` (new file)
  - **Details:**
    - Test cases per PRD section 8.2.2:
      - CV-01: extractRole returns role directly (pass-through)
      - CV-02: extractContent extracts string content
      - CV-03: extractContent concatenates array content
      - CV-04: extractContent throws for empty content (message skipped)
      - CV-05: extractId uses existing ID
      - CV-06: extractId generates UUID when missing
      - CV-07: extractTimestamp always uses current time
    - Test edge cases: null/undefined properties, mixed content arrays
  - **Acceptance Criteria:**
    - All test cases pass
    - Content extraction handles all formats
    - Copyright header present

- [ ] Task 3.5: Verify test coverage meets requirements
  - **File(s):** N/A (run command)
  - **Details:**
    - Run `pnpm test:coverage` from repository root
    - Verify line coverage >= 95% for McpToolRegistrationService.ts
    - Verify branch coverage >= 90%
    - Address any coverage gaps
  - **Acceptance Criteria:**
    - Line coverage >= 95%
    - Branch coverage >= 90%
    - All tests pass

---

### Phase 4: Documentation and Cleanup

- [ ] Task 4.1: Update package design documentation
  - **File(s):** `packages/agents-a365-tooling-extensions-openai/docs/design.md`
  - **Details:**
    - Add section documenting the new chat history APIs
    - Include usage examples from PRD section 2.2
    - Document the conversion logic (role pass-through, content extraction, ID/timestamp generation)
    - Reference the core `sendChatHistory` method in tooling package
  - **Acceptance Criteria:**
    - New APIs documented with examples
    - Conversion behavior explained
    - Links to related documentation

- [ ] Task 4.2: Run linting and fix any issues
  - **File(s):** All modified files
  - **Details:**
    - Run `pnpm lint` to check for linting errors
    - Run `pnpm lint:fix` to auto-fix issues
    - Manually fix any remaining issues
  - **Acceptance Criteria:**
    - `pnpm lint` passes with no errors
    - Code follows project style guidelines

- [ ] Task 4.3: Code review and resolve comments
  - **File(s):** All modified and new files
  - **Details:**
    - Use the `code-review-manager` subagent to review all changes made for this feature
    - Use the `pr-comment-resolver` subagent to address any issues discovered during code review
    - Iterate until all code review comments are resolved
    - Re-run linting after any changes made during review resolution
  - **Acceptance Criteria:**
    - Code review completed with no outstanding issues
    - All review comments addressed and resolved
    - Code still passes linting after review changes

- [ ] Task 4.4: Build and verify package
  - **File(s):** N/A (run command)
  - **Details:**
    - Run `pnpm build` from repository root
    - Verify both CJS and ESM builds succeed
    - Check that exports are correct in dist/ output
  - **Acceptance Criteria:**
    - Build completes without errors
    - Both dist/cjs and dist/esm directories created
    - New types visible in dist/esm/index.d.ts

---

## Dependencies Between Tasks

```
Phase 1 (Setup)
  Task 1.1 ──────────────────────► Phase 2 (Implementation)
                                   │
                                   ▼
  Task 2.1 ──► Tasks 2.2-2.5 (can be parallel)
                                   │
                                   ▼
                            Task 2.6 ──► Task 2.7
                                   │
                                   ▼
                            Task 2.8 ──► Task 2.9
                                   │
                            Task 2.10 (can be done anytime in Phase 2)
                                   │
                                   ▼
Phase 3 (Testing)
  Task 3.1 (fixtures) ──► Tasks 3.2, 3.3, 3.4 (can be parallel)
                                   │
                                   ▼
                            Task 3.5 (coverage verification)
                                   │
                                   ▼
Phase 4 (Documentation & Cleanup)
  Tasks 4.1, 4.2 (can be parallel) ──► Task 4.3 (code review loop) ──► Task 4.4
```

---

## Estimated Effort

| Phase | Tasks | Estimated Hours | Notes |
|-------|-------|-----------------|-------|
| **Phase 1: Setup** | 1 | 0.25 | Dependency updates |
| **Phase 2: Core Implementation** | 10 | 4-6 | Main development work |
| **Phase 3: Testing** | 5 | 3-4 | Comprehensive test coverage |
| **Phase 4: Documentation & Cleanup** | 4 | 2-4 | Final polish, code review iteration |
| **Total** | **18** | **9.25-14.25** | |

---

## Notes

1. **OpenAI SDK Types**: The `AgentInputItem` type is a union of 15+ types. The implementation should handle all message-like types gracefully and skip non-message types (tool calls, results) with appropriate logging.

2. **Error Handling Strategy**: Validation errors (null inputs) should throw immediately. Runtime errors (HTTP failures, conversion issues) should return `OperationResult.failed()` to allow callers to handle gracefully.

3. **Backward Compatibility**: The existing `addToolServersToAgent` method must remain unchanged. All new code is additive.

4. **Testing Strategy**: Follow existing test patterns in `tests/tooling/mcp-tool-server-configuration-service.test.ts` for consistency.

5. **Copyright Headers**: All new `.ts` files must include the Microsoft copyright header as per CLAUDE.md instructions.
