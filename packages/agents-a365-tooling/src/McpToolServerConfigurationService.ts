// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { TurnContext, Authorization } from '@microsoft/agents-hosting';
import { OperationResult, OperationError, IConfigurationProvider, AgenticAuthenticationService, Utility as RuntimeUtility } from '@microsoft/agents-a365-runtime';
import { MCPServerConfig, MCPServerManifestEntry, McpClientTool, ToolOptions } from './contracts';
import { ChatHistoryMessage, ChatMessageRequest } from './models/index';
import { Utility } from './Utility';
import { ToolingConfiguration, defaultToolingConfigurationProvider, resolveTokenScopeForServer } from './configuration';

import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

/**
 * Resolves a Bearer token for one MCP server given its computed scope.
 * Returns null when no token is available (dev no-op); prod implementations throw instead.
 */
type TokenAcquirer = (server: MCPServerConfig, scope: string) => Promise<string | null>;

/**
 * Service responsible for discovering and normalizing MCP (Model Context Protocol)
 * tool servers and producing configuration objects consumable by the Claude SDK.
 */
export class McpToolServerConfigurationService {
  private readonly logger = console;
  private readonly configProvider: IConfigurationProvider<ToolingConfiguration>;

  /**
   * Construct a McpToolServerConfigurationService.
   * @param configProvider Optional configuration provider. Defaults to defaultToolingConfigurationProvider if not specified.
   */
  constructor(configProvider?: IConfigurationProvider<ToolingConfiguration>) {
    this.configProvider = configProvider ?? defaultToolingConfigurationProvider;
  }

  /**
   * Return MCP server definitions for the given agent. In development (NODE_ENV=Development) this reads the local ToolingManifest.json; otherwise it queries the remote tooling gateway.
   *
   * @deprecated Use the overload with TurnContext and Authorization parameters instead to enable x-ms-agentid header support and automatic token generation.
   * @param agenticAppId The agentic app id for which to discover servers.
   * @param authToken Bearer token used when querying the remote tooling gateway.
   * @returns A promise resolving to an array of normalized MCP server configuration objects.
   */
  async listToolServers(agenticAppId: string, authToken: string): Promise<MCPServerConfig[]>;

  /**
   * Return MCP server definitions for the given agent. In development (NODE_ENV=Development) this reads the local ToolingManifest.json; otherwise it queries the remote tooling gateway.
   *
   * @deprecated Use the overload with TurnContext and Authorization parameters instead to enable x-ms-agentid header support and automatic token generation.
   * @param agenticAppId The agentic app id for which to discover servers.
   * @param authToken Bearer token used when querying the remote tooling gateway.
   * @param options Optional tool options when calling the gateway.
   * @returns A promise resolving to an array of normalized MCP server configuration objects.
   */
  async listToolServers(agenticAppId: string, authToken: string, options?: ToolOptions): Promise<MCPServerConfig[]>;

  /**
   * Return MCP server definitions for the given agent. In development (NODE_ENV=Development) this reads the local ToolingManifest.json; otherwise it queries the remote tooling gateway.
   * This overload automatically resolves the agenticAppId from the TurnContext and generates the auth token if not provided.
   *
   * @param turnContext The TurnContext of the current request.
   * @param authorization Authorization object for token exchange.
   * @param authHandlerName The name of the auth handler to use for token exchange.
   * @param authToken Optional bearer token. If not provided, will be auto-generated via token exchange.
   * @param options Optional tool options when calling the gateway.
   * @returns A promise resolving to an array of normalized MCP server configuration objects.
   */
  async listToolServers(turnContext: TurnContext, authorization: Authorization, authHandlerName: string, authToken?: string, options?: ToolOptions): Promise<MCPServerConfig[]>;

