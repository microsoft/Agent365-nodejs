// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Mock implementations of LangChain message types for testing.
 * These mocks simulate the behavior of @langchain/core/messages classes.
 */

/**
 * Mock implementation of BaseMessage for testing.
 */
export abstract class MockBaseMessage {
  content: string | Array<{ type: string; text?: string; image_url?: string }>;
  id?: string;
  name?: string;
  additional_kwargs: Record<string, unknown>;
  response_metadata: Record<string, unknown>;

  constructor(
    content: string | Array<{ type: string; text?: string; image_url?: string }>,
    id?: string
  ) {
    this.content = content;
    this.id = id;
    this.additional_kwargs = {};
    this.response_metadata = {};
  }

  abstract getType(): string;

  /**
   * Text accessor that handles both string and ContentPart arrays.
   */
  get text(): string {
    if (typeof this.content === 'string') {
      return this.content;
    }

    if (Array.isArray(this.content)) {
      return this.content
        .filter(part => part.type === 'text' && part.text)
        .map(part => part.text!)
        .join(' ');
    }

    return '';
  }
}

/**
 * Mock HumanMessage (user messages).
 */
export class MockHumanMessage extends MockBaseMessage {
  getType(): string {
    return 'human';
  }
}

/**
 * Mock AIMessage (assistant messages).
 */
export class MockAIMessage extends MockBaseMessage {
  getType(): string {
    return 'ai';
  }
}

/**
 * Mock SystemMessage.
 */
export class MockSystemMessage extends MockBaseMessage {
  getType(): string {
    return 'system';
  }
}

/**
 * Mock ToolMessage.
 */
export class MockToolMessage extends MockBaseMessage {
  tool_call_id: string;

  constructor(
    content: string | Array<{ type: string; text?: string; image_url?: string }>,
    tool_call_id: string,
    id?: string
  ) {
    super(content, id);
    this.tool_call_id = tool_call_id;
  }

  getType(): string {
    return 'tool';
  }
}

/**
 * Mock FunctionMessage.
 */
export class MockFunctionMessage extends MockBaseMessage {
  getType(): string {
    return 'function';
  }
}

/**
 * Mock ChatMessage with custom role.
 */
export class MockChatMessage extends MockBaseMessage {
  role: string;

  constructor(
    content: string | Array<{ type: string; text?: string; image_url?: string }>,
    role: string,
    id?: string
  ) {
    super(content, id);
    this.role = role;
  }

  getType(): string {
    return 'chat';
  }
}

/**
 * Mock unknown message type for testing default role mapping.
 */
export class MockUnknownMessage extends MockBaseMessage {
  getType(): string {
    return 'unknown' as string;
  }
}

/**
 * Mock message that throws when accessing text property.
 */
export class MockThrowingTextMessage extends MockBaseMessage {
  getType(): string {
    return 'human';
  }

  get text(): string {
    throw new Error('Cannot access text property');
  }
}

/**
 * Helper function to create mock messages easily.
 */
export function createMockMessage(
  type: 'human' | 'ai' | 'system' | 'tool' | 'function' | 'chat' | 'unknown',
  content: string | Array<{ type: string; text?: string; image_url?: string }>,
  options?: {
    id?: string;
    role?: string; // For ChatMessage
    tool_call_id?: string; // For ToolMessage
  }
): MockBaseMessage {
  const id = options?.id;

  switch (type) {
    case 'human':
      return new MockHumanMessage(content, id);
    case 'ai':
      return new MockAIMessage(content, id);
    case 'system':
      return new MockSystemMessage(content, id);
    case 'tool':
      return new MockToolMessage(content, options?.tool_call_id ?? 'tool-call-1', id);
    case 'function':
      return new MockFunctionMessage(content, id);
    case 'chat':
      return new MockChatMessage(content, options?.role ?? 'user', id);
    case 'unknown':
      return new MockUnknownMessage(content, id);
    default:
      return new MockHumanMessage(content, id);
  }
}

/**
 * Creates an array of mixed mock messages for testing.
 */
export function createMockMessageArray(): MockBaseMessage[] {
  return [
    new MockHumanMessage('Hello, how are you?', 'msg-1'),
    new MockAIMessage('I am doing well, thank you!', 'msg-2'),
    new MockHumanMessage('Can you help me with something?', 'msg-3'),
    new MockAIMessage('Of course! What do you need help with?', 'msg-4'),
  ];
}

/**
 * Creates a mock message with ContentPart array.
 */
export function createMockMultimodalMessage(): MockBaseMessage {
  return new MockHumanMessage([
    { type: 'text', text: 'Here is an image:' },
    { type: 'image_url', image_url: 'https://example.com/image.png' },
    { type: 'text', text: 'What do you see?' }
  ], 'multimodal-msg-1');
}

/**
 * Creates a mock message with only image content (no text).
 */
export function createMockImageOnlyMessage(): MockBaseMessage {
  return new MockHumanMessage([
    { type: 'image_url', image_url: 'https://example.com/image.png' }
  ], 'image-only-msg-1');
}
