// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace, context as otelContext } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { RoleTypes, ActivityTypes, ActivityEventNames } from '@microsoft/agents-activity';
import type { TurnContext, SendActivitiesHandler } from '@microsoft/agents-hosting';

import { OutputLoggingMiddleware, A365_PARENT_SPAN_KEY } from '../../../../packages/agents-a365-observability-hosting/src/middleware/OutputLoggingMiddleware';
import { OpenTelemetryConstants, ParentSpanRef } from '@microsoft/agents-a365-observability';

function makeMockTurnContext(options?: {
  text?: string;
  recipientId?: string;
  recipientName?: string;
  recipientTenantId?: string;
  channelId?: string;
  conversationId?: string;
  fromRole?: string;
  activityType?: string;
  activityName?: string;
}): TurnContext & { _sendHandlers: SendActivitiesHandler[]; turnState: Map<string, unknown>; simulateSend: (activities: Array<{ type?: string; text?: string }>) => Promise<Array<{ id: string }>> } {
  const sendHandlers: SendActivitiesHandler[] = [];

  const ctx: any = {
    activity: {
      type: options?.activityType,
      name: options?.activityName,
      text: options?.text ?? 'Hello agent',
      channelId: options?.channelId ?? 'web',
      conversation: { id: options?.conversationId ?? 'conv-001' },
      from: {
        role: options?.fromRole ?? RoleTypes.User,
        aadObjectId: 'user-oid',
        name: 'Test User',
        agenticUserId: 'user@contoso.com',
        tenantId: 'from-tenant',
      },
      recipient: {
        agenticAppId: options?.recipientId ?? 'agent-1',
        name: options?.recipientName ?? 'Agent One',
        aadObjectId: 'agent-oid',
        agenticAppBlueprintId: 'blueprint-1',
        agenticUserId: 'agent@contoso.com',
        role: 'assistant',
        tenantId: options?.recipientTenantId ?? 'tenant-123',
      },
    },
    turnState: new Map(),
    onSendActivities(handler: SendActivitiesHandler) {
      sendHandlers.push(handler);
      return ctx;
    },
    _sendHandlers: sendHandlers,
    async simulateSend(activities: Array<{ type?: string; text?: string }>) {
      const finalSend = async () => activities.map(() => ({ id: 'resp-1' }));
      let current = finalSend;
      for (let i = sendHandlers.length - 1; i >= 0; i--) {
        const handler = sendHandlers[i];
        const prev = current;
        current = () => handler(ctx, activities as any, prev as any);
      }
      return await current();
    },
  };

  return ctx;
}

