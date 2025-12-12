// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Microsoft Agent 365 SDK
import { McpToolServerConfigurationService, Utility, ToolOptions } from '@microsoft/agents-a365-tooling';
import { AgenticAuthenticationService, Utility as RuntimeUtility } from '@microsoft/agents-a365-runtime';

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
  private readonly orchestratorName: string = "LangChain";

  /**
   * Registers MCP tool servers and updates agent options with discovered tools and server configs.
   * Call this to enable dynamic LangChain tool access based on the current MCP environment.
   * @param agent The LangChain Agent instance to which MCP servers will be added.
   * @param authorization Authorization object for token exchange.
   * @param authHandlerName The name of the auth handler to use for token exchange.
   * @param turnContext The TurnContext of the current request.
   * @param authToken Optional bearer token for MCP server access.
   * @returns The updated Agent instance with registered MCP servers.
   */
  async addToolServersToAgent(
    agent: ReactAgent,
    authorization: Authorization,
    authHandlerName: string,
    turnContext: TurnContext,
    authToken: string
  ): Promise<ReactAgent> {

    if (!agent) {
      throw new Error('Langchain Agent is Required');
    }

    if (!authToken) {
      authToken = await AgenticAuthenticationService.GetAgenticUserToken(authorization, authHandlerName, turnContext);
    }

    // Validate the authentication token
    Utility.ValidateAuthToken(authToken);

    const agenticAppId = RuntimeUtility.ResolveAgentIdentity(turnContext, authToken);
    const options: ToolOptions = { orchestratorName: this.orchestratorName };
    const servers = await this.configService.listToolServers(agenticAppId, authToken, options);
    const mcpServers: Record<string, Connection> = {};

    for (const server of servers) {
      // Compose headers if values are available
      const headers: Record<string, string> = Utility.GetToolRequestHeaders(authToken, turnContext, options);

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
