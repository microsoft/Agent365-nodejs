// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { RuntimeConfiguration } from '@microsoft/agents-a365-runtime';
import { ToolingConfigurationOptions } from './ToolingConfigurationOptions';
import { MCPServerConfig } from '../contracts';

// Constants for tooling-specific settings
const MCP_PLATFORM_PROD_BASE_URL = 'https://agent365.svc.cloud.microsoft';
const PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE = 'ea9ffc3e-8a23-4a7d-836d-234d7c7565c1/.default';
const ATG_APP_ID = 'ea9ffc3e-8a23-4a7d-836d-234d7c7565c1';

/**
 * Resolve the OAuth scope to request for a given MCP server.
 * V2 servers carry their own audience GUID in the `audience` field; V1 servers (no audience,
 * or audience matching the shared ATG AppId) fall back to the shared ATG scope.
 */
export function resolveTokenScopeForServer(server: MCPServerConfig): string {
  if (server.audience &&
      server.audience !== ATG_APP_ID &&
      !server.audience.startsWith('api://')) {
    return `${server.audience}/.default`;
  }
  return `${ATG_APP_ID}/.default`;
}

/**
 * Normalize URL by trimming whitespace and removing trailing slashes.
 * Prevents double-slash issues in URL construction (e.g., "https://example.com//api").
 */
function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Configuration for tooling package.
 * Inherits runtime settings and adds tooling-specific settings.
 */
export class ToolingConfiguration extends RuntimeConfiguration {
  // Type-safe access to tooling overrides
  protected get toolingOverrides(): ToolingConfigurationOptions {
    return this.overrides as ToolingConfigurationOptions;
  }

  constructor(overrides?: ToolingConfigurationOptions) {
    super(overrides);
  }

  // Inherited: clusterCategory, isDevelopmentEnvironment, isNodeEnvDevelopment

  get mcpPlatformEndpoint(): string {
    const override = this.toolingOverrides.mcpPlatformEndpoint?.();
    if (override) return normalizeUrl(override);

    const envValue = process.env.MCP_PLATFORM_ENDPOINT?.trim();
    if (envValue) return normalizeUrl(envValue);

    return MCP_PLATFORM_PROD_BASE_URL;
  }

  /**
   * Whether to use the ToolingManifest.json file instead of gateway discovery.
   * Returns true when NODE_ENV is set to 'development' (case-insensitive), or
   * when explicitly overridden via configuration.
   */
  get useToolingManifest(): boolean {
    const override = this.toolingOverrides.useToolingManifest?.();
    if (override !== undefined) return override;

    return this.isNodeEnvDevelopment;
  }

  /**
   * Gets the MCP platform authentication scope.
   * Used by AgenticAuthenticationService for token exchange.
   * Trims whitespace to prevent token exchange failures.
   */
  get mcpPlatformAuthenticationScope(): string {
    const override = this.toolingOverrides.mcpPlatformAuthenticationScope?.()?.trim();
    if (override) return override;

    const envValue = process.env.MCP_PLATFORM_AUTHENTICATION_SCOPE?.trim();
    if (envValue) return envValue;

    return PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE;
  }
}
