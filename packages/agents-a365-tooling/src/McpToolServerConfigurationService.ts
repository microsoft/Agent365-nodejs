// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { TurnContext } from '@microsoft/agents-hosting';
import { OperationResult, OperationError, IConfigurationProvider } from '@microsoft/agents-a365-runtime';
import { MCPServerConfig, MCPServerManifestEntry, McpClientTool, ToolOptions } from './contracts';
import { ChatHistoryMessage, ChatMessageRequest } from './models/index';
import { Utility } from './Utility';
import { ToolingConfiguration, defaultToolingConfigurationProvider } from './configuration';

import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

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
   * @param agenticAppId The agentic app id for which to discover servers.
   * @param authToken Optional bearer token used when querying the remote tooling gateway.
   * @returns A promise resolving to an array of normalized MCP server configuration objects.
   */
  async listToolServers(agenticAppId: string, authToken: string): Promise<MCPServerConfig[]>;

  /**
   * Return MCP server definitions for the given agent. In development (NODE_ENV=Development) this reads the local ToolingManifest.json; otherwise it queries the remote tooling gateway.
   *
   * @param agenticAppId The agentic app id for which to discover servers.
   * @param authToken Optional bearer token used when querying the remote tooling gateway.
   * @param options Optional tool options when calling the gateway.
   * @returns A promise resolving to an array of normalized MCP server configuration objects.
   */
  async listToolServers(agenticAppId: string, authToken: string, options?: ToolOptions): Promise<MCPServerConfig[]>;

  async listToolServers(agenticAppId: string, authToken: string, options?: ToolOptions): Promise<MCPServerConfig[]> {
    return await (this.isDevScenario() ? this.getMCPServerConfigsFromManifest() :
      this.getMCPServerConfigsFromToolingGateway(agenticAppId, authToken, options));
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
   * @param options Optional tool options when calling the gateway.
   * @throws Error when the gateway call fails or returns an unexpected payload.
   */
  private async getMCPServerConfigsFromToolingGateway(agenticAppId: string, authToken: string, options?: ToolOptions): Promise<MCPServerConfig[]> {
    // Validate the authentication token
    Utility.ValidateAuthToken(authToken);

    const configEndpoint = this.getToolingGatewayUrl(agenticAppId);

    try {
      const response = await axios.get(
        configEndpoint,
        {
          headers: Utility.GetToolRequestHeaders(authToken, undefined, options),
          timeout: 10000 // 10 seconds timeout
        }
      );

      return (response.data) || [];
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
          headers: s.headers
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
    return `${this.getMcpPlatformBaseUrl()}/agents/${agenticAppId}/mcpServers`;
  }

  /**
   * Build the full URL for accessing a specific MCP server.
   */
  private buildMcpServerUrl(serverName: string): string {
    return `${this.getMcpPlatformBaseUrl()}/agents/servers/${serverName}`;
  }

  /**
   * Constructs the endpoint URL for sending chat history.
   */
  private getChatHistoryEndpoint(): string {
    return `${this.getMcpPlatformBaseUrl()}/agents/real-time-threat-protection/chat-message`;
  }
}
