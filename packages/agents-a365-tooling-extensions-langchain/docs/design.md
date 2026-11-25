# Tooling Extensions - LangChain - Design Document

This document describes the architecture and design of the `@microsoft/agents-a365-tooling-extensions-langchain` package.

## Overview

The LangChain tooling extensions package provides integration between the Microsoft Agent 365 MCP tooling system and LangChain. It enables:
- Automatic discovery and registration of MCP tool servers with LangChain agents using the `@langchain/mcp-adapters` package
- Sending chat history to the MCP platform for real-time threat protection (RTP) analysis

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      LangChain Agent                             │
│                        (ReactAgent)                              │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
                    (Agent with MCP tools)
                              │
┌─────────────────────────────────────────────────────────────────┐
│              McpToolRegistrationService                          │
│                                                                  │
│  MCP Tool Registration:                                          │
│  1. Discover MCP servers via tooling package                    │
│  2. Create MultiServerMCPClient                                  │
│  3. Get tools via MCP adapters                                   │
│  4. Merge with existing agent tools                              │
│  5. Return new agent with combined tools                         │
│  6. closeToolServers: end sessions, close the MCP client         │
│                                                                  │
│  Send Chat History API:                                          │
│  1. Extract messages from various LangChain sources             │
│  2. Convert BaseMessage[] to ChatHistoryMessage[]               │
│  3. Send to MCP platform for RTP analysis                       │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Tooling Service  │ │ MultiServerMCP   │ │ LangChain Tools  │
│                  │ │ Client           │ │                  │
│ Server discovery │ │ (@langchain/     │ │ Tool definitions │
│ Chat history API │ │  mcp-adapters)   │ │ for agent        │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

## Key Components

### McpToolRegistrationService ([McpToolRegistrationService.ts](../src/McpToolRegistrationService.ts))

Main service for registering MCP tools with LangChain agents and sending chat history.

## MCP Tool Registration

```typescript
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-langchain';
import { createAgent, ReactAgent } from 'langchain';

const registrationService = new McpToolRegistrationService();

// Create the LangChain agent for this turn
const baseAgent = createAgent({
  llm: chatModel,
  tools: existingTools
});

// Register MCP tools with the agent
const agent = await registrationService.addToolServersToAgent(
  baseAgent,
  authorization,
  authHandlerName,
  turnContext,
  authToken  // Optional, will be obtained if not provided
);

try {
  // Agent now has access to both existing tools and MCP tools
  const result = await agent.invoke({ input: 'Search for documents' });
} finally {
  // End the MCP server sessions and close the connections of this turn
  await registrationService.closeToolServers(agent);
}
```

**Method Signatures:**

```typescript
async addToolServersToAgent(
  agent: ReactAgent,              // LangChain agent to update
  authorization: Authorization,   // Authorization object for token exchange
  authHandlerName: string,       // Auth handler name
  turnContext: TurnContext,      // Current turn context
  authToken: string              // Bearer token (optional)
): Promise<ReactAgent>           // Returns new agent with MCP tools

async closeToolServers(
  agent: ReactAgent               // Agent returned by addToolServersToAgent
): Promise<void>
```

## Send Chat History API

The Send Chat History API provides a layered approach for sending conversation history to the MCP platform for real-time threat protection (RTP) analysis.

### API Layering

The API is designed with multiple levels, from highest (easiest to use) to lowest (most flexible):

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        API DELEGATION FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Level 1: sendChatHistoryAsync(turnContext, graph, config)                      │
│           │                                                                      │
│           ├──► graph.getState(config) → StateSnapshot                           │
│           │                                                                      │
│           └──► delegates to Level 2                                             │
│                                                                                  │
│  Level 2: sendChatHistoryFromStateAsync(turnContext, stateSnapshot)             │
│           │                                                                      │
│           ├──► stateSnapshot.values.messages → BaseMessage[]                    │
│           │                                                                      │
│           └──► delegates to Level 4                                             │
│                                                                                  │
│  Level 3: sendChatHistoryFromChatHistoryAsync(turnContext, chatHistory)         │
│           │                                                                      │
│           ├──► chatHistory.getMessages() → BaseMessage[]                        │
│           │                                                                      │
│           └──► delegates to Level 4                                             │
│                                                                                  │
│  Level 4: sendChatHistoryFromMessagesAsync(turnContext, messages)               │
│           │                                                                      │
│           ├──► convertToChatHistoryMessages(messages)                           │
│           │                                                                      │
│           └──► configService.sendChatHistory(turnContext, chatHistoryMessages)  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Method Signatures

