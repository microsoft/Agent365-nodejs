// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpToolServerConfigurationService, McpClientTool, Utility } from '@microsoft/agents-a365-tooling';
import { AgenticAuthenticationService, Authorization } from '@microsoft/agents-a365-runtime';

// OpenAI Agents SDK
import { Agent, MCPServerStreamableHttp } from '@openai/agents';
import { TurnContext } from '@microsoft/agents-hosting';

/**
 * Discover MCP servers and list tools formatted for the Claude SDK.
 * Use getMcpServers to fetch server configs and getTools to enumerate tools.
 */
export class McpToolRegistrationService {
  private configService: McpToolServerConfigurationService  = new McpToolServerConfigurationService();

  async addMcpToolServers(
    agent: Agent,
    agentUserId: string,
    environmentId: string,
    authorization: Authorization,
    turnContext: TurnContext,
    authToken: string = ''
  ): Promise<void> {

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
  }

  /**
   * Connect to the MCP server and return tools with names prefixed by the server name.
   * Throws if the server URL is missing or the client fails to list tools.
   */
  async getTools(mcpServerConfig: MCPServerStreamableHttp): Promise<McpClientTool[]> {
    if (!mcpServerConfig) {
      throw new Error('MCP Server Configuration is required');
    }

    await mcpServerConfig.connect();
    const tools = await mcpServerConfig.listTools();
    await mcpServerConfig.close();

    return tools as McpClientTool[];
  }
}