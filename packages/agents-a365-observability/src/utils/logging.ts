// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { IConfigurationProvider } from '@microsoft/agents-a365-runtime';
import {
  defaultObservabilityConfigurationProvider,
  ObservabilityConfiguration
} from '../configuration';

/**
 * Custom logger interface for Agent 365 observability
 * Implement this interface to support logging backends
 */
export interface ILogger {
  /**
   * Log an informational message
   * @param message The log message
   * @param args Optional arguments to include in the log
   */
  info(message: string, ...args: unknown[]): void;

  /**
   * Log a warning message
   * @param message The log message
   * @param args Optional arguments to include in the log
   */
  warn(message: string, ...args: unknown[]): void;

  /**
   * Log an error message
   * @param message The log message
   * @param args Optional arguments to include in the log
   */
  error(message: string, ...args: unknown[]): void;
}

/**
 * Format error object for logging with message and stack trace
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\nStack: ${error.stack || 'No stack trace'}`;
  }
  return String(error);
}

const LOG_LEVELS: Record<string, number> = {
  none: 0,
  info: 1,
  warn: 2,
  error: 3
};

/**
 * Parse log level string into a set of enabled log levels.
 * Supports pipe-separated values like "info|warn|error".
 */
function parseLogLevel(level: string): Set<number> {
  const levels = new Set<number>();
  const levelStrings = level.toLowerCase().trim().split('|');

  for (const levelString of levelStrings) {
    const normalizedLevel = levelString.trim();
    const levelValue = LOG_LEVELS[normalizedLevel];
    if (levelValue !== undefined) {
      levels.add(levelValue);
    }
  }

  // If no valid levels found, default to none
  if (levels.size === 0) {
    levels.add(LOG_LEVELS.none);
  }

  return levels;
}

/**
 * Default console-based logger implementation with configuration provider support.
 *
 * Environment Variable:
 *   A365_OBSERVABILITY_LOG_LEVEL=none|info|warn|error (default: none)
 *
 *   Single values:
 *   none = no logging (default)
 *   info = info messages only
 *   warn = warn messages only
 *   error = error messages only
 *
 *   Multiple values (pipe-separated):
 *   info|warn = info and warn messages
 *   warn|error = warn and error messages
 *   info|warn|error = all message types
 */
class DefaultLogger implements ILogger {
  constructor(
    private readonly configProvider: IConfigurationProvider<ObservabilityConfiguration> = defaultObservabilityConfigurationProvider
  ) {}

  private getEnabledLogLevels(): Set<number> {
    return parseLogLevel(this.configProvider.getConfiguration().observabilityLogLevel);
  }

  info(message: string, ...args: unknown[]): void {
    if (this.getEnabledLogLevels().has(LOG_LEVELS.info)) {
      console.log('[INFO]', message, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.getEnabledLogLevels().has(LOG_LEVELS.warn)) {
      console.warn('[WARN]', message, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.getEnabledLogLevels().has(LOG_LEVELS.error)) {
      console.error('[ERROR]', message, ...args);
    }
  }
}

/**
 * Global logger instance - can be replaced with a custom logger via setLogger()
 */
let globalLogger: ILogger = new DefaultLogger();

/**
 * Set a custom logger implementation for the observability SDK
 *
 * Example with Winston:
 * ```typescript
 * import * as winston from 'winston';
 * import { setLogger } from '@microsoft/agents-a365-observability';
 *
 * const winstonLogger = winston.createLogger({
 *   level: 'info',
 *   format: winston.format.json(),
 *   transports: [
 *     new winston.transports.File({ filename: 'error.log', level: 'error' }),
 *     new winston.transports.File({ filename: 'combined.log' })
 *   ]
 * });
 *
 * setLogger({
 *   info: (msg, ...args) => winstonLogger.info(msg, ...args),
 *   warn: (msg, ...args) => winstonLogger.warn(msg, ...args),
 *   error: (msg, ...args) => winstonLogger.error(msg, ...args)
 * });
 * ```
 *
 * @param customLogger The custom logger implementation
 */
export function setLogger(customLogger: ILogger): void {
  if (
    !customLogger ||
    typeof customLogger.info !== 'function' ||
    typeof customLogger.warn !== 'function' ||
    typeof customLogger.error !== 'function'
  ) {
    throw new Error('Custom logger must implement ILogger interface (info, warn, error methods)');
  }
  globalLogger = customLogger;
}

/**
 * Get the current logger instance
 */
export function getLogger(): ILogger {
  return globalLogger;
}

/**
 * Reset to the default console logger (mainly for testing)
 */
export function resetLogger(): void {
  globalLogger = new DefaultLogger();
}

/**
 * Default logger instance for backward compatibility.
 * Delegates to the global logger which can be replaced via setLogger().
 */
export const logger: ILogger = {
  info: (message: string, ...args: unknown[]) => globalLogger.info(message, ...args),
  warn: (message: string, ...args: unknown[]) => globalLogger.warn(message, ...args),
  error: (message: string, ...args: unknown[]) => globalLogger.error(message, ...args)
};

export default logger;
