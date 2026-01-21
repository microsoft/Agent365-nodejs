# Tooling Extensions - LangChain - Design Document

This document describes the architecture and design of the `@microsoft/agents-a365-tooling-extensions-langchain` package.

## Overview

The LangChain tooling extensions package provides integration between the Microsoft Agent 365 MCP tooling system and LangChain. It enables automatic discovery and registration of MCP tool servers with LangChain agents using the `@langchain/mcp-adapters` package.

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
│  1. Discover MCP servers via tooling package                    │
│  2. Create MultiServerMCPClient                                  │
│  3. Get tools via MCP adapters                                   │
│  4. Merge with existing agent tools                              │
│  5. Return new agent with combined tools                         │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Tooling Service  │ │ MultiServerMCP   │ │ LangChain Tools  │
│                  │ │ Client           │ │                  │
│ Server discovery │ │ (@langchain/     │ │ Tool definitions │
│                  │ │  mcp-adapters)   │ │ for agent        │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

## Key Components

### McpToolRegistrationService ([McpToolRegistrationService.ts](../src/McpToolRegistrationService.ts))

Main service for registering MCP tools with LangChain agents:

```typescript
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-langchain';
import { createAgent, ReactAgent } from 'langchain';

const registrationService = new McpToolRegistrationService();

// Create initial LangChain agent
let agent = createAgent({
  llm: chatModel,
  tools: existingTools
});

// Register MCP tools with the agent
agent = await registrationService.addToolServersToAgent(
  agent,
  authorization,
  authHandlerName,
  turnContext,
  authToken  // Optional, will be obtained if not provided
);

// Agent now has access to both existing tools and MCP tools
const result = await agent.invoke({ input: 'Search for documents' });
```

**Method Signature:**

```typescript
async addToolServersToAgent(
  agent: ReactAgent,              // LangChain agent to update
  authorization: Authorization,   // Authorization object for token exchange
  authHandlerName: string,       // Auth handler name
  turnContext: TurnContext,      // Current turn context
  authToken: string              // Bearer token (optional)
): Promise<ReactAgent>           // Returns new agent with MCP tools
```

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

// Create MCP client
const mcpClientConfig: ClientConfig = { mcpServers };
const multiServerMcpClient = new MultiServerMCPClient(mcpClientConfig);

// Get LangChain-compatible tools
const mcpTools = await multiServerMcpClient.getTools();
```

## Tool Merging

The service preserves existing tools when adding MCP tools:

```typescript
// Get existing tools from agent
const existingTools = agent.options.tools ?? [];

// Get MCP tools from servers
const mcpTools = await multiServerMcpClient.getTools();

// Combine all tools
const allTools = [...existingTools, ...mcpTools];

// Create new agent with combined tools
return createAgent({
  ...agent.options,
  tools: allTools
});
```

## Usage Example

Complete example with a LangChain agent:

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-langchain';

// In your agent's message handler
async function onMessage(turnContext: TurnContext, authorization: Authorization) {
  const registrationService = new McpToolRegistrationService();

  // Create LangChain chat model
  const chatModel = new ChatOpenAI({
    modelName: 'gpt-4',
    temperature: 0
  });

  // Create initial agent
  let agent = createAgent({
    llm: chatModel,
    tools: []  // Start with no tools
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
  const result = await agent.invoke({
    input: turnContext.activity.text
  });

  await turnContext.sendActivity(result.output);
}
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

- `@microsoft/agents-a365-tooling` - MCP server discovery and configuration
- `@microsoft/agents-a365-runtime` - Authentication service, agent identity resolution
- `@microsoft/agents-hosting` - TurnContext, Authorization types
- `@langchain/mcp-adapters` - MCP adapters for LangChain (ClientConfig, Connection, MultiServerMCPClient)
- `langchain` - LangChain core (createAgent, ReactAgent)

## Orchestrator Identification

The service identifies itself as "LangChain" in User-Agent headers:

```typescript
private readonly orchestratorName: string = "LangChain";

// Results in User-Agent header:
// "Agent365SDK/1.0.0 (Windows_NT; Node.js v18.0.0; LangChain)"
```
