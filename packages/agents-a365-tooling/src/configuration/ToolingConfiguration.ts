// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { RuntimeConfiguration } from '@microsoft/agents-a365-runtime';
import { ToolingConfigurationOptions } from './ToolingConfigurationOptions';
import { MCPServerConfig } from '../contracts';

// Constants for tooling-specific settings
const MCP_PLATFORM_PROD_BASE_URL = 'https://agent365.svc.cloud.microsoft';
const PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE = 'ea9ffc3e-8a23-4a7d-836d-234d7c7565c1/.default';
const DEFAULT_DEFENDER_RTP_TIMEOUT_MILLISECONDS = 10000;
const DEFAULT_DEFENDER_RTP_MAX_CONTENT_CHARACTERS = 20000;
/**
 * The longest Defender timeout: Node's largest timer delay (a longer one fires after 1 ms), less the two
 * seconds the protection emitter adds.
 */
const MAX_DEFENDER_RTP_TIMEOUT_MILLISECONDS = 2_147_483_647 - 2_000;

/** Application id of the Defender API, which grants `RealtimeProtection.Evaluate.All`. */
export const DEFENDER_RTP_API_APP_ID = '86a21212-634e-4553-b3d6-e477e4c9d9ec';

/** Default Defender RTP token scope: the Defender API. */
export const DEFAULT_DEFENDER_RTP_AUTHENTICATION_SCOPE = `api://${DEFENDER_RTP_API_APP_ID}/.default`;

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
 * The environment variable as a whole number, or undefined when it is unset or blank. Anything else throws,
 * unlike `parseInt`, which reads `10s` as 10.
 */
