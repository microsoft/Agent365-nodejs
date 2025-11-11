// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpToolServerConfigurationService, McpClientTool, Utility, MCPServerConfig } from '@microsoft/agents-a365-tooling';
import { AgenticAuthenticationService } from '@microsoft/agents-a365-runtime';

// Agents SDK
import { TurnContext, Authorization } from '@microsoft/agents-hosting';

// Claude SDK expects a different shape for MCP server configs
import type { McpServerConfig, Options } from '@anthropic-ai/claude-agent-sdk';

/**
 * Discover MCP servers and list tools formatted for the Claude SDK.
 * Use getMcpServers to fetch server configs and getTools to enumerate tools.
 */
export class McpToolRegistrationService {
  private readonly configService: McpToolServerConfigurationService = new McpToolServerConfigurationService();

  /**
   * Registers MCP tool servers and updates agent options with discovered tools and server configs.
   * Call this to enable dynamic Claude tool access based on the current MCP environment.
   */
  async addToolServersToAgent(
    agentOptions: Options,
    agentUserId: string,
    environmentId: string,
    authorization: Authorization,
    turnContext: TurnContext,
    authToken: string
  ): Promise<void> {

    if (!agentOptions) {
      throw new Error('Agent Options is Required');
    }

    if (!authToken) {
      authToken = await AgenticAuthenticationService.GetAgenticUserToken(authorization, turnContext);
    }

    // Validate the authentication token
    Utility.ValidateAuthToken(authToken);

    const servers = await this.configService.listToolServers(agentUserId, environmentId, authToken);
    const mcpServers: Record<string, McpServerConfig> = {};
    const tools: McpClientTool[] = [];

    for (const server of servers) {
      // Compose headers if values are available
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      if (Utility.GetUseEnvironmentId() && environmentId) {
        headers['x-ms-environment-id'] = environmentId;
      }

      // Add each server to the config object
      mcpServers[server.mcpServerName] = {
        type: 'http',
        url: server.url,
        headers: headers
      } as McpServerConfig;

      let clientTools = await this.configService.getMcpClientTools(
        server.mcpServerName,
        {
          url: server.url,
          headers: headers
        } as MCPServerConfig,
      );

      // Claude will add a prefix to the tool name based on the server name.
      clientTools = clientTools.map((tool: McpClientTool) => ({
        name: 'mcp__' + server.mcpServerName + '__' + tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      })) as McpClientTool[];

      tools.push(...clientTools);
    }

    agentOptions.allowedTools = agentOptions.allowedTools ?? [];
    agentOptions.allowedTools.push(...tools.map(t => t.name));

    agentOptions.mcpServers = Object.assign(agentOptions.mcpServers ?? {}, mcpServers);
  }
}