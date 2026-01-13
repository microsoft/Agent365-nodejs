// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { PerRequestSpanProcessor } from './PerRequestSpanProcessor';
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
  const provider = new NodeTracerProvider();

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

  if (opts.enablePerRequestContextToken) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (provider as any).addSpanProcessor(new PerRequestSpanProcessor(exporter, 250, 30000));
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (provider as any).addSpanProcessor(new BatchSpanProcessor(exporter, {
      maxQueueSize: opts.maxQueueSize,
      scheduledDelayMillis: opts.scheduledDelayMilliseconds,
      exportTimeoutMillis: opts.exporterTimeoutMilliseconds,
      maxExportBatchSize: opts.maxExportBatchSize,
    }));
  }

  provider.register();
  return provider;
}
