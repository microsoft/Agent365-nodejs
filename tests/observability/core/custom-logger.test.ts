// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { setLogger, getLogger, resetLogger, ILogger } from '@microsoft/agents-a365-observability/src/utils/logging';
import { ObservabilityBuilder } from '@microsoft/agents-a365-observability/src/ObservabilityBuilder';

describe('Custom Logger Support', () => {
  beforeEach(() => {
    resetLogger();
    delete process.env.ENABLE_A365_OBSERVABILITY_EXPORTER;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetLogger();
    delete process.env.A365_OBSERVABILITY_LOG_LEVEL;
  });

  describe('Default Logger', () => {
    it('should default to no logging when environment variable is not set', () => {
      delete process.env.A365_OBSERVABILITY_LOG_LEVEL;
      resetLogger();
      
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const logger = getLogger();
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');

      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();

      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should respect A365_OBSERVABILITY_LOG_LEVEL environment variable', () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'info|warn|error';
      resetLogger();
      
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const logger = getLogger();
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');

      expect(logSpy).toHaveBeenCalledWith('[INFO]', 'info msg');
      expect(warnSpy).toHaveBeenCalledWith('[WARN]', 'warn msg');
      expect(errorSpy).toHaveBeenCalledWith('[ERROR]', 'error msg');

      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should support selective log levels via environment variable', () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'warn|error';
      resetLogger();
      
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const logger = getLogger();
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');

      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith('[WARN]', 'warn msg');
      expect(errorSpy).toHaveBeenCalledWith('[ERROR]', 'error msg');

      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe('Global Logger Management', () => {
    it('should set and get custom logger', () => {
      const custom: ILogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
      
      setLogger(custom);
      expect(getLogger()).toBe(custom);
    });

    it('should reset to default logger', () => {
      const custom: ILogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
      setLogger(custom);
      
      resetLogger();
      expect(getLogger()).not.toBe(custom);
    });

    it('should throw when setting invalid logger', () => {
      expect(() => setLogger(null as any)).toThrow('Custom logger must implement ILogger interface');
      expect(() => setLogger({ info: jest.fn() } as any)).toThrow('Custom logger must implement ILogger interface');
    });
  });

  describe('Custom ILogger Implementation', () => {
    it('should route all log levels to custom logger', () => {
      const customLogger: ILogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      };

      setLogger(customLogger);
      const logger = getLogger();

      logger.info('test info', { data: 1 });
      logger.warn('test warn', { data: 2 });
      logger.error('test error', { data: 3 });

      expect(customLogger.info).toHaveBeenCalledWith('test info', { data: 1 });
      expect(customLogger.warn).toHaveBeenCalledWith('test warn', { data: 2 });
      expect(customLogger.error).toHaveBeenCalledWith('test error', { data: 3 });
    });

    it('should support selective level logging', () => {
      const selectiveLogger: ILogger = {
        info: () => {},
        warn: jest.fn(),
        error: () => {}
      };

      setLogger(selectiveLogger);
      const logger = getLogger();

      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');

      expect(selectiveLogger.warn).toHaveBeenCalledWith('warn msg');
    });
  });

  describe('ObservabilityBuilder Integration', () => {
    it('should set custom logger when building', () => {
      const customLogger: ILogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      };

      new ObservabilityBuilder()
        .withService('test-service', '1.0.0')
        .withCustomLogger(customLogger)
        .build();

      const currentLogger = getLogger();
      currentLogger.info('test message');
      
      expect(customLogger.info).toHaveBeenCalledWith('test message');
    });
  });
});

