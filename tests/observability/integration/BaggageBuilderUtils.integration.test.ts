import { BaggageBuilderUtils } from '@microsoft/agents-a365-observability-hosting';
import { BaggageBuilder } from '@microsoft/agents-a365-observability';
import { propagation, context as otelContext } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { OpenTelemetryConstants } from '@microsoft/agents-a365-observability';

describe('BaggageBuilderUtils (integration)', () => {
  let contextManager: AsyncHooksContextManager;

  beforeAll(() => {
    contextManager = new AsyncHooksContextManager();
    contextManager.enable();
    otelContext.setGlobalContextManager(contextManager);
  });

  afterAll(() => {
    contextManager.disable();
  });

  const mockTurnContext = {
    activity: {
      from: { id: 'user1', name: 'User One', AgenticUserId: 'agentic-user-1', TenantId: 'tenant1' },
      recipient: { id: 'agent1', name: 'Agent One', AgenticAppId: 'agent-app-1', AgenticUserId: 'agentic-agent-1', tenantId: 'tenant1' },
      channelData: {},
    },
  } as any;

  it('should set baggage in OpenTelemetry context', (done) => {
    const builder = new BaggageBuilder();
    BaggageBuilderUtils.fromTurnContext(builder, mockTurnContext);
    const scope = builder.build();

    otelContext.with(scope["contextWithBaggage"], () => {
      const baggage = propagation.getBaggage(otelContext.active());
      const baggageEntries = baggage
        ? Object.fromEntries(Array.from(baggage.getAllEntries()).map(([k, v]) => [k, v.value]))
        : {};

      expect(baggageEntries[OpenTelemetryConstants.GEN_AI_CALLER_ID_KEY]).toBe("user1");
      expect(baggageEntries[OpenTelemetryConstants.GEN_AI_CALLER_NAME_KEY]).toBe("User One");
      expect(baggageEntries[OpenTelemetryConstants.GEN_AI_CALLER_UPN_KEY]).toBe("User One");
      expect(baggageEntries[OpenTelemetryConstants.GEN_AI_CALLER_USER_ID_KEY]).toBe("agentic-user-1");
      expect(baggageEntries[OpenTelemetryConstants.GEN_AI_CALLER_TENANT_ID_KEY]).toBe("tenant1");
      expect(baggageEntries[OpenTelemetryConstants.GEN_AI_EXECUTION_TYPE_KEY]).toBe("Agent2Agent");
      expect(baggageEntries[OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]).toBe("agent-app-1");
      expect(baggageEntries[OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY]).toBe("Agent One");
      expect(baggageEntries[OpenTelemetryConstants.GEN_AI_AGENT_AUID_KEY]).toBe("agentic-agent-1");
      expect(baggageEntries[OpenTelemetryConstants.GEN_AI_AGENT_UPN_KEY]).toBe("Agent One");
      expect(baggageEntries[OpenTelemetryConstants.TENANT_ID_KEY]).toBe("tenant1");
      done();
    });
  });
});
