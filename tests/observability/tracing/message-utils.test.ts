// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
  MAX_ATTRIBUTE_LENGTH,
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
  it('returns JSON for small arrays within limit', () => {
    const messages: ChatMessage[] = [
      { role: MessageRole.USER, parts: [{ type: 'text', content: 'hello' }] },
    ];
    const result = serializeMessages(messages);
    expect(result).toBe(JSON.stringify(messages));
  });

  it('returns JSON for empty array', () => {
    expect(serializeMessages([])).toBe('[]');
  });

  it('truncates trailing messages when over MAX_ATTRIBUTE_LENGTH', () => {
    // Create messages that collectively exceed MAX_ATTRIBUTE_LENGTH
    const longContent = 'x'.repeat(1000);
    const messages: ChatMessage[] = Array.from({ length: 20 }, (_, i) => ({
      role: MessageRole.USER,
      parts: [{ type: 'text' as const, content: `${longContent}-${i}` }],
    }));

    // Verify the full array exceeds the limit
    expect(JSON.stringify(messages).length).toBeGreaterThan(MAX_ATTRIBUTE_LENGTH);

    const result = serializeMessages(messages);
    expect(result.length).toBeLessThanOrEqual(MAX_ATTRIBUTE_LENGTH);

    const parsed = JSON.parse(result);
    // Should have fewer items than original + a sentinel at the end
    expect(parsed.length).toBeLessThan(messages.length);
  });

  it('appends sentinel with correct drop count', () => {
    const longContent = 'x'.repeat(1000);
    const messages: ChatMessage[] = Array.from({ length: 20 }, (_, i) => ({
      role: MessageRole.USER,
      parts: [{ type: 'text' as const, content: `${longContent}-${i}` }],
    }));

    const result = serializeMessages(messages);
    const parsed = JSON.parse(result);

    // Last element should be the sentinel
    const sentinel = parsed[parsed.length - 1];
    expect(sentinel.role).toBe('system');
    expect(sentinel.parts[0].type).toBe('text');
    expect(sentinel.parts[0].content).toMatch(/\[truncated: \d+ of 20 messages omitted\]/);

    // Verify the count is correct
    const keptCount = parsed.length - 1; // excluding sentinel
    const droppedCount = 20 - keptCount;
    expect(sentinel.parts[0].content).toBe(`[truncated: ${droppedCount} of 20 messages omitted]`);
  });

  it('falls back to truncateValue when single item exceeds limit', () => {
    const hugeContent = 'y'.repeat(MAX_ATTRIBUTE_LENGTH + 1000);
    const messages: ChatMessage[] = [
      { role: MessageRole.USER, parts: [{ type: 'text', content: hugeContent }] },
    ];

    const result = serializeMessages(messages);
    expect(result.length).toBeLessThanOrEqual(MAX_ATTRIBUTE_LENGTH);
    expect(result).toContain('...[truncated]');
  });

  it('handles boundary: exactly at MAX_ATTRIBUTE_LENGTH', () => {
    // Create a message whose JSON is exactly MAX_ATTRIBUTE_LENGTH
    // We'll find the right content length by subtracting the wrapper overhead
    const wrapper: ChatMessage = { role: MessageRole.USER, parts: [{ type: 'text', content: '' }] };
    const overhead = JSON.stringify([wrapper]).length;
    const contentLength = MAX_ATTRIBUTE_LENGTH - overhead;
    const message: ChatMessage = { role: MessageRole.USER, parts: [{ type: 'text', content: 'a'.repeat(contentLength) }] };

    const json = JSON.stringify([message]);
    expect(json.length).toBe(MAX_ATTRIBUTE_LENGTH);

    // Should return without truncation
    const result = serializeMessages([message]);
    expect(result).toBe(json);
  });

  it('handles boundary: 1 byte over MAX_ATTRIBUTE_LENGTH with two messages', () => {
    // Create two messages that together are 1 byte over the limit
    const wrapper: ChatMessage = { role: MessageRole.USER, parts: [{ type: 'text', content: '' }] };
    const twoItemOverhead = JSON.stringify([wrapper, wrapper]).length;
    const contentPerItem = Math.floor((MAX_ATTRIBUTE_LENGTH - twoItemOverhead) / 2);

    const messages: ChatMessage[] = [
      { role: MessageRole.USER, parts: [{ type: 'text', content: 'a'.repeat(contentPerItem + 1) }] },
      { role: MessageRole.USER, parts: [{ type: 'text', content: 'b'.repeat(contentPerItem + 1) }] },
    ];

    expect(JSON.stringify(messages).length).toBeGreaterThan(MAX_ATTRIBUTE_LENGTH);

    const result = serializeMessages(messages);
    expect(result.length).toBeLessThanOrEqual(MAX_ATTRIBUTE_LENGTH);
  });
});
