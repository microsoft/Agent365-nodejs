// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

function validateMessageEnvelope(value: unknown): Record<string, unknown> {
  // Attributes are stored as JSON strings; parse and validate the common envelope.
  expect(typeof value).toBe('string');
  const parsed = JSON.parse(value as string);
  expect(parsed).toHaveProperty('version', '0.1.0');
  expect(parsed.messages).toEqual(expect.arrayContaining([expect.anything()]));
  return parsed;
}

function validateMessagePart(part: Record<string, unknown>): void {
  // Validate required fields and type-specific shape for each message part.
  expect(typeof part.type).toBe('string');
  expect((part.type as string).length).toBeGreaterThan(0);

  const type = part.type as string;
  if (type === 'text' || type === 'reasoning') {
    expect(typeof part.content).toBe('string');
  } else if (type === 'tool_call') {
    expect(typeof part.name).toBe('string');
    if (part.id !== undefined) expect(typeof part.id).toBe('string');
  } else if (type === 'tool_call_response') {
    if (part.id !== undefined) expect(typeof part.id).toBe('string');
  } else if (type === 'blob' || type === 'file' || type === 'uri') {
    expect(part).toHaveProperty('modality');
  }
}

export function expectValidInputMessages(value: unknown): void {
  // Input messages must have a role and at least one valid part.
  const parsed = validateMessageEnvelope(value);
  for (const msg of parsed.messages as Array<Record<string, unknown>>) {
    expect(typeof msg.role).toBe('string');
    const parts = msg.parts as Array<Record<string, unknown>>;
    expect(parts.length).toBeGreaterThan(0);
    parts.forEach(validateMessagePart);
  }
}

export function expectValidOutputMessages(value: unknown): void {
  // Output messages follow the same structure, with optional finish_reason.
  const parsed = validateMessageEnvelope(value);
  for (const msg of parsed.messages as Array<Record<string, unknown>>) {
    expect(typeof msg.role).toBe('string');
    const parts = msg.parts as Array<Record<string, unknown>>;
    expect(parts.length).toBeGreaterThan(0);
    parts.forEach(validateMessagePart);
    if (msg.finish_reason !== undefined) {
      expect(typeof msg.finish_reason).toBe('string');
    }
  }
}

export function getSpanAttribute(mockSpan: { setAttribute: jest.Mock }, key: string): unknown {
  // Helper to read a specific attribute from a mocked span.
  const match = mockSpan.setAttribute.mock.calls.find(([k]: [string, unknown]) => k === key);
  return match ? match[1] : undefined;
}

export function getAttrFromArray(attrs: Array<[string, unknown]>, key: string): unknown {
  // Helper to read a key from an array of [key, value] tuples.
  const entry = attrs.find(([k]) => k === key);
  return entry ? entry[1] : undefined;
}
