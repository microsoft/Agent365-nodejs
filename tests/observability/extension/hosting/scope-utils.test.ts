// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { ScopeUtils } from '../../../../packages/agents-a365-observability-hosting/src/utils/ScopeUtils';
import { InferenceScope, InvokeAgentScope, ExecuteToolScope, OpenTelemetryConstants, ExecutionType, OpenTelemetryScope, InvokeAgentDetails } from '@microsoft/agents-a365-observability';
import { RoleTypes } from '@microsoft/agents-activity';
import type { TurnContext } from '@microsoft/agents-hosting';


function makeTurnContext(
  text?: string,
  channelName?: string,
  channelLink?: string,
  conversationId?: string,
): TurnContext {
  const base: any = {
    activity: {
      text: text ?? 'hello world',
      channelId: channelName ?? 'web',
      channelIdSubChannel: channelLink ?? 'https://example/channel',
      conversation: { id: conversationId ?? 'conv-001' }
    }
  };

  base.activity.from = {
    role: RoleTypes.User,
    aadObjectId: 'user-oid',
    name: 'Test User',
    agenticUserId: 'user@contoso.com',
    tenantId: 'tenant-xyz',
    agenticAppBlueprintId: 'caller-agentBlueprintId',
    agenticAppId: 'callerAgent-1'
  };
  base.activity.recipient = {
    agenticAppId: 'agent-1',
    name: 'Agent One',
    aadObjectId: 'agent-oid',
    role: 'assistant',
    tenantId: 'tenant-123'
  };
  return base as TurnContext;
}

describe('ScopeUtils.populateFromTurnContext', () => {
  let spy: jest.SpyInstance;
  beforeEach(() => { 
    spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
   });

  afterEach(() => {
    spy.mockRestore();
  });

  test('build InferenceScope based on turn context', () => {    
    const details = { operationName: 'inference', model: 'gpt-4o', providerName: 'openai' } as any;
    const ctx = makeTurnContext('input text', 'web', 'https://web', 'conv-A');
    const scope = ScopeUtils.populateInferenceScopeFromTurnContext(details, ctx) as InferenceScope;
    expect(scope).toBeInstanceOf(InferenceScope);
    const calls = spy.mock.calls.map(args => [args[0], args[1]]);
    expect(calls).toEqual(
      expect.arrayContaining([
        [OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, 'conv-A'],
        [OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_NAME_KEY, 'web'],
        [OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_DESCRIPTION_KEY, 'https://web'],
        [OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY, 'Agent One'],        
        [OpenTelemetryConstants.GEN_AI_AGENT_AUID_KEY, 'agent-oid'],  
        [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY, 'agent-1'],
        [OpenTelemetryConstants.GEN_AI_AGENT_DESCRIPTION_KEY, 'assistant'],
        [OpenTelemetryConstants.TENANT_ID_KEY, 'tenant-123'],
        [OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY, 'input text']
      ])
    );
    scope?.dispose();
  });

  test('build InvokeAgentScope based on turn context', () => {    
    const details = { operationName: 'invoke', model: 'n/a', providerName: 'internal' } as any;
    const ctx = makeTurnContext('invoke message', 'teams', 'https://teams', 'conv-B');
    ctx.activity.from!.role = RoleTypes.AgenticUser;
    const scope = ScopeUtils.populateInvokeAgentScopeFromTurnContext(details, ctx) as InvokeAgentScope;
    expect(scope).toBeInstanceOf(InvokeAgentScope);
    const calls = spy.mock.calls.map(args => [args[0], args[1]]);
    expect(calls).toEqual(
      expect.arrayContaining([
        [OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, 'conv-B'],
        [OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_NAME_KEY, 'teams'],
        [OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_DESCRIPTION_KEY, 'https://teams'],
        [OpenTelemetryConstants.GEN_AI_CALLER_ID_KEY, 'user-oid'],
        [OpenTelemetryConstants.GEN_AI_CALLER_NAME_KEY, 'Test User'],
        [OpenTelemetryConstants.GEN_AI_CALLER_UPN_KEY, 'user@contoso.com'],
        [OpenTelemetryConstants.GEN_AI_CALLER_TENANT_ID_KEY, 'tenant-xyz'],
        [OpenTelemetryConstants.GEN_AI_CALLER_AGENT_USER_ID_KEY, 'user-oid'],
        [OpenTelemetryConstants.GEN_AI_CALLER_AGENT_NAME_KEY, 'Test User'],
        [OpenTelemetryConstants.GEN_AI_CALLER_AGENT_ID_KEY, 'callerAgent-1'],
        [OpenTelemetryConstants.GEN_AI_CALLER_AGENT_APPLICATION_ID_KEY, 'caller-agentBlueprintId'],
        [OpenTelemetryConstants.TENANT_ID_KEY, 'tenant-123'],
        [OpenTelemetryConstants.GEN_AI_EXECUTION_TYPE_KEY, ExecutionType.Agent2Agent.toString()],
        [OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY, 'invoke message'],
        [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY, 'agent-1'],
        [OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY, 'Agent One'],
        [OpenTelemetryConstants.GEN_AI_AGENT_DESCRIPTION_KEY, 'assistant']
      ])
    );
    scope?.dispose();
  });

  test('build ExecuteToolScope based on turn context', () => {
    const details = { toolName: 'search', arguments: '{}' } as any;
    const ctx = makeTurnContext(undefined, 'cli', 'https://cli', 'conv-C');
    const scope = ScopeUtils.populateExecuteToolScopeFromTurnContext(details, ctx) as ExecuteToolScope;
    expect(scope).toBeInstanceOf(ExecuteToolScope);
    const calls = spy.mock.calls.map(args => [args[0], args[1]]);
    expect(calls).toEqual(
      expect.arrayContaining([
        [OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, 'conv-C'],
        [OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_NAME_KEY, 'cli'],
        [OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_DESCRIPTION_KEY, 'https://cli'],
        [OpenTelemetryConstants.GEN_AI_AGENT_AUID_KEY, 'agent-oid'],
        [OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY, 'Agent One'],
        [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY, 'agent-1'],
        [OpenTelemetryConstants.GEN_AI_AGENT_DESCRIPTION_KEY, 'assistant'],
        [OpenTelemetryConstants.TENANT_ID_KEY, 'tenant-123']
      ])
    );
    scope?.dispose();    
  });
});

