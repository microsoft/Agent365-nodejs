// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
  ChatMessage,
  OutputMessage,
  MessageRole,
  InputMessages,
  OutputMessages,
  InputMessagesParam,
  OutputMessagesParam,
  DEFAULT_FINISH_REASON
} from './contracts';

/**
 * Type guard that returns `true` when the input is a structured wrapper
 * object (`InputMessages` or `OutputMessages`).
 */
export function isWrappedMessages(input: InputMessagesParam | OutputMessagesParam): input is InputMessages | OutputMessages {
  return !Array.isArray(input) && typeof input === 'object' && input !== null && 'messages' in input && Array.isArray((input as InputMessages).messages);
}

/**
 * Converts plain input strings into OTEL input messages.
 */
export function toInputMessages(messages: string[]): ChatMessage[] {
  return messages.map((content) => ({
    role: MessageRole.USER,
    parts: [{ type: 'text' as const, content }]
  }));
}

/**
 * Converts plain output strings into OTEL output messages.
 * `finish_reason` defaults to `"stop"` per OTel spec.
 */
export function toOutputMessages(messages: string[]): OutputMessage[] {
  return messages.map((content) => ({
    role: MessageRole.ASSISTANT,
    parts: [{ type: 'text' as const, content }],
    finish_reason: DEFAULT_FINISH_REASON
  }));
}

/**
 * Normalizes an `InputMessagesParam` to an `InputMessages` instance.
 * - `string` / `string[]` → converted to `ChatMessage[]` and wrapped
 * - `InputMessages` → returned as-is
 */
export function normalizeInputMessages(param: InputMessagesParam): InputMessages {
  if (typeof param === 'string' || Array.isArray(param)) {
    const arr = typeof param === 'string' ? [param] : param;
    return { messages: toInputMessages(arr) };
  }
  return param;
}

/**
 * Normalizes an `OutputMessagesParam` to an `OutputMessages` instance.
 * - `string` / `string[]` → converted to `OutputMessage[]` and wrapped
 * - `OutputMessages` → returned as-is
 */
export function normalizeOutputMessages(param: OutputMessagesParam): OutputMessages {
  if (typeof param === 'string' || Array.isArray(param)) {
    const arr = typeof param === 'string' ? [param] : param;
    return { messages: toOutputMessages(arr) };
  }
  return param;
}

/**
 * Serializes a message wrapper to JSON.
 *
 * The output is a plain JSON array per OTel gen-ai semantic conventions: `[{...}, ...]`.
 *
 * The try/catch ensures telemetry recording is non-throwing even when
 * message parts contain non-JSON-serializable values (e.g. BigInt, circular refs).
 */
export function serializeMessages(wrapper: InputMessages | OutputMessages): string {
  try {
    return JSON.stringify(wrapper.messages);
  } catch {
    return JSON.stringify([
      {
        role: MessageRole.SYSTEM,
        parts: [
          {
            type: 'text',
            content: `[serialization failed: ${wrapper.messages.length} ${wrapper.messages.length === 1 ? 'message' : 'messages'}]`
          }
        ]
      }
    ]);
  }
}
