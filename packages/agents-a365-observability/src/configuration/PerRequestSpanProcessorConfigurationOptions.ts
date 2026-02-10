// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { RuntimeConfigurationOptions } from '@microsoft/agents-a365-runtime';

/**
 * Configuration options for PerRequestSpanProcessor - extends observability options.
 * All overrides are functions called on each property access.
 *
 * Inherited from ObservabilityConfigurationOptions:
 * - observabilityAuthenticationScopes, isObservabilityExporterEnabled,
 *   useCustomDomainForObservability, observabilityDomainOverride, observabilityLogLevel
 *
 * Inherited from RuntimeConfigurationOptions:
 * - clusterCategory, isDevelopmentEnvironment, isNodeEnvDevelopment
 */
export type PerRequestSpanProcessorConfigurationOptions = RuntimeConfigurationOptions & {
  /**
   * Override to enable/disable per-request export mode.
   * When enabled, spans are buffered per-request and exported when the request completes,
   * rather than using a batch processor.
   *
   * @returns `true` to enable per-request export, `false` for batch export.
   * @envvar ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT - 'true', '1', 'yes', 'on' to enable.
   * @default false
   */
  isPerRequestExportEnabled?: () => boolean;

  /**
   * Override for maximum number of traces to buffer in per-request export mode.
   * When this limit is reached, oldest traces are dropped.
   * Values <= 0 are ignored and the default is used.
   *
   * @returns Maximum number of buffered traces.
   * @envvar A365_PER_REQUEST_MAX_TRACES
   * @default 1000
   */
  perRequestMaxTraces?: () => number;

  /**
   * Override for maximum number of spans per trace in per-request export mode.
   * Traces with more spans than this limit will have excess spans dropped.
   * Values <= 0 are ignored and the default is used.
   *
   * @returns Maximum spans per trace.
   * @envvar A365_PER_REQUEST_MAX_SPANS_PER_TRACE
   * @default 5000
   */
  perRequestMaxSpansPerTrace?: () => number;

  /**
   * Override for maximum concurrent export operations in per-request export mode.
   * Limits the number of parallel HTTP requests to the observability service.
   * Values <= 0 are ignored and the default is used.
   *
   * @returns Maximum concurrent exports.
   * @envvar A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS
   * @default 20
   */
  perRequestMaxConcurrentExports?: () => number;
};
