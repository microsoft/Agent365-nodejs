// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TurnContext, Authorization } from '@microsoft/agents-hosting';

// Default MCP platform authentication scope (used when scopes not provided for backward compatibility)
const PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE = 'ea9ffc3e-8a23-4a7d-836d-234d7c7565c1/.default';

/**
 * Service for handling agentic user authentication.
 */
export class AgenticAuthenticationService {
  /**
   * Gets an agentic user token for platform authentication.
   * Uses the default MCP platform authentication scope.
   *
   * @param authorization The authorization handler.
   * @param authHandlerName The name of the auth handler to use.
   * @param turnContext The turn context for the current request.
   * @returns The token string, or empty string if no token was returned.
   * @deprecated Use the overload with explicit scopes parameter for better control over requested permissions.
   */
  public static async GetAgenticUserToken(
    authorization: Authorization,
    authHandlerName: string,
    turnContext: TurnContext
  ): Promise<string>;

  /**
   * Gets an agentic user token for platform authentication.
   *
   * @param authorization The authorization handler.
   * @param authHandlerName The name of the auth handler to use.
   * @param turnContext The turn context for the current request.
   * @param scopes The OAuth scopes to request. Should be obtained from the appropriate configuration (e.g., ToolingConfiguration.mcpPlatformAuthenticationScope).
   * @returns The token string, or empty string if no token was returned.
   */
  public static async GetAgenticUserToken(
    authorization: Authorization,
    authHandlerName: string,
    turnContext: TurnContext,
    scopes: string[]
  ): Promise<string>;

  public static async GetAgenticUserToken(
    authorization: Authorization,
    authHandlerName: string,
    turnContext: TurnContext,
    scopes?: string[]
  ): Promise<string> {
    const effectiveScopes = scopes ?? [PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE];
    return (await authorization.exchangeToken(turnContext, authHandlerName, { scopes: effectiveScopes })).token || '';
  }
}
