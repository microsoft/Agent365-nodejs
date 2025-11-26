// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { BaggageBuilderUtils } from '@microsoft/agents-a365-observability-hosting';
import { BaggageBuilder, OpenTelemetryConstants } from '@microsoft/agents-a365-observability';

describe('BaggageBuilderUtils', () => {
  const mockTurnContext = {
    activity: {
      from: { id: 'user1', name: 'User One', agenticUserId: 'agentic-user-1', tenantId: 'tenant1', aadObjectId: 'aad-object-1' },
      recipient: { id: 'agent1', name: 'Agent One', agenticAppId: 'agent-app-1', agenticUserId: 'agentic-agent-1', tenantId: 'tenant1', aadObjectId: 'aad-object-2' },
      channelData: {},
    },
  } as any;

  it('should populate all baggage pairs from TurnContext', () => {
    // Mock BaggageBuilder to capture setPairs calls
    const capturedPairs: Array<[string, string]> = [];
    class MockBaggageBuilder extends BaggageBuilder {
      setPairs(pairs: Record<string, any> | Iterable<[string, any]> | null | undefined): this {
        if (pairs) {
          let entries: Iterable<[string, any]>;
          if (Symbol.iterator in Object(pairs)) {
            entries = pairs as Iterable<[string, any]>;
          } else {
            entries = Object.entries(pairs);
          }
          for (const [k, v] of entries) {
            if (v !== null && v !== undefined) {
              capturedPairs.push([k, String(v)]);
            }
          }
        }
        return this;
      }
    }
    const builder = new MockBaggageBuilder();
    const result = BaggageBuilderUtils.fromTurnContext(builder, mockTurnContext);
    expect(result).toBe(builder);
    // Validate every expected OpenTelemetry baggage key and value
    const asObj = Object.fromEntries(capturedPairs);
    expect(asObj[OpenTelemetryConstants.GEN_AI_CALLER_ID_KEY]).toBe('aad-object-1');
    expect(asObj[OpenTelemetryConstants.GEN_AI_CALLER_NAME_KEY]).toBe('User One');
    expect(asObj[OpenTelemetryConstants.GEN_AI_CALLER_UPN_KEY]).toBe('User One');
    expect(asObj[OpenTelemetryConstants.GEN_AI_CALLER_USER_ID_KEY]).toBe('agentic-user-1');
    expect(asObj[OpenTelemetryConstants.GEN_AI_CALLER_TENANT_ID_KEY]).toBe('tenant1');
    expect(asObj[OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]).toBe('agent-app-1');
    expect(asObj[OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY]).toBe('Agent One');
    expect(asObj[OpenTelemetryConstants.GEN_AI_AGENT_AUID_KEY]).toBe('agentic-agent-1');
    expect(asObj[OpenTelemetryConstants.GEN_AI_AGENT_UPN_KEY]).toBe(undefined);
    expect(asObj[OpenTelemetryConstants.TENANT_ID_KEY]).toBe('tenant1');
  });

  it('should throw if turnContext is missing', () => {
    const builder = new BaggageBuilder();
    expect(() => BaggageBuilderUtils.fromTurnContext(builder, undefined as any)).toThrow();
  });
});
