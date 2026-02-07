// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { ClusterCategory } from '@microsoft/agents-a365-runtime';

describe('exporter/utils', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Suppress logger output during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('hexTraceId', () => {
    it('should convert number to 32-character hex string', async () => {
      const { hexTraceId } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');

      expect(hexTraceId(255)).toBe('000000000000000000000000000000ff');
      expect(hexTraceId(0)).toBe('00000000000000000000000000000000');
      expect(hexTraceId(4096)).toBe('00000000000000000000000000001000');
    });

    it('should handle hex string input with 0x prefix', async () => {
      const { hexTraceId } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');

      expect(hexTraceId('0xabc')).toBe('00000000000000000000000000000abc');
      expect(hexTraceId('0x1234567890abcdef')).toBe('00000000000000001234567890abcdef');
    });

    it('should handle hex string input without prefix', async () => {
      const { hexTraceId } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');

      expect(hexTraceId('abc')).toBe('00000000000000000000000000000abc');
      expect(hexTraceId('1234567890abcdef1234567890abcdef')).toBe('1234567890abcdef1234567890abcdef');
    });

    it('should pad short strings to 32 characters', async () => {
      const { hexTraceId } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');

      const result = hexTraceId('1');
      expect(result.length).toBe(32);
      expect(result).toBe('00000000000000000000000000000001');
    });
  });

  describe('hexSpanId', () => {
    it('should convert number to 16-character hex string', async () => {
      const { hexSpanId } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');

      expect(hexSpanId(255)).toBe('00000000000000ff');
      expect(hexSpanId(0)).toBe('0000000000000000');
      expect(hexSpanId(4096)).toBe('0000000000001000');
    });

    it('should handle hex string input with 0x prefix', async () => {
      const { hexSpanId } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');

      expect(hexSpanId('0xabc')).toBe('0000000000000abc');
    });

    it('should handle hex string input without prefix', async () => {
      const { hexSpanId } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');

      expect(hexSpanId('1234567890abcdef')).toBe('1234567890abcdef');
    });

    it('should pad short strings to 16 characters', async () => {
      const { hexSpanId } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');

      const result = hexSpanId('1');
      expect(result.length).toBe(16);
      expect(result).toBe('0000000000000001');
    });
  });

  describe('asStr', () => {
    it('should return undefined for null', async () => {
      const { asStr } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(asStr(null)).toBeUndefined();
    });

    it('should return undefined for undefined', async () => {
      const { asStr } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(asStr(undefined)).toBeUndefined();
    });

    it('should convert values to string', async () => {
      const { asStr } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');

      expect(asStr('hello')).toBe('hello');
      expect(asStr(123)).toBe('123');
      expect(asStr(true)).toBe('true');
      expect(asStr(false)).toBe('false');
    });

    it('should return undefined for empty or whitespace-only strings', async () => {
      const { asStr } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');

      expect(asStr('')).toBeUndefined();
      expect(asStr('   ')).toBeUndefined();
      expect(asStr('\t\n')).toBeUndefined();
    });

    it('should preserve non-empty strings with whitespace', async () => {
      const { asStr } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');

      expect(asStr('  hello  ')).toBe('  hello  ');
      expect(asStr('hello world')).toBe('hello world');
    });
  });

  describe('kindName', () => {
    it('should return INTERNAL for SpanKind.INTERNAL', async () => {
      const { kindName } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(kindName(SpanKind.INTERNAL)).toBe('INTERNAL');
    });

    it('should return SERVER for SpanKind.SERVER', async () => {
      const { kindName } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(kindName(SpanKind.SERVER)).toBe('SERVER');
    });

    it('should return CLIENT for SpanKind.CLIENT', async () => {
      const { kindName } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(kindName(SpanKind.CLIENT)).toBe('CLIENT');
    });

    it('should return PRODUCER for SpanKind.PRODUCER', async () => {
      const { kindName } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(kindName(SpanKind.PRODUCER)).toBe('PRODUCER');
    });

    it('should return CONSUMER for SpanKind.CONSUMER', async () => {
      const { kindName } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(kindName(SpanKind.CONSUMER)).toBe('CONSUMER');
    });

    it('should return UNSPECIFIED for unknown kind', async () => {
      const { kindName } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(kindName(999 as SpanKind)).toBe('UNSPECIFIED');
    });
  });

  describe('statusName', () => {
    it('should return UNSET for SpanStatusCode.UNSET', async () => {
      const { statusName } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(statusName(SpanStatusCode.UNSET)).toBe('UNSET');
    });

    it('should return OK for SpanStatusCode.OK', async () => {
      const { statusName } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(statusName(SpanStatusCode.OK)).toBe('OK');
    });

    it('should return ERROR for SpanStatusCode.ERROR', async () => {
      const { statusName } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(statusName(SpanStatusCode.ERROR)).toBe('ERROR');
    });

    it('should return UNSET for unknown status code', async () => {
      const { statusName } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(statusName(999 as SpanStatusCode)).toBe('UNSET');
    });
  });

  describe('isAgent365ExporterEnabled', () => {
    it.each([
      { value: 'true', expected: true },
      { value: 'TRUE', expected: true },
      { value: '1', expected: true },
      { value: 'yes', expected: true },
      { value: 'YES', expected: true },
      { value: 'on', expected: true },
      { value: 'ON', expected: true },
    ])('should return $expected when ENABLE_A365_OBSERVABILITY_EXPORTER is "$value"', async ({ value, expected }) => {
      process.env.ENABLE_A365_OBSERVABILITY_EXPORTER = value;
      const { isAgent365ExporterEnabled } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(isAgent365ExporterEnabled()).toBe(expected);
    });

    it.each([
      { value: 'false', expected: false },
      { value: 'FALSE', expected: false },
      { value: '0', expected: false },
      { value: 'no', expected: false },
      { value: 'off', expected: false },
      { value: '', expected: false },
      { value: 'invalid', expected: false },
    ])('should return $expected when ENABLE_A365_OBSERVABILITY_EXPORTER is "$value"', async ({ value, expected }) => {
      process.env.ENABLE_A365_OBSERVABILITY_EXPORTER = value;
      const { isAgent365ExporterEnabled } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(isAgent365ExporterEnabled()).toBe(expected);
    });

    it('should return false when env var is not set', async () => {
      delete process.env.ENABLE_A365_OBSERVABILITY_EXPORTER;
      const { isAgent365ExporterEnabled } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(isAgent365ExporterEnabled()).toBe(false);
    });
  });

  describe('isPerRequestExportEnabled', () => {
    it.each([
      { value: 'true', expected: true },
      { value: 'TRUE', expected: true },
      { value: '1', expected: true },
      { value: 'yes', expected: true },
      { value: 'on', expected: true },
    ])('should return $expected when ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT is "$value"', async ({ value, expected }) => {
      process.env.ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT = value;
      const { isPerRequestExportEnabled } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(isPerRequestExportEnabled()).toBe(expected);
    });

    it.each([
      { value: 'false', expected: false },
      { value: '0', expected: false },
      { value: '', expected: false },
    ])('should return $expected when ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT is "$value"', async ({ value, expected }) => {
      process.env.ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT = value;
      const { isPerRequestExportEnabled } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(isPerRequestExportEnabled()).toBe(expected);
    });

    it('should return false when env var is not set', async () => {
      delete process.env.ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT;
      const { isPerRequestExportEnabled } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(isPerRequestExportEnabled()).toBe(false);
    });
  });

  describe('useCustomDomainForObservability', () => {
    it.each([
      { value: 'true', expected: true },
      { value: 'TRUE', expected: true },
      { value: '1', expected: true },
      { value: 'yes', expected: true },
      { value: 'on', expected: true },
    ])('should return $expected when A365_OBSERVABILITY_USE_CUSTOM_DOMAIN is "$value"', async ({ value, expected }) => {
      process.env.A365_OBSERVABILITY_USE_CUSTOM_DOMAIN = value;
      const { useCustomDomainForObservability } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(useCustomDomainForObservability()).toBe(expected);
    });

    it.each([
      { value: 'false', expected: false },
      { value: '0', expected: false },
      { value: '', expected: false },
    ])('should return $expected when A365_OBSERVABILITY_USE_CUSTOM_DOMAIN is "$value"', async ({ value, expected }) => {
      process.env.A365_OBSERVABILITY_USE_CUSTOM_DOMAIN = value;
      const { useCustomDomainForObservability } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(useCustomDomainForObservability()).toBe(expected);
    });

    it('should return false when env var is not set', async () => {
      delete process.env.A365_OBSERVABILITY_USE_CUSTOM_DOMAIN;
      const { useCustomDomainForObservability } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(useCustomDomainForObservability()).toBe(false);
    });
  });

  describe('resolveAgent365Endpoint', () => {
    it('should return production endpoint for prod cluster', async () => {
      const { resolveAgent365Endpoint } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(resolveAgent365Endpoint(ClusterCategory.prod)).toBe('https://agent365.svc.cloud.microsoft');
    });

    it('should return production endpoint for unknown cluster category', async () => {
      const { resolveAgent365Endpoint } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      // Cast to ClusterCategory to test default behavior
      expect(resolveAgent365Endpoint('unknown' as never)).toBe('https://agent365.svc.cloud.microsoft');
    });

    it.each([
      ClusterCategory.local, ClusterCategory.dev, ClusterCategory.test, ClusterCategory.preprod,
      ClusterCategory.gov, ClusterCategory.high, ClusterCategory.dod, ClusterCategory.mooncake,
      ClusterCategory.ex, ClusterCategory.rx
    ])(
      'should return production endpoint for %s cluster (current implementation)',
      async (cluster) => {
        const { resolveAgent365Endpoint } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
        // Current implementation returns prod endpoint for all clusters
        expect(resolveAgent365Endpoint(cluster)).toBe('https://agent365.svc.cloud.microsoft');
      }
    );
  });

  describe('getAgent365ObservabilityDomainOverride', () => {
    it('should return trimmed URL when env var is set', async () => {
      process.env.A365_OBSERVABILITY_DOMAIN_OVERRIDE = 'https://custom.domain.com';
      const { getAgent365ObservabilityDomainOverride } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(getAgent365ObservabilityDomainOverride()).toBe('https://custom.domain.com');
    });

    it('should remove trailing slashes from URL', async () => {
      process.env.A365_OBSERVABILITY_DOMAIN_OVERRIDE = 'https://custom.domain.com/';
      const { getAgent365ObservabilityDomainOverride } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(getAgent365ObservabilityDomainOverride()).toBe('https://custom.domain.com');
    });

    it('should remove multiple trailing slashes from URL', async () => {
      process.env.A365_OBSERVABILITY_DOMAIN_OVERRIDE = 'https://custom.domain.com///';
      const { getAgent365ObservabilityDomainOverride } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(getAgent365ObservabilityDomainOverride()).toBe('https://custom.domain.com');
    });

    it('should trim whitespace from URL', async () => {
      process.env.A365_OBSERVABILITY_DOMAIN_OVERRIDE = '  https://custom.domain.com  ';
      const { getAgent365ObservabilityDomainOverride } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(getAgent365ObservabilityDomainOverride()).toBe('https://custom.domain.com');
    });

    it('should return null when env var is not set', async () => {
      delete process.env.A365_OBSERVABILITY_DOMAIN_OVERRIDE;
      const { getAgent365ObservabilityDomainOverride } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(getAgent365ObservabilityDomainOverride()).toBeNull();
    });

    it('should return null when env var is empty string', async () => {
      process.env.A365_OBSERVABILITY_DOMAIN_OVERRIDE = '';
      const { getAgent365ObservabilityDomainOverride } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(getAgent365ObservabilityDomainOverride()).toBeNull();
    });

    it('should return null when env var is whitespace only', async () => {
      process.env.A365_OBSERVABILITY_DOMAIN_OVERRIDE = '   ';
      const { getAgent365ObservabilityDomainOverride } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      expect(getAgent365ObservabilityDomainOverride()).toBeNull();
    });
  });

  describe('parseIdentityKey', () => {
    it('should parse tenant and agent from key', async () => {
      const { parseIdentityKey } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      const result = parseIdentityKey('tenant123:agent456');
      expect(result).toEqual({ tenantId: 'tenant123', agentId: 'agent456' });
    });

    it('should handle keys with empty values', async () => {
      const { parseIdentityKey } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      const result = parseIdentityKey(':agent');
      expect(result).toEqual({ tenantId: '', agentId: 'agent' });
    });

    it('should handle keys with GUIDs', async () => {
      const { parseIdentityKey } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');
      const result = parseIdentityKey('12345678-1234-1234-1234-123456789abc:98765432-1234-1234-1234-123456789def');
      expect(result).toEqual({
        tenantId: '12345678-1234-1234-1234-123456789abc',
        agentId: '98765432-1234-1234-1234-123456789def'
      });
    });
  });

  describe('partitionByIdentity', () => {
    const createMockSpan = (name: string, tenantId?: string, agentId?: string): ReadableSpan => ({
      name,
      kind: SpanKind.INTERNAL,
      spanContext: () => ({
        traceId: '1234567890abcdef1234567890abcdef',
        spanId: '1234567890abcdef',
        traceFlags: 1
      }),
      startTime: [0, 0],
      endTime: [1, 0],
      ended: true,
      status: { code: SpanStatusCode.OK },
      attributes: {
        ...(tenantId !== undefined && { 'tenant.id': tenantId }),
        ...(agentId !== undefined && { 'gen_ai.agent.id': agentId }),
      },
      links: [],
      events: [],
      duration: [1, 0],
      resource: { attributes: {} },
      instrumentationLibrary: { name: 'test' },
      droppedAttributesCount: 0,
      droppedEventsCount: 0,
      droppedLinksCount: 0,
    } as unknown as ReadableSpan);

    it('should group spans by tenant and agent ID', async () => {
      const { partitionByIdentity } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');

      const spans = [
        createMockSpan('span1', 'tenant1', 'agent1'),
        createMockSpan('span2', 'tenant1', 'agent1'),
        createMockSpan('span3', 'tenant2', 'agent2'),
      ];

      const result = partitionByIdentity(spans);

      expect(result.size).toBe(2);
      expect(result.get('tenant1:agent1')?.length).toBe(2);
      expect(result.get('tenant2:agent2')?.length).toBe(1);
    });

    it('should skip spans without tenant ID', async () => {
      const { partitionByIdentity } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');

      const spans = [
        createMockSpan('span1', undefined, 'agent1'),
        createMockSpan('span2', 'tenant1', 'agent1'),
      ];

      const result = partitionByIdentity(spans);

      expect(result.size).toBe(1);
      expect(result.get('tenant1:agent1')?.length).toBe(1);
    });

    it('should skip spans without agent ID', async () => {
      const { partitionByIdentity } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');

      const spans = [
        createMockSpan('span1', 'tenant1', undefined),
        createMockSpan('span2', 'tenant1', 'agent1'),
      ];

      const result = partitionByIdentity(spans);

      expect(result.size).toBe(1);
      expect(result.get('tenant1:agent1')?.length).toBe(1);
    });

    it('should return empty map for empty spans array', async () => {
      const { partitionByIdentity } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');

      const result = partitionByIdentity([]);

      expect(result.size).toBe(0);
    });

    it('should return empty map when all spans lack identity', async () => {
      const { partitionByIdentity } = await import('@microsoft/agents-a365-observability/src/tracing/exporter/utils');

      const spans = [
        createMockSpan('span1', undefined, undefined),
        createMockSpan('span2', 'tenant1', undefined),
        createMockSpan('span3', undefined, 'agent1'),
      ];

      const result = partitionByIdentity(spans);

      expect(result.size).toBe(0);
    });
  });
});
