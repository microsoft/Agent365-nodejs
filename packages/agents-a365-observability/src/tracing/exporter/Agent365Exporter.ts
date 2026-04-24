// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { ExportResult, ExportResultCode } from '@opentelemetry/core';
import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';

import { ClusterCategory, IConfigurationProvider } from '@microsoft/agents-a365-runtime';
import type { ObservabilityConfiguration } from '../../configuration';
import {
  partitionByIdentity,
  parseIdentityKey,
  hexTraceId,
  hexSpanId,
  kindName,
  statusName,
  resolveAgent365Endpoint,
  getAgent365ObservabilityDomainOverride,
  isPerRequestExportEnabled,
  truncateSpan,
  estimateSpanBytes,
  chunkBySize,
} from './utils';
import { getExportToken } from '../context/token-context';
import logger, { formatError } from '../../utils/logging';
import { Agent365ExporterOptions } from './Agent365ExporterOptions';
import { ExporterEventNames } from './ExporterEventNames';

const DEFAULT_MAX_RETRIES = 3;

interface OTLPExportRequest {
  resourceSpans: ResourceSpan[];
}

interface ResourceSpan {
  resource: {
    attributes: Record<string, unknown> | null;
  };
  scopeSpans: ScopeSpan[];
}

interface ScopeSpan {
  scope: {
    name: string;
    version?: string;
  };
  spans: OTLPSpan[];
}

interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: string;
  startTimeUnixNano: number;
  endTimeUnixNano: number;
  attributes: Record<string, unknown> | null;
  events?: OTLPEvent[] | null;
  links?: OTLPLink[] | null;
  status: OTLPStatus;
}

interface OTLPEvent {
  timeUnixNano: number;
  name: string;
  attributes?: Record<string, unknown> | null;
}

interface OTLPLink {
  traceId: string;
  spanId: string;
  attributes?: Record<string, unknown> | null;
}

interface OTLPStatus {
  code: string;
  message?: string;
}

interface MappedSpan {
  span: OTLPSpan;
  scopeKey: string;
  scopeName: string;
  scopeVersion?: string;
}

/**
 * Observability span exporter for Agent365:
 * - Partitions spans by (tenantId, agentId)
 * - Builds OTLP-like JSON: resourceSpans -> scopeSpans -> spans
 * - POSTs per group to https://{endpoint}/observability/tenants/{tenantId}/otlp/agents/{agentId}/traces?api-version=1
 *   or, when useS2SEndpoint is true, https://{endpoint}/observabilityService/tenants/{tenantId}/otlp/agents/{agentId}/traces?api-version=1
 * - Adds Bearer token via token_resolver(agentId, tenantId)
 */
export class Agent365Exporter implements SpanExporter {
  private closed = false;
  private readonly options: Agent365ExporterOptions;
  private readonly configProvider?: IConfigurationProvider<ObservabilityConfiguration>;

  /**
   * Initialize exporter with a fully constructed options instance.
   * @param options Exporter options controlling batching, timeouts, token acquisition and endpoint shape.
   * @param configProvider Optional configuration provider. When supplied, the exporter uses it for
   *        configuration lookups (custom domain, domain override) instead of the default env-based provider.
   */
  constructor(options: Agent365ExporterOptions, configProvider?: IConfigurationProvider<ObservabilityConfiguration>) {
    if (!options) {
      throw new Error('Agent365ExporterOptions must be provided (was null/undefined)');
    }

    if (!isPerRequestExportEnabled() && !options.tokenResolver) {
      throw new Error('Agent365Exporter tokenResolver must be provided for batch export');
    }
    this.options = options;
    this.configProvider = configProvider;
  }

