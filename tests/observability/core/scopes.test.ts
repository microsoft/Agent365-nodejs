// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import { trace, SpanKind } from '@opentelemetry/api';

import {
  ExecuteToolScope,
  InvokeAgentScope,
  InferenceScope,
  AgentDetails,
  InvokeAgentScopeDetails,
  ToolCallDetails,
  InferenceDetails,
  InferenceOperationType,
  UserDetails,
  OpenTelemetryConstants,
  OpenTelemetryScope,
} from '@microsoft/agents-a365-observability';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace-base';

// Mock console to avoid cluttering test output
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
beforeAll(() => {
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});

describe('Scopes', () => {
  const testAgentDetails: AgentDetails = {
    agentId: 'test-agent',
    agentName: 'Test Agent',
    agentDescription: 'A test agent',
    tenantId: 'test-tenant-456'
  };

  const testRequest = { conversationId: 'test-conv-req', channel: { name: 'TestChannel', description: 'https://test.channel' } };

  describe('InvokeAgentScope', () => {
    it('should create scope with agent details', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');

      const scope = InvokeAgentScope.start(
        { conversationId: 'conv-req-1', channel: { name: 'Teams', description: 'https://teams.link' } },
        {},
        {
          agentId: 'test-agent',
          agentName: 'Test Agent',
          agentDescription: 'A test agent',
          tenantId: 'test-tenant-456'
        }
      );

      expect(scope).toBeInstanceOf(InvokeAgentScope);
      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, val: 'conv-req-1' }),
        expect.objectContaining({ key: OpenTelemetryConstants.CHANNEL_NAME_KEY, val: 'Teams' }),
        expect.objectContaining({ key: OpenTelemetryConstants.CHANNEL_LINK_KEY, val: 'https://teams.link' })
      ]));
      scope?.dispose();
      spy.mockRestore();
    });

    it('should create scope with agent ID only', () => {
      const scope = InvokeAgentScope.start(testRequest, {}, { agentId: 'simple-agent', tenantId: 'test-tenant-456' });

      expect(scope).toBeInstanceOf(InvokeAgentScope);
      scope?.dispose();
    });

    it('should create scope with additional details', () => {
      const scope = InvokeAgentScope.start(testRequest, {}, {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        agentDescription: 'A test agent',
        conversationId: 'conv-123',
        iconUri: 'https://example.com/icon.png',
        tenantId: 'test-tenant-456'
      });

      expect(scope).toBeInstanceOf(InvokeAgentScope);
      scope?.dispose();
    });

    it('should create scope with platformId', () => {
      const scope = InvokeAgentScope.start(testRequest, {}, {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        platformId: 'platform-xyz-123',
        tenantId: 'test-tenant-456'
      });

      expect(scope).toBeInstanceOf(InvokeAgentScope);
      scope?.dispose();
    });

    it('should create scope with caller details', () => {
      const callerDetails: UserDetails = {
        userId: 'user-123',
        userName: 'Test User',
        userEmail: 'test.user@contoso.com',
        tenantId: 'test-tenant'
      };

      const scope = InvokeAgentScope.start(testRequest, {}, {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        tenantId: 'test-tenant-456'
      }, { userDetails: callerDetails });

      expect(scope).toBeInstanceOf(InvokeAgentScope);
      scope?.dispose();
    });

    it('should set sessionId from request', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const scope = InvokeAgentScope.start(
        { conversationId: 'conv-1', sessionId: 'session-abc-123' },
        {},
        { agentId: 'test-agent', tenantId: 'test-tenant-456' }
      );
      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.SESSION_ID_KEY, val: 'session-abc-123' })
      ]));
      scope?.dispose();
      spy.mockRestore();
    });

    it('should record response', () => {
      const scope = InvokeAgentScope.start(testRequest, {}, { agentId: 'test-agent', tenantId: 'test-tenant-456' });

      expect(() => scope?.recordResponse('Test response')).not.toThrow();
      scope?.dispose();
    });

    it('should record input and output messages', () => {
      const scope = InvokeAgentScope.start(testRequest, {}, { agentId: 'test-agent', tenantId: 'test-tenant-456' });

      expect(() => scope?.recordInputMessages(['Input message 1', 'Input message 2'])).not.toThrow();
      expect(() => scope?.recordOutputMessages(['Output message 1', 'Output message 2'])).not.toThrow();
      scope?.dispose();
    });

    it('should record error', () => {
      const scope = InvokeAgentScope.start(testRequest, {}, { agentId: 'test-agent', tenantId: 'test-tenant-456' });
      const error = new Error('Test error');

      expect(() => scope?.recordError(error)).not.toThrow();
      scope?.dispose();
    });

    it('should set conversationId from request', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const scope = InvokeAgentScope.start(
        { conversationId: 'explicit-conv-id' },
        {},
        { agentId: 'test-agent', tenantId: 'test-tenant-456' }
      );
      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, val: 'explicit-conv-id' })
      ]));
      scope?.dispose();
      spy.mockRestore();
    });

    it('should set channel tags from request.channel', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const scope = InvokeAgentScope.start(
        { channel: { name: 'Teams', description: 'https://teams.link' } },
        {},
        { agentId: 'test-agent', tenantId: 'test-tenant-456' }
      );
      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.CHANNEL_NAME_KEY, val: 'Teams' }),
        expect.objectContaining({ key: OpenTelemetryConstants.CHANNEL_LINK_KEY, val: 'https://teams.link' })
      ]));
      scope?.dispose();
      spy.mockRestore();
    });

    it('should propagate platformId in span attributes', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');

      const scope = InvokeAgentScope.start(testRequest, {}, {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        platformId: 'test-platform-123',
        tenantId: 'test-tenant-456'
      });
      expect(scope).toBeInstanceOf(InvokeAgentScope);

      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_AGENT_PLATFORM_ID_KEY, val: 'test-platform-123' })
      ]));

      scope?.dispose();
      spy.mockRestore();
    });

    it('should propagate caller agent platformId in span attributes', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const callerAgentDetails: AgentDetails = {
        agentId: 'caller-agent',
        agentName: 'Caller Agent',
        agentDescription: 'desc',
        platformId: 'caller-platform-xyz'
      } as any;

      const scope = InvokeAgentScope.start(testRequest, {}, {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        tenantId: 'test-tenant-456'
      }, { callerAgentDetails });
      expect(scope).toBeInstanceOf(InvokeAgentScope);

      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_CALLER_AGENT_PLATFORM_ID_KEY, val: 'caller-platform-xyz' })
      ]));

      scope?.dispose();
      spy.mockRestore();
    });

    it('should set caller and caller-agent IP tags', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const agentDets = {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        tenantId: 'test-tenant-456'
      };
      const callerDetails: UserDetails = {
        userId: 'user-123',
        tenantId: 'test-tenant',
        callerClientIp: '10.0.0.5'
      };
      const callerAgentDetails: AgentDetails = {
        agentId: 'caller-agent',
        agentName: 'Caller Agent',
        agentDescription: 'desc',
        agentClientIP: '192.168.1.100'
      } as any;

      const scope1 = InvokeAgentScope.start(testRequest, {}, agentDets, { userDetails: callerDetails });
      expect(scope1).toBeInstanceOf(InvokeAgentScope);
      const scope2 = InvokeAgentScope.start(testRequest, {}, agentDets, { callerAgentDetails });
      expect(scope2).toBeInstanceOf(InvokeAgentScope);

      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_CALLER_CLIENT_IP_KEY, val: '10.0.0.5' }),
      ]));

      scope1?.dispose();
      scope2?.dispose();
      spy.mockRestore();
    });

    it('should throw when agentDetails is null', () => {
      expect(() => InvokeAgentScope.start(testRequest, {}, null as any)).toThrow('InvokeAgentScope: agentDetails is required');
    });

    it('should throw when agentDetails.tenantId is missing', () => {
      expect(() => InvokeAgentScope.start(testRequest, {}, { agentId: 'a' } as any)).toThrow('InvokeAgentScope: tenantId is required on agentDetails');
    });

    it('should set both userDetails and callerAgentDetails tags when both are provided', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const scope = InvokeAgentScope.start(testRequest, {}, {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        tenantId: 'test-tenant-456'
      }, {
        userDetails: { callerId: 'user-1', callerName: 'User One' },
        callerAgentDetails: { agentId: 'caller-agent-1', agentName: 'Caller Agent' } as any
      });

      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_CALLER_ID_KEY, val: 'user-1' }),
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_CALLER_NAME_KEY, val: 'User One' }),
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_CALLER_AGENT_ID_KEY, val: 'caller-agent-1' }),
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_CALLER_AGENT_NAME_KEY, val: 'Caller Agent' }),
      ]));

      scope?.dispose();
      spy.mockRestore();
    });

    it('should set endpoint tags from typed InvokeAgentScopeDetails', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const details: InvokeAgentScopeDetails = { endpoint: { host: 'agent-api.contoso.com', port: 8443 } };
      const scope = InvokeAgentScope.start(testRequest, details, { agentId: 'typed-agent', tenantId: 'test-tenant-456' });
      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.SERVER_ADDRESS_KEY, val: 'agent-api.contoso.com' }),
        expect.objectContaining({ key: OpenTelemetryConstants.SERVER_PORT_KEY, val: 8443 })
      ]));
      scope?.dispose();
      spy.mockRestore();
    });

    it('should omit endpoint tags when InvokeAgentScopeDetails is empty', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const scope = InvokeAgentScope.start(testRequest, {}, { agentId: 'test-agent', tenantId: 'test-tenant-456' });
      const keys = new Set(spy.mock.calls.map(args => args[0]));
      expect(keys).not.toContain(OpenTelemetryConstants.SERVER_ADDRESS_KEY);
      expect(keys).not.toContain(OpenTelemetryConstants.SERVER_PORT_KEY);
      scope?.dispose();
      spy.mockRestore();
    });
  });

  describe('ExecuteToolScope', () => {
    it('should create scope with tool details', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const callerDetails: UserDetails = {
        userId: 'caller-tool-1',
        userEmail: 'tool.user@contoso.com',
        userName: 'Tool User',
        tenantId: 'tool-tenant',
        callerClientIp: '10.0.0.10'
      };
      const scope = ExecuteToolScope.start(testRequest, {
        toolName: 'test-tool',
        arguments: '{"param": "value"}',
        toolCallId: 'call-123',
        description: 'A test tool',
        toolType: 'test'
      }, testAgentDetails, callerDetails);

      expect(scope).toBeInstanceOf(ExecuteToolScope);
      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.USER_ID_KEY, val: 'caller-tool-1' }),
        expect.objectContaining({ key: OpenTelemetryConstants.USER_NAME_KEY, val: 'Tool User' }),
        expect.objectContaining({ key: OpenTelemetryConstants.USER_EMAIL_KEY, val: 'tool.user@contoso.com' }),
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_CALLER_CLIENT_IP_KEY, val: '10.0.0.10' })
      ]));
      // Validate raw attribute key strings for schema correctness
      const keySet = new Set(calls.map(c => c.key));
      expect(keySet).toContain('user.id');
      expect(keySet).toContain('user.name');
      expect(keySet).toContain('user.email');
      expect(keySet).toContain('client.address');
      scope?.dispose();
      spy.mockRestore();
    });

    it('should record response', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const scope = ExecuteToolScope.start(
        { conversationId: 'conv-tool-resp', channel: { name: 'Web', description: 'https://web.link' } },
        { toolName: 'test-tool' }, testAgentDetails
      );

      expect(() => scope?.recordResponse('Tool result')).not.toThrow();
      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, val: 'conv-tool-resp' }),
        expect.objectContaining({ key: OpenTelemetryConstants.CHANNEL_NAME_KEY, val: 'Web' }),
        expect.objectContaining({ key: OpenTelemetryConstants.CHANNEL_LINK_KEY, val: 'https://web.link' })
      ]));
      scope?.dispose();
      spy.mockRestore();
    });

    it('should set conversationId and channel tags when provided', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const scope = ExecuteToolScope.start(
        { conversationId: 'conv-tool-123', channel: { name: 'ChannelTool', description: 'https://channel/tool' } },
        { toolName: 'test-tool' }, testAgentDetails
      );
      expect(scope).toBeInstanceOf(ExecuteToolScope);

      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, val: 'conv-tool-123' }),
        expect.objectContaining({ key: OpenTelemetryConstants.CHANNEL_NAME_KEY, val: 'ChannelTool' }),
        expect.objectContaining({ key: OpenTelemetryConstants.CHANNEL_LINK_KEY, val: 'https://channel/tool' })
      ]));

      scope?.dispose();
      spy.mockRestore();
    });
  });

  describe('endpoint.port serialization', () => {
    it('should record non-443 port as a number on ExecuteToolScope', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const scope = ExecuteToolScope.start(
        testRequest, { toolName: 'test-tool', endpoint: { host: 'tools.example.com', port: 8080 } },
        testAgentDetails
      );
      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.SERVER_PORT_KEY, val: 8080 })
      ]));
      scope?.dispose();
      spy.mockRestore();
    });

    it('should omit port 443 on ExecuteToolScope', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const scope = ExecuteToolScope.start(
        testRequest, { toolName: 'test-tool', endpoint: { host: 'tools.example.com', port: 443 } },
        testAgentDetails
      );
      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.SERVER_PORT_KEY })
      ]));
      scope?.dispose();
      spy.mockRestore();
    });

    it('should record non-443 port as a number on InferenceScope', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const scope = InferenceScope.start(
        testRequest, { operationName: InferenceOperationType.CHAT, model: 'gpt-4', endpoint: { host: 'api.openai.com', port: 8443 } },
        testAgentDetails
      );
      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.SERVER_PORT_KEY, val: 8443 })
      ]));
      scope?.dispose();
      spy.mockRestore();
    });

    it('should omit port 443 on InferenceScope', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const scope = InferenceScope.start(
        testRequest, { operationName: InferenceOperationType.CHAT, model: 'gpt-4', endpoint: { host: 'api.openai.com', port: 443 } },
        testAgentDetails
      );
      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.SERVER_PORT_KEY })
      ]));
      scope?.dispose();
      spy.mockRestore();
    });

    it('should record non-443 port as a number on InvokeAgentScope', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const scope = InvokeAgentScope.start(
        testRequest,
        { endpoint: { host: 'agent.example.com', port: 9090 } },
        { agentId: 'test-agent', tenantId: 'test-tenant-456' }
      );
      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.SERVER_ADDRESS_KEY, val: 'agent.example.com' }),
        expect.objectContaining({ key: OpenTelemetryConstants.SERVER_PORT_KEY, val: 9090 })
      ]));
      scope?.dispose();
      spy.mockRestore();
    });

    it('should omit port 443 on InvokeAgentScope', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const scope = InvokeAgentScope.start(
        testRequest,
        { endpoint: { host: 'agent.example.com', port: 443 } },
        { agentId: 'test-agent', tenantId: 'test-tenant-456' }
      );
      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.SERVER_PORT_KEY })
      ]));
      scope?.dispose();
      spy.mockRestore();
    });
  });

  describe('InferenceScope', () => {
    it('should create scope with inference details', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const callerDetails: UserDetails = {
        userId: 'caller-inf-1',
        userEmail: 'inf.user@contoso.com',
        userName: 'Inf User',
        tenantId: 'inf-tenant',
        callerClientIp: '10.0.0.20'
      };
      const inferenceDetails: InferenceDetails = {
        operationName: InferenceOperationType.CHAT,
        model: 'gpt-4',
        providerName: 'openai',
        inputTokens: 100,
        outputTokens: 150,
        finishReasons: ['stop']
      };

      const scope = InferenceScope.start(testRequest, inferenceDetails, testAgentDetails, callerDetails);

      expect(scope).toBeInstanceOf(InferenceScope);
      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.USER_ID_KEY, val: 'caller-inf-1' }),
        expect.objectContaining({ key: OpenTelemetryConstants.USER_NAME_KEY, val: 'Inf User' }),
        expect.objectContaining({ key: OpenTelemetryConstants.USER_EMAIL_KEY, val: 'inf.user@contoso.com' }),
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_CALLER_CLIENT_IP_KEY, val: '10.0.0.20' })
      ]));
      // Validate raw attribute key strings for schema correctness
      const keySet = new Set(calls.map(c => c.key));
      expect(keySet).toContain('user.id');
      expect(keySet).toContain('user.name');
      expect(keySet).toContain('user.email');
      expect(keySet).toContain('client.address');
      scope?.dispose();
      spy.mockRestore();
    });

    it('should create scope with minimal details', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const inferenceDetails: InferenceDetails = {
        operationName: InferenceOperationType.TEXT_COMPLETION,
        model: 'gpt-3.5-turbo'
      };

      const scope = InferenceScope.start(
        { conversationId: 'conv-inf-min', channel: { name: 'Slack', description: 'https://slack.link' } },
        inferenceDetails, testAgentDetails
      );

      expect(scope).toBeInstanceOf(InferenceScope);
      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, val: 'conv-inf-min' }),
        expect.objectContaining({ key: OpenTelemetryConstants.CHANNEL_NAME_KEY, val: 'Slack' }),
        expect.objectContaining({ key: OpenTelemetryConstants.CHANNEL_LINK_KEY, val: 'https://slack.link' })
      ]));
      scope?.dispose();
      spy.mockRestore();
    });

    it('should record granular telemetry', () => {
      const inferenceDetails: InferenceDetails = {
        operationName: InferenceOperationType.CHAT,
        model: 'gpt-4'
      };

      const scope = InferenceScope.start(testRequest, inferenceDetails, testAgentDetails);

      expect(() => scope?.recordInputMessages(['Input message'])).not.toThrow();
      expect(() => scope?.recordOutputMessages(['Generated response'])).not.toThrow();
      expect(() => scope?.recordInputTokens(50)).not.toThrow();
      expect(() => scope?.recordOutputTokens(100)).not.toThrow();
      expect(() => scope?.recordFinishReasons(['stop', 'length'])).not.toThrow();
      scope?.dispose();
    });

     it('should set conversationId and channel tags when provided', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const inferenceDetails: InferenceDetails = {
        operationName: InferenceOperationType.CHAT,
        model: 'gpt-4'
      };

      const scope = InferenceScope.start(
        { conversationId: 'conv-inf-123', channel: { name: 'ChannelInf', description: 'https://channel/inf' } },
        inferenceDetails, testAgentDetails
      );
      expect(scope).toBeInstanceOf(InferenceScope);

      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, val: 'conv-inf-123' }),
        expect.objectContaining({ key: OpenTelemetryConstants.CHANNEL_NAME_KEY, val: 'ChannelInf' }),
        expect.objectContaining({ key: OpenTelemetryConstants.CHANNEL_LINK_KEY, val: 'https://channel/inf' })
      ]));

      scope?.dispose();
      spy.mockRestore();
    });
  });

  describe('Dispose pattern', () => {
    it('should support manual dispose', () => {
      const scope = InvokeAgentScope.start(testRequest, {}, { agentId: 'test-agent', tenantId: 'test-tenant-456' });
      scope?.recordResponse('Manual dispose test');

      expect(() => scope?.dispose()).not.toThrow();
    });

    it('should support automatic disposal pattern', () => {
      const toolDetails: ToolCallDetails = { toolName: 'test-tool' };

      expect(() => {
        const scope = ExecuteToolScope.start(testRequest, toolDetails, testAgentDetails);
        try {
          scope?.recordResponse('Automatic disposal test');
        } finally {
          scope?.dispose();
        }
      }).not.toThrow();
    });
  });

  describe('Custom start and end time', () => {
    let exporter: InMemorySpanExporter;
    let provider: BasicTracerProvider | undefined;

    beforeAll(() => {
      exporter = new InMemorySpanExporter();
      const processor = new SimpleSpanProcessor(exporter);

      // OTel API only allows setting the global tracer provider once per process.
      // Reuse the existing provider when possible so other test files are not affected.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const globalProvider: any = trace.getTracerProvider();
      if (globalProvider && typeof globalProvider.addSpanProcessor === 'function') {
        globalProvider.addSpanProcessor(processor);
      } else {
        provider = new BasicTracerProvider({
          spanProcessors: [processor],
        });
        trace.setGlobalTracerProvider(provider);
      }
    });

    afterEach(() => {
      exporter.reset();
    });

    afterAll(async () => {
      exporter.reset();
      await provider?.shutdown?.();
    });

    /** Extract the last finished span from the in-memory exporter. */
    const getFinishedSpan = (): ReadableSpan => {
      const spans = exporter.getFinishedSpans();
      expect(spans.length).toBeGreaterThanOrEqual(1);
      return spans[spans.length - 1];
    };

    /** Convert an hrtime tuple to milliseconds. */
    const hrtimeToMs = (hr: [number, number]): number => hr[0] * 1000 + hr[1] / 1_000_000;

    it('should record constructor-provided start and end times on the span', () => {
      const customStart = 1700000000000; // 2023-11-14T22:13:20Z
      const customEnd   = 1700000005000; // 5 seconds later

      const scope = ExecuteToolScope.start(
        testRequest, { toolName: 'my-tool' }, testAgentDetails,
        undefined, { startTime: customStart, endTime: customEnd }
      );
      scope.dispose();

      const span = getFinishedSpan();
      expect(hrtimeToMs(span.startTime as [number, number])).toBeCloseTo(customStart, -1);
      expect(hrtimeToMs(span.endTime as [number, number])).toBeCloseTo(customEnd, -1);
    });

    it('setEndTime should override end time when called before dispose', () => {
      const customStart = 1700000040000;
      const laterEnd    = 1700000048000; // 8 seconds later

      const scope = ExecuteToolScope.start(
        testRequest, { toolName: 'my-tool' }, testAgentDetails,
        undefined, { startTime: customStart }
      );
      scope.setEndTime(laterEnd);
      scope.dispose();

      const span = getFinishedSpan();
      expect(hrtimeToMs(span.startTime as [number, number])).toBeCloseTo(customStart, -1);
      expect(hrtimeToMs(span.endTime as [number, number])).toBeCloseTo(laterEnd, -1);
    });

    it('should support Date objects as start and end times', () => {
      const customStart = new Date('2023-11-14T22:13:20.000Z');
      const customEnd   = new Date('2023-11-14T22:13:25.000Z'); // 5 seconds later

      const scope = ExecuteToolScope.start(
        testRequest, { toolName: 'my-tool' }, testAgentDetails,
        undefined, { startTime: customStart, endTime: customEnd }
      );
      scope.dispose();

      const span = getFinishedSpan();
      expect(hrtimeToMs(span.startTime as [number, number])).toBeCloseTo(customStart.getTime(), -1);
      expect(hrtimeToMs(span.endTime as [number, number])).toBeCloseTo(customEnd.getTime(), -1);
    });

    it('should support HrTime tuples as start and end times', () => {
      // HrTime: [seconds, nanoseconds]
      const customStart: [number, number] = [1700000000, 0];           // 2023-11-14T22:13:20Z
      const customEnd: [number, number]   = [1700000005, 500000000];   // 5.5 seconds later

      const scope = ExecuteToolScope.start(
        testRequest, { toolName: 'my-tool' }, testAgentDetails,
        undefined, { startTime: customStart, endTime: customEnd }
      );
      scope.dispose();

      const span = getFinishedSpan();
      expect(hrtimeToMs(span.startTime as [number, number])).toBeCloseTo(1700000000000, -1);
      expect(hrtimeToMs(span.endTime as [number, number])).toBeCloseTo(1700000005500, -1);
    });

    it('should use wall-clock time when no custom times are provided', () => {
      const before = Date.now();
      const scope = ExecuteToolScope.start(testRequest, { toolName: 'my-tool' }, testAgentDetails);
      scope.dispose();
      const after = Date.now();

      const span = getFinishedSpan();
      const spanStartMs = hrtimeToMs(span.startTime as [number, number]);
      const spanEndMs = hrtimeToMs(span.endTime as [number, number]);

      expect(spanStartMs).toBeGreaterThanOrEqual(before - 1);
      expect(spanEndMs).toBeLessThanOrEqual(after + 1);
    });

    it.each([
      ['CLIENT (default)', undefined, SpanKind.CLIENT],
      ['SERVER', SpanKind.SERVER, SpanKind.SERVER],
    ])('InvokeAgentScope spanKind: %s', (_label, input, expected) => {
      const scope = InvokeAgentScope.start(
        testRequest,
        {},
        { agentId: 'test-agent', tenantId: 'test-tenant-456' },
        undefined,
        input !== undefined ? { spanKind: input } : undefined
      );
      scope.dispose();
      expect(getFinishedSpan().kind).toBe(expected);
    });

    it.each([
      ['INTERNAL (default)', undefined, SpanKind.INTERNAL],
      ['CLIENT', SpanKind.CLIENT, SpanKind.CLIENT],
    ])('ExecuteToolScope spanKind: %s', (_label, input, expected) => {
      const scope = ExecuteToolScope.start(
        testRequest, { toolName: 'my-tool' }, testAgentDetails,
        undefined, input !== undefined ? { spanKind: input } : undefined
      );
      scope.dispose();
      expect(getFinishedSpan().kind).toBe(expected);
    });

    it('recordCancellation should set error status and error.type attribute with default reason', () => {
      const scope = ExecuteToolScope.start(
        testRequest, { toolName: 'my-tool' }, testAgentDetails
      );
      scope.recordCancellation();
      scope.dispose();

      const span = getFinishedSpan();
      expect(span.status.code).toBe(2); // SpanStatusCode.ERROR
      expect(span.status.message).toBe('Task was cancelled');
      expect(span.attributes[OpenTelemetryConstants.ERROR_TYPE_KEY]).toBe('TaskCanceledException');
    });

    it('recordCancellation should use custom reason', () => {
      const scope = ExecuteToolScope.start(
        testRequest, { toolName: 'my-tool' }, testAgentDetails
      );
      scope.recordCancellation('User aborted');
      scope.dispose();

      const span = getFinishedSpan();
      expect(span.status.code).toBe(2); // SpanStatusCode.ERROR
      expect(span.status.message).toBe('User aborted');
      expect(span.attributes[OpenTelemetryConstants.ERROR_TYPE_KEY]).toBe('TaskCanceledException');
    });
  });
});

// Validate attribute key constant values use the new schema namespace.
describe('Attribute key schema values', () => {
  it('caller keys use user.* / client.* namespace', () => {
    expect(OpenTelemetryConstants.USER_ID_KEY).toBe('user.id');
    expect(OpenTelemetryConstants.USER_NAME_KEY).toBe('user.name');
    expect(OpenTelemetryConstants.USER_EMAIL_KEY).toBe('user.email');
    expect(OpenTelemetryConstants.GEN_AI_CALLER_CLIENT_IP_KEY).toBe('client.address');
  });

  it('agent baggage keys use microsoft.agent.* namespace', () => {
    expect(OpenTelemetryConstants.GEN_AI_AGENT_EMAIL_KEY).toBe('microsoft.agent.user.email');
    expect(OpenTelemetryConstants.GEN_AI_AGENT_AUID_KEY).toBe('microsoft.agent.user.id');
  });

  it('caller agent keys use microsoft.a365.* namespace', () => {
    expect(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_ID_KEY).toBe('microsoft.a365.caller.agent.id');
    expect(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_NAME_KEY).toBe('microsoft.a365.caller.agent.name');
    expect(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_APPLICATION_ID_KEY).toBe('microsoft.a365.caller.agent.blueprint.id');
    expect(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_EMAIL_KEY).toBe('microsoft.a365.caller.agent.user.email');
  });

  it('channel keys use microsoft.channel.* namespace', () => {
    expect(OpenTelemetryConstants.CHANNEL_NAME_KEY).toBe('microsoft.channel.name');
    expect(OpenTelemetryConstants.CHANNEL_LINK_KEY).toBe('microsoft.channel.link');
  });

  it('session and tenant keys use microsoft.* namespace', () => {
    expect(OpenTelemetryConstants.SESSION_ID_KEY).toBe('microsoft.session.id');
    expect(OpenTelemetryConstants.SESSION_DESCRIPTION_KEY).toBe('microsoft.session.description');
    expect(OpenTelemetryConstants.TENANT_ID_KEY).toBe('microsoft.tenant.id');
  });
});
