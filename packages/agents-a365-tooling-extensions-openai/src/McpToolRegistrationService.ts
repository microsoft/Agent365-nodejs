// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { v4 as uuidv4 } from 'uuid';
import { McpToolServerConfigurationService, Utility, ToolOptions, ChatHistoryMessage } from '@microsoft/agents-a365-tooling';
import { AgenticAuthenticationService, OperationResult, OperationError, IConfigurationProvider } from '@microsoft/agents-a365-runtime';
import { OpenAIToolingConfiguration, defaultOpenAIToolingConfigurationProvider } from './configuration';

// Agents SDK
import { TurnContext, Authorization } from '@microsoft/agents-hosting';

// OpenAI Agents SDK
import { Agent, MCPServer, MCPServerStreamableHttp, AgentInputItem } from '@openai/agents';
import { OpenAIConversationsSession } from '@openai/agents-openai';

interface RegistrationState {
  // MCP servers created by addToolServersToAgent. Each one is built with the request headers of the
  // call that created it, so a later call removes it from the agent before adding its own servers.
  readonly sdkCreatedServers: WeakSet<object>;
  // The servers addToolServersToAgent created for each agent. Only these are closed when they are
  // removed from that agent; servers it shares with another agent (for example through agent.clone())
  // are only removed from it.
  readonly ownedServersByAgent: WeakMap<object, Set<MCPServer>>;
  // Closes the servers a call created once the agent.mcpServers array that call assigned is garbage
  // collected. agent.clone() copies share that array, so this happens only once the agent and all of
  // its copies are unreachable. Each registration holds its own call's servers, so the array of an
  // earlier call never closes the servers of a later call on the same agent.
  readonly closeServersOfCollectedArray: FinalizationRegistry<readonly MCPServer[]>;
}

// The state lives on globalThis so that every copy of this module in the process (for example the
// CommonJS and the ES module build of this package) uses the same one and recognizes the servers
// another copy added.
function getRegistrationState(): RegistrationState {
  const holder = globalThis as unknown as Record<symbol, RegistrationState | undefined>;
  const key = Symbol.for('@microsoft/agents-a365-tooling-extensions-openai/registration-state/v1');
  return (holder[key] ??= {
    sdkCreatedServers: new WeakSet(),
    ownedServersByAgent: new WeakMap(),
    closeServersOfCollectedArray: new FinalizationRegistry((servers) => {
      closeServers(servers).catch(() => undefined);
    }),
  });
}

const { sdkCreatedServers, ownedServersByAgent, closeServersOfCollectedArray } = getRegistrationState();

/**
 * Closes the servers. MCPServerStreamableHttp.close() also ends the server session, and does nothing
 * for a server that is already closed.
 */
async function closeServers(servers: readonly MCPServer[]): Promise<void> {
  await Promise.allSettled(servers.map((server) => server.close()));
}

/**
 * Removes the servers addToolServersToAgent added from the agent and closes the ones it created for
 * this agent. A new array is assigned, so an array the agent shares with another agent is not changed.
 * The servers are removed before this returns; the returned promise settles once they are closed.
 */
function removeAddedServers(agent: Agent): Promise<void> {
  const servers = agent.mcpServers ?? [];
  if (servers.some((server) => sdkCreatedServers.has(server))) {
    agent.mcpServers = servers.filter((server) => !sdkCreatedServers.has(server));
  }
  const owned = ownedServersByAgent.get(agent);
  if (!owned || owned.size === 0) {
    return Promise.resolve();
  }
  const ownedServers = [...owned];
  owned.clear();
  return closeServers(ownedServers);
}

/**
 * Records the servers addToolServersToAgent created for the agent, and closes them once the
 * agent.mcpServers array that call just assigned is garbage collected.
 */
function trackCreatedServers(agent: Agent, servers: MCPServer[]): void {
  if (servers.length === 0) {
    return;
  }
  let owned = ownedServersByAgent.get(agent);
  if (!owned) {
    owned = new Set();
    ownedServersByAgent.set(agent, owned);
  }
  for (const server of servers) {
    sdkCreatedServers.add(server);
    owned.add(server);
  }
  // The held value is a copy of this call's servers: it must not reference the array, and the owned
  // set changes with later calls. It isn't unregistered when the servers are closed explicitly, since
  // a clone may still share the array; closing them again then does nothing.
  closeServersOfCollectedArray.register(agent.mcpServers, [...servers]);
}

