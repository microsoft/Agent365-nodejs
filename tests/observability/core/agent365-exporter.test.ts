// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Agent365Exporter } from '@microsoft/agents-a365-observability/src/tracing/exporter/Agent365Exporter';
import { Agent365ExporterOptions } from '@microsoft/agents-a365-observability/src/tracing/exporter/Agent365ExporterOptions';
import { AgenticTokenCacheInstance } from '@microsoft/agents-a365-observability/src/utils/AgenticTokenCache';
// Using standard import instead of 'import type' to avoid Babel/Jest transform issues in this workspace
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { ExportResultCode } from '@opentelemetry/core';
import { OpenTelemetryConstants } from '@microsoft/agents-a365-observability/src/tracing/constants';

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
    AgenticTokenCacheInstance.clear();
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
        [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]: agentId
      })
    ];

    const callback = jest.fn();
    await exporter.export(spans, callback);
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
    // Ensure fetch saw auth header
    const fetchCalls = (global.fetch as unknown as { mock: { calls: any[] } }).mock.calls;
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
  });

  it('falls back to AgenticTokenCache when no custom resolver provided', async () => {
    mockFetchSequence([200]);
    // Preload cache
    const tenant = tenantId;
    const agent = agentId;
    const key = AgenticTokenCacheInstance.createCacheKey(agent, tenant);
    AgenticTokenCacheInstance.set(key, 'cached-token');

    const opts = new Agent365ExporterOptions();
    opts.clusterCategory = 'local'; // no tokenResolver assigned -> fallback to cache
    const exporter = new Agent365Exporter(opts); // no resolver provided
    const spans = [
      makeSpan({
        [OpenTelemetryConstants.TENANT_ID_KEY]: tenant,
        [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]: agent
      })
    ];
    const callback = jest.fn();
    await exporter.export(spans, callback);
    expect(callback).toHaveBeenCalledWith({ code: ExportResultCode.SUCCESS });
    const fetchCalls = (global.fetch as unknown as { mock: { calls: any[] } }).mock.calls;
    expect(fetchCalls.length).toBe(1);
    const headersArg = fetchCalls[0][1].headers;
    expect(headersArg['authorization']).toBe('Bearer cached-token');
    // Validate payload structure
    const bodyStr = fetchCalls[0][1].body as string;
    expect(typeof bodyStr).toBe('string');
    const bodyJson = JSON.parse(bodyStr);
    expect(Array.isArray(bodyJson.resourceSpans)).toBe(true);
    expect(bodyJson.resourceSpans.length).toBe(1);
    // console.log('[test] resourceSpans:', JSON.stringify(bodyJson.resourceSpans, null, 2));
    const rs = bodyJson.resourceSpans[0];
    expect(Array.isArray(rs.scopeSpans)).toBe(true);
    expect(rs.scopeSpans.length).toBe(1);
    const scopeSpan = rs.scopeSpans[0];
    expect(Array.isArray(scopeSpan.spans)).toBe(true);
    expect(scopeSpan.spans.length).toBe(1);
    const span = scopeSpan.spans[0];
    expect(span.name).toBe('test');
    expect(span.traceId).toEqual('00000000000000000000000000000001');
    expect(span.spanId).toEqual('0000000000000002');
    expect(span.attributes).toBeDefined();
    expect(span.attributes[OpenTelemetryConstants.TENANT_ID_KEY]).toBe(tenant);
    expect(span.attributes[OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]).toBe(agent);
    // Validate local cluster endpoint format
    const urlArg = fetchCalls[0][0] as string;
    expect(urlArg).toContain('localhost');
  });
});
