// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Agent365Exporter } from '@microsoft/agents-a365-observability/src/tracing/exporter/Agent365Exporter';
import { Agent365ExporterOptions } from '@microsoft/agents-a365-observability/src/tracing/exporter/Agent365ExporterOptions';
// Using standard import instead of 'import type' to avoid Babel/Jest transform issues in this workspace
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { ExportResultCode } from '@opentelemetry/core';
import { OpenTelemetryConstants } from '@microsoft/agents-a365-observability/src/tracing/constants';
import { runWithExportToken } from '@microsoft/agents-a365-observability/src/tracing/context/token-context';
import { context as otelContext } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

// Minimal mock span factory
function makeSpan(attrs: Record<string, unknown>, name = 'test'): ReadableSpan {
  return {
    name,
    kind: 0,
    spanContext: () => ({ traceId: '1', spanId: '2', traceFlags: 1 }),
    parentSpanId: undefined,
    parentSpanContext: undefined,
    startTime: [Math.floor(Date.now() / 1000), 0],
    endTime: [Math.floor(Date.now() / 1000) + 1, 0],
    status: { code: 0 },
    attributes: attrs,
    events: [],
    links: [],
    duration: [1, 0],
    resource: { attributes: {} },
    instrumentationScope: { name: 'tests', version: '1.0.0' }
  } as unknown as ReadableSpan;
}

// Helpers
const tenantId = 'tenant-11111111-1111-1111-1111-111111111111';
const agentId = 'agent-22222222-2222-2222-2222-222222222222';

// Patch global fetch
const originalFetch = global.fetch;

type FetchCallArgs = [string, { headers: Record<string, string>; body?: unknown; signal?: AbortSignal }];

function getFetchCalls(): FetchCallArgs[] {
  const f = global.fetch as unknown as { mock?: { calls?: unknown[][] } };
  return (f.mock?.calls ?? []) as unknown as FetchCallArgs[];
}

function mockFetchSequence(statuses: number[]): void {
  let call = 0;
  global.fetch = jest.fn(async () => ({
    status: statuses[Math.min(call++, statuses.length - 1)],
    headers: { get: () => 'cid' }
  })) as unknown as typeof fetch;
}

describe('Agent365Exporter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    global.fetch = originalFetch;
    delete process.env.A365_OBSERVABILITY_DOMAIN_OVERRIDE;
    delete process.env.ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT;
  });

  it('returns success immediately with no spans', async () => {
    const opts = new Agent365ExporterOptions();
    opts.clusterCategory = 'local';
    opts.tokenResolver = () => null;
    const exporter = new Agent365Exporter(opts);
    const callback = jest.fn();
    await exporter.export([], callback);
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
  });

  it('uses provided token resolver and sets authorization header', async () => {
    const token = 'abc123';
    mockFetchSequence([200]);
    const opts = new Agent365ExporterOptions();
    opts.clusterCategory = 'local';
    opts.tokenResolver = () => token;
    const exporter = new Agent365Exporter(opts);

    const spans = [
      makeSpan({
        [OpenTelemetryConstants.TENANT_ID_KEY]: tenantId,
        [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]: agentId,
        [OpenTelemetryConstants.GEN_AI_CALLER_CLIENT_IP_KEY]: '10.0.0.5'
      })
    ];

    const callback = jest.fn();
    await exporter.export(spans, callback);
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
    // Ensure fetch saw auth header
    const fetchCalls = getFetchCalls();
    expect(fetchCalls.length).toBe(1);
    const headersArg = fetchCalls[0][1].headers;
    expect(headersArg['authorization']).toBe(`Bearer ${token}`);
    // Validate attributes in exported payload
    const bodyStr = fetchCalls[0][1].body as string;
    const bodyJson = JSON.parse(bodyStr);
    const exportedSpan = bodyJson.resourceSpans[0].scopeSpans[0].spans[0];
    expect(exportedSpan.attributes).toBeDefined();
    expect(exportedSpan.attributes[OpenTelemetryConstants.TENANT_ID_KEY]).toBe(tenantId);
    expect(exportedSpan.attributes[OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]).toBe(agentId);
    expect(exportedSpan.attributes[OpenTelemetryConstants.GEN_AI_CALLER_CLIENT_IP_KEY]).toBe('10.0.0.5');
  });

  it.each([
    { cluster: 'prod', expectedUrl: 'https://agent365.svc.cloud.microsoft', token: 'tok-prod' },
    { cluster: 'preprod', expectedUrl: 'https://agent365.svc.cloud.microsoft', token: 'tok-preprod' }
  ])('exports to custom domain by default (cluster=%s)', async ({ cluster, expectedUrl, token }) => {
    mockFetchSequence([200]);
    const opts = new Agent365ExporterOptions();
    opts.clusterCategory = cluster;
    opts.tokenResolver = () => token;
    const exporter = new Agent365Exporter(opts);
    const spans = [
      makeSpan({
        [OpenTelemetryConstants.TENANT_ID_KEY]: tenantId,
        [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]: agentId
      })
    ];
    const callback = jest.fn();
    await exporter.export(spans, callback);
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
    const fetchCalls = getFetchCalls();
    expect(fetchCalls.length).toBe(1);
    const urlArg = fetchCalls[0][0];
    const headersArg = fetchCalls[0][1].headers;
    expect(urlArg).toBe(`${expectedUrl}/observability/tenants/${tenantId}/agents/${agentId}/traces?api-version=1`);
    expect(headersArg['x-ms-tenant-id']).toBe(tenantId);
    expect(headersArg['authorization']).toBe(`Bearer ${token}`);
  });

  it.each([
    {
      description: 'set to non-empty value',
      override: 'https://custom-observability.internal',
      expectedBaseUrl: 'https://custom-observability.internal'
    },
    {
      description: 'set to empty string',
      override: '',
      expectedBaseUrl: 'https://agent365.svc.cloud.microsoft'
    },
    {
      description: 'set to whitespace only',
      override: '   ',
      expectedBaseUrl: 'https://agent365.svc.cloud.microsoft'
    },
    {
      description: 'unset (undefined)',
      override: undefined,
      expectedBaseUrl: 'https://agent365.svc.cloud.microsoft'
    },
  ])('uses correct domain when A365_OBSERVABILITY_DOMAIN_OVERRIDE is $description', async ({ override, expectedBaseUrl }) => {
    mockFetchSequence([200]);

    if (override !== undefined) {
      process.env.A365_OBSERVABILITY_DOMAIN_OVERRIDE = override as string;
    }

    const token = 'tok-override-domain';
    const opts = new Agent365ExporterOptions();
    opts.clusterCategory = 'prod';
    opts.tokenResolver = () => token;

    const exporter = new Agent365Exporter(opts);
    const spans = [
      makeSpan({
        [OpenTelemetryConstants.TENANT_ID_KEY]: tenantId,
        [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]: agentId
      })
    ];

    const callback = jest.fn();
    await exporter.export(spans, callback);

    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
    const fetchCalls = getFetchCalls();
    expect(fetchCalls.length).toBe(1);
    const urlArg = fetchCalls[0][0] as string;
    const headersArg = fetchCalls[0][1].headers as Record<string, string>;

    expect(urlArg).toBe(`${expectedBaseUrl}/observability/tenants/${tenantId}/agents/${agentId}/traces?api-version=1`);
    expect(headersArg['x-ms-tenant-id']).toBe(tenantId);
    expect(headersArg['authorization']).toBe(`Bearer ${token}`);
  });

  it('exports to default custom domain endpoint when no env vars set', async () => {
    mockFetchSequence([200]);
    const token = 'tok-prod-default';
    const opts = new Agent365ExporterOptions();
    opts.clusterCategory = 'prod';
    opts.tokenResolver = () => token;
    const exporter = new Agent365Exporter(opts);
    const spans = [
      makeSpan({
        [OpenTelemetryConstants.TENANT_ID_KEY]: tenantId,
        [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]: agentId
      })
    ];
    const callback = jest.fn();
    await exporter.export(spans, callback);
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
    const fetchCalls = getFetchCalls();
    expect(fetchCalls.length).toBe(1);
    const urlArg = fetchCalls[0][0];
    const headersArg = fetchCalls[0][1].headers;
    expect(urlArg).toBe(`https://agent365.svc.cloud.microsoft/observability/tenants/${tenantId}/agents/${agentId}/traces?api-version=1`);
    expect(headersArg['x-ms-tenant-id']).toBe(tenantId);
    expect(headersArg['authorization']).toBe(`Bearer ${token}`);
  });

  it('requires a tokenResolver and fails export when missing', async () => {
    const opts = new Agent365ExporterOptions();
    opts.clusterCategory = 'local';
    // Intentionally omit tokenResolver
    expect(() => new Agent365Exporter(opts)).toThrow(/tokenResolver must be provided/);
  });
  it('uses S2S endpoint path when useS2SEndpoint is true', async () => {
    mockFetchSequence([200]);
    const token = 'tok-s2s';
    const opts = new Agent365ExporterOptions();
    opts.clusterCategory = 'prod';
    opts.tokenResolver = () => token;
    opts.useS2SEndpoint = true;

    const exporter = new Agent365Exporter(opts);
    const spans = [
      makeSpan({
        [OpenTelemetryConstants.TENANT_ID_KEY]: tenantId,
        [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]: agentId
      }, 's2s-span')
    ];

    const callback = jest.fn();
    await exporter.export(spans, callback);

    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
    const fetchCalls = getFetchCalls();
    expect(fetchCalls.length).toBe(1);

    const urlArg = fetchCalls[0][0] as string;
    expect(urlArg).toMatch(`/observabilityService/tenants/${tenantId}/agents/${agentId}/traces?api-version=1`);
    const headersArg = fetchCalls[0][1].headers as Record<string, string>;
    expect(headersArg['authorization']).toBe(`Bearer ${token}`);
    expect(headersArg['x-ms-tenant-id']).toBe(tenantId);
  });

  it('uses S2S endpoint path with domain override and sets x-ms-tenant-id', async () => {
    mockFetchSequence([200]);
    process.env.A365_OBSERVABILITY_DOMAIN_OVERRIDE = 'https://custom.domain';
    const token = 'tok-s2s-custom';
    const opts = new Agent365ExporterOptions();
    opts.clusterCategory = 'prod';
    opts.tokenResolver = () => token;
    opts.useS2SEndpoint = true;

    const exporter = new Agent365Exporter(opts);
    const spans = [
      makeSpan({
        [OpenTelemetryConstants.TENANT_ID_KEY]: tenantId,
        [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]: agentId
      }, 's2s-custom-span')
    ];

    const callback = jest.fn();
    await exporter.export(spans, callback);

    const fetchCalls = getFetchCalls();
    expect(fetchCalls.length).toBe(1);
    const urlArg = fetchCalls[0][0] as string;
    expect(urlArg).toMatch(`/observabilityService/tenants/${tenantId}/agents/${agentId}/traces?api-version=1`);
    expect(urlArg).toContain('https://custom.domain');
    const headersArg = fetchCalls[0][1].headers as Record<string, string>;
    expect(headersArg['authorization']).toBe(`Bearer ${token}`);
    expect(headersArg['x-ms-tenant-id']).toBe(tenantId);
  });


  it('passes httpRequestTimeoutMilliseconds to fetch AbortSignal.timeout', async () => {
    const customTimeout = 12345;
    mockFetchSequence([200]);
    const opts = new Agent365ExporterOptions();
    opts.clusterCategory = 'local';
    opts.tokenResolver = () => 'tok';
    opts.httpRequestTimeoutMilliseconds = customTimeout;

    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    const exporter = new Agent365Exporter(opts);
    const spans = [
      makeSpan({
        [OpenTelemetryConstants.TENANT_ID_KEY]: tenantId,
        [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]: agentId
      })
    ];

    const callback = jest.fn();
    await exporter.export(spans, callback);

    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
    expect(timeoutSpy).toHaveBeenCalledWith(customTimeout);
    timeoutSpy.mockRestore();
  });

  describe('truncateSpan (span-level size enforcement)', () => {
    const MAX_SPAN_SIZE_BYTES = 250 * 1024;

    /** Export a single span and return its attributes from the serialized payload. */
    async function exportAndGetAttributes(attrs: Record<string, unknown>) {
      mockFetchSequence([200]);
      const opts = new Agent365ExporterOptions();
      opts.clusterCategory = 'local';
      opts.tokenResolver = () => 'tok';
      const exporter = new Agent365Exporter(opts);

      const spans = [makeSpan({
        [OpenTelemetryConstants.TENANT_ID_KEY]: tenantId,
        [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]: agentId,
        ...attrs,
      })];

      const callback = jest.fn();
      await exporter.export(spans, callback);
      expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });

      const body = JSON.parse(getFetchCalls()[0][1].body as string);
      const exportedSpan = body.resourceSpans[0].scopeSpans[0].spans[0];
      return { exportedSpan, spans };
    }

    it('should preserve all attribute types when span is within size limit', async () => {
      const { exportedSpan } = await exportAndGetAttributes({
        'string_attr': 'hello',
        'number_attr': 42,
        'boolean_attr': true,
        'string_array_attr': ['a', 'b', 'c'],
        'number_array_attr': [1, 2, 3],
      });

      expect(exportedSpan.attributes['string_attr']).toBe('hello');
      expect(exportedSpan.attributes['number_attr']).toBe(42);
      expect(exportedSpan.attributes['boolean_attr']).toBe(true);
      expect(exportedSpan.attributes['string_array_attr']).toEqual(['a', 'b', 'c']);
      expect(exportedSpan.attributes['number_array_attr']).toEqual([1, 2, 3]);
    });

    it('should replace oversized string with TRUNCATED and preserve all smaller attribute types', async () => {
      const { exportedSpan } = await exportAndGetAttributes({
        'small_string': 'keep me',
        'small_number': 123,
        'small_boolean': false,
        'small_array': ['x', 'y'],
        'large_string': 'x'.repeat(MAX_SPAN_SIZE_BYTES),
      });

      expect(exportedSpan.attributes['large_string']).toBe('TRUNCATED');
      expect(exportedSpan.attributes['small_string']).toBe('keep me');
      expect(exportedSpan.attributes['small_number']).toBe(123);
      expect(exportedSpan.attributes['small_boolean']).toBe(false);
      expect(exportedSpan.attributes['small_array']).toEqual(['x', 'y']);
    });

    it('should replace oversized string array with TRUNCATED', async () => {
      const largeArray = Array.from({ length: 5000 }, (_, i) => `item-${i}-${'p'.repeat(50)}`);
      const { exportedSpan } = await exportAndGetAttributes({
        'large_array': largeArray,
        'small_string': 'keep me',
      });

      expect(exportedSpan.attributes['large_array']).toBe('TRUNCATED');
      expect(exportedSpan.attributes['small_string']).toBe('keep me');
    });

    it('should replace both large attributes with TRUNCATED when each alone exceeds limit', async () => {
      const { exportedSpan } = await exportAndGetAttributes({
        'gen_ai.input.messages': 'a'.repeat(MAX_SPAN_SIZE_BYTES),
        'gen_ai.output.messages': 'b'.repeat(MAX_SPAN_SIZE_BYTES),
        'small_attr': 'keep me',
      });

      expect(exportedSpan.attributes['gen_ai.input.messages']).toBe('TRUNCATED');
      expect(exportedSpan.attributes['gen_ai.output.messages']).toBe('TRUNCATED');
      expect(exportedSpan.attributes['small_attr']).toBe('keep me');
    });

    it('should not mutate the original ReadableSpan attributes', async () => {
      const largeValue = 'x'.repeat(MAX_SPAN_SIZE_BYTES);
      const { spans } = await exportAndGetAttributes({
        'gen_ai.input.messages': largeValue,
      });

      expect(spans[0].attributes['gen_ai.input.messages']).toBe(largeValue);
    });

    it('should guarantee exported span is within 250KB after truncation', async () => {
      const largeValue = 'x'.repeat(MAX_SPAN_SIZE_BYTES);
      const { exportedSpan } = await exportAndGetAttributes({
        'gen_ai.input.messages': largeValue,
        'gen_ai.output.messages': largeValue,
      });

      const spanSize = Buffer.byteLength(JSON.stringify(exportedSpan), 'utf8');
      expect(spanSize).toBeLessThanOrEqual(MAX_SPAN_SIZE_BYTES);
      expect(exportedSpan.attributes['gen_ai.input.messages']).toBe('TRUNCATED');
      expect(exportedSpan.attributes['gen_ai.output.messages']).toBe('TRUNCATED');
    });

    it('should handle span with null attributes without error', async () => {
      mockFetchSequence([200]);
      const opts = new Agent365ExporterOptions();
      opts.clusterCategory = 'local';
      opts.tokenResolver = () => 'tok';
      const exporter = new Agent365Exporter(opts);

      const span = {
        traceId: '00000000000000000000000000000001',
        spanId: '0000000000000002',
        name: 'test',
        kind: 'INTERNAL',
        startTimeUnixNano: 0,
        endTimeUnixNano: 1,
        attributes: null,
        status: { code: 'UNSET' },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (exporter as any).truncateSpan(span);
      expect(result.attributes).toBeNull();
    });

    it('should handle non-serializable attribute values gracefully', async () => {
      mockFetchSequence([200]);
      const opts = new Agent365ExporterOptions();
      opts.clusterCategory = 'local';
      opts.tokenResolver = () => 'tok';
      const exporter = new Agent365Exporter(opts);

      // Build an OTLPSpan directly with a non-serializable value (BigInt)
      const span = {
        traceId: '00000000000000000000000000000001',
        spanId: '0000000000000002',
        name: 'test',
        kind: 'INTERNAL',
        startTimeUnixNano: 0,
        endTimeUnixNano: 1,
        attributes: {
          'normal_attr': 'hello',
          // eslint-disable-next-line @typescript-eslint/no-loss-of-precision
          'bigint_attr': BigInt(999),
        } as Record<string, unknown>,
        status: { code: 'UNSET' },
      };

      // truncateSpan should catch the JSON.stringify failure and return span unchanged
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (exporter as any).truncateSpan(span);
      expect(result.attributes['normal_attr']).toBe('hello');
      expect(result.attributes['bigint_attr']).toBe(BigInt(999));
    });
  });

  describe('per-request export (token from OTel Context)', () => {
    let contextManager: AsyncLocalStorageContextManager | undefined;

    beforeEach(() => {
      // Ensure OpenTelemetry context propagates across async/await in this group.
      contextManager = new AsyncLocalStorageContextManager();
      contextManager.enable();
      otelContext.setGlobalContextManager(contextManager);
    });

    afterEach(() => {
      contextManager?.disable();
      otelContext.disable();
      contextManager = undefined;
    });

    it('acquires export token from OTel Context when per-request export is enabled', async () => {
      mockFetchSequence([200]);
      process.env.ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT = 'true';

      const opts = new Agent365ExporterOptions();
      opts.clusterCategory = 'local';

      const exporter = new Agent365Exporter(opts);
      const spans = [
        makeSpan({
          [OpenTelemetryConstants.TENANT_ID_KEY]: tenantId,
          [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]: agentId
        })
      ];

      const callback = jest.fn();
      const exportToken = 'tok-from-context';
      await runWithExportToken(exportToken, async () => exporter.export(spans, callback));

      expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });

      // Verify export was attempted (should be greater than 0 when enabled)
      const fetchCalls = getFetchCalls();
      expect(fetchCalls.length).toBeGreaterThan(0);

      // Verify token came from OTel Context (per-request mode)
      const headersArg = fetchCalls[0][1].headers as Record<string, string>;
      expect(headersArg['authorization']).toBe(`Bearer ${exportToken}`);
    });
  });
});
