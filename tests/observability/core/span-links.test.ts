// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, jest } from '@jest/globals';
import { trace, TraceFlags, Link } from '@opentelemetry/api';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace-base';

import {
  ExecuteToolScope,
  InvokeAgentScope,
  InferenceScope,
  OutputScope,
  AgentDetails,
  ToolCallDetails,
  InferenceDetails,
  InferenceOperationType,
  OutputResponse,
  Request,
  SpanDetails,
} from '@microsoft/agents-a365-observability';

// Mock console to avoid cluttering test output.
// Use beforeEach because jest config has restoreMocks: true which restores spies after each test.
beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Span Links', () => {
  const testAgentDetails: AgentDetails = {
    agentId: 'test-agent',
    agentName: 'Test Agent',
    agentDescription: 'A test agent',
    tenantId: 'test-tenant-456',
  };

  const testRequest: Request = {
    conversationId: 'test-conv-123',
  };

  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider | undefined;

  beforeAll(() => {
    exporter = new InMemorySpanExporter();
    const processor = new SimpleSpanProcessor(exporter);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const globalProvider: any = trace.getTracerProvider();
    if (globalProvider && typeof globalProvider.addSpanProcessor === 'function') {
      globalProvider.addSpanProcessor(processor);
    } else {
      provider = new BasicTracerProvider({
        spanProcessors: [processor],
      });
      trace.setGlobalTracerProvider(provider);
    }
  });

  afterEach(() => {
    exporter.reset();
  });

  afterAll(async () => {
    exporter.reset();
    await provider?.shutdown?.();
  });

  /** Extract the last finished span from the in-memory exporter. */
  const getFinishedSpan = (): ReadableSpan => {
    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBeGreaterThanOrEqual(1);
    return spans[spans.length - 1];
  };

  const sampleLinks: Link[] = [
    {
      context: {
        traceId: '0aa4621e5ae09963a3de354f3d18aa65',
        spanId: 'c1aaa519600b1bf0',
        traceFlags: TraceFlags.SAMPLED,
      },
    },
    {
      context: {
        traceId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        spanId: 'aaaaaaaaaaaaaaaa',
        traceFlags: TraceFlags.NONE,
      },
      attributes: { 'link.reason': 'retry' },
    },
  ];

  const spanDetailsWithLinks: SpanDetails = { spanLinks: sampleLinks };

  it('should record span links with full context and attributes', () => {
    const scope = ExecuteToolScope.start(
      testRequest,
      { toolName: 'my-tool' } as ToolCallDetails,
      testAgentDetails,
      undefined,
      spanDetailsWithLinks
    );
    scope.dispose();

    const span = getFinishedSpan();
    expect(span.links).toHaveLength(2);
    expect(span.links[0].context.traceId).toBe('0aa4621e5ae09963a3de354f3d18aa65');
    expect(span.links[0].context.spanId).toBe('c1aaa519600b1bf0');
    expect(span.links[0].context.traceFlags).toBe(TraceFlags.SAMPLED);
    expect(span.links[1].context.traceId).toBe('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    expect(span.links[1].context.spanId).toBe('aaaaaaaaaaaaaaaa');
    expect(span.links[1].attributes?.['link.reason']).toBe('retry');
  });

  it('should have empty links when spanLinks is omitted', () => {
    const scope = ExecuteToolScope.start(
      testRequest,
      { toolName: 'my-tool' } as ToolCallDetails,
      testAgentDetails
    );
    scope.dispose();

    const span = getFinishedSpan();
    expect(span.links).toHaveLength(0);
  });

  it('should preserve typed link attributes', () => {
    const linksWithAttrs: Link[] = [
      {
        context: {
          traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          spanId: 'bbbbbbbbbbbbbbbb',
          traceFlags: TraceFlags.SAMPLED,
        },
        attributes: { 'link.type': 'causal', 'link.index': 0 },
      },
    ];

    const scope = InvokeAgentScope.start(
      testRequest,
      {},
      { ...testAgentDetails, agentId: 'attr-agent' },
      undefined,
      { spanLinks: linksWithAttrs }
    );
    scope.dispose();

    const span = getFinishedSpan();
    expect(span.links).toHaveLength(1);
    expect(span.links[0].attributes?.['link.type']).toBe('causal');
    expect(span.links[0].attributes?.['link.index']).toBe(0);
  });

  it.each([
    ['InvokeAgentScope', () => InvokeAgentScope.start(
      testRequest, {}, testAgentDetails, undefined, spanDetailsWithLinks)],
    ['InferenceScope', () => InferenceScope.start(
      testRequest,
      { operationName: InferenceOperationType.CHAT, model: 'gpt-4', providerName: 'openai' } as InferenceDetails,
      testAgentDetails, undefined, spanDetailsWithLinks)],
    ['OutputScope', () => OutputScope.start(
      testRequest,
      { messages: ['hi'] } as OutputResponse,
      testAgentDetails, undefined, spanDetailsWithLinks)],
  ])('should forward span links on %s', (_name, createScope) => {
    const scope = createScope();
    scope.dispose();

    const span = getFinishedSpan();
    expect(span.links).toHaveLength(2);
    expect(span.links[0].context.traceId).toBe('0aa4621e5ae09963a3de354f3d18aa65');
    expect(span.links[0].context.spanId).toBe('c1aaa519600b1bf0');
    expect(span.links[0].context.traceFlags).toBe(TraceFlags.SAMPLED);
    expect(span.links[1].context.traceId).toBe('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    expect(span.links[1].context.spanId).toBe('aaaaaaaaaaaaaaaa');
    expect(span.links[1].context.traceFlags).toBe(TraceFlags.NONE);
    expect(span.links[1].attributes?.['link.reason']).toBe('retry');
  });
});
