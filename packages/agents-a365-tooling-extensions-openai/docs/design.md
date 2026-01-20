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

## Comparison with Other Extensions

| Feature | OpenAI Extension | Claude Extension | LangChain Extension |
|---------|------------------|------------------|---------------------|
| Server Class | `MCPServerStreamableHttp` | `McpServerConfig` | `Connection` |
| Tool Discovery | Automatic via SDK | Manual via client | Via MCP adapters |
| Tool Naming | Native MCP names | `mcp__server__tool` | Native MCP names |
| Return Type | Updated `Agent` | `void` (modifies options) | New `ReactAgent` |
