// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { IConfigurationProvider } from '@microsoft/agents-a365-runtime';
import {
  defaultObservabilityConfigurationProvider,
  ObservabilityConfiguration
} from '../configuration';

/**
 * Format error object for logging with message and stack trace
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\nStack: ${error.stack || 'No stack trace'}`;
  }
  return String(error);
}

/**
 * Logger interface for type safety
 */
export interface Logger {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}

/**
 * Simple logger for Agent 365 observability
 *
 * Usage:
 *   import logger from './logging';
 *   logger.info('Info message');    // Shows when A365ObservabilityLogLevel includes 'info'
 *   logger.warn('Warning');         // Shows when A365ObservabilityLogLevel includes 'warn'
 *   logger.error('Error');          // Shows when A365ObservabilityLogLevel includes 'error'
 *
 * Environment Variable:
 *   A365_OBSERVABILITY_LOG_LEVEL=none|info|warn|error|info|warn|info|error  (default: none)
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

const LOG_LEVELS = {
  none: 0,
  info: 1,
  warn: 2,
  error: 3
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

function parseLogLevel(level: string): Set<number> {
  const levels = new Set<number>();

  // Split by | to support multiple levels like "info|warn|error"
  const levelStrings = level.toLowerCase().trim().split('|');

  for (const levelString of levelStrings) {
    const normalizedLevel = levelString.trim() as LogLevel;
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
 * Creates a logger instance with a custom configuration provider.
 * Use this factory when you need to inject your own configuration provider
 * (e.g., for multi-tenant scenarios or testing).
 *
 * @param configProvider - Optional configuration provider. Defaults to the shared default provider.
 * @returns A logger instance that reads log level from the provided configuration.
 *
 * @example
 * // Create a logger with a custom configuration provider
 * const customProvider = new DefaultConfigurationProvider(() =>
 *   new ObservabilityConfiguration({
 *     observabilityLogLevel: () => getCurrentTenantLogLevel()
 *   })
 * );
 * const tenantLogger = createLogger(customProvider);
 * tenantLogger.info('This respects tenant-specific log level');
 */
export function createLogger(
  configProvider: IConfigurationProvider<ObservabilityConfiguration> = defaultObservabilityConfigurationProvider
): Logger {
  const getEnabledLogLevels = (): Set<number> => {
    return parseLogLevel(configProvider.getConfiguration().observabilityLogLevel);
  };

  return {
    info: (message: string, ...args: unknown[]) => {
      if (getEnabledLogLevels().has(LOG_LEVELS.info)) {
        console.log('[INFO]', message, ...args);
      }
    },

    warn: (message: string, ...args: unknown[]) => {
      if (getEnabledLogLevels().has(LOG_LEVELS.warn)) {
        console.warn('[WARN]', message, ...args);
      }
    },

    error: (message: string, ...args: unknown[]) => {
      if (getEnabledLogLevels().has(LOG_LEVELS.error)) {
        console.error('[ERROR]', message, ...args);
      }
    }
  };
}

/**
 * Default logger instance using the shared default configuration provider.
 * For most use cases, import and use this directly.
 *
 * For custom configuration providers, use createLogger() instead.
 */
export const logger: Logger = createLogger();

export default logger;
