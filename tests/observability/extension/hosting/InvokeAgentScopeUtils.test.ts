
import { InvokeAgentScopeUtils } from '@microsoft/agents-a365-observability-hosting';
import { InvokeAgentScope, OpenTelemetryConstants } from '@microsoft/agents-a365-observability';

describe('InvokeAgentScopeUtils', () => {
  const mockTurnContext = {
    activity: {
      from: { id: 'user1', name: 'User One', AgenticUserId: 'agentic-user-1', TenantId: 'tenant1' },
      recipient: { id: 'agent1', name: 'Agent One', AgenticAppId: 'agent-app-1', AgenticUserId: 'agentic-agent-1', tenantId: 'tenant1' },
      channelData: {},
      text: 'Hello world',
    },
  } as any;

  function createScope() {
    // Provide minimal required details for InvokeAgentScope.start
    return InvokeAgentScope.start(
      {
        agentName: 'Agent One',
        sessionId: 'session1',
        endpoint: { host: 'localhost', port: 443 },
        conversationId: 'conv1',
        request: { executionType: 'test' }
      } as any,
      { tenantId: 'tenant1' } as any
    );
  }

  it('should populate all tags from TurnContext', () => {
    const scope = createScope();
    const result = InvokeAgentScopeUtils.populateFromTurnContext(scope, mockTurnContext);
    expect(result).toBe(scope);
    // Should have at least one attribute set
    expect(typeof (result as any).recordAttributes).toBe('function');

    // Access the internal span for attribute validation
    const span = (scope as any).span;
    expect(span).toBeDefined();
    // Validate a subset of expected attributes
    const attributes = span.attributes || span._attributes || {};
    // Debug: print attributes to see what is set
    // eslint-disable-next-line no-console
    console.log('DEBUG span.attributes:', attributes);
    expect(attributes[OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY]).toBe('Agent One');
    expect(attributes[OpenTelemetryConstants.GEN_AI_CALLER_ID_KEY]).toBe('user1');
    expect(attributes[OpenTelemetryConstants.GEN_AI_CALLER_NAME_KEY]).toBe('User One');
    expect(attributes[OpenTelemetryConstants.GEN_AI_CALLER_USER_ID_KEY]).toBe('agentic-user-1');
    expect(attributes[OpenTelemetryConstants.GEN_AI_CALLER_TENANT_ID_KEY]).toBe('tenant1');
    expect(attributes[OpenTelemetryConstants.TENANT_ID_KEY]).toBe('tenant1');
    expect(attributes[OpenTelemetryConstants.GEN_AI_EXECUTION_TYPE_KEY]).toBeDefined();
  });

  it('should throw if turnContext is missing', () => {
    const scope = createScope();
    expect(() => InvokeAgentScopeUtils.populateFromTurnContext(scope, undefined as any)).toThrow();
  });
});