```typescript
// Level 1: From CompiledStateGraph (Highest Level)
async sendChatHistoryAsync<State extends { messages: BaseMessage[] }>(
  turnContext: TurnContext,
  graph: CompiledStateGraph<State>,
  config: RunnableConfig,
  limit?: number,
  toolOptions?: ToolOptions
): Promise<OperationResult>

// Level 2: From StateSnapshot
async sendChatHistoryFromStateAsync<State extends { messages: BaseMessage[] }>(
  turnContext: TurnContext,
  stateSnapshot: StateSnapshot<State>,
  limit?: number,
  toolOptions?: ToolOptions
): Promise<OperationResult>

// Level 3: From BaseChatMessageHistory
async sendChatHistoryFromChatHistoryAsync(
  turnContext: TurnContext,
  chatHistory: BaseChatMessageHistory,
  limit?: number,
  toolOptions?: ToolOptions
): Promise<OperationResult>

// Level 4: From BaseMessage[] (Lowest Level)
async sendChatHistoryFromMessagesAsync(
  turnContext: TurnContext,
  messages: BaseMessage[],
  limit?: number,
  toolOptions?: ToolOptions
): Promise<OperationResult>
```

### Role Mapping

LangChain message types are mapped to standard role strings:

| LangChain Type | `getType()` Return | Mapped Role |
|----------------|-------------------|-------------|
| `HumanMessage` | `'human'` | `'user'` |
| `AIMessage` | `'ai'` | `'assistant'` |
| `SystemMessage` | `'system'` | `'system'` |
| `ToolMessage` | `'tool'` | `'tool'` |
| `FunctionMessage` | `'function'` | `'function'` |
| `ChatMessage` | `'chat'` | Uses `message.role` property |
| Unknown | Any other | `'user'` (default) |

### Content Extraction

Content is extracted from messages using the following priority:

1. `message.text` accessor (preferred - handles ContentPart arrays)
2. `message.content` if it's a string
3. Concatenate text from `ContentPart[]` if content is an array
4. Skip message if no text content can be extracted

### Error Handling Matrix

| Condition | Behavior | Return/Throw |
|-----------|----------|--------------|
| `turnContext` is null/undefined | Throw immediately | `Error('turnContext is required')` |
| `messages` is null/undefined | Throw immediately | `Error('messages is required')` |
| `graph` is null/undefined | Throw immediately | `Error('graph is required')` |
| `config` is null/undefined | Throw immediately | `Error('config is required')` |
| `chatHistory` is null/undefined | Throw immediately | `Error('chatHistory is required')` |
| `stateSnapshot` is null/undefined | Throw immediately | `Error('stateSnapshot is required')` |
| `stateSnapshot.values.messages` missing | Throw immediately | `Error('stateSnapshot must contain messages')` |
| Empty messages array | **Send empty array to API** | Required for RTP user message registration |
| Single message conversion fails | Skip message, continue | Log warning, process remaining |
| All message conversions fail | Send empty array to API | Required for RTP user message registration |
| HTTP request fails | Return failure | `OperationResult.failed(OperationError)` |
| Network timeout | Return failure | `OperationResult.failed(OperationError)` |

**Important**: Empty message arrays must be sent to the chat history API (not treated as a no-op). This is required to register the user message with the real-time threat protection system.

## LangChain MCP Integration

The service uses `@langchain/mcp-adapters` for MCP integration:

```typescript
import { ClientConfig, Connection, MultiServerMCPClient } from '@langchain/mcp-adapters';

// Build MCP server connections
const mcpServers: Record<string, Connection> = {};
for (const server of servers) {
  mcpServers[server.mcpServerName] = {
    type: 'http',
    url: server.url,
    headers: Utility.GetToolRequestHeaders(authToken, turnContext, options)
  };
}

// Create MCP client. Connection errors are collected instead of stopping at the first one, so the
// client can be closed without connecting to the failed server again.
const connectionErrors: unknown[] = [];
const multiServerMcpClient = new MultiServerMCPClient({
  mcpServers,
  onConnectionError: ({ error }) => { connectionErrors.push(error); }
});

try {
  // Get LangChain-compatible tools
  const mcpTools = await multiServerMcpClient.getTools();
  if (connectionErrors.length > 0) {
    throw connectionErrors[0];
  }
  // ... create and return the agent (see Tool Merging) ...
} catch (error) {
  // Nothing can reach this client once the call fails, so close it here
  await closeMcpClient(multiServerMcpClient);
  throw error;
}
```

## Tool Merging

The service keeps the tools you add to the agent yourself and adds the MCP tools for the current
call. If you pass in an agent that an earlier call returned, the MCP tools that call added are
dropped and its MCP client is closed first, even if the current call fails:

```typescript
// Close the MCP client behind an agent an earlier call returned
await this.closeToolServers(agent);

// ... discover servers for the current turn ...

// Get MCP tools from servers
const mcpTools = await multiServerMcpClient.getTools();

// Keep the agent's own tools, drop MCP tools an earlier call added
const existingTools = (agent.options.tools ?? []).filter((tool) => !sdkCreatedTools.has(tool));

// Create new agent with combined tools
const agentWithTools = createAgent({
  ...agent.options,
  tools: [...existingTools, ...mcpTools]
});
mcpClientByAgent.set(agentWithTools, multiServerMcpClient);
closeClientOfCollectedAgent.register(agentWithTools, multiServerMcpClient, agentWithTools);
return agentWithTools;
```

## Closing MCP Connections

