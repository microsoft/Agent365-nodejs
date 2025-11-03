// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

/**
 * Utility logic for environment-related operations.
 */

// Authentication scopes for different environments
export const TEST_OBSERVABILITY_SCOPE = 'https://api.test.powerplatform.com/.default';
export const PREPROD_OBSERVABILITY_SCOPE = 'https://api.preprod.powerplatform.com/.default';
export const PROD_OBSERVABILITY_SCOPE = 'https://api.powerplatform.com/.default';

// Cluster categories for different environments
export const TEST_OBSERVABILITY_CLUSTER_CATEGORY = 'test';
export const PREPROD_OBSERVABILITY_CLUSTER_CATEGORY = 'preprod';
export const PROD_OBSERVABILITY_CLUSTER_CATEGORY = 'prod';

// Default environment names
export const PRODUCTION_ENVIRONMENT_NAME = 'production';
export const DEVELOPMENT_ENVIRONMENT_NAME = 'Development';

/**
 * Returns the scope for authenticating to the observability service based on the current environment.
 *
 * @returns The authentication scope for the current environment.
 */
export function getObservabilityAuthenticationScope(): string[] {
  const clusterCategory = getClusterCategory();

  if (['local', 'dev', 'test', 'preprod'].includes(clusterCategory)) {
    return [PREPROD_OBSERVABILITY_SCOPE];
  } else {
    // Default to production scope for 'prod' and any other values
    return [PROD_OBSERVABILITY_SCOPE];
  }
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
 * @returns The MCP platform authentication scope from MCP_PLATFORM_AUTHENTICATION_SCOPE env var, or undefined if not set.
 */
export function getMcpPlatformAuthenticationScope(): string | undefined {
  return process.env.MCP_PLATFORM_AUTHENTICATION_SCOPE;
}