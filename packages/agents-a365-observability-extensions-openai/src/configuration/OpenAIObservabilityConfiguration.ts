// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ObservabilityConfiguration } from '@microsoft/agents-a365-observability';
import { OpenAIObservabilityConfigurationOptions } from './OpenAIObservabilityConfigurationOptions';

/**
 * Configuration for OpenAI observability extension package.
 * Inherits all observability and runtime settings.
 *
 * ## Why This Class Exists
 *
 * Although this class currently adds no new settings beyond what ObservabilityConfiguration
 * provides, it exists for several important reasons:
 *
 * 1. **Type Safety**: Allows OpenAI-specific services to declare their dependency on
 *    `IConfigurationProvider<OpenAIObservabilityConfiguration>`, making the configuration
 *    contract explicit and enabling compile-time checking.
 *
 * 2. **Extension Point**: Provides a clear place to add OpenAI-specific observability settings
 *    (e.g., trace sampling rates, span attribute limits, custom exporter options) without
 *    breaking existing code when those needs arise.
 *
 * 3. **Consistent Pattern**: Maintains symmetry with other extension packages
 *    (Claude, LangChain tooling extensions), making the SDK easier to understand and navigate.
 *
 * 4. **Dependency Injection**: Services can be designed to accept this specific
 *    configuration type, enabling proper IoC patterns and testability.
 *
 * ## Relationship to OpenAIAgentsInstrumentationConfig
 *
 * This class is separate from and complementary to `OpenAIAgentsInstrumentationConfig`:
 *
 * - **OpenAIObservabilityConfiguration**: SDK-wide configuration following the
 *   configuration provider pattern, supporting function-based overrides and
 *   environment variable fallbacks.
 *
 * - **OpenAIAgentsInstrumentationConfig**: OpenTelemetry instrumentation-specific
 *   configuration passed to `OpenAIAgentsTraceInstrumentor`, following OTel conventions.
 *
 * @example
 * ```typescript
 * // Service declares explicit dependency on OpenAI observability configuration
 * class OpenAITracingService {
 *   constructor(private configProvider: IConfigurationProvider<OpenAIObservabilityConfiguration>) {}
 * }
 *
 * // Future: Add OpenAI-specific settings without breaking changes
 * class OpenAIObservabilityConfiguration extends ObservabilityConfiguration {
 *   get traceSamplingRate(): number { ... }
 * }
 * ```
 */
export class OpenAIObservabilityConfiguration extends ObservabilityConfiguration {
  constructor(overrides?: OpenAIObservabilityConfigurationOptions) {
    super(overrides);
  }

  // Inherited: clusterCategory, isDevelopmentEnvironment, observabilityAuthenticationScopes,
  // isObservabilityExporterEnabled, isPerRequestExportEnabled, useCustomDomainForObservability,
  // observabilityDomainOverride, observabilityLogLevel, perRequestMaxTraces,
  // perRequestMaxSpansPerTrace, perRequestMaxConcurrentExports
}
