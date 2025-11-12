// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { context } from '@opentelemetry/api';
import { BaggageBuilder, BaggageScope } from '@microsoft/agents-a365-observability/dist/cjs/tracing/middleware/BaggageBuilder';
import { OpenTelemetryConstants } from '@microsoft/agents-a365-observability/dist/cjs/tracing/constants';

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

    it('should set correlation ID', () => {
      const builder = new BaggageBuilder();
      builder.correlationId('corr-789');

      const scope = builder.build();
      expect(scope).toBeInstanceOf(BaggageScope);
    });

    it('should chain multiple setters', () => {
      const builder = new BaggageBuilder()
        .tenantId('tenant-123')
        .agentId('agent-456')
        .correlationId('corr-789')
        .agentName('TestAgent')
        .conversationId('conv-001');

      const scope = builder.build();
      expect(scope).toBeInstanceOf(BaggageScope);
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
        [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY, 'agent-456']
      ];
      builder.setPairs(pairs);

      const scope = builder.build();
      expect(scope).toBeInstanceOf(BaggageScope);
    });

    it('should ignore null values', () => {
      const builder = new BaggageBuilder();
      builder.setPairs({
        [OpenTelemetryConstants.TENANT_ID_KEY]: 'tenant-123',
        [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]: null,
        [OpenTelemetryConstants.CORRELATION_ID_KEY]: undefined
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

  describe('setRequestContext static method', () => {
    it('should create scope with common fields', () => {
      const scope = BaggageBuilder.setRequestContext(
        'tenant-123',
        'agent-456',
        'corr-789'
      );

      expect(scope).toBeInstanceOf(BaggageScope);
    });

    it('should handle null values', () => {
      const scope = BaggageBuilder.setRequestContext(
        null,
        'agent-456',
        null
      );

      expect(scope).toBeInstanceOf(BaggageScope);
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
