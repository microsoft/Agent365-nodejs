// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AgentInputItem } from '@openai/agents';

/**
 * Creates a mock UserMessageItem with string content.
 * Note: We use `as unknown as AgentInputItem` because the SDK types are strict unions.
 */
export function createUserMessage(content: string, id?: string): AgentInputItem {
  return {
    type: 'message',
    role: 'user',
    content: content,
    id: id
  } as unknown as AgentInputItem;
}

/**
 * Creates a mock AssistantMessageItem with string content.
 * Note: We use `as unknown as AgentInputItem` because the SDK types require additional properties like `status`.
 */
export function createAssistantMessage(content: string, id?: string): AgentInputItem {
  return {
    type: 'message',
    role: 'assistant',
    content: content,
    id: id
  } as unknown as AgentInputItem;
}

/**
 * Creates a mock SystemMessageItem with string content.
 * Note: We use `as unknown as AgentInputItem` because the SDK types are strict unions.
 */
export function createSystemMessage(content: string, id?: string): AgentInputItem {
  return {
    type: 'message',
    role: 'system',
    content: content,
    id: id
  } as unknown as AgentInputItem;
}

/**
 * Creates a mock message with array content (ContentPart[]).
 * Note: We use `as unknown as AgentInputItem` because the SDK types are strict unions.
 */
export function createMessageWithArrayContent(
  role: string,
  contentParts: Array<{ type: string; text?: string }>,
  id?: string
): AgentInputItem {
  return {
    type: 'message',
    role: role,
    content: contentParts,
    id: id
  } as unknown as AgentInputItem;
}

/**
 * Creates a mock message without an ID.
 * Note: We use `as unknown as AgentInputItem` because the SDK types are strict unions.
 */
export function createMessageWithoutId(role: string, content: string): AgentInputItem {
  return {
    type: 'message',
    role: role,
    content: content
  } as unknown as AgentInputItem;
}

/**
 * Creates a mock message with empty content.
 * Note: We use `as unknown as AgentInputItem` because the SDK types are strict unions.
 */
export function createMessageWithEmptyContent(role: string, id?: string): AgentInputItem {
  return {
    type: 'message',
    role: role,
    content: '',
    id: id
  } as unknown as AgentInputItem;
}

/**
 * Creates a mock message with null content.
 */
export function createMessageWithNullContent(role: string, id?: string): AgentInputItem {
  return {
    type: 'message',
    role: role,
    content: null,
    id: id
  } as unknown as AgentInputItem;
}

/**
 * Creates a mock message with undefined content.
 */
export function createMessageWithUndefinedContent(role: string, id?: string): AgentInputItem {
  return {
    type: 'message',
    role: role,
    content: undefined,
    id: id
  } as unknown as AgentInputItem;
}

/**
 * Creates a mock message with whitespace-only content.
 * Note: We use `as unknown as AgentInputItem` because the SDK types are strict unions.
 */
export function createMessageWithWhitespaceContent(role: string, id?: string): AgentInputItem {
  return {
    type: 'message',
    role: role,
    content: '   ',
    id: id
  } as unknown as AgentInputItem;
}

/**
 * Creates a mock message with unknown role.
 * Note: We use `as unknown as AgentInputItem` because the SDK types don't allow custom roles.
 */
export function createMessageWithUnknownRole(content: string, id?: string): AgentInputItem {
  return {
    type: 'message',
    role: 'custom_role',
    content: content,
    id: id
  } as unknown as AgentInputItem;
}

/**
 * Creates a mock message with text property instead of content.
 */
export function createMessageWithTextProperty(role: string, text: string, id?: string): AgentInputItem {
  return {
    type: 'message',
    role: role,
    text: text,
    id: id
  } as unknown as AgentInputItem;
}

/**
 * Mock OpenAIConversationsSession class with controllable getItems() behavior.
 * Note: We cannot directly implement OpenAIConversationsSession as it has private members.
 * Use `as unknown as OpenAIConversationsSession` when passing to methods that expect the real type.
 */
export class MockOpenAIConversationsSession {
  public sessionId?: string;
  private items: AgentInputItem[];
  private shouldThrow: boolean;
  private throwError: Error | null;

  constructor(items: AgentInputItem[] = [], sessionId?: string) {
    this.items = items;
    this.sessionId = sessionId;
    this.shouldThrow = false;
    this.throwError = null;
  }

  /**
   * Configure the session to throw an error on getItems().
   */
  setThrowOnGetItems(error: Error): void {
    this.shouldThrow = true;
    this.throwError = error;
  }

  /**
   * Set the items to be returned by getItems().
   */
  setItems(items: AgentInputItem[]): void {
    this.items = items;
  }

  /**
   * Retrieves items from the session.
   * @param limit - Optional limit on the number of items to retrieve.
   * @returns A Promise resolving to an array of AgentInputItem objects.
   */
  async getItems(limit?: number): Promise<AgentInputItem[]> {
    if (this.shouldThrow && this.throwError) {
      throw this.throwError;
    }

    if (limit !== undefined && limit > 0) {
      return this.items.slice(0, limit);
    }

    return this.items;
  }
}

/**
 * Creates a standard set of mixed messages for testing.
 */
export function createMixedMessages(): AgentInputItem[] {
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
export function createMessagesWithVariousContentTypes(): AgentInputItem[] {
  return [
    // String content
    createUserMessage('Simple text message', 'msg-1'),
    // Array content with text parts
    createMessageWithArrayContent('user', [
      { type: 'text', text: 'Part 1' },
      { type: 'text', text: 'Part 2' },
    ], 'msg-2'),
    // Array content with input_text type
    createMessageWithArrayContent('user', [
      { type: 'input_text', text: 'Input text content' },
    ], 'msg-3'),
    // Message without ID
    createMessageWithoutId('assistant', 'Response without ID'),
  ];
}