describe('OutputLoggingMiddleware', () => {
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

  it('should create OutputScope for outgoing messages', async () => {
    const middleware = new OutputLoggingMiddleware();
    const ctx = makeMockTurnContext({ text: 'Hello' });

    await middleware.onTurn(ctx, async () => {
      ctx.turnState.set(A365_PARENT_SPAN_KEY, { traceId: '0af7651916cd43dd8448eb211c80319c', spanId: 'b7ad6b7169203331', traceFlags: 1 });
      await ctx.simulateSend([{ type: 'message', text: 'Hi there!' }]);
    });

    await flushProvider.forceFlush();
    const spans = exporter.getFinishedSpans();
    const outputSpan = spans.find(s => s.name.includes('output_messages'));

    expect(outputSpan).toBeDefined();
    expect(outputSpan!.attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY]).toBe(JSON.stringify(['Hi there!']));
  });

  it('should skip non-message activities in OutputScope', async () => {
    const middleware = new OutputLoggingMiddleware();
    const ctx = makeMockTurnContext({ text: 'Hello' });

    await middleware.onTurn(ctx, async () => {
      await ctx.simulateSend([
        { type: 'typing' },
        { type: 'event', text: 'some event data' },
      ]);
    });

    await flushProvider.forceFlush();
    expect(exporter.getFinishedSpans().find(s => s.name.includes('output_messages'))).toBeUndefined();
  });

  it('should pass through without tracing for skip conditions', async () => {
    const middleware = new OutputLoggingMiddleware();

    // Missing agent details (no recipient)
    const ctx1: any = { activity: { text: 'Hello' }, onSendActivities: jest.fn() };
    let nextCalled = false;
    await middleware.onTurn(ctx1, async () => { nextCalled = true; });
    expect(nextCalled).toBe(true);

    // Missing tenant details (recipient but no tenantId)
    const ctx2: any = {
      activity: { text: 'Hello', recipient: { agenticAppId: 'agent-1', name: 'Agent' } },
      onSendActivities: jest.fn(),
    };
    nextCalled = false;
    await middleware.onTurn(ctx2, async () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });

  it('should set caller details and enrichment on OutputScope span', async () => {
    const middleware = new OutputLoggingMiddleware();
    const ctx = makeMockTurnContext({ text: 'Hello', channelId: 'teams' });

    await middleware.onTurn(ctx, async () => {
      ctx.turnState.set(A365_PARENT_SPAN_KEY, { traceId: '0af7651916cd43dd8448eb211c80319c', spanId: 'b7ad6b7169203331', traceFlags: 1 });
      await ctx.simulateSend([{ type: 'message', text: 'Reply' }]);
    });

    await flushProvider.forceFlush();
    const outputSpan = exporter.getFinishedSpans().find(s => s.name.includes('output_messages'));
    expect(outputSpan).toBeDefined();

    expect(outputSpan!.attributes[OpenTelemetryConstants.GEN_AI_CALLER_ID_KEY]).toBe('user-oid');
    expect(outputSpan!.attributes[OpenTelemetryConstants.GEN_AI_CALLER_NAME_KEY]).toBe('Test User');
    expect(outputSpan!.attributes[OpenTelemetryConstants.CHANNEL_NAME_KEY]).toBe('teams');
  });

  it('should link OutputScope to parent when parentSpanRef is set in turnState', async () => {
    const middleware = new OutputLoggingMiddleware();
    const ctx = makeMockTurnContext({ text: 'Hello' });

    const parentSpanRef: ParentSpanRef = {
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      traceFlags: 1,
    };

    await middleware.onTurn(ctx, async () => {
      ctx.turnState.set(A365_PARENT_SPAN_KEY, parentSpanRef);
      await ctx.simulateSend([{ type: 'message', text: 'Reply' }]);
    });

    await flushProvider.forceFlush();
    const outputSpan = exporter.getFinishedSpans().find(s => s.name.includes('output_messages'));
    expect(outputSpan).toBeDefined();
    expect(outputSpan!.parentSpanContext?.traceId).toBe(parentSpanRef.traceId);
    expect(outputSpan!.parentSpanContext?.spanId).toBe(parentSpanRef.spanId);
  });

  it('should create OutputScope for async reply (ContinueConversation) when messages are sent', async () => {
    const middleware = new OutputLoggingMiddleware();
    const ctx = makeMockTurnContext({
      text: 'Hello',
      activityType: ActivityTypes.Event,
      activityName: ActivityEventNames.ContinueConversation,
    });

    await middleware.onTurn(ctx, async () => {
      await ctx.simulateSend([{ type: 'message', text: 'Async reply' }]);
    });

    await flushProvider.forceFlush();
    const outputSpan = exporter.getFinishedSpans().find(s => s.name.includes('output_messages'));
    expect(outputSpan).toBeDefined();
    expect(outputSpan!.attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY]).toBe(JSON.stringify(['Async reply']));
  });

  it('should link async reply OutputScope to parent when parentSpanRef is set', async () => {
    const middleware = new OutputLoggingMiddleware();
    const ctx = makeMockTurnContext({
      text: 'Hello',
      activityType: ActivityTypes.Event,
      activityName: ActivityEventNames.ContinueConversation,
    });

    const parentSpanRef: ParentSpanRef = {
      traceId: '1af7651916cd43dd8448eb211c80319c',
      spanId: 'c7ad6b7169203331',
      traceFlags: 1,
    };
    ctx.turnState.set(A365_PARENT_SPAN_KEY, parentSpanRef);

    await middleware.onTurn(ctx, async () => {
      await ctx.simulateSend([{ type: 'message', text: 'Async reply' }]);
    });

    await flushProvider.forceFlush();
    const outputSpan = exporter.getFinishedSpans().find(s => s.name.includes('output_messages'));
    expect(outputSpan).toBeDefined();
    expect(outputSpan!.parentSpanContext?.traceId).toBe(parentSpanRef.traceId);
    expect(outputSpan!.parentSpanContext?.spanId).toBe(parentSpanRef.spanId);
  });

  it('should not create spans when no messages are sent', async () => {
    const middleware = new OutputLoggingMiddleware();
    const ctx = makeMockTurnContext({
      text: 'Hello',
      activityType: ActivityTypes.Event,
      activityName: ActivityEventNames.ContinueConversation,
    });

    await middleware.onTurn(ctx, async () => {
      // next() without sending any messages
    });

    await flushProvider.forceFlush();
    expect(exporter.getFinishedSpans().length).toBe(0);
  });

  it('should re-throw errors from sendNext after recording on OutputScope', async () => {
    const middleware = new OutputLoggingMiddleware();
    const ctx = makeMockTurnContext({ text: 'Hello' });
    const sendError = new Error('send pipeline failed');

    // Override simulateSend to make the send pipeline throw
    ctx.simulateSend = async () => { throw sendError; };

    // Register handler manually since simulateSend is overridden
    await middleware.onTurn(ctx, async () => {
      ctx.turnState.set(A365_PARENT_SPAN_KEY, { traceId: '0af7651916cd43dd8448eb211c80319c', spanId: 'b7ad6b7169203331', traceFlags: 1 });
      // Simulate the handler being called with message activities
      const handler = ctx._sendHandlers[0];
      if (handler) {
        await expect(
          handler(ctx, [{ type: 'message', text: 'Reply' }] as any, async () => { throw sendError; })
        ).rejects.toThrow('send pipeline failed');
      }
    });
  });
});
