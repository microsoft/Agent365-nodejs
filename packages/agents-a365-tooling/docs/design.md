# Tooling - Design Document

This document describes the architecture and design of the `@microsoft/agents-a365-tooling` package.

## Overview

The tooling package provides MCP (Model Context Protocol) tool server configuration and discovery services. It enables agents to dynamically discover and connect to tool servers for extending agent capabilities.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Public API                                │
│  McpToolServerConfigurationService | Utility | Contracts        │
│  ToolingConfiguration                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              McpToolServerConfigurationService                   │
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │   Development Mode   │    │   Production Mode   │            │
│  │                     │    │                     │            │
│  │ ToolingManifest.json│    │  Tooling Gateway    │            │
│  │    (local file)     │    │   (HTTP endpoint)   │            │
│  └─────────────────────┘    └─────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     MCPServerConfig[]                            │
│  { mcpServerName, url, headers? }                               │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### McpToolServerConfigurationService ([McpToolServerConfigurationService.ts](../src/McpToolServerConfigurationService.ts))

The main service for discovering and configuring MCP tool servers.

```typescript
import { McpToolServerConfigurationService } from '@microsoft/agents-a365-tooling';

const service = new McpToolServerConfigurationService();

// Discover tool servers
const servers = await service.listToolServers(
  agenticAppId,
  bearerToken,
  { orchestratorName: 'MyOrchestrator' }
);

// Get tools from a specific server
const tools = await service.getMcpClientTools(
  server.mcpServerName,
  server
);
```

#### Environment Detection

The service automatically selects the configuration source based on the `ToolingConfiguration.useToolingManifest` setting:

| Configuration | Source | Description |
|---------------|--------|-------------|
| `useToolingManifest: true` | `ToolingManifest.json` | Local file-based configuration |
| `useToolingManifest: false` (default) | Tooling Gateway | HTTP endpoint discovery |

The `useToolingManifest` property checks `NODE_ENV === 'development'` by default, but can be overridden via configuration:

```typescript
private isDevScenario(): boolean {
  return defaultToolingConfigurationProvider.getConfiguration().useToolingManifest;
}
```

#### Development Mode: Manifest-Based Configuration

In development mode, the service reads from `ToolingManifest.json`:

```json
{
  "mcpServers": [
    {
      "mcpServerName": "mailMCPServer",
      "mcpServerUniqueName": "mcp_MailTools"
    },
    {
      "mcpServerName": "sharePointMCPServer",
      "mcpServerUniqueName": "mcp_SharePointTools"
    }
  ]
}
```

**Search locations for manifest file:**
1. Current working directory (`process.cwd()`)
2. Directory of the main script (`process.argv[1]`)

#### Production Mode: Gateway-Based Configuration

In production mode, the service calls the tooling gateway endpoint:

```
GET https://agent365.svc.cloud.microsoft/agents/{agenticAppId}/mcpServers
Authorization: Bearer {authToken}
User-Agent: Agent365SDK/x.x.x (...)
```

### Utility Class ([Utility.ts](../src/Utility.ts))

Helper functions for token validation and header composition:

```typescript
import { Utility } from '@microsoft/agents-a365-tooling';

// Compose standard headers for MCP requests
const headers = Utility.GetToolRequestHeaders(
  authToken,
  turnContext,
  { orchestratorName: 'MyOrchestrator' }
);

// Validate JWT token (throws if invalid or expired)
Utility.ValidateAuthToken(authToken);
```

**Deprecated Methods:**

The following URL construction methods are deprecated and for internal use only. Use `McpToolServerConfigurationService` instead:

| Method | Replacement |
|--------|-------------|
| `GetToolingGatewayForDigitalWorker()` | `McpToolServerConfigurationService.listToolServers()` |
| `GetMcpBaseUrl()` | Use `McpToolServerConfigurationService` |
| `BuildMcpServerUrl()` | Use `McpToolServerConfigurationService` |
| `GetChatHistoryEndpoint()` | `McpToolServerConfigurationService.sendChatHistory()` |

**Header Constants:**

| Constant | Header Name |
|----------|-------------|
| `HEADER_CHANNEL_ID` | `x-ms-channel-id` |
| `HEADER_SUBCHANNEL_ID` | `x-ms-subchannel-id` |
| `HEADER_USER_AGENT` | `User-Agent` |

## Data Models

### MCPServerConfig ([contracts.ts](../src/contracts.ts))

```typescript
interface MCPServerConfig {
  mcpServerName: string;      // Display name of the tool server
  url: string;                // Full URL endpoint for the MCP server
  headers?: Record<string, string>;  // Optional request headers
}
```

### McpClientTool

```typescript
interface McpClientTool {
  name: string;               // Tool name
  description?: string;       // Tool description
  inputSchema: InputSchema;   // JSON schema for tool inputs
}
```

### InputSchema

