// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { InvokeAgentScopeUtils } from '@microsoft/agents-a365-observability-hosting';
import { InvokeAgentScope, OpenTelemetryConstants } from '@microsoft/agents-a365-observability';

describe('InvokeAgentScopeUtils', () => {
  const mockTurnContext = {
    activity: {
      from: { id: 'user1', name: 'User One', agenticUserId: 'agentic-user-1', tenantId: 'tenant1', aadObjectId: 'aad-object-1' },
      recipient: { id: 'agent1', name: 'Agent One', agenticAppId: 'agent-app-1', agenticUserId: 'agentic-agent-1', tenantId: 'tenant1', aadObjectId: 'aad-object-2' },
      channelData: {},
      text: 'Hello world',
    },
  } as any;

  // Helper to create a scope with a mock span that captures attributes
  class MockSpan {
    public attributes: Record<string, any> = {};
    setAttribute(key: string, value: any) {
      this.attributes[key] = value;
    }
    setAttributes(attrs: Record<string, any>) {
      Object.assign(this.attributes, attrs);
    }
    spanContext() { return { spanId: 'mockSpanId' }; }
    setStatus() {}
    recordException() {}
    end() {}
  }

  function createScopeWithMockSpan() {
    const scope = InvokeAgentScope.start(
      {
        agentName: 'Agent One',
        sessionId: 'session1',
        endpoint: { host: 'localhost', port: 443 },
        conversationId: 'conv1',
        request: { executionType: 'test' }
      } as any,
      { tenantId: 'tenant1' } as any
    );
    // Patch the protected readonly span property using a type cast
    (scope as any).span = new MockSpan();
    return scope;
  }

  function getTestAttributes(scope: any): Record<string, any> {
    return scope.span && scope.span.attributes ? scope.span.attributes : {};
  }

  it('should populate all tags from TurnContext', () => {
    const scope = createScopeWithMockSpan();
    const result = InvokeAgentScopeUtils.populateFromTurnContext(scope, mockTurnContext);
    expect(result).toBe(scope);
    // Should have at least one attribute set
    expect(typeof (result as any).recordAttributes).toBe('function');

    // Validate a subset of expected attributes using the mock
    const attributes = getTestAttributes(scope);
    expect(attributes[OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY]).toBe('Agent One');
    expect(attributes[OpenTelemetryConstants.GEN_AI_CALLER_ID_KEY]).toBe('aad-object-1');
    expect(attributes[OpenTelemetryConstants.GEN_AI_CALLER_NAME_KEY]).toBe('User One');
    expect(attributes[OpenTelemetryConstants.GEN_AI_CALLER_USER_ID_KEY]).toBe('agentic-user-1');
    expect(attributes[OpenTelemetryConstants.GEN_AI_CALLER_TENANT_ID_KEY]).toBe('tenant1');
    expect(attributes[OpenTelemetryConstants.TENANT_ID_KEY]).toBe('tenant1');
    expect(attributes[OpenTelemetryConstants.GEN_AI_EXECUTION_TYPE_KEY]).toBeDefined();
  });

  it('should throw if turnContext is missing', () => {
    const scope = createScopeWithMockSpan();
    expect(() => InvokeAgentScopeUtils.populateFromTurnContext(scope, undefined as any)).toThrow();
  });
});
