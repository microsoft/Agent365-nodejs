 // Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TurnContext } from '@microsoft/agents-hosting';
import { PowerPlatformApiDiscovery, ClusterCategory } from './power-platform-api-discovery';
import { getClusterCategory } from './environment-utils';

export interface Authorization {
  exchangeToken(turnContext: TurnContext, authHandlerId: string, scopes: string[]): Promise<{ token: string }>;
}

export class AgenticAuthenticationService {
  private static readonly apiDiscovery: PowerPlatformApiDiscovery = new PowerPlatformApiDiscovery(getClusterCategory() as ClusterCategory);

  public static async GetAgenticUserToken(authorization: Authorization, turnContext: TurnContext) {
    const scope = `${this.apiDiscovery.getTokenAudience()}/.default`;

    return (await authorization.exchangeToken(turnContext, 'agentic', { scopes: [scope] })).token || '';
  }
}