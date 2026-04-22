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
import { truncateSpan } from '@microsoft/agents-a365-observability/src/tracing/exporter/utils';
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
    expect(urlArg).toBe(`${expectedUrl}/observability/tenants/${tenantId}/otlp/agents/${agentId}/traces?api-version=1`);
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

    expect(urlArg).toBe(`${expectedBaseUrl}/observability/tenants/${tenantId}/otlp/agents/${agentId}/traces?api-version=1`);
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
    expect(urlArg).toBe(`https://agent365.svc.cloud.microsoft/observability/tenants/${tenantId}/otlp/agents/${agentId}/traces?api-version=1`);
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
    expect(urlArg).toBe(`https://agent365.svc.cloud.microsoft/observabilityService/tenants/${tenantId}/otlp/agents/${agentId}/traces?api-version=1`);
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
    expect(urlArg).toBe(`https://custom.domain/observabilityService/tenants/${tenantId}/otlp/agents/${agentId}/traces?api-version=1`);
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

    it('should trim oversized string attribute and preserve all smaller attribute types', async () => {
      const { exportedSpan } = await exportAndGetAttributes({
        'small_string': 'keep me',
        'small_number': 123,
        'small_boolean': false,
        'small_array': ['x', 'y'],
        'large_string': 'x'.repeat(MAX_SPAN_SIZE_BYTES),
      });

      expect(exportedSpan.attributes['large_string']).toContain('… [truncated]');
      expect(exportedSpan.attributes['large_string'].length).toBeLessThan(MAX_SPAN_SIZE_BYTES);
      expect(exportedSpan.attributes['small_string']).toBe('keep me');
      expect(exportedSpan.attributes['small_number']).toBe(123);
      expect(exportedSpan.attributes['small_boolean']).toBe(false);
      expect(exportedSpan.attributes['small_array']).toEqual(['x', 'y']);
    });

    it('should trim both large string attributes when each alone exceeds limit', async () => {
      const { exportedSpan } = await exportAndGetAttributes({
        'gen_ai.input.messages': 'a'.repeat(MAX_SPAN_SIZE_BYTES),
        'gen_ai.output.messages': 'b'.repeat(MAX_SPAN_SIZE_BYTES),
        'small_attr': 'keep me',
      });

      // Both are plain strings (not valid JSON messages), so they get trimmed as regular strings
      expect(exportedSpan.attributes['gen_ai.input.messages']).toContain('… [truncated]');
      expect(exportedSpan.attributes['gen_ai.output.messages']).toContain('… [truncated]');
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
    });

    it('should shrink blob content in message attributes with sentinel', async () => {
      const largeBlobContent = 'x'.repeat(MAX_SPAN_SIZE_BYTES); // >50KB blob, span will exceed limit
      const messageWrapper = JSON.stringify({
        version: '0.1.0',
        messages: [{
          role: 'user',
          parts: [
            { type: 'blob', modality: 'image', mime_type: 'image/png', content: largeBlobContent },
            { type: 'text', content: 'Keep this text' },
          ]
        }]
      });
      const { exportedSpan } = await exportAndGetAttributes({
        'gen_ai.input.messages': messageWrapper,
        'small_attr': 'keep me',
      });

      const parsed = JSON.parse(exportedSpan.attributes['gen_ai.input.messages'] as string);
      expect(parsed.version).toBe('0.1.0');
      expect(parsed.messages[0].parts[0].content).toBe('[blob truncated]');
      expect(parsed.messages[0].parts[1].content).toBe('Keep this text');
      expect(exportedSpan.attributes['small_attr']).toBe('keep me');
    });

    it('should shrink tool_call arguments with sentinel in message attributes', async () => {
      const largeArgs = { data: 'x'.repeat(MAX_SPAN_SIZE_BYTES) };
      const messageWrapper = JSON.stringify({
        version: '0.1.0',
        messages: [{
          role: 'assistant',
          parts: [
            { type: 'tool_call', name: 'search', id: 'call_1', arguments: largeArgs },
            { type: 'text', content: 'short text' },
          ]
        }]
      });
      const { exportedSpan } = await exportAndGetAttributes({
        'gen_ai.input.messages': messageWrapper,
      });

      const parsed = JSON.parse(exportedSpan.attributes['gen_ai.input.messages'] as string);
      expect(parsed.messages[0].parts[0].arguments).toBe('[truncated]');
      expect(parsed.messages[0].parts[0].name).toBe('search');
      expect(parsed.messages[0].parts[1].content).toBe('short text');
    });

    it('should trim text content in message attributes when oversized', async () => {
      const largeText = 'y'.repeat(MAX_SPAN_SIZE_BYTES);
      const messageWrapper = JSON.stringify({
        version: '0.1.0',
        messages: [{
          role: 'user',
          parts: [{ type: 'text', content: largeText }]
        }]
      });
      const { exportedSpan } = await exportAndGetAttributes({
        'gen_ai.input.messages': messageWrapper,
      });

      const parsed = JSON.parse(exportedSpan.attributes['gen_ai.input.messages'] as string);
      expect(parsed.messages[0].parts[0].content).toContain('… [truncated]');
      expect(parsed.messages[0].parts[0].content.length).toBeLessThan(largeText.length);
      const spanSize = Buffer.byteLength(JSON.stringify(exportedSpan), 'utf8');
      expect(spanSize).toBeLessThanOrEqual(MAX_SPAN_SIZE_BYTES);
    });

    it('should trim utf8 text content without splitting code points', () => {
      const largeEmojiText = '🙂'.repeat(90 * 1024);
      const messageWrapper = JSON.stringify({
        version: '0.1.0',
        messages: [{
          role: 'user',
          parts: [{ type: 'text', content: largeEmojiText }]
        }]
      });

      const span = {
        traceId: '00000000000000000000000000000001',
        spanId: '0000000000000002',
        name: 'test',
        kind: 'INTERNAL',
        startTimeUnixNano: 0,
        endTimeUnixNano: 1,
        attributes: {
          'gen_ai.input.messages': messageWrapper,
          'other_large_text': 'x'.repeat(MAX_SPAN_SIZE_BYTES),
        } as Record<string, unknown>,
        status: { code: 'UNSET' },
      };

      const result = truncateSpan(span);
      const parsed = JSON.parse(result.attributes!['gen_ai.input.messages'] as string);
      const trimmedContent = parsed.messages[0].parts[0].content as string;
      expect(trimmedContent).toContain('… [truncated]');

      const prefix = trimmedContent.slice(0, -'… [truncated]'.length);
      expect(Array.from(prefix).every((codePoint) => codePoint === '🙂')).toBe(true);
      expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(MAX_SPAN_SIZE_BYTES);
    });

    it('should handle span with null attributes without error', async () => {
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

      const result = truncateSpan(span);
      expect(result.attributes).toBeNull();
    });

    it('should handle non-serializable attribute values gracefully', async () => {
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
          'bigint_attr': BigInt(999),
        } as Record<string, unknown>,
        status: { code: 'UNSET' },
      };

      // truncateSpan should catch the JSON.stringify failure and return span unchanged
      const result = truncateSpan(span);
      expect(result.attributes['normal_attr']).toBe('hello');
      expect(result.attributes['bigint_attr']).toBe(BigInt(999));
    });

    it('should shrink tool_call_response response with sentinel in message attributes', async () => {
      const largeResponse = { data: 'x'.repeat(MAX_SPAN_SIZE_BYTES) };
      const messageWrapper = JSON.stringify({
        version: '0.1.0',
        messages: [{
          role: 'tool',
          parts: [
            { type: 'tool_call_response', id: 'call_1', response: largeResponse },
            { type: 'text', content: 'short text' },
          ]
        }]
      });
      const { exportedSpan } = await exportAndGetAttributes({
        'gen_ai.input.messages': messageWrapper,
      });

      const parsed = JSON.parse(exportedSpan.attributes['gen_ai.input.messages'] as string);
      expect(parsed.messages[0].parts[0].response).toBe('[truncated]');
      expect(parsed.messages[0].parts[0].id).toBe('call_1');
      expect(parsed.messages[0].parts[1].content).toBe('short text');
    });

    it('should shrink server_tool_call payload with sentinel in message attributes', async () => {
      const largePayload = { type: 'web_search', query: 'x'.repeat(MAX_SPAN_SIZE_BYTES) };
      const messageWrapper = JSON.stringify({
        version: '0.1.0',
        messages: [{
          role: 'assistant',
          parts: [
            { type: 'server_tool_call', name: 'web_search', id: 'stc_1', server_tool_call: largePayload },
            { type: 'text', content: 'keep me' },
          ]
        }]
      });
      const { exportedSpan } = await exportAndGetAttributes({
        'gen_ai.input.messages': messageWrapper,
      });

      const parsed = JSON.parse(exportedSpan.attributes['gen_ai.input.messages'] as string);
      expect(parsed.messages[0].parts[0].server_tool_call).toBe('[truncated]');
      expect(parsed.messages[0].parts[0].name).toBe('web_search');
      expect(parsed.messages[0].parts[1].content).toBe('keep me');
    });

    it('should shrink server_tool_call_response payload with sentinel in message attributes', async () => {
      const largePayload = { type: 'web_search_result', results: 'x'.repeat(MAX_SPAN_SIZE_BYTES) };
      const messageWrapper = JSON.stringify({
        version: '0.1.0',
        messages: [{
          role: 'tool',
          parts: [
            { type: 'server_tool_call_response', id: 'stc_1', server_tool_call_response: largePayload },
            { type: 'text', content: 'keep me' },
          ]
        }]
      });
      const { exportedSpan } = await exportAndGetAttributes({
        'gen_ai.input.messages': messageWrapper,
      });

      const parsed = JSON.parse(exportedSpan.attributes['gen_ai.input.messages'] as string);
      expect(parsed.messages[0].parts[0].server_tool_call_response).toBe('[truncated]');
      expect(parsed.messages[0].parts[0].id).toBe('stc_1');
      expect(parsed.messages[0].parts[1].content).toBe('keep me');
    });

    it('should shrink blobs alongside other fields by size priority', () => {
      const blobSize = 40 * 1024; // 40KB each
      const numBlobs = 8; // 8 * 40KB = 320KB > 250KB limit
      const blobParts = Array.from({ length: numBlobs }, (_, _i) => ({
        type: 'blob' as const,
        modality: 'image',
        mime_type: 'image/png',
        content: 'x'.repeat(blobSize),
      }));
      // Add a text part — blobs are larger so they should be shrunk first
      const textPart = { type: 'text' as const, content: 'y'.repeat(1024) };
      const messageWrapper = JSON.stringify({
        version: '0.1.0',
        messages: [{ role: 'user', parts: [...blobParts, textPart] }],
      });

      const span = {
        traceId: '00000000000000000000000000000001',
        spanId: '0000000000000002',
        name: 'test',
        kind: 'INTERNAL',
        startTimeUnixNano: 0,
        endTimeUnixNano: 1,
        attributes: {
          'gen_ai.input.messages': messageWrapper,
        } as Record<string, unknown>,
        status: { code: 'UNSET' },
      };

      const result = truncateSpan(span);
      const resultSize = Buffer.byteLength(JSON.stringify(result), 'utf8');
      expect(resultSize).toBeLessThanOrEqual(MAX_SPAN_SIZE_BYTES);

      const parsed = JSON.parse(result.attributes!['gen_ai.input.messages'] as string);
      const sentinelCount = parsed.messages[0].parts
        .filter((p: Record<string, unknown>) => p.type === 'blob' && p.content === '[blob truncated]')
        .length;
      expect(sentinelCount).toBeGreaterThan(0);
      expect(sentinelCount).toBeLessThanOrEqual(numBlobs);
    });

    it('should repeatedly shrink regular candidates by size priority until the span fits', () => {
      const regularParts = [
        { type: 'text', content: 'a'.repeat(100 * 1024) },
        { type: 'reasoning', content: 'b'.repeat(100 * 1024) },
        { type: 'text', content: 'c'.repeat(100 * 1024) },
        { type: 'reasoning', content: 'd'.repeat(100 * 1024) },
      ];
      const messageWrapper = JSON.stringify({
        version: '0.1.0',
        messages: [{
          role: 'user',
          parts: regularParts,
        }],
      });

      const span = {
        traceId: '00000000000000000000000000000001',
        spanId: '0000000000000002',
        name: 'test',
        kind: 'INTERNAL',
        startTimeUnixNano: 0,
        endTimeUnixNano: 1,
        attributes: {
          'gen_ai.input.messages': messageWrapper,
        } as Record<string, unknown>,
        status: { code: 'UNSET' },
      };

      const result = truncateSpan(span);
      const resultSize = Buffer.byteLength(JSON.stringify(result), 'utf8');
      expect(resultSize).toBeLessThanOrEqual(MAX_SPAN_SIZE_BYTES);

      const parsed = JSON.parse(result.attributes!['gen_ai.input.messages'] as string);
      const truncatedCount = parsed.messages[0].parts
        .filter((part: Record<string, unknown>) => typeof part.content === 'string' && (part.content as string).includes('… [truncated]'))
        .length;
      expect(truncatedCount).toBeGreaterThan(1);
    });

    it('should not throw when shrink actions are exhausted and span still exceeds limit', () => {
      // Create a span where non-string/non-message attributes make it huge and unshrinkable.
      // Use number arrays which are not shrinkable by the shrinker.
      const hugeArray = new Array(100000).fill(42);
      const span = {
        traceId: '00000000000000000000000000000001',
        spanId: '0000000000000002',
        name: 'test',
        kind: 'INTERNAL',
        startTimeUnixNano: 0,
        endTimeUnixNano: 1,
        attributes: {
          'non_shrinkable_1': hugeArray,
          'non_shrinkable_2': hugeArray,
          'small_string': 'hello',
        } as Record<string, unknown>,
        status: { code: 'UNSET' },
      };

      // Should not throw
      const result = truncateSpan(span);
      // The span is still returned even though it exceeds the limit
      expect(result.attributes).toBeDefined();
      // Phase 2 fallback replaces string attributes with overlimit sentinel
      expect(result.attributes!['small_string']).toBe('[overlimit]');
      // The result may still exceed MAX_SPAN_SIZE_BYTES since there are no shrinkable attributes
      const resultSize = Buffer.byteLength(JSON.stringify(result), 'utf8');
      expect(resultSize).toBeGreaterThan(MAX_SPAN_SIZE_BYTES);
    });

    it('should only trim the excess bytes, preserving as much content as possible', () => {
      // A single large text part that slightly exceeds the limit.
      // After trimming, most of the content should be preserved.

      const textSize = MAX_SPAN_SIZE_BYTES + 5000; // only ~5KB over
      const messageWrapper = JSON.stringify({
        version: '0.1.0',
        messages: [{
          role: 'user',
          parts: [{ type: 'text', content: 'x'.repeat(textSize) }]
        }]
      });

      const span = {
        traceId: '00000000000000000000000000000001',
        spanId: '0000000000000002',
        name: 'test',
        kind: 'INTERNAL',
        startTimeUnixNano: 0,
        endTimeUnixNano: 1,
        attributes: {
          'gen_ai.input.messages': messageWrapper,
        } as Record<string, unknown>,
        status: { code: 'UNSET' },
      };

      const result = truncateSpan(span);
      const parsed = JSON.parse(result.attributes!['gen_ai.input.messages'] as string);
      const trimmedContent = parsed.messages[0].parts[0].content as string;

      expect(trimmedContent).toContain('… [truncated]');
      // The trimmed content should retain most of the original — at least 90%
      const trimmedLength = Buffer.byteLength(trimmedContent, 'utf8');
      expect(trimmedLength).toBeGreaterThan(textSize * 0.9);
      expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(MAX_SPAN_SIZE_BYTES);
    });

    it('should leave other fields untouched when trimming the largest field is sufficient', () => {
      // Two text fields: one very large (~300KB), one medium (~50KB).
      // Only the largest should be trimmed; the medium one should be preserved intact.
      const largeContent = 'L'.repeat(300 * 1024);
      const mediumContent = 'M'.repeat(50 * 1024);
      const messageWrapper = JSON.stringify({
        version: '0.1.0',
        messages: [{
          role: 'user',
          parts: [
            { type: 'text', content: largeContent },
            { type: 'text', content: mediumContent },
          ]
        }]
      });

      const span = {
        traceId: '00000000000000000000000000000001',
        spanId: '0000000000000002',
        name: 'test',
        kind: 'INTERNAL',
        startTimeUnixNano: 0,
        endTimeUnixNano: 1,
        attributes: {
          'gen_ai.input.messages': messageWrapper,
        } as Record<string, unknown>,
        status: { code: 'UNSET' },
      };

      const result = truncateSpan(span);
      const parsed = JSON.parse(result.attributes!['gen_ai.input.messages'] as string);

      // The large field was trimmed
      expect((parsed.messages[0].parts[0].content as string)).toContain('… [truncated]');
      // The medium field should be fully preserved
      expect(parsed.messages[0].parts[1].content).toBe(mediumContent);
      expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(MAX_SPAN_SIZE_BYTES);
    });

    it('should skip strings shorter than 50 bytes during truncation', () => {
      // Many small strings (under 50 bytes each) plus one huge non-shrinkable array.
      // The small strings should not be trimmed (only replaced in phase 4 fallback).
      const span = {
        traceId: '00000000000000000000000000000001',
        spanId: '0000000000000002',
        name: 'test',
        kind: 'INTERNAL',
        startTimeUnixNano: 0,
        endTimeUnixNano: 1,
        attributes: {
          'short_a': 'a'.repeat(49), // 49 bytes — under threshold
          'short_b': 'b'.repeat(30),
          'large_string': 'x'.repeat(MAX_SPAN_SIZE_BYTES),
        } as Record<string, unknown>,
        status: { code: 'UNSET' },
      };

      const result = truncateSpan(span);
      // short strings should be preserved (not truncated via phase 1)
      expect(result.attributes!['short_a']).toBe('a'.repeat(49));
      expect(result.attributes!['short_b']).toBe('b'.repeat(30));
      // large string gets trimmed
      expect((result.attributes!['large_string'] as string)).toContain('… [truncated]');
      expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(MAX_SPAN_SIZE_BYTES);
    });

    it('should only remove enough blobs to fit under the limit', () => {
      // 6 blobs of 45KB each = 270KB > 250KB limit.
      // Shrink phase should replace blobs one at a time until under limit.
      const blobSize = 45 * 1024;
      const numBlobs = 6;
      const blobParts = Array.from({ length: numBlobs }, () => ({
        type: 'blob' as const,
        modality: 'image',
        mime_type: 'image/png',
        content: 'x'.repeat(blobSize),
      }));
      const messageWrapper = JSON.stringify({
        version: '0.1.0',
        messages: [{ role: 'user', parts: blobParts }],
      });

      const span = {
        traceId: '00000000000000000000000000000001',
        spanId: '0000000000000002',
        name: 'test',
        kind: 'INTERNAL',
        startTimeUnixNano: 0,
        endTimeUnixNano: 1,
        attributes: {
          'gen_ai.input.messages': messageWrapper,
        } as Record<string, unknown>,
        status: { code: 'UNSET' },
      };

      const result = truncateSpan(span);
      const resultSize = Buffer.byteLength(JSON.stringify(result), 'utf8');
      expect(resultSize).toBeLessThanOrEqual(MAX_SPAN_SIZE_BYTES);

      const parsed = JSON.parse(result.attributes!['gen_ai.input.messages'] as string);
      const sentinelCount = parsed.messages[0].parts
        .filter((p: Record<string, unknown>) => p.content === '[blob truncated]').length;
      const preservedCount = parsed.messages[0].parts
        .filter((p: Record<string, unknown>) => p.content !== '[blob truncated]').length;
      // Some blobs should be preserved — not all replaced
      expect(sentinelCount).toBeGreaterThan(0);
      expect(preservedCount).toBeGreaterThan(0);
    });

    it('should use structured overflow sentinel for message attributes in phase 4 fallback', () => {
      // Make the span exceed the limit with non-shrinkable arrays, plus a message attribute
      // that phase 1 cannot shrink enough. Phase 2 should replace it with the overflow sentinel.
      const hugeArray = new Array(100000).fill(42);
      const messageWrapper = JSON.stringify({
        version: '0.1.0',
        messages: [
          { role: 'user', parts: [{ type: 'text', content: 'hello user' }] },
          { role: 'assistant', parts: [{ type: 'text', content: 'hello back' }] },
          { role: 'user', parts: [{ type: 'text', content: 'another msg' }] },
        ],
      });

      const span = {
        traceId: '00000000000000000000000000000001',
        spanId: '0000000000000002',
        name: 'test',
        kind: 'INTERNAL',
        startTimeUnixNano: 0,
        endTimeUnixNano: 1,
        attributes: {
          'non_shrinkable': hugeArray,
          'gen_ai.input.messages': messageWrapper,
        } as Record<string, unknown>,
        status: { code: 'UNSET' },
      };

      const result = truncateSpan(span);
      // The message attribute should be replaced with the overflow sentinel
      const sentinelValue = result.attributes!['gen_ai.input.messages'] as string;
      const parsed = JSON.parse(sentinelValue);
      expect(parsed.version).toBe('0.1.0');
      expect(parsed.messages).toHaveLength(1);
      expect(parsed.messages[0].role).toBe('system');
      expect(parsed.messages[0].parts[0].type).toBe('text');
      expect(parsed.messages[0].parts[0].content).toBe('[truncated: 3 messages exceeded limit]');
    });

    it('should replace oversized raw dict in gen_ai.output.messages with overlimit sentinel', () => {
      // Raw dict plus other large attr to push span over 250KB limit
      const rawDict = JSON.stringify({ result: 'x'.repeat(200 * 1024) });
      const span = makeSpan({
        'gen_ai.output.messages': rawDict,
        'other_large': 'y'.repeat(100 * 1024),
      });

      const result = truncateSpan(span);
      // Raw dict (no version field) should get OVERLIMIT_SENTINEL, not message-aware shrinking
      expect(result.attributes!['gen_ai.output.messages']).toBe('[overlimit]');
      expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(MAX_SPAN_SIZE_BYTES);
    });

    it('should replace oversized dict with messages array but no version with overlimit sentinel', () => {
      const dictWithMessages = JSON.stringify({ messages: ['y'.repeat(200 * 1024)], type: 'tool_result' });
      const span = makeSpan({
        'gen_ai.output.messages': dictWithMessages,
        'other_large': 'z'.repeat(100 * 1024),
      });

      const result = truncateSpan(span);
      // Has messages array but no version string — must NOT be treated as versioned wrapper
      expect(result.attributes!['gen_ai.output.messages']).toBe('[overlimit]');
      expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(MAX_SPAN_SIZE_BYTES);
    });

    it('should preserve small raw dict in gen_ai.output.messages when span is within limit', () => {
      const smallDict = JSON.stringify({ result: 'ok', count: 42 });
      const span = makeSpan({
        'gen_ai.output.messages': smallDict,
        'gen_ai.agent.id': 'test-agent',
      });

      const result = truncateSpan(span);
      // Small dict should be preserved as-is
      expect(result.attributes!['gen_ai.output.messages']).toBe(smallDict);
    });

    it('should still use message-aware shrinking for versioned wrapper in gen_ai.output.messages', () => {
      const messageWrapper = JSON.stringify({
        version: '0.1.0',
        messages: [{
          role: 'assistant',
          parts: [{ type: 'text', content: 'z'.repeat(200 * 1024) }],
        }],
      });
      const span = makeSpan({
        'gen_ai.output.messages': messageWrapper,
        'other_large': 'a'.repeat(100 * 1024),
      });

      const result = truncateSpan(span);
      const output = result.attributes!['gen_ai.output.messages'] as string;
      // Versioned wrapper should get message-aware shrinking (trimmed text), not sentinel
      expect(output).not.toBe('[overlimit]');
      const parsed = JSON.parse(output);
      expect(parsed.version).toBe('0.1.0');
      expect(parsed.messages[0].parts[0].type).toBe('text');
      // Text content should be trimmed (shorter than original)
      expect(parsed.messages[0].parts[0].content.length).toBeLessThan(200 * 1024);
      expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(MAX_SPAN_SIZE_BYTES);
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
