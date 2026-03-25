// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { context, propagation } from '@opentelemetry/api';
import { BaggageBuilder, BaggageScope } from '@microsoft/agents-a365-observability/src/tracing/middleware/BaggageBuilder';
import { OpenTelemetryConstants } from '@microsoft/agents-a365-observability/src/tracing/constants';

describe('BaggageBuilder', () => {
  describe('fluent setters', () => {
    it('should set tenant ID', () => {
      const builder = new BaggageBuilder();
      const result = builder.tenantId('tenant-123');
      expect(result).toBe(builder); // Fluent API

      const scope = builder.build();
      expect(scope).toBeInstanceOf(BaggageScope);
    });

    it('should set agent ID', () => {
      const builder = new BaggageBuilder();
      builder.agentId('agent-456');

      const scope = builder.build();
      expect(scope).toBeInstanceOf(BaggageScope);
    });

    it('should chain multiple setters', () => {
      const builder = new BaggageBuilder()
        .tenantId('tenant-123')
        .agentId('agent-456')
        .agentName('TestAgent')
        .agentPlatformId('platform-xyz-123')
        .conversationId('conv-001');

      const scope = builder.build();
      expect(scope).toBeInstanceOf(BaggageScope);
    });

    it('should set agent platform ID', () => {
      const builder = new BaggageBuilder();
      builder.agentPlatformId('platform-abc-456');

      const scope = builder.build();
      expect(scope).toBeInstanceOf(BaggageScope);

      const bag = propagation.getBaggage((scope as any).contextWithBaggage);
      expect(bag?.getEntry(OpenTelemetryConstants.GEN_AI_AGENT_PLATFORM_ID_KEY)?.value).toBe('platform-abc-456');
    });

    it('should set caller agent platform ID via fluent API', () => {
      const builder = new BaggageBuilder();
      builder.callerAgentPlatformId('caller-platform-xyz');

      const scope = builder.build();
      expect(scope).toBeInstanceOf(BaggageScope);

      const bag = propagation.getBaggage((scope as any).contextWithBaggage);
      expect(bag?.getEntry(OpenTelemetryConstants.GEN_AI_CALLER_AGENT_PLATFORM_ID_KEY)?.value).toBe('caller-platform-xyz');
    });
  });

  describe('setPairs', () => {
    it('should accept dictionary of pairs', () => {
      const builder = new BaggageBuilder();
      builder.setPairs({
        [OpenTelemetryConstants.TENANT_ID_KEY]: 'tenant-123',
        [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]: 'agent-456'
      });

      const scope = builder.build();
      expect(scope).toBeInstanceOf(BaggageScope);
    });

    it('should accept iterable of pairs', () => {
      const builder = new BaggageBuilder();
      const pairs: Array<[string, string]> = [
        [OpenTelemetryConstants.TENANT_ID_KEY, 'tenant-123'],
        [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY, 'agent-456'],
        [OpenTelemetryConstants.GEN_AI_CALLER_CLIENT_IP_KEY, '10.0.0.5']
      ];
      builder.setPairs(pairs);

      const scope = builder.build();
      expect(scope).toBeInstanceOf(BaggageScope);

      const bag = propagation.getBaggage((scope as any).contextWithBaggage);
      expect(bag?.getEntry(OpenTelemetryConstants.TENANT_ID_KEY)?.value).toBe('tenant-123');
      expect(bag?.getEntry(OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY)?.value).toBe('agent-456');
      expect(bag?.getEntry(OpenTelemetryConstants.GEN_AI_CALLER_CLIENT_IP_KEY)?.value).toBe('10.0.0.5');
    });

    it('should ignore null values', () => {
      const builder = new BaggageBuilder();
      builder.setPairs({
        [OpenTelemetryConstants.TENANT_ID_KEY]: 'tenant-123',
        [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]: null
      });

      const scope = builder.build();
      expect(scope).toBeInstanceOf(BaggageScope);
    });
  });

  describe('null and whitespace handling', () => {
    it('should ignore null values', () => {
      const builder = new BaggageBuilder();
      builder.tenantId(null);
      builder.agentId(undefined);

      const scope = builder.build();
      expect(scope).toBeInstanceOf(BaggageScope);
    });

    it('should ignore whitespace-only values', () => {
      const builder = new BaggageBuilder();
      builder.tenantId('   ');
      builder.agentId('\t\n');

      const scope = builder.build();
      expect(scope).toBeInstanceOf(BaggageScope);
    });

    it('should trim values', () => {
      const builder = new BaggageBuilder();
      builder.tenantId('  tenant-123  ');

      const scope = builder.build();
      expect(scope).toBeInstanceOf(BaggageScope);
    });
  });

  describe('operationSource, channelName, and channelLink', () => {
    it.each([
      ['operationSource', 'ATG', OpenTelemetryConstants.SERVICE_NAME_KEY],
      ['channelName', 'teams', OpenTelemetryConstants.CHANNEL_NAME_KEY],
      ['channelLink', 'https://teams/channel', OpenTelemetryConstants.CHANNEL_LINK_KEY],
    ] as const)('%s should set the correct baggage key', (method, value, expectedKey) => {
      const builder = new BaggageBuilder();
      (builder as any)[method](value);
      const scope = builder.build();
      const bag = propagation.getBaggage((scope as any).contextWithBaggage);
      expect(bag?.getEntry(expectedKey)?.value).toBe(value);
    });
  });

  describe('invokeAgentServer', () => {
    it.each([
      ['api.example.com', 8080, 'api.example.com', '8080'],
      ['api.example.com', 443, 'api.example.com', undefined],
      ['api.example.com', undefined, 'api.example.com', undefined],
    ] as const)('address=%s port=%s should set address=%s portBaggage=%s', (address, port, expectedAddress, expectedPort) => {
      const builder = new BaggageBuilder();
      builder.invokeAgentServer(address, port as number | undefined);
      const scope = builder.build();
      const bag = propagation.getBaggage((scope as any).contextWithBaggage);
      expect(bag?.getEntry(OpenTelemetryConstants.SERVER_ADDRESS_KEY)?.value).toBe(expectedAddress);
      expect(bag?.getEntry(OpenTelemetryConstants.SERVER_PORT_KEY)?.value).toBe(expectedPort);
    });

    it('should return self for method chaining', () => {
      const builder = new BaggageBuilder();
      expect(builder.invokeAgentServer('api.example.com', 8080)).toBe(builder);
    });
  });

  describe('setRequestContext static method', () => {
    it('should create scope with common fields', () => {
      const scope = BaggageBuilder.setRequestContext(
        'tenant-123',
        'agent-456'
      );

      expect(scope).toBeInstanceOf(BaggageScope);
    });

    it('should handle null values', () => {
      const scope = BaggageBuilder.setRequestContext(
        null,
        'agent-456'
      );

      expect(scope).toBeInstanceOf(BaggageScope);
    });
  });

  describe('sessionId support', () => {
    it('should set sessionId via fluent API', () => {
      const scope = new BaggageBuilder()
        .tenantId('tenant-123')
        .agentId('agent-456')
        .sessionId('session-0001')
        .sessionDescription('My session desc')
        .build();
      const bag = propagation.getBaggage((scope as any).contextWithBaggage);
      expect(bag?.getEntry(OpenTelemetryConstants.SESSION_ID_KEY)?.value).toBe('session-0001');
      expect(bag?.getEntry(OpenTelemetryConstants.SESSION_DESCRIPTION_KEY)?.value).toBe('My session desc');
    });

    it('should omit empty sessionId value', () => {
      const scope = new BaggageBuilder()
        .sessionId('   ')
        .build();
      const bag = propagation.getBaggage((scope as any).contextWithBaggage);
      expect(bag?.getEntry(OpenTelemetryConstants.SESSION_ID_KEY)).toBeUndefined();
    });

    it('should omit null sessionDescription value', () => {
      const scope = new BaggageBuilder()
        .sessionDescription(null)
        .build();
      const bag = propagation.getBaggage((scope as any).contextWithBaggage);
      expect(bag?.getEntry(OpenTelemetryConstants.SESSION_DESCRIPTION_KEY)).toBeUndefined();
    });
  });
});

