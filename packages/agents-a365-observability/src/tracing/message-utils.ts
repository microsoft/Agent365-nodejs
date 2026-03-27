// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
  ChatMessage,
  OutputMessage,
  MessageRole,
  InputMessages,
  OutputMessages
} from './contracts';
import { MAX_ATTRIBUTE_LENGTH, truncateValue } from './util';

/**
 * Type guard that returns `true` when the array contains plain strings
 * rather than structured OTEL message objects.
 * Note: empty arrays are treated as string[] (both paths produce the same `[]` result).
 */
export function isStringArray(arr: InputMessages | OutputMessages): arr is string[] {
  return arr.length === 0 || typeof arr[0] === 'string';
}

/**
 * Converts an array of plain strings into OTEL {@link ChatMessage} objects
 * with role `user` and a single `TextPart`.
 */
export function toInputMessages(messages: string[]): ChatMessage[] {
  return messages.map((content) => ({
    role: MessageRole.USER,
    parts: [{ type: 'text' as const, content }]
  }));
}

/**
 * Converts an array of plain strings into OTEL {@link OutputMessage} objects
 * with role `assistant` and a single `TextPart`.
 */
export function toOutputMessages(messages: string[]): OutputMessage[] {
  return messages.map((content) => ({
    role: MessageRole.ASSISTANT,
    parts: [{ type: 'text' as const, content }]
  }));
}

/**
 * Serializes a message array to JSON, truncating trailing messages
 * with a sentinel when the result exceeds {@link MAX_ATTRIBUTE_LENGTH}.
 */
export function serializeMessages<T extends ChatMessage | OutputMessage>(messages: T[]): string {
  const json = JSON.stringify(messages);
  if (json.length <= MAX_ATTRIBUTE_LENGTH) {
    return json;
  }

  const total = messages.length;
  const serialized = messages.map((m) => JSON.stringify(m));

  // Precompute prefix sums so we can get the length of any slice in O(1).
  const prefixLen = new Array<number>(total + 1);
  prefixLen[0] = 0;
  for (let i = 0; i < total; i++) {
    prefixLen[i + 1] = prefixLen[i] + serialized[i].length + 1; // +1 for comma
  }

  // Precompute sentinel lengths for each possible drop count.
  // The sentinel text varies with digit width, so cache per-count.
  const sentinelLenCache = new Array<number>(total);
  for (let dropped = 1; dropped < total; dropped++) {
    sentinelLenCache[dropped] = buildSentinel(dropped, total).length;
  }

  // Binary search for the max count in [1, total-1] that fits.
  let lo = 1;
  let hi = total - 1;
  let bestCount = 0;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    // Array: '[' + count items with commas + sentinel + ']'
    const len = 2 + prefixLen[mid] + sentinelLenCache[total - mid];
    if (len <= MAX_ATTRIBUTE_LENGTH) {
      bestCount = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (bestCount > 0) {
    const sentinel = buildSentinel(total - bestCount, total);
    return '[' + serialized.slice(0, bestCount).join(',') + ',' + sentinel + ']';
  }

  return truncateValue('[' + serialized[0] + ']');
}

function buildSentinel(dropped: number, total: number): string {
  return JSON.stringify({ role: MessageRole.SYSTEM, parts: [{ type: 'text' as const, content: `[truncated: ${dropped} of ${total} messages omitted]` }] });
}
