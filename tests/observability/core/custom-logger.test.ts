// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { ConsoleLogger, setLogger, getLogger, resetLogger, ILogger } from '@microsoft/agents-a365-observability/src/utils/logging';
import { ObservabilityBuilder } from '@microsoft/agents-a365-observability/src/ObservabilityBuilder';

describe('Custom Logger Support', () => {
  beforeEach(() => {
    resetLogger();
    // Ensure exporter is disabled for most tests (we don't need network calls)
    delete process.env.ENABLE_A365_OBSERVABILITY_EXPORTER;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetLogger();
  });

  describe('ConsoleLogger', () => {
    it('should default to no logging', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const logger = new ConsoleLogger('[SDK]');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();

      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should log when explicitly enabled', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const logger = new ConsoleLogger('[SDK]', true, true, true);
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(logSpy).toHaveBeenCalledWith('[SDK] info');
      expect(warnSpy).toHaveBeenCalledWith('[SDK] warn');
      expect(errorSpy).toHaveBeenCalledWith('[SDK] error');

      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should respect selective disable flags', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      const logger = new ConsoleLogger('[SDK]', false, true, false);
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith('[SDK] warn');
      expect(errorSpy).not.toHaveBeenCalled();

      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe('Global logger management', () => {
    it('should set, get, and reset logger', () => {
      const custom: ILogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
      
      setLogger(custom);
      expect(getLogger()).toBe(custom);

      resetLogger();
      expect(getLogger()).not.toBe(custom);
    });

    it('should throw on null logger', () => {
      expect(() => setLogger(null as any)).toThrow();
    });
  });

  describe('Custom ILogger implementation', () => {
    it('should use custom logger object', () => {
      const customLogger: ILogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      };

      setLogger(customLogger);
      const logger = getLogger();

      logger.info('test', { data: 1 });
      logger.warn('warning', { data: 2 });
      logger.error('error', { data: 3 });

      expect(customLogger.info).toHaveBeenCalledWith('test', { data: 1 });
      expect(customLogger.warn).toHaveBeenCalledWith('warning', { data: 2 });
      expect(customLogger.error).toHaveBeenCalledWith('error', { data: 3 });
    });

    it('should call all custom logger methods', () => {
      const customLoggerAllLevels: ILogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      };

      setLogger(customLoggerAllLevels);
      const logger = getLogger();

      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');

      expect(customLoggerAllLevels.info).toHaveBeenCalled();
      expect(customLoggerAllLevels.warn).toHaveBeenCalled();
      expect(customLoggerAllLevels.error).toHaveBeenCalled();
    });

    it('should validate logger has required methods', () => {
      // Missing error method
      const invalidLogger = {
        info: jest.fn(),
        warn: jest.fn()
      };

      expect(() => setLogger(invalidLogger as any)).toThrow('Custom logger must implement ILogger interface');
    });

    it('should validate logger methods are functions', () => {
      // error is not a function
      const invalidLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: 'not a function'
      };

      expect(() => setLogger(invalidLogger as any)).toThrow('Custom logger must implement ILogger interface');
    });
  });

  describe('ObservabilityBuilder integration', () => {
    it('should apply custom logger via withCustomLogger during build', () => {
      const customLogger: ILogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      };

      const builder = new ObservabilityBuilder()
        .withCustomLogger(customLogger);

      // Build should set the logger
      builder.build();

      // Verify the logger was set
      const currentLogger = getLogger();
      currentLogger.info('test message');
      
      expect(customLogger.info).toHaveBeenCalledWith('test message');
    });

    it('should chain withCustomLogger with other builder methods', () => {
      const customLogger: ILogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      };

      const builder = new ObservabilityBuilder()
        .withService('test-service', '1.0.0')
        .withCustomLogger(customLogger)
        .withClusterCategory('test');

      expect(builder).toBeInstanceOf(ObservabilityBuilder);
      
      builder.build();
      
      const currentLogger = getLogger();
      currentLogger.warn('test warning');
      
      expect(customLogger.warn).toHaveBeenCalledWith('test warning');
    });

    it('should apply logger before any logging during build', () => {
      const customLogger: ILogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      };

      // Build with custom logger - any logging during build should use the custom logger
      new ObservabilityBuilder()
        .withCustomLogger(customLogger)
        .build();

      // The custom logger should have been set before any build logging occurred
      const currentLogger = getLogger();
      expect(currentLogger).toBe(customLogger);
    });
  });
});
