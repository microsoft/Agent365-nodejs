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
  OutputMessage,
  OutputMessages,
  MessageRole,
  FinishReason,
  A365_MESSAGE_SCHEMA_VERSION,
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

  it('should create scope with correct span attributes and output messages (string[])', async () => {
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
    expect(parsed.version).toBe(A365_MESSAGE_SCHEMA_VERSION);
    expect(parsed.messages).toEqual([
      { role: 'assistant', parts: [{ type: 'text', content: 'First message' }] },
      { role: 'assistant', parts: [{ type: 'text', content: 'Second message' }] },
    ]);
    // Separate version attribute should not be set
    expect(attributes[OpenTelemetryConstants.A365_MESSAGES_SCHEMA_VERSION_KEY]).toBeUndefined();
  });

  it('should overwrite messages with recordOutputMessages', async () => {
    const response: OutputResponse = { messages: ['Initial'] };

    const scope = OutputScope.start(testRequest, response, testAgentDetails);
    scope.recordOutputMessages(['Overwritten 1']);
    scope.recordOutputMessages(['Overwritten 2', 'Overwritten 3']);
    scope.dispose();

    await flushProvider.forceFlush();
    const { attributes } = getLastSpan();

    const parsed = JSON.parse(attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY] as string);
    expect(parsed.version).toBe(A365_MESSAGE_SCHEMA_VERSION);
    // Only the last recordOutputMessages call should be present (overwrite semantics)
    expect(parsed.messages).toEqual([
      { role: 'assistant', parts: [{ type: 'text', content: 'Overwritten 2' }] },
      { role: 'assistant', parts: [{ type: 'text', content: 'Overwritten 3' }] },
    ]);
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

  it('should throw when agentDetails.tenantId is missing', () => {
    expect(() => OutputScope.start({}, { messages: ['m'] }, { agentId: 'a' } as AgentDetails)).toThrow('OutputScope: tenantId is required on agentDetails');
  });

  it('should accept structured OutputMessages wrapper without re-wrapping', async () => {
    const structured: OutputMessages = {
      version: A365_MESSAGE_SCHEMA_VERSION,
      messages: [
        { role: MessageRole.ASSISTANT, parts: [{ type: 'text', content: 'Hello structured' }], finish_reason: FinishReason.STOP },
        { role: MessageRole.ASSISTANT, parts: [{ type: 'text', content: 'Second structured' }] },
      ],
    };
    const response: OutputResponse = { messages: structured };

    const scope = OutputScope.start(testRequest, response, testAgentDetails);
    scope.dispose();

    await flushProvider.forceFlush();
    const { attributes } = getLastSpan();
    const parsed = JSON.parse(attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY] as string);
    expect(parsed.version).toBe(A365_MESSAGE_SCHEMA_VERSION);
    // Should pass through as-is, preserving finish_reason and not double-wrapping
    expect(parsed.messages).toEqual(structured.messages);
  });

  it('should accept structured OutputMessages wrapper in recordOutputMessages (overwrite)', async () => {
    const initial: OutputMessages = {
      version: A365_MESSAGE_SCHEMA_VERSION,
      messages: [
        { role: MessageRole.ASSISTANT, parts: [{ type: 'text', content: 'Initial structured' }] },
      ],
    };
    const overwrite: OutputMessages = {
      version: A365_MESSAGE_SCHEMA_VERSION,
      messages: [
        { role: MessageRole.ASSISTANT, parts: [{ type: 'text', content: 'Overwritten structured' }], finish_reason: FinishReason.STOP },
      ],
    };

    const scope = OutputScope.start(testRequest, { messages: initial }, testAgentDetails);
    scope.recordOutputMessages(overwrite);
    scope.dispose();

    await flushProvider.forceFlush();
    const { attributes } = getLastSpan();
    const parsed = JSON.parse(attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY] as string);
    expect(parsed.version).toBe(A365_MESSAGE_SCHEMA_VERSION);
    // Overwrite: only the last call's messages should be present
    expect(parsed.messages).toEqual(overwrite.messages);
  });

  it('should overwrite structured OutputMessages with plain string[]', async () => {
    const initial: OutputMessages = {
      version: A365_MESSAGE_SCHEMA_VERSION,
      messages: [
        { role: MessageRole.ASSISTANT, parts: [{ type: 'text', content: 'Structured initial' }], finish_reason: FinishReason.STOP },
      ],
    };

    const scope = OutputScope.start(testRequest, { messages: initial }, testAgentDetails);
    scope.recordOutputMessages(['Plain string overwrite']);
    scope.dispose();

    await flushProvider.forceFlush();
    const { attributes } = getLastSpan();
    const parsed = JSON.parse(attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY] as string);
    expect(parsed.version).toBe(A365_MESSAGE_SCHEMA_VERSION);
    // Overwrite: only the plain string call should be present
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0]).toEqual({ role: 'assistant', parts: [{ type: 'text', content: 'Plain string overwrite' }] });
  });

  it('should serialize raw dict (tool call result) directly via constructor', async () => {
    const dict = { result: 'ok', count: 42 };
    const scope = OutputScope.start(testRequest, { messages: dict as any }, testAgentDetails);
    scope.dispose();

    await flushProvider.forceFlush();
    const { attributes } = getLastSpan();
    expect(attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY]).toBe(JSON.stringify(dict));
  });

  it('should serialize raw dict (tool call result) directly via recordOutputMessages', async () => {
    const scope = OutputScope.start(testRequest, { messages: ['initial'] }, testAgentDetails);
    const dict = { status: 'success', data: [1, 2, 3] };
    scope.recordOutputMessages(dict as any);
    scope.dispose();

    await flushProvider.forceFlush();
    const { attributes } = getLastSpan();
    // Overwrite: dict replaces initial messages
    expect(attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY]).toBe(JSON.stringify(dict));
  });
});
