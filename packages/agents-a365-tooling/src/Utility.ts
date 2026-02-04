// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TurnContext } from '@microsoft/agents-hosting';
import { ChannelAccount } from '@microsoft/agents-activity';
import { Utility as RuntimeUtility } from '@microsoft/agents-a365-runtime';

import { ToolOptions } from './contracts';

// Constant for MCP Platform base URL in production
const MCP_PLATFORM_PROD_BASE_URL = 'https://agent365.svc.cloud.microsoft';

export class Utility {
  public static readonly HEADER_CHANNEL_ID = 'x-ms-channel-id';
  public static readonly HEADER_SUBCHANNEL_ID = 'x-ms-subchannel-id';
  public static readonly HEADER_USER_AGENT = 'User-Agent';
  /** Header name for sending the agent identifier to MCP platform for logging/analytics. */
  public static readonly HEADER_AGENT_ID = 'x-ms-agentid';

  /**
   * Compose standard headers for MCP tooling requests.
   * Includes Authorization bearer token when provided, and optionally includes channel and subchannel identifiers for routing.
   *
   * @param authToken Bearer token for Authorization header.
   * @param turnContext Optional TurnContext object from which channel and subchannel IDs are extracted.
   * @param options Optional ToolOptions object for additional request configuration.
   * @returns A headers record suitable for HTTP requests.
   */
  public static GetToolRequestHeaders(
    authToken?: string,
    turnContext?: TurnContext,
    options?: ToolOptions
  ): Record<string, string> {
    const headers: Record<string, string> = {};

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;

      // Add x-ms-agentid header with priority fallback (only when authToken present)
      const agentId = this.resolveAgentIdForHeader(authToken, turnContext);
      if (agentId) {
        headers[Utility.HEADER_AGENT_ID] = agentId;
      }
    }

    const channelId = turnContext?.activity?.channelId as string | undefined;
    const subChannelId = turnContext?.activity?.channelIdSubChannel as string | undefined;

    if (channelId) {
      headers[Utility.HEADER_CHANNEL_ID] = channelId;
    }

    if (subChannelId) {
      headers[Utility.HEADER_SUBCHANNEL_ID] = subChannelId;
    }

    if (options?.orchestratorName) {
      headers[Utility.HEADER_USER_AGENT] = RuntimeUtility.GetUserAgentHeader(options.orchestratorName);
    }

