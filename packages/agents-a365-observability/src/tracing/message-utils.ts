// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
  ChatMessage,
  OutputMessage,
  MessageRole,
  InputMessages,
  OutputMessages
} from './contracts';
import { MAX_ATTRIBUTE_LENGTH } from './util';

/**
 * Type guard that returns `true` when the array contains plain strings
 * rather than structured OTEL message objects.
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

const TRUNCATION_SUFFIX = '...[truncated]';
const BLOB_SENTINEL = '[blob omitted]';
const JSON_SENTINEL = '[truncated]';

const PRIORITY_BLOB = 0;
const PRIORITY_JSON = 1;
const PRIORITY_REASONING = 2;
const PRIORITY_TEXT = 3;

type ShrinkAction = {
  priority: number;
  size: number;
  apply(messages: ChatMessage[], currentJson: string): string;
};

function collectShrinkActions(messages: ChatMessage[]): ShrinkAction[] {
  const actions: ShrinkAction[] = [];

  for (const message of messages) {
    for (const part of message.parts) {
      const record = part as Record<string, unknown>;
      // ---------------------------------------------------------
      // Case 1: text / reasoning
      // ---------------------------------------------------------
      // These are string fields where partial content is still useful.
      // So for these, our shrink strategy is:
      // keep as much prefix as possible + add "...[truncated]"
      if ((part.type === 'text' || part.type === 'reasoning') && typeof record.content === 'string') {
        const originalContent = record.content;
        // Reasoning is considered less important than regular text,
        // so reasoning gets shrunk earlier.
        const priority = part.type === 'reasoning' ? PRIORITY_REASONING : PRIORITY_TEXT;

        actions.push({
          priority,
          size: originalContent.length,
          apply(clonedMessages, currentJson) {
            const excess = currentJson.length - MAX_ATTRIBUTE_LENGTH;
            if (excess <= 0) {
              return currentJson;
            }

            if (originalContent.length <= TRUNCATION_SUFFIX.length) {
              return currentJson;
            }

            const estimatedKeep = Math.max(0, originalContent.length - excess - TRUNCATION_SUFFIX.length);
            let low = 0;
            let high = Math.min(originalContent.length - TRUNCATION_SUFFIX.length, estimatedKeep + excess);
            let bestJson = currentJson;

            // We want the LONGEST prefix that still keeps the WHOLE serialized payload <= max.
            while (low <= high) {
              const mid = (low + high) >>> 1;
              record.content = originalContent.substring(0, mid) + TRUNCATION_SUFFIX;

              const candidate = JSON.stringify(clonedMessages);
              if (candidate.length <= MAX_ATTRIBUTE_LENGTH) {
                bestJson = candidate;
                low = mid + 1;
              } else {
                high = mid - 1;
              }
            }

            // If binary search found a valid candidate, use it.
            if (bestJson.length <= MAX_ATTRIBUTE_LENGTH) {
              return bestJson;
            }

            // Last fallback for this field: replace the content with only the suffix.
            record.content = TRUNCATION_SUFFIX;
            return JSON.stringify(clonedMessages);
          }
        });

        continue;
      }

      // ---------------------------------------------------------
      // Case 2: blob
      // ---------------------------------------------------------
      // Blob content is usually base64 or other large binary-like text.
      // Partial blob content is generally not useful.
      // So our shrink strategy is all-or-nothing:
      // replace the whole blob content with a sentinel string.
      if (part.type === 'blob' && typeof record.content === 'string') {
        actions.push({
          priority: PRIORITY_BLOB,
          size: record.content.length,
          apply(clonedMessages) {
            record.content = BLOB_SENTINEL;
            return JSON.stringify(clonedMessages);
          }
        });

        continue;
      }

      // ---------------------------------------------------------
      // Case 3: tool/server JSON payload fields
      // ---------------------------------------------------------
      // These parts may contain big structured objects such as:
      // - tool_call.arguments
      // - tool_call_response.response
      // - server_tool_call.server_tool_call
      // - server_tool_call_response.server_tool_call_response
      //
      // Partial JSON/object truncation is awkward and often invalid,
      // so our strategy is:
      // replace the entire field with a sentinel string.
      const jsonField =
        part.type === 'tool_call'
          ? 'arguments'
          : part.type === 'tool_call_response'
            ? 'response'
            : part.type === 'server_tool_call'
              ? 'server_tool_call'
              : part.type === 'server_tool_call_response'
                ? 'server_tool_call_response'
                : undefined;

      if (jsonField && record[jsonField] !== undefined) {
        actions.push({
          priority: PRIORITY_JSON,
          size: JSON.stringify(record[jsonField] ?? {}).length,
          apply(clonedMessages) {
            record[jsonField] = JSON_SENTINEL;
            return JSON.stringify(clonedMessages);
          }
        });
      }
    }
  }

  // Sort actions so we try the least valuable reductions first.
  // 1. lower priority first
  // 2. if same priority, bigger field first
  actions.sort((a, b) => a.priority - b.priority || b.size - a.size);
  return actions;
}

/**
 * Serializes a message array to JSON and ensures the whole serialized payload
 * fits within MAX_ATTRIBUTE_LENGTH.
 *
 * Truncation order:
 * 1. blob content -> sentinel
 * 2. tool/server JSON payloads -> sentinel
 * 3. reasoning content -> trim
 * 4. text content -> trim
 */
export function serializeMessages<T extends ChatMessage | OutputMessage>(messages: T[]): string {
  const json = JSON.stringify(messages);
  if (json.length <= MAX_ATTRIBUTE_LENGTH) {
    return json;
  }

  // Deep clone so the caller's input is not mutated.
  const cloned: ChatMessage[] = JSON.parse(json);
  // Actions capture direct references into the `cloned` array and must
  // operate on the same object graph so mutations are reflected in re-serialization.
  const actions = collectShrinkActions(cloned);

  let currentJson = json;

  for (const action of actions) {
    currentJson = action.apply(cloned, currentJson);
    if (currentJson.length <= MAX_ATTRIBUTE_LENGTH) {
      return currentJson;
    }
  }

  return serializeOverflowSentinel(messages.length);
}

function serializeOverflowSentinel(totalMessages: number): string {
  return JSON.stringify([
    {
      role: MessageRole.SYSTEM,
      parts: [
        {
          type: 'text',
          content: `[truncated: ${totalMessages} ${totalMessages === 1 ? 'message' : 'messages'} exceeded limit]`
        }
      ]
    }
  ]);
}
