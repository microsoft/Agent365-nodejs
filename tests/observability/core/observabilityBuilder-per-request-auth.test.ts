// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { context, trace } from '@opentelemetry/api';
import { ObservabilityBuilder } from '@microsoft/agents-a365-observability/src/ObservabilityBuilder';
import { OpenTelemetryConstants } from '@microsoft/agents-a365-observability/src/tracing/constants';
import { runWithExportToken } from '@microsoft/agents-a365-observability/src/tracing/context/token-context';
import type { TokenResolver } from '@microsoft/agents-a365-observability';

const tenantId = '11111111-1111-1111-1111-111111111111';
const agentId = '22222222-2222-2222-2222-222222222222';
const originalFetch = global.fetch;

function token(claims: Record<string, unknown>): string {
  return `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.offline-signature`;
}

function appToken(agent = agentId, tenant = tenantId): string {
  return token({
    idtyp: 'app', azp: agent, tid: tenant,
    aud: '9b975845-388f-4429-889e-eab1ef63949c',
    exp: Math.floor(Date.now() / 1000) + 300,
  });
}

describe('ObservabilityBuilder per-request OBS authentication', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let builder: ObservabilityBuilder;
  let requests: Request[];

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.ENABLE_A365_OBSERVABILITY_EXPORTER = 'true';
    process.env.ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT = 'true';
    delete process.env.A365_OBSERVABILITY_DOMAIN_OVERRIDE;
    requests = [];
    global.fetch = jest.fn<typeof fetch>(async (input, init) => {
      requests.push(new Request(input, init));
      return new Response('{}', { status: 200 });
    });
    builder = new ObservabilityBuilder().withService('per-request-auth-regression');
  });

  afterEach(async () => {
    await builder.shutdown();
    trace.disable();
    context.disable();
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  async function invoke(agent = agentId, tenant = tenantId, contextToken?: string): Promise<void> {
    const emit = () => {
      trace.getTracer('per-request-auth-regression').startSpan('invoke_agent offline', {
        attributes: {
          [OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY]: 'invoke_agent',
          [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]: agent,
          [OpenTelemetryConstants.TENANT_ID_KEY]: tenant,
        },
      }).end();
    };
    if (contextToken === undefined) emit();
    else runWithExportToken(contextToken, emit);
    // Span completion schedules asynchronous token resolution and export.
    await new Promise<void>(resolve => setImmediate(resolve));
  }

  it.each(['builder', 'exporterOptions', 'builderOverride'])('uses the %s app resolver through the real processor and exporter', async (source) => {
    const expectedToken = appToken();
    const resolver = jest.fn<TokenResolver>(async () => expectedToken);
    const overridden = jest.fn<TokenResolver>(async () => 'must-not-be-used');
    builder.withExporterOptions({ useS2SEndpoint: false });
    if (source !== 'builder') {
      builder.withExporterOptions({
        useS2SEndpoint: false,
        tokenResolver: source === 'exporterOptions' ? resolver : overridden,
      });
    }
    if (source !== 'exporterOptions') builder.withTokenResolver(resolver);
    builder.start();

    await invoke(agentId, tenantId, token({ idtyp: 'user', scp: 'User.Read', tid: tenantId }));

    expect(resolver).toHaveBeenCalledWith(agentId, tenantId);
    expect(overridden).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`https://agent365.svc.cloud.microsoft/observabilityService/tenants/${tenantId}/otlp/agents/${agentId}/traces?api-version=1`);
    expect(requests[0].headers.get('authorization')).toBe(`Bearer ${expectedToken}`);
  });

  it('does not require a request-context credential', async () => {
    const resolver = jest.fn<TokenResolver>(async () => appToken());
    builder.withTokenResolver(resolver).start();

    await invoke();

    expect(resolver).toHaveBeenCalledWith(agentId, tenantId);
    expect(requests).toHaveLength(1);
  });

  it('resolves separate app identities for concurrent workload contexts', async () => {
    const otherAgent = '33333333-3333-3333-3333-333333333333';
    const otherTenant = '44444444-4444-4444-4444-444444444444';
    const tokens = new Map([
      [`${agentId}:${tenantId}`, appToken()],
      [`${otherAgent}:${otherTenant}`, appToken(otherAgent, otherTenant)],
    ]);
    const resolver = jest.fn<TokenResolver>(async (agent, tenant) => tokens.get(`${agent}:${tenant}`) ?? null);
    builder.withTokenResolver(resolver).start();

    await Promise.all([
      invoke(agentId, tenantId, token({ scp: 'User.Read', oid: 'first-user' })),
      invoke(otherAgent, otherTenant, token({ scp: 'User.Read', oid: 'second-user' })),
    ]);

    expect(resolver).toHaveBeenCalledTimes(2);
    expect(resolver).toHaveBeenCalledWith(agentId, tenantId);
    expect(resolver).toHaveBeenCalledWith(otherAgent, otherTenant);
    expect(requests).toHaveLength(2);
    for (const [agent, tenant] of [[agentId, tenantId], [otherAgent, otherTenant]]) {
      const request = requests.find(candidate => candidate.headers.get('x-ms-tenant-id') === tenant);
      expect(request?.headers.get('authorization')).toBe(`Bearer ${tokens.get(`${agent}:${tenant}`)}`);
    }
  });

  it('fails configuration without an app resolver when OBS export is enabled', () => {
    expect(() => builder.start())
      .toThrow(/requires an app-only OBS tokenResolver[\s\S]*withTokenResolver/);
    expect(requests).toHaveLength(0);
  });

  it('keeps console-only configuration usable without an app resolver', () => {
    process.env.ENABLE_A365_OBSERVABILITY_EXPORTER = 'false';
    expect(() => builder.start()).not.toThrow();
    expect(requests).toHaveLength(0);
  });
});
