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

  it('should fall back to from.id for userId when aadObjectId is undefined (non-Teams channel)', () => {
    const ctx = {
      activity: {
        from: { id: 'user1', name: 'User One' },
        recipient: { id: 'agent1', name: 'Agent One' },
        conversation: { id: 'conv-1' },
      },
    } as any;
    const pairs = getCallerBaggagePairs(ctx);
    const obj = Object.fromEntries(pairs);
    expect(obj[OpenTelemetryConstants.USER_ID_KEY]).toBe('user1');
  });

  it('should fall back to agenticUserId for userId when aadObjectId is undefined (A2A)', () => {
    const ctx = {
      activity: {
        from: { id: 'user1', name: 'User One', agenticUserId: 'agentic-user-1' },
        recipient: { id: 'agent1', name: 'Agent One' },
        conversation: { id: 'conv-1' },
      },
    } as any;
    const pairs = getCallerBaggagePairs(ctx);
    const obj = Object.fromEntries(pairs);
    expect(obj[OpenTelemetryConstants.USER_ID_KEY]).toBe('agentic-user-1');
  });

  it('should prefer aadObjectId for userId when all three fields are set', () => {
    const ctx = {
      activity: {
        from: { id: 'user1', name: 'User One', aadObjectId: 'aad-123', agenticUserId: 'agentic-user-1' },
        recipient: { id: 'agent1', name: 'Agent One' },
        conversation: { id: 'conv-1' },
      },
    } as any;
    const pairs = getCallerBaggagePairs(ctx);
    const obj = Object.fromEntries(pairs);
    expect(obj[OpenTelemetryConstants.USER_ID_KEY]).toBe('aad-123');
  });

  it('should resolve userId to agenticUserId when it is a GUID (A2A with GUID agenticUserId)', () => {
    const ctx = {
      activity: {
        from: { id: 'user1', name: 'User One', agenticUserId: 'bef730f4-d6f5-4ffb-b759-26ffa449ed7e' },
        recipient: { id: 'agent1', name: 'Agent One' },
        conversation: { id: 'conv-1' },
      },
    } as any;
    const pairs = getCallerBaggagePairs(ctx);
    const obj = Object.fromEntries(pairs);
    expect(obj[OpenTelemetryConstants.USER_ID_KEY]).toBe('bef730f4-d6f5-4ffb-b759-26ffa449ed7e');
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