/**
 * Discover MCP servers and list tools formatted for the OpenAI Agents SDK.
 * Uses listToolServers to fetch server configs.
 */
export class McpToolRegistrationService {
  private readonly configService: McpToolServerConfigurationService;
  private readonly configProvider: IConfigurationProvider<OpenAIToolingConfiguration>;
  private readonly orchestratorName: string = "OpenAI";

  /**
   * Construct a McpToolRegistrationService.
   * @param configProvider Optional configuration provider. Defaults to defaultOpenAIToolingConfigurationProvider if not specified.
   */
  constructor(configProvider?: IConfigurationProvider<OpenAIToolingConfiguration>) {
    this.configProvider = configProvider ?? defaultOpenAIToolingConfigurationProvider;
    this.configService = new McpToolServerConfigurationService(this.configProvider);
  }


  /**
   * Registers MCP tool servers and updates agent options with discovered tools and server configs.
   * Call this to enable dynamic OpenAI tool access based on the current MCP environment.
   *
   * Adds an MCPServerStreamableHttp for each discovered server to agent.mcpServers, built with the
   * request headers of this call. The servers are not connected: connect them before running the
   * agent, as with servers you add yourself, and call {@link closeToolServers} when the turn ends.
   * Servers an earlier call added are removed first, and the ones it created for this agent closed.
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

    // Remove the servers an earlier call added before anything below can throw, and close the ones it
    // created for this agent. Servers the agent shares with another agent (for example through
    // agent.clone()) are only removed from this one.
    await removeAddedServers(agent);

    if (!authToken) {
      const scope = this.configProvider.getConfiguration().mcpPlatformAuthenticationScope;
      authToken = await AgenticAuthenticationService.GetAgenticUserToken(authorization, authHandlerName, turnContext, [scope]);
    }

    // Validate the authentication token
    Utility.ValidateAuthToken(authToken);

    const options: ToolOptions = { orchestratorName: this.orchestratorName };
    const servers = await this.configService.listToolServers(turnContext, authorization, authHandlerName, authToken, options);
    const mcpServers: MCPServerStreamableHttp[] = [];

    for (const server of servers) {
      // Merge base headers (channel, user-agent) with per-audience Authorization from server.headers
      const baseHeaders: Record<string, string> = Utility.GetToolRequestHeaders(authToken, turnContext, options);
      const headers: Record<string, string> = { ...baseHeaders, ...server.headers };

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

    // Another call on this agent may have added its servers while this one was discovering servers.
    // Remove those again, and close the ones it created for this agent, so this call's servers
    // replace them instead of being added to them.
    const closingOverlappingServers = removeAddedServers(agent);
    agent.mcpServers = [...(agent.mcpServers ?? []), ...mcpServers];
    trackCreatedServers(agent, mcpServers);
    await closingOverlappingServers;

    return agent;
  }

  /**
   * Removes the MCP servers that {@link addToolServersToAgent} added from the agent, and closes the
   * ones it created for this agent, which also ends their server sessions. Call it when the turn
   * that used the agent ends, for example in a `finally` block, whether or not the servers were
   * connected. Servers the agent shares with another agent (for example through agent.clone()) are
   * only removed from it, and servers you added yourself are kept and left open.
   *
   * If this isn't called, the servers a call created are closed once the agent and all of its
   * agent.clone() copies have been garbage collected: the cleanup follows the agent.mcpServers array
   * that call assigned, which clone() copies share. Don't copy those servers into an array of your
   * own, for example by assigning a new agent.mcpServers that contains them: they would be closed once
   * the assigned array is collected, even while your array still holds them. Add servers of your own
   * before calling addToolServersToAgent, or push them into agent.mcpServers.
   * @param agent The agent passed to addToolServersToAgent.
   */
  async closeToolServers(agent: Agent): Promise<void> {
    if (!agent) {
      return;
    }
    const closing = removeAddedServers(agent);
    ownedServersByAgent.delete(agent);
    await closing;
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
