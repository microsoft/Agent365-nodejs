// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Tracer, trace } from '@opentelemetry/api';
import { OpenTelemetryConstants, ObservabilityManager, serializeMessages } from '@microsoft/agents-a365-observability';
import { OpenAIAgentsTraceProcessor } from '@microsoft/agents-a365-observability-extensions-openai';
import {
  buildStructuredInputMessages,
  buildStructuredOutputMessages,
  wrapRawContentAsInputMessages,
  wrapRawContentAsOutputMessages,
} from '../../../../packages/agents-a365-observability-extensions-openai/src/Utils';
import { expectValidInputMessages, expectValidOutputMessages, getAttrFromArray } from '../helpers/message-schema-validator';

describe('OpenAI Message Contract Tests', () => {

  describe('buildStructuredInputMessages', () => {
    it('should produce valid InputMessages from a multi-role conversation', () => {
      const result = buildStructuredInputMessages([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hi!' },
        { role: 'assistant', content: 'Hello! How can I help?' },
        { role: 'user', content: 'What is 2+2?' },
      ]);
      expectValidInputMessages(serializeMessages(result));
      expect(result.messages.map(m => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
      expect(result.messages[0].parts[0]).toEqual({ type: 'text', content: 'You are a helpful assistant.' });
    });

    it('should handle array content blocks (input_text, input_image)', () => {
      const result = buildStructuredInputMessages([{
        role: 'user',
        content: [
          { type: 'input_text', text: 'Describe this image' },
          { type: 'input_image', image: 'https://example.com/img.png' },
        ],
      }] as any);
      expectValidInputMessages(serializeMessages(result));
      expect(result.messages[0].parts).toHaveLength(2);
      expect(result.messages[0].parts[0]).toEqual({ type: 'text', content: 'Describe this image' });
    });
  });

  describe('buildStructuredOutputMessages', () => {
    it('should handle text, tool_call, and reasoning content', () => {
      const result = buildStructuredOutputMessages([{
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'The user asked about weather.' },
          { type: 'output_text', text: 'Let me check.' },
          { type: 'tool_call', name: 'get_weather', call_id: 'call_1', arguments: '{"city":"Seattle"}' },
        ],
      }]);
      expectValidOutputMessages(serializeMessages(result));

      expect(result.messages[0].parts).toHaveLength(3);
      const toolPart = result.messages[0].parts.find(p => p.type === 'tool_call') as any;
      expect(toolPart.name).toBe('get_weather');
      expect(toolPart.id).toBe('call_1');
      expect(result.messages[0].parts.find(p => p.type === 'reasoning')).toBeDefined();
    });

    it('should handle mixed output types including refusal', () => {
      const result = buildStructuredOutputMessages([{
        role: 'assistant',
        content: [
          { type: 'output_text', text: 'Here is the answer.' },
          { type: 'refusal', refusal: 'I cannot help with that.' },
        ],
      }]);
      expectValidOutputMessages(serializeMessages(result));
      expect(result.messages[0].parts).toHaveLength(2);
    });
  });

  describe('wrapRawContent', () => {
    it.each([
      ['string', 'Hello prompt'],
      ['object', { complex: 'data', nested: [1, 2] }],
    ])('should produce valid InputMessages from raw %s', (_label, raw) => {
      expectValidInputMessages(serializeMessages(wrapRawContentAsInputMessages(raw)));
    });

    it.each([
      ['string', 'Model response'],
      ['object', { result: 'data' }],
    ])('should produce valid OutputMessages from raw %s', (_label, raw) => {
      expectValidOutputMessages(serializeMessages(wrapRawContentAsOutputMessages(raw)));
    });
  });

  describe('End-to-end: response span with real-shaped data', () => {
    let tracer: Tracer;
    let spansByName: Record<string, any>;
    let tracerSpy: jest.SpyInstance;

    const createMockSpan = (name: string) => {
      const attrs: Array<[string, unknown]> = [];
      return {
        setAttribute: jest.fn((k: string, v: unknown) => { attrs.push([k, v]); }),
        updateName: jest.fn(),
        setStatus: jest.fn(),
        end: jest.fn(),
        spanContext: jest.fn(() => ({ traceId: 'tid-' + name, spanId: 'sid-' + name })),
        _attrs: attrs,
      };
    };

    beforeEach(() => {
      ObservabilityManager.start({ serviceName: 'contract-test', serviceVersion: '1.0.0' });
      tracer = trace.getTracer('contract-test', '1.0.0');
      spansByName = {};
      tracerSpy = jest.spyOn(tracer as any, 'startSpan').mockImplementation((...args: unknown[]) => {
        const s = createMockSpan(args[0] as string);
        spansByName[args[0] as string] = s;
        return s;
      });
    });

    afterEach(async () => {
      tracerSpy.mockRestore();
      await ObservabilityManager.shutdown();
    });

    async function runResponseSpan(traceId: string, spanName: string, input: any[], responseOutput: any[]): Promise<Array<[string, unknown]>> {
      const processor = new OpenAIAgentsTraceProcessor(tracer, {});
      await processor.onTraceStart({ traceId, name: 'Agent' } as any);
      const span = {
        spanId: `sid-${spanName}`,
        traceId,
        startedAt: new Date().toISOString(),
        spanData: {
          type: 'response' as const,
          name: spanName,
          _input: input,
          _response: { model: 'gpt-4o', output: responseOutput },
        },
      } as any;
      await processor.onSpanStart(span);
      await processor.onSpanEnd(span);
      await processor.shutdown();
      return spansByName[spanName]._attrs;
    }

    it('should produce valid InputMessages and OutputMessages for text response', async () => {
      const attrs = await runResponseSpan('t1', 'TextResponse',
        [{ role: 'system', content: 'You are helpful.' }, { role: 'user', content: 'What is 2+2?' }],
        [{ role: 'assistant', content: [{ type: 'output_text', text: 'The answer is 4.' }] }],
      );

      expectValidInputMessages(getAttrFromArray(attrs, OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY));
      expectValidOutputMessages(getAttrFromArray(attrs, OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY));
    });

    it('should produce valid OutputMessages with tool_call in response', async () => {
      const attrs = await runResponseSpan('t2', 'ToolResponse',
        [{ role: 'user', content: 'Get weather in Seattle' }],
        [{ role: 'assistant', content: [{ type: 'tool_call', name: 'get_weather', call_id: 'call_abc', arguments: '{"city":"Seattle"}' }] }],
      );

      const outputValue = getAttrFromArray(attrs, OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY);
      expectValidOutputMessages(outputValue);

      const toolPart = JSON.parse(outputValue as string).messages[0].parts.find((p: any) => p.type === 'tool_call');
      expect(toolPart.name).toBe('get_weather');
      expect(toolPart.id).toBe('call_abc');
      expect(toolPart.arguments).toEqual({ city: 'Seattle' });
    });
  });

  describe('Edge cases', () => {
    it('should return empty messages array for empty input', () => {
      const result = buildStructuredInputMessages([]);
      expect(result.version).toBe('0.1.0');
      expect(result.messages).toHaveLength(0);
    });

    it('should skip null/non-object entries in input array', () => {
      const result = buildStructuredInputMessages([null as any, undefined as any, { role: 'user', content: 'valid' }]);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].parts[0]).toEqual({ type: 'text', content: 'valid' });
    });

    it('should return empty messages array for empty output', () => {
      const result = buildStructuredOutputMessages([]);
      expect(result.messages).toHaveLength(0);
    });

    it('should map function_call content block to tool_call part', () => {
      const result = buildStructuredOutputMessages([{
        role: 'assistant',
        content: [
          { type: 'function_call', name: 'my_func', id: 'fc_1', arguments: '{"x":1}' },
        ],
      }]);
      expect(result.messages[0].parts[0].type).toBe('tool_call');
      const part = result.messages[0].parts[0] as any;
      expect(part.name).toBe('my_func');
      expect(part.id).toBe('fc_1');
      expect(part.arguments).toEqual({ x: 1 });
    });

    it('should map input_file block with modality from mime_type', () => {
      const result = buildStructuredInputMessages([{
        role: 'user',
        content: [
          { type: 'input_file', mime_type: 'application/pdf', file_id: 'file_123' },
        ],
      }] as any);
      expect(result.messages[0].parts[0].type).toBe('file');
      expect((result.messages[0].parts[0] as any).modality).toBe('application');
    });

    it('should fall back to raw wrapper when tool_call arguments are malformed JSON', () => {
      const result = buildStructuredOutputMessages([{
        role: 'assistant',
        content: [
          { type: 'tool_call', name: 'get_weather', call_id: 'c1', arguments: 'not-json{{{' },
        ],
      }]);
      const part = result.messages[0].parts[0] as any;
      expect(part.type).toBe('tool_call');
      expect(part.arguments).toEqual({ raw: 'not-json{{{' });
    });

    it('should produce a generic part for unknown input content block types', () => {
      const result = buildStructuredInputMessages([{
        role: 'user',
        content: [
          { type: 'future_block_type', some_field: 'value' },
        ],
      }] as any);
      const part = result.messages[0].parts[0] as any;
      expect(part.type).toBe('future_block_type');
      expect(typeof part.content).toBe('string');
    });
  });
});
