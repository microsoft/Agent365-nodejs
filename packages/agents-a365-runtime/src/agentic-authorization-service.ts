// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TurnContext, Authorization } from '@microsoft/agents-hosting';

/**
 * Service for handling agentic user authentication.
 */
export class AgenticAuthenticationService {
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
  ) {
    return (await authorization.exchangeToken(turnContext, authHandlerName, { scopes })).token || '';
  }
}
