// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
  ChatMessage,
  OutputMessage,
  MessageRole,
  InputMessages,
  OutputMessages
} from './contracts';

/**
 * Type guard that returns `true` when the array contains plain strings
 * rather than structured OTEL message objects.
 *
 * Empty arrays are treated as `string[]`. This is safe because both conversion
 * paths (`toInputMessages([])` and passthrough `[]`) produce an empty array.
 */
export function isStringArray(arr: InputMessages | OutputMessages): arr is string[] {
  return arr.length === 0 || typeof arr[0] === 'string';
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
 */
export function toOutputMessages(messages: string[]): OutputMessage[] {
  return messages.map((content) => ({
    role: MessageRole.ASSISTANT,
    parts: [{ type: 'text' as const, content }]
  }));
}

/**
 * Serializes a message array to JSON.
 *
 * Attribute-level truncation is intentionally not performed here.
 * Span-level size enforcement (MAX_SPAN_SIZE_BYTES) is handled at export
 * time by the Agent365 exporter, matching the Python SDK approach.
 *
 * The try/catch ensures telemetry recording is non-throwing even when
 * message parts contain non-JSON-serializable values (e.g. BigInt, circular refs).
 */
export function serializeMessages<T extends ChatMessage | OutputMessage>(messages: T[]): string {
  try {
    return JSON.stringify(messages);
  } catch {
    return JSON.stringify([
      {
        role: MessageRole.SYSTEM,
        parts: [
          {
            type: 'text',
            content: `[serialization failed: ${messages.length} ${messages.length === 1 ? 'message' : 'messages'}]`
          }
        ]
      }
    ]);
  }
}
