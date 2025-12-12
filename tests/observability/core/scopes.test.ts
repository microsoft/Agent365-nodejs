import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

import {
  ExecuteToolScope,
  InvokeAgentScope,
  InferenceScope,
  AgentDetails,
  TenantDetails,
  InvokeAgentDetails,
  ToolCallDetails,
  InferenceDetails,
  InferenceOperationType,
  CallerDetails,
  OpenTelemetryConstants,
  OpenTelemetryScope,
} from '@microsoft/agents-a365-observability';

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
    conversationId: 'test-conv-123'
  };

  const testTenantDetails: TenantDetails = {
    tenantId: 'test-tenant-456'
  };

  describe('InvokeAgentScope', () => {
    it('should create scope with agent details', () => {
      const invokeAgentDetails: InvokeAgentDetails = {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        agentDescription: 'A test agent'
      };
      
      const scope = InvokeAgentScope.start(invokeAgentDetails, testTenantDetails);

      expect(scope).toBeInstanceOf(InvokeAgentScope);
      scope?.dispose();
    });

    it('should create scope with agent ID only', () => {
      const invokeAgentDetails: InvokeAgentDetails = {
        agentId: 'simple-agent'
      };
      
      const scope = InvokeAgentScope.start(invokeAgentDetails, testTenantDetails);

      expect(scope).toBeInstanceOf(InvokeAgentScope);
      scope?.dispose();
    });

    it('should create scope with additional details', () => {
      const invokeAgentDetails: InvokeAgentDetails = {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        agentDescription: 'A test agent',
        conversationId: 'conv-123',
        iconUri: 'https://example.com/icon.png'
      };
      
      const scope = InvokeAgentScope.start(invokeAgentDetails, testTenantDetails);

      expect(scope).toBeInstanceOf(InvokeAgentScope);
      scope?.dispose();
    });

    it('should create scope with platformId', () => {
      const invokeAgentDetails: InvokeAgentDetails = {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        platformId: 'platform-xyz-123'
      };
      
      const scope = InvokeAgentScope.start(invokeAgentDetails, testTenantDetails);

      expect(scope).toBeInstanceOf(InvokeAgentScope);
      scope?.dispose();
    });

    it('should create scope with caller details', () => {
      const invokeAgentDetails: InvokeAgentDetails = {
        agentId: 'test-agent',
        agentName: 'Test Agent'
      };
      
      const callerDetails: CallerDetails = {
        callerId: 'user-123',
        callerName: 'Test User',
        callerUpn: 'test.user@contoso.com',
        tenantId: 'test-tenant'
      };
      
      const scope = InvokeAgentScope.start(invokeAgentDetails, testTenantDetails, undefined, callerDetails);

      expect(scope).toBeInstanceOf(InvokeAgentScope);
      scope?.dispose();
    });

    it('should record response', () => {
      const invokeAgentDetails: InvokeAgentDetails = { agentId: 'test-agent' };
      const scope = InvokeAgentScope.start(invokeAgentDetails, testTenantDetails);

      expect(() => scope?.recordResponse('Test response')).not.toThrow();
      scope?.dispose();
    });

    it('should record input and output messages', () => {
      const invokeAgentDetails: InvokeAgentDetails = { agentId: 'test-agent' };
      const scope = InvokeAgentScope.start(invokeAgentDetails, testTenantDetails);

      expect(() => scope?.recordInputMessages(['Input message 1', 'Input message 2'])).not.toThrow();
      expect(() => scope?.recordOutputMessages(['Output message 1', 'Output message 2'])).not.toThrow();
      scope?.dispose();
    });

    it('should record error', () => {
      const invokeAgentDetails: InvokeAgentDetails = { agentId: 'test-agent' };
      const scope = InvokeAgentScope.start(invokeAgentDetails, testTenantDetails);
      const error = new Error('Test error');

      expect(() => scope?.recordError(error)).not.toThrow();
      scope?.dispose();
    });

    it('should propagate platformId in span attributes', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const invokeAgentDetails: InvokeAgentDetails = {
        agentId: 'test-agent',
        agentName: 'Test Agent',
        platformId: 'test-platform-123'
      };

      const scope = InvokeAgentScope.start(invokeAgentDetails, testTenantDetails);
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
      const invokeAgentDetails: InvokeAgentDetails = {
        agentId: 'test-agent',
        agentName: 'Test Agent'
      };
      const callerAgentDetails: AgentDetails = {
        agentId: 'caller-agent',
        agentName: 'Caller Agent',
        agentDescription: 'desc',
        conversationId: 'conv',
        platformId: 'caller-platform-xyz'
      } as any;

      const scope = InvokeAgentScope.start(invokeAgentDetails, testTenantDetails, callerAgentDetails, undefined);
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
      const invokeAgentDetails: InvokeAgentDetails = {
        agentId: 'test-agent',
        agentName: 'Test Agent'
      };
      const callerDetails: CallerDetails = {
        callerId: 'user-123',
        tenantId: 'test-tenant',
        callerClientIp: '10.0.0.5'
      };
      const callerAgentDetails: AgentDetails = {
        agentId: 'caller-agent',
        agentName: 'Caller Agent',
        agentDescription: 'desc',
        conversationId: 'conv',
        agentClientIP: '192.168.1.100'
      } as any;

      const scope1 = InvokeAgentScope.start(invokeAgentDetails, testTenantDetails, undefined, callerDetails);
      expect(scope1).toBeInstanceOf(InvokeAgentScope);
      const scope2 = InvokeAgentScope.start(invokeAgentDetails, testTenantDetails, callerAgentDetails, undefined);
      expect(scope2).toBeInstanceOf(InvokeAgentScope);

      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_CALLER_CLIENT_IP_KEY, val: '10.0.0.5' }),
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_CALLER_AGENT_CLIENT_IP_KEY, val: '192.168.1.100' })
      ]));

      scope1?.dispose();
      scope2?.dispose();
      spy.mockRestore();
    });
  });

  describe('ExecuteToolScope', () => {
    it('should create scope with tool details', () => {
      const scope = ExecuteToolScope.start({
        toolName: 'test-tool',
        arguments: '{"param": "value"}',
        toolCallId: 'call-123',
        description: 'A test tool',
        toolType: 'test'
      }, testAgentDetails, testTenantDetails);

      expect(scope).toBeInstanceOf(ExecuteToolScope);
      scope?.dispose();
    });

    it('should record response', () => {
      const scope = ExecuteToolScope.start({ toolName: 'test-tool' }, testAgentDetails, testTenantDetails);

      expect(() => scope?.recordResponse('Tool result')).not.toThrow();
      scope?.dispose();
    });
   
    it('should set conversationId when provided', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const scope = (ExecuteToolScope as unknown as any).start({ toolName: 'test-tool' }, testAgentDetails, testTenantDetails, 'conv-tool-123');
      expect(scope).toBeInstanceOf(ExecuteToolScope);

      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, val: 'conv-tool-123' })
      ]));

      scope?.dispose();
      spy.mockRestore();
    });

    it('should set source metadata tags when provided', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const scope = (ExecuteToolScope as unknown as any).start({ toolName: 'test-tool' }, testAgentDetails, testTenantDetails, undefined, { name: 'ChannelTool', description: 'https://channel/tool' });
      expect(scope).toBeInstanceOf(ExecuteToolScope);

      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_NAME_KEY, val: 'ChannelTool' }),
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_DESCRIPTION_KEY, val: 'https://channel/tool' })
      ]));

      scope?.dispose();
      spy.mockRestore();
    });
  });



  describe('InferenceScope', () => {
    it('should create scope with inference details', () => {
      const inferenceDetails: InferenceDetails = {
        operationName: InferenceOperationType.CHAT,
        model: 'gpt-4',
        providerName: 'openai',
        inputTokens: 100,
        outputTokens: 150,
        responseId: 'resp-123',
        finishReasons: ['stop']
      };
      
      const scope = InferenceScope.start(inferenceDetails, testAgentDetails, testTenantDetails);

      expect(scope).toBeInstanceOf(InferenceScope);
      scope?.dispose();
    });

    it('should create scope with minimal details', () => {
      const inferenceDetails: InferenceDetails = {
        operationName: InferenceOperationType.TEXT_COMPLETION,
        model: 'gpt-3.5-turbo'
      };
      
      const scope = InferenceScope.start(inferenceDetails, testAgentDetails, testTenantDetails);

      expect(scope).toBeInstanceOf(InferenceScope);
      scope?.dispose();
    });

    it('should record granular telemetry', () => {
      const inferenceDetails: InferenceDetails = {
        operationName: InferenceOperationType.CHAT,
        model: 'gpt-4'
      };
      
      const scope = InferenceScope.start(inferenceDetails, testAgentDetails, testTenantDetails);

      expect(() => scope?.recordInputMessages(['Input message'])).not.toThrow();
      expect(() => scope?.recordOutputMessages(['Generated response'])).not.toThrow();
      expect(() => scope?.recordInputTokens(50)).not.toThrow();
      expect(() => scope?.recordOutputTokens(100)).not.toThrow();
      expect(() => scope?.recordResponseId('resp-456')).not.toThrow();
      expect(() => scope?.recordFinishReasons(['stop', 'length'])).not.toThrow();
      scope?.dispose();
    });

     it('should set conversationId when provided', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const inferenceDetails: InferenceDetails = {
        operationName: InferenceOperationType.CHAT,
        model: 'gpt-4'
      };

      const scope = (InferenceScope as unknown as any).start(inferenceDetails, testAgentDetails, testTenantDetails, 'conv-inf-123');
      expect(scope).toBeInstanceOf(InferenceScope);

      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, val: 'conv-inf-123' })
      ]));

      scope?.dispose();
      spy.mockRestore();
    });

    it('should set source metadata tags when provided', () => {
      const spy = jest.spyOn(OpenTelemetryScope.prototype as any, 'setTagMaybe');
      const inferenceDetails: InferenceDetails = {
        operationName: InferenceOperationType.CHAT,
        model: 'gpt-4'
      };

      const scope = (InferenceScope as unknown as any).start(inferenceDetails, testAgentDetails, testTenantDetails, undefined, { name: 'ChannelInf', description: 'https://channel/inf' });
      expect(scope).toBeInstanceOf(InferenceScope);

      const calls = spy.mock.calls.map(args => ({ key: args[0], val: args[1] }));
      expect(calls).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_NAME_KEY, val: 'ChannelInf' }),
        expect.objectContaining({ key: OpenTelemetryConstants.GEN_AI_EXECUTION_SOURCE_DESCRIPTION_KEY, val: 'https://channel/inf' })
      ]));

      scope?.dispose();
      spy.mockRestore();
    });
  });

  describe('Dispose pattern', () => {
    it('should support manual dispose', () => {
      const invokeAgentDetails: InvokeAgentDetails = { agentId: 'test-agent' };
      const scope = InvokeAgentScope.start(invokeAgentDetails, testTenantDetails);
      scope?.recordResponse('Manual dispose test');

      expect(() => scope?.dispose()).not.toThrow();
    });

    it('should support automatic disposal pattern', () => {
      const toolDetails: ToolCallDetails = { toolName: 'test-tool' };
      
      expect(() => {
        const scope = ExecuteToolScope.start(toolDetails, testAgentDetails, testTenantDetails);
        try {
          scope?.recordResponse('Automatic disposal test');
        } finally {
          scope?.dispose();
        }
      }).not.toThrow();
    });
  });
});