// Simple helper to craft partial TurnContext objects for edge cases
function makeCtx(partial: Partial<TurnContext>): TurnContext {
  return partial as unknown as TurnContext;
}

test('deriveTenantDetails prefers recipient.tenantId', () => {
  const ctx = makeCtx({ activity: { recipient: { tenantId: 't-rec' }, from: { tenantId: 't-from' } } as any });
  expect(ScopeUtils.deriveTenantDetails(ctx)).toEqual({ tenantId: 't-rec' });
});

test('deriveTenantDetails returns undefined when only from.tenantId is present', () => {
  const ctx = makeCtx({ activity: { from: { tenantId: 't-from' } } as any });
  expect(ScopeUtils.deriveTenantDetails(ctx)).toBeUndefined();
});

test('deriveAgentDetails maps recipient fields to AgentDetails', () => {
  const ctx = makeCtx({ activity: { recipient: { agenticAppId: 'aid', name: 'A', aadObjectId: 'auid', role: 'bot', tenantId: 't1' } } as any });
  expect(ScopeUtils.deriveAgentDetails(ctx)).toEqual({
    agentId: 'aid',
    agentName: 'A',
    agentAUID: 'auid',
    agentDescription: 'bot',
    tenantId: 't1',
  });
});

test('deriveAgentDetails returns undefined without recipient', () => {
  const ctx = makeCtx({ activity: {} as any });
  expect(ScopeUtils.deriveAgentDetails(ctx)).toBeUndefined();
});

