// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { RuntimeConfigurationOptions } from '@microsoft/agents-a365-runtime';

/**
 * Tooling configuration options - extends runtime options.
 * All overrides are functions called on each property access.
 *
 * Inherited from RuntimeConfigurationOptions:
 * - clusterCategory
 * - isNodeEnvDevelopment
 */
export type ToolingConfigurationOptions = RuntimeConfigurationOptions & {
  mcpPlatformEndpoint?: () => string;
  /**
   * Override for using ToolingManifest.json vs gateway discovery.
   * Falls back to inherited isNodeEnvDevelopment.
   */
  useToolingManifest?: () => boolean;
  /**
   * Override for MCP platform authentication scope.
   * Falls back to MCP_PLATFORM_AUTHENTICATION_SCOPE env var, then production default.
   */
  mcpPlatformAuthenticationScope?: () => string;
  /**
   * Opts SDK tool execution wrappers into Defender real-time protection.
   * Disabled by default.
   */
  isDefenderRtpEnabled?: () => boolean;
  /**
   * Defender RTP endpoint. Required when Defender RTP is enabled.
   */
  defenderRtpEndpoint?: () => string;
  /**
   * Override for the direct Defender RTP OAuth resource scope.
   */
  defenderRtpAuthenticationScope?: () => string;
  /**
   * Override for the Defender RTP HTTP timeout in milliseconds.
   */
  defenderRtpTimeoutMilliseconds?: () => number;
  /**
   * Whether unavailable Defender validation blocks the action. Defaults to false (fail open).
   */
  defenderRtpFailClosed?: () => boolean;
  /**
   * Maximum characters retained in each content string sent to Defender.
   */
  defenderRtpMaxContentCharacters?: () => number;
};
