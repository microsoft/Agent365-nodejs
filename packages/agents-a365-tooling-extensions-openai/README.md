````markdown
# Agent 365 Node.js OpenAI Tooling SDK

This package provides TypeScript/Node.js support for integrating Microsoft Agent365 tooling with OpenAI Agents SDK, enabling seamless access to MCP servers.

The package name is **@microsoft/agents-a365-tooling-extensions-openai**

## Installation

This package is part of the `@microsoft/agent365-sdk` workspace and is typically installed as a dependency:

```bash
npm install @microsoft/agents-a365-tooling-extensions-openai
```

## Core Components

### `McpToolRegistrationService`

The main service class that handles MCP server discovery and tool registration for OpenAI Agents.

```typescript
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-openai';

const toolService = new McpToolRegistrationService();
```

## Usage

### 1. Basic Tool Server Registration

Register all available MCP tool servers with an OpenAI Agent:

```typescript
import { Agent } from '@openai/agents';
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-openai';

const agent = new Agent({
  name: 'My Agent',
  // Other agent configuration
});

const toolService = new McpToolRegistrationService();

await toolService.addMcpToolServers(
  agent,
  process.env.AGENTIC_USER_ID || '',
  process.env.MCP_ENVIRONMENT_ID || '',
  authorization,
  turnContext,
  process.env.MCP_AUTH_TOKEN || ''
);
```

### 2. Complete Agent Setup with Tools

```typescript
import { Agent, run } from '@openai/agents';
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-openai';

async function invokeAgent(userMessage: string): Promise<string> {
try {
    // Connect to MCP servers
    await connectToServers();

    // Run the agent with the user message
    const result = await run(agent, userMessage);
    return result.finalOutput || "Sorry, I couldn't process your request.";
} catch (error) {
    console.error('OpenAI agent error:', error);
    return `Error: ${error.message || error}`;
} finally {
    // Clean up connections
    await closeServers();
}
}

async function connectToServers(): Promise<void> {
if (agent.mcpServers && agent.mcpServers.length > 0) {
    for (const server of agent.mcpServers) {
    await server.connect();
    }
}
}

async function closeServers(): Promise<void> {
if (agent.mcpServers && agent.mcpServers.length > 0) {
    for (const server of agent.mcpServers) {
    await server.close();
    }
}
}
```

### 3. Tool Discovery and Inspection

List available tools from registered MCP servers:

```typescript
import { MCPServerStreamableHttp } from '@openai/agents';
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-openai';

const toolService = new McpToolRegistrationService();

// Create MCP server configuration
const mcpServer = new MCPServerStreamableHttp({
  url: 'https://your-mcp-server.com',
  name: 'MyToolServer',
  requestInit: {
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'x-ms-environment-id': environmentId,
    }
  }
});

// Get available tools
const tools = await toolService.getTools(mcpServer);
console.log('Available tools:', tools);
```

## Configuration

### Environment Variables

The following environment variables are commonly used:

```bash
# Agent365 Authentication
AGENTIC_USER_ID=your-user-id
MCP_ENVIRONMENT_ID=your-environment-id
MCP_AUTH_TOKEN=your-auth-token

# Agent Configuration
AGENT_ID=your-agent-id
```

### Authentication Options

The SDK supports multiple authentication methods:

1. **Agent365 Authentication** (Recommended for production)
   ```typescript
   // Uses authorization and turnContext for token acquisition
   await toolService.addMcpToolServers(
     agent,
     userId,
     environmentId,
     authorization,
     turnContext,
     '' // Empty auth token - will be acquired automatically
   );
   ```

2. **Direct Token Authentication**
   ```typescript
   // Uses provided MCP_AUTH_TOKEN
   await toolService.addMcpToolServers(
     agent,
     userId,
     environmentId,
     authorization,
     turnContext,
     process.env.MCP_AUTH_TOKEN
   );
   ```

## Complete Example

See the complete working example in [`/nodejs/samples/openai-agents-sdk/`](../../../samples/openai-agents-sdk/) which demonstrates:

- Full agent setup with MCP tool registration
- Agent365 notification handling (email and Word comments)
- Observability integration
- Error handling and lifecycle management

## Dependencies

This package depends on:

- `@openai/agents` - OpenAI Agents SDK
- `@microsoft/agents-hosting` - Agent365 hosting framework
- `@microsoft/agents-a365-tooling` - Common tooling functionality
- `@microsoft/agents-a365-runtime` - Agent365 runtime services

## License

See the main repository license file.

## Contributing

Contributions are welcome! Please see the main repository for contribution guidelines.

## Support

- **Issues**: Report bugs and request features through GitHub Issues
- **Documentation**: Additional documentation available in the main repository
- **Samples**: Working examples in `/nodejs/samples/openai-agents-sdk/`

````