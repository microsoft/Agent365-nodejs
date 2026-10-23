// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  context,
  propagation,
  SpanKind,
} from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  InvocationIdentityResolutionSource,
  InvocationRole,
  OpenTelemetryConstants,
  ResolvedInvocationIdentity,
  createContextWithResolvedInvocationIdentity,
  getResolvedInvocationIdentity,
  runWithResolvedInvocationIdentity,
} from '@microsoft/agents-a365-observability';
import { SpanProcessor } from '../../../packages/agents-a365-observability/src/tracing/processors/SpanProcessor';

const HUMAN_OID = '11111111-1111-4111-8111-111111111111';
const CALLER_AGENT_ID = '22222222-2222-4222-8222-222222222222';
const TARGET_AGENT_ID = '33333333-3333-4333-8333-333333333333';
const TARGET_BLUEPRINT_ID = '44444444-4444-4444-8444-444444444444';
const TENANT_ID = '55555555-5555-4555-8555-555555555555';

function humanIdentity(overrides: Partial<ResolvedInvocationIdentity> = {}): ResolvedInvocationIdentity {
  return {
    role: InvocationRole.Human,
    humanOid: HUMAN_OID,
    targetAgentId: TARGET_AGENT_ID,
    targetAgentBlueprintId: TARGET_BLUEPRINT_ID,
    tenantId: TENANT_ID,
    resolutionSource: InvocationIdentityResolutionSource.Composite,
    ...overrides,
  };
}

describe('invocation identity context', () => {
  let contextManager: AsyncLocalStorageContextManager;

  beforeAll(() => {
    contextManager = new AsyncLocalStorageContextManager();
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
  });

  afterAll(() => {
    contextManager.disable();
    context.disable();
  });

  it('stores a frozen copy without mutating the caller object', () => {
    const identity = humanIdentity();
    const identityContext = createContextWithResolvedInvocationIdentity(context.active(), identity);

    identity.humanOid = CALLER_AGENT_ID;
    const stored = getResolvedInvocationIdentity(identityContext);

    expect(stored?.humanOid).toBe(HUMAN_OID);
    expect(Object.isFrozen(stored)).toBe(true);
  });

  it('makes identity available for the complete async callback', async () => {
    await runWithResolvedInvocationIdentity(humanIdentity(), async () => {
      await Promise.resolve();
      expect(getResolvedInvocationIdentity()?.humanOid).toBe(HUMAN_OID);
      expect(propagation.getBaggage(context.active())).toBeUndefined();
    });

    expect(getResolvedInvocationIdentity()).toBeUndefined();
  });
});

describe('SpanProcessor invocation identity enrichment', () => {
  let contextManager: AsyncLocalStorageContextManager;
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;

  beforeEach(() => {
    contextManager = new AsyncLocalStorageContextManager();
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      spanProcessors: [
        new SpanProcessor(),
        new SimpleSpanProcessor(exporter),
      ],
    });
  });

  afterEach(async () => {
    await provider.shutdown();
    contextManager.disable();
    context.disable();
    jest.restoreAllMocks();
  });

  it('stamps resolved identity onto custom spans', async () => {
    const tracer = provider.getTracer('identity-test');

    await runWithResolvedInvocationIdentity(humanIdentity(), async () => {
      tracer.startSpan('custom-span', { kind: SpanKind.INTERNAL }).end();
    });

    await provider.forceFlush();
    const attributes = exporter.getFinishedSpans()[0].attributes;
    expect(attributes[OpenTelemetryConstants.INVOCATION_ROLE_KEY]).toBe(InvocationRole.Human);
    expect(attributes[OpenTelemetryConstants.USER_ID_KEY]).toBe(HUMAN_OID);
    expect(attributes[OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]).toBe(TARGET_AGENT_ID);
    expect(attributes[OpenTelemetryConstants.GEN_AI_AGENT_BLUEPRINT_ID_KEY]).toBe(TARGET_BLUEPRINT_ID);
    expect(attributes[OpenTelemetryConstants.TENANT_ID_KEY]).toBe(TENANT_ID);
  });

  it('preserves explicit nonblank values and replaces blank values', async () => {
    const tracer = provider.getTracer('identity-test');

    await runWithResolvedInvocationIdentity(humanIdentity(), async () => {
      tracer.startSpan('explicit-span', {
        attributes: {
          [OpenTelemetryConstants.USER_ID_KEY]: CALLER_AGENT_ID,
          [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]: '   ',
        },
      }).end();
    });

    await provider.forceFlush();
    const attributes = exporter.getFinishedSpans()[0].attributes;
    expect(attributes[OpenTelemetryConstants.USER_ID_KEY]).toBe(CALLER_AGENT_ID);
    expect(attributes[OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]).toBe(TARGET_AGENT_ID);
  });

  it('blocks baggage from overwriting or filling identity fields', async () => {
    const tracer = provider.getTracer('identity-test');
    let baggage = propagation.createBaggage();
    baggage = baggage.setEntry(OpenTelemetryConstants.USER_ID_KEY, { value: CALLER_AGENT_ID });
    baggage = baggage.setEntry(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_ID_KEY, { value: CALLER_AGENT_ID });
    baggage = baggage.setEntry(OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY, { value: CALLER_AGENT_ID });
    const baggageContext = propagation.setBaggage(context.active(), baggage);

    await context.with(baggageContext, () =>
      runWithResolvedInvocationIdentity(humanIdentity(), async () => {
        tracer.startSpan('baggage-span').end();
      }));

    await provider.forceFlush();
    const attributes = exporter.getFinishedSpans()[0].attributes;
    expect(attributes[OpenTelemetryConstants.USER_ID_KEY]).toBe(HUMAN_OID);
    expect(attributes[OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]).toBe(TARGET_AGENT_ID);
    expect(attributes[OpenTelemetryConstants.GEN_AI_CALLER_AGENT_ID_KEY]).toBeUndefined();
  });

  it('preserves legacy baggage enrichment when local identity is absent', async () => {
    const tracer = provider.getTracer('identity-test');
    const baggage = propagation.createBaggage({
      [OpenTelemetryConstants.USER_ID_KEY]: { value: HUMAN_OID },
    });
    const baggageContext = propagation.setBaggage(context.active(), baggage);

    context.with(baggageContext, () => {
      tracer.startSpan('legacy-span').end();
    });

    await provider.forceFlush();
    expect(
      exporter.getFinishedSpans()[0].attributes[OpenTelemetryConstants.USER_ID_KEY],
    ).toBe(HUMAN_OID);
  });

  it('diagnoses enriched invoke-agent spans and deduplicates warnings', async () => {
    const tracer = provider.getTracer('identity-test');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const identity = humanIdentity({
      role: InvocationRole.Unknown,
      humanOid: undefined,
    });

    await runWithResolvedInvocationIdentity(identity, async () => {
      tracer.startSpan('invoke-one', {
        attributes: {
          [OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY]:
            OpenTelemetryConstants.INVOKE_AGENT_OPERATION_NAME,
        },
      }).end();
      tracer.startSpan('invoke-two', {
        attributes: {
          [OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY]:
            OpenTelemetryConstants.INVOKE_AGENT_OPERATION_NAME,
        },
      }).end();
      tracer.startSpan('not-an-invoke', {
        attributes: {
          [OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY]:
            OpenTelemetryConstants.CHAT_OPERATION_NAME,
        },
      }).end();
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('unknown_invocation_role');
  });
});
