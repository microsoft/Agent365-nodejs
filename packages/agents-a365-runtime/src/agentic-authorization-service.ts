// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TurnContext, Authorization } from '@microsoft/agents-hosting';
import { PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE } from './environment-utils';

/**
 * A function that acquires an app-only access token for the given scopes using the
 * OAuth 2.0 client credentials grant. No user context (TurnContext) is required.
 *
 * Callers provide an implementation typically backed by MSAL's
 * `ConfidentialClientApplication.acquireTokenByClientCredential`.
 *
 * @param scopes The OAuth scopes to request (e.g., `['api://<audience>/.default']`).
 * @returns A promise that resolves to the access token string.
 */
export type AppTokenProvider = (scopes: string[]) => Promise<string>;

/**
 * Service for handling agentic authentication — both user-delegated (OBO via TurnContext)
 * and service-to-service (app-only via AppTokenProvider).
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
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Intentional: maintaining backward compatibility for deprecated 3-param overload
    const effectiveScopes = scopes ?? [PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE];
    return (await authorization.exchangeToken(turnContext, authHandlerName, { scopes: effectiveScopes })).token || '';
  }

  /**
   * Gets an app-only token for service-to-service authentication using the client credentials grant.
   * No user context (TurnContext) is required.
   *
   * @param tokenProvider A function that acquires tokens via `acquireTokenByClientCredential`.
   * @param scopes The OAuth scopes to request.
   * @returns The access token string.
   * @throws Error if the token provider returns a falsy value.
   */
  public static async GetAgenticAppToken(
    tokenProvider: AppTokenProvider,
    scopes: string[]
  ): Promise<string> {
    const token = await tokenProvider(scopes);
    if (!token) {
      throw new Error('Client credentials token acquisition failed: token provider returned an empty or null token');
    }
    return token;
  }
}
