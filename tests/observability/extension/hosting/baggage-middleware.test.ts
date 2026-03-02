// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace, context as otelContext, propagation } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { RoleTypes, ActivityTypes, ActivityEventNames } from '@microsoft/agents-activity';
import type { TurnContext } from '@microsoft/agents-hosting';

import { BaggageMiddleware } from '../../../../packages/agents-a365-observability-hosting/src/middleware/BaggageMiddleware';
import { OpenTelemetryConstants } from '@microsoft/agents-a365-observability';

function makeMockTurnContext(options?: {
  text?: string;
  recipientId?: string;
  recipientTenantId?: string;
  channelId?: string;
  conversationId?: string;
  fromRole?: string;
  activityType?: string;
  activityName?: string;
}): TurnContext {
  const recipientTenantId = options?.recipientTenantId ?? 'tenant-123';
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
        name: 'Agent One',
        aadObjectId: 'agent-oid',
        agenticAppBlueprintId: 'blueprint-1',
        agenticUserId: 'agent@contoso.com',
        role: 'assistant',
        tenantId: recipientTenantId,
      },
      getAgenticTenantId: () => recipientTenantId,
      getAgenticUser: () => 'agent@contoso.com',
      getAgenticInstanceId: () => options?.recipientId ?? 'agent-1',
      isAgenticRequest: () => false,
    },
    turnState: new Map(),
  };

  return ctx;
}

describe('BaggageMiddleware', () => {
  let provider: BasicTracerProvider;
  let contextManager: AsyncLocalStorageContextManager;

  beforeAll(() => {
    contextManager = new AsyncLocalStorageContextManager();
    contextManager.enable();
    otelContext.setGlobalContextManager(contextManager);

    const exporter = new InMemorySpanExporter();
    const processor = new SimpleSpanProcessor(exporter);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const globalProvider: any = trace.getTracerProvider();
    if (globalProvider && typeof globalProvider.addSpanProcessor === 'function') {
      globalProvider.addSpanProcessor(processor);
    } else {
      provider = new BasicTracerProvider({
        spanProcessors: [processor]
      });
      trace.setGlobalTracerProvider(provider);
    }
  });

  afterAll(async () => {
    await provider?.shutdown?.();
    contextManager.disable();
    otelContext.disable();
  });

  it('should propagate baggage context during turn', async () => {
    const middleware = new BaggageMiddleware();
    const ctx = makeMockTurnContext();
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
    expect(capturedBaggage[OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_NAME_KEY]).toBe('web');
    expect(capturedBaggage[OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY]).toBe('conv-001');
  });

  it('should skip baggage setup for async replies (ContinueConversation)', async () => {
    const middleware = new BaggageMiddleware();
    const ctx = makeMockTurnContext({
      activityType: ActivityTypes.Event,
      activityName: ActivityEventNames.ContinueConversation,
    });
    let capturedBaggage: Record<string, string> = {};

    await middleware.onTurn(ctx, async () => {
      const bag = propagation.getBaggage(otelContext.active());
      if (bag) {
        for (const [key, entry] of bag.getAllEntries()) {
          capturedBaggage[key] = entry.value;
        }
      }
    });

    // No baggage set for async replies
    expect(Object.keys(capturedBaggage).length).toBe(0);
  });

  it('should call next() even when baggage setup is skipped', async () => {
    const middleware = new BaggageMiddleware();
    const ctx = makeMockTurnContext({
      activityType: ActivityTypes.Event,
      activityName: ActivityEventNames.ContinueConversation,
    });
    let nextCalled = false;

    await middleware.onTurn(ctx, async () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
  });
});