function wholeNumber(name: string): number | undefined {
  const value = process.env[name]?.trim();
  if (!value) {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a whole number.`);
  }

  return Number(value);
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
   * Whether Microsoft Defender for AI real-time protection is enabled. When false,
   * `DefenderRtpClient` evaluates nothing and makes no calls. `ENABLE_A365_DEFENDER_RTP` accepts
   * true/false, 1/0, yes/no or on/off (any case; blank means false); any other value throws.
   */
  get isDefenderRtpEnabled(): boolean {
    const override = this.toolingOverrides.isDefenderRtpEnabled?.();
    if (override !== undefined) return override;

    // Strict, so a typo fails at startup instead of silently turning protection off.
    const value = process.env.ENABLE_A365_DEFENDER_RTP?.trim().toLowerCase();
    if (!value || ['false', '0', 'no', 'off'].includes(value)) {
      return false;
    }

    if (['true', '1', 'yes', 'on'].includes(value)) {
      return true;
    }

    throw new Error('ENABLE_A365_DEFENDER_RTP must be true or false (or 1/0, yes/no, on/off).');
  }

  /**
   * Defender prevention endpoint (`POST .../v1/protection/evaluate`, agent-hooks/0.1 contract), an absolute
   * https URL. There is no default: it is required when Defender RTP is enabled, and empty otherwise.
   */
  get defenderRtpEndpoint(): string {
    const override = this.toolingOverrides.defenderRtpEndpoint?.();
    if (override?.trim()) return normalizeUrl(override);

    const envValue = process.env.A365_DEFENDER_RTP_ENDPOINT?.trim();
    if (envValue) return normalizeUrl(envValue);

    if (this.isDefenderRtpEnabled) {
      throw new Error(
        'defenderRtpEndpoint is required when Defender RTP is enabled. '
        + 'Set A365_DEFENDER_RTP_ENDPOINT or provide a configuration override.',
      );
    }
    return '';
  }

  /**
   * OAuth scope of the Defender API token. The token must carry the `RealtimeProtection.Evaluate.All`
   * app role. Defaults to the Defender API (`api://86a21212-634e-4553-b3d6-e477e4c9d9ec/.default`).
   */
  get defenderRtpAuthenticationScope(): string {
    const override = this.toolingOverrides.defenderRtpAuthenticationScope?.()?.trim();
    if (override) return override;

    const envValue = process.env.A365_DEFENDER_RTP_AUTHENTICATION_SCOPE?.trim();
    if (envValue) return envValue;

    return DEFAULT_DEFENDER_RTP_AUTHENTICATION_SCOPE;
  }

  /**
   * Deadline in milliseconds of each Defender evaluation, token acquisition included (default 10000).
   * At most 2147481647: Node fires a longer timer after 1 ms, which would fail every evaluation.
   * `A365_DEFENDER_RTP_TIMEOUT_MILLISECONDS` must be a whole number: a value such as `10s` throws instead of
   * becoming 10 ms, which would time out every evaluation.
   */
  get defenderRtpTimeoutMilliseconds(): number {
    const override = this.toolingOverrides.defenderRtpTimeoutMilliseconds?.();
    const timeout = override
      ?? wholeNumber('A365_DEFENDER_RTP_TIMEOUT_MILLISECONDS')
      ?? DEFAULT_DEFENDER_RTP_TIMEOUT_MILLISECONDS;

    if (!Number.isInteger(timeout) || timeout <= 0 || timeout > MAX_DEFENDER_RTP_TIMEOUT_MILLISECONDS) {
      throw new Error(`defenderRtpTimeoutMilliseconds must be a positive integer of at most ${MAX_DEFENDER_RTP_TIMEOUT_MILLISECONDS}.`);
    }
    return timeout;
  }

  /**
   * Whether an evaluation that returns no verdict (timeout, transport, authentication or HTTP
   * error) blocks the action (`A365_DEFENDER_RTP_FAIL_MODE=closed`). Defaults to false: fail open.
   * `A365_DEFENDER_RTP_FAIL_MODE` accepts `open` or `closed` (any case); any other value throws, so
   * a typo cannot silently turn fail-closed into fail-open.
   */
  get defenderRtpFailClosed(): boolean {
    const override = this.toolingOverrides.defenderRtpFailClosed?.();
    if (override !== undefined) return override;

    const mode = process.env.A365_DEFENDER_RTP_FAIL_MODE?.trim().toLowerCase();
    if (!mode || mode === 'open') {
      return false;
    }

    if (mode === 'closed') {
      return true;
    }

    throw new Error("A365_DEFENDER_RTP_FAIL_MODE must be 'open' or 'closed'.");
  }

  /**
   * Maximum characters of each content string sent to Defender (default 20000). A longer string is cut
   * to this length, ending with a `...[truncated N chars]` marker when the marker fits. When the content
   * under decision is cut, Defender's allow of the copy does not cover it, so the action follows the
   * fail mode; raise the limit for agents that handle long content. Identifiers and protocol fields are
   * sent unchanged. `A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS` must be a whole number: a value such as
   * `20k` throws instead of becoming 20.
   */
  get defenderRtpMaxContentCharacters(): number {
    const override = this.toolingOverrides.defenderRtpMaxContentCharacters?.();
    const maximum = override
      ?? wholeNumber('A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS')
      ?? DEFAULT_DEFENDER_RTP_MAX_CONTENT_CHARACTERS;

    if (!Number.isInteger(maximum) || maximum <= 0) {
      throw new Error('defenderRtpMaxContentCharacters must be a positive integer.');
    }
    return maximum;
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

  /**
   * Returns true when a per-server bearer token env var (BEARER_TOKEN_<SERVERNAME_UPPER>)
   * is explicitly set for the given server, false when only the shared BEARER_TOKEN fallback
   * would be used. Used to detect V2 servers that are silently falling back to a
   * wrong-audience token in dev mode.
   */
  hasPerServerBearerToken(mcpServerName: string): boolean {
    const key = mcpServerName.toUpperCase();
    return !!process.env[`BEARER_TOKEN_${key}`];
  }
}