    return headers;
  }

  /**
   * Resolves the best available agent identifier for the x-ms-agentid header.
   * Priority: TurnContext.agenticAppBlueprintId > token claims (xms_par_app_azp > appid > azp) > application name
   *
   * Note: This differs from RuntimeUtility.ResolveAgentIdentity() which resolves the agenticAppId
   * for URL construction. This method resolves the identifier specifically for the x-ms-agentid header.
   *
   * @param authToken The authentication token to extract claims from.
   * @param turnContext Optional TurnContext to extract agent blueprint ID from.
   * @returns Agent ID string or undefined if not available.
   */
  private static resolveAgentIdForHeader(
    authToken: string,
    turnContext?: TurnContext
  ): string | undefined {
    // Priority 1: Agent Blueprint ID from TurnContext
    // The 'from' property may include agenticAppBlueprintId when the request originates from an agentic app
    const blueprintId = (turnContext?.activity?.from as ChannelAccount | undefined)?.agenticAppBlueprintId;
    if (blueprintId) {
      return blueprintId;
    }

    // Priority 2 & 3: Agent ID from token (xms_par_app_azp > appid > azp)
    // Single decode, checks claims in priority order
    const agentId = RuntimeUtility.getAgentIdFromToken(authToken);
    if (agentId) {
      return agentId;
    }

    // Priority 4: Application name from npm_package_name or package.json
    return RuntimeUtility.getApplicationName();
  }

  /**
   * Validates a JWT authentication token.
   * Checks that the token is a valid JWT and is not expired.
   *
   * @param authToken - The JWT token to validate.
   * @throws Error if the token is invalid or expired.
   */
  public static ValidateAuthToken(authToken: string | undefined): void {
    return Utility.validateAuthToken(authToken);
  }

  /**
   * Private helper to validate a JWT authentication token.
   * Checks that the token is a valid JWT and is not expired.
   *
   * @param authToken - The JWT token to validate.
   * @throws Error if the token is invalid or expired.
   */
  private static validateAuthToken(authToken: string | undefined): void {
    if (!authToken) {
      throw new Error('Authentication token is required');
    }

    // Parse JWT token (format: header.payload.signature)
    const parts = authToken.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT token format');
    }

    let payload: {
      exp?: number;
    };

    try {
      // Decode the payload (second part of the JWT)
      const payloadBase64 = parts[1];
      // Handle URL-safe base64
      const paddedBase64 = payloadBase64.padEnd(payloadBase64.length + (4 - payloadBase64.length % 4) % 4, '=');
      const payloadJson = Buffer.from(paddedBase64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
      payload = JSON.parse(payloadJson);
    } catch (_error) {
      throw new Error('Failed to decode JWT token payload');
    }

    // Check expiration
    if (payload.exp) {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      if (payload.exp < currentTimestamp) {
        throw new Error('Authentication token has expired');
      }
    } else {
      throw new Error('Authentication token does not contain expiration claim');
    }
  }

  /**
   * Construct the tooling gateway URL for a given agent identity.
   * This endpoint is used to discover MCP servers associated with the specified agent identity.
   *
   * Example:
   *   Utility.GetToolingGatewayForDigitalWorker(agenticAppId)
   *   // => "https://agent365.svc.cloud.microsoft/agents/{agenticAppId}/mcpServers"
   *
   * @param agenticAppId - The unique identifier for the agent identity.
   * @returns A fully-qualified URL pointing at the tooling gateway for the agent.
   */
  public static GetToolingGatewayForDigitalWorker(agenticAppId: string): string {
    // The endpoint needs to be updated based on the environment (prod, dev, etc.)
    return `${this.getMcpPlatformBaseUrl()}/agents/${agenticAppId}/mcpServers`;
  }

  /**
   * Get the base URL used to query MCP environments.
   *
   * @returns The base MCP environments URL.
   */
  public static GetMcpBaseUrl(): string {
    return `${this.getMcpPlatformBaseUrl()}/agents/servers`;
  }

  /**
   * Build the full URL for accessing a specific MCP server.
   *
   * Example:
   *   Utility.BuildMcpServerUrl('MyServer')
   *   // => "https://agent365.svc.cloud.microsoft/agents/servers/MyServer/"
   *
   * @param serverName - The MCP server resource name.
   * @returns The fully-qualified MCP server URL including trailing slash.
  */
  public static BuildMcpServerUrl(serverName: string) : string {
    const baseUrl = this.GetMcpBaseUrl();
    return `${baseUrl}/${serverName}`;
  }

  /**
   * Gets the base URL for MCP platform, defaults to production URL if not set.
   *
   * @returns The base URL for MCP platform.
   */
  private static getMcpPlatformBaseUrl(): string {
    if (process.env.MCP_PLATFORM_ENDPOINT) {
      return process.env.MCP_PLATFORM_ENDPOINT;
    }

    return MCP_PLATFORM_PROD_BASE_URL;
  }

  /**
   * Constructs the endpoint URL for sending chat history to the MCP platform for real-time threat protection.
   * 
   * @returns An absolute URL that tooling components can use to send or retrieve chat messages for
   * real-time threat protection scenarios.
   * @remarks
   * Call this method when constructing HTTP requests that need to access the chat-message history
   * for real-time threat protection. The returned URL already includes the MCP platform base address
   * and the fixed path segment `/agents/real-time-threat-protection/chat-message`.
   */
  public static GetChatHistoryEndpoint(): string {
    return `${this.getMcpPlatformBaseUrl()}/agents/real-time-threat-protection/chat-message`;
  }
}
