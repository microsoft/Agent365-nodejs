// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TurnContext, AuthConfiguration, loadAuthConfigFromEnv } from '@microsoft/agents-hosting';
import { AgenticAuthProvider } from './agentic-auth-provider';
import { PowerPlatformApiDiscovery, ClusterCategory } from './power-platform-api-discovery';
import { getClusterCategory } from './environment-utils';

export class AgenticAuthenticationService {
  private static readonly apiDiscovery: PowerPlatformApiDiscovery = new PowerPlatformApiDiscovery(getClusterCategory() as ClusterCategory);
  private static readonly agenticAuthProvider = new AgenticAuthProvider();

  // This flag should be set to true when OAuth flow is implemented in Agents SDK
  private static readonly useOAuthFlow: boolean = false;

  public static async GetAgenticUserToken(_turnContext: TurnContext): Promise<string> {
    const scope = `${this.apiDiscovery.getTokenAudience()}/.default`;
    const authConfig: AuthConfiguration = loadAuthConfigFromEnv();

    if (!this.useOAuthFlow) {
      return await this.agenticAuthProvider.getAccessToken(authConfig, scope);
    }

    // TODO: Implement OAuth flow when Authorization type is available in the new SDK version
    // The _turnContext will be used here for OAuth token exchange
    throw new Error('OAuth flow is not yet implemented for the new agents hosting SDK version');
  }
}