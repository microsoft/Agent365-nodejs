// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from '@jest/globals';
import { truncateValue, MAX_ATTRIBUTE_LENGTH } from '../../../packages/agents-a365-observability/src/tracing/util';

describe('truncateValue', () => {
  const SUFFIX = '...[truncated]';

  it('should return the original string when within limit', () => {
    const value = 'hello world';
    expect(truncateValue(value)).toBe(value);
  });

  it('should return the original string when exactly at limit', () => {
    const value = 'x'.repeat(MAX_ATTRIBUTE_LENGTH);
    expect(truncateValue(value)).toBe(value);
    expect(truncateValue(value).length).toBe(MAX_ATTRIBUTE_LENGTH);
  });

  it('should truncate when 1 character over limit', () => {
    const value = 'x'.repeat(MAX_ATTRIBUTE_LENGTH + 1);
    const result = truncateValue(value);
    expect(result.length).toBe(MAX_ATTRIBUTE_LENGTH);
    expect(result.endsWith(SUFFIX)).toBe(true);
  });

  it('should truncate long strings to exactly MAX_ATTRIBUTE_LENGTH', () => {
    const value = 'a'.repeat(MAX_ATTRIBUTE_LENGTH * 2);
    const result = truncateValue(value);
    expect(result.length).toBe(MAX_ATTRIBUTE_LENGTH);
    expect(result.endsWith(SUFFIX)).toBe(true);
  });

  it('should preserve the beginning of the string when truncating', () => {
    const prefix = 'PREFIX_';
    const value = prefix + 'x'.repeat(MAX_ATTRIBUTE_LENGTH);
    const result = truncateValue(value);
    expect(result.startsWith(prefix)).toBe(true);
  });

  it('should return empty string unchanged', () => {
    expect(truncateValue('')).toBe('');
  });
});

describe('MAX_ATTRIBUTE_LENGTH', () => {
  it('should be 8192', () => {
    expect(MAX_ATTRIBUTE_LENGTH).toBe(8_192);
  });
});
