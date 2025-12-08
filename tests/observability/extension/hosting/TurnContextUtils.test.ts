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
import { OpenTelemetryConstants, ExecutionType } from '@microsoft/agents-a365-observability';

describe('TurnContextUtils', () => {
  const mockTurnContext = {
    activity: {
      from: { id: 'user1', name: 'User One', agenticUserId: 'agentic-user-1', tenantId: 'tenant1', role: 'agenticUser', agenticAppBlueprintId: 'blueprint-123' },
      recipient: { id: 'agent1', name: 'Agent One', agenticAppId: 'agent-app-1', agenticUserId: 'agentic-agent-1', tenantId: 'tenant1', role: 'agenticUser', aadObjectId: 'aad-object-1' },
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
    expect(pairs.length).toBe(1);
    const [key, val] = pairs[0];
    expect(key).toBe(OpenTelemetryConstants.GEN_AI_EXECUTION_TYPE_KEY);
    expect(val).toBe(ExecutionType.Agent2Agent);
  });

  it('should get target agent baggage pairs', () => {
    const pairs = getTargetAgentBaggagePairs(mockTurnContext);
    expect(Array.isArray(pairs)).toBe(true);
    expect(pairs.length).toBeGreaterThan(0);
    const obj = Object.fromEntries(pairs);
    expect(obj[OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]).toBe('agent-app-1');
    expect(obj[OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY]).toBe('Agent One');
    expect(obj[OpenTelemetryConstants.GEN_AI_AGENT_AUID_KEY]).toBe('aad-object-1');
    expect(obj[OpenTelemetryConstants.GEN_AI_AGENT_BLUEPRINT_ID_KEY]).toBe(undefined);
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
