// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Agent365 SDK
import { McpToolServerConfigurationService, McpClientTool, Utility } from '@microsoft/agents-a365-tooling';
import { AgenticAuthenticationService } from '@microsoft/agents-a365-runtime';

// Agents SDK
import { TurnContext, Authorization } from '@microsoft/agents-hosting';

// LangChain SDKs
import { createAgent, ReactAgent } from 'langchain';
import { ClientConfig, Connection, MultiServerMCPClient } from '@langchain/mcp-adapters';
import { DynamicStructuredTool } from '@langchain/core/tools';

/**
 * Discover MCP servers and list tools formatted for the Claude SDK.
 * Use getMcpServers to fetch server configs and getTools to enumerate tools.
 */
export class McpToolRegistrationService {
  private configService: McpToolServerConfigurationService  = new McpToolServerConfigurationService();

  async addToolServersToAgent(
    agent: ReactAgent,
    agentUserId: string,
    environmentId: string,
    authorization: Authorization,
    turnContext: TurnContext,
    authToken: string
  ): Promise<ReactAgent> {

    if (!agent) {
      throw new Error('Langchain Agent is Required');
    }

    if (!authToken) {
      authToken = await AgenticAuthenticationService.GetAgenticUserToken(authorization, turnContext);
    }

    const servers = await this.configService.listToolServers(agentUserId, environmentId, authToken);
    const mcpServers: Record<string, Connection> = {};

    for (const server of servers) {
      // Compose headers if values are available
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      if (Utility.GetUseEnvironmentId() && environmentId) {
        headers['x-ms-environment-id'] = environmentId;
      }

      // Create Connection instance for OpenAI agents
      mcpServers[server.mcpServerName] = {
        type: 'http',
        url: server.url,
        headers: headers
      } as Connection;
    }

    const mcpClientConfig = {} as ClientConfig;
    mcpClientConfig.mcpServers = Object.assign(mcpClientConfig.mcpServers ?? {}, mcpServers);
    const multiServerMcpClient = new MultiServerMCPClient(mcpClientConfig);
    const tools = await multiServerMcpClient.getTools();
    tools.push(...(agent.options.tools ?? [])); // Retain existing tools

    // Create the agent with existing options and new tools
    return createAgent({
      tools: tools,
      ...agent.options
    });
  }

  /**
   * Connect to the MCP server and return tools with names prefixed by the server name.
   * Throws if the server URL is missing or the client fails to list tools.
   */
  async getMcpServerTools(mcpServerName: string, mcpServerConnection: Connection): Promise<McpClientTool[]> {
    if (!mcpServerConnection) {
      throw new Error('MCP Server Connection is required');
    }

    const mcpClientConfig: ClientConfig = {
      mcpServers: {
        [mcpServerName]: mcpServerConnection
      }
    };

    const multiServerMcpClient = new MultiServerMCPClient(mcpClientConfig);
    return (await multiServerMcpClient.getTools()).map((tool: DynamicStructuredTool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.schema
    })) as McpClientTool[];
  }
}