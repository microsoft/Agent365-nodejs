// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { ScopeUtils } from '../../../..//packages/agents-a365-observability-hosting/src/utils/ScopeUtils';
import { InferenceScope, InvokeAgentScope, ExecuteToolScope } from '@microsoft/agents-a365-observability';
import type { TurnContext } from '@microsoft/agents-hosting';

// Minimal detail objects to construct scopes
const agentDetails = { id: 'agent-1', name: 'Agent One', version: '1.0.0' } as any;
const tenantDetails = { id: 'tenant-123' } as any;

function makeTurnContext(text?: string, channelName?: string, channelUrl?: string, conversationId?: string): TurnContext {
  return {
    activity: {
      text: text ?? 'hello world',
      channelData: {
        channelName: channelName ?? 'web',
        channelUrl: channelUrl ?? 'https://example/channel'
      },
      conversation: { id: conversationId ?? 'conv-001' }
    }
  } as any;
}

describe('ScopeUtils.populateFromTurnContext', () => {
  test('InferenceScope: applies common tags and input messages', () => {
    const details = { operationName: 'inference', model: 'gpt-4o', providerName: 'openai' } as any;
    const scope = InferenceScope.start(details, agentDetails, tenantDetails);
    const ctx = makeTurnContext('input text', 'web', 'https://web', 'conv-A');

    const populated = ScopeUtils.populateFromTurnContext(scope, ctx);
    expect(populated).toBe(scope);
  });

  test('InvokeAgentScope: applies common + invoke-specific + input messages', () => {
    const details = { operationName: 'invoke', model: 'n/a', providerName: 'internal' } as any;
    const scope = InvokeAgentScope.start(details, agentDetails, tenantDetails);
    const ctx = makeTurnContext('invoke message', 'teams', 'https://teams', 'conv-B');

    const populated = ScopeUtils.populateFromTurnContext(scope, ctx);
    expect(populated).toBe(scope);
  });

  test('ExecuteToolScope: applies common tags only', () => {
    const details = { toolName: 'search', arguments: '{}' } as any;
    const scope = ExecuteToolScope.start(details, agentDetails, tenantDetails);
    const ctx = makeTurnContext(undefined, 'cli', 'https://cli', 'conv-C');

    const populated = ScopeUtils.populateFromTurnContext(scope, ctx);
    expect(populated).toBe(scope);
  });
});
