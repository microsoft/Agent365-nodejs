// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { IConfigurationProvider } from '../../../packages/agents-a365-runtime/src';
import { ObservabilityConfiguration } from '../../../packages/agents-a365-observability/src';

/**
 * Helper to create a simple configuration provider for testing.
 * Avoids type constraint issues with DefaultConfigurationProvider in monorepo.
 */
function createTestConfigProvider(
  config: ObservabilityConfiguration
): IConfigurationProvider<ObservabilityConfiguration> {
  return {
    getConfiguration: () => config
  };
}

describe('logging', () => {
  const originalEnv = process.env;
  let consoleLogSpy: ReturnType<typeof jest.spyOn>;
  let consoleWarnSpy: ReturnType<typeof jest.spyOn>;
  let consoleErrorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    // Reset modules to allow re-importing with different env vars
    jest.resetModules();
    // Clone environment
    process.env = { ...originalEnv };
    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('formatError', () => {
    it('should format Error objects with message and stack trace', async () => {
      const { formatError } = await import('@microsoft/agents-a365-observability/src/utils/logging');
      const error = new Error('Test error message');
      const result = formatError(error);

      expect(result).toContain('Test error message');
      expect(result).toContain('Stack:');
    });

    it('should format Error objects without stack trace', async () => {
      const { formatError } = await import('@microsoft/agents-a365-observability/src/utils/logging');
      const error = new Error('Test error');
      error.stack = undefined;
      const result = formatError(error);

      expect(result).toContain('Test error');
      expect(result).toContain('No stack trace');
    });

    it('should convert non-Error values to string', async () => {
      const { formatError } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      expect(formatError('string error')).toBe('string error');
      expect(formatError(123)).toBe('123');
      expect(formatError(null)).toBe('null');
      expect(formatError(undefined)).toBe('undefined');
      expect(formatError({ foo: 'bar' })).toBe('[object Object]');
    });
  });

  describe('logger with level: none (default)', () => {
    it('should not log info messages when level is none', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'none';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.info('Test info message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log warn messages when level is none', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'none';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.warn('Test warn message');

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should not log error messages when level is none', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'none';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.error('Test error message');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should default to none when env var is not set', async () => {
      delete process.env.A365_OBSERVABILITY_LOG_LEVEL;
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.info('Test message');
      logger.warn('Test message');
      logger.error('Test message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('logger with level: info', () => {
    it('should log info messages when level is info', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'info';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.info('Test info message');

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'Test info message');
    });

    it('should not log warn messages when level is info only', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'info';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.warn('Test warn message');

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should not log error messages when level is info only', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'info';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.error('Test error message');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('logger with level: warn', () => {
    it('should log warn messages when level is warn', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'warn';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.warn('Test warn message');

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN]', 'Test warn message');
    });

    it('should not log info messages when level is warn only', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'warn';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.info('Test info message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('logger with level: error', () => {
    it('should log error messages when level is error', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'error';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.error('Test error message');

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'Test error message');
    });

    it('should not log info or warn messages when level is error only', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'error';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.info('Test info message');
      logger.warn('Test warn message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('logger with multiple levels (pipe-separated)', () => {
    it('should log info and warn when level is info|warn', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'info|warn';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.info('Test info');
      logger.warn('Test warn');
      logger.error('Test error');

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'Test info');
      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN]', 'Test warn');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should log warn and error when level is warn|error', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'warn|error';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.info('Test info');
      logger.warn('Test warn');
      logger.error('Test error');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN]', 'Test warn');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'Test error');
    });

    it('should log all levels when level is info|warn|error', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'info|warn|error';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.info('Test info');
      logger.warn('Test warn');
      logger.error('Test error');

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'Test info');
      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN]', 'Test warn');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'Test error');
    });

    it('should handle whitespace in pipe-separated levels', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = ' info | warn | error ';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.info('Test info');
      logger.warn('Test warn');
      logger.error('Test error');

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('logger with case insensitivity', () => {
    it('should handle uppercase log levels', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'INFO';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.info('Test info');

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'Test info');
    });

    it('should handle mixed case log levels', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'InFo|WaRn';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.info('Test info');
      logger.warn('Test warn');

      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('logger with invalid values', () => {
    it('should default to none for invalid log level', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'invalid';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.info('Test message');
      logger.warn('Test message');
      logger.error('Test message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should default to none for empty string', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = '';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.info('Test message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should ignore invalid levels in pipe-separated string', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'invalid|info|alsoinvalid';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.info('Test info');
      logger.warn('Test warn');

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'Test info');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('logger with additional arguments', () => {
    it('should pass additional arguments to console.log', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'info';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.info('Test message', { data: 'value' }, 123);

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'Test message', { data: 'value' }, 123);
    });

    it('should pass additional arguments to console.warn', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'warn';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      logger.warn('Test message', ['array', 'data']);

      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN]', 'Test message', ['array', 'data']);
    });

    it('should pass additional arguments to console.error', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'error';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      const errorObj = new Error('test');
      logger.error('Test message', errorObj);

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'Test message', errorObj);
    });
  });

  describe('default export', () => {
    it('should export logger as default', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'info';
      const loggingModule = await import('@microsoft/agents-a365-observability/src/utils/logging');

      expect(loggingModule.default).toBe(loggingModule.logger);
    });
  });

  describe('dynamic log level resolution', () => {
    it('should support runtime log level changes without module reload', async () => {
      // Start with no logging
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'none';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      // Should not log with 'none'
      logger.info('Should not appear');
      expect(consoleLogSpy).not.toHaveBeenCalled();

      // Change log level at runtime
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'info';

      // Should now log without module reload
      logger.info('Should appear now');
      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'Should appear now');
    });

    it('should support dynamic multi-tenant log level scenarios', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'error';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      // Tenant A - error only
      logger.info('Tenant A info');
      logger.error('Tenant A error');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'Tenant A error');

      consoleErrorSpy.mockClear();

      // Switch to Tenant B - all logging
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'info|warn|error';

      logger.info('Tenant B info');
      logger.warn('Tenant B warn');
      logger.error('Tenant B error');
      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'Tenant B info');
      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN]', 'Tenant B warn');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'Tenant B error');
    });

    it('should evaluate log level on each call', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'info';
      const { logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      // First call - should log
      logger.info('First call');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);

      // Disable logging
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'none';

      // Second call - should not log
      logger.info('Second call');
      expect(consoleLogSpy).toHaveBeenCalledTimes(1); // Still 1, not 2

      // Re-enable logging
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'info';

      // Third call - should log again
      logger.info('Third call');
      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('createLogger factory', () => {
    it('should create a logger with default provider when no argument provided', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'info';
      const { createLogger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      const customLogger = createLogger();
      customLogger.info('Test message');

      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'Test message');
    });

    it('should create a logger with custom configuration provider', async () => {
      const { createLogger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      // Create a custom provider that always returns 'error' log level
      const customProvider = createTestConfigProvider(
        new ObservabilityConfiguration({
          observabilityLogLevel: () => 'error'
        })
      );

      const customLogger = createLogger(customProvider);

      // Should not log info (only error is enabled)
      customLogger.info('Info message');
      expect(consoleLogSpy).not.toHaveBeenCalled();

      // Should log error
      customLogger.error('Error message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'Error message');
    });

    it('should allow multiple loggers with different configurations', async () => {
      const { createLogger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      // Logger A - only info
      const providerA = createTestConfigProvider(
        new ObservabilityConfiguration({
          observabilityLogLevel: () => 'info'
        })
      );
      const loggerA = createLogger(providerA);

      // Logger B - only error
      const providerB = createTestConfigProvider(
        new ObservabilityConfiguration({
          observabilityLogLevel: () => 'error'
        })
      );
      const loggerB = createLogger(providerB);

      // Logger A logs info, not error
      loggerA.info('A info');
      loggerA.error('A error');
      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'A info');
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      consoleLogSpy.mockClear();

      // Logger B logs error, not info
      loggerB.info('B info');
      loggerB.error('B error');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR]', 'B error');
    });

    it('should support dynamic log level from custom provider', async () => {
      const { createLogger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      let currentLogLevel = 'none';

      // Provider returns a config with dynamic log level override
      const dynamicProvider: IConfigurationProvider<ObservabilityConfiguration> = {
        getConfiguration: () => new ObservabilityConfiguration({
          observabilityLogLevel: () => currentLogLevel
        })
      };

      const customLogger = createLogger(dynamicProvider);

      // Initially none - should not log
      customLogger.info('Should not appear');
      expect(consoleLogSpy).not.toHaveBeenCalled();

      // Change to info dynamically
      currentLogLevel = 'info';
      customLogger.info('Should appear');
      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'Should appear');
    });

    it('should isolate custom logger from default logger', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'none';
      const { createLogger, logger: defaultLogger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      // Custom logger with all logging enabled
      const customProvider = createTestConfigProvider(
        new ObservabilityConfiguration({
          observabilityLogLevel: () => 'info|warn|error'
        })
      );
      const customLogger = createLogger(customProvider);

      // Default logger should not log (env var is 'none')
      defaultLogger.info('Default info');
      expect(consoleLogSpy).not.toHaveBeenCalled();

      // Custom logger should log (custom config has 'info|warn|error')
      customLogger.info('Custom info');
      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'Custom info');
    });
  });
});
