// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { RuntimeConfigurationOptions } from '@microsoft/agents-a365-runtime';

/**
 * Observability configuration options - extends runtime options.
 * All overrides are functions called on each property access.
 *
 * Inherited from RuntimeConfigurationOptions:
 * - clusterCategory
 * - isDevelopmentEnvironment
 * - isNodeEnvDevelopment
 */
export type ObservabilityConfigurationOptions = RuntimeConfigurationOptions & {
  /**
   * Override for observability authentication scopes.
   * Falls back to A365_OBSERVABILITY_SCOPES_OVERRIDE env var, then production default.
   */
  observabilityAuthenticationScopes?: () => string[];
  isObservabilityExporterEnabled?: () => boolean;
  isPerRequestExportEnabled?: () => boolean;
  useCustomDomainForObservability?: () => boolean;
  observabilityDomainOverride?: () => string | null;
  observabilityLogLevel?: () => string;
  // Per-Request Processor (Advanced)
  perRequestMaxTraces?: () => number;
  perRequestMaxSpansPerTrace?: () => number;
  perRequestMaxConcurrentExports?: () => number;
};