  async listToolServers(
    agenticAppIdOrTurnContext: string | TurnContext,
    authTokenOrAuthorization: string | Authorization,
    optionsOrAuthHandlerName?: ToolOptions | string,
    authTokenOrOptions?: string | ToolOptions,
    options?: ToolOptions
  ): Promise<MCPServerConfig[]> {
    // Detect which signature is being used based on the type of the first parameter
    if (typeof agenticAppIdOrTurnContext === 'string') {
      // LEGACY PATH: listToolServers(agenticAppId, authToken, options?)
      const agenticAppId = agenticAppIdOrTurnContext;

      // Runtime validation for legacy signature parameters
      if (typeof authTokenOrAuthorization !== 'string') {
        throw new Error('authToken must be a string when using the legacy listToolServers(agenticAppId, authToken) signature');
      }
      const authToken = authTokenOrAuthorization;
      const toolOptions = optionsOrAuthHandlerName as ToolOptions | undefined;

      const servers = await (this.isDevScenario()
        ? this.getMCPServerConfigsFromManifest()
        : this.getMCPServerConfigsFromToolingGateway(agenticAppId, authToken, undefined, toolOptions));

      // Apply per-audience tokens on the legacy path too, using the same structural path as the
      // new overload so V2 servers are never silently missing an Authorization header.
      // Dev: reads from BEARER_TOKEN_<NAME> / BEARER_TOKEN env vars, supports V1 and V2.
      // Prod: uses the shared authToken for V1 servers; throws for V2 servers (OBO requires
      //       Authorization and authHandlerName — use the TurnContext-based overload instead).
      const acquire = this.isDevScenario()
        ? this.createDevTokenAcquirer()
        : this.createLegacyProdTokenAcquirer(authToken);

      return await this.attachPerAudienceTokens(servers, acquire);
    } else {
      // NEW PATH: listToolServers(turnContext, authorization, authHandlerName, authToken?, options?)
      const turnContext = agenticAppIdOrTurnContext;

      // Runtime validation for new signature parameters
      if (typeof authTokenOrAuthorization === 'string') {
        throw new Error('authorization must be an Authorization object when using the new listToolServers(turnContext, authorization, authHandlerName) signature');
      }
      if (typeof optionsOrAuthHandlerName !== 'string') {
        throw new Error('authHandlerName must be a string when using the new listToolServers(turnContext, authorization, authHandlerName) signature');
      }

      const authorization = authTokenOrAuthorization;
      const authHandlerName = optionsOrAuthHandlerName;
      let authToken = authTokenOrOptions as string | undefined;
      const toolOptions = options;

      // Auto-generate token if not provided
      if (!authToken) {
        const scopes = [this.configProvider.getConfiguration().mcpPlatformAuthenticationScope];
        authToken = await AgenticAuthenticationService.GetAgenticUserToken(authorization, authHandlerName, turnContext, scopes);
        if (!authToken) {
          throw new Error('Failed to obtain authentication token from token exchange');
        }
      }

      // Note: Token validation (format/expiration) is performed inside getMCPServerConfigsFromToolingGateway()
      // to avoid duplicate validation (it's also called by the legacy path)

      // Resolve agenticAppId from TurnContext
      const agenticAppId = RuntimeUtility.ResolveAgentIdentity(turnContext, authToken);

      // Discover servers: manifest in dev, gateway in prod
      const servers = await (this.isDevScenario()
        ? this.getMCPServerConfigsFromManifest()
        : this.getMCPServerConfigsFromToolingGateway(agenticAppId, authToken, turnContext, toolOptions));

      // Acquire and attach per-server tokens via the same structural path in both envs.
      // Token source differs: env vars in dev, OBO in prod.
      const acquire = this.isDevScenario()
        ? this.createDevTokenAcquirer()
        : this.createOboTokenAcquirer(authorization, authHandlerName, turnContext);

      return await this.attachPerAudienceTokens(servers, acquire);
    }
  }

