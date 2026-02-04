// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

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

  describe('setLogger and getLogger', () => {
    it('should allow setting a custom logger', async () => {
      const { setLogger, getLogger, logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      const customLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      };

      setLogger(customLogger);

      logger.info('Test message', 'arg1');
      logger.warn('Warning message');
      logger.error('Error message');

      expect(customLogger.info).toHaveBeenCalledWith('Test message', 'arg1');
      expect(customLogger.warn).toHaveBeenCalledWith('Warning message');
      expect(customLogger.error).toHaveBeenCalledWith('Error message');

      // getLogger should return the custom logger
      expect(getLogger()).toBe(customLogger);
    });

    it('should throw when setting invalid logger (null)', async () => {
      const { setLogger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      expect(() => setLogger(null as never)).toThrow('Custom logger must implement ILogger interface');
    });

    it('should throw when setting logger missing info method', async () => {
      const { setLogger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      const invalidLogger = {
        warn: jest.fn(),
        error: jest.fn()
      };

      expect(() => setLogger(invalidLogger as never)).toThrow('Custom logger must implement ILogger interface');
    });

    it('should throw when setting logger missing warn method', async () => {
      const { setLogger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      const invalidLogger = {
        info: jest.fn(),
        error: jest.fn()
      };

      expect(() => setLogger(invalidLogger as never)).toThrow('Custom logger must implement ILogger interface');
    });

    it('should throw when setting logger missing error method', async () => {
      const { setLogger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      const invalidLogger = {
        info: jest.fn(),
        warn: jest.fn()
      };

      expect(() => setLogger(invalidLogger as never)).toThrow('Custom logger must implement ILogger interface');
    });
  });

  describe('resetLogger', () => {
    it('should reset to default logger', async () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'info';
      const { setLogger, resetLogger, logger } = await import('@microsoft/agents-a365-observability/src/utils/logging');

      const customLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      };

      setLogger(customLogger);
      logger.info('Custom logger call');
      expect(customLogger.info).toHaveBeenCalled();

      // Reset to default
      resetLogger();

      // Now should use default logger (console)
      logger.info('Default logger call');
      expect(consoleLogSpy).toHaveBeenCalledWith('[INFO]', 'Default logger call');
    });
  });
});
