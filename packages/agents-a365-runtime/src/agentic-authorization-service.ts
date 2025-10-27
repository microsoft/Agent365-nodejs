import { TurnContext, Authorization } from '@microsoft/agents-hosting';
import { AgenticAuthProvider } from './agentic-auth-provider';
import { PowerPlatformApiDiscovery, ClusterCategory } from './power-platform-api-discovery';
import { getClusterCategory } from './environment-utils';

export class AgenticAuthenticationService {
  private static readonly apiDiscovery: PowerPlatformApiDiscovery = new PowerPlatformApiDiscovery(getClusterCategory() as ClusterCategory);
  private static readonly agenticAuthProvider = new AgenticAuthProvider();

  // This flag should be set to true when OAuth flow is implemented in Agents SDK
  private static readonly useOAuthFlow: boolean = false;

  public static async GetAgenticUserToken(authorization: Authorization, turnContext: TurnContext) {
    const scope = `${this.apiDiscovery.getTokenAudience()}/.default`;

    if (!this.useOAuthFlow) {
      return await this.agenticAuthProvider.getAccessToken(turnContext.adapter.authConfig, scope);
    }


    return (await authorization.exchangeToken(turnContext, [scope], 'agentic')).token || '';
  }
}