// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace, context as otelContext } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import {
  InputScope,
  AgentDetails,
  TenantDetails,
  CallerDetails,
  AgentRequest,
  OpenTelemetryConstants,
  ParentSpanRef,
} from '@microsoft/agents-a365-observability';

describe('InputScope', () => {
  const testAgentDetails: AgentDetails = {
    agentId: 'test-agent-123',
    agentName: 'Test Agent',
    agentDescription: 'A test agent for input scope testing',
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

  it('should create scope with correct span attributes', async () => {
    const request: AgentRequest = { content: 'Hello agent' };

    const scope = InputScope.start(request, testAgentDetails, testTenantDetails);
    expect(scope).toBeInstanceOf(InputScope);
    scope.dispose();

    await flushProvider.forceFlush();
    const { span, attributes } = getLastSpan();

    expect(span.name).toBe('input_messages Test Agent');
    expect(attributes[OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY]).toBe('input_messages');
    expect(attributes[OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]).toBe(testAgentDetails.agentId);
    expect(attributes[OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY]).toBe(testAgentDetails.agentName);
    expect(attributes[OpenTelemetryConstants.TENANT_ID_KEY]).toBe(testTenantDetails.tenantId);
    expect(JSON.parse(attributes[OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY] as string)).toEqual(['Hello agent']);
  });

  it('should not set input messages when content is missing or empty', async () => {
    for (const content of [undefined, '']) {
      exporter.reset();
      const request: AgentRequest = content === undefined ? {} : { content };
      const scope = InputScope.start(request, testAgentDetails, testTenantDetails);
      scope.dispose();

      await flushProvider.forceFlush();
      const { attributes } = getLastSpan();
      expect(attributes[OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY]).toBeUndefined();
    }
  });

  it('should append messages with recordInputMessages and flush on dispose', async () => {
    const request: AgentRequest = { content: 'Initial' };
    const scope = InputScope.start(request, testAgentDetails, testTenantDetails);

    scope.recordInputMessages(['Appended 1']);
    scope.recordInputMessages(['Appended 2', 'Appended 3']);
    scope.dispose();

    await flushProvider.forceFlush();
    const { attributes } = getLastSpan();
    const parsed = JSON.parse(attributes[OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY] as string);
    expect(parsed).toEqual(['Initial', 'Appended 1', 'Appended 2', 'Appended 3']);
  });

  it('should use parent span reference for linking', async () => {
    const parentTraceId = '1234567890abcdef1234567890abcdef';
    const parentSpanId = 'abcdefabcdef1234';

    const scope = InputScope.start(
      { content: 'Test' }, testAgentDetails, testTenantDetails,
      undefined, undefined, { traceId: parentTraceId, spanId: parentSpanId } as ParentSpanRef
    );
    scope.dispose();

    await flushProvider.forceFlush();
    const { span } = getLastSpan();
    expect(span.spanContext().traceId).toBe(parentTraceId);
    expect(span.parentSpanContext?.spanId).toBe(parentSpanId);
  });

  it('should set caller details and conversationId on the span', async () => {
    const callerDetails: CallerDetails = {
      callerId: 'caller-oid-123',
      callerUpn: 'caller@contoso.com',
      callerName: 'Test Caller',
      tenantId: 'caller-tenant-456',
      callerClientIp: '10.0.0.1',
    };

    const scope = InputScope.start(
      { content: 'Test' }, testAgentDetails, testTenantDetails,
      callerDetails, 'conv-42'
    );
    scope.dispose();

    await flushProvider.forceFlush();
    const { attributes } = getLastSpan();
    expect(attributes[OpenTelemetryConstants.GEN_AI_CALLER_ID_KEY]).toBe('caller-oid-123');
    expect(attributes[OpenTelemetryConstants.GEN_AI_CALLER_UPN_KEY]).toBe('caller@contoso.com');
    expect(attributes[OpenTelemetryConstants.GEN_AI_CALLER_NAME_KEY]).toBe('Test Caller');
    expect(attributes[OpenTelemetryConstants.GEN_AI_CALLER_TENANT_ID_KEY]).toBe('caller-tenant-456');
    expect(attributes[OpenTelemetryConstants.GEN_AI_CALLER_CLIENT_IP_KEY]).toBe('10.0.0.1');
    expect(attributes[OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY]).toBe('conv-42');
  });

  it('should use agentName in span name, falling back to agentId', async () => {
    const scope1 = InputScope.start({ content: 'Test' }, { agentId: 'id-1', agentName: 'My Agent' }, testTenantDetails);
    scope1.dispose();
    await flushProvider.forceFlush();
    expect(getLastSpan().span.name).toBe('input_messages My Agent');

    exporter.reset();
    const scope2 = InputScope.start({ content: 'Test' }, { agentId: 'id-only' }, testTenantDetails);
    scope2.dispose();
    await flushProvider.forceFlush();
    expect(getLastSpan().span.name).toBe('input_messages id-only');
  });
});