  /**
   * Acquire one token per unique audience across the provided server list and attach
   * the correct `Authorization: Bearer` header to each server's headers.
   * V1 servers (no `audience` field, or ATG AppId) all share the same token (one exchange).
   * V2 servers each get a token scoped to their own audience GUID.
   * Token acquisition is delegated to `acquire`, enabling different strategies in dev
   * (env vars via createDevTokenAcquirer) and prod (OBO via createOboTokenAcquirer)
   * while keeping scope resolution, deduplication, and header attachment identical.
   */
  private async attachPerAudienceTokens(
    servers: MCPServerConfig[],
    acquire: TokenAcquirer
  ): Promise<MCPServerConfig[]> {
    // Fetch once so scope resolution and the legacy-path guard use the same value.
    const sharedScope = this.configProvider.getConfiguration().mcpPlatformAuthenticationScope;
    const tokenCache = new Map<string, string | null>(); // scope → token (null = no token available)

    const result: MCPServerConfig[] = [];
    for (const server of servers) {
      const scope = resolveTokenScopeForServer(server, sharedScope);
      if (!tokenCache.has(scope)) {
        tokenCache.set(scope, await acquire(server, scope));
      }
      const token = tokenCache.get(scope) as string | null;
      result.push(token
        ? { ...server, headers: { ...server.headers, Authorization: `Bearer ${token}` } }
        : server // no token available — dev no-op; prod acquirer would have thrown already
      );
    }
    return result;
  }

  /**
   * Returns a TokenAcquirer that resolves tokens from environment variables (local dev only).
   * Resolution order per server:
   *   1. BEARER_TOKEN_<MCPSERVERNAME_UPPER>  — per-server token (effective for V2 unique audiences)
   *   2. BEARER_TOKEN                         — shared fallback (V1 servers share one token)
   * Returns null when neither variable is set; no Authorization header is attached.
   */
  private createDevTokenAcquirer(): TokenAcquirer {
    return (server, _scope) => {
      const token = this.configProvider.getConfiguration().getBearerTokenForServer(server.mcpServerName ?? '');
      return Promise.resolve(token ?? null);
    };
  }

  /**
   * Returns a TokenAcquirer for the deprecated legacy (agenticAppId, authToken) overload in prod.
   * V1 servers (ATG shared scope) receive the caller-supplied authToken directly.
   * V2 servers (per-audience scope) throw immediately — OBO exchange requires Authorization and
   * authHandlerName which the legacy signature does not provide; callers must migrate to the
   * TurnContext-based overload.
   */
  private createLegacyProdTokenAcquirer(authToken: string): TokenAcquirer {
    const sharedScope = this.configProvider.getConfiguration().mcpPlatformAuthenticationScope;
    return (server, scope) => {
      if (scope !== sharedScope) {
        throw new Error(
          `MCP server '${server.mcpServerName}' requires a per-audience token (scope: '${scope}'). ` +
          `Per-audience token exchange is not supported by the deprecated listToolServers(agenticAppId, authToken) overload. ` +
          `Migrate to listToolServers(turnContext, authorization, authHandlerName) instead.`
        );
      }
      return Promise.resolve(authToken);
    };
  }

  /**
   * Returns a TokenAcquirer that performs OBO token exchange via AgenticAuthenticationService.
   * Throws if the exchange returns null so callers receive an explicit error rather than a
   * silently missing Authorization header.
   */
  private createOboTokenAcquirer(
    authorization: Authorization,
    authHandlerName: string,
    turnContext: TurnContext
  ): TokenAcquirer {
    return async (server, scope) => {
      const token = await AgenticAuthenticationService.GetAgenticUserToken(
        authorization, authHandlerName, turnContext, [scope]
      );
      if (!token) {
        throw new Error(`Failed to obtain token for MCP server '${server.mcpServerName}' (scope: ${scope})`);
      }
      return token;
    };
  }

  /**
   * Connect to the MCP server and return tools with names prefixed by the server name.
   * Throws if the server URL is missing or the client fails to list tools.
   */
  async getMcpClientTools(mcpServerName: string, mcpServerConfig: MCPServerConfig): Promise<McpClientTool[]> {
    if (!mcpServerConfig) {
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
      name: mcpServerName + ' Client',
      version: '1.0',
    });

    await mcpClient.connect(transport);
    const toolsObj = await mcpClient.listTools();
    await mcpClient.close();

