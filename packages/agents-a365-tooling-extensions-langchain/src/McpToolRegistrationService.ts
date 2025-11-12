// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Agent365 SDK
import { McpToolServerConfigurationService, Utility } from '@microsoft/agents-a365-tooling';
import { AgenticAuthenticationService } from '@microsoft/agents-a365-runtime';

// Agents SDK
import { TurnContext, Authorization } from '@microsoft/agents-hosting';

// LangChain SDKs
import { createAgent, ReactAgent } from 'langchain';
import { ClientConfig, Connection, MultiServerMCPClient } from '@langchain/mcp-adapters';

/**
 * Discover MCP servers and list tools formatted for the LangChain Orchestrator.
 * Uses listToolServers to fetch server configs and getTools to enumerate tools.
 */
export class McpToolRegistrationService {
  private configService: McpToolServerConfigurationService  = new McpToolServerConfigurationService();

  /**
   * Registers MCP tool servers and updates agent options with discovered tools and server configs.
   * Call this to enable dynamic LangChain tool access based on the current MCP environment.
   */
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

    // Validate the authentication token
    Utility.ValidateAuthToken(authToken);

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

      // Create Connection instance for LangChain agents
      mcpServers[server.mcpServerName] = {
        type: 'http',
        url: server.url,
        headers: headers
      } as Connection;
    }

    const mcpClientConfig = {} as ClientConfig;
    mcpClientConfig.mcpServers = Object.assign(mcpClientConfig.mcpServers ?? {}, mcpServers);
    const multiServerMcpClient = new MultiServerMCPClient(mcpClientConfig);
    const mcpTools = await multiServerMcpClient.getTools();
    
    // Merge MCP tools with existing agent tools
    const allTools = [...(agent.options.tools ?? []), ...mcpTools];

    // Create the agent with existing options and new tools
    return createAgent({
      ...agent.options,
      tools: allTools,
    });
  }
}