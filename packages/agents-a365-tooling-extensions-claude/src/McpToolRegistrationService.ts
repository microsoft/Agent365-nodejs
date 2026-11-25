// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpToolServerConfigurationService, McpClientTool, Utility, MCPServerConfig, ToolOptions } from '@microsoft/agents-a365-tooling';
import { AgenticAuthenticationService, IConfigurationProvider } from '@microsoft/agents-a365-runtime';
import { ClaudeToolingConfiguration, defaultClaudeToolingConfigurationProvider } from './configuration';

// Agents SDK
import { TurnContext, Authorization } from '@microsoft/agents-hosting';

// Claude SDK expects a different shape for MCP server configs
import type { McpServerConfig, Options } from '@anthropic-ai/claude-agent-sdk';

interface RegistrationState {
  // MCP server configs created by addToolServersToAgent. Each one carries the request headers of the
  // call that created it, so a later call removes it from the options before adding its own servers.
  readonly sdkCreatedServerConfigs: WeakSet<object>;
  // allowedTools arrays assigned by addToolServersToAgent, and the options it registered on, mapped to
  // the entries it appended. A later call removes exactly those entries and keeps the ones the caller
  // added, also when the caller replaced the allowedTools array in between.
  readonly sdkAddedAllowedTools: WeakMap<object, string[]>;
}

// The state lives on globalThis so that every copy of this module in the process (for example the
// CommonJS and the ES module build of this package) uses the same one and recognizes the servers
// another copy added.
function getRegistrationState(): RegistrationState {
  const holder = globalThis as unknown as Record<symbol, RegistrationState | undefined>;
  const key = Symbol.for('@microsoft/agents-a365-tooling-extensions-claude/registration-state/v1');
  return (holder[key] ??= { sdkCreatedServerConfigs: new WeakSet(), sdkAddedAllowedTools: new WeakMap() });
}

const { sdkCreatedServerConfigs, sdkAddedAllowedTools } = getRegistrationState();

/**
 * Removes the servers addToolServersToAgent added to the options, and the allowedTools entries it
 * appended. New containers are assigned, so objects shared with other options (for example through
 * `{ ...baseOptions }`) are not changed.
 */
function removeAddedServers(agentOptions: Options): void {
  const previousServers = Object.entries(agentOptions.mcpServers ?? {});
  if (previousServers.some(([, config]) => sdkCreatedServerConfigs.has(config))) {
    agentOptions.mcpServers = Object.fromEntries(
      previousServers.filter(([, config]) => !sdkCreatedServerConfigs.has(config))
    );
  }
  const appendedTools =
    (agentOptions.allowedTools && sdkAddedAllowedTools.get(agentOptions.allowedTools)) ??
    sdkAddedAllowedTools.get(agentOptions);
  sdkAddedAllowedTools.delete(agentOptions);
  if (agentOptions.allowedTools && appendedTools) {
    const remainingTools = [...agentOptions.allowedTools];
    for (const tool of appendedTools) {
      const index = remainingTools.lastIndexOf(tool);
      if (index >= 0) {
        remainingTools.splice(index, 1);
      }
    }
    agentOptions.allowedTools = remainingTools;
  }
}

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
   *
   * Each server config carries the request headers of this call. Servers an earlier call added to
   * these options, and the allowedTools entries it appended, are removed first. Prepare the options
   * for each turn, for example with `{ ...baseOptions }`, and don't share them between turns that run
   * at the same time. Don't deep-copy options this method registered on (for example with
   * structuredClone or a JSON round trip) to build the options for another turn: the entries it added
   * are recognized by object identity, so in the copy they look like your own and a later call keeps
   * them.
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

    // Remove the servers an earlier call added, and the allowedTools entries it appended, before
    // anything below can throw.
    removeAddedServers(agentOptions);

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

    // Another call on these options may have added its servers while this one was discovering
    // servers. Remove those again, so this call's servers replace them instead of being merged with them.
    removeAddedServers(agentOptions);

    const allowedTools = [...(agentOptions.allowedTools ?? [])];
    const allowedNames = new Set(allowedTools);
    const addedTools: string[] = [];
    for (const { name } of tools) {
      // Names the caller already allows stay the caller's, so a later call never removes them.
      if (!allowedNames.has(name)) {
        allowedNames.add(name);
        allowedTools.push(name);
        addedTools.push(name);
      }
    }
    sdkAddedAllowedTools.set(allowedTools, addedTools);
    sdkAddedAllowedTools.set(agentOptions, addedTools);
    agentOptions.allowedTools = allowedTools;

    agentOptions.mcpServers = { ...agentOptions.mcpServers, ...mcpServers };
  }
}
