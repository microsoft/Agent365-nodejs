// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { RuntimeConfiguration } from '@microsoft/agents-a365-runtime';
import { ObservabilityConfiguration } from './ObservabilityConfiguration';
import { PerRequestSpanProcessorConfigurationOptions } from './PerRequestSpanProcessorConfigurationOptions';

/** Guardrails to prevent unbounded memory growth / export bursts. Used for PerRequestSpanProcessor only. */
const DEFAULT_MAX_BUFFERED_TRACES = 1000;
const DEFAULT_MAX_SPANS_PER_TRACE = 5000;
const DEFAULT_MAX_CONCURRENT_EXPORTS = 20;

/**
 * Configuration for PerRequestSpanProcessor.
 * Inherits all observability and runtime settings, and adds per-request processor guardrails.
 *
 * This is separated from ObservabilityConfiguration because PerRequestSpanProcessor
 * is used only in specific scenarios and these settings should not be exposed
 * in the common ObservabilityConfiguration.
 */
export class PerRequestSpanProcessorConfiguration extends ObservabilityConfiguration {
  protected get perRequestOverrides(): PerRequestSpanProcessorConfigurationOptions {
    return this.overrides as PerRequestSpanProcessorConfigurationOptions;
  }

  constructor(overrides?: PerRequestSpanProcessorConfigurationOptions) {
    super(overrides);
  }

  // Inherited: clusterCategory, isDevelopmentEnvironment, isNodeEnvDevelopment,
  // observabilityAuthenticationScopes, isObservabilityExporterEnabled,
  // useCustomDomainForObservability, observabilityDomainOverride, observabilityLogLevel

  get isPerRequestExportEnabled(): boolean {
    const result = this.perRequestOverrides.isPerRequestExportEnabled?.();
    if (result !== undefined) return result;
    return RuntimeConfiguration.parseEnvBoolean(process.env.ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT);
  }

  get perRequestMaxTraces(): number {
    const value = this.perRequestOverrides.perRequestMaxTraces?.()
      ?? RuntimeConfiguration.parseEnvInt(process.env.A365_PER_REQUEST_MAX_TRACES, DEFAULT_MAX_BUFFERED_TRACES);
    return value > 0 ? value : DEFAULT_MAX_BUFFERED_TRACES;
  }

  get perRequestMaxSpansPerTrace(): number {
    const value = this.perRequestOverrides.perRequestMaxSpansPerTrace?.()
      ?? RuntimeConfiguration.parseEnvInt(process.env.A365_PER_REQUEST_MAX_SPANS_PER_TRACE, DEFAULT_MAX_SPANS_PER_TRACE);
    return value > 0 ? value : DEFAULT_MAX_SPANS_PER_TRACE;
  }

  get perRequestMaxConcurrentExports(): number {
    const value = this.perRequestOverrides.perRequestMaxConcurrentExports?.()
      ?? RuntimeConfiguration.parseEnvInt(process.env.A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS, DEFAULT_MAX_CONCURRENT_EXPORTS);
    return value > 0 ? value : DEFAULT_MAX_CONCURRENT_EXPORTS;
  }
}