```typescript
interface InputSchema {
  type: string;
  properties?: Record<string, object>;
  required?: string[];
  additionalProperties?: boolean;
}
```

### ToolOptions

```typescript
interface ToolOptions {
  orchestratorName?: string;  // Name for User-Agent header
}
```

## Design Patterns

### Strategy Pattern

The service uses the Strategy pattern to select between configuration sources:

```typescript
async listToolServers(agenticAppId: string, authToken: string): Promise<MCPServerConfig[]> {
  return this.isDevScenario()
    ? this.getMCPServerConfigsFromManifest()        // Strategy A
    : this.getMCPServerConfigsFromToolingGateway(); // Strategy B
}
```

### MCP Client Integration

The service uses the official MCP SDK for tool discovery:

```typescript
async getMcpClientTools(serverName: string, config: MCPServerConfig): Promise<McpClientTool[]> {
  const transport = new StreamableHTTPClientTransport(
    new URL(config.url),
    { requestInit: { headers: config.headers } }
  );

  const client = new Client({ name: serverName + ' Client', version: '1.0' });
  await client.connect(transport);
  const tools = await client.listTools();
  await client.close();

  return tools.tools;
}
```

## Configuration

The tooling package provides configuration via `ToolingConfiguration`, which extends `RuntimeConfiguration`:

```typescript
import {
  ToolingConfiguration,
  defaultToolingConfigurationProvider
} from '@microsoft/agents-a365-tooling';

// Using the default provider (reads from env vars)
const config = defaultToolingConfigurationProvider.getConfiguration();
console.log(config.mcpPlatformEndpoint);  // MCP platform base URL
console.log(config.useToolingManifest);     // true if NODE_ENV=development
console.log(config.mcpPlatformAuthenticationScope);  // MCP auth scope

// Custom configuration with overrides
const customConfig = new ToolingConfiguration({
  mcpPlatformEndpoint: () => 'https://custom.endpoint',
  useToolingManifest: () => true,  // Force manifest mode
  mcpPlatformAuthenticationScope: () => 'custom-scope/.default'
});
```

**Configuration Properties:**

| Property | Env Variable | Default | Description |
|----------|--------------|---------|-------------|
| `mcpPlatformEndpoint` | `MCP_PLATFORM_ENDPOINT` | `https://agent365.svc.cloud.microsoft` | Base URL for MCP platform |
| `useToolingManifest` | `NODE_ENV` | `false` | Use local manifest (true if NODE_ENV='development') |
| `mcpPlatformAuthenticationScope` | `MCP_PLATFORM_AUTHENTICATION_SCOPE` | Production scope | OAuth scope for MCP platform auth |
| `clusterCategory` | `CLUSTER_CATEGORY` | `prod` | (Inherited) Environment cluster |
| `isDevelopmentEnvironment` | - | Derived | (Inherited) true if cluster is 'local' or 'dev' |
| `isNodeEnvDevelopment` | `NODE_ENV` | `false` | (Inherited) true if NODE_ENV='development' |

## File Structure

```
src/
├── index.ts                              # Public API exports
├── McpToolServerConfigurationService.ts  # Main service
├── Utility.ts                            # Helper utilities
├── contracts.ts                          # Type definitions
├── models.ts                             # Data models
└── configuration/
    ├── index.ts                          # Configuration exports
    ├── ToolingConfigurationOptions.ts    # Options type
    └── ToolingConfiguration.ts           # Configuration class
```

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `NODE_ENV` | Controls useToolingManifest (dev mode) | Production |
| `MCP_PLATFORM_ENDPOINT` | Base URL for MCP platform | `https://agent365.svc.cloud.microsoft` |
| `MCP_PLATFORM_AUTHENTICATION_SCOPE` | OAuth scope for MCP platform | Production scope |

## Error Handling

The service provides detailed error messages:

```typescript
// Token validation errors
Error('Authentication token is required')
Error('Invalid JWT token format')
Error('Failed to decode JWT token payload')
Error('Authentication token has expired')
Error('Authentication token does not contain expiration claim')

// Gateway errors
Error(`Failed to read MCP servers from endpoint: ${code} ${message}`)
```

## Dependencies

- `@microsoft/agents-a365-runtime` - Agent identity resolution, User-Agent generation
- `@microsoft/agents-hosting` - TurnContext type
- `@modelcontextprotocol/sdk` - MCP client and transport
- `axios` - HTTP client for gateway communication

## Integration with Framework Extensions

The tooling package is extended by framework-specific packages:

| Extension Package | Purpose |
|-------------------|---------|
| `tooling-extensions-claude` | Claude SDK integration |
| `tooling-extensions-langchain` | LangChain integration |
| `tooling-extensions-openai` | OpenAI Agents SDK integration |

These extensions adapt the `MCPServerConfig` objects to framework-specific tool definitions.
