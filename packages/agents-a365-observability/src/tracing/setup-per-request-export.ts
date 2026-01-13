// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { PerRequestSpanProcessor, DEFAULT_FLUSH_GRACE_MS, DEFAULT_MAX_TRACE_AGE_MS } from './PerRequestSpanProcessor';
import { Agent365Exporter } from './exporter/Agent365Exporter';
import { Agent365ExporterOptions } from './exporter/Agent365ExporterOptions';
import { getExportToken } from './context/token-context';

/**
 * Setup tracing with a toggle:
 * - When options.enablePerRequestContextToken is true:
 *    - Register PerRequestSpanProcessor (per trace export)
 *    - Read token from OTel Context at export time (zero storage)
 * - When false:
 *    - Register BatchSpanProcessor using the batching options
 *    - Expect tokenResolver to be provided explicitly in options
 */
export function setupTracing(configure?: (opts: Agent365ExporterOptions) => void) {
  const opts = new Agent365ExporterOptions();
  if (configure) configure(opts);

  const resolver = opts.enablePerRequestContextToken
    ? (() => getExportToken() ?? null)
    : opts.tokenResolver;

  if (!resolver) {
    throw new Error('Agent365ExporterOptions.tokenResolver must be provided when enablePerRequestContextToken is false');
  }

  opts.tokenResolver = resolver;

  const exporter = new Agent365Exporter(opts);

  const spanProcessor = opts.enablePerRequestContextToken
    ? new PerRequestSpanProcessor(exporter, DEFAULT_FLUSH_GRACE_MS, DEFAULT_MAX_TRACE_AGE_MS)
    : new BatchSpanProcessor(exporter, {
        maxQueueSize: opts.maxQueueSize,
        scheduledDelayMillis: opts.scheduledDelayMilliseconds,
        exportTimeoutMillis: opts.exporterTimeoutMilliseconds,
        maxExportBatchSize: opts.maxExportBatchSize,
      });

  const provider = new NodeTracerProvider({
    spanProcessors: [spanProcessor],
  });

  provider.register();
  return provider;
}
