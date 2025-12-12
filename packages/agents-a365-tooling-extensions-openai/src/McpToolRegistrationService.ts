// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpToolServerConfigurationService, Utility, ToolOptions } from '@microsoft/agents-a365-tooling';
import { AgenticAuthenticationService, Utility as RuntimeUtility } from '@microsoft/agents-a365-runtime';

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
  private readonly orchestratorName: string = "OpenAI";


  /**
   * Registers MCP tool servers and updates agent options with discovered tools and server configs.
   * Call this to enable dynamic OpenAI tool access based on the current MCP environment.
   * @param agent The OpenAI Agent instance to which MCP servers will be added.
   * @param authorization Authorization object for token exchange.
   * @param authHandlerName The name of the auth handler to use for token exchange.
   * @param turnContext The TurnContext of the current request.
   * @param authToken Optional bearer token for MCP server access.
   * @returns The updated Agent instance with registered MCP servers.
   */
  async addToolServersToAgent(
    agent: Agent,
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

    const agenticAppId = RuntimeUtility.ResolveAgentIdentity(turnContext, authToken);
    const options: ToolOptions = { orchestratorName: this.orchestratorName, turnContext: turnContext };
    const servers = await this.configService.listToolServers(agenticAppId, authToken, options);
    const mcpServers: MCPServerStreamableHttp[] = [];

    for (const server of servers) {
      // Compose headers if values are available
      const headers: Record<string, string> = Utility.GetToolRequestHeaders(authToken, options);

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
