import { ExportResult,ExportResultCode } from '@opentelemetry/core';
import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';

import { PowerPlatformApiDiscovery, ClusterCategory } from '@microsoft/agents-a365-runtime';
import { partitionByIdentity, parseIdentityKey, hexTraceId, hexSpanId, kindName, statusName } from './utils';
import logger from './utils';

const DEFAULT_HTTP_TIMEOUT_SECONDS = 30000; // 30 seconds in ms
const DEFAULT_MAX_RETRIES = 3;

interface OTLPExportRequest {
  resourceSpans: ResourceSpan[];
}

interface ResourceSpan {
  resource: {
    attributes: Record<string, any> | null;
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
  attributes: Record<string, any> | null;
  events?: OTLPEvent[] | null;
  links?: OTLPLink[] | null;
  status: OTLPStatus;
}

interface OTLPEvent {
  timeUnixNano: number;
  name: string;
  attributes?: Record<string, any> | null;
}

interface OTLPLink {
  traceId: string;
  spanId: string;
  attributes?: Record<string, any> | null;
}

interface OTLPStatus {
  code: string;
  message?: string;
}

/**
 * Token resolver function type - supports both sync and async implementations
 */
export type TokenResolver = (agentId: string, tenantId: string) => string | null | Promise<string | null>;

/**
 * Observability span exporter for Agent365:
 * - Partitions spans by (tenantId, agentId)
 * - Builds OTLP-like JSON: resourceSpans -> scopeSpans -> spans
 * - POSTs per group to https://{endpoint}/maven/agent365/agents/{agentId}/traces?api-version=1
 * - Adds Bearer token via token_resolver(agentId, tenantId)
 */
export class Agent365Exporter implements SpanExporter {
  private readonly tokenResolver: TokenResolver;
  private readonly clusterCategory: ClusterCategory;
  private closed = false;

  constructor(
    tokenResolver: TokenResolver,
    clusterCategory: ClusterCategory = 'prod'
  ) {
    if (!tokenResolver) {
      throw new Error('token_resolver must be provided.');
    }
    this.tokenResolver = tokenResolver;
    this.clusterCategory = clusterCategory;
  }

  /**
   * Export spans to Agent365 service
   */
  async export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): Promise<void> {
    if (this.closed) {
      logger.warn('Export call failed due to closed exporter');
      resultCallback({ code: ExportResultCode.FAILED });
      return;
    }

    try {
      logger.info(`[export] Starting export of ${spans.length} spans`);
      const groups = partitionByIdentity(spans);

      if (groups.size === 0) {
        logger.info('[export] No spans with valid identity, returning success');
        resultCallback({ code: ExportResultCode.SUCCESS });
        return;
      }

      logger.info(`Exporting ${groups.size} identity groups`);
      let anyFailure = false;
      const promises: Promise<void>[] = [];

      for (const [identityKey, activities] of groups) {
        const promise = this.exportGroup(identityKey, activities).catch((error) => {
          logger.error(`Failed to export group ${identityKey}: ${error}`);
          anyFailure = true;
        });
        promises.push(promise);
      }

      await Promise.all(promises);
      const resultCode = anyFailure ? ExportResultCode.FAILED : ExportResultCode.SUCCESS;
      logger.info(`Export completed with result: ${resultCode === ExportResultCode.SUCCESS ? 'SUCCESS' : 'FAILED'}`);
      resultCallback({
        code: resultCode
      });

    } catch (error) {
      // Exporters should not raise; signal failure
      logger.error(`[export] ]Unexpected error during export: ${error}`);
      resultCallback({ code: ExportResultCode.FAILED });
    }
  }

