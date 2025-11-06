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

  for (const span of spans) {
    const attrs = span.attributes || {};
    const tenant = asStr(attrs[OpenTelemetryConstants.TENANT_ID_KEY]);
    const agent = asStr(attrs[OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]);

    if (!tenant || !agent) {
      continue;
    }

    const key = `${tenant}:${agent}`;
    const existing = groups.get(key) || [];
    existing.push(span);
    groups.set(key, existing);
  }

  return groups;
}

/**
 * Check if agent365 exporter is enabled via environment variable
 */
export function isAgent365ExporterEnabled(): boolean {
  const a365Env = process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY_EXPORTER]?.toLowerCase() || '';
  const validValues = ['true', '1', 'yes', 'on'];
  return validValues.includes(a365Env);
}


/**
 * Parse identity key back to tenant and agent IDs
 */
export function parseIdentityKey(key: string): { tenantId: string; agentId: string } {
  const [tenantId, agentId] = key.split(':');
  return { tenantId, agentId };
}

/**
 * Simple logger that checks environment variables
 *
 * Usage:
 *   import logger from './logger';
 *   logger.info('Info message');    // Shows when LOG_LEVEL=info
 *   logger.warn('Warning');         // Shows when LOG_LEVEL=warn
 *   logger.error('Error');          // Shows when LOG_LEVEL=error
 *
 * Environment Variables:
 *   LOG_LEVEL=info|warn|error  (default: info)
 *   ENABLE_LOGS=true  (to enable logging, disabled by default)
 */

const LOG_LEVELS = {
  info: 1,
  warn: 2,
  error: 3
} as const;

type LogLevelKey = keyof typeof LOG_LEVELS;

const isEnabled = process.env.ENABLE_LOGS === 'true';
const currentLogLevel = (process.env.LOG_LEVEL?.toLowerCase() as LogLevelKey) || 'info';
const levelValue = LOG_LEVELS[currentLogLevel] ?? LOG_LEVELS.info;

const logger = {
  info: (message: string, ...args: unknown[]) => {
    if (isEnabled && LOG_LEVELS.info >= levelValue) {
      // eslint-disable-next-line no-console
      console.log('[INFO]', message, ...args);
    }
  },

  warn: (message: string, ...args: unknown[]) => {
    if (isEnabled && LOG_LEVELS.warn >= levelValue) {
      // eslint-disable-next-line no-console
      console.warn('[WARN]', message, ...args);
    }
  },

  error: (message: string, ...args: unknown[]) => {
    if (isEnabled && LOG_LEVELS.error >= levelValue) {
      // eslint-disable-next-line no-console
      console.error('[ERROR]', message, ...args);
    }
  }
};

export default logger;