    return toolsObj.tools;
  }

  /**
   * Sends chat history to the MCP platform for real-time threat protection.
   * 
   * @param turnContext The turn context containing conversation information.
   * @param chatHistoryMessages The chat history messages to send.
   * @returns A Promise that resolves to an OperationResult indicating success or failure.
   * @throws Error if turnContext or chatHistoryMessages is null/undefined.
   * @throws Error if required turn context properties (Conversation.Id, Activity.Id, or Activity.Text) are null.
   * @remarks
   * HTTP exceptions (network errors, timeouts) are caught and logged but not rethrown.
   * Instead, the method returns an OperationResult indicating whether the operation succeeded or failed.
   * Callers can choose to inspect the result for error handling or ignore it if error details are not needed.
   */
  async sendChatHistory(turnContext: TurnContext, chatHistoryMessages: ChatHistoryMessage[]): Promise<OperationResult>;

  /**
   * Sends chat history to the MCP platform for real-time threat protection.
   * 
   * @param turnContext The turn context containing conversation information.
   * @param chatHistoryMessages The chat history messages to send.
   * @param options Optional tool options for sending chat history.
   * @returns A Promise that resolves to an OperationResult indicating success or failure.
   * @throws Error if turnContext or chatHistoryMessages is null/undefined.
   * @throws Error if required turn context properties (Conversation.Id, Activity.Id, or Activity.Text) are null.
   * @remarks
   * HTTP exceptions (network errors, timeouts) are caught and logged but not rethrown.
   * Instead, the method returns an OperationResult indicating whether the operation succeeded or failed.
   * Callers can choose to inspect the result for error handling or ignore it if error details are not needed.
   */
  async sendChatHistory(turnContext: TurnContext, chatHistoryMessages: ChatHistoryMessage[], options?: ToolOptions): Promise<OperationResult>;

  async sendChatHistory(turnContext: TurnContext, chatHistoryMessages: ChatHistoryMessage[], options?: ToolOptions): Promise<OperationResult> {
    if (!turnContext) {
      throw new Error('turnContext is required');
    }
    if (!chatHistoryMessages) {
      throw new Error('chatHistoryMessages is required');
    }

    // Extract required information from turn context
    const conversationId = turnContext.activity?.conversation?.id;
    if (!conversationId) {
      throw new Error('Conversation ID is required but not found in turn context');
    }

    const messageId = turnContext.activity?.id;
    if (!messageId) {
      throw new Error('Message ID is required but not found in turn context');
    }

    const userMessage = turnContext.activity?.text;
    if (!userMessage) {
      throw new Error('User message is required but not found in turn context');
    }

    // Get the endpoint URL
    const endpoint = this.getChatHistoryEndpoint();

    this.logger.info(`Sending chat history to endpoint: ${endpoint}`);

    // Create the request payload
    const request: ChatMessageRequest = {
      conversationId,
      messageId,
      userMessage,
      chatHistory: chatHistoryMessages
    };

    try {
      const headers = Utility.GetToolRequestHeaders(undefined, turnContext, options);
      
      await axios.post(
        endpoint,
        request,
        {
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10 seconds timeout
        }
      );

      this.logger.info('Successfully sent chat history to MCP platform');
      return OperationResult.success;
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      
      if (axios.isAxiosError(err)) {
        if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
          this.logger.error(`Request timeout sending chat history to '${endpoint}': ${error.message}`);
        } else {
          this.logger.error(`HTTP error sending chat history to '${endpoint}': ${error.message}`);
        }
      } else {
        this.logger.error(`Failed to send chat history to '${endpoint}': ${error.message}`);
      }
      
      return OperationResult.failed(new OperationError(error));
    }
  }

  /**
   * Query the tooling gateway for MCP servers for the specified agent and normalize each entry's mcpServerUniqueName into a full URL using Utility.BuildMcpServerUrl.
   * Throws an error if the gateway call fails.
   *
   * @param agenticAppId The agentic app id used by the tooling gateway to scope results.
   * @param authToken Optional Bearer token to include in the Authorization header when calling the gateway.
   * @param turnContext Optional TurnContext for extracting agent blueprint ID for request headers.
   * @param options Optional tool options when calling the gateway.
   * @throws Error when the gateway call fails or returns an unexpected payload.
   */
  private async getMCPServerConfigsFromToolingGateway(agenticAppId: string, authToken: string, turnContext?: TurnContext, options?: ToolOptions): Promise<MCPServerConfig[]> {
    // Validate the authentication token
    Utility.ValidateAuthToken(authToken);

    const configEndpoint = this.getToolingGatewayUrl(agenticAppId);

    try {
      const response = await axios.get(
        configEndpoint,
        {
          headers: Utility.GetToolRequestHeaders(authToken, turnContext, options),
          timeout: 10000 // 10 seconds timeout
        }
      );

      const rawServers: MCPServerConfig[] = response.data || [];
      return rawServers.map(s => ({
        mcpServerName: s.mcpServerName,
        url: s.url,
        headers: s.headers,
        audience: s.audience,
        scope: s.scope,
        publisher: s.publisher,
      }));
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      throw new Error(`Failed to read MCP servers from endpoint: ${error.code || 'UNKNOWN'} ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Read MCP servers from a local ToolingManifest.json file (development only).
   * Searches process.cwd() and process.argv[1] for the manifest file.
   *
   * Reads MCP server configurations from ToolingManifest.json in the application's content root.
   * The file should be located at: [ProjectRoot]/ToolingManifest.json
   *
   * Example ToolingManifest.json:
   * {
   *   "mcpServers": [
   *     {
   *       "mcpServerName": "mailMCPServerConfig",
   *       "mcpServerUniqueName": "mcp_MailTools"
   *     },
   *     {
   *       "mcpServerName": "sharePointMCPServerConfig",
   *       "mcpServerUniqueName": "mcp_SharePointTools"
   *     }
   *   ]
   * }
   *
   * Each server entry can optionally include a "url" field to specify a custom MCP server URL.
   * If the "url" field is not provided, the URL will be automatically constructed using the server name.
   * The server name is determined by using "mcpServerName" if present, otherwise "mcpServerUniqueName".
   */
  private async getMCPServerConfigsFromManifest(): Promise<MCPServerConfig[]> {
    let manifestPath = path.join(process.cwd(), 'ToolingManifest.json');
    if (!fs.existsSync(manifestPath)) {
      this.logger.warn(`ToolingManifest.json not found at ${manifestPath}, checking argv[1] location.`);
      manifestPath = path.join(path.dirname(process.argv[1] || ''), 'ToolingManifest.json');
    }

    if (!fs.existsSync(manifestPath)) {
      this.logger.warn(`ToolingManifest.json not found at ${manifestPath}`);
      return [];
    }

    try {
      const jsonContent = fs.readFileSync(manifestPath, 'utf-8');
      const manifestData = JSON.parse(jsonContent);
      const mcpServers = manifestData.mcpServers || [];

      return mcpServers.map((s: MCPServerManifestEntry) => {
        // Use mcpServerName if available, otherwise fall back to mcpServerUniqueName
        const serverName = s.mcpServerName || s.mcpServerUniqueName;
        if (!serverName) {
          throw new Error('Either mcpServerName or mcpServerUniqueName must be provided in manifest entry');
        }
        return {
          mcpServerName: serverName,
          url: s.url || this.buildMcpServerUrl(serverName),
          headers: s.headers,
          audience: s.audience,
          scope: s.scope,
          publisher: s.publisher,
        };
      });
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`Error reading or parsing ToolingManifest.json: ${error.message || 'Unknown error'}`);
      return [];
    }
  }

  /**
   * Detect if the process is running in a development scenario based on configuration.
   *
   * @returns {boolean} True when running in a development environment (NODE_ENV=Development).
   */
  private isDevScenario(): boolean {
    return this.configProvider.getConfiguration().useToolingManifest;
  }

  /**
   * Gets the base URL for MCP platform from configuration.
   */
  private getMcpPlatformBaseUrl(): string {
    return this.configProvider.getConfiguration().mcpPlatformEndpoint;
  }

  /**
   * Construct the tooling gateway URL for a given agent identity.
   */
  private getToolingGatewayUrl(agenticAppId: string): string {
    return `${this.getMcpPlatformBaseUrl()}/agents/v2/${agenticAppId}/mcpServers`;
  }

  /**
   * Build the full URL for accessing a specific MCP server.
   */
  private buildMcpServerUrl(serverName: string): string {
    return `${this.getMcpPlatformBaseUrl()}/agents/servers/${serverName}/`;
  }

  /**
   * Constructs the endpoint URL for sending chat history.
   */
  private getChatHistoryEndpoint(): string {
    return `${this.getMcpPlatformBaseUrl()}/agents/real-time-threat-protection/chat-message`;
  }
}
