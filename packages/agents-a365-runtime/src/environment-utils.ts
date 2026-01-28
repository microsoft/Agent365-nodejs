// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

/**
 * Utility logic for environment-related operations.
 */

export const PROD_OBSERVABILITY_SCOPE = 'https://api.powerplatform.com/.default';
export const PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE = 'ea9ffc3e-8a23-4a7d-836d-234d7c7565c1/.default';
export const PROD_OBSERVABILITY_CLUSTER_CATEGORY = 'prod';

// Default environment names
export const PRODUCTION_ENVIRONMENT_NAME = 'production';
export const DEVELOPMENT_ENVIRONMENT_NAME = 'Development';

/**
 * Returns the scope for authenticating to the observability service
 *
 * The default is the production observability scope, but this can be overridden
 * for internal development and testing scenarios using either the
 * `A365_OBSERVABILITY_SCOPE_OVERRIDE` (singular, for a single scope) or
 * `A365_OBSERVABILITY_SCOPES_OVERRIDE` (plural, supports multiple whitespace-separated scopes)
 * environment variable.
 *
 * The singular form takes precedence and returns a single scope without splitting.
 * The plural form splits on whitespace to support multiple scopes.
 * This dual support provides cross-SDK compatibility with the .NET SDK while maintaining
 * enhanced functionality.
 *
 * @returns The authentication scopes for the current environment.
 */
export function getObservabilityAuthenticationScope(): string[] {
  // Check singular form first for .NET SDK compatibility (PR #133)
  // Returns a single scope without splitting on whitespace
  const singularOverride = process.env.A365_OBSERVABILITY_SCOPE_OVERRIDE;
  if (singularOverride && singularOverride.trim().length > 0) {
    return [singularOverride.trim()];
  }

  // Check plural form (original TypeScript implementation)
  // Supports multiple whitespace-separated scopes
  const pluralOverride = process.env.A365_OBSERVABILITY_SCOPES_OVERRIDE;
  if (pluralOverride && pluralOverride.trim().length > 0) {
    return pluralOverride.trim().split(/\s+/);
  }

  return [PROD_OBSERVABILITY_SCOPE];
}

/**
 * Gets the cluster category from environment variables.
 *
 * @returns The cluster category from CLUSTER_CATEGORY env var, defaults to 'prod'.
 */
export function getClusterCategory(): string {
  const clusterCategory = process.env.CLUSTER_CATEGORY;

  if (!clusterCategory) {
    return 'prod';
  }

  return clusterCategory.toLowerCase();
}

/**
 * Returns true if the current environment is a development environment.
 *
 * @returns True if the current environment is development, false otherwise.
 */
export function isDevelopmentEnvironment(): boolean {
  const clusterCategory = getClusterCategory();
  return ['local', 'dev'].includes(clusterCategory);
}

/**
 * Gets the MCP platform authentication scope from environment variables.
 *
 * @returns The MCP platform authentication scope from MCP_PLATFORM_AUTHENTICATION_SCOPE env var, defaults to production scope.
 */
export function getMcpPlatformAuthenticationScope(): string {
  return process.env.MCP_PLATFORM_AUTHENTICATION_SCOPE || PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE;
}
