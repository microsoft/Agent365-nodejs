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
    { cluster: 'prod', customDomainEnabled: true, expectedCustomDomainUrl: 'https://agent365.svc.cloud.microsoft', token: 'tok-prod' },
    { cluster: 'preprod', customDomainEnabled: true, expectedCustomDomainUrl: 'https://preprod.agent365.svc.cloud.dev.microsoft', token: 'tok-preprod' },
    { cluster: 'prod', customDomainEnabled: false, expectedCustomDomainUrl: 'https://${endpoint}/maven/agent365/agents/${agentId}/traces?api-version=1', token: 'tok-prod-disabled' }
  ])('exports with custom domain flag=%s cluster=%s', async ({ cluster, customDomainEnabled, expectedCustomDomainUrl, token }) => {
    mockFetchSequence([200]);
    if (customDomainEnabled) {
      process.env.A365_OBSERVABILITY_USE_CUSTOM_DOMAIN = 'true';
    } else {
      delete process.env.A365_OBSERVABILITY_USE_CUSTOM_DOMAIN;
    }
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
    if (customDomainEnabled) {
      // Exact custom domain URL expected
      expect(urlArg).toBe(expectedCustomDomainUrl);
      expect(headersArg['x-ms-tenant-id']).toBe(tenantId);
    } else {    
      // Default discovery URL should include path with /maven/agent365/agents/{agentId}/traces
      const discoveryRegex = new RegExp(`^https://[\\w.-]+/maven/agent365/agents/${agentId}/traces\\?api-version=1$`, 'i');
      expect(urlArg).toMatch(discoveryRegex);
      expect(headersArg['x-ms-tenant-id']).toBeUndefined();
    }
    expect(headersArg['authorization']).toBe(`Bearer ${token}`);
    delete process.env.A365_OBSERVABILITY_USE_CUSTOM_DOMAIN;
  });

  it('requires a tokenResolver and fails export when missing', async () => {
    const opts = new Agent365ExporterOptions();
    opts.clusterCategory = 'local';
    // Intentionally omit tokenResolver
    expect(() => new Agent365Exporter(opts)).toThrow(/tokenResolver must be provided/);
  });
});
