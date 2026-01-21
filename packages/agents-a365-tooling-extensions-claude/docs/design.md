# Tooling Extensions - Claude - Design Document

This document describes the architecture and design of the `@microsoft/agents-a365-tooling-extensions-claude` package.

## Overview

The Claude tooling extensions package provides integration between the Microsoft Agent 365 MCP tooling system and the Claude (Anthropic) Agent SDK. It enables automatic discovery and registration of MCP tool servers with Claude agents.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Agent SDK                              │
│             (@anthropic-ai/claude-agent-sdk)                     │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
                    (Options with mcpServers)
                              │
┌─────────────────────────────────────────────────────────────────┐
│              McpToolRegistrationService                          │
│                                                                  │
│  1. Discover MCP servers via tooling package                    │
│  2. Transform to Claude-compatible format                        │
│  3. Prefix tool names with mcp__<server>__                      │
│  4. Add to agent options                                         │
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

Main service for registering MCP tools with Claude agents:

```typescript
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-claude';
import { Options } from '@anthropic-ai/claude-agent-sdk';

const registrationService = new McpToolRegistrationService();

// Create Claude agent options
const agentOptions: Options = {
  name: 'MyClaudeAgent',
  model: 'claude-3-opus-20240229',
  instructions: 'You are a helpful assistant.'
};

// Register MCP tools with the agent
await registrationService.addToolServersToAgent(
  agentOptions,
  authorization,
  authHandlerName,
  turnContext,
  authToken  // Optional, will be obtained if not provided
);

// agentOptions now contains:
// - mcpServers: { serverName: { type: 'http', url: '...', headers: {...} } }
// - allowedTools: ['mcp__serverName__toolName', ...]
```

**Method Signature:**

```typescript
async addToolServersToAgent(
  agentOptions: Options,         // Claude agent options to update
  authorization: Authorization,   // Authorization object for token exchange
  authHandlerName: string,       // Auth handler name
  turnContext: TurnContext,      // Current turn context
  authToken: string              // Bearer token (optional)
): Promise<void>
```

## Tool Name Prefixing

The service prefixes tool names to match Claude's MCP tool naming convention:

```typescript
// Original tool name: "search"
// Server name: "webTools"
// Claude tool name: "mcp__webTools__search"

clientTools = clientTools.map((tool) => ({
  name: 'mcp__' + server.mcpServerName + '__' + tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema
}));
```

## Configuration Format

The service transforms MCP server configs to Claude's expected format:

```typescript
// Input (from McpToolServerConfigurationService)
const mcpConfig: MCPServerConfig = {
  mcpServerName: 'mailTools',
  url: 'https://agent365.svc.cloud.microsoft/agents/servers/mailTools'
};

// Output (for Claude SDK)
const claudeConfig: McpServerConfig = {
  type: 'http',
  url: 'https://agent365.svc.cloud.microsoft/agents/servers/mailTools',
  headers: {
    'Authorization': 'Bearer <token>',
    'x-ms-channel-id': 'teams',
    'x-ms-subchannel-id': 'email',
    'User-Agent': 'Agent365SDK/1.0.0 (Windows_NT; Node.js v18.0.0; Claude)'
  }
};
```

## Usage Example

Complete example with a Claude agent:

```typescript
import { Claude } from '@anthropic-ai/claude-agent-sdk';
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-claude';

// In your agent's message handler
async function onMessage(turnContext: TurnContext, authorization: Authorization) {
  const registrationService = new McpToolRegistrationService();

  // Prepare Claude agent options
  const options = {
    name: 'MyAssistant',
    model: 'claude-3-opus-20240229',
    instructions: 'You are a helpful assistant with access to Microsoft 365 tools.'
  };

  // Register MCP tools
  await registrationService.addToolServersToAgent(
    options,
    authorization,
    'myAuthHandler',
    turnContext,
    authToken
  );

  // Create and run the agent
  const agent = new Claude(options);
  const response = await agent.run(turnContext.activity.text);

  await turnContext.sendActivity(response);
}
```

## Authentication Flow

The service handles authentication automatically:

```typescript
// If authToken is not provided, get it via token exchange
if (!authToken) {
  authToken = await AgenticAuthenticationService.GetAgenticUserToken(
    authorization,
    authHandlerName,
    turnContext
  );
}

// Validate the token before use
Utility.ValidateAuthToken(authToken);

// Resolve agent identity for server discovery
const agenticAppId = RuntimeUtility.ResolveAgentIdentity(turnContext, authToken);
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
- `@anthropic-ai/claude-agent-sdk` - Claude SDK types (McpServerConfig, Options)
- `@modelcontextprotocol/sdk` - MCP client types

## Orchestrator Identification

The service identifies itself as "Claude" in User-Agent headers:

```typescript
private readonly orchestratorName: string = "Claude";

// Results in User-Agent header:
// "Agent365SDK/1.0.0 (Windows_NT; Node.js v18.0.0; Claude)"
```
