// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ToolingConfiguration } from '@microsoft/agents-a365-tooling';
import { OpenAIToolingConfigurationOptions } from './OpenAIToolingConfigurationOptions';

/**
 * Configuration for OpenAI tooling extension package.
 * Inherits all tooling and runtime settings.
 *
 * ## Why This Class Exists
 *
 * Although this class currently adds no new settings beyond what ToolingConfiguration
 * provides, it exists for several important reasons:
 *
 * 1. **Type Safety**: Allows OpenAI-specific services to declare their dependency on
 *    `IConfigurationProvider<OpenAIToolingConfiguration>`, making the configuration
 *    contract explicit and enabling compile-time checking.
 *
 * 2. **Extension Point**: Provides a clear place to add OpenAI-specific settings
 *    (e.g., Agents SDK timeouts, thread polling intervals, run limits) without
 *    breaking existing code when those needs arise.
 *
 * 3. **Consistent Pattern**: Maintains symmetry with other extension packages
 *    (Claude, LangChain), making the SDK easier to understand and navigate.
 *
 * 4. **Dependency Injection**: Services can be designed to accept this specific
 *    configuration type, enabling proper IoC patterns and testability.
 *
 * @example
 * ```typescript
 * // Service declares explicit dependency on OpenAI configuration
 * class OpenAIService {
 *   constructor(private configProvider: IConfigurationProvider<OpenAIToolingConfiguration>) {}
 * }
 *
 * // Future: Add OpenAI-specific settings without breaking changes
 * class OpenAIToolingConfiguration extends ToolingConfiguration {
 *   get threadPollingInterval(): number { ... }
 * }
 * ```
 */
export class OpenAIToolingConfiguration extends ToolingConfiguration {
  constructor(overrides?: OpenAIToolingConfigurationOptions) {
    super(overrides);
  }

  // Inherited: clusterCategory, isDevelopmentEnvironment, mcpPlatformEndpoint, mcpPlatformAuthenticationScope
}
