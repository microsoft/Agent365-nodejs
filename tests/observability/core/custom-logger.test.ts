// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { ConsoleLogger, setLogger, getLogger, resetLogger, ILogger } from '@microsoft/agents-a365-observability/src/utils/logging';

describe('Custom Logger Support', () => {
  beforeEach(() => {
    resetLogger();
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
  });
});
