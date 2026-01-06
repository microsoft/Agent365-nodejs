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
 * for internal development and testing scenarios using the
 * `A365_OBSERVABILITY_SCOPES_OVERRIDE` environment variable.
 *
 * When the override is set to a non-empty string, it is split on whitespace
 * into individual scopes.
 *
 * @returns The authentication scopes for the current environment.
 */
export function getObservabilityAuthenticationScope(): string[] {
  const override = process.env.A365_OBSERVABILITY_SCOPES_OVERRIDE;

  if (override && override.trim().length > 0) {
    return override
      .trim()
      .split(/\s+/)
      .map(scope => scope.trim())
      .filter(scope => scope.length > 0);
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
