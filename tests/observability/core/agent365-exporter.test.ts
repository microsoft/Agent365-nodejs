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
    delete process.env.A365_OBSERVABILITY_USE_CUSTOM_DOMAIN;
    delete process.env.A365_OBSERVABILITY_DOMAIN_OVERRIDE;
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
        [OpenTelemetryConstants.GEN_AI_CALLER_CLIENT_IP_KEY]: '10.0.0.5',
        [OpenTelemetryConstants.GEN_AI_CALLER_AGENT_CLIENT_IP_KEY]: '1.0.0.5'
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
    expect(exportedSpan.attributes[OpenTelemetryConstants.GEN_AI_CALLER_CLIENT_IP_KEY]).toBe('10.0.0.5');
    expect(exportedSpan.attributes[OpenTelemetryConstants.GEN_AI_CALLER_AGENT_CLIENT_IP_KEY]).toBe('1.0.0.5');
  });

  it.each([
    { cluster: 'prod', expectedUrl: 'https://agent365.svc.cloud.microsoft', token: 'tok-prod' },
    { cluster: 'preprod', expectedUrl: 'https://agent365.svc.cloud.microsoft', token: 'tok-preprod' }
  ])('exports to custom domain when enabled (cluster=%s)', async ({ cluster, expectedUrl, token }) => {
    mockFetchSequence([200]);
    process.env.A365_OBSERVABILITY_USE_CUSTOM_DOMAIN = 'true';
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
    const fetchCalls = (global.fetch as unknown as { mock: { calls: any[] } }).mock.calls;
    expect(fetchCalls.length).toBe(1);
    const urlArg = fetchCalls[0][0];
    const headersArg = fetchCalls[0][1].headers;
    expect(urlArg).toBe(`${expectedUrl}/maven/agent365/agents/${agentId}/traces?api-version=1`);
    expect(headersArg['x-ms-tenant-id']).toBe(tenantId);
    expect(headersArg['authorization']).toBe(`Bearer ${token}`);
  });

  it.each([
    {
      description: 'set to non-empty value and A365_OBSERVABILITY_USE_CUSTOM_DOMAIN is true',
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
    {
      description: 'set to non-empty value and A365_OBSERVABILITY_USE_CUSTOM_DOMAIN is false',
      override: 'https://custom-observability.internal',
      expectedBaseUrl: 'https://custom-observability.internal',
      notUseCustomDomain: true
    },
  ])('uses correct domain when A365_OBSERVABILITY_DOMAIN_OVERRIDE is $description', async ({ override, expectedBaseUrl, notUseCustomDomain }) => {
    mockFetchSequence([200]);
    process.env.A365_OBSERVABILITY_USE_CUSTOM_DOMAIN = notUseCustomDomain ? 'false' : 'true';

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
    const fetchCalls = (global.fetch as unknown as { mock: { calls: any[] } }).mock.calls;
    expect(fetchCalls.length).toBe(1);
    const urlArg = fetchCalls[0][0] as string;
    const headersArg = fetchCalls[0][1].headers as Record<string, string>;

    expect(urlArg).toBe(`${expectedBaseUrl}/maven/agent365/agents/${agentId}/traces?api-version=1`);
    if(!notUseCustomDomain) {
    expect(headersArg['x-ms-tenant-id']).toBe(tenantId);
    } else {
    expect(headersArg['x-ms-tenant-id']).toBeUndefined();
    }
    expect(headersArg['authorization']).toBe(`Bearer ${token}`);
  });

  it('exports to discovery endpoint when custom domain disabled', async () => {
    mockFetchSequence([200]);
    delete process.env.A365_OBSERVABILITY_USE_CUSTOM_DOMAIN;
    const token = 'tok-prod-disabled';
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
    const fetchCalls = (global.fetch as unknown as { mock: { calls: any[] } }).mock.calls;
    expect(fetchCalls.length).toBe(1);
    const urlArg = fetchCalls[0][0];
    const headersArg = fetchCalls[0][1].headers;
    const discoveryRegex = new RegExp(`^https://[\\w.-]+/maven/agent365/agents/${agentId}/traces\\?api-version=1$`, 'i');
    expect(urlArg).toMatch(discoveryRegex);
    expect(headersArg['x-ms-tenant-id']).toBeUndefined();
    expect(headersArg['authorization']).toBe(`Bearer ${token}`);
  });

  it('requires a tokenResolver and fails export when missing', async () => {
    const opts = new Agent365ExporterOptions();
    opts.clusterCategory = 'local';
    // Intentionally omit tokenResolver
    expect(() => new Agent365Exporter(opts)).toThrow(/tokenResolver must be provided/);
  });
  it('uses S2S endpoint path when useS2SEndpoint is true (discovery flow)', async () => {
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
    const fetchCalls = (global.fetch as unknown as { mock: { calls: any[] } }).mock.calls;
    expect(fetchCalls.length).toBe(1);

    const urlArg = fetchCalls[0][0] as string;
    expect(urlArg).toMatch(`/maven/agent365/service/agents/${agentId}/traces?api-version=1`);
    const headersArg = fetchCalls[0][1].headers as Record<string, string>;
    expect(headersArg['authorization']).toBe(`Bearer ${token}`);
  });

  it('uses S2S endpoint path with custom domain and sets x-ms-tenant-id', async () => {
    mockFetchSequence([200]);
    process.env.A365_OBSERVABILITY_USE_CUSTOM_DOMAIN = 'true';
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

    const fetchCalls = (global.fetch as unknown as { mock: { calls: any[] } }).mock.calls;
    expect(fetchCalls.length).toBe(1);
    const urlArg = fetchCalls[0][0] as string;
    expect(urlArg).toMatch(`/maven/agent365/service/agents/${agentId}/traces?api-version=1`);
    const headersArg = fetchCalls[0][1].headers as Record<string, string>;
    expect(headersArg['authorization']).toBe(`Bearer ${token}`);
    expect(headersArg['x-ms-tenant-id']).toBe(tenantId);
  })
});
