// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpToolServerConfigurationService, McpClientTool, Utility, MCPServerConfig, ToolOptions } from '@microsoft/agents-a365-tooling';
import { AgenticAuthenticationService, IConfigurationProvider } from '@microsoft/agents-a365-runtime';
import { ClaudeToolingConfiguration, defaultClaudeToolingConfigurationProvider } from './configuration';

// Agents SDK
import { TurnContext, Authorization } from '@microsoft/agents-hosting';

// Claude SDK expects a different shape for MCP server configs
import type { McpServerConfig, Options } from '@anthropic-ai/claude-agent-sdk';

// MCP server configs created by addToolServersToAgent. Each one carries the request headers of the
// call that created it, so a later call removes it from the options before adding its own servers.
const sdkCreatedServerConfigs = new WeakSet<object>();

/**
 * Discover MCP servers and list tools formatted for the Claude SDK.
 * Use getMcpServers to fetch server configs and getTools to enumerate tools.
 */
export class McpToolRegistrationService {
  private readonly configService: McpToolServerConfigurationService;
  private readonly configProvider: IConfigurationProvider<ClaudeToolingConfiguration>;
  private readonly orchestratorName: string = "Claude";

  /**
   * Construct a McpToolRegistrationService.
   * @param configProvider Optional configuration provider. Defaults to defaultClaudeToolingConfigurationProvider if not specified.
   */
  constructor(configProvider?: IConfigurationProvider<ClaudeToolingConfiguration>) {
    this.configProvider = configProvider ?? defaultClaudeToolingConfigurationProvider;
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

    // Remove the servers an earlier call added, and their allowed tools, before anything below can
    // throw. Assign new containers so objects shared with other options (for example through
    // `{ ...baseOptions }`) are not changed.
    const previousServers = Object.entries(agentOptions.mcpServers ?? {});
    const staleServerNames = previousServers
      .filter(([, config]) => sdkCreatedServerConfigs.has(config))
      .map(([name]) => name);
    if (staleServerNames.length > 0) {
      const staleToolPrefixes = staleServerNames.map((name) => `mcp__${name}__`);
      agentOptions.mcpServers = Object.fromEntries(
        previousServers.filter(([, config]) => !sdkCreatedServerConfigs.has(config))
      );
      agentOptions.allowedTools = agentOptions.allowedTools?.filter(
        (tool) => !staleToolPrefixes.some((prefix) => tool.startsWith(prefix))
      );
    }

    if (!authToken) {
      const scope = this.configProvider.getConfiguration().mcpPlatformAuthenticationScope;
      authToken = await AgenticAuthenticationService.GetAgenticUserToken(authorization, authHandlerName, turnContext, [scope]);
    }

    // Validate the authentication token
    Utility.ValidateAuthToken(authToken);

    const options: ToolOptions = { orchestratorName: this.orchestratorName };
    const servers = await this.configService.listToolServers(turnContext, authorization, authHandlerName, authToken, options);
    const mcpServers: Record<string, McpServerConfig> = {};
    const tools: McpClientTool[] = [];

    for (const server of servers) {
      // server.headers contains the per-audience Authorization token set by listToolServers.
      // Merge with non-auth headers (channelId, user-agent); server.headers auth takes precedence.
      const baseHeaders = Utility.GetToolRequestHeaders(authToken, turnContext, options);
      const headers = { ...baseHeaders, ...server.headers };

      // Add each server to the config object
      const serverConfig = {
        type: 'http',
        url: server.url,
        headers: headers
      } as McpServerConfig;
      sdkCreatedServerConfigs.add(serverConfig);
      mcpServers[server.mcpServerName] = serverConfig;

      let clientTools = await this.configService.getMcpClientTools(
        server.mcpServerName,
        { url: server.url, headers: headers } as MCPServerConfig,
      );

      // Claude will add a prefix to the tool name based on the server name.
      clientTools = clientTools.map((tool: McpClientTool) => ({
        name: 'mcp__' + server.mcpServerName + '__' + tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      })) as McpClientTool[];

      tools.push(...clientTools);
    }

    agentOptions.allowedTools = [...(agentOptions.allowedTools ?? []), ...tools.map(t => t.name)];

    agentOptions.mcpServers = { ...agentOptions.mcpServers, ...mcpServers };
  }
}
