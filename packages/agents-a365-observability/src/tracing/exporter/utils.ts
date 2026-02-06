// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { ClusterCategory } from '@microsoft/agents-a365-runtime';
import { OpenTelemetryConstants } from '../constants';
import logger from '../../utils/logging';
import { ExporterEventNames } from './ExporterEventNames';

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
      continue;
    }

    const key = `${tenant}:${agent}`;
    const existing = groups.get(key) || [];
    existing.push(span);
    groups.set(key, existing);
  }

  if(skippedCount > 0) {
    logger.event(ExporterEventNames.EXPORT_PARTITION_SPAN_MISSING_IDENTITY, false, 0, `${skippedCount} spans are skipped due to missing tenant or agent ID`);
  }

  logger.info(`[Agent365Exporter] Partitioned into ${groups.size} identity groups (${skippedCount} spans skipped)`);
  return groups;
}

/**
 * Check if Agent 365 exporter is enabled via environment variable
 */
export function isAgent365ExporterEnabled(): boolean {
  const a365Env = process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY_EXPORTER]?.toLowerCase() || '';
  const validValues = ['true', '1', 'yes', 'on'];
  const enabled: boolean = validValues.includes(a365Env);
  logger.info(`[Agent365Exporter] Agent 365 exporter enabled: ${enabled}`);
  return enabled;
}

/**
 * Check if per-request export is enabled via environment variable.
 * When enabled, the PerRequestSpanProcessor is used instead of BatchSpanProcessor.
 * The token is passed via OTel Context (async local storage) at export time.
 */
export function isPerRequestExportEnabled(): boolean {
  const value = process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT]?.toLowerCase() || '';
  const validValues = ['true', '1', 'yes', 'on'];
  const enabled: boolean = validValues.includes(value);
  logger.info(`[Agent365Exporter] Per-request export enabled: ${enabled}`);
  return enabled;
}

/**
 * Single toggle to use custom domain for observability export.
 * When true exporter will send traces to custom Agent365 service endpoint
 * and include x-ms-tenant-id in headers.
 */
export function useCustomDomainForObservability(): boolean {
  const value = process.env.A365_OBSERVABILITY_USE_CUSTOM_DOMAIN?.toLowerCase() || '';
  const validValues = ['true', '1', 'yes', 'on'];
  const enabled = validValues.includes(value);
  logger.info(`[Agent365Exporter] Use custom domain for observability: ${enabled}`);
  return enabled;
}

/**
 * Resolve the Agent365 service endpoint base URI for a given cluster category.
 * When an explicit override is not configured, this determines the default base URI.
 */
export function resolveAgent365Endpoint(clusterCategory: ClusterCategory): string {
  switch (clusterCategory) {
  case 'prod':
  default:
    return 'https://agent365.svc.cloud.microsoft';
  }
}

/**
 * Get Agent365 Observability domain override.
 * Internal development and test clusters can override this by setting the
 * `A365_OBSERVABILITY_DOMAIN_OVERRIDE` environment variable. When set to a
 * non-empty value, that value is used as the base URI regardless of cluster category. Otherwise, null is returned.
 */
export function getAgent365ObservabilityDomainOverride(): string | null {
  const override = process.env.A365_OBSERVABILITY_DOMAIN_OVERRIDE;

  if (override && override.trim().length > 0) {
    // Normalize to avoid double slashes when concatenating paths
    return override.trim().replace(/\/+$/, '');
  }
  return null;
}


/**
 * Parse identity key back to tenant and agent IDs
 */
export function parseIdentityKey(key: string): { tenantId: string; agentId: string } {
  const [tenantId, agentId] = key.split(':');
  return { tenantId, agentId };
}


