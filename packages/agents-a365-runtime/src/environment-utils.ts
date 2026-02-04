// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

/**
 * Utility logic for environment-related operations.
 *
 * Note: These utility functions are maintained for backward compatibility.
 * For new code, prefer using the configuration classes directly:
 * - RuntimeConfiguration for clusterCategory, isDevelopmentEnvironment, isNodeEnvDevelopment
 * - ToolingConfiguration for mcpPlatformAuthenticationScope
 * - ObservabilityConfiguration for observabilityAuthenticationScopes
 */

import { RuntimeConfiguration, defaultRuntimeConfigurationProvider } from './configuration';
import { IConfigurationProvider } from './configuration/IConfigurationProvider';

export const PROD_OBSERVABILITY_SCOPE = 'https://api.powerplatform.com/.default';
export const PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE = 'ea9ffc3e-8a23-4a7d-836d-234d7c7565c1/.default';
export const PROD_OBSERVABILITY_CLUSTER_CATEGORY = 'prod';

// Default environment names
export const PRODUCTION_ENVIRONMENT_NAME = 'production';
export const DEVELOPMENT_ENVIRONMENT_NAME = 'Development';

/**
 * Returns the scope for authenticating to the observability service.
 *
 * @returns The authentication scopes for the current environment.
 * @deprecated Use ObservabilityConfiguration.observabilityAuthenticationScopes instead.
 */
export function getObservabilityAuthenticationScope(): string[] {
  // Returns production default - use ObservabilityConfiguration for proper env var support
  return [PROD_OBSERVABILITY_SCOPE];
}

/**
 * Gets the cluster category from environment variables.
 *
 * Note: For new code, prefer using RuntimeConfiguration.clusterCategory
 *
 * @param configProvider Optional configuration provider. Defaults to defaultRuntimeConfigurationProvider if not specified.
 * @returns The cluster category from CLUSTER_CATEGORY env var, defaults to 'prod'.
 * @deprecated Use RuntimeConfiguration.clusterCategory instead.
 */
export function getClusterCategory(
  configProvider?: IConfigurationProvider<RuntimeConfiguration>
): string {
  const provider = configProvider ?? defaultRuntimeConfigurationProvider;
  return provider.getConfiguration().clusterCategory;
}

/**
 * Returns true if the current environment is a development environment.
 *
 * Note: For new code, prefer using RuntimeConfiguration.isDevelopmentEnvironment
 *
 * @param configProvider Optional configuration provider. Defaults to defaultRuntimeConfigurationProvider if not specified.
 * @returns True if the current environment is development, false otherwise.
 * @deprecated Use RuntimeConfiguration.isDevelopmentEnvironment instead.
 */
export function isDevelopmentEnvironment(
  configProvider?: IConfigurationProvider<RuntimeConfiguration>
): boolean {
  const provider = configProvider ?? defaultRuntimeConfigurationProvider;
  return provider.getConfiguration().isDevelopmentEnvironment;
}

/**
 * Gets the MCP platform authentication scope.
 *
 * @returns The MCP platform authentication scope.
 * @deprecated Use ToolingConfiguration.mcpPlatformAuthenticationScope instead.
 */
export function getMcpPlatformAuthenticationScope(): string {
  // Returns production default - use ToolingConfiguration for proper env var support
  return PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE;
}
