// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

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
 * Simple logger for Agent 365 observability
 *
 * Usage:
 *   import logger from './logging';
 *   logger.info('Info message');    // Shows when A365ObservabilityLogLevel includes 'info'
 *   logger.warn('Warning');         // Shows when A365ObservabilityLogLevel includes 'warn'
 *   logger.error('Error');          // Shows when A365ObservabilityLogLevel includes 'error'
 *
 * Environment Variable:
 *   A365ObservabilityLogLevel=none|info|warn|error|info|warn|info|error  (default: none)
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

const enabledLogLevels = parseLogLevel(process.env.A365_OBSERVABILITY_LOG_LEVEL || 'none');

export const logger = {
  info: (message: string, ...args: unknown[]) => {
    if (enabledLogLevels.has(LOG_LEVELS.info)) {
      // eslint-disable-next-line no-console
      console.log('[INFO]', message, ...args);
    }
  },

  warn: (message: string, ...args: unknown[]) => {
    if (enabledLogLevels.has(LOG_LEVELS.warn)) {
      // eslint-disable-next-line no-console
      console.warn('[WARN]', message, ...args);
    }
  },

  error: (message: string, ...args: unknown[]) => {
    if (enabledLogLevels.has(LOG_LEVELS.error)) {
      // eslint-disable-next-line no-console
      console.error('[ERROR]', message, ...args);
    }
  }
};

export default logger;
