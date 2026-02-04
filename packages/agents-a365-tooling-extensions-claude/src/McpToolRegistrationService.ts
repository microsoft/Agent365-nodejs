// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpToolServerConfigurationService, McpClientTool, Utility, MCPServerConfig, ToolOptions, ToolingConfiguration, defaultToolingConfigurationProvider } from '@microsoft/agents-a365-tooling';
import { AgenticAuthenticationService, Utility as RuntimeUtility, IConfigurationProvider } from '@microsoft/agents-a365-runtime';

// Agents SDK
import { TurnContext, Authorization } from '@microsoft/agents-hosting';

// Claude SDK expects a different shape for MCP server configs
import type { McpServerConfig, Options } from '@anthropic-ai/claude-agent-sdk';

/**
 * Discover MCP servers and list tools formatted for the Claude SDK.
 * Use getMcpServers to fetch server configs and getTools to enumerate tools.
 */
export class McpToolRegistrationService {
  private readonly configService: McpToolServerConfigurationService;
  private readonly configProvider: IConfigurationProvider<ToolingConfiguration>;
  private readonly orchestratorName: string = "Claude";

  /**
   * Construct a McpToolRegistrationService.
   * @param configProvider Optional configuration provider. Defaults to defaultToolingConfigurationProvider if not specified.
   */
  constructor(configProvider?: IConfigurationProvider<ToolingConfiguration>) {
    this.configProvider = configProvider ?? defaultToolingConfigurationProvider;
    this.configService = new McpToolServerConfigurationService(this.configProvider);
  }

  /**
   * Registers MCP tool servers and updates agent options with discovered tools and server configs.
   * Call this to enable dynamic Claude tool access.
   * @param agentOptions The Claude Agent options to which MCP servers will be added.
   * @param authorization Authorization object for token exchange.
   * @param authHandlerName The name of the auth handler to use for token exchange.
   * @param turnContext The TurnContext of the current request.
   * @param authToken Optional bearer token for MCP server access.
   */
  async addToolServersToAgent(
    agentOptions: Options,
    authorization: Authorization,
    authHandlerName: string,
    turnContext: TurnContext,
    authToken: string
  ): Promise<void> {

    if (!agentOptions) {
      throw new Error('Agent Options is Required');
    }

    if (!authToken) {
      const scope = this.configProvider.getConfiguration().mcpPlatformAuthenticationScope;
      authToken = await AgenticAuthenticationService.GetAgenticUserToken(authorization, authHandlerName, turnContext, [scope]);
    }

    // Validate the authentication token
    Utility.ValidateAuthToken(authToken);

    const agenticAppId = RuntimeUtility.ResolveAgentIdentity(turnContext, authToken);
    const options: ToolOptions = { orchestratorName: this.orchestratorName };
    const servers = await this.configService.listToolServers(agenticAppId, authToken, options);
    const mcpServers: Record<string, McpServerConfig> = {};
    const tools: McpClientTool[] = [];

    for (const server of servers) {
      const headers: Record<string, string> = Utility.GetToolRequestHeaders(authToken, turnContext, options);

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
