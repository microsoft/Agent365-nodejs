// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import {
  getCallerBaggagePairs,
  getExecutionTypePair,
  getTargetAgentBaggagePairs,
  getTenantIdPair,
  getSourceMetadataBaggagePairs,
  getConversationIdAndItemLinkPairs
} from '@microsoft/agents-a365-observability-hosting';

describe('TurnContextUtils', () => {
  const mockTurnContext = {
    activity: {
      from: { id: 'user1', name: 'User One', AgenticUserId: 'agentic-user-1', TenantId: 'tenant1' },
      recipient: { id: 'agent1', name: 'Agent One', AgenticAppId: 'agent-app-1', AgenticUserId: 'agentic-agent-1', tenantId: 'tenant1' },
      channelData: {},
      text: 'Hello world',
    },
  } as any;

  it('should get caller baggage pairs', () => {
    const pairs = getCallerBaggagePairs(mockTurnContext);
    expect(Array.isArray(pairs)).toBe(true);
    expect(pairs.length).toBeGreaterThan(0);
  });

  it('should get execution type pair', () => {
    const pairs = getExecutionTypePair(mockTurnContext);
    expect(Array.isArray(pairs)).toBe(true);
    expect(pairs.length).toBeGreaterThan(0);
  });

  it('should get target agent baggage pairs', () => {
    const pairs = getTargetAgentBaggagePairs(mockTurnContext);
    expect(Array.isArray(pairs)).toBe(true);
    expect(pairs.length).toBeGreaterThan(0);
  });

  it('should get tenant id pair', () => {
    const pairs = getTenantIdPair(mockTurnContext);
    expect(Array.isArray(pairs)).toBe(true);
    expect(pairs.length).toBeGreaterThan(0);
  });

  it('should get source metadata baggage pairs', () => {
    const pairs = getSourceMetadataBaggagePairs(mockTurnContext);
    expect(Array.isArray(pairs)).toBe(true);
  });

  it('should get conversation id and item link pairs', () => {
    const pairs = getConversationIdAndItemLinkPairs(mockTurnContext);
    expect(Array.isArray(pairs)).toBe(true);
  });
});
