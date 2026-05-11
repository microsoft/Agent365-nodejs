// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { describe, it, expect } from '@jest/globals';
import {
  estimateSpanBytes,
  estimateValueBytes,
  chunkBySize,
  truncateSpan,
} from '@microsoft/agents-a365-observability/src/tracing/exporter/utils';

function makeOTLPSpan(attrs: Record<string, unknown>, name = 'test') {
  return {
    traceId: '00000000000000000000000000000001',
    spanId: '0000000000000002',
    name,
    kind: 'INTERNAL',
    startTimeUnixNano: 1000000000,
    endTimeUnixNano: 2000000000,
    attributes: attrs,
    events: null,
    links: null,
    status: { code: 'UNSET', message: '' },
  };
}

// ---------------------------------------------------------------------------
// estimateSpanBytes
// ---------------------------------------------------------------------------

describe('estimateSpanBytes', () => {
  it('over-estimates relative to actual JSON size', () => {
    const span = makeOTLPSpan({
      'gen_ai.system': 'openai',
      'gen_ai.tool.arguments': 'x'.repeat(1000),
      'gen_ai.tool.call_result': 'y'.repeat(1000),
    });
    const actual = Buffer.byteLength(JSON.stringify(span), 'utf8');
    expect(estimateSpanBytes(span)).toBeGreaterThanOrEqual(actual);
  });

  it('grows with attribute content', () => {
    const small = makeOTLPSpan({ key: 'val' });
    const large = makeOTLPSpan({ key: 'x'.repeat(10000) });
    expect(estimateSpanBytes(large)).toBeGreaterThan(estimateSpanBytes(small));
  });

  it('accounts for events', () => {
    const withEvents = { ...makeOTLPSpan({}), events: [{ name: 'ev', attributes: { k: 'v' } }] };
    expect(estimateSpanBytes(withEvents)).toBeGreaterThan(estimateSpanBytes(makeOTLPSpan({})));
  });
});

// ---------------------------------------------------------------------------
// estimateValueBytes
// ---------------------------------------------------------------------------

describe('estimateValueBytes', () => {
  it('handles all value types', () => {
    expect(estimateValueBytes('hello')).toBe(40 + 5);
    expect(estimateValueBytes([])).toBe(60);
    expect(estimateValueBytes(['a', 'bb'])).toBe(60 + (40 + 1) + (40 + 2));
    expect(estimateValueBytes([1, 2])).toBe(60 + 50 * 2);
    expect(estimateValueBytes(true)).toBe(40);
    expect(estimateValueBytes(42)).toBe(40);
    expect(estimateValueBytes(null)).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// chunkBySize
// ---------------------------------------------------------------------------

describe('chunkBySize', () => {
  type SizedItem = { id: string; size: number };
  const sizedItem = (id: string, size: number): SizedItem => ({ id, size });
  const getSize = (item: SizedItem) => item.size;

  it('empty input returns empty output', () => {
    expect(chunkBySize([], getSize, 900_000)).toEqual([]);
  });

  it('small items fit in one chunk', () => {
    const items = Array.from({ length: 10 }, (_, i) => sizedItem(`s${i}`, 100));
    const chunks = chunkBySize(items, getSize, 900_000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(10);
  });

  it('splits when cumulative exceeds limit and preserves order', () => {
    const items = Array.from({ length: 5 }, (_, i) => sizedItem(`s${i}`, 300_000));
    const chunks = chunkBySize(items, getSize, 900_000);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.flat().map(i => i.id)).toEqual(['s0', 's1', 's2', 's3', 's4']);
  });

  it('oversize single item gets its own chunk', () => {
    const chunks = chunkBySize([sizedItem('big', 2_000_000)], getSize, 900_000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0][0].id).toBe('big');
  });

  it('multi-item chunks respect limit; no chunk is empty', () => {
    const items = Array.from({ length: 5 }, (_, i) => sizedItem(`s${i}`, 200_000));
    const chunks = chunkBySize(items, getSize, 500_000);
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0);
      if (chunk.length > 1) {
        expect(chunk.reduce((s, i) => s + i.size, 0)).toBeLessThanOrEqual(500_000);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// truncateSpan verification
// ---------------------------------------------------------------------------

describe('truncateSpan verification', () => {
  const MAX = 250 * 1024;

  it('leaves small span unchanged', () => {
    const span = makeOTLPSpan({ k: 'small' });
    expect(truncateSpan(span).attributes!['k']).toBe('small');
  });

  it('shrinks oversize span below limit, largest string first', () => {
    const span = makeOTLPSpan({ small: 'ok', fat: 'x'.repeat(300_000) });
    const result = truncateSpan(span);
    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(MAX);
    expect(result.attributes!['small']).toBe('ok');
    expect((result.attributes!['fat'] as string).length).toBeLessThan(300_000);
  });

  it('does not loop forever on already-sentinel values', () => {
    const span = makeOTLPSpan({
      a: '[overlimit]',
      b: '[overlimit]',
      big: new Array(5200).fill(42),
    });
    expect(truncateSpan(span)).toBeDefined();
  });
});