test('deriveCallerAgent maps from fields to caller AgentDetails', () => {
  const ctx = makeCtx({ activity: { from: { agenticAppBlueprintId: 'bp', name: 'Caller', aadObjectId: 'uid', role: 'agent', tenantId: 't2', agenticAppId: 'agent-caller' } } as any });
  expect(ScopeUtils.deriveCallerAgent(ctx)).toEqual({
    agentBlueprintId: 'bp',
    agentName: 'Caller',
    agentAUID: 'uid',
    agentDescription: 'agent',
    tenantId: 't2',
    agentId: 'agent-caller',
  });
});

test('deriveCallerAgent returns undefined without from', () => {
  const ctx = makeCtx({ activity: {} as any });
  expect(ScopeUtils.deriveCallerAgent(ctx)).toBeUndefined();
});

test('deriveCallerDetails maps from to CallerDetails', () => {
  const ctx = makeCtx({ activity: { from: { aadObjectId: 'uid', agenticUserId: 'upn', name: 'User', tenantId: 't3' } } as any });
  expect(ScopeUtils.deriveCallerDetails(ctx)).toEqual({
    callerId: 'uid',
    callerUpn: 'upn',
    callerName: 'User',
    tenantId: 't3',
  });
});

test('deriveCallerDetails returns undefined without from', () => {
  const ctx = makeCtx({ activity: {} as any });
  expect(ScopeUtils.deriveCallerDetails(ctx)).toBeUndefined();
});

test('deriveConversationId returns id when present', () => {
  const ctx = makeCtx({ activity: { conversation: { id: 'conv-1' } } as any });
  expect(ScopeUtils.deriveConversationId(ctx)).toBe('conv-1');
});

test('deriveConversationId returns undefined when missing', () => {
  const ctx = makeCtx({ activity: {} as any });
  expect(ScopeUtils.deriveConversationId(ctx)).toBeUndefined();
});

test('deriveSourceMetadataObject maps channel name/description', () => {
  const ctx = makeCtx({ activity: { channelId: 'teams', channelIdSubChannel: 'chat' } as any });
  expect(ScopeUtils.deriveSourceMetadataObject(ctx)).toEqual({ name: 'teams', description: 'chat' });
});

test('deriveSourceMetadataObject returns undefined fields when none', () => {
  const ctx = makeCtx({ activity: {} as any });
  expect(ScopeUtils.deriveSourceMetadataObject(ctx)).toEqual({ name: undefined, description: undefined });
});

test('buildInvokeAgentDetails merges agent (recipient), conversationId, sourceMetadata', () => {
  const invokeAgentDetails: InvokeAgentDetails = {
    agentId: 'provided',
    request: { content: 'hi', executionType: ExecutionType.HumanToAgent, sourceMetadata: { id: 'orig-id' } },
  };
  const ctx = makeCtx({
    activity: {
      recipient: { agenticAppId: 'rec-agent', name: 'Rec', aadObjectId: 'auid', role: 'bot', tenantId: 'tX' },
      conversation: { id: 'c-2' },
      channelId: 'web',
      channelIdSubChannel: 'inbox',
    } as any
  });

  const result = ScopeUtils.buildInvokeAgentDetails(invokeAgentDetails, ctx);
  expect(result.agentId).toBe('rec-agent');
  expect(result.conversationId).toBe('c-2');
  expect(result.request?.sourceMetadata).toEqual({ id: 'orig-id', name: 'web', description: 'inbox' });
});

test('buildInvokeAgentDetails keeps base request when TurnContext has no overrides', () => {
  const invokeAgentDetails: InvokeAgentDetails = {
    agentId: 'base-agent',
    request: { content: 'hi', executionType: ExecutionType.HumanToAgent, sourceMetadata: { description: 'keep', name: 'keep-name' }},
  };
  const ctx = makeCtx({ activity: {} as any });
  const result = ScopeUtils.buildInvokeAgentDetails(invokeAgentDetails, ctx);
  expect(result.agentId).toBe('base-agent');
  expect(result.conversationId).toBeUndefined();
  expect(result.request?.sourceMetadata).toEqual({ description: 'keep', name: 'keep-name' });
});
