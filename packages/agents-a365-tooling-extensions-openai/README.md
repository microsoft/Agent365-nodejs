# @microsoft/agents-a365-tooling-extensions-openai

[![npm](https://img.shields.io/npm/v/@microsoft/agents-a365-tooling-extensions-openai?label=npm&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-tooling-extensions-openai)
[![npm Downloads](https://img.shields.io/npm/dm/@microsoft/agents-a365-tooling-extensions-openai?label=Downloads&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-tooling-extensions-openai)

OpenAI Agents SDK integration for Microsoft Agents A365 tooling. This package enables seamless integration of MCP (Model Context Protocol) tool servers with OpenAI Agents, providing automatic tool discovery and registration.

## Installation

```bash
npm install @microsoft/agents-a365-tooling-extensions-openai
```

## Usage

### Basic Tool Server Registration

```typescript
import { Agent } from '@openai/agents';
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-openai';

const agent = new Agent({
  name: 'My Agent',
  model: 'gpt-4o'
});

const toolService = new McpToolRegistrationService();

// Register MCP tool servers with the agent
await toolService.addMcpToolServers(
  agent,
  process.env.AGENTIC_USER_ID || '',
  process.env.MCP_ENVIRONMENT_ID || '',
  authorization,
  turnContext,
  process.env.MCP_AUTH_TOKEN || ''
);
```

### Complete Agent Setup

```typescript
import { Agent, run } from '@openai/agents';
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-openai';

async function invokeAgent(userMessage: string): Promise<string> {
  try {
    const result = await run(agent, userMessage);
    return result.finalOutput || "Sorry, I couldn't process your request.";
  } catch (error) {
    console.error('OpenAI agent error:', error);
    return `Error: ${error.message || error}`;
  }
}
```

## Support

For issues, questions, or feedback:

- File issues in the [GitHub Issues](https://github.com/microsoft/Agent365-nodejs/issues) section
- See the [main documentation](../../README.md) for more information

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details.
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