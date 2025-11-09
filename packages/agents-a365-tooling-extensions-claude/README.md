# @microsoft/agents-a365-tooling-extensions-claude

[![npm](https://img.shields.io/npm/v/@microsoft/agents-a365-tooling-extensions-claude?label=npm&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-tooling-extensions-claude)
[![npm Downloads](https://img.shields.io/npm/dm/@microsoft/agents-a365-tooling-extensions-claude?label=Downloads&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-tooling-extensions-claude)

Claude SDK integration for Microsoft Agents A365 tooling. This package enables seamless integration of MCP (Model Context Protocol) tool servers with Anthropic's Claude, providing automatic tool discovery and registration.

## Installation

```bash
npm install @microsoft/agents-a365-tooling-extensions-claude
```

## Usage

### Basic Tool Server Registration

```typescript
import { query, Options } from '@anthropic-ai/claude-code';
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-claude';

const agentOptions: Options = {
  appendSystemPrompt: `You are a helpful AI assistant integrated with Microsoft 365.`,
  maxTurns: 3,
  allowedTools: ['Read', 'Write', 'WebSearch', 'Bash', 'Grep'],
};

const toolService = new McpToolRegistrationService();

// Add MCP tool servers to Claude options
await toolService.addToolServers(
  agentOptions,
  process.env.AGENTIC_USER_ID || '',
  process.env.MCP_ENVIRONMENT_ID || '',
  authorization,
  turnContext,
  process.env.MCP_AUTH_TOKEN || ''
);
```

### Complete Agent Setup

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
    return claudeResponse || "Sorry, I couldn't get a response from Claude.";
  } catch (error) {
    console.error('Claude error:', error);
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
    'x-ms-environment-id': environmentId,
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
   await toolService.addToolServers(
     agentOptions,
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
   await toolService.addToolServers(
     agentOptions,
     userId,
     environmentId,
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
