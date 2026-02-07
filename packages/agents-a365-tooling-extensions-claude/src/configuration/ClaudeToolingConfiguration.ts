// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ToolingConfiguration } from '@microsoft/agents-a365-tooling';
import { ClaudeToolingConfigurationOptions } from './ClaudeToolingConfigurationOptions';

/**
 * Configuration for Claude tooling extension package.
 * Inherits all tooling and runtime settings.
 *
 * ## Why This Class Exists
 *
 * Although this class currently adds no new settings beyond what ToolingConfiguration
 * provides, it exists for several important reasons:
 *
 * 1. **Type Safety**: Allows Claude-specific services to declare their dependency on
 *    `IConfigurationProvider<ClaudeToolingConfiguration>`, making the configuration
 *    contract explicit and enabling compile-time checking.
 *
 * 2. **Extension Point**: Provides a clear place to add Claude-specific settings
 *    (e.g., Claude API timeouts, model preferences, retry policies) without breaking
 *    existing code when those needs arise.
 *
 * 3. **Consistent Pattern**: Maintains symmetry with other extension packages
 *    (LangChain, OpenAI), making the SDK easier to understand and navigate.
 *
 * 4. **Dependency Injection**: Services can be designed to accept this specific
 *    configuration type, enabling proper IoC patterns and testability.
 *
 * @example
 * ```typescript
 * // Service declares explicit dependency on Claude configuration
 * class ClaudeService {
 *   constructor(private configProvider: IConfigurationProvider<ClaudeToolingConfiguration>) {}
 * }
 *
 * // Future: Add Claude-specific settings without breaking changes
 * class ClaudeToolingConfiguration extends ToolingConfiguration {
 *   get claudeApiTimeout(): number { ... }
 * }
 * ```
 */
export class ClaudeToolingConfiguration extends ToolingConfiguration {
  constructor(overrides?: ClaudeToolingConfigurationOptions) {
    super(overrides);
  }

  // Inherited: clusterCategory, isDevelopmentEnvironment, mcpPlatformEndpoint, mcpPlatformAuthenticationScope
}
