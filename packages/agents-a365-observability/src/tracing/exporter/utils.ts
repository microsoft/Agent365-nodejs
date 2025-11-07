// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { OpenTelemetryConstants } from '../constants';

/**
 * Convert trace ID to hex string format
 */
export function hexTraceId(value: string | number): string {
  if (typeof value === 'number') {
    // Convert integer to 32 hex chars (128-bit)
    return value.toString(16).padStart(32, '0');
  }
  // Handle hex string input - ensure it's 32 hex characters
  return value.replace(/^0x/, '').padStart(32, '0');
}

/**
 * Convert span ID to hex string format
 */
export function hexSpanId(value: string | number): string {
  if (typeof value === 'number') {
    // Convert integer to 16 hex chars (64-bit)
    return value.toString(16).padStart(16, '0');
  }
  // Handle hex string input - ensure it's 16 hex characters
  return value.replace(/^0x/, '').padStart(16, '0');
}

/**
 * Convert any value to string, handling null/undefined
 */
export function asStr(v: unknown): string | undefined {
  if (v === null || v === undefined) {
    return undefined;
  }
  const s = String(v);
  return s.trim() ? s : undefined;
}

/**
 * Get span kind name from SpanKind enum
 */
export function kindName(kind: SpanKind): string {
  switch (kind) {
  case SpanKind.INTERNAL:
    return 'INTERNAL';
  case SpanKind.SERVER:
    return 'SERVER';
  case SpanKind.CLIENT:
    return 'CLIENT';
  case SpanKind.PRODUCER:
    return 'PRODUCER';
  case SpanKind.CONSUMER:
    return 'CONSUMER';
  default:
    return 'UNSPECIFIED';
  }
}

/**
 * Get status name from SpanStatusCode enum
 */
export function statusName(code: SpanStatusCode): string {
  switch (code) {
  case SpanStatusCode.UNSET:
    return 'UNSET';
  case SpanStatusCode.OK:
    return 'OK';
  case SpanStatusCode.ERROR:
    return 'ERROR';
  default:
    return 'UNSET';
  }
}

/**
 * Partition spans by (tenantId, agentId) identity pairs
 */
export function partitionByIdentity(
  spans: ReadableSpan[]
): Map<string, ReadableSpan[]> {
  const groups = new Map<string, ReadableSpan[]>();

  let skippedCount = 0;
  for (const span of spans) {
    const attrs = span.attributes || {};
    const tenant = asStr(attrs[OpenTelemetryConstants.TENANT_ID_KEY]);
    const agent = asStr(attrs[OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]);

    if (!tenant || !agent) {
      skippedCount++;
      logger.warn(`[Agent365Exporter] Skipping span without tenant or agent ID. Span name: ${span.name}`);
      continue;
    }

    const key = `${tenant}:${agent}`;
    const existing = groups.get(key) || [];
    existing.push(span);
    groups.set(key, existing);
  }

  logger.info(`[Agent365Exporter] Partitioned into ${groups.size} identity groups (${skippedCount} spans skipped)`);
  return groups;
}

/**
 * Check if agent365 exporter is enabled via environment variable
 */
export function isAgent365ExporterEnabled(): boolean {
  const a365Env = process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY_EXPORTER]?.toLowerCase() || '';
  const validValues = ['true', '1', 'yes', 'on'];
  const enabled: boolean = validValues.includes(a365Env);
  logger.info(`[Agent365Exporter] Agent365 exporter enabled: ${enabled}`);
  return enabled;
}


/**
 * Parse identity key back to tenant and agent IDs
 */
export function parseIdentityKey(key: string): { tenantId: string; agentId: string } {
  const [tenantId, agentId] = key.split(':');
  return { tenantId, agentId };
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

/**
 * Simple logger for Agent365 observability
 *
 * Usage:
 *   import logger from './utils';
 *   logger.info('Info message');    // Shows when A365ObservabilityLogLevel = info
 *   logger.warn('Warning');         // Shows when A365ObservabilityLogLevel = info|warn
 *   logger.error('Error');          // Shows when A365ObservabilityLogLevel = info|warn|error
 *
 * Environment Variable:
 *   A365ObservabilityLogLevel=none|info|warn|error  (default: none)
 *   none = no logging (default)
 *   info = info, warn, error messages
 *   warn = warn, error messages only
 *   error = error messages only
 */

const LOG_LEVELS = {
  none: 0,
  info: 1,
  warn: 2,
  error: 3
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

function parseLogLevel(level: string): number {
  const normalizedLevel = level.toLowerCase().trim() as LogLevel;
  return LOG_LEVELS[normalizedLevel] ?? LOG_LEVELS.none;
}

const currentLogLevel = parseLogLevel(process.env.A365_OBSERVABILITY_LOG_LEVEL || 'none');

const logger = {
  info: (message: string, ...args: unknown[]) => {
    if (currentLogLevel === LOG_LEVELS.info) {
      // eslint-disable-next-line no-console
      console.log('[INFO]', message, ...args);
    }
  },

  warn: (message: string, ...args: unknown[]) => {
    if (currentLogLevel === LOG_LEVELS.info || currentLogLevel === LOG_LEVELS.warn) {
      // eslint-disable-next-line no-console
      console.warn('[WARN]', message, ...args);
    }
  },

  error: (message: string, ...args: unknown[]) => {
    if (currentLogLevel === LOG_LEVELS.info || currentLogLevel === LOG_LEVELS.warn || currentLogLevel === LOG_LEVELS.error) {
      // eslint-disable-next-line no-console
      console.error('[ERROR]', message, ...args);
    }
  }
};

export default logger;