The `MultiServerMCPClient` behind the returned agent stays connected to the MCP servers after
`addToolServersToAgent` returns, because the agent's MCP tools use it. Its MCP tools carry the
request headers of the call that created them, so use the returned agent only for the current turn:

- Create the agent for each turn, and call `closeToolServers(agent)` with the returned agent in a
  `finally` block when the turn ends. It ends the session on each MCP server, then closes the
  client. Calling it again, or with an agent `addToolServersToAgent` didn't return, does nothing.
- Don't share one agent between turns that run at the same time.
- If a returned agent is garbage collected before `closeToolServers` is called, its client is closed
  then. When that happens depends on the garbage collector, so call `closeToolServers` rather than
  relying on it. An agent can also stay reachable after its turn: the async context of a LangChain
  run references the agent, and HTTP keep-alive connections opened during the run keep that context
  for as long as they stay open, including while a later turn's MCP connections reuse them.

```typescript
/** Ends the session on each server the client is connected to, then closes the client. */
async function closeMcpClient(client: MultiServerMCPClient): Promise<void> {
  await Promise.allSettled(
    Object.keys(client.config.mcpServers ?? {}).map(async (serverName) => {
      const transport = (await client.getClient(serverName))?.transport;
      await transport?.terminateSession?.();
    })
  );
  await client.close().catch(() => undefined);
}
```

`MultiServerMCPClient.close()` closes the connections but doesn't end the server sessions, so the
session of each Streamable HTTP connection is ended first. `getClient()` doesn't open a connection
here: the client has connected to every server, or recorded why it couldn't, before it is closed.

## Usage Examples

### Complete Example with Chat History

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-langchain';

async function onMessage(turnContext: TurnContext, authorization: Authorization) {
  const registrationService = new McpToolRegistrationService();

  // Create LangChain chat model
  const chatModel = new ChatOpenAI({
    modelName: 'gpt-4',
    temperature: 0
  });

  // Create the agent for this turn
  const baseAgent = createAgent({
    llm: chatModel,
    tools: []
  });

  // Register MCP tools
  const agent = await registrationService.addToolServersToAgent(
    baseAgent,
    authorization,
    'myAuthHandler',
    turnContext,
    authToken
  );

  try {
    // Run the agent
    const result = await agent.invoke({
      input: turnContext.activity.text
    });

    // Send chat history for RTP analysis
    const messages = getConversationMessages(); // Your message retrieval logic
    const rtpResult = await registrationService.sendChatHistoryFromMessagesAsync(
      turnContext,
      messages
    );

    if (!rtpResult.succeeded) {
      console.warn('RTP analysis failed:', rtpResult.errors);
    }

    await turnContext.sendActivity(result.output);
  } finally {
    // End the MCP server sessions and close the connections of this turn
    await registrationService.closeToolServers(agent);
  }
}
```

### LangGraph Integration Example

```typescript
import { StateGraph, MessagesAnnotation } from '@langchain/langgraph';
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-langchain';

// Build your LangGraph
const workflow = new StateGraph(MessagesAnnotation)
  .addNode('agent', callModel)
  .addNode('tools', toolNode)
  // ... add edges
  .compile({ checkpointer });

// Send chat history using the graph
const service = new McpToolRegistrationService();
const config = { configurable: { thread_id: conversationId } };

// Level 1 API - easiest to use
const result = await service.sendChatHistoryAsync(turnContext, workflow, config);
```

## Connection Configuration

The service creates HTTP connections for each MCP server:

```typescript
// MCP server connection format
const connection: Connection = {
  type: 'http',
  url: server.url,
  headers: {
    'Authorization': 'Bearer <token>',
    'x-ms-channel-id': 'teams',
    'x-ms-subchannel-id': 'email',
    'User-Agent': 'Agent365SDK/1.0.0 (Windows_NT; Node.js v18.0.0; LangChain)'
  }
};
```

## File Structure

```
src/
├── index.ts                              # Public API exports
└── McpToolRegistrationService.ts         # Main registration service
```

## Dependencies

### Required
- `@microsoft/agents-a365-tooling` - MCP server discovery, configuration, and chat history API
- `@microsoft/agents-a365-runtime` - Authentication service, agent identity resolution, OperationResult
- `@microsoft/agents-hosting` - TurnContext, Authorization types
- `@langchain/core` - BaseMessage, BaseChatMessageHistory, RunnableConfig types
- `@langchain/mcp-adapters` - MCP adapters for LangChain (ClientConfig, Connection, MultiServerMCPClient)
- `langchain` - LangChain core (createAgent, ReactAgent)
- `uuid` - UUID generation for message IDs

### Optional Peer Dependencies
- `@langchain/langgraph` - For CompiledStateGraph and StateSnapshot types (Level 1 and 2 APIs)

## Orchestrator Identification

The service identifies itself as "LangChain" in User-Agent headers:

```typescript
private readonly orchestratorName: string = "LangChain";

// Results in User-Agent header:
// "Agent365SDK/1.0.0 (Windows_NT; Node.js v18.0.0; LangChain)"
```
