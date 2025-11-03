// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TurnContext } from '@microsoft/agents-hosting';
import { PowerPlatformApiDiscovery, ClusterCategory } from './power-platform-api-discovery';
import { getClusterCategory, getMcpPlatformAuthenticationScope } from './environment-utils';

export interface Authorization {
  exchangeToken(turnContext: TurnContext, authHandlerId: string, options: { scopes: string[] }): Promise<{ token: string }>;
}

export class AgenticAuthenticationService {
  private static readonly apiDiscovery: PowerPlatformApiDiscovery = new PowerPlatformApiDiscovery(getClusterCategory() as ClusterCategory);

  private static getScope(): string {
    const envScope = getMcpPlatformAuthenticationScope();

    if (envScope !== undefined && envScope !== null && envScope !== '') {
      return envScope;
    }

    return `${this.apiDiscovery.getTokenAudience()}/.default`;
  }

  public static async GetAgenticUserToken(authorization: Authorization, turnContext: TurnContext) {
    const scope = this.getScope();

    return (await authorization.exchangeToken(turnContext, 'agentic', { scopes: [scope] })).token || '';
  }
}
