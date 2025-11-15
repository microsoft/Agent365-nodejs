// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpToolServerConfigurationService, Utility } from '@microsoft/agents-a365-tooling';
import { AgenticAuthenticationService } from '@microsoft/agents-a365-runtime';

// Agents SDK
import { TurnContext, Authorization } from '@microsoft/agents-hosting';

// OpenAI Agents SDK
import { Agent, MCPServerStreamableHttp } from '@openai/agents';

/**
 * Discover MCP servers and list tools formatted for the OpenAI Agents SDK.
 * Uses listToolServers to fetch server configs.
 */
export class McpToolRegistrationService {
  private configService: McpToolServerConfigurationService  = new McpToolServerConfigurationService();


  /**
   * Registers MCP tool servers and updates agent options with discovered tools and server configs.
   * Call this to enable dynamic OpenAI tool access based on the current MCP environment.
   */
  async addToolServersToAgent(
    agent: Agent,
    agentUserId: string,
    authorization: Authorization,
    authHandlerName: string,
    turnContext: TurnContext,
    authToken: string
  ): Promise<Agent> {

    if (!agent) {
      throw new Error('Agent is Required');
    }

    if (!authToken) {
      authToken = await AgenticAuthenticationService.GetAgenticUserToken(authorization, authHandlerName, turnContext);
    }

    // Validate the authentication token
    Utility.ValidateAuthToken(authToken);

    const servers = await this.configService.listToolServers(agentUserId, authToken);
    const mcpServers: MCPServerStreamableHttp[] = [];

    for (const server of servers) {
      // Compose headers if values are available
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      // Create MCPServerStreamableHttp instance for OpenAI agents
      const mcpServer = new MCPServerStreamableHttp({
        url: server.url,
        name: server.mcpServerName,
        requestInit: {
          headers: headers,
        }
      });

      mcpServers.push(mcpServer);
    }

    agent.mcpServers = agent.mcpServers ?? [];
    agent.mcpServers.push(...mcpServers);

    return agent;
  }
}