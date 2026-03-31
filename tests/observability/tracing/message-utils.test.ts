// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
  MessageRole,
  ChatMessage,
  OutputMessage,
} from '@microsoft/agents-a365-observability';
import {
  isStringArray,
  toInputMessages,
  toOutputMessages,
  serializeMessages,
} from '@microsoft/agents-a365-observability/src/tracing/message-utils';

describe('isStringArray', () => {
  it('returns true for string[]', () => {
    expect(isStringArray(['hello', 'world'])).toBe(true);
  });

  it('returns true for empty array', () => {
    expect(isStringArray([])).toBe(true);
  });

  it('returns false for ChatMessage[]', () => {
    const messages: ChatMessage[] = [
      { role: MessageRole.USER, parts: [{ type: 'text', content: 'hi' }] },
    ];
    expect(isStringArray(messages)).toBe(false);
  });

  it('returns false for OutputMessage[]', () => {
    const messages: OutputMessage[] = [
      { role: MessageRole.ASSISTANT, parts: [{ type: 'text', content: 'hello' }], finish_reason: 'stop' },
    ];
    expect(isStringArray(messages)).toBe(false);
  });
});

describe('toInputMessages', () => {
  it('wraps strings as ChatMessage with role=user and TextPart', () => {
    const result = toInputMessages(['hello', 'world']);
    expect(result).toEqual([
      { role: 'user', parts: [{ type: 'text', content: 'hello' }] },
      { role: 'user', parts: [{ type: 'text', content: 'world' }] },
    ]);
  });

  it('handles empty array', () => {
    expect(toInputMessages([])).toEqual([]);
  });

  it('preserves message content exactly', () => {
    const content = '  special chars: <>&"\' \n\ttabs  ';
    const result = toInputMessages([content]);
    expect(result[0].parts[0]).toEqual({ type: 'text', content });
  });
});

describe('toOutputMessages', () => {
  it('wraps strings as OutputMessage with role=assistant and TextPart', () => {
    const result = toOutputMessages(['response 1', 'response 2']);
    expect(result).toEqual([
      { role: 'assistant', parts: [{ type: 'text', content: 'response 1' }] },
      { role: 'assistant', parts: [{ type: 'text', content: 'response 2' }] },
    ]);
  });

  it('handles empty array', () => {
    expect(toOutputMessages([])).toEqual([]);
  });
});

describe('serializeMessages', () => {
  it('returns JSON for messages', () => {
    const messages: ChatMessage[] = [
      { role: MessageRole.USER, parts: [{ type: 'text', content: 'hello' }] },
    ];
    expect(serializeMessages(messages)).toBe(JSON.stringify(messages));
    expect(serializeMessages([])).toBe('[]');
  });

  it('serializes large messages without truncation', () => {
    const largeContent = 'x'.repeat(100_000);
    const messages: ChatMessage[] = [
      { role: MessageRole.USER, parts: [{ type: 'text', content: largeContent }] },
    ];

    const result = serializeMessages(messages);
    const parsed = JSON.parse(result);
    expect(parsed[0].parts[0].content).toBe(largeContent);
  });

  it('does not mutate the original messages', () => {
    const original = 'z'.repeat(50_000);
    const messages: ChatMessage[] = [
      { role: MessageRole.USER, parts: [{ type: 'text', content: original }] },
    ];

    serializeMessages(messages);

    expect((messages[0].parts[0] as { content: string }).content).toBe(original);
  });

  it('returns fallback sentinel when messages contain non-serializable values', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;

    const messages: ChatMessage[] = [
      { role: MessageRole.TOOL, parts: [{ type: 'tool_call_response', id: 'tc1', response: circular }] },
    ];

    const result = serializeMessages(messages);
    const parsed = JSON.parse(result);
    expect(parsed[0].parts[0].content).toContain('serialization failed');
    expect(parsed[0].parts[0].content).toContain('1 message');
  });
});
