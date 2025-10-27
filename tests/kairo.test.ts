import { describe, it, expect, afterEach } from '@jest/globals';
import { ObservabilityManager as Kairo, Builder } from '@microsoft/agents-a365-observability';

describe('Agent365 SDK', () => {
  afterEach(async () => {
    // Clean up after each test
    await Kairo.shutdown();
  });

  describe('Kairo Main Class', () => {
    it('should configure with builder pattern', () => {
      const builder = Kairo.configure((b: Builder) =>
        b.withService('Test Service', '1.0.0')
      );

      expect(builder).toBeInstanceOf(Builder);
      expect(Kairo.getInstance()).toBe(builder);
    });

    it('should start with builder configuration', () => {
      const builder = Kairo.configure((b: Builder) =>
        b.withService('Test Service 2', '2.0.0')
      );

      builder.start();

      expect(builder).toBeInstanceOf(Builder);
      expect(Kairo.getInstance()).toBe(builder);
    });

    it('should return null when no instance configured', async () => {
      await Kairo.shutdown(); // Ensure clean state
      expect(Kairo.getInstance()).toBeNull();
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