  /**
   * Export spans to Agent365 service
   */
  async export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): Promise<void> {
    if (this.closed) {
      resultCallback({ code: ExportResultCode.FAILED });
      return;
    }

    const startTime = Date.now();

    try {
      logger.info(`[Agent365Exporter] Exporting ${spans.length} spans`);
      const groups = partitionByIdentity(spans);

      if (groups.size === 0) {
        logger.info('[Agent365Exporter] No groups to export');
        resultCallback({ code: ExportResultCode.SUCCESS });
        return;
      }

      logger.info(`[Agent365Exporter] Exporting ${groups.size} identity groups`);
      let anyFailure = false;
      const promises: Promise<void>[] = [];

      for (const [identityKey, activities] of groups) {
        const promise = this.exportGroup(identityKey, activities).catch((err) => {
          anyFailure = true;
          logger.error(`[Agent365Exporter] Error exporting group ${identityKey}: ${formatError(err)}`);
        });
        promises.push(promise);
      }

      await Promise.all(promises);
      const duration = Date.now() - startTime;
      const success = !anyFailure;
      const message = success ? 'All spans exported successfully' : 'Not all spans exported successfully';
      logger.event(ExporterEventNames.EXPORT, success, duration, message);
      resultCallback({
        code: success ? ExportResultCode.SUCCESS : ExportResultCode.FAILED
      });

    } catch (_error) {
      // Exporters should not raise; signal failure
      const duration = Date.now() - startTime;
      logger.event(ExporterEventNames.EXPORT, false, duration, `Export failed with error: ${formatError(_error)}`);
      resultCallback({ code: ExportResultCode.FAILED });
    }
  }

  /**
   * Export a group of spans for a specific identity
   */
  private async exportGroup(identityKey: string, spans: ReadableSpan[]): Promise<void> {
    const { tenantId, agentId } = parseIdentityKey(identityKey);
    logger.info(`[Agent365Exporter] Exporting ${spans.length} spans for tenantId: ${tenantId}, agentId: ${agentId}`);

    const startTime = Date.now();

    // Map, truncate, and chunk spans by estimated byte size
    const mappedSpans = this.mapAndTruncateSpans(spans);
    const resourceAttrs = this.getResourceAttributes(spans);
    const chunks = chunkBySize(
      mappedSpans,
      (ms) => estimateSpanBytes(ms.span),
      this.options.maxPayloadBytes,
    );

    if (chunks.length > 1) {
      logger.info(`[Agent365Exporter] Split ${spans.length} spans into ${chunks.length} chunks for tenantId: ${tenantId}, agentId: ${agentId}`);
    }

    // Select endpoint path based on S2S flag (includes tenantId in path)
    const servicePrefix = this.options.useS2SEndpoint ? '/observabilityService' : '/observability';
    const endpointRelativePath = `${servicePrefix}/tenants/${encodeURIComponent(tenantId)}/otlp/agents/${encodeURIComponent(agentId)}/traces`;

    let url: string;
    const domainOverride = getAgent365ObservabilityDomainOverride(this.configProvider);
    if (domainOverride) {
      url = `${domainOverride}${endpointRelativePath}?api-version=1`;
    } else {
      const base = resolveAgent365Endpoint(this.options.clusterCategory as ClusterCategory);
      url = `${base}${endpointRelativePath}?api-version=1`;
      logger.info(`[Agent365Exporter] Using default endpoint: ${url}`);
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json'
    };

    let token: string | null = null;
    let tokenNotResolvedReason: string | null = null;
    if (isPerRequestExportEnabled()) {
      // For per-request export, get token from OTel Context
      token = getExportToken() ?? null;
      if (!token) {
        tokenNotResolvedReason = 'No token available in OTel Context for per-request export';
      }
    } else {
      // For batch export, use tokenResolver
      if (!this.options.tokenResolver) {
        tokenNotResolvedReason = 'tokenResolver is undefined';
      } else {
        const tokenResult = this.options.tokenResolver(agentId, tenantId);
        token = tokenResult instanceof Promise ? await tokenResult : tokenResult;
        if (token) {
          logger.info('[Agent365Exporter] Token resolved successfully via tokenResolver');
        } else {
          tokenNotResolvedReason = 'No token resolved via tokenResolver';
        }
      }
    }

    if (token) {
      headers['authorization'] = `Bearer ${token}`;
    }
    else {
      const skipReason = tokenNotResolvedReason || 'Token not resolved for export request';
      logger.event(ExporterEventNames.EXPORT_GROUP, false, 0, `skip exporting: ${skipReason}`, { tenantId, agentId });
      return;
    }

    // Always include tenant id header
    headers['x-ms-tenant-id'] = tenantId;

    // Send each chunk (all-or-nothing: fail on first chunk failure)
    let lastCorrelationId = 'unknown';
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const payload = this.buildEnvelope(chunk, resourceAttrs);
      const body = JSON.stringify(payload);
      const bodyBytes = Buffer.byteLength(body, 'utf8');
      logger.info(`[Agent365Exporter] Sending chunk ${i + 1} of ${chunks.length} (${chunk.length} spans, ${bodyBytes} bytes)`);

      const { ok, correlationId } = await this.postWithRetries(url, body, headers);
      lastCorrelationId = correlationId;
      if (!ok) {
        const duration = Date.now() - startTime;
        logger.event(ExporterEventNames.EXPORT_GROUP, false, duration, `chunk ${i + 1} of ${chunks.length} failed`, { tenantId, agentId, correlationId });
        throw new Error(`Failed to export spans (chunk ${i + 1} of ${chunks.length})`);
      }
    }

    const duration = Date.now() - startTime;
    logger.event(ExporterEventNames.EXPORT_GROUP, true, duration, `${chunks.length} chunk(s) exported successfully`, { tenantId, agentId, correlationId: lastCorrelationId });
  }

  /**
   * HTTP POST with retry logic
   */
  private async postWithRetries(url: string, body: string, headers: Record<string, string>): Promise<{ ok: boolean; correlationId: string }> {
    let lastCorrelationId = 'unknown';
    for (let attempt = 0; attempt <= DEFAULT_MAX_RETRIES; attempt++) {
      let correlationId: string;
      try {
        logger.info(`[Agent365Exporter] Posting OTLP export request - Attempt ${attempt + 1}`);
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(this.options.httpRequestTimeoutMilliseconds)
        });

        correlationId = response?.headers?.get('x-ms-correlation-id') || response?.headers?.get('x-correlation-id') || 'unknown';
        lastCorrelationId = correlationId;
        
        // 2xx => success
        if (response.status >= 200 && response.status < 300) {
          return { ok: true, correlationId };
        }

        // Retry transient errors
        if ([408, 429].includes(response.status) || (response.status >= 500 && response.status < 600)) {
          if (attempt < DEFAULT_MAX_RETRIES) {
            const sleepMs = 200 * (attempt + 1) + Math.floor(Math.random() * 100);
            logger.warn(`[Agent365Exporter] Transient error ${response.status}, correlation ID: ${correlationId}, retrying after ${sleepMs}ms`);
            await this.sleep(sleepMs);
            continue;
          }
        }
        logger.error(`[Agent365Exporter] Failed with status ${response.status}, correlation ID: ${correlationId}`);
        return { ok: false, correlationId };
      } catch (error) {
        logger.error('[Agent365Exporter] Request error:', formatError(error));
        if (attempt < DEFAULT_MAX_RETRIES) {
          const sleepMs = 200 * (attempt + 1);
          logger.info(`[Agent365Exporter] Retrying after ${sleepMs}ms`);
          await this.sleep(sleepMs);
          continue;
        }
        return { ok: false, correlationId: lastCorrelationId };
      }
    }
    return { ok: false, correlationId: lastCorrelationId };
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Map ReadableSpans to OTLP format and apply per-span truncation.
   */
  private mapAndTruncateSpans(spans: ReadableSpan[]): MappedSpan[] {
    logger.info('[Agent365Exporter] Mapping and truncating spans');
    return spans.map(sp => {
      const scope = sp.instrumentationScope || (sp as ReadableSpan & { instrumentationLibrary?: { name?: string; version?: string } }).instrumentationLibrary;
      const scopeName = scope?.name || 'unknown';
      const scopeVersion = scope?.version || '';
      return {
        span: truncateSpan(this.mapSpan(sp)),
        scopeKey: `${scopeName}:${scopeVersion}`,
        scopeName,
        scopeVersion: scopeVersion || undefined,
      };
    });
  }

  /**
   * Extract resource attributes from the first span in the batch.
   */
  private getResourceAttributes(spans: ReadableSpan[]): Record<string, unknown> {
    if (spans.length > 0 && spans[0].resource?.attributes) {
      return { ...spans[0].resource.attributes };
    }
    return {};
  }

  /**
   * Build an OTLP export request envelope from pre-mapped spans.
   */
  private buildEnvelope(mappedSpans: MappedSpan[], resourceAttrs: Record<string, unknown>): OTLPExportRequest {
    const scopeMap = new Map<string, OTLPSpan[]>();
    for (const ms of mappedSpans) {
      const existing = scopeMap.get(ms.scopeKey) || [];
      existing.push(ms.span);
      scopeMap.set(ms.scopeKey, existing);
    }

    const scopeSpans: ScopeSpan[] = [];
    for (const [scopeKey, spans] of scopeMap) {
      const [name, version] = scopeKey.split(':');
      scopeSpans.push({
        scope: {
          name,
          version: version || undefined,
        },
        spans,
      });
    }

    return {
      resourceSpans: [
        {
          resource: { attributes: Object.keys(resourceAttrs).length > 0 ? resourceAttrs : null },
          scopeSpans,
        }
      ]
    };
  }

  /**
   * Map a ReadableSpan to OTLP span format
   */
  private mapSpan(sp: ReadableSpan): OTLPSpan {
    const spanContext = sp.spanContext();

    // Extract parent span ID - check multiple possible sources
    let parentSpanIdHex: string | undefined = undefined;
    const parentContext = sp.parentSpanContext;
    if (parentContext?.spanId && parentContext.spanId !== '0000000000000000') {
      parentSpanIdHex = hexSpanId(parentContext.spanId);
    }

    // attributes
    const attrs = sp.attributes ? { ...sp.attributes } : {};

    // events
    const events: OTLPEvent[] = [];
    for (const ev of sp.events || []) {
      // Handle both hrtime arrays and direct nanosecond timestamps
      let timeNs: number;
      if (Array.isArray(ev.time)) {
        timeNs = ev.time[0] * 1000000000 + ev.time[1];
      } else {
        timeNs = ev.time as number;
      }

      const evAttrs = ev.attributes && Object.keys(ev.attributes).length > 0 ? { ...ev.attributes } : null;
      events.push({
        timeUnixNano: timeNs,
        name: ev.name,
        attributes: evAttrs,
      });
    }

    // links
    const links: OTLPLink[] = [];
    for (const ln of sp.links || []) {
      const lnAttrs = ln.attributes && Object.keys(ln.attributes).length > 0 ? { ...ln.attributes } : null;
      links.push({
        traceId: hexTraceId(ln.context.traceId),
        spanId: hexSpanId(ln.context.spanId),
        attributes: lnAttrs,
      });
    }

    // status
    const statusCode = sp.status?.code ?? 0; // Default to UNSET (0) if no status
    const status: OTLPStatus = {
      code: statusName(statusCode),
      message: sp.status?.message || '',
    };

    // Convert hrtime to nanoseconds - handle both hrtime arrays and direct nanosecond values
    let startTimeNs: number;
    let endTimeNs: number;

    if (Array.isArray(sp.startTime)) {
      // hrtime format [seconds, nanoseconds]
      startTimeNs = sp.startTime[0] * 1000000000 + sp.startTime[1];
    } else {
      // Direct nanosecond value
      startTimeNs = sp.startTime as number;
    }

    if (Array.isArray(sp.endTime)) {
      // hrtime format [seconds, nanoseconds]
      endTimeNs = sp.endTime[0] * 1000000000 + sp.endTime[1];
    } else {
      // Direct nanosecond value
      endTimeNs = sp.endTime as number;
    }

    return {
      traceId: hexTraceId(spanContext.traceId),
      spanId: hexSpanId(spanContext.spanId),
      parentSpanId: parentSpanIdHex,
      name: sp.name,
      kind: kindName(sp.kind),
      startTimeUnixNano: startTimeNs,
      endTimeUnixNano: endTimeNs,
      attributes: Object.keys(attrs).length > 0 ? attrs : null,
      events: events.length > 0 ? events : null,
      links: links.length > 0 ? links : null,
      status,
    };
  }

  /**
   * Shutdown the exporter
   */
  async shutdown(): Promise<void> {
    logger.info('[Agent365Exporter] Shutting down exporter');
    this.closed = true;
  }

  /**
   * Force flush any pending spans
   */
  async forceFlush(): Promise<void> {
    // No-op for this implementation
    return Promise.resolve();
  }
}
