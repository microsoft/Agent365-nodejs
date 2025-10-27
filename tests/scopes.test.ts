import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

import {
  ExecuteToolScope,
  InvokeAgentScope,
  InferenceScope,
  ExecutionType,
  InvocationRole,
  AgentDetails,
  TenantDetails
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
      const scope = InvokeAgentScope.start({
        agentId: 'test-agent',
        agentName: 'Test Agent',
        agentDescription: 'A test agent'
      }, testAgentDetails, testTenantDetails);

      expect(scope).toBeInstanceOf(InvokeAgentScope);
      scope?.dispose();
    });

    it('should create scope with agent ID only', () => {
      const scope = InvokeAgentScope.start({
        agentId: 'simple-agent'
      }, testAgentDetails, testTenantDetails);

      expect(scope).toBeInstanceOf(InvokeAgentScope);
      scope?.dispose();
    });

    it('should create scope with additional details', () => {
      const scope = InvokeAgentScope.start({
        agentId: 'test-agent',
        agentName: 'Test Agent',
        agentDescription: 'A test agent',
        conversationId: 'conv-123',
        iconUri: 'https://example.com/icon.png'
      }, testAgentDetails, testTenantDetails);

      expect(scope).toBeInstanceOf(InvokeAgentScope);
      scope?.dispose();
    });

    it('should record response', () => {
      const scope = InvokeAgentScope.start({ agentId: 'test-agent' }, testAgentDetails, testTenantDetails);

      expect(() => scope?.recordResponse('Test response')).not.toThrow();
      scope?.dispose();
    });

    it('should record error', () => {
      const scope = InvokeAgentScope.start({ agentId: 'test-agent' }, testAgentDetails, testTenantDetails);
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
      const scope = InferenceScope.start({
        modelName: 'gpt-4',
        provider: 'openai',
        modelVersion: '0613',
        temperature: 0.7,
        maxTokens: 1000,
        topP: 0.9,
        prompt: 'Test prompt'
      }, testAgentDetails, testTenantDetails);

      expect(scope).toBeInstanceOf(InferenceScope);
      scope?.dispose();
    });

    it('should create scope with minimal details', () => {
      const scope = InferenceScope.start({
        modelName: 'gpt-3.5-turbo'
      }, testAgentDetails, testTenantDetails);

      expect(scope).toBeInstanceOf(InferenceScope);
      scope?.dispose();
    });

    it('should record response', () => {
      const scope = InferenceScope.start({ modelName: 'gpt-4' }, testAgentDetails, testTenantDetails);

      expect(() => scope?.recordResponse({
        content: 'Generated response',
        responseId: 'resp-123',
        finishReason: 'stop',
        inputTokens: 50,
        outputTokens: 100
      })).not.toThrow();
      scope?.dispose();
    });
  });

  describe('Dispose pattern', () => {
    it('should support manual dispose', () => {
      const scope = InvokeAgentScope.start({ agentId: 'test-agent' }, testAgentDetails, testTenantDetails);
      scope?.recordResponse('Manual dispose test');

      expect(() => scope?.dispose()).not.toThrow();
    });
  });
});
