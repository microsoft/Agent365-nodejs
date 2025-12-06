// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { ClusterCategory } from '@microsoft/agents-a365-runtime';
/**
 * A function that resolves and returns an authentication token for the given agent and tenant.
 * Implementations may perform synchronous lookup (e.g., in-memory cache) or asynchronous network calls.
 * Return null if a token cannot be provided; exporter will log and proceed without an authorization header.
 */
export type TokenResolver = (agentId: string, tenantId: string) => string | null | Promise<string | null>;

/**
 * Options controlling the behavior of the Agent365 OpenTelemetry span exporter.
 *
 * These values tune batching, timeouts, token acquisition and endpoint shape. All properties have sensible
 * defaults so callers can usually construct without arguments and override selectively.
 *
 * @property {ClusterCategory | string} clusterCategory Environment / cluster category (e.g. "preprod", "prod", default to "prod").
 * @property {TokenResolver} [tokenResolver] Optional delegate to obtain an auth token. If omitted the exporter will
 *           fall back to reading the cached token (AgenticTokenCacheInstance.getObservabilityToken).
 * @property {number} maxQueueSize Maximum span queue size before drops occur (passed to BatchSpanProcessor).
 * @property {number} scheduledDelayMilliseconds Delay between automatic batch flush attempts.
 * @property {number} exporterTimeoutMilliseconds Per-export timeout (abort if exceeded).
 * @property {number} maxExportBatchSize Maximum number of spans per export batch.
 */
export class Agent365ExporterOptions {
  /** Environment / cluster category (e.g. "preprod", "prod"). */
  public clusterCategory: ClusterCategory | string = 'prod';

  /** Optional delegate to resolve auth token used by exporter. Required to send telemetry to Agent365 service; if not provided, telemetry is logged to console. */
  public tokenResolver?: TokenResolver;

  /** Maximum span queue size before new spans are dropped. */
  public maxQueueSize: number = 2048;

  /** Delay (ms) between automatic batch flush attempts. */
  public scheduledDelayMilliseconds: number = 5000;

  /** Per-export timeout in milliseconds. */
  public exporterTimeoutMilliseconds: number = 30000;

  /** Maximum number of spans per export batch. */
  public maxExportBatchSize: number = 512;
}
