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
  A365_MESSAGE_SCHEMA_VERSION
} from './contracts';

/**
 * Type guard that returns `true` when the input is a plain `string[]`
 * rather than a versioned wrapper object.
 */
export function isStringArray(input: InputMessagesParam | OutputMessagesParam): input is string[] {
  return Array.isArray(input);
}

/**
 * Type guard that returns `true` when the input is a versioned wrapper
 * object (`InputMessages` or `OutputMessages`).
 */
export function isWrappedMessages(input: InputMessagesParam | OutputMessagesParam): input is InputMessages | OutputMessages {
  return !Array.isArray(input) && typeof input === 'object' && input !== null && 'version' in input && 'messages' in input;
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
 * Normalizes an `InputMessagesParam` to a versioned `InputMessages` wrapper.
 * - `string[]` → converted to `ChatMessage[]` and wrapped
 * - `InputMessages` → returned as-is
 */
export function normalizeInputMessages(param: InputMessagesParam): InputMessages {
  if (isStringArray(param)) {
    return { version: A365_MESSAGE_SCHEMA_VERSION, messages: toInputMessages(param) };
  }
  return param;
}

/**
 * Normalizes an `OutputMessagesParam` to a versioned `OutputMessages` wrapper.
 * - `string[]` → converted to `OutputMessage[]` and wrapped
 * - `OutputMessages` → returned as-is
 */
export function normalizeOutputMessages(param: OutputMessagesParam): OutputMessages {
  if (isStringArray(param)) {
    return { version: A365_MESSAGE_SCHEMA_VERSION, messages: toOutputMessages(param) };
  }
  return param;
}

/**
 * Serializes a versioned message wrapper to JSON.
 *
 * The output is the full wrapper object: `{"version":"0.1.0","messages":[...]}`.
 *
 * The try/catch ensures telemetry recording is non-throwing even when
 * message parts contain non-JSON-serializable values (e.g. BigInt, circular refs).
 */
export function serializeMessages(wrapper: InputMessages | OutputMessages): string {
  try {
    return JSON.stringify(wrapper);
  } catch {
    return JSON.stringify({
      version: A365_MESSAGE_SCHEMA_VERSION,
      messages: [
        {
          role: MessageRole.SYSTEM,
          parts: [
            {
              type: 'text',
              content: `[serialization failed: ${wrapper.messages.length} ${wrapper.messages.length === 1 ? 'message' : 'messages'}]`
            }
          ]
        }
      ]
    });
  }
}
