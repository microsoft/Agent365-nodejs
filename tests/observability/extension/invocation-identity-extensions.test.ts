// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { context } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  InvocationIdentityResolutionSource,
  InvocationRole,
  OpenTelemetryConstants,
  runWithResolvedInvocationIdentity,
} from '@microsoft/agents-a365-observability';
import { SpanProcessor } from '../../../packages/agents-a365-observability/src/tracing/processors/SpanProcessor';
import { LangChainTracer } from '../../../packages/agents-a365-observability-extensions-langchain/src/tracer';
import { OpenAIAgentsTraceProcessor } from '../../../packages/agents-a365-observability-extensions-openai/src/OpenAIAgentsTraceProcessor';

const HUMAN_OID = '11111111-1111-4111-8111-111111111111';
const TARGET_AGENT_ID = '77777777-7777-4777-8777-777777777777';
const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('extension span invocation identity', () => {
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
  });

  async function runWithHumanIdentity(callback: () => Promise<void>): Promise<void> {
    await runWithResolvedInvocationIdentity({
      role: InvocationRole.Human,
      humanOid: HUMAN_OID,
      targetAgentId: TARGET_AGENT_ID,
      tenantId: TENANT_ID,
      resolutionSource: InvocationIdentityResolutionSource.Composite,
    }, callback);
  }

  it('enriches LangChain spans', async () => {
    const tracer = new LangChainTracer(provider.getTracer('langchain-identity-test'));
    const run = {
      id: 'langchain-run-1',
      name: 'ChatModel',
      run_type: 'llm',
      start_time: Date.now(),
      inputs: { messages: [] },
      outputs: {},
      serialized: {},
      tags: [],
      extra: {},
    } as any;

    await runWithHumanIdentity(async () => {
      await tracer.onRunCreate(run);
    });
    await (tracer as any)._endTrace({ ...run, end_time: Date.now() });
    await provider.forceFlush();

    const span = exporter.getFinishedSpans().find(
      candidate => candidate.attributes[OpenTelemetryConstants.GEN_AI_PROVIDER_NAME_KEY] === 'langchain',
    );
    expect(span?.attributes[OpenTelemetryConstants.USER_ID_KEY]).toBe(HUMAN_OID);
    expect(span?.attributes[OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]).toBe(TARGET_AGENT_ID);
    expect(span?.attributes[OpenTelemetryConstants.TENANT_ID_KEY]).toBe(TENANT_ID);
  });

  it('enriches OpenAI Agents spans', async () => {
    const processor = new OpenAIAgentsTraceProcessor(
      provider.getTracer('openai-identity-test'),
    );
    const span = {
      spanId: 'openai-span-1',
      traceId: 'openai-trace-1',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      spanData: {
        type: 'generation',
        name: 'Generate',
        model: 'gpt-4o',
      },
    } as any;

    await runWithHumanIdentity(async () => {
      await processor.onSpanStart(span);
    });
    await processor.onSpanEnd(span);
    await provider.forceFlush();

    const exported = exporter.getFinishedSpans().find(
      candidate => candidate.attributes[OpenTelemetryConstants.GEN_AI_PROVIDER_NAME_KEY] === 'openai',
    );
    expect(exported?.attributes[OpenTelemetryConstants.USER_ID_KEY]).toBe(HUMAN_OID);
    expect(exported?.attributes[OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]).toBe(TARGET_AGENT_ID);
    expect(exported?.attributes[OpenTelemetryConstants.TENANT_ID_KEY]).toBe(TENANT_ID);

    await processor.shutdown();
  });
});
