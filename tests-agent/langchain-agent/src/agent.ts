// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TurnState, AgentApplication, TurnContext, MemoryStorage } from '@microsoft/agents-hosting';
import { ActivityTypes } from '@microsoft/agents-activity';
import { getObservabilityAuthenticationScope } from '@microsoft/agents-a365-runtime';
import tokenCache, { createAgenticTokenCacheKey } from './token-cache.js';
import { Client, getClient } from './client.js';
import { AgenticTokenCacheInstance } from '@microsoft/agents-a365-observability-hosting';

export class A365Agent extends AgentApplication<TurnState> {
  static authHandlerName: string = 'agentic';

  constructor() {
    const useAgenticAuth = process.env.USE_AGENTIC_AUTH === 'true';

    super({
      startTypingTimer: true,
      storage: new MemoryStorage(),
      ...(useAgenticAuth && {
        authorization: {
          agentic: {
            type: 'agentic',
          } // scopes set in the .env file or environment
        }
      })
    });

    this.onActivity(ActivityTypes.Message, async (context: TurnContext) => {
      await this.handleAgentMessageActivity(context);
    });
  }

  /**
   * Handles incoming user messages and sends responses.
   */
  async handleAgentMessageActivity(turnContext: TurnContext): Promise<void> {
    const userMessage = turnContext.activity.text?.trim() || '';
    if (!userMessage) {
      return;
    }
    // Preload/refresh exporter token
    await this.preloadObservabilityToken(turnContext);
    const client: Client = await getClient();
    await client.invokeAgent(userMessage);    
  }

    /**
   * Preloads or refreshes the Observability token used by the Agent 365 Observability exporter.
   */
  private async preloadObservabilityToken(turnContext: TurnContext): Promise<void> {
    const agentId = turnContext?.activity?.recipient?.agenticAppId ?? '';
    const tenantId = turnContext?.activity?.recipient?.tenantId ?? '';

    if (process.env.Use_Custom_Resolver === 'true') {
      const aauToken = await this.authorization.exchangeToken(turnContext, 'agentic', {
        scopes: getObservabilityAuthenticationScope()
      });
      console.log(`Preloaded Observability token for agentId=${agentId}, tenantId=${tenantId} token=${aauToken?.token?.substring(0, 10)}...`);
      const cacheKey = createAgenticTokenCacheKey(agentId, tenantId);
      tokenCache.set(cacheKey, aauToken?.token || '');
    } else {
      await AgenticTokenCacheInstance.RefreshObservabilityToken(
        agentId,
        tenantId,
        turnContext,
        this.authorization,
        getObservabilityAuthenticationScope()
      );
    }
  }
}

export const agentApplication = new A365Agent();
