// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace, context as otelContext, SpanStatusCode, propagation } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { RoleTypes, ActivityTypes, ActivityEventNames } from '@microsoft/agents-activity';
import type { TurnContext, SendActivitiesHandler } from '@microsoft/agents-hosting';

import { MessageLoggingMiddleware, A365_PARENT_SPAN_KEY } from '../../../../packages/agents-a365-observability-hosting/src/middleware/MessageLoggingMiddleware';
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

describe('MessageLoggingMiddleware', () => {
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

  it('should create InputScope and OutputScope as sibling spans', async () => {
    const middleware = new MessageLoggingMiddleware();
    const ctx = makeMockTurnContext({ text: 'Hello' });
    let nextCalled = false;

    await middleware.onTurn(ctx, async () => {
      nextCalled = true;
      await ctx.simulateSend([{ type: 'message', text: 'Hi there!' }]);
    });

    expect(nextCalled).toBe(true);

    await flushProvider.forceFlush();
    const spans = exporter.getFinishedSpans();
    const inputSpan = spans.find(s => s.name.includes('input_messages'));
    const outputSpan = spans.find(s => s.name.includes('output_messages'));

    expect(inputSpan).toBeDefined();
    expect(inputSpan!.attributes[OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY]).toBe(JSON.stringify(['Hello']));

    expect(outputSpan).toBeDefined();
    expect(outputSpan!.attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY]).toBe(JSON.stringify(['Hi there!']));

    // Without A365_PARENT_SPAN_KEY set, both spans are independent root spans
    expect(inputSpan!.parentSpanContext).toBeUndefined();
    expect(outputSpan!.parentSpanContext).toBeUndefined();
  });

  it('should record error on InputScope when turn throws without re-throwing', async () => {
    const middleware = new MessageLoggingMiddleware();

    // Error instance — middleware records but does not re-throw
    const ctx1 = makeMockTurnContext({ text: 'Hello' });
    await middleware.onTurn(ctx1, async () => { throw new Error('Something went wrong'); });

    await flushProvider.forceFlush();
    const inputSpan1 = exporter.getFinishedSpans().find(s => s.name.includes('input_messages'));
    expect(inputSpan1!.status.code).toBe(SpanStatusCode.ERROR);
    expect(inputSpan1!.status.message).toBe('Something went wrong');

    // Non-Error value
    exporter.reset();
    const ctx2 = makeMockTurnContext({ text: 'Hello' });
    await middleware.onTurn(ctx2, async () => { throw 'string error'; });

    await flushProvider.forceFlush();
    const inputSpan2 = exporter.getFinishedSpans().find(s => s.name.includes('input_messages'));
    expect(inputSpan2!.status.code).toBe(SpanStatusCode.ERROR);
    expect(inputSpan2!.status.message).toBe('string error');
  });

  it('should skip non-message activities in OutputScope', async () => {
    const middleware = new MessageLoggingMiddleware();
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

  it('should respect logUserMessages and logBotMessages options', async () => {
    // logUserMessages: false — no InputScope
    const mw1 = new MessageLoggingMiddleware({ logUserMessages: false });
    const ctx1 = makeMockTurnContext({ text: 'Hello' });
    let nextCalled = false;
    await mw1.onTurn(ctx1, async () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    await flushProvider.forceFlush();
    expect(exporter.getFinishedSpans().find(s => s.name.includes('input_messages'))).toBeUndefined();

    // logBotMessages: false — no send handler registered
    exporter.reset();
    const mw2 = new MessageLoggingMiddleware({ logBotMessages: false });
    const ctx2 = makeMockTurnContext({ text: 'Hello' });
    await mw2.onTurn(ctx2, async () => {
      expect(ctx2._sendHandlers.length).toBe(0);
    });
  });

  it('should pass through without tracing for skip conditions', async () => {
    const middleware = new MessageLoggingMiddleware();

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

    // No input text — next() called but no InputScope
    const ctx3: any = {
      activity: {
        channelId: 'web',
        conversation: { id: 'conv-001' },
        from: { role: RoleTypes.User },
        recipient: { agenticAppId: 'agent-1', name: 'Agent One', tenantId: 'tenant-123' },
      },
      turnState: new Map(),
      onSendActivities: jest.fn().mockReturnThis(),
    };
    nextCalled = false;
    await middleware.onTurn(ctx3, async () => { nextCalled = true; });
    expect(nextCalled).toBe(true);

    // ContinueConversation event — only output tracing (no input/baggage)
    const ctx4: any = {
      activity: {
        type: ActivityTypes.Event,
        name: ActivityEventNames.ContinueConversation,
        text: 'Hello',
        recipient: { agenticAppId: 'agent-1', name: 'Agent One', tenantId: 'tenant-123' },
        from: { role: RoleTypes.User, aadObjectId: 'user-oid', name: 'User' },
        conversation: { id: 'conv-001' },
      },
      turnState: new Map(),
      onSendActivities: jest.fn().mockReturnThis(),
    };
    nextCalled = false;
    await middleware.onTurn(ctx4, async () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    // ContinueConversation registers output handler but skips input/baggage
    expect(ctx4.onSendActivities).toHaveBeenCalledTimes(1);

    await flushProvider.forceFlush();
    expect(exporter.getFinishedSpans().length).toBe(0);
  });

  it('should set caller details and enrichment on OutputScope span', async () => {
    const middleware = new MessageLoggingMiddleware();
    const ctx = makeMockTurnContext({ text: 'Hello', channelId: 'teams' });

    await middleware.onTurn(ctx, async () => {
      await ctx.simulateSend([{ type: 'message', text: 'Reply' }]);
    });

    await flushProvider.forceFlush();
    const outputSpan = exporter.getFinishedSpans().find(s => s.name.includes('output_messages'));
    expect(outputSpan).toBeDefined();

    expect(outputSpan!.attributes[OpenTelemetryConstants.GEN_AI_CALLER_ID_KEY]).toBe('user-oid');
    expect(outputSpan!.attributes[OpenTelemetryConstants.GEN_AI_CALLER_NAME_KEY]).toBe('Test User');
    expect(outputSpan!.attributes[OpenTelemetryConstants.GEN_AI_EXECUTION_TYPE_KEY]).toBe('HumanToAgent');
    expect(outputSpan!.attributes[OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_NAME_KEY]).toBe('teams');
  });

  it('should propagate baggage context during turn', async () => {
    const middleware = new MessageLoggingMiddleware();
    const ctx = makeMockTurnContext({ text: 'Hello' });
    let capturedBaggage: Record<string, string> = {};

    await middleware.onTurn(ctx, async () => {
      const bag = propagation.getBaggage(otelContext.active());
      if (bag) {
        for (const [key, entry] of bag.getAllEntries()) {
          capturedBaggage[key] = entry.value;
        }
      }
    });

    expect(capturedBaggage[OpenTelemetryConstants.GEN_AI_CALLER_ID_KEY]).toBe('user-oid');
    expect(capturedBaggage[OpenTelemetryConstants.TENANT_ID_KEY]).toBe('tenant-123');
    expect(capturedBaggage[OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]).toBe('agent-1');
  });

  it('should link InputScope and OutputScope to parent when parentSpanRef is set in turnState', async () => {
    const middleware = new MessageLoggingMiddleware();
    const ctx = makeMockTurnContext({ text: 'Hello' });

    const parentSpanRef: ParentSpanRef = {
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      traceFlags: 1,
    };

    await middleware.onTurn(ctx, async () => {
      // Agent handler sets parent span ref during next() — both scopes read it lazily
      ctx.turnState.set(A365_PARENT_SPAN_KEY, parentSpanRef);
      await ctx.simulateSend([{ type: 'message', text: 'Reply' }]);
    });

    await flushProvider.forceFlush();
    const spans = exporter.getFinishedSpans();
    const inputSpan = spans.find(s => s.name.includes('input_messages'));
    const outputSpan = spans.find(s => s.name.includes('output_messages'));

    expect(inputSpan).toBeDefined();
    expect(outputSpan).toBeDefined();

    // Both InputScope and OutputScope read parentSpanRef from turnState after next()
    expect(inputSpan!.parentSpanContext?.traceId).toBe(parentSpanRef.traceId);
    expect(inputSpan!.parentSpanContext?.spanId).toBe(parentSpanRef.spanId);
    expect(outputSpan!.parentSpanContext?.traceId).toBe(parentSpanRef.traceId);
    expect(outputSpan!.parentSpanContext?.spanId).toBe(parentSpanRef.spanId);
  });

  it('should create OutputScope for async reply (ContinueConversation) when messages are sent', async () => {
    const middleware = new MessageLoggingMiddleware();
    const ctx = makeMockTurnContext({
      text: 'Hello',
      activityType: ActivityTypes.Event,
      activityName: ActivityEventNames.ContinueConversation,
    });

    await middleware.onTurn(ctx, async () => {
      await ctx.simulateSend([{ type: 'message', text: 'Async reply' }]);
    });

    await flushProvider.forceFlush();
    const spans = exporter.getFinishedSpans();

    // No InputScope for async replies
    expect(spans.find(s => s.name.includes('input_messages'))).toBeUndefined();

    // OutputScope is created for the sent message
    const outputSpan = spans.find(s => s.name.includes('output_messages'));
    expect(outputSpan).toBeDefined();
    expect(outputSpan!.attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY]).toBe(JSON.stringify(['Async reply']));
  });

  it('should link async reply OutputScope to parent when parentSpanRef is set', async () => {
    const middleware = new MessageLoggingMiddleware();
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
    const spans = exporter.getFinishedSpans();
    const outputSpan = spans.find(s => s.name.includes('output_messages'));

    expect(outputSpan).toBeDefined();
    expect(outputSpan!.parentSpanContext?.traceId).toBe(parentSpanRef.traceId);
    expect(outputSpan!.parentSpanContext?.spanId).toBe(parentSpanRef.spanId);
  });

  it('should not create spans for async reply when no messages are sent', async () => {
    const middleware = new MessageLoggingMiddleware();
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
});
