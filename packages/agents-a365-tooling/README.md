# Agent 365 Node.js Tooling SDK

This directory contains the Node.js implementation of Agent 365 Tooling SDK for discovering and configuring MCP (Model Context Protocol) tool servers.

The package name is **@microsoft/agents-a365-tooling**

## Features

- **Automatic Server Discovery**: Discovers MCP tool servers in development and production environments
- **Environment-Aware Configuration**: Different behavior for development vs production environments
- **Flexible Tool Server Sources**: Supports local manifest files and remote tooling gateway
- **URL Generation**: Automatically builds proper MCP server URLs for different environments
- **Error Handling**: Comprehensive error handling and fallback mechanisms

## Core Components

### `McpToolServerConfigurationService`

The main service for discovering and configuring MCP tool servers.

### `Utility`

Helper class for URL construction and environment detection.

## How to Retrieve Agent 365 Tools

### Basic Usage

```typescript
import { McpToolServerConfigurationService } from '@microsoft/agents-a365-tooling';

const configService = new McpToolServerConfigurationService();
const servers = await configService.listToolServers(agentUserId, authToken);
```

### Understanding Tool Server Discovery

The `listToolServers` method uses different strategies based on your environment:

#### Development Mode (`NODE_ENV=Development`)

In development, the service reads from a local `ToolingManifest.json` file:

1. **Primary Location**: `[ProjectRoot]/ToolingManifest.json`
2. **Fallback Location**: `[process.argv[1] directory]/ToolingManifest.json`

#### Production Mode (any other NODE_ENV)

In production, the service queries the remote tooling gateway using the provided agent user ID.

## Configuration

### Environment Variables

Configure the service behavior using these environment variables:

```bash
# Environment (determines discovery strategy)
NODE_ENV=Development|Test|Production

# For development mode with MCP Platform
MCP_DEVELOPMENT_BASE_URL=https://agent365.svc.cloud.microsoft/mcp/environments

# For development mode with mock servers
TOOLS_MODE=MockMCPServer
MOCK_MCP_SERVER_URL=http://localhost:5309/mcp-mock/agents/servers

# For production environments
# No additional environment variables needed - uses default endpoints
```

### Development Setup with ToolingManifest.json

Create a `ToolingManifest.json` file in your project root:

```json
{
  "mcpServers": [
    {
      "mcpServerName": "MailTools",
      "mcpServerUniqueName": "mcp_MailTools"
    },
    {
      "mcpServerName": "CalendarTools",
      "mcpServerUniqueName": "mcp_CalendarTools"
    },
    {
      "mcpServerName": "SharePointTools",
      "mcpServerUniqueName": "mcp_SharePointTools"
    },
    {
      "mcpServerName": "OneDriveTools",
      "mcpServerUniqueName": "mcp_OneDriveServer"
    },
    {
      "mcpServerName": "NLWeb",
      "mcpServerUniqueName": "mcp_NLWeb"
    }
  ]
}
```

**Schema Explanation:**
- `mcpServerName`: Display name for the server (used in logs and debugging)
- `mcpServerUniqueName`: Unique identifier used to build the server URL

### Production Setup with Tooling Gateway

For production environments, ensure you have:

1. **Valid Agent User ID**: The unique identifier for your digital worker/agent
2. **Authentication Token**: Bearer token for accessing the tooling gateway.

```typescript
const agentUserId = process.env.AGENTIC_USER_ID || 'your-agent-user-id';
const authToken = process.env.MCP_AUTH_TOKEN || await getAuthToken();

const servers = await configService.listToolServers(agentUserId, authToken);
```

## Troubleshooting Tool Discovery

### Common Issues and Solutions

#### No Tools Found in Development

**Problem**: `listToolServers` returns an empty array in development.

**Solutions:**
- Verify `ToolingManifest.json` exists in your project root
- Check the JSON syntax is valid
- Ensure `NODE_ENV=Development` is set
- Check console warnings for file path issues

```typescript
// Debug tool server discovery
const configService = new McpToolServerConfigurationService();
console.log('Environment:', process.env.NODE_ENV);
console.log('Current working directory:', process.cwd());

const servers = await configService.listToolServers(agentUserId, authToken);
console.log('Discovered servers:', servers);
```

#### Invalid Server URLs

**Problem**: Generated URLs don't work or return 404 errors.

**Solutions:**
- Check `mcpServerUniqueName` values in your manifest match available servers
- Ensure the environment's base URL is accessible

## Integration Examples

For complete working implementations, see:

- **Claude Integration**: [`../Claude/McpToolRegistrationService.ts`](../Claude/McpToolRegistrationService.ts)
- **OpenAI Integration**: [`../OpenAI/McpToolRegistrationService.ts`](../OpenAI/McpToolRegistrationService.ts)
