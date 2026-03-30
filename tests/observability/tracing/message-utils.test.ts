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

const TRUNCATION_SUFFIX = '...[truncated]';

/** Verifies a truncated string has the form: <original chars><TRUNCATION_SUFFIX> */
function expectTruncated(truncated: string, originalChar: string): void {
  expect(truncated.endsWith(TRUNCATION_SUFFIX)).toBe(true);
  const kept = truncated.slice(0, -TRUNCATION_SUFFIX.length);
  expect(kept.length).toBeGreaterThan(0);
  // Every kept character must be from the original content
  expect(kept).toBe(originalChar.repeat(kept.length));
}

describe('serializeMessages', () => {
  it('returns JSON unchanged when within limit', () => {
    const messages: ChatMessage[] = [
      { role: MessageRole.USER, parts: [{ type: 'text', content: 'hello' }] },
    ];
    expect(serializeMessages(messages)).toBe(JSON.stringify(messages));
    expect(serializeMessages([])).toBe('[]');
  });

  it('preserves all messages and only truncates content of the largest', () => {
    const messages: ChatMessage[] = [
      { role: MessageRole.USER, parts: [{ type: 'text', content: 'short message' }] },
      { role: MessageRole.ASSISTANT, parts: [{ type: 'text', content: 'x'.repeat(MAX_ATTRIBUTE_LENGTH) }] },
    ];

    const result = serializeMessages(messages);
    expect(result.length).toBeLessThanOrEqual(MAX_ATTRIBUTE_LENGTH);

    const parsed = JSON.parse(result);
    expect(parsed.length).toBe(2);
    expect(parsed[0].parts[0].content).toBe('short message');
    expectTruncated(parsed[1].parts[0].content, 'x');
    expect(result.length).toBe(MAX_ATTRIBUTE_LENGTH);
  });


  it('handles escape-heavy text content and still returns valid JSON', () => {
    const escapeHeavyContent = '\\"\n\t'.repeat(5000);
    const messages: ChatMessage[] = [
      { role: MessageRole.USER, parts: [{ type: 'text', content: escapeHeavyContent }] },
    ];

    expect(JSON.stringify(messages).length).toBeGreaterThan(MAX_ATTRIBUTE_LENGTH);

    const result = serializeMessages(messages);
    expect(result.length).toBeLessThanOrEqual(MAX_ATTRIBUTE_LENGTH);

    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].parts[0].content).toContain('...[truncated]');
  });

  it('returns a valid sentinel-only array when non-text payload cannot be shrunk', () => {
    const hugePayload = 'x'.repeat(MAX_ATTRIBUTE_LENGTH + 1000);
    const messages: ChatMessage[] = [
      {
        role: MessageRole.USER,
        parts: [{ type: 'custom_payload', payload: hugePayload }],
      },
    ];

    expect(JSON.stringify(messages).length).toBeGreaterThan(MAX_ATTRIBUTE_LENGTH);

    const result = serializeMessages(messages);
    expect(result.length).toBeLessThanOrEqual(MAX_ATTRIBUTE_LENGTH);

    const parsed = JSON.parse(result);
    expect(parsed).toEqual([
      {
        role: 'system',
        parts: [{
          type: 'text',
          content: '[truncated: 1 message exceeded limit]',
        }],
      },
    ]);
  });

  it('handles boundary: exactly at MAX_ATTRIBUTE_LENGTH', () => {
    const wrapper: ChatMessage = { role: MessageRole.USER, parts: [{ type: 'text', content: '' }] };
    const overhead = JSON.stringify([wrapper]).length;
    const contentLength = MAX_ATTRIBUTE_LENGTH - overhead;
    const message: ChatMessage = { role: MessageRole.USER, parts: [{ type: 'text', content: 'a'.repeat(contentLength) }] };

    const json = JSON.stringify([message]);
    expect(json.length).toBe(MAX_ATTRIBUTE_LENGTH);

    const result = serializeMessages([message]);
    expect(result).toBe(json);
  });

  it('truncates across two messages when the first alone still exceeds', () => {
    // Both messages are large enough that truncating only the first is not sufficient
    const messages: ChatMessage[] = [
      { role: MessageRole.USER, parts: [{ type: 'text', content: 'A'.repeat(MAX_ATTRIBUTE_LENGTH) }] },
      { role: MessageRole.ASSISTANT, parts: [{ type: 'text', content: 'B'.repeat(MAX_ATTRIBUTE_LENGTH) }] },
    ];

    expect(JSON.stringify(messages).length).toBeGreaterThan(MAX_ATTRIBUTE_LENGTH);

    const result = serializeMessages(messages);
    expect(result.length).toBeLessThanOrEqual(MAX_ATTRIBUTE_LENGTH);

    // Both messages preserved, valid JSON
    const parsed = JSON.parse(result);
    expect(parsed.length).toBe(2);

    // First message: maximally shrunk to just the suffix
    expect(parsed[0].parts[0].content).toBe(TRUNCATION_SUFFIX);
    expect(parsed[0].role).toBe('user');

    // Second message: truncated but retains some original content
    expectTruncated(parsed[1].parts[0].content, 'B');
    expect(parsed[1].role).toBe('assistant');
    // Binary search maximizes kept content — result should fill the budget
    expect(result.length).toBe(MAX_ATTRIBUTE_LENGTH);
  });

  it('does not mutate the original messages', () => {
    const original = 'z'.repeat(MAX_ATTRIBUTE_LENGTH);
    const messages: ChatMessage[] = [
      { role: MessageRole.USER, parts: [{ type: 'text', content: original }] },
    ];

    serializeMessages(messages);

    expect((messages[0].parts[0] as { content: string }).content).toBe(original);
  });

  it('replaces blob content with sentinel and preserves other fields', () => {
    const messages: ChatMessage[] = [
      { role: MessageRole.USER, parts: [{ type: 'blob', modality: 'image', mime_type: 'image/png', content: 'x'.repeat(MAX_ATTRIBUTE_LENGTH) }] },
      { role: MessageRole.ASSISTANT, parts: [{ type: 'text', content: 'keep me intact' }] },
    ];

    const result = serializeMessages(messages);
    expect(result.length).toBeLessThanOrEqual(MAX_ATTRIBUTE_LENGTH);

    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(2);
    // Blob: content replaced, metadata preserved
    expect(parsed[0].parts[0].type).toBe('blob');
    expect(parsed[0].parts[0].modality).toBe('image');
    expect(parsed[0].parts[0].mime_type).toBe('image/png');
    expect(parsed[0].parts[0].content).toBe('[blob omitted]');
    // Text: fully preserved
    expect(parsed[1].parts[0].content).toBe('keep me intact');
  });

  it('replaces tool_call arguments with sentinel and preserves name and id', () => {
    const bigArgs = { data: 'a'.repeat(MAX_ATTRIBUTE_LENGTH) };
    const messages: ChatMessage[] = [
      { role: MessageRole.ASSISTANT, parts: [{ type: 'tool_call', name: 'search', id: 'call_123', arguments: bigArgs }] },
    ];

    const result = serializeMessages(messages);
    expect(result.length).toBeLessThanOrEqual(MAX_ATTRIBUTE_LENGTH);

    const parsed = JSON.parse(result);
    expect(parsed[0].parts[0].type).toBe('tool_call');
    expect(parsed[0].parts[0].name).toBe('search');
    expect(parsed[0].parts[0].id).toBe('call_123');
    expect(parsed[0].parts[0].arguments).toBe('[truncated]');
  });

  it('replaces tool_call_response response with sentinel and preserves id', () => {
    const bigResponse = { result: 'r'.repeat(MAX_ATTRIBUTE_LENGTH) };
    const messages: ChatMessage[] = [
      { role: MessageRole.TOOL, parts: [{ type: 'tool_call_response', id: 'call_456', response: bigResponse }] },
    ];

    const result = serializeMessages(messages);
    expect(result.length).toBeLessThanOrEqual(MAX_ATTRIBUTE_LENGTH);

    const parsed = JSON.parse(result);
    expect(parsed[0].parts[0].type).toBe('tool_call_response');
    expect(parsed[0].parts[0].id).toBe('call_456');
    expect(parsed[0].parts[0].response).toBe('[truncated]');
  });

  it('replaces server_tool_call payload with sentinel and preserves name and id', () => {
    const bigPayload = { type: 'code_interpreter', data: 'd'.repeat(MAX_ATTRIBUTE_LENGTH) };
    const messages: ChatMessage[] = [
      { role: MessageRole.ASSISTANT, parts: [{ type: 'server_tool_call', name: 'code_interpreter', id: 'stc_1', server_tool_call: bigPayload }] },
    ];

    const result = serializeMessages(messages);
    expect(result.length).toBeLessThanOrEqual(MAX_ATTRIBUTE_LENGTH);

    const parsed = JSON.parse(result);
    expect(parsed[0].parts[0].type).toBe('server_tool_call');
    expect(parsed[0].parts[0].name).toBe('code_interpreter');
    expect(parsed[0].parts[0].id).toBe('stc_1');
    expect(parsed[0].parts[0].server_tool_call).toBe('[truncated]');
  });

  it('replaces server_tool_call_response payload with sentinel and preserves id', () => {
    const bigPayload = { type: 'code_interpreter', output: 'o'.repeat(MAX_ATTRIBUTE_LENGTH) };
    const messages: ChatMessage[] = [
      { role: MessageRole.ASSISTANT, parts: [{ type: 'server_tool_call_response', id: 'stc_1', server_tool_call_response: bigPayload }] },
    ];

    const result = serializeMessages(messages);
    expect(result.length).toBeLessThanOrEqual(MAX_ATTRIBUTE_LENGTH);

    const parsed = JSON.parse(result);
    expect(parsed[0].parts[0].type).toBe('server_tool_call_response');
    expect(parsed[0].parts[0].id).toBe('stc_1');
    expect(parsed[0].parts[0].server_tool_call_response).toBe('[truncated]');
  });

  it('truncates reasoning content with binary search and preserves prefix', () => {
    const messages: ChatMessage[] = [
      { role: MessageRole.ASSISTANT, parts: [{ type: 'reasoning', content: 'R'.repeat(MAX_ATTRIBUTE_LENGTH) }] },
    ];

    const result = serializeMessages(messages);
    expect(result.length).toBeLessThanOrEqual(MAX_ATTRIBUTE_LENGTH);

    const parsed = JSON.parse(result);
    expect(parsed[0].parts[0].type).toBe('reasoning');
    expect(parsed[0].role).toBe('assistant');
    expectTruncated(parsed[0].parts[0].content, 'R');
    // Binary search maximizes budget usage
    expect(result.length).toBe(MAX_ATTRIBUTE_LENGTH);
  });

  it('truncates mixed parts: JSON sentinel fires before text truncation per priority order', () => {
    const messages: ChatMessage[] = [
      {
        role: MessageRole.ASSISTANT,
        parts: [
          { type: 'text', content: 'T'.repeat(MAX_ATTRIBUTE_LENGTH) },
          { type: 'tool_call', name: 'get_weather', id: 'tc_1', arguments: { location: 'Seattle' } },
        ],
      },
    ];

    const result = serializeMessages(messages);
    expect(result.length).toBeLessThanOrEqual(MAX_ATTRIBUTE_LENGTH);

    const parsed = JSON.parse(result);
    expect(parsed[0].role).toBe('assistant');
    // Text truncated with binary search
    expectTruncated(parsed[0].parts[0].content, 'T');
    // tool_call: JSON sentinel applied (priority 1 < text priority 3), metadata preserved
    expect(parsed[0].parts[1].type).toBe('tool_call');
    expect(parsed[0].parts[1].name).toBe('get_weather');
    expect(parsed[0].parts[1].id).toBe('tc_1');
    expect(parsed[0].parts[1].arguments).toBe('[truncated]');
  });

  it('truncates blob before reasoning before text (priority order)', () => {
    // All three parts are large; blob should be sentinel-ized first,
    // then reasoning truncated, then text last (most valuable).
    const size = Math.floor(MAX_ATTRIBUTE_LENGTH / 2);
    const messages: ChatMessage[] = [
      {
        role: MessageRole.USER,
        parts: [
          { type: 'text', content: 'T'.repeat(size) },
          { type: 'reasoning', content: 'R'.repeat(size) },
          { type: 'blob', modality: 'image', content: 'B'.repeat(size) },
        ],
      },
    ];

    const result = serializeMessages(messages);
    expect(result.length).toBeLessThanOrEqual(MAX_ATTRIBUTE_LENGTH);

    const parsed = JSON.parse(result);
    const parts = parsed[0].parts;
    // Blob replaced with sentinel first (priority 0)
    expect(parts[2].content).toBe('[blob omitted]');
    // Text is most valuable (priority 3) — should retain the most content
    const textKept = parts[0].content.replace('...[truncated]', '').length;
    const reasoningContent: string = parts[1].content;
    // If reasoning was also truncated, text should have kept at least as much
    if (reasoningContent.includes('...[truncated]')) {
      const reasoningKept = reasoningContent.replace('...[truncated]', '').length;
      expect(textKept).toBeGreaterThanOrEqual(reasoningKept);
    }
  });
});
