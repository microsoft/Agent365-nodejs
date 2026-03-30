// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace, context as otelContext } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

import {
  InferenceScope,
  InvokeAgentScope,
  AgentDetails,
  InferenceDetails,
  InferenceOperationType,
  OpenTelemetryConstants,
  ChatMessage,
  OutputMessage,
  MessageRole,
  FinishReason,
  Modality,
} from '@microsoft/agents-a365-observability';
import {
  serializeMessages,
} from '@microsoft/agents-a365-observability/src/tracing/message-utils';

const testAgentDetails: AgentDetails = {
  agentId: 'test-agent-msg',
  agentName: 'Message Test Agent',
  tenantId: '11111111-1111-1111-1111-111111111111',
};

const testInferenceDetails: InferenceDetails = {
  operationName: InferenceOperationType.CHAT,
  model: 'gpt-4',
  providerName: 'openai',
};

const testRequest = { conversationId: 'conv-msg-1' };

describe('Scope message recording', () => {
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
      provider = new BasicTracerProvider({ spanProcessors: [processor] });
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

  // ---------------------------------------------------------------------------
  // recordInputMessages / recordOutputMessages (tested via InferenceScope;
  // InvokeAgentScope overrides are trivial super calls sharing the same path)
  // ---------------------------------------------------------------------------
  describe('recordInputMessages / recordOutputMessages', () => {
    it('should convert string[] input to OTEL ChatMessage format', async () => {
      const scope = InferenceScope.start(testRequest, testInferenceDetails, testAgentDetails);
      scope.recordInputMessages(['What is the weather?', 'And traffic?']);
      scope.dispose();

      await flushProvider.forceFlush();
      const { attributes } = getLastSpan();
      const parsed = JSON.parse(attributes[OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY] as string);

      expect(parsed).toEqual([
        { role: 'user', parts: [{ type: 'text', content: 'What is the weather?' }] },
        { role: 'user', parts: [{ type: 'text', content: 'And traffic?' }] },
      ]);
    });

    it('should pass through ChatMessage[] input without re-wrapping', async () => {
      const structured: ChatMessage[] = [
        { role: MessageRole.SYSTEM, parts: [{ type: 'text', content: 'You are a helpful assistant.' }] },
        { role: MessageRole.USER, parts: [{ type: 'text', content: 'Hello!' }] },
      ];

      const scope = InferenceScope.start(testRequest, testInferenceDetails, testAgentDetails);
      scope.recordInputMessages(structured);
      scope.dispose();

      await flushProvider.forceFlush();
      const { attributes } = getLastSpan();
      const parsed = JSON.parse(attributes[OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY] as string);

      expect(parsed).toEqual(structured);
    });

    it('should convert string[] output to OTEL OutputMessage format', async () => {
      const scope = InferenceScope.start(testRequest, testInferenceDetails, testAgentDetails);
      scope.recordOutputMessages(['The weather is sunny.']);
      scope.dispose();

      await flushProvider.forceFlush();
      const { attributes } = getLastSpan();
      const parsed = JSON.parse(attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY] as string);

      expect(parsed).toEqual([
        { role: 'assistant', parts: [{ type: 'text', content: 'The weather is sunny.' }] },
      ]);
    });

    it('should preserve finish_reason on OutputMessage[]', async () => {
      const structured: OutputMessage[] = [
        { role: MessageRole.ASSISTANT, parts: [{ type: 'text', content: 'Done.' }], finish_reason: FinishReason.STOP },
        { role: MessageRole.ASSISTANT, parts: [{ type: 'text', content: 'Partial...' }], finish_reason: FinishReason.LENGTH },
      ];

      const scope = InferenceScope.start(testRequest, testInferenceDetails, testAgentDetails);
      scope.recordOutputMessages(structured);
      scope.dispose();

      await flushProvider.forceFlush();
      const { attributes } = getLastSpan();
      const parsed = JSON.parse(attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY] as string);

      expect(parsed[0].finish_reason).toBe('stop');
      expect(parsed[1].finish_reason).toBe('length');
    });
  });

  // ---------------------------------------------------------------------------
  // InvokeAgentScope-specific: recordResponse() delegates to recordOutputMessages
  // ---------------------------------------------------------------------------
  describe('InvokeAgentScope.recordResponse', () => {
    it('should convert response string to OTEL OutputMessage format', async () => {
      const scope = InvokeAgentScope.start(testRequest, {}, testAgentDetails);
      scope.recordResponse('Test response');
      scope.dispose();

      await flushProvider.forceFlush();
      const { attributes } = getLastSpan();
      const parsed = JSON.parse(attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY] as string);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].role).toBe('assistant');
      expect(parsed[0].parts[0].content).toBe('Test response');
    });
  });

  // ---------------------------------------------------------------------------
  // Complex OTEL message part types (serialization round-trips)
  // ---------------------------------------------------------------------------
  describe('Complex message part types', () => {
    it('should serialize tool call request and response parts', async () => {
      const messages: ChatMessage[] = [
        {
          role: MessageRole.ASSISTANT,
          parts: [
            { type: 'text', content: 'Let me search for that.' },
            { type: 'tool_call', name: 'search', id: 'call_123', arguments: { query: 'test' } },
          ],
        },
        {
          role: MessageRole.TOOL,
          parts: [
            { type: 'tool_call_response', id: 'call_123', response: { results: ['item1'] } },
          ],
        },
      ];

      const scope = InferenceScope.start(testRequest, testInferenceDetails, testAgentDetails);
      scope.recordInputMessages(messages);
      scope.dispose();

      await flushProvider.forceFlush();
      const { attributes } = getLastSpan();
      const parsed = JSON.parse(attributes[OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY] as string);

      expect(parsed[0].parts[1].type).toBe('tool_call');
      expect(parsed[0].parts[1].arguments).toEqual({ query: 'test' });
      expect(parsed[1].parts[0].type).toBe('tool_call_response');
      expect(parsed[1].parts[0].response).toEqual({ results: ['item1'] });
    });

    it('should serialize reasoning parts with finish_reason', async () => {
      const messages: OutputMessage[] = [{
        role: MessageRole.ASSISTANT,
        parts: [
          { type: 'reasoning', content: 'The user is asking about weather...' },
          { type: 'text', content: 'The weather is sunny.' },
        ],
        finish_reason: FinishReason.STOP,
      }];

      const scope = InferenceScope.start(testRequest, testInferenceDetails, testAgentDetails);
      scope.recordOutputMessages(messages);
      scope.dispose();

      await flushProvider.forceFlush();
      const { attributes } = getLastSpan();
      const parsed = JSON.parse(attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY] as string);

      expect(parsed[0].parts[0].type).toBe('reasoning');
      expect(parsed[0].parts[1].type).toBe('text');
      expect(parsed[0].finish_reason).toBe('stop');
    });

    it('should serialize blob, file, and URI parts', () => {
      const messages: ChatMessage[] = [{
        role: MessageRole.USER,
        parts: [
          { type: 'blob', modality: Modality.IMAGE, mime_type: 'image/png', content: 'iVBORw0KGgo=' },
          { type: 'file', modality: Modality.VIDEO, mime_type: 'video/mp4', file_id: 'file-123' },
          { type: 'uri', modality: Modality.AUDIO, mime_type: 'audio/mp3', uri: 'https://example.com/audio.mp3' },
        ],
      }];

      const parsed = JSON.parse(serializeMessages(messages));

      expect(parsed[0].parts[0].modality).toBe('image');
      expect(parsed[0].parts[1].file_id).toBe('file-123');
      expect(parsed[0].parts[2].uri).toBe('https://example.com/audio.mp3');
    });

    it('should serialize server tool call and generic parts', () => {
      const messages: ChatMessage[] = [
        { role: MessageRole.ASSISTANT, parts: [{ type: 'server_tool_call', name: 'mcp_tool', id: 'stc_1', server_tool_call: { endpoint: '/api' } }] },
        { role: MessageRole.TOOL, parts: [{ type: 'server_tool_call_response', id: 'stc_1', server_tool_call_response: { status: 'ok' } }] },
        { role: MessageRole.USER, parts: [{ type: 'custom_annotation', timestamp: '00:01:23', note: 'Important' }] },
      ];

      const parsed = JSON.parse(serializeMessages(messages));

      expect(parsed[0].parts[0].server_tool_call.endpoint).toBe('/api');
      expect(parsed[1].parts[0].server_tool_call_response.status).toBe('ok');
      expect(parsed[2].parts[0].type).toBe('custom_annotation');
    });
  });
});
