// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpToolServerConfigurationService, Utility } from '@microsoft/agents-a365-tooling';
import { AgenticAuthenticationService } from '@microsoft/agents-a365-runtime';

// Agents SDK
import { TurnContext, Authorization } from '@microsoft/agents-hosting';

// OpenAI Agents SDK
import { Agent, MCPServerStreamableHttp } from '@openai/agents';

/**
 * Discover MCP servers and list tools formatted for the Claude SDK.
 * Use getMcpServers to fetch server configs and getTools to enumerate tools.
 */
export class McpToolRegistrationService {
  private configService: McpToolServerConfigurationService  = new McpToolServerConfigurationService();

  async addToolServersToAgent(
    agent: Agent,
    agentUserId: string,
    environmentId: string,
    authorization: Authorization,
    turnContext: TurnContext,
    authToken: string
  ): Promise<Agent> {

    if (!agent) {
      throw new Error('Agent is Required');
    }

    if (!authToken) {
      authToken = await AgenticAuthenticationService.GetAgenticUserToken(authorization, turnContext);
    }

    const servers = await this.configService.listToolServers(agentUserId, environmentId, authToken);
    const mcpServers: MCPServerStreamableHttp[] = [];

    for (const server of servers) {
      // Compose headers if values are available
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      if (Utility.GetUseEnvironmentId() && environmentId) {
        headers['x-ms-environment-id'] = environmentId;
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