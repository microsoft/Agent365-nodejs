// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { RuntimeConfiguration } from '@microsoft/agents-a365-runtime';
import { ToolingConfigurationOptions } from './ToolingConfigurationOptions';
import { MCPServerConfig } from '../contracts';

// Constants for tooling-specific settings
const MCP_PLATFORM_PROD_BASE_URL = 'https://agent365.svc.cloud.microsoft';
const PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE = 'ea9ffc3e-8a23-4a7d-836d-234d7c7565c1/.default';

/**
 * Resolve the OAuth scope to request for a given MCP server.
 *
 * V2 servers carry their own audience in the `audience` field and get a per-audience token.
 * V1 servers (no `audience`, or audience matching the shared scope's own audience in plain
 * or api:// form) fall back to `sharedScope` — the configured mcpPlatformAuthenticationScope.
 *
 * @param server     The MCP server config returned by the gateway or manifest.
 * @param sharedScope The configured shared scope (mcpPlatformAuthenticationScope).
 *   Defaults to the prod ATG scope so that external callers without a custom config
 *   continue to work without passing the argument.
 */
export function resolveTokenScopeForServer(
  server: MCPServerConfig,
  sharedScope: string = PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE
): string {
  if (server.audience) {
    // Extract the audience portion of sharedScope (everything before the last '/').
    // e.g. 'ea9ffc3e-.../.default'      → 'ea9ffc3e-...'
    //      'api://ea9ffc3e-.../.default' → 'api://ea9ffc3e-...'
    const sharedAudience = sharedScope.slice(0, sharedScope.lastIndexOf('/'));
    // Build the alternate form so we match both 'guid' and 'api://guid'.
    const sharedAudienceAlt = sharedAudience.startsWith('api://')
      ? sharedAudience.slice(6)        // 'api://guid' → 'guid'
      : `api://${sharedAudience}`;     // 'guid'       → 'api://guid'

    if (server.audience !== sharedAudience && server.audience !== sharedAudienceAlt) {
      // V2 server: use its own audience with explicit scope or /.default fallback.
      return server.scope
        ? `${server.audience}/${server.scope}`
        : `${server.audience}/.default`;
    }
  }
  // V1 server: no audience, or audience matches the shared ATG audience.
  return sharedScope;
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

  /**
   * Returns the dev-mode bearer token for an MCP server by name.
   * Checks BEARER_TOKEN_<SERVERNAME_UPPER> first, then falls back to BEARER_TOKEN.
   * Returns undefined when the variable is not set (no Authorization header will be attached).
   */
  getBearerTokenForServer(mcpServerName: string): string | undefined {
    const key = mcpServerName.toUpperCase();
    return process.env[`BEARER_TOKEN_${key}`] ?? process.env['BEARER_TOKEN'];
  }
}
