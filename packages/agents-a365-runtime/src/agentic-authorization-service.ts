// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TurnContext, Authorization } from '@microsoft/agents-hosting';
import { getMcpPlatformAuthenticationScope } from './environment-utils';

export class AgenticAuthenticationService {
  public static async GetAgenticUserToken(authorization: Authorization, turnContext: TurnContext) {
    const scope = getMcpPlatformAuthenticationScope();
    return (await authorization.exchangeToken(turnContext, 'agentic', { scopes: scope })).token || '';
  }
}
