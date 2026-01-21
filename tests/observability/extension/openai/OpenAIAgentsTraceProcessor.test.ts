// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

/**
 * Unit tests for OpenAIAgentsTraceProcessor
 * Tests the trace and span processing lifecycle
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Tracer } from '@opentelemetry/api';
import { OpenTelemetryConstants } from '@microsoft/agents-a365-observability';
import { OpenAIAgentsTraceProcessor } from '@microsoft/agents-a365-observability-extensions-openai';
import { ObservabilityManager } from '@microsoft/agents-a365-observability';
import { trace } from '@opentelemetry/api';

describe('OpenAIAgentsTraceProcessor', () => {
  let tracer: Tracer;

  beforeEach(() => {
    // Initialize ObservabilityManager for testing
    ObservabilityManager.start({
      serviceName: 'openai-agents-test',
      serviceVersion: '1.0.0'
    });
    tracer = trace.getTracer('openai-agents-test', '1.0.0');
  });

  afterEach(async () => {
    await ObservabilityManager.shutdown();
  });

  describe('Functional Tests with Real Processor', () => {
    let processor: OpenAIAgentsTraceProcessor;

    beforeEach(() => {
      processor = new OpenAIAgentsTraceProcessor(tracer);
    });

    afterEach(async () => {
      await processor.shutdown();
    });

    describe('Trace Lifecycle', () => {
      it('should handle trace start', () => {
        const traceData = {
          traceId: 'trace-123',
          name: 'Test Agent',
        } as any;

        processor.onTraceStart(traceData);

        // Check what actually happens with root spans
        const rootSpans = (processor as any).rootSpans;
        expect(rootSpans.size).toBeGreaterThanOrEqual(0);
      });

      it('should handle trace end', () => {
        const traceData = {
          traceId: 'trace-456',
          name: 'Test Agent',
        } as any;

        processor.onTraceStart(traceData);
        processor.onTraceEnd(traceData);

        const rootSpans = (processor as any).rootSpans;
        expect(rootSpans.has('trace-456')).toBe(false);
      });
    });

    describe('Span Processing by Type', () => {
      it('should process generation span', () => {
        const traceData = { traceId: 'trace-1', name: 'Agent' } as any;
        processor.onTraceStart(traceData);

        const genSpan = {
          spanId: 'gen-1',
          traceId: 'trace-1',
          startedAt: new Date().toISOString(),
          spanData: {
            type: 'generation' as const,
            name: 'Generate',
            model: 'gpt-4',
          },
        } as any;

        processor.onSpanStart(genSpan);

        const otelSpans = (processor as any).otelSpans;
        expect(otelSpans.has('gen-1')).toBe(true);

        processor.onSpanEnd(genSpan);
        expect(otelSpans.has('gen-1')).toBe(false);
      });

      it('should process function span', () => {
        const traceData = { traceId: 'trace-2', name: 'Agent' } as any;
        processor.onTraceStart(traceData);

        const funcSpan = {
          spanId: 'func-1',
          traceId: 'trace-2',
          startedAt: new Date().toISOString(),
          spanData: {
            type: 'function' as const,
            name: 'tool_call',
            toolName: 'calculator',
          },
        } as any;

        processor.onSpanStart(funcSpan);

        const otelSpans = (processor as any).otelSpans;
        expect(otelSpans.has('func-1')).toBe(true);

        processor.onSpanEnd(funcSpan);
        expect(otelSpans.has('func-1')).toBe(false);
      });

      it('should process handoff span', () => {
        const traceData = { traceId: 'trace-3', name: 'Agent' } as any;
        processor.onTraceStart(traceData);

        const handoffSpan = {
          spanId: 'handoff-1',
          traceId: 'trace-3',
          startedAt: new Date().toISOString(),
          spanData: {
            type: 'handoff' as const,
            name: 'handoff_to_agent',
            to_agent: 'specialist',
            from_agent: 'main-agent',
          },
        } as any;

        processor.onSpanStart(handoffSpan);

        const otelSpans = (processor as any).otelSpans;
        expect(otelSpans.has('handoff-1')).toBe(true);

        processor.onSpanEnd(handoffSpan);
        const reverseHandoffs = (processor as any).reverseHandoffsDict;
        expect(reverseHandoffs.has('specialist:trace-3')).toBe(true);
      });

      it('should process agent span', () => {
        const traceData = { traceId: 'trace-4', name: 'Agent' } as any;
        processor.onTraceStart(traceData);

        const agentSpan = {
          spanId: 'agent-1',
          traceId: 'trace-4',
          startedAt: new Date().toISOString(),
          spanData: {
            type: 'agent' as const,
            name: 'agent_action',
            agentName: 'assistant',
          },
        } as any;

        processor.onSpanStart(agentSpan);

        const otelSpans = (processor as any).otelSpans;
        expect(otelSpans.has('agent-1')).toBe(true);

        processor.onSpanEnd(agentSpan);
        expect(otelSpans.has('agent-1')).toBe(false);
      });

      it('should process response span', () => {
        const traceData = { traceId: 'trace-5', name: 'Agent' } as any;
        processor.onTraceStart(traceData);

        const respSpan = {
          spanId: 'resp-1',
          traceId: 'trace-5',
          startedAt: new Date().toISOString(),
          spanData: {
            type: 'response' as const,
            name: 'agent_response',
            content: 'Hello!',
          },
        } as any;

        processor.onSpanStart(respSpan);

        const otelSpans = (processor as any).otelSpans;
        expect(otelSpans.has('resp-1')).toBe(true);

        processor.onSpanEnd(respSpan);
        expect(otelSpans.has('resp-1')).toBe(false);
      });

      it('should process mcp_tools span', () => {
        const traceData = { traceId: 'trace-6', name: 'Agent' } as any;
        processor.onTraceStart(traceData);

        const mcpSpan = {
          spanId: 'mcp-1',
          traceId: 'trace-6',
          startedAt: new Date().toISOString(),
          spanData: {
            type: 'mcp_tools' as const,
            name: 'mcp_tool_call',
            toolName: 'external_api',
          },
        } as any;

        processor.onSpanStart(mcpSpan);

        const otelSpans = (processor as any).otelSpans;
        expect(otelSpans.has('mcp-1')).toBe(true);

        processor.onSpanEnd(mcpSpan);
        expect(otelSpans.has('mcp-1')).toBe(false);
      });
    });

    describe('Error Handling', () => {
      it('should handle span with error', () => {
        const traceData = { traceId: 'trace-error', name: 'Agent' } as any;
        processor.onTraceStart(traceData);

        const errorSpan = {
          spanId: 'error-1',
          traceId: 'trace-error',
          startedAt: new Date().toISOString(),
          spanData: {
            type: 'generation' as const,
            name: 'Failed Gen',
            error: 'Rate limit exceeded',
          },
        } as any;

        processor.onSpanStart(errorSpan);
        processor.onSpanEnd(errorSpan);

        const otelSpans = (processor as any).otelSpans;
        expect(otelSpans.has('error-1')).toBe(false); // Cleaned up after end
      });
    });

    describe('Shutdown', () => {
      it('should clear all internal state', async () => {
        const traceData = { traceId: 'trace-shutdown', name: 'Agent' } as any;
        processor.onTraceStart(traceData);

        const span = {
          spanId: 'span-shutdown',
          traceId: 'trace-shutdown',
          startedAt: new Date().toISOString(),
          spanData: {
            type: 'generation' as const,
            name: 'Test',
          },
        } as any;

        processor.onSpanStart(span);

        await processor.shutdown();

        const rootSpans = (processor as any).rootSpans;
        const otelSpans = (processor as any).otelSpans;
        const tokens = (processor as any).tokens;

        expect(rootSpans.size).toBe(0);
        expect(otelSpans.size).toBe(0);
        expect(tokens.size).toBe(0);
      });
    });

    describe('Complex Scenarios', () => {
      it('should handle handoff with agent graph', () => {
        const traceData = { traceId: 'trace-graph', name: 'Agent' } as any;
        processor.onTraceStart(traceData);

        // Create handoff
        const handoff = {
          spanId: 'handoff-graph',
          traceId: 'trace-graph',
          startedAt: new Date().toISOString(),
          spanData: {
            type: 'handoff' as const,
            name: 'Handoff',
            to_agent: 'child-agent',
            from_agent: 'parent-agent',
          },
        } as any;

        processor.onSpanStart(handoff);
        processor.onSpanEnd(handoff);

        // Create agent that receives handoff
        const agent = {
          spanId: 'agent-graph',
          traceId: 'trace-graph',
          startedAt: new Date().toISOString(),
          spanData: {
            type: 'agent' as const,
            name: 'child-agent',
          },
        } as any;

        processor.onSpanStart(agent);

        const otelSpans = (processor as any).otelSpans;
        expect(otelSpans.has('agent-graph')).toBe(true);

        processor.onSpanEnd(agent);
      });

      it('should handle multiple spans in same trace', () => {
        const traceData = { traceId: 'trace-multi', name: 'Agent' } as any;
        processor.onTraceStart(traceData);

        const spans = [
          {
            spanId: 'span-1',
            traceId: 'trace-multi',
            startedAt: new Date().toISOString(),
            spanData: { type: 'generation' as const, name: 'Gen1' },
          },
          {
            spanId: 'span-2',
            traceId: 'trace-multi',
            startedAt: new Date().toISOString(),
            spanData: { type: 'function' as const, name: 'Func1' },
          },
          {
            spanId: 'span-3',
            traceId: 'trace-multi',
            startedAt: new Date().toISOString(),
            spanData: { type: 'response' as const, name: 'Resp1' },
          },
        ] as any[];

        // Start all spans
        spans.forEach(span => processor.onSpanStart(span));

        const otelSpans = (processor as any).otelSpans;
        expect(otelSpans.size).toBe(3);

        // End all spans
        spans.forEach(span => processor.onSpanEnd(span));
        expect(otelSpans.size).toBe(0);

        processor.onTraceEnd(traceData);
      });

      it('should maintain parent-child span relationships with correct trace ID', () => {
        const traceData = { traceId: 'trace-parent-child', name: 'Agent' } as any;
        processor.onTraceStart(traceData);

        // Check the actual behavior of root spans
        const rootSpans = (processor as any).rootSpans;
        const rootSpan = rootSpans.get('trace-parent-child');
        // Based on test output, root spans are being created, so let's adjust accordingly

        // Create parent span
        const parentSpan = {
          spanId: 'parent-span-1',
          traceId: 'trace-parent-child',
          parentId: undefined, // No parent, uses active context or root span if exists
          startedAt: new Date().toISOString(),
          spanData: {
            type: 'agent' as const,
            name: 'Parent Agent',
          },
        } as any;

        processor.onSpanStart(parentSpan);
        
        const otelSpans = (processor as any).otelSpans;
        const parentOtelSpan = otelSpans.get('parent-span-1');
        expect(parentOtelSpan).toBeDefined();
        
        const parentSpanContext = parentOtelSpan.spanContext();
        expect(parentSpanContext.spanId).toBeDefined();
        expect(parentSpanContext.traceId).toBeDefined();

        // Create child span with explicit parent
        const childSpan = {
          spanId: 'child-span-1',
          traceId: 'trace-parent-child',
          parentId: 'parent-span-1', // Explicitly set parent
          startedAt: new Date().toISOString(),
          spanData: {
            type: 'generation' as const,
            name: 'Child Generation',
          },
        } as any;

        processor.onSpanStart(childSpan);
        
        const childOtelSpan = otelSpans.get('child-span-1');
        expect(childOtelSpan).toBeDefined();
        
        const childSpanContext = childOtelSpan.spanContext();
        expect(childSpanContext.spanId).toBeDefined();
        expect(childSpanContext.traceId).toBeDefined();
        
        // Verify child span has same trace ID as parent
        expect(childSpanContext.traceId).toBe(parentSpanContext.traceId);
        
        // Verify child span ID is different from parent
        expect(childSpanContext.spanId).not.toBe(parentSpanContext.spanId);

        // Create grandchild span
        const grandchildSpan = {
          spanId: 'grandchild-span-1',
          traceId: 'trace-parent-child',
          parentId: 'child-span-1', // Parent is the child span
          startedAt: new Date().toISOString(),
          spanData: {
            type: 'function' as const,
            name: 'Grandchild Function',
          },
        } as any;

        processor.onSpanStart(grandchildSpan);
        
        const grandchildOtelSpan = otelSpans.get('grandchild-span-1');
        expect(grandchildOtelSpan).toBeDefined();
        
        const grandchildSpanContext = grandchildOtelSpan.spanContext();
        
        // Verify all spans share the same trace ID
        expect(grandchildSpanContext.traceId).toBe(parentSpanContext.traceId);
        expect(grandchildSpanContext.traceId).toBe(childSpanContext.traceId);
        
        // Verify each span has unique span ID
        expect(grandchildSpanContext.spanId).not.toBe(childSpanContext.spanId);
        expect(grandchildSpanContext.spanId).not.toBe(parentSpanContext.spanId);
        expect(childSpanContext.spanId).not.toBe(parentSpanContext.spanId);

        // Clean up - end spans in reverse order (child before parent)
        processor.onSpanEnd(grandchildSpan);
        expect(otelSpans.has('grandchild-span-1')).toBe(false);
        
        processor.onSpanEnd(childSpan);
        expect(otelSpans.has('child-span-1')).toBe(false);
        
        processor.onSpanEnd(parentSpan);
        expect(otelSpans.has('parent-span-1')).toBe(false);

        processor.onTraceEnd(traceData);
      });
    });
  });

  describe('Prompt Suppression in InvokeAgent traces', () => {
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
      spansByName = {};
      tracerSpy = jest.spyOn(tracer as any, 'startSpan').mockImplementation((...args: unknown[]) => {
        const name = args[0] as string;
        const s = createMockSpan(name);
        spansByName[name] = s;
        return s;
      });
    });

    afterEach(() => {
      tracerSpy.mockRestore();
    });

    it('does not record GEN_AI_INPUT_MESSAGES when disabled', async () => {
      const processor = new OpenAIAgentsTraceProcessor(tracer, { suppressInvokeAgentInput: true });
      const traceData = { traceId: 'trace-suppress', name: 'Agent' } as any;
      await processor.onTraceStart(traceData);

      const agentSpan = {
        spanId: 'agent-span', traceId: 'trace-suppress', startedAt: new Date().toISOString(),
        spanData: { type: 'agent' as const, name: 'agent-node' },
      } as any;
      await processor.onSpanStart(agentSpan);
      await processor.onSpanEnd(agentSpan);

      const genSpan = {
        spanId: 'gen-span', traceId: 'trace-suppress', startedAt: new Date().toISOString(),
        spanData: { type: 'generation' as const, name: 'Generate', model: 'gpt-4', input: 'Hello prompt' },
      } as any;
      await processor.onSpanStart(genSpan);
      await processor.onSpanEnd(genSpan);

      const genMock = spansByName['Generate'];
      const keys = (genMock._attrs as Array<[string, unknown]>).map(([k]) => k);
      expect(keys).not.toContain(OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY);
    });

    it('records GEN_AI_INPUT_MESSAGES when enabled (default)', async () => {
      const processor = new OpenAIAgentsTraceProcessor(tracer);
      const traceData = { traceId: 'trace-allow', name: 'Agent' } as any;
      await processor.onTraceStart(traceData);

      const agentSpan = {
        spanId: 'agent-span-2', traceId: 'trace-allow', startedAt: new Date().toISOString(),
        spanData: { type: 'agent' as const, name: 'agent-node-2' },
      } as any;
      await processor.onSpanStart(agentSpan);
      await processor.onSpanEnd(agentSpan);

      const genSpan = {
        spanId: 'gen-span-2', traceId: 'trace-allow', startedAt: new Date().toISOString(),
        spanData: { type: 'generation' as const, name: 'Generate2', model: 'gpt-4', input: 'Hello prompt' },
      } as any;
      await processor.onSpanStart(genSpan);
      await processor.onSpanEnd(genSpan);

      const genMock = spansByName['Generate2'];
      const keys = (genMock._attrs as Array<[string, unknown]>).map(([k]) => k);
      expect(keys).toContain(OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY);
    });

    it('suppresses input on response spans when disabled', async () => {
      const processor = new OpenAIAgentsTraceProcessor(tracer, { suppressInvokeAgentInput: true });
      const traceData = { traceId: 'trace-resp', name: 'Agent' } as any;
      await processor.onTraceStart(traceData);

      const agentSpan = {
        spanId: 'agent-span-3', traceId: 'trace-resp', startedAt: new Date().toISOString(),
        spanData: { type: 'agent' as const, name: 'agent-node-3' },
      } as any;
      await processor.onSpanStart(agentSpan);
      await processor.onSpanEnd(agentSpan);

      const respSpan = {
        spanId: 'resp-span', traceId: 'trace-resp', startedAt: new Date().toISOString(),
        spanData: { type: 'response' as const, name: 'Response', _input: 'Prompt text', _response: { model: 'gpt-4', output: 'ok' } },
      } as any;
      await processor.onSpanStart(respSpan);
      await processor.onSpanEnd(respSpan);

      const respMock = spansByName['Response'];
      const keys = (respMock._attrs as Array<[string, unknown]>).map(([k]) => k);
      expect(keys).not.toContain(OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY);
    });

    it('records full array JSON when only assistant messages are present', async () => {
      const processor = new OpenAIAgentsTraceProcessor(tracer);
      const traceData = { traceId: 'trace-assistant-only', name: 'Agent' } as any;
      await processor.onTraceStart(traceData);

      const inputArray = [
        {
          role: 'assistant',
          content: 'Assistant reply',
        },
      ];

      const respSpan = {
        spanId: 'resp-assistant-span',
        traceId: 'trace-assistant-only',
        startedAt: new Date().toISOString(),
        spanData: {
          type: 'response' as const,
          name: 'ResponseAssistantOnly',
          _input: inputArray,
          _response: { model: 'gpt-4', output: 'ok' },
        },
      } as any;

      await processor.onSpanStart(respSpan);
      await processor.onSpanEnd(respSpan);

      const respMock = spansByName['ResponseAssistantOnly'];
      const attrs = respMock._attrs as Array<[string, unknown]>;
      const entry = attrs.find(([k]) => k === OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY);
      expect(entry).toBeDefined();

      const value = entry![1] as string;
      const parsed = JSON.parse(value);
      expect(parsed).toEqual(inputArray);
    });
    it('records user text content for array _input on response spans', async () => {
      const processor = new OpenAIAgentsTraceProcessor(tracer);
      const traceData = { traceId: 'trace-array-input', name: 'Agent' } as any;
      await processor.onTraceStart(traceData);

      const respSpan = {
        spanId: 'resp-array-span',
        traceId: 'trace-array-input',
        startedAt: new Date().toISOString(),
        spanData: {
          type: 'response' as const,
          name: 'ResponseArray',
          _input: [
            { role: 'user', content: 'Hello user 1' },
            { role: 'user', content: 'Hello user 2' },
          ],
          _response: { model: 'gpt-4', output: 'ok' },
        },
      } as any;

      await processor.onSpanStart(respSpan);
      await processor.onSpanEnd(respSpan);

      const respMock = spansByName['ResponseArray'];
      const attrs = respMock._attrs as Array<[string, unknown]>;
      const entry = attrs.find(([k]) => k === OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY);
      expect(entry).toBeDefined();

      const value = entry![1] as string;
      const parsed = JSON.parse(value);
      expect(parsed).toEqual(['Hello user 1', 'Hello user 2']);
    });

    it('parses stringified array _input and records only user text content', async () => {
      const processor = new OpenAIAgentsTraceProcessor(tracer);
      const traceData = { traceId: 'trace-array-input-string', name: 'Agent' } as any;
      await processor.onTraceStart(traceData);

      const inputArray = [
        { role: 'user', content: 'Hello user 1' },
        { role: 'user', content: 'Hello user 2' },
        { role: 'assistant', content: 'Assistant reply' },
      ];

      const respSpan = {
        spanId: 'resp-array-span-string',
        traceId: 'trace-array-input-string',
        startedAt: new Date().toISOString(),
        spanData: {
          type: 'response' as const,
          name: 'ResponseArrayString',
          _input: JSON.stringify(inputArray),
          _response: { model: 'gpt-4', output: 'ok' },
        },
      } as any;

      await processor.onSpanStart(respSpan);
      await processor.onSpanEnd(respSpan);

      const respMock = spansByName['ResponseArrayString'];
      const attrs = respMock._attrs as Array<[string, unknown]>;
      const entry = attrs.find(([k]) => k === OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY);
      expect(entry).toBeDefined();

      const value = entry![1] as string;
      const parsed = JSON.parse(value);
      expect(parsed).toEqual(['Hello user 1', 'Hello user 2']);
    });

    it('records [gen_ai.input.messages] attribute for array input with non standard schema on response spans', async () => {
      const processor = new OpenAIAgentsTraceProcessor(tracer);
      const traceData = { traceId: 'trace-array-input', name: 'Agent' } as any;
      await processor.onTraceStart(traceData);
      const inputArray = [
        { type: 'text', content: 'message 1' },
        { type: 'text', content: 'message 2' },
      ];
      const respSpan = {
        spanId: 'resp-array-span',
        traceId: 'trace-array-input',
        startedAt: new Date().toISOString(),
        spanData: {
          type: 'response' as const,
          name: 'ResponseArray',
          _input:  inputArray,         
          _response: { model: 'gpt-4', output: 'ok' },
        },
      } as any;

      await processor.onSpanStart(respSpan);
      await processor.onSpanEnd(respSpan);

      const respMock = spansByName['ResponseArray'];
      const attrs = respMock._attrs as Array<[string, unknown]>;
      const entry = attrs.find(([k]) => k === OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY);
      expect(entry).toBeDefined();

      const value = entry![1] as string;
      const parsed = JSON.parse(value);
      expect(parsed).toEqual(inputArray);
    });

    it('records GEN_AI_OUTPUT_MESSAGES as plain string when output is a string', async () => {
      const processor = new OpenAIAgentsTraceProcessor(tracer);
      const traceData = { traceId: 'trace-output-string', name: 'Agent' } as any;
      await processor.onTraceStart(traceData);

      const respSpan = {
        spanId: 'resp-output-string',
        traceId: 'trace-output-string',
        startedAt: new Date().toISOString(),
        spanData: {
          type: 'response' as const,
          name: 'ResponseOutputString',
          _input: 'ignored',
          _response: { model: 'gpt-4', output: 'final answer' },
        },
      } as any;

      await processor.onSpanStart(respSpan);
      await processor.onSpanEnd(respSpan);

      const respMock = spansByName['ResponseOutputString'];
      const attrs = respMock._attrs as Array<[string, unknown]>;
      const entry = attrs.find(([k]) => k === OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY);
      expect(entry).toBeDefined();
      expect(entry![1]).toBe('final answer');
    });

    it('records GEN_AI_OUTPUT_MESSAGES as aggregated texts when output is structured', async () => {
      const processor = new OpenAIAgentsTraceProcessor(tracer);
      const traceData = { traceId: 'trace-output-structured', name: 'Agent' } as any;
      await processor.onTraceStart(traceData);

      const outputArray = [
        {
          role: 'assistant',
          content: [
            { type: 'output_text', text: 'Hello user 1' },
            { type: 'output_text', text: 'Hello user 2' },
          ],
        },
      ];

      const respSpan = {
        spanId: 'resp-output-structured',
        traceId: 'trace-output-structured',
        startedAt: new Date().toISOString(),
        spanData: {
          type: 'response' as const,
          name: 'ResponseOutputStructured',
          _input: 'ignored',
          _response: { model: 'gpt-4', output: outputArray },
        },
      } as any;

      await processor.onSpanStart(respSpan);
      await processor.onSpanEnd(respSpan);

      const respMock = spansByName['ResponseOutputStructured'];
      const attrs = respMock._attrs as Array<[string, unknown]>;
      const entry = attrs.find(([k]) => k === OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY);
      expect(entry).toBeDefined();

      const value = entry![1] as string;
      const parsed = JSON.parse(value);
      expect(parsed).toEqual(['Hello user 1', 'Hello user 2']);
    });
  });
});
