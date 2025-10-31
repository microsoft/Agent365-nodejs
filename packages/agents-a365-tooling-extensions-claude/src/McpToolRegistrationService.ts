// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpToolServerConfigurationService, McpClientTool, Utility } from '@microsoft/agents-a365-tooling';
import { AgenticAuthenticationService, Authorization } from '@microsoft/agents-a365-runtime';

import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

// Claude SDK expects a different shape for MCP server configs
import type { McpServerConfig, Options } from '@anthropic-ai/claude-code';
import { TurnContext } from '@microsoft/agents-hosting';

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
  async addToolServers(
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

      tools.push(...await this.getTools(server.mcpServerName, mcpServers[server.mcpServerName]));
    }

    agentOptions.allowedTools = agentOptions.allowedTools ?? [];
    agentOptions.allowedTools.push(...tools.map(t => t.name));

    agentOptions.mcpServers = Object.assign(agentOptions.mcpServers ?? {}, mcpServers);
  }

  /**
   * Connect to the MCP server and return tools with names prefixed by the server name.
   * Throws if the server URL is missing or the client fails to list tools.
   */
  async getTools(mcpServerName: string, mcpServerConfig: McpServerConfig): Promise<McpClientTool[]> {
    if (!mcpServerConfig || mcpServerConfig.type !== 'http') {
      throw new Error('Invalid MCP Server Configuration');
    }

    if (!mcpServerConfig.url) {
      throw new Error('MCP Server URL cannot be null or empty');
    }

    const transport = new StreamableHTTPClientTransport(
      new URL(mcpServerConfig.url),
      {
        requestInit: {
          headers: mcpServerConfig.headers
        }
      }
    );

    const mcpClient = new Client({
      name: 'Claude ' + mcpServerName + ' Client',
      version: '1.0',
    });

    await mcpClient.connect(transport);
    const toolsObj = await mcpClient.listTools();
    await mcpClient.close();

    // Claude will add a prefix to the tool name based on the server name.
    const tools = toolsObj.tools.map(tool => ({
      name: 'mcp__' + mcpServerName + '__' + tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    })) as McpClientTool[];

    return tools;
  }
}