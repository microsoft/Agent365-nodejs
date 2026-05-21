// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
  MessageRole,
  ChatMessage,
  OutputMessage,
  InputMessages,
  OutputMessages,
  DEFAULT_FINISH_REASON,
} from '@microsoft/agents-a365-observability';
import {
  isWrappedMessages,
  toInputMessages,
  toOutputMessages,
  normalizeInputMessages,
  normalizeOutputMessages,
  serializeMessages,
} from '@microsoft/agents-a365-observability/src/tracing/message-utils';

describe('isWrappedMessages', () => {
  it('returns true for InputMessages wrapper', () => {
    const wrapper: InputMessages = {
      messages: [{ role: MessageRole.USER, parts: [{ type: 'text', content: 'hi' }] }],
    };
    expect(isWrappedMessages(wrapper)).toBe(true);
  });

  it('returns true for OutputMessages wrapper', () => {
    const wrapper: OutputMessages = {
      messages: [{ role: MessageRole.ASSISTANT, parts: [{ type: 'text', content: 'hello' }] }],
    };
    expect(isWrappedMessages(wrapper)).toBe(true);
  });

  it('returns false for string[]', () => {
    expect(isWrappedMessages(['hello'])).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(isWrappedMessages([])).toBe(false);
  });

  it('returns false for null', () => {
    expect(isWrappedMessages(null as unknown as any)).toBe(false);
  });

  it('returns false for object missing messages property', () => {
    expect(isWrappedMessages({ foo: 'bar' } as unknown as any)).toBe(false);
  });

  it('returns false for object with non-array messages property', () => {
    expect(isWrappedMessages({ messages: 'not-an-array' } as unknown as any)).toBe(false);
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
  it('wraps strings as OutputMessage with role=assistant, TextPart, and default finish_reason', () => {
    const result = toOutputMessages(['response 1', 'response 2']);
    expect(result).toEqual([
      { role: 'assistant', parts: [{ type: 'text', content: 'response 1' }], finish_reason: 'stop' },
      { role: 'assistant', parts: [{ type: 'text', content: 'response 2' }], finish_reason: 'stop' },
    ]);
  });

  it('handles empty array', () => {
    expect(toOutputMessages([])).toEqual([]);
  });
});

describe('normalizeInputMessages', () => {
  it('wraps string[] into InputMessages', () => {
    const result = normalizeInputMessages(['hello']);
    expect(result).toEqual({
      messages: [{ role: 'user', parts: [{ type: 'text', content: 'hello' }] }],
    });
  });

  it('returns InputMessages wrapper as-is', () => {
    const wrapper: InputMessages = {
      messages: [{ role: MessageRole.SYSTEM, parts: [{ type: 'text', content: 'system prompt' }] }],
    };
    expect(normalizeInputMessages(wrapper)).toBe(wrapper);
  });

  it('wraps a single string into InputMessages', () => {
    const result = normalizeInputMessages('hello');
    expect(result).toEqual({
      messages: [{ role: 'user', parts: [{ type: 'text', content: 'hello' }] }],
    });
  });

  it('wraps empty string[] into wrapper with empty messages', () => {
    const result = normalizeInputMessages([]);
    expect(result).toEqual({ messages: [] });
  });
});

describe('normalizeOutputMessages', () => {
  it('wraps string[] into OutputMessages with default finish_reason', () => {
    const result = normalizeOutputMessages(['response']);
    expect(result).toEqual({
      messages: [{ role: 'assistant', parts: [{ type: 'text', content: 'response' }], finish_reason: 'stop' }],
    });
  });

  it('wraps a single string into OutputMessages with default finish_reason', () => {
    const result = normalizeOutputMessages('response');
    expect(result).toEqual({
      messages: [{ role: 'assistant', parts: [{ type: 'text', content: 'response' }], finish_reason: 'stop' }],
    });
  });

  it('returns OutputMessages wrapper as-is', () => {
    const wrapper: OutputMessages = {
      messages: [{ role: MessageRole.ASSISTANT, parts: [{ type: 'text', content: 'done' }], finish_reason: 'stop' }],
    };
    expect(normalizeOutputMessages(wrapper)).toBe(wrapper);
  });
});

describe('serializeMessages', () => {
  it('returns JSON array for message wrapper', () => {
    const wrapper: InputMessages = {
      messages: [{ role: MessageRole.USER, parts: [{ type: 'text', content: 'hello' }] }],
    };
    const result = serializeMessages(wrapper);
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toEqual(wrapper.messages);
  });

  it('serializes empty messages wrapper as empty array', () => {
    const wrapper: InputMessages = { messages: [] };
    const parsed = JSON.parse(serializeMessages(wrapper));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toEqual([]);
  });

  it('serializes large messages without truncation', () => {
    const largeContent = 'x'.repeat(100_000);
    const wrapper: InputMessages = {
      messages: [{ role: MessageRole.USER, parts: [{ type: 'text', content: largeContent }] }],
    };

    const result = serializeMessages(wrapper);
    const parsed = JSON.parse(result);
    expect(parsed[0].parts[0].content).toBe(largeContent);
  });

  it('does not mutate the original messages', () => {
    const original = 'z'.repeat(50_000);
    const wrapper: InputMessages = {
      messages: [{ role: MessageRole.USER, parts: [{ type: 'text', content: original }] }],
    };

    serializeMessages(wrapper);

    expect((wrapper.messages[0].parts[0] as { content: string }).content).toBe(original);
  });

  it('returns fallback sentinel when messages contain non-serializable values', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;

    const wrapper: InputMessages = {
      messages: [
        { role: MessageRole.TOOL, parts: [{ type: 'tool_call_response', id: 'tc1', response: circular }] },
      ],
    };

    const result = serializeMessages(wrapper);
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].parts[0].content).toContain('serialization failed');
    expect(parsed[0].parts[0].content).toContain('1 message');
  });
});
