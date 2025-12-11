// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Constant for MCP Platform base URL in production
const MCP_PLATFORM_PROD_BASE_URL = 'https://agent365.svc.cloud.microsoft';

export class Utility {
  public static readonly HEADER_CHANNEL_ID = 'x-ms-channel-id';
  public static readonly HEADER_SUBCHANNEL_ID = 'x-ms-subchannel-id';

  /**
   * Compose standard headers for MCP tooling requests.
    * Includes Authorization bearer token when provided, and optionally includes channel and subchannel identifiers for routing.
   *
   * @param authToken Bearer token.
   * @param channelId Optional channel identifier.
   * @param subChannelId Optional sub-channel identifier.
   * @returns A headers record suitable for HTTP requests.
   */
  public static GetToolRequestHeaders(
    authToken: string,
    channelId?: string,
    subChannelId?: string
  ): Record<string, string> {
    const headers: Record<string, string> = {};

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    if (channelId) {
      headers[Utility.HEADER_CHANNEL_ID] = channelId;
    }

    if (subChannelId) {
      headers[Utility.HEADER_SUBCHANNEL_ID] = subChannelId;
    }

    return headers;
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
    const environment = this.getCurrentEnvironment().toLowerCase();

    if (environment === 'development') {
      return process.env.MOCK_MCP_SERVER_URL || 'http://localhost:5309/mcp-mock/agents/servers';
    }

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
   * Reads the current environment name from process.env.
   * Checks ASPNETCORE_ENVIRONMENT, DOTNET_ENVIRONMENT, and NODE_ENV in that order.
   * If none are set this returns the string 'Development'.
   *
   * @returns The current environment identifier as a string.
   */
  private static getCurrentEnvironment(): string {
    return process.env.ASPNETCORE_ENVIRONMENT ||
           process.env.DOTNET_ENVIRONMENT ||
           process.env.NODE_ENV ||
           'Development';
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
}
