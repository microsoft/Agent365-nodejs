// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

// Mock RuntimeUtility.getAgentIdFromToken so tests don't depend on real JWT parsing
jest.mock('@microsoft/agents-a365-runtime', () => {
  const actual = jest.requireActual('@microsoft/agents-a365-runtime');
  return {
    ...actual,
    Utility: {
      ...actual.Utility,
      getAgentIdFromToken: () => 'test-blueprint-id',
    },
  };
});

import { ScopeUtils } from '../../../../packages/agents-a365-observability-hosting/src/utils/ScopeUtils';
import { InferenceScope, InvokeAgentScope, ExecuteToolScope, OpenTelemetryConstants, ExecutionType, OpenTelemetryScope, InvokeAgentDetails } from '@microsoft/agents-a365-observability';
import { SpanKind } from '@opentelemetry/api';
import { RoleTypes } from '@microsoft/agents-activity';
import type { TurnContext } from '@microsoft/agents-hosting';

const testAuthToken = 'mock-auth-token';

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
      conversation: { id: conversationId ?? 'conv-001', tenantId: 'tenant-123' },
      isAgenticRequest: () => true,
      getAgenticInstanceId: () => 'agent-1',
      getAgenticUser: () => 'agent-upn@contoso.com',
      getAgenticTenantId: () => 'tenant-123',
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
    agenticAppBlueprintId: 'agent-blueprint-1',
    name: 'Agent One',
    aadObjectId: 'agent-oid',
    agenticUserId: 'agent-upn@contoso.com',
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
    const scope = ScopeUtils.populateInferenceScopeFromTurnContext(details, ctx, testAuthToken) as InferenceScope;
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
        [OpenTelemetryConstants.GEN_AI_AGENT_BLUEPRINT_ID_KEY, 'test-blueprint-id'],
        [OpenTelemetryConstants.GEN_AI_AGENT_UPN_KEY, 'agent-upn@contoso.com'],
        [OpenTelemetryConstants.GEN_AI_AGENT_DESCRIPTION_KEY, 'assistant'],
        [OpenTelemetryConstants.TENANT_ID_KEY, 'tenant-123'],
        [OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY, JSON.stringify(['input text'])]
      ])
    );
    scope?.dispose();
  });

    // Error path coverage for missing required fields in populate* helpers
    describe('error conditions', () => {
      test('populateInferenceScopeFromTurnContext throws when agent details are missing', () => {
        const details: any = { operationName: 'inference', model: 'm', providerName: 'prov' };
        const ctx = makeCtx({ activity: { /* no recipient */ getAgenticTenantId: () => 't1' } as any });
        expect(() => ScopeUtils.populateInferenceScopeFromTurnContext(details, ctx, testAuthToken))
          .toThrow('populateInferenceScopeFromTurnContext: Missing agent details on TurnContext (recipient)');
      });

      test('populateInferenceScopeFromTurnContext throws when tenant details are missing', () => {
        const details: any = { operationName: 'inference', model: 'm', providerName: 'prov' };
        const ctx = makeCtx({ activity: { recipient: { agenticAppId: 'aid' }, isAgenticRequest: () => false, getAgenticInstanceId: () => 'aid', getAgenticUser: () => undefined, getAgenticTenantId: () => undefined } as any }); // agent ok, no tenantId
        expect(() => ScopeUtils.populateInferenceScopeFromTurnContext(details, ctx, testAuthToken))
          .toThrow('populateInferenceScopeFromTurnContext: Missing tenant details on TurnContext (recipient)');
      });

      test('populateExecuteToolScopeFromTurnContext throws when agent details are missing', () => {
        const details: any = { toolName: 'tool' };
        const ctx = makeCtx({ activity: { /* no recipient */ getAgenticTenantId: () => 't1' } as any });
        expect(() => ScopeUtils.populateExecuteToolScopeFromTurnContext(details, ctx, testAuthToken))
          .toThrow('populateExecuteToolScopeFromTurnContext: Missing agent details on TurnContext (recipient)');
      });

      test('populateExecuteToolScopeFromTurnContext throws when tenant details are missing', () => {
        const details: any = { toolName: 'tool' };
        const ctx = makeCtx({ activity: { recipient: { agenticAppId: 'aid' }, isAgenticRequest: () => false, getAgenticInstanceId: () => 'aid', getAgenticUser: () => undefined, getAgenticTenantId: () => undefined } as any }); // agent ok, no tenantId
        expect(() => ScopeUtils.populateExecuteToolScopeFromTurnContext(details, ctx, testAuthToken))
          .toThrow('populateExecuteToolScopeFromTurnContext: Missing tenant details on TurnContext (recipient)');
      });

      test('populateInvokeAgentScopeFromTurnContext throws when tenant details are missing', () => {
        const details: InvokeAgentDetails = { agentId: 'aid' } as any;
        const ctx = makeCtx({ activity: { recipient: { agenticAppId: 'aid' }, isAgenticRequest: () => false, getAgenticInstanceId: () => 'aid', getAgenticUser: () => undefined, getAgenticTenantId: () => undefined } as any }); // no tenantId
        expect(() => ScopeUtils.populateInvokeAgentScopeFromTurnContext(details, ctx, testAuthToken))
          .toThrow('populateInvokeAgentScopeFromTurnContext: Missing tenant details on TurnContext (recipient)');
      });
    });

  test('build InvokeAgentScope based on turn context', () => {
    const details = { operationName: 'invoke', model: 'n/a', providerName: 'internal' } as any;
    const ctx = makeTurnContext('invoke message', 'teams', 'https://teams', 'conv-B');
    ctx.activity.from!.role = RoleTypes.AgenticUser;
    const scope = ScopeUtils.populateInvokeAgentScopeFromTurnContext(details, ctx, testAuthToken) as InvokeAgentScope;
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
        [OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY, JSON.stringify(['invoke message'])],
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
    const scope = ScopeUtils.populateExecuteToolScopeFromTurnContext(details, ctx, testAuthToken) as ExecuteToolScope;
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

test('deriveTenantDetails returns tenantId from getAgenticTenantId()', () => {
  const ctx = makeCtx({ activity: { getAgenticTenantId: () => 't-rec' } as any });
  expect(ScopeUtils.deriveTenantDetails(ctx)).toEqual({ tenantId: 't-rec' });
});

test('deriveTenantDetails returns undefined when getAgenticTenantId() returns undefined', () => {
  const ctx = makeCtx({ activity: { getAgenticTenantId: () => undefined } as any });
  expect(ScopeUtils.deriveTenantDetails(ctx)).toBeUndefined();
});

test('deriveAgentDetails maps recipient fields to AgentDetails', () => {
  const ctx = makeCtx({ activity: { recipient: { name: 'A', aadObjectId: 'auid', role: 'bot' }, isAgenticRequest: () => false, getAgenticInstanceId: () => 'aid', getAgenticUser: () => 'upn1', getAgenticTenantId: () => 't1' } as any });
  expect(ScopeUtils.deriveAgentDetails(ctx, testAuthToken)).toEqual({
    agentId: undefined,
    agentName: 'A',
    agentAUID: 'auid',
    agentBlueprintId: undefined,
    agentUPN: 'upn1',
    agentDescription: 'bot',
    tenantId: 't1',
  });
});

test('deriveAgentDetails returns undefined without recipient', () => {
  const ctx = makeCtx({ activity: {} as any });
  expect(ScopeUtils.deriveAgentDetails(ctx, testAuthToken)).toBeUndefined();
});

test('deriveCallerAgent maps from fields to caller AgentDetails', () => {
  const ctx = makeCtx({ activity: { from: { agenticAppBlueprintId: 'bp', name: 'Caller', aadObjectId: 'uid', agenticUserId: 'caller-upn', role: 'agent', tenantId: 't2', agenticAppId: 'agent-caller' } } as any });
  expect(ScopeUtils.deriveCallerAgent(ctx)).toEqual({
    agentBlueprintId: 'bp',
    agentName: 'Caller',
    agentAUID: 'uid',
    agentUPN: 'caller-upn',
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
      recipient: { name: 'Rec', role: 'bot' },
      conversation: { id: 'c-2' },
      channelId: 'web',
      channelIdSubChannel: 'inbox',
      isAgenticRequest: () => false,
      getAgenticInstanceId: () => 'rec-agent',
      getAgenticUser: () => undefined,
      getAgenticTenantId: () => 'tX',
    } as any
  });

  const result = ScopeUtils.buildInvokeAgentDetails(invokeAgentDetails, ctx, testAuthToken);
  expect(result.agentId).toBeUndefined();
  expect(result.conversationId).toBe('c-2');
  expect(result.request?.sourceMetadata).toEqual({ id: 'orig-id', name: 'web', description: 'inbox' });
});

test('buildInvokeAgentDetails keeps base request when TurnContext has no overrides', () => {
  const invokeAgentDetails: InvokeAgentDetails = {
    agentId: 'base-agent',
    request: { content: 'hi', executionType: ExecutionType.HumanToAgent, sourceMetadata: { description: 'keep', name: 'keep-name' }},
  };
  const ctx = makeCtx({ activity: {} as any });
  const result = ScopeUtils.buildInvokeAgentDetails(invokeAgentDetails, ctx, testAuthToken);
  expect(result.agentId).toBe('base-agent');
  expect(result.conversationId).toBeUndefined();
  expect(result.request?.sourceMetadata).toEqual({ description: 'keep', name: 'keep-name' });
});

describe('ScopeUtils spanKind forwarding', () => {
  test('populateInvokeAgentScopeFromTurnContext forwards SpanKind.SERVER', () => {
    const spy = jest.spyOn(InvokeAgentScope, 'start');
    const ctx = makeTurnContext('hello', 'web', 'https://web', 'conv-span');
    const scope = ScopeUtils.populateInvokeAgentScopeFromTurnContext(
      { agentId: 'test-agent' }, ctx, testAuthToken,
      undefined, undefined, SpanKind.SERVER
    );
    expect(spy).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.anything(),
      undefined, undefined, undefined, SpanKind.SERVER
    );
    scope?.dispose();
    spy.mockRestore();
  });

  test('populateExecuteToolScopeFromTurnContext forwards SpanKind.CLIENT', () => {
    const spy = jest.spyOn(ExecuteToolScope, 'start');
    const ctx = makeTurnContext(undefined, 'cli', 'https://cli', 'conv-span');
    const scope = ScopeUtils.populateExecuteToolScopeFromTurnContext(
      { toolName: 'search' }, ctx, testAuthToken,
      undefined, undefined, SpanKind.CLIENT
    );
    expect(spy).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.anything(), expect.anything(),
      expect.anything(), undefined, undefined, undefined, SpanKind.CLIENT
    );
    scope?.dispose();
    spy.mockRestore();
  });
});
