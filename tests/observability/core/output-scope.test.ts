// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace, context as otelContext } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import {
  OutputScope,
  AgentDetails,
  TenantDetails,
  OutputResponse,
  OpenTelemetryConstants,
  ParentSpanRef,
} from '@microsoft/agents-a365-observability';

describe('OutputScope', () => {
  const testAgentDetails: AgentDetails = {
    agentId: 'test-agent-123',
    agentName: 'Test Agent',
    agentDescription: 'A test agent for output scope testing',
  };

  const testTenantDetails: TenantDetails = {
    tenantId: '12345678-1234-5678-1234-567812345678',
  };

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

  it('should create scope with output messages', async () => {
    const response: OutputResponse = { messages: ['First message', 'Second message'] };

    const scope = OutputScope.start(response, testAgentDetails, testTenantDetails);

    expect(scope).toBeInstanceOf(OutputScope);
    scope.dispose();

    await flushProvider.forceFlush();
    const { span, attributes } = getLastSpan();

    // Verify span name contains operation name and agent id
    expect(span.name).toContain('output_messages');
    expect(span.name).toContain(testAgentDetails.agentId);

    // Verify output messages are set as JSON array
    const outputValue = attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY] as string;
    expect(outputValue).toBeDefined();
    const parsed = JSON.parse(outputValue);
    expect(parsed).toEqual(['First message', 'Second message']);
  });

  it('should record output messages by appending to accumulated messages', async () => {
    const response: OutputResponse = { messages: ['Initial'] };

    const scope = OutputScope.start(response, testAgentDetails, testTenantDetails);

    scope.recordOutputMessages(['Appended 1']);
    scope.recordOutputMessages(['Appended 2', 'Appended 3']);

    scope.dispose();

    await flushProvider.forceFlush();
    const { attributes } = getLastSpan();

    const outputValue = attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY] as string;
    expect(outputValue).toBeDefined();
    // All messages should be present (initial + all appended) as JSON array
    const parsed = JSON.parse(outputValue);
    expect(parsed).toEqual(['Initial', 'Appended 1', 'Appended 2', 'Appended 3']);
  });

  it('should use parent span reference to link span to parent context', async () => {
    const response: OutputResponse = { messages: ['Test'] };
    const parentTraceId = '1234567890abcdef1234567890abcdef';
    const parentSpanId = 'abcdefabcdef1234';

    const parentSpanRef: ParentSpanRef = {
      traceId: parentTraceId,
      spanId: parentSpanId,
    };

    const scope = OutputScope.start(response, testAgentDetails, testTenantDetails, parentSpanRef);
    scope.dispose();

    await flushProvider.forceFlush();
    const { span } = getLastSpan();

    // Verify span inherits parent's trace_id
    expect(span.spanContext().traceId).toBe(parentTraceId);

    // Verify span's parent_span_id matches
    expect(span.parentSpanContext?.spanId).toBe(parentSpanId);
  });

  it('should end the span on dispose', async () => {
    const response: OutputResponse = { messages: ['Test'] };

    const scope = OutputScope.start(response, testAgentDetails, testTenantDetails);
    scope.dispose();

    await flushProvider.forceFlush();

    // Verify span was created and ended
    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBe(1);
  });

  it('should create scope with empty messages', async () => {
    const response: OutputResponse = { messages: [] };

    const scope = OutputScope.start(response, testAgentDetails, testTenantDetails);
    scope.dispose();

    await flushProvider.forceFlush();
    const { span } = getLastSpan();
    expect(span.name).toContain('output_messages');
  });

  it('should set gen_ai.operation.name to output_messages', async () => {
    const response: OutputResponse = { messages: ['Test'] };

    const scope = OutputScope.start(response, testAgentDetails, testTenantDetails);
    scope.dispose();

    await flushProvider.forceFlush();
    const { attributes } = getLastSpan();
    expect(attributes[OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY]).toBe('output_messages');
  });

  it('should set agent details on the span', async () => {
    const response: OutputResponse = { messages: ['Test'] };

    const scope = OutputScope.start(response, testAgentDetails, testTenantDetails);
    scope.dispose();

    await flushProvider.forceFlush();
    const { attributes } = getLastSpan();
    expect(attributes[OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]).toBe(testAgentDetails.agentId);
    expect(attributes[OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY]).toBe(testAgentDetails.agentName);
  });

  it('should not throw when recordOutputMessages is called multiple times', () => {
    const response: OutputResponse = { messages: ['Initial'] };

    const scope = OutputScope.start(response, testAgentDetails, testTenantDetails);

    expect(() => {
      scope.recordOutputMessages(['Message 1']);
      scope.recordOutputMessages(['Message 2']);
      scope.recordOutputMessages(['Message 3']);
    }).not.toThrow();

    scope.dispose();
  });
});
