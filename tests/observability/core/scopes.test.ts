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