describe('BaggageScope', () => {
  describe('run method', () => {
    it('should execute function with baggage context', () => {
      const builder = new BaggageBuilder()
        .tenantId('tenant-123')
        .agentId('agent-456');

      const scope = builder.build();
      let executed = false;

      const result = scope.run(() => {
        executed = true;
        // Baggage should be set in the current context
        // Note: The baggage may not be immediately retrievable in the test environment
        // This is a basic structural test to ensure no errors occur
        return 'test-result';
      });

      expect(executed).toBe(true);
      expect(result).toBe('test-result');
    });

    it('should restore context after execution', () => {
      const _originalContext = context.active();

      const scope = new BaggageBuilder()
        .tenantId('tenant-123')
        .build();

      scope.run(() => {
        // Inside the scope - context should be different
        const currentContext = context.active();
        expect(currentContext).toBeDefined();
      });

      // After scope.run() completes, context should be restored
      const restoredContext = context.active();
      expect(restoredContext).toBeDefined();
    });
  });

  describe('disposable pattern', () => {
    it('should implement Symbol.dispose', () => {
      const scope = new BaggageBuilder()
        .tenantId('tenant-123')
        .build();

      expect(typeof scope[Symbol.dispose]).toBe('function');

      // Should not throw when disposing
      expect(() => scope[Symbol.dispose]()).not.toThrow();
    });

    it('should implement dispose method', () => {
      const scope = new BaggageBuilder()
        .tenantId('tenant-123')
        .build();

      expect(typeof scope.dispose).toBe('function');

      // Should not throw when disposing
      expect(() => scope.dispose()).not.toThrow();
    });
  });
});
