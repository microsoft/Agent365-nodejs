// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { context, trace } from '@opentelemetry/api';
import { ObservabilityManager } from '@microsoft/agents-a365-observability/src/ObservabilityManager';
import { OpenTelemetryConstants } from '@microsoft/agents-a365-observability/src/tracing/constants';
import type { TokenResolver } from '@microsoft/agents-a365-observability';

const tenantId = '11111111-1111-1111-1111-111111111111';
const agentId = '22222222-2222-2222-2222-222222222222';
const originalFetch = global.fetch;

function appToken(): string {
  const claims = {
    idtyp: 'app', azp: agentId, tid: tenantId,
    aud: '9b975845-388f-4429-889e-eab1ef63949c',
    exp: Math.floor(Date.now() / 1000) + 300,
  };
  return `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.offline-signature`;
}

describe('ObservabilityManager.start exporter options', () => {
  let originalEnv: NodeJS.ProcessEnv;
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
  });

  afterEach(async () => {
    await ObservabilityManager.shutdown();
    trace.disable();
    context.disable();
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  async function emitSpan(): Promise<void> {
    trace.getTracer('manager-exporter-options').startSpan('invoke_agent offline', {
      attributes: {
        [OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY]: 'invoke_agent',
        [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]: agentId,
        [OpenTelemetryConstants.TENANT_ID_KEY]: tenantId,
      },
    }).end();
    // Span completion schedules asynchronous token resolution and export.
    await new Promise<void>(resolve => setImmediate(resolve));
  }

  it('forwards exporterOptions.tokenResolver so the documented migration path starts and exports', async () => {
    const expectedToken = appToken();
    const resolver = jest.fn<TokenResolver>(async () => expectedToken);

    // Without forwarding, start() throws because the exporter requires an app-only resolver.
    expect(() => ObservabilityManager.start({
      serviceName: 'manager-exporter-options',
      exporterOptions: { tokenResolver: resolver },
    })).not.toThrow();
    await emitSpan();

    expect(resolver).toHaveBeenCalledWith(agentId, tenantId);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`https://agent365.svc.cloud.microsoft/observabilityService/tenants/${tenantId}/otlp/agents/${agentId}/traces?api-version=1`);
    expect(requests[0].headers.get('authorization')).toBe(`Bearer ${expectedToken}`);
  });

  it('keeps the top-level tokenResolver ahead of exporterOptions.tokenResolver', async () => {
    const expectedToken = appToken();
    const resolver = jest.fn<TokenResolver>(async () => expectedToken);
    const overridden = jest.fn<TokenResolver>(async () => 'must-not-be-used');

    ObservabilityManager.start({
      serviceName: 'manager-exporter-options',
      tokenResolver: resolver,
      exporterOptions: { tokenResolver: overridden },
    });
    await emitSpan();

    expect(resolver).toHaveBeenCalledWith(agentId, tenantId);
    expect(overridden).not.toHaveBeenCalled();
    expect(requests[0].headers.get('authorization')).toBe(`Bearer ${expectedToken}`);
  });
});
