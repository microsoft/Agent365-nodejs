// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { v4 as uuidv4 } from 'uuid';
import { McpToolServerConfigurationService, McpClientTool, Utility, MCPServerConfig, ToolOptions, ChatHistoryMessage } from '@microsoft/agents-a365-tooling';
import { AgenticAuthenticationService, OperationResult, OperationError, IConfigurationProvider } from '@microsoft/agents-a365-runtime';
import { ClaudeToolingConfiguration, defaultClaudeToolingConfigurationProvider } from './configuration';

// Agents SDK
import { TurnContext, Authorization } from '@microsoft/agents-hosting';

// Claude SDK
import type { McpServerConfig, Options, SessionMessage, GetSessionMessagesOptions } from '@anthropic-ai/claude-agent-sdk';
import { getSessionMessages } from '@anthropic-ai/claude-agent-sdk';

/**
 * Represents a content block within a Claude message payload.
 */
interface ContentBlock {
  type: string;
  text?: string;
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
      mcpServers[server.mcpServerName] = {
        type: 'http',
        url: server.url,
        headers: headers
      } as McpServerConfig;

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

    agentOptions.allowedTools = agentOptions.allowedTools ?? [];
    agentOptions.allowedTools.push(...tools.map(t => t.name));

    agentOptions.mcpServers = Object.assign(agentOptions.mcpServers ?? {}, mcpServers);
  }

  /**
   * Sends chat history from a Claude session to the MCP platform for real-time threat protection.
   *
   * This method retrieves messages from the specified Claude session using `getSessionMessages()`,
   * converts them to the `ChatHistoryMessage` format, and sends them to the MCP platform.
   *
   * @param turnContext - The turn context containing conversation information.
   * @param sessionId - The Claude session ID to retrieve messages from.
   * @param limit - Optional limit on the number of messages to send. When specified, the most recent N messages are used.
   * @param toolOptions - Optional tool options for customization.
   * @returns A Promise resolving to an OperationResult indicating success or failure.
   * @throws Error if turnContext is null/undefined.
   * @throws Error if sessionId is null/undefined/empty.
   * @throws Error if required turn context properties are missing.
   *
   * @example
   * ```typescript
   * const result = await service.sendChatHistoryAsync(turnContext, 'session-abc-123', 50);
   * if (result.succeeded) {
   *   console.log('Chat history sent successfully');
   * } else {
   *   console.error('Failed to send chat history:', result.errors);
   * }
   * ```
   */
  async sendChatHistoryAsync(
    turnContext: TurnContext,
    sessionId: string,
    limit?: number,
    toolOptions?: ToolOptions
  ): Promise<OperationResult> {
    if (!turnContext) {
      throw new Error('turnContext is required');
    }
    if (!sessionId || sessionId.trim().length === 0) {
      throw new Error('sessionId is required');
    }

    let messages: SessionMessage[];
    try {
      const options: GetSessionMessagesOptions = {};
      if (limit !== undefined && limit >= 0) {
        options.limit = limit;
      }
      messages = await getSessionMessages(sessionId, options);
    } catch (err: unknown) {
      const error = err as Error;
      return OperationResult.failed(new OperationError(error));
    }

    return await this.sendChatHistoryMessagesAsync(
      turnContext,
      messages,
      toolOptions
    );
  }

  /**
   * Sends a list of Claude session messages to the MCP platform for real-time threat protection.
   *
   * This method converts the provided SessionMessage array to `ChatHistoryMessage` format
   * and sends them to the MCP platform.
   *
   * @param turnContext - The turn context containing conversation information.
   * @param messages - Array of SessionMessage objects to send.
   * @param toolOptions - Optional ToolOptions for customization.
   * @returns A Promise resolving to an OperationResult indicating success or failure.
   * @throws Error if turnContext is null/undefined.
   * @throws Error if messages is null/undefined.
   * @throws Error if required turn context properties are missing.
   *
   * @example
   * ```typescript
   * import { getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
   * const messages = await getSessionMessages(sessionId);
   * const result = await service.sendChatHistoryMessagesAsync(turnContext, messages);
   * ```
   */
  async sendChatHistoryMessagesAsync(
    turnContext: TurnContext,
    messages: SessionMessage[],
    toolOptions?: ToolOptions
  ): Promise<OperationResult> {
    if (!turnContext) {
      throw new Error('turnContext is required');
    }
    if (!messages) {
      throw new Error('messages is required');
    }

    const effectiveOptions: ToolOptions = {
      orchestratorName: toolOptions?.orchestratorName ?? this.orchestratorName
    };

    let chatHistoryMessages: ChatHistoryMessage[];
    try {
      chatHistoryMessages = this.convertToChatHistoryMessages(messages);
    } catch (err: unknown) {
      const error = err as Error;
      return OperationResult.failed(new OperationError(error));
    }

    return await this.configService.sendChatHistory(
      turnContext,
      chatHistoryMessages,
      effectiveOptions
    );
  }

  /**
   * Converts Claude SessionMessage array to ChatHistoryMessage format.
   * @param messages - Array of SessionMessage objects to convert.
   * @returns Array of successfully converted ChatHistoryMessage objects.
   */
  private convertToChatHistoryMessages(messages: SessionMessage[]): ChatHistoryMessage[] {
    return messages
      .map(msg => this.convertSingleMessage(msg))
      .filter((msg): msg is ChatHistoryMessage => msg !== null);
  }

  /**
   * Converts a single Claude SessionMessage to ChatHistoryMessage format.
   * @param message - The SessionMessage to convert.
   * @returns A ChatHistoryMessage object, or null if conversion fails or message has no extractable content.
   */
  private convertSingleMessage(message: SessionMessage): ChatHistoryMessage | null {
    try {
      const content = this.extractContent(message);
      if (!content || content.trim().length === 0) {
        return null;
      }

      return {
        id: this.extractId(message),
        role: message.type === 'assistant' ? 'assistant' : 'user',
        content: content,
        timestamp: this.extractTimestamp(message)
      };
    } catch {
      return null;
    }
  }

  /**
   * Extracts text content from a Claude SessionMessage.
   * The message field contains the raw Anthropic API message payload with a `content`
   * property that is either a string (user shorthand) or an array of content blocks.
   * @param sessionMsg - The SessionMessage to extract content from.
   * @returns The extracted content string, or empty string if no text content found.
   */
  private extractContent(sessionMsg: SessionMessage): string {
    const payload = sessionMsg.message as { content: string | ContentBlock[] };
    const { content } = payload;

    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .filter(block => block.type === 'text' && block.text)
        .map(block => block.text!)
        .filter(text => text.length > 0)
        .join(' ');
    }

    return '';
  }

  /**
   * Extracts or generates an ID for a message.
   * @param message - The SessionMessage to extract or generate an ID for.
   * @returns The message UUID, or a newly generated UUID if not present.
   */
  private extractId(message: SessionMessage): string {
    if (message.uuid) {
      return message.uuid;
    }
    return uuidv4();
  }

  /**
   * Extracts or generates a timestamp for a message.
   * Claude SessionMessage does not include timestamps, so current UTC time is used.
   * @param _message - The SessionMessage (unused, as timestamps are always generated).
   * @returns The current Date.
   */
  private extractTimestamp(_message: SessionMessage): Date {
    return new Date();
  }
}
