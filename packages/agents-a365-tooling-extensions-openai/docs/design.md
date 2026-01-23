# Tooling Extensions - OpenAI - Design Document

This document describes the architecture and design of the `@microsoft/agents-a365-tooling-extensions-openai` package.

## Overview

The OpenAI tooling extensions package provides integration between the Microsoft Agent 365 MCP tooling system and the OpenAI Agents SDK. It enables automatic discovery and registration of MCP tool servers with OpenAI agents using the native `MCPServerStreamableHttp` class.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      OpenAI Agent                                │
│                     (@openai/agents)                             │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
                    (Agent with mcpServers)
                              │
┌─────────────────────────────────────────────────────────────────┐
│              McpToolRegistrationService                          │
│                                                                  │
│  1. Discover MCP servers via tooling package                    │
│  2. Create MCPServerStreamableHttp instances                     │
│  3. Add to agent.mcpServers array                                │
│  4. Return updated agent                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│           McpToolServerConfigurationService                      │
│             (@microsoft/agents-a365-tooling)                     │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### McpToolRegistrationService ([McpToolRegistrationService.ts](../src/McpToolRegistrationService.ts))

Main service for registering MCP tools with OpenAI agents:

```typescript
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-openai';
import { Agent } from '@openai/agents';

const registrationService = new McpToolRegistrationService();

// Create OpenAI agent
let agent = new Agent({
  name: 'MyAgent',
  model: 'gpt-4o',
  instructions: 'You are a helpful assistant.'
});

// Register MCP tools with the agent
agent = await registrationService.addToolServersToAgent(
  agent,
  authorization,
  authHandlerName,
  turnContext,
  authToken  // Optional, will be obtained if not provided
);

// Agent now has access to MCP tool servers
const result = await run(agent, 'Search for documents');
```

**Method Signature:**

```typescript
async addToolServersToAgent(
  agent: Agent,                   // OpenAI agent to update
  authorization: Authorization,   // Authorization object for token exchange
  authHandlerName: string,       // Auth handler name
  turnContext: TurnContext,      // Current turn context
  authToken: string              // Bearer token (optional)
): Promise<Agent>                // Returns updated agent
```

## OpenAI Agents SDK Integration

The service uses the native `MCPServerStreamableHttp` class from the OpenAI Agents SDK:

```typescript
import { Agent, MCPServerStreamableHttp } from '@openai/agents';

// Create MCP server instances for OpenAI agents
const mcpServers: MCPServerStreamableHttp[] = [];

for (const server of servers) {
  const mcpServer = new MCPServerStreamableHttp({
    url: server.url,
    name: server.mcpServerName,
    requestInit: {
      headers: Utility.GetToolRequestHeaders(authToken, turnContext, options)
    }
  });

  mcpServers.push(mcpServer);
}

// Add to agent
agent.mcpServers = agent.mcpServers ?? [];
agent.mcpServers.push(...mcpServers);
```

## Server Configuration

The service creates `MCPServerStreamableHttp` instances with proper authentication:

```typescript
const mcpServer = new MCPServerStreamableHttp({
  url: 'https://agent365.svc.cloud.microsoft/agents/servers/mailTools',
  name: 'mailTools',
  requestInit: {
    headers: {
      'Authorization': 'Bearer <token>',
      'x-ms-channel-id': 'teams',
      'x-ms-subchannel-id': 'email',
      'User-Agent': 'Agent365SDK/1.0.0 (Windows_NT; Node.js v18.0.0; OpenAI)'
    }
  }
});
```

## Usage Example

Complete example with an OpenAI agent:

```typescript
import { Agent, run } from '@openai/agents';
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-openai';

// In your agent's message handler
async function onMessage(turnContext: TurnContext, authorization: Authorization) {
  const registrationService = new McpToolRegistrationService();

  // Create OpenAI agent
  let agent = new Agent({
    name: 'MyAssistant',
    model: 'gpt-4o',
    instructions: 'You are a helpful assistant with access to Microsoft 365 tools.'
  });

  // Register MCP tools
  agent = await registrationService.addToolServersToAgent(
    agent,
    authorization,
    'myAuthHandler',
    turnContext,
    authToken
  );

  // Run the agent
  const result = await run(agent, turnContext.activity.text);

  await turnContext.sendActivity(result.finalOutput);
}
```

## Preserving Existing MCP Servers

The service preserves any existing MCP servers on the agent:

```typescript
// Ensure mcpServers array exists
agent.mcpServers = agent.mcpServers ?? [];

// Add new servers (doesn't replace existing ones)
agent.mcpServers.push(...mcpServers);

return agent;
```

## File Structure

```
src/
├── index.ts                              # Public API exports
└── McpToolRegistrationService.ts         # Main registration service
```

## Dependencies

- `@microsoft/agents-a365-tooling` - MCP server discovery and configuration
- `@microsoft/agents-a365-runtime` - Authentication service, agent identity resolution
- `@microsoft/agents-hosting` - TurnContext, Authorization types
- `@openai/agents` - OpenAI Agents SDK (Agent, MCPServerStreamableHttp)

## Orchestrator Identification

The service identifies itself as "OpenAI" in User-Agent headers:

