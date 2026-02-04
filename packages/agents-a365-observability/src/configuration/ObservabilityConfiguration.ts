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
    if (result !== undefined) return result;
    return RuntimeConfiguration.parseEnvBoolean(process.env.ENABLE_A365_OBSERVABILITY_EXPORTER);
  }

  get isPerRequestExportEnabled(): boolean {
    const result = this.observabilityOverrides.isPerRequestExportEnabled?.();
    if (result !== undefined) return result;
    return RuntimeConfiguration.parseEnvBoolean(process.env.ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT);
  }

  get useCustomDomainForObservability(): boolean {
    const result = this.observabilityOverrides.useCustomDomainForObservability?.();
    if (result !== undefined) return result;
    return RuntimeConfiguration.parseEnvBoolean(process.env.A365_OBSERVABILITY_USE_CUSTOM_DOMAIN);
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
      ?? RuntimeConfiguration.parseEnvInt(process.env.A365_PER_REQUEST_MAX_TRACES, DEFAULT_MAX_BUFFERED_TRACES);
  }

  get perRequestMaxSpansPerTrace(): number {
    return this.observabilityOverrides.perRequestMaxSpansPerTrace?.()
      ?? RuntimeConfiguration.parseEnvInt(process.env.A365_PER_REQUEST_MAX_SPANS_PER_TRACE, DEFAULT_MAX_SPANS_PER_TRACE);
  }

  get perRequestMaxConcurrentExports(): number {
    return this.observabilityOverrides.perRequestMaxConcurrentExports?.()
      ?? RuntimeConfiguration.parseEnvInt(process.env.A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS, DEFAULT_MAX_CONCURRENT_EXPORTS);
  }
}
