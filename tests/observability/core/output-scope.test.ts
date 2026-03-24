// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace, context as otelContext } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import {
  OutputScope,
  AgentDetails,
  OutputResponse,
  OpenTelemetryConstants,
  ParentSpanRef,
} from '@microsoft/agents-a365-observability';

describe('OutputScope', () => {
  const testAgentDetails: AgentDetails = {
    agentId: 'test-agent-123',
    agentName: 'Test Agent',
    agentDescription: 'A test agent for output scope testing',
    tenantId: '12345678-1234-5678-1234-567812345678',
  };

  const testRequest = { conversationId: 'test-conv-out', channel: { name: 'OutputChannel', description: 'https://output.channel' } };

  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let flushProvider: any;
  let contextManager: AsyncLocalStorageContextManager;

  beforeAll(() => {
    contextManager = new AsyncLocalStorageContextManager();
    contextManager.enable();
    otelContext.setGlobalContextManager(contextManager);

    exporter = new InMemorySpanExporter();
    const processor = new SimpleSpanProcessor(exporter);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const globalProvider: any = trace.getTracerProvider();
    if (globalProvider && typeof globalProvider.addSpanProcessor === 'function') {
      globalProvider.addSpanProcessor(processor);
      flushProvider = globalProvider;
    } else {
      provider = new BasicTracerProvider({
        spanProcessors: [processor]
      });
      trace.setGlobalTracerProvider(provider);
      flushProvider = provider;
    }
  });

  beforeEach(() => {
    exporter.reset();
  });

  afterAll(async () => {
    exporter.reset();
    await provider?.shutdown?.();
    contextManager.disable();
    otelContext.disable();
  });

  function getLastSpan() {
    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBeGreaterThan(0);
    const span = spans[spans.length - 1];
    return { span, attributes: span.attributes };
  }

  it('should create scope with correct span attributes and output messages', async () => {
    const response: OutputResponse = { messages: ['First message', 'Second message'] };

    const scope = OutputScope.start(
      { conversationId: 'conv-out-1', channel: { name: 'Email', description: 'https://email.link' } },
      response, testAgentDetails
    );
    expect(scope).toBeInstanceOf(OutputScope);
    scope.dispose();

    await flushProvider.forceFlush();
    const { span, attributes } = getLastSpan();

    expect(span.name).toBe('output_messages Test Agent');
    expect(attributes[OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY]).toBe('output_messages');
    expect(attributes[OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]).toBe(testAgentDetails.agentId);
    expect(attributes[OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY]).toBe(testAgentDetails.agentName);
    expect(attributes[OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY]).toBe('conv-out-1');
    expect(attributes[OpenTelemetryConstants.CHANNEL_NAME_KEY]).toBe('Email');
    expect(attributes[OpenTelemetryConstants.CHANNEL_LINK_KEY]).toBe('https://email.link');
    const parsed = JSON.parse(attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY] as string);
    expect(parsed).toEqual(['First message', 'Second message']);
  });

  it('should append messages with recordOutputMessages and flush on dispose', async () => {
    const response: OutputResponse = { messages: ['Initial'] };

    const scope = OutputScope.start(testRequest, response, testAgentDetails);
    scope.recordOutputMessages(['Appended 1']);
    scope.recordOutputMessages(['Appended 2', 'Appended 3']);
    scope.dispose();

    await flushProvider.forceFlush();
    const { attributes } = getLastSpan();

    const parsed = JSON.parse(attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY] as string);
    expect(parsed).toEqual(['Initial', 'Appended 1', 'Appended 2', 'Appended 3']);
  });

  it('should use parent span reference for linking', async () => {
    const parentTraceId = '1234567890abcdef1234567890abcdef';
    const parentSpanId = 'abcdefabcdef1234';

    const scope = OutputScope.start(
      {}, { messages: ['Test'] }, testAgentDetails,
      undefined, { parentContext: { traceId: parentTraceId, spanId: parentSpanId } as ParentSpanRef }
    );
    scope.dispose();

    await flushProvider.forceFlush();
    const { span } = getLastSpan();
    expect(span.spanContext().traceId).toBe(parentTraceId);
    expect(span.parentSpanContext?.spanId).toBe(parentSpanId);
  });
});
