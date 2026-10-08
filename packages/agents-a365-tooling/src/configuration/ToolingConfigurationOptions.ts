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
   * Whether Microsoft Defender for AI real-time protection is enabled (`DefenderRtpClient`).
   * Falls back to ENABLE_A365_DEFENDER_RTP env var; disabled by default.
   */
  isDefenderRtpEnabled?: () => boolean;
  /**
   * Defender prevention endpoint (`https://<host>/v1/protection/evaluate`), an absolute https URL.
   * Required when Defender RTP is enabled. Falls back to A365_DEFENDER_RTP_ENDPOINT env var.
   */
  defenderRtpEndpoint?: () => string;
  /**
   * OAuth scope of the Defender API token. Falls back to A365_DEFENDER_RTP_AUTHENTICATION_SCOPE env
   * var, then the Defender API (`api://86a21212-634e-4553-b3d6-e477e4c9d9ec/.default`).
   */
  defenderRtpAuthenticationScope?: () => string;
  /**
   * Deadline in milliseconds of each evaluation, token acquisition included. Falls back to
   * A365_DEFENDER_RTP_TIMEOUT_MILLISECONDS env var, then 10000.
   */
  defenderRtpTimeoutMilliseconds?: () => number;
  /**
   * Whether an evaluation that returns no verdict blocks the action. Falls back to
   * A365_DEFENDER_RTP_FAIL_MODE env var (`closed`); defaults to false (fail open).
   */
  defenderRtpFailClosed?: () => boolean;
  /**
   * Maximum characters of each content string sent to Defender (identifiers and protocol fields are
   * sent unchanged). Falls back to A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS env var, then 20000.
   */
  defenderRtpMaxContentCharacters?: () => number;
};