```typescript
private readonly orchestratorName: string = "OpenAI";

// Results in User-Agent header:
// "Agent365SDK/1.0.0 (Windows_NT; Node.js v18.0.0; OpenAI)"
```

## Chat History API

The service provides methods to send conversation history to the MCP platform for real-time threat protection. These methods handle the conversion from OpenAI SDK types (`AgentInputItem`) to the platform-native `ChatHistoryMessage` format.

### sendChatHistoryAsync

Sends chat history from an OpenAI Session to the MCP platform:

```typescript
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-openai';

const registrationService = new McpToolRegistrationService();

// Using OpenAI Session directly (most common use case)
const result = await registrationService.sendChatHistoryAsync(
  turnContext,
  session,       // OpenAI Session instance
  50,            // Optional: limit number of messages
  toolOptions    // Optional: custom tool options
);

if (result.succeeded) {
  console.log('Chat history sent successfully');
} else {
  console.error('Failed to send chat history:', result.errors);
}
```

**Method Signature:**

```typescript
async sendChatHistoryAsync(
  turnContext: TurnContext,              // Current turn context
  session: OpenAIConversationsSession,   // OpenAI session to extract messages from
  limit?: number,                        // Optional limit on messages
  toolOptions?: ToolOptions              // Optional tool options
): Promise<OperationResult>              // Returns operation result
```

### sendChatHistoryMessagesAsync

Sends a list of messages directly to the MCP platform:

```typescript
// Or using a list of items directly
const items = await session.getItems();
const result = await registrationService.sendChatHistoryMessagesAsync(
  turnContext,
  items,
  toolOptions    // Optional: custom tool options
);
```

**Method Signature:**

```typescript
async sendChatHistoryMessagesAsync(
  turnContext: TurnContext,     // Current turn context
  messages: AgentInputItem[],   // Array of OpenAI messages
  toolOptions?: ToolOptions     // Optional tool options
): Promise<OperationResult>     // Returns operation result
```

### Message Conversion

The service handles automatic conversion of OpenAI message types:

| OpenAI Property | ChatHistoryMessage Property | Conversion Logic |
|-----------------|----------------------------|------------------|
| `role` | `role` | Pass-through (no transformation) |
| `content` (string) | `content` | Direct use |
| `content` (array) | `content` | Concatenate text parts |
| `text` | `content` | Fallback for text property |
| `id` | `id` | Use existing or generate UUID |
| N/A | `timestamp` | Always current UTC time |

**Content Extraction Priority:**
1. If `message.content` is a string, use it directly
2. If `message.content` is an array (ContentPart[]), concatenate all text parts
3. If `message.text` exists, use it as fallback
4. If content is empty or undefined, the message is skipped with a warning

**ID Generation:**
- If `message.id` exists, it is preserved
- Otherwise, a UUID v4 is generated automatically

**Timestamp Generation:**
- AgentInputItem types do not have a standard timestamp property
- Current UTC timestamp is always generated

### Error Handling

| Error Condition | Behavior |
|-----------------|----------|
| `turnContext` is null/undefined | Throws `Error('turnContext is required')` |
| `session` is null/undefined | Throws `Error('session is required')` |
| `messages` is null/undefined | Throws `Error('messages is required')` |
| `messages` is empty array | Returns `OperationResult.success` (no-op) |
| Message conversion fails | Message is skipped, error logged |
| HTTP error from MCP platform | Returns `OperationResult.failed()` with error |
| Network timeout | Returns `OperationResult.failed()` with error |

### Complete Example

```typescript
import { Agent, run } from '@openai/agents';
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-openai';

async function onMessage(turnContext: TurnContext, authorization: Authorization) {
  const registrationService = new McpToolRegistrationService();

  // Create OpenAI agent with session
  let agent = new Agent({
    name: 'MyAssistant',
    model: 'gpt-4o',
    instructions: 'You are a helpful assistant.'
  });

  // Register MCP tools
  agent = await registrationService.addToolServersToAgent(
    agent,
    authorization,
    'myAuthHandler',
    turnContext,
    authToken
  );

  // Run the agent with conversation session
  const session = new OpenAIConversationsSession();
  const result = await run(agent, turnContext.activity.text, { session });

  // Send chat history for threat protection
  const historyResult = await registrationService.sendChatHistoryAsync(
    turnContext,
    session,
    100  // Send up to 100 messages
  );

  if (!historyResult.succeeded) {
    console.warn('Failed to send chat history:', historyResult.errors);
  }

  await turnContext.sendActivity(result.finalOutput);
}
```

## Comparison with Other Extensions

| Feature | OpenAI Extension | Claude Extension | LangChain Extension |
|---------|------------------|------------------|---------------------|
| Server Class | `MCPServerStreamableHttp` | `McpServerConfig` | `Connection` |
| Tool Discovery | Automatic via SDK | Manual via client | Via MCP adapters |
| Tool Naming | Native MCP names | `mcp__server__tool` | Native MCP names |
| Return Type | Updated `Agent` | `void` (modifies options) | New `ReactAgent` |
| Chat History API | `sendChatHistoryAsync` | N/A | N/A |