  /**
   * Export a group of spans for a specific identity
   */
  private async exportGroup(identityKey: string, spans: ReadableSpan[]): Promise<void> {
    const { tenantId, agentId } = parseIdentityKey(identityKey);

    logger.info(`[exportGroup]: Starting export of ${spans.length} spans for agent ${agentId} in tenant ${tenantId}`);

    const payload = this.buildExportRequest(spans);
    const body = JSON.stringify(payload);

    // Resolve endpoint + token
    const discovery = new PowerPlatformApiDiscovery(this.clusterCategory);
    const endpoint = discovery.getTenantIslandClusterEndpoint(tenantId);
    const url = `https://${endpoint}/maven/agent365/agents/${agentId}/traces?api-version=1`;

    logger.info(`Resolving token using endpoint: ${endpoint} for agent ${agentId}`);

    const headers: Record<string, string> = {
      'content-type': 'application/json'
    };

    try {
      const tokenResult = this.tokenResolver(agentId, tenantId);
      const token = tokenResult instanceof Promise ? await tokenResult : tokenResult;
      if (token) {
        headers['authorization'] = `Bearer ${token}`;
        logger.info(`Token resolved successfully for agent ${agentId}`);
      } else {
        logger.warn(`No token available for agent ${agentId}`);
      }
    } catch (error) {
      logger.error(`Token resolution failed for agent ${agentId}: ${error}`);
      throw error;
    }


    // Basic retry loop
    const ok = await this.postWithRetries(url, body, headers);
    if (!ok) {
      logger.error(`Failed to export spans for agent ${agentId} after retries`);
      throw new Error('Failed to export spans after retries');
    }

    logger.info(`Successfully exported ${spans.length} spans for agent ${agentId}`);
  }

  /**
   * HTTP POST with retry logic
   */
  private async postWithRetries(url: string, body: string, headers: Record<string, string>): Promise<boolean> {
    for (let attempt = 0; attempt <= DEFAULT_MAX_RETRIES; attempt++) {
      try {
        logger.info(`[postWithRetries] Export attempt ${attempt + 1}/${DEFAULT_MAX_RETRIES + 1}`);

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(DEFAULT_HTTP_TIMEOUT_SECONDS)
        });

        // 2xx => success
        if (response.status >= 200 && response.status < 300) {
          logger.info(`[postWithRetries] Export successful with status ${response.status}`);
          return true;
        }

        // Retry transient errors
        if ([408, 429].includes(response.status) || (response.status >= 500 && response.status < 600)) {
          logger.warn(`Transient error ${response.status}, retrying( export attempt ${attempt + 1}/${DEFAULT_MAX_RETRIES + 1})`);
          if (attempt < DEFAULT_MAX_RETRIES) {
            const sleepMs = 200 * (attempt + 1);
            logger.info(`Sleeping for ${sleepMs}ms before export retry`);
            await this.sleep(sleepMs);
            continue;
          }
        }

        logger.error(`[postWithRetries] Export failed with non-retryable status ${response.status}`);
        return false;
      } catch (error) {
        logger.error(`HTTP POST error on export attempt ${attempt + 1}: ${error}`);
        if (attempt < DEFAULT_MAX_RETRIES) {
          const sleepMs = 200 * (attempt + 1);
          logger.info(`Sleeping for ${sleepMs}ms before export retry`);
          await this.sleep(sleepMs);
          continue;
        }
        logger.error('[postWithRetries] Export failed after max number of retries');
        return false;
      }
    }
    return false;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Build OTLP export request payload
   */
  private buildExportRequest(spans: ReadableSpan[]): OTLPExportRequest {
    // Group by instrumentation scope (name, version)
    const scopeMap = new Map<string, OTLPSpan[]>();

    for (const sp of spans) {
      const scope = sp.instrumentationScope || (sp as ReadableSpan & { instrumentationLibrary?: { name?: string; version?: string } }).instrumentationLibrary;
      const scopeKey = `${scope?.name || 'unknown'}:${scope?.version || ''}`;

      const existing = scopeMap.get(scopeKey) || [];
      existing.push(this.mapSpan(sp));
      scopeMap.set(scopeKey, existing);
    }

    const scopeSpans: ScopeSpan[] = [];
    for (const [scopeKey, mappedSpans] of scopeMap) {
      const [name, version] = scopeKey.split(':');
      scopeSpans.push({
        scope: {
          name,
          version: version || undefined,
        },
        spans: mappedSpans,
      });
    }

    // Resource attributes (from the first span - all spans in a batch usually share resource)
    let resourceAttrs: Record<string, unknown> = {};
    if (spans.length > 0) {
      const firstSpanResource = spans[0].resource?.attributes;
      if (firstSpanResource) {
        resourceAttrs = { ...firstSpanResource };
      }
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
    logger.info('Shutting down Agent365 exporter');
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
