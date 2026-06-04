// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Local type matching the SessionMessage shape from @anthropic-ai/claude-agent-sdk.
 * Defined here to avoid ESM resolution issues in Jest.
 */
export interface MockSessionMessage {
  type: 'user' | 'assistant' | 'system';
  uuid: string;
  session_id: string;
  message: unknown;
  parent_tool_use_id: string | null;
}

/**
 * Creates a mock user message with string content.
 */
export function createUserMessage(content: string, uuid?: string): MockSessionMessage {
  return {
    type: 'user',
    uuid: uuid ?? `msg-${Math.random().toString(36).slice(2, 10)}`,
    session_id: 'session-123',
    message: { role: 'user', content: content },
    parent_tool_use_id: null
  } as MockSessionMessage;
}

/**
 * Creates a mock assistant message with string content.
 */
export function createAssistantMessage(content: string, uuid?: string): MockSessionMessage {
  return {
    type: 'assistant',
    uuid: uuid ?? `msg-${Math.random().toString(36).slice(2, 10)}`,
    session_id: 'session-123',
    message: { role: 'assistant', content: content },
    parent_tool_use_id: null
  } as MockSessionMessage;
}

/**
 * Creates a mock system message with string content.
 */
export function createSystemMessage(content: string, uuid?: string): MockSessionMessage {
  return {
    type: 'system',
    uuid: uuid ?? `msg-${Math.random().toString(36).slice(2, 10)}`,
    session_id: 'session-123',
    message: { role: 'system', content: content },
    parent_tool_use_id: null
  } as MockSessionMessage;
}

/**
 * Creates a mock assistant message with structured content blocks.
 */
export function createMessageWithContentBlocks(
  type: 'user' | 'assistant' | 'system',
  blocks: Array<{ type: string; text?: string; name?: string; input?: unknown; content?: unknown }>,
  uuid?: string
): MockSessionMessage {
  return {
    type: type,
    uuid: uuid ?? `msg-${Math.random().toString(36).slice(2, 10)}`,
    session_id: 'session-123',
    message: { role: type, content: blocks },
    parent_tool_use_id: null
  } as MockSessionMessage;
}

/**
 * Creates a mock message with tool_use content block.
 */
export function createToolUseMessage(toolName: string, input: unknown, uuid?: string): MockSessionMessage {
  return {
    type: 'assistant',
    uuid: uuid ?? `msg-${Math.random().toString(36).slice(2, 10)}`,
    session_id: 'session-123',
    message: {
      role: 'assistant',
      content: [
        { type: 'text', text: `I'll use the ${toolName} tool.` },
        { type: 'tool_use', name: toolName, input: input }
      ]
    },
    parent_tool_use_id: null
  } as MockSessionMessage;
}

/**
 * Creates a mock tool_result message.
 */
export function createToolResultMessage(result: string, uuid?: string): MockSessionMessage {
  return {
    type: 'user',
    uuid: uuid ?? `msg-${Math.random().toString(36).slice(2, 10)}`,
    session_id: 'session-123',
    message: {
      role: 'user',
      content: [
        { type: 'tool_result', content: result }
      ]
    },
    parent_tool_use_id: null
  } as MockSessionMessage;
}

/**
 * Creates a mock message with empty content.
 */
export function createMessageWithEmptyContent(type: 'user' | 'assistant' | 'system', uuid?: string): MockSessionMessage {
  return {
    type: type,
    uuid: uuid ?? `msg-${Math.random().toString(36).slice(2, 10)}`,
    session_id: 'session-123',
    message: { role: type, content: '' },
    parent_tool_use_id: null
  } as MockSessionMessage;
}

/**
 * Creates a mock message without a UUID.
 */
export function createMessageWithoutUuid(type: 'user' | 'assistant' | 'system', content: string): MockSessionMessage {
  return {
    type: type,
    uuid: '',
    session_id: 'session-123',
    message: { role: type, content: content },
    parent_tool_use_id: null
  } as MockSessionMessage;
}

/**
 * Creates a standard set of mixed messages for testing.
 */
export function createMixedMessages(): MockSessionMessage[] {
  return [
    createUserMessage('Hello, how are you?', 'msg-1'),
    createAssistantMessage('I am doing well, thank you!', 'msg-2'),
    createUserMessage('What is the weather today?', 'msg-3'),
    createAssistantMessage('I cannot check the weather directly.', 'msg-4'),
  ];
}

/**
 * Creates messages with various content types for testing content extraction.
 */
export function createMessagesWithVariousContentTypes(): MockSessionMessage[] {
  return [
    createUserMessage('Simple text message', 'msg-1'),
    createMessageWithContentBlocks('assistant', [
      { type: 'text', text: 'Here is my response.' },
      { type: 'text', text: 'With multiple blocks.' },
    ], 'msg-2'),
    createToolUseMessage('search', { query: 'weather' }, 'msg-3'),
    createToolResultMessage('Sunny, 72\u00B0F', 'msg-4'),
    createMessageWithEmptyContent('user', 'msg-5'),
  ];
}
