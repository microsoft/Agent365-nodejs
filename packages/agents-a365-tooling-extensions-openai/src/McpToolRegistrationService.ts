// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { v4 as uuidv4 } from 'uuid';
import { McpToolServerConfigurationService, Utility, ToolOptions, ChatHistoryMessage, ToolingConfiguration, defaultToolingConfigurationProvider } from '@microsoft/agents-a365-tooling';
import { AgenticAuthenticationService, Utility as RuntimeUtility, OperationResult, OperationError, IConfigurationProvider } from '@microsoft/agents-a365-runtime';

// Agents SDK
import { TurnContext, Authorization } from '@microsoft/agents-hosting';

// OpenAI Agents SDK
import { Agent, MCPServerStreamableHttp, AgentInputItem } from '@openai/agents';
import { OpenAIConversationsSession } from '@openai/agents-openai';

/**
 * Discover MCP servers and list tools formatted for the OpenAI Agents SDK.
 * Uses listToolServers to fetch server configs.
 */
export class McpToolRegistrationService {
  private readonly configService: McpToolServerConfigurationService;
  private readonly configProvider: IConfigurationProvider<ToolingConfiguration>;
  private readonly orchestratorName: string = "OpenAI";

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
      const scope = this.configProvider.getConfiguration().mcpPlatformAuthenticationScope;
      authToken = await AgenticAuthenticationService.GetAgenticUserToken(authorization, authHandlerName, turnContext, [scope]);
    }

    // Validate the authentication token
    Utility.ValidateAuthToken(authToken);

    const agenticAppId = RuntimeUtility.ResolveAgentIdentity(turnContext, authToken);
    const options: ToolOptions = { orchestratorName: this.orchestratorName };
    const servers = await this.configService.listToolServers(agenticAppId, authToken, options);
    const mcpServers: MCPServerStreamableHttp[] = [];

    for (const server of servers) {
      // Compose headers if values are available
      const headers: Record<string, string> = Utility.GetToolRequestHeaders(authToken, turnContext, options);

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

  /**
   * Sends chat history from an OpenAI Session to the MCP platform for real-time threat protection.
   *
   * This method extracts messages from the provided OpenAI Session using `getItems()`,
   * converts them to the `ChatHistoryMessage` format, and sends them to the MCP platform.
   *
   * @param turnContext - The turn context containing conversation information.
   * @param session - The OpenAI Session instance to extract messages from.
   * @param limit - Optional limit on the number of messages to retrieve from the session.
   * @param toolOptions - Optional tool options for customization.
   * @returns A Promise resolving to an OperationResult indicating success or failure.
   * @throws Error if turnContext is null/undefined.
   * @throws Error if session is null/undefined.
   * @throws Error if required turn context properties are missing.
   *
   * @example
   * ```typescript
   * const session = new OpenAIConversationsSession(sessionOptions);
   * const result = await service.sendChatHistoryAsync(turnContext, session, 50);
   * if (result.succeeded) {
   *   console.log('Chat history sent successfully');
   * } else {
   *   console.error('Failed to send chat history:', result.errors);
   * }
   * ```
   */
  async sendChatHistoryAsync(
    turnContext: TurnContext,
    session: OpenAIConversationsSession,
    limit?: number,
    toolOptions?: ToolOptions
  ): Promise<OperationResult> {
    // Validate inputs
    if (!turnContext) {
      throw new Error('turnContext is required');
    }
    if (!session) {
      throw new Error('session is required');
    }

    let items: AgentInputItem[];
    try {
      // Extract messages from session
      items = await session.getItems(limit);
    } catch (err: unknown) {
      // Convert errors from session.getItems() into a failed OperationResult
      const error = err as Error;
      return OperationResult.failed(new OperationError(error));
    }

    // Delegate to the list-based method
    // Validation errors from this method will propagate
    return await this.sendChatHistoryMessagesAsync(
      turnContext,
      items,
      toolOptions
    );
  }

  /**
   * Sends a list of OpenAI messages to the MCP platform for real-time threat protection.
   *
   * This method converts the provided AgentInputItem messages to `ChatHistoryMessage` format
   * and sends them to the MCP platform.
   *
   * @param turnContext - The turn context containing conversation information.
   * @param messages - Array of AgentInputItem messages to send.
   * @param toolOptions - Optional ToolOptions for customization.
   * @returns A Promise resolving to an OperationResult indicating success or failure.
   * @throws Error if turnContext is null/undefined.
   * @throws Error if messages is null/undefined.
   * @throws Error if required turn context properties are missing.
   *
   * @example
   * ```typescript
   * const items = await session.getItems();
   * const result = await service.sendChatHistoryMessagesAsync(turnContext, items);
   * ```
   */
  async sendChatHistoryMessagesAsync(
    turnContext: TurnContext,
    messages: AgentInputItem[],
    toolOptions?: ToolOptions
  ): Promise<OperationResult> {
    // Validate inputs
    if (!turnContext) {
      throw new Error('turnContext is required');
    }
    if (!messages) {
      throw new Error('messages is required');
    }

    // Set default options
    const effectiveOptions: ToolOptions = {
      orchestratorName: toolOptions?.orchestratorName ?? this.orchestratorName
    };

    let chatHistoryMessages: ChatHistoryMessage[];
    try {
      // Convert OpenAI messages to ChatHistoryMessage format
      chatHistoryMessages = this.convertToChatHistoryMessages(messages);
    } catch (err: unknown) {
      // Convert errors from message conversion into a failed OperationResult
      const error = err as Error;
      return OperationResult.failed(new OperationError(error));
    }

    // Delegate to core service
    return await this.configService.sendChatHistory(
      turnContext,
      chatHistoryMessages,
      effectiveOptions
    );
  }

  /**
   * Converts OpenAI AgentInputItem messages to ChatHistoryMessage format.
   * @param messages - Array of AgentInputItem messages to convert.
   * @returns Array of successfully converted ChatHistoryMessage objects.
   */
  private convertToChatHistoryMessages(messages: AgentInputItem[]): ChatHistoryMessage[] {
    return messages
      .map(msg => this.convertSingleMessage(msg))
      .filter((msg): msg is ChatHistoryMessage => msg !== null);
  }

  /**
   * Converts a single OpenAI message to ChatHistoryMessage format.
   * @param message - The AgentInputItem to convert.
   * @returns A ChatHistoryMessage object, or null if conversion fails.
   */
  private convertSingleMessage(message: AgentInputItem): ChatHistoryMessage | null {
    try {
      return {
        id: this.extractId(message),
        role: this.extractRole(message),
        content: this.extractContent(message),
        timestamp: this.extractTimestamp(message)
      };
    } catch {
      return null;
    }
  }

  /**
   * Extracts the role from an OpenAI message.
   * Simply returns message.role directly without any transformation or validation.
   * @param message - The AgentInputItem to extract the role from.
   * @returns The role string from the message.
   */
  private extractRole(message: AgentInputItem): string {
    const { role } = message as { role?: unknown };
    return role as string;
  }

  /**
   * Extracts content from an OpenAI message.
   * @param message - The AgentInputItem to extract content from.
   * @returns The extracted content string.
   * @throws Error if content is empty or cannot be extracted.
   */
  private extractContent(message: AgentInputItem): string {
    let content: string | undefined;

    const messageWithContent = message as { content?: string | Array<{ type?: string; text?: string }> };
    const messageWithText = message as { text?: string };

    // Handle string content
    if (typeof messageWithContent.content === 'string') {
      content = messageWithContent.content;
    }
    // Handle array content (ContentPart[])
    else if (Array.isArray(messageWithContent.content)) {
      const textParts = messageWithContent.content
        .filter((part): part is { type?: string; text?: string } => {
          if (typeof part === 'string') return true;
          return part.type === 'text' || part.type === 'input_text' || (typeof part === 'object' && 'text' in part);
        })
        .map(part => {
          if (typeof part === 'string') return part;
          return part.text || '';
        })
        .filter(text => text.length > 0);

      if (textParts.length > 0) {
        content = textParts.join(' ');
      }
    }
    // Try text property as fallback
    else if (typeof messageWithText.text === 'string') {
      content = messageWithText.text;
    }

    // Reject empty content
    if (!content || content.trim().length === 0) {
      throw new Error('Message content cannot be empty');
    }

    return content;
  }

  /**
   * Extracts or generates an ID for a message.
   * @param message - The AgentInputItem to extract or generate an ID for.
   * @returns The message ID, either existing or newly generated UUID.
   */
  private extractId(message: AgentInputItem): string {
    const messageWithId = message as { id?: string };
    if (messageWithId.id) {
      return messageWithId.id;
    }

    return uuidv4();
  }

  /**
   * Extracts or generates a timestamp for a message.
   * Note: AgentInputItem types do not have a standard timestamp property,
   * so we always generate the current timestamp.
   * @param _message - The AgentInputItem (unused, as timestamps are always generated).
   * @returns The current Date.
   */
  private extractTimestamp(_message: AgentInputItem): Date {
    // AgentInputItem types do not include timestamp properties.
    // Always use current UTC time.
    return new Date();
  }
}
