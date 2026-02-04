// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { RuntimeConfiguration } from '@microsoft/agents-a365-runtime';
import { ObservabilityConfigurationOptions } from './ObservabilityConfigurationOptions';

// Default constants
const PROD_OBSERVABILITY_SCOPE = 'https://api.powerplatform.com/.default';
const DEFAULT_MAX_BUFFERED_TRACES = 1000;
const DEFAULT_MAX_SPANS_PER_TRACE = 5000;
const DEFAULT_MAX_CONCURRENT_EXPORTS = 20;

/**
 * Parse an environment variable as an integer, returning fallback if invalid or not set.
 */
function parseEnvInt(envValue: string | undefined, fallback: number): number {
  if (!envValue) return fallback;
  const parsed = parseInt(envValue, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Configuration for observability package.
 * Inherits runtime settings and adds observability-specific settings.
 */
export class ObservabilityConfiguration extends RuntimeConfiguration {
  protected get observabilityOverrides(): ObservabilityConfigurationOptions {
    return this.overrides as ObservabilityConfigurationOptions;
  }

  constructor(overrides?: ObservabilityConfigurationOptions) {
    super(overrides);
  }

  // Inherited: clusterCategory, isDevelopmentEnvironment, isNodeEnvDevelopment

  /**
   * Gets the observability authentication scopes.
   * Used by AgenticTokenCache for observability service authentication.
   */
  get observabilityAuthenticationScopes(): readonly string[] {
    const result = this.observabilityOverrides.observabilityAuthenticationScopes?.();
    if (result !== undefined) {
      return result;
    }
    const override = process.env.A365_OBSERVABILITY_SCOPES_OVERRIDE;
    if (override?.trim()) {
      return override.trim().split(/\s+/);
    }
    return [PROD_OBSERVABILITY_SCOPE];
  }

  get isObservabilityExporterEnabled(): boolean {
    const result = this.observabilityOverrides.isObservabilityExporterEnabled?.();
    if (result !== undefined) {
      return result;
    }
    const value = process.env.ENABLE_A365_OBSERVABILITY_EXPORTER?.toLowerCase() ?? '';
    return ['true', '1', 'yes', 'on'].includes(value);
  }

  get isPerRequestExportEnabled(): boolean {
    const result = this.observabilityOverrides.isPerRequestExportEnabled?.();
    if (result !== undefined) {
      return result;
    }
    const value = process.env.ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT?.toLowerCase() ?? '';
    return ['true', '1', 'yes', 'on'].includes(value);
  }

  get useCustomDomainForObservability(): boolean {
    const result = this.observabilityOverrides.useCustomDomainForObservability?.();
    if (result !== undefined) {
      return result;
    }
    const value = process.env.A365_OBSERVABILITY_USE_CUSTOM_DOMAIN?.toLowerCase() ?? '';
    return ['true', '1', 'yes', 'on'].includes(value);
  }

  get observabilityDomainOverride(): string | null {
    const result = this.observabilityOverrides.observabilityDomainOverride?.();
    if (result !== undefined) {
      return result;
    }
    const override = process.env.A365_OBSERVABILITY_DOMAIN_OVERRIDE;
    if (override?.trim()) {
      return override.trim().replace(/\/+$/, '');
    }
    return null;
  }

  get observabilityLogLevel(): string {
    return this.observabilityOverrides.observabilityLogLevel?.()
      ?? process.env.A365_OBSERVABILITY_LOG_LEVEL
      ?? 'none';
  }

  // Per-Request Processor settings
  get perRequestMaxTraces(): number {
    return this.observabilityOverrides.perRequestMaxTraces?.()
      ?? parseEnvInt(process.env.A365_PER_REQUEST_MAX_TRACES, DEFAULT_MAX_BUFFERED_TRACES);
  }

  get perRequestMaxSpansPerTrace(): number {
    return this.observabilityOverrides.perRequestMaxSpansPerTrace?.()
      ?? parseEnvInt(process.env.A365_PER_REQUEST_MAX_SPANS_PER_TRACE, DEFAULT_MAX_SPANS_PER_TRACE);
  }

  get perRequestMaxConcurrentExports(): number {
    return this.observabilityOverrides.perRequestMaxConcurrentExports?.()
      ?? parseEnvInt(process.env.A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS, DEFAULT_MAX_CONCURRENT_EXPORTS);
  }
}
