// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import {
  getCallerBaggagePairs,
  getTargetAgentBaggagePairs,
  getTenantIdPair,
  getChannelBaggagePairs,
  getConversationIdAndItemLinkPairs
} from '@microsoft/agents-a365-observability-hosting';
import { OpenTelemetryConstants } from '@microsoft/agents-a365-observability';

describe('TurnContextUtils', () => {
  const mockTurnContext = {
    activity: {
      from: { id: 'user1', name: 'User One', agenticUserId: 'agentic-user-1', tenantId: 'tenant1', role: 'agenticUser' },
      recipient: { id: 'agent1', name: 'Agent One', agenticAppId: 'agent-app-1', agenticUserId: 'agentic-agent-1', tenantId: 'tenant1', role: 'agenticUser' },
      conversation: { id: 'conv-1', tenantId: 'tenant1' },
      text: 'Hello world',
      isAgenticRequest: () => true,
      getAgenticInstanceId: () => 'agent-app-1',
      getAgenticUser: () => 'agentic-agent-1',
      getAgenticTenantId: () => 'tenant1',
    },
  } as any;

  it('should get caller baggage pairs', () => {
    const pairs = getCallerBaggagePairs(mockTurnContext);
    expect(Array.isArray(pairs)).toBe(true);
    expect(pairs.length).toBeGreaterThan(0);
  });

  it('should get target agent baggage pairs', () => {
    const pairs = getTargetAgentBaggagePairs(mockTurnContext);
    expect(Array.isArray(pairs)).toBe(true);
    expect(pairs.length).toBeGreaterThan(0);
    const obj = Object.fromEntries(pairs);
    expect(obj[OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]).toBe('agent-app-1');
    expect(obj[OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY]).toBe('Agent One');
    expect(obj[OpenTelemetryConstants.GEN_AI_AGENT_AUID_KEY]).toBeUndefined();
    expect(obj[OpenTelemetryConstants.GEN_AI_AGENT_BLUEPRINT_ID_KEY]).toBeUndefined();
  });

  it('should get tenant id pair', () => {
    const pairs = getTenantIdPair(mockTurnContext);
    expect(Array.isArray(pairs)).toBe(true);
    expect(pairs.length).toBeGreaterThan(0);
  });

  it('should get channel baggage pairs', () => {
    const pairs = getChannelBaggagePairs(mockTurnContext);
    expect(Array.isArray(pairs)).toBe(true);
  });

  it('should get conversation id and item link pairs', () => {
    const pairs = getConversationIdAndItemLinkPairs(mockTurnContext);
    expect(Array.isArray(pairs)).toBe(true);
  });
});
