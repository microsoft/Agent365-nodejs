// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Agent365 SDK
import { McpToolServerConfigurationService, McpClientTool, Utility } from '@microsoft/agents-a365-tooling';
import { AgenticAuthenticationService, Authorization } from '@microsoft/agents-a365-runtime';

// Agents SDK
import { TurnContext } from '@microsoft/agents-hosting';

// LangChain SDKs
import { ClientConfig, Connection, MultiServerMCPClient } from '@langchain/mcp-adapters';
import { DynamicStructuredTool } from '@langchain/core/tools';

/**
 * Discover MCP servers and list tools formatted for the Claude SDK.
 * Use getMcpServers to fetch server configs and getTools to enumerate tools.
 */
export class McpToolRegistrationService {
  private configService: McpToolServerConfigurationService  = new McpToolServerConfigurationService();

  async addMcpToolServers(
    mcpClientConfig: ClientConfig,
    agentUserId: string,
    authorization: Authorization,
    turnContext: TurnContext,
    authToken: string
  ): Promise<DynamicStructuredTool[]> {

    if (!mcpClientConfig) {
      throw new Error('MCP Client is Required');
    }

    if (!authToken) {
      authToken = await AgenticAuthenticationService.GetAgenticUserToken(authorization, turnContext);
    }

    // Validate the authentication token
    Utility.ValidateAuthToken(authToken);

    const servers = await this.configService.listToolServers(agentUserId, authToken);

    const mcpServers: Record<string, Connection> = {};

    for (const server of servers) {
      // Compose headers if values are available
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      // Create Connection instance for OpenAI agents
      mcpServers[server.mcpServerName] = {
        type: 'http',
        url: server.url,
        headers: headers
      } as Connection;
    }

    mcpClientConfig.mcpServers = Object.assign(mcpClientConfig.mcpServers ?? {}, mcpServers);
    const multiServerMcpClient = new MultiServerMCPClient(mcpClientConfig);
    const mcpTools = await multiServerMcpClient.getTools();

    // Merge existing agent tools with MCP tools
    const existingTools = agent.options.tools ?? [];
    const allTools = [...existingTools, ...mcpTools];

    // Create the agent with existing options and combined tools
    return createAgent({
      ...agent.options,
      tools: allTools,
    });
  }
}