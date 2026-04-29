// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { expect } from "@jest/globals";
import { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { OpenTelemetryConstants } from "@microsoft/agents-a365-observability";
import {
  expectValidInputMessages,
  expectValidOutputMessages,
} from "../../extension/helpers/message-schema-validator";

/**
 * Validate instrumentation scope for a span
 */
export function validateInstrumentationScope(
  span: ReadableSpan,
  expectedName: string,
  expectedVersion: string,
): void {
  expect(span.instrumentationScope).toBeDefined();
  expect(span.instrumentationScope.name).toBe(expectedName);
  expect(span.instrumentationScope.version).toBe(expectedVersion);
}

/**
 * Validate basic span properties (traceId, id, timestamp)
 */
export function validateSpanProperties(span: ReadableSpan): void {
  expect((span as any).traceId).toBeDefined();
  expect((span as any).id).toBeDefined();
  expect((span as any).timestamp).toBeDefined();
}

/**
 * Validate parent-child span relationship via CUSTOM_PARENT_SPAN_ID_KEY
 */
export function validateParentChildRelationship(
  childSpan: ReadableSpan,
  parentSpan: ReadableSpan,
): void {
  expect(
    childSpan.attributes[OpenTelemetryConstants.CUSTOM_PARENT_SPAN_ID_KEY],
  ).toBe(`0x${(parentSpan as any).id}`);
}

/**
 * Validate A365 message schema on a span's input/output messages.
 * Calls expectValidInputMessages/expectValidOutputMessages from the shared
 * message-schema-validator, which check version "0.1.0", roles, and parts.
 */
export function validateMessageSchema(span: ReadableSpan): void {
  const inputMessages =
    span.attributes[OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY];
  if (inputMessages !== undefined) {
    expectValidInputMessages(inputMessages);
  }

  const outputMessages =
    span.attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY];
  if (outputMessages !== undefined) {
    expectValidOutputMessages(outputMessages);
  }
}

/**
 * Validate input message content structure
 */
export function validateInputMessageContent(
  span: ReadableSpan,
  expectations: {
    hasRole?: string;
    hasPartType?: string;
    containsText?: string;
  },
): void {
  const raw =
    span.attributes[OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY] as string;
  expect(raw).toBeDefined();
  const parsed = JSON.parse(raw);
  expect(parsed.version).toBe("0.1.0");
  expect(parsed.messages.length).toBeGreaterThan(0);

  if (expectations.hasRole) {
    expect(
      parsed.messages.some((m: any) => m.role === expectations.hasRole),
    ).toBe(true);
  }
  if (expectations.hasPartType) {
    expect(
      parsed.messages.some((m: any) =>
        m.parts?.some((p: any) => p.type === expectations.hasPartType),
      ),
    ).toBe(true);
  }
  if (expectations.containsText) {
    const allText = JSON.stringify(parsed);
    expect(allText).toContain(expectations.containsText);
  }
}

/**
 * Validate output message content structure
 */
export function validateOutputMessageContent(
  span: ReadableSpan,
  expectations: {
    hasRole?: string;
    hasPartType?: string;
  },
): void {
  const raw =
    span.attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY] as string;
  expect(raw).toBeDefined();
  const parsed = JSON.parse(raw);
  expect(parsed.version).toBe("0.1.0");
  expect(parsed.messages.length).toBeGreaterThan(0);

  if (expectations.hasRole) {
    expect(
      parsed.messages.some((m: any) => m.role === expectations.hasRole),
    ).toBe(true);
  }
  if (expectations.hasPartType) {
    expect(
      parsed.messages.some((m: any) =>
        m.parts?.some((p: any) => p.type === expectations.hasPartType),
      ),
    ).toBe(true);
  }
}

/**
 * Wait for spans to accumulate with a polling timeout
 */
export async function waitForSpans(
  spans: ReadableSpan[],
  minCount: number,
  timeoutMs: number = 5000,
): Promise<void> {
  const startTime = Date.now();
  while (spans.length < minCount && Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
