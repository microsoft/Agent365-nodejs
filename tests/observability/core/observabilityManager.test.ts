import { describe, it, expect, afterEach } from '@jest/globals';
import { ObservabilityManager, Builder } from '@microsoft/agents-a365-observability';

describe('Agent 365 SDK', () => {
  afterEach(async () => {
    // Clean up after each test
    await ObservabilityManager.shutdown();
  });

  describe('ObservabilityManager Main Class', () => {
    it('should configure with builder pattern', () => {
      const builder = ObservabilityManager.configure((b: Builder) =>
        b.withService('Test Service', '1.0.0')
      );

      expect(builder).toBeInstanceOf(Builder);
      expect(ObservabilityManager.getInstance()).toBe(builder);
    });

    it('should start with builder configuration', () => {
      const builder = ObservabilityManager.configure((b: Builder) =>
        b.withService('Test Service 2', '2.0.0')
      );

      builder.start();

      expect(builder).toBeInstanceOf(Builder);
      expect(ObservabilityManager.getInstance()).toBe(builder);
    });

    it('should return null when no instance configured', async () => {
      await ObservabilityManager.shutdown(); // Ensure clean state
      expect(ObservabilityManager.getInstance()).toBeNull();
    });
  });

  describe('Builder', () => {
    it('should chain builder methods', () => {
      const builder = new Builder();

      const result = builder
        .withService('Test', '1.0.0');

      expect(result).toBe(builder);
    });

    it('should build successfully', () => {
      const builder = new Builder();
      const result = builder.build();

      expect(result).toBe(true);
      expect(typeof builder.start).toBe('function');
      expect(typeof builder.shutdown).toBe('function');
    });

  });
});
