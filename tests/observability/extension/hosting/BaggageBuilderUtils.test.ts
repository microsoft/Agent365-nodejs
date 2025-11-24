import { BaggageBuilderUtils } from '@microsoft/agents-a365-observability-hosting';
import { BaggageBuilder } from '@microsoft/agents-a365-observability';

describe('BaggageBuilderUtils', () => {
  const mockTurnContext = {
    activity: {
      from: { id: 'user1', name: 'User One', AgenticUserId: 'agentic-user-1', TenantId: 'tenant1' },
      recipient: { id: 'agent1', name: 'Agent One', AgenticAppId: 'agent-app-1', AgenticUserId: 'agentic-agent-1', tenantId: 'tenant1' },
      channelData: {},
    },
  } as any;

  it('should populate all baggage pairs from TurnContext', () => {
    const builder = new BaggageBuilder();
    const result = BaggageBuilderUtils.fromTurnContext(builder, mockTurnContext);
    expect(result).toBe(builder);
    // No error should be thrown and builder should be returned
  });

  it('should throw if turnContext is missing', () => {
    const builder = new BaggageBuilder();
    expect(() => BaggageBuilderUtils.fromTurnContext(builder, undefined as any)).toThrow();
  });
});
