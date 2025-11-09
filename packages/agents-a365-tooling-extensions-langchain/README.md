# @microsoft/agents-a365-tooling-extensions-langchain

[![npm](https://img.shields.io/npm/v/@microsoft/agents-a365-tooling-extensions-langchain?label=npm&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-tooling-extensions-langchain)
[![npm Downloads](https://img.shields.io/npm/dm/@microsoft/agents-a365-tooling-extensions-langchain?label=Downloads&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-tooling-extensions-langchain)

LangChain integration for Microsoft Agents A365 tooling. This package enables seamless integration of MCP (Model Context Protocol) tool servers with LangChain agents, providing automatic tool discovery and registration as DynamicStructuredTool instances.

## Installation

```bash
npm install @microsoft/agents-a365-tooling-extensions-langchain
```

## Usage

### Basic Tool Server Registration

```typescript
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-langchain';
import { ClientConfig } from '@langchain/mcp-adapters';

const toolService = new McpToolRegistrationService();

// Configure MCP client
const mcpClientConfig = {} as ClientConfig;

// Add MCP tool servers and get LangChain tools
const tools = await toolService.addMcpToolServers(
  mcpClientConfig,
  process.env.AGENTIC_USER_ID || '',
  process.env.MCP_ENVIRONMENT_ID || '',
  authorization,
  turnContext,
  process.env.MCP_AUTH_TOKEN || ''
);

// Create the model
const model = new ChatOpenAI({
  model: "gpt-4o-mini",
});

// Create the agent with MCP tools
const agent = createReactAgent({
  llm: model,
  tools: tools,
  name: 'LangChain Agent'
});
```

### Complete Agent Setup

```typescript
async function invokeAgent(userMessage: string): Promise<string> {
  try {
    const result = await agent.invoke({
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });
    
    return result.messages[result.messages.length - 1].content;
  } catch (error) {
    console.error('LangChain agent error:', error);
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
    });

    let agentMessage = '';

    // Extract the content from the LangChain response
    if (result.messages && result.messages.length > 0) {
      const lastMessage = result.messages[result.messages.length - 1];
      agentMessage = lastMessage.content || "No content in response";
    }

    // Fallback if result is already a string
    if (typeof result === 'string') {
      agentMessage = result;
    }

    if (!agentMessage) {
      return "Sorry, I couldn't get a response from the agent :(";
    }

    return agentMessage;
  } catch (error) {
    console.error('LangChain agent error:', error);
    const err = error as any;
    return `Error: ${err.message || err}`;
  }
}
```

### 3. Tool Discovery and Inspection

List available tools from registered MCP servers:

```typescript
import { Connection } from '@langchain/mcp-adapters';
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-langchain';

const toolService = new McpToolRegistrationService();

// Create MCP server connection
const mcpServerName = 'MyMCPServer';
const mcpServerConnection: Connection = {
  type: 'http',
  url: 'https://your-mcp-server.com',
  headers: {
    'Authorization': `Bearer ${authToken}`,
    'x-ms-environment-id': environmentId,
  }
};

// Get available tools
const tools = await toolService.getTools(mcpServerName, mcpServerConnection);
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
     mcpClientConfig,
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
     mcpClientConfig,
     userId,
     environmentId,
     authorization,
     turnContext,
     process.env.MCP_AUTH_TOKEN
   );
   ```

## Complete Example

See the complete working example in [`/nodejs/samples/langchain-sample/`](../../../samples/langchain-sample/) which demonstrates:

- Full agent setup with MCP tool registration
- LangChain React agent creation with Agent365 tools
- Agent365 notification handling (email and Word comments)
- Observability integration with tracing
- Error handling and lifecycle management
- Express.js hosting integration

## Dependencies

This package depends on:

- `@langchain/core` - LangChain core functionality
- `@langchain/mcp-adapters` - LangChain MCP adapters
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
- **Samples**: Working examples in `/nodejs/samples/langchain-sample/`
