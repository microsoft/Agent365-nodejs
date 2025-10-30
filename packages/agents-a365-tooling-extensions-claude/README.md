# Agent 365 Node.js Claude Tooling SDK

This package provides TypeScript/Node.js support for integrating Microsoft Agent365 tooling with Claude SDK, enabling seamless access to MCP servers.

The package name is **@microsoft/agents-a365-tooling-extensions-claude**

## Installation

This package is part of the `@microsoft/agent365-sdk` workspace and is typically installed as a dependency:

```bash
npm install @microsoft/agents-a365-tooling-extensions-claude
```

## Core Components

### `McpToolRegistrationService`

The main service class that handles MCP server discovery and tool registration for Claude.

```typescript
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-claude';

const toolService = new McpToolRegistrationService();
```

## Usage

### 1. Basic Tool Server Registration

Register all available MCP tool servers with Claude options:

```typescript
import { query, Options } from '@anthropic-ai/claude-code';
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-claude';
import { AgentApplication } from '@microsoft/agents-hosting';

const app = new AgentApplication();

const agentOptions: Options = {
  appendSystemPrompt: `You are a helpful AI assistant integrated with Microsoft 365.`,
  maxTurns: 3,
  allowedTools: ['Read', 'Write', 'WebSearch', 'Bash', 'Grep'],
};

const toolService = new McpToolRegistrationService();

await toolService.addToolServers(
  agentOptions,
  process.env.AGENTIC_USER_ID || '',
  process.env.MCP_ENVIRONMENT_ID || '',
  app.authorization,
  turnContext,
  process.env.MCP_AUTH_TOKEN || ''
);
```

### 2. Complete Agent Setup with Tools

```typescript
import { query, Options } from '@anthropic-ai/claude-code';
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-claude';

async function invokeAgent(userMessage: string): Promise<string> {
  let claudeResponse = "";
  try {
    for await (const message of query({
      prompt: userMessage,
      options: agentOptions
    })) {
      if (message.type === 'result' && message.result) {
        claudeResponse = message.result;
        break;
      }
    }
    if (!claudeResponse) {
      return "Sorry, I couldn't get a response from Claude :(";
    }
    return claudeResponse;
  } catch (error) {
    console.error('Claude query error:', error);
    return `Error: ${error.message || error}`;
  }
}
```

### 3. Tool Discovery and Inspection

List available tools from registered MCP servers:

```typescript
import { McpServerConfig } from '@anthropic-ai/claude-code';
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-claude';

const toolService = new McpToolRegistrationService();

// Create MCP server configuration
const mcpServerConfig: McpServerConfig = {
  type: 'http',
  url: 'https://your-mcp-server.com',
  headers: {
    'Authorization': `Bearer ${authToken}`,
  }
};

// Get available tools
const tools = await toolService.getTools('MyToolServer', mcpServerConfig);
console.log('Available tools:', tools);
```

## Configuration

### Environment Variables

The following environment variables are commonly used:

```bash
# Agent365 Authentication
AGENTIC_USER_ID=your-user-id
MCP_AUTH_TOKEN=your-auth-token

# Agent Configuration
AGENT_ID=your-agent-id
```

### Authentication Options

The SDK supports multiple authentication methods:

1. **Agent365 Authentication** (Recommended for production)
   ```typescript
   // Uses authorization and turnContext for token acquisition
   await toolService.addToolServers(
     agentOptions,
     userId,
     authorization,
     turnContext,
     '' // Empty auth token - will be acquired automatically
   );
   ```

2. **Direct Token Authentication**
   ```typescript
   // Uses provided MCP_AUTH_TOKEN
   await toolService.addToolServers(
     agentOptions,
     userId,
     authorization,
     turnContext,
     process.env.MCP_AUTH_TOKEN
   );
   ```

## Complete Example

See the complete working example in [`/nodejs/samples/claude-code-sdk/`](../../../samples/claude-code-sdk/) which demonstrates:

- Full agent setup with MCP tool registration
- Agent365 notification handling (email and Word comments)
- Observability integration
- Error handling and lifecycle management

## Dependencies

This package depends on:

- `@anthropic-ai/claude-code` - Claude SDK
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
- **Samples**: Working examples in `/nodejs/samples/claude-code-sdk/`
