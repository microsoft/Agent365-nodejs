# Agent 365 Node.js LangChain Tooling SDK

This package provides TypeScript/Node.js support for integrating Microsoft Agent365 tooling with LangChain, enabling seamless access to MCP servers and tools within LangChain-based AI agents.

The package name is **@microsoft/agents-a365-tooling-extensions-langchain**

## Installation

This package is part of the `@microsoft/agent365-sdk` workspace and is typically installed as a dependency:

```bash
npm install @microsoft/agents-a365-tooling-extensions-langchain
```

## Core Components

### `McpToolRegistrationService`

The main service class that handles MCP server discovery and tool registration for LangChain agents. It converts MCP tools into LangChain-compatible `DynamicStructuredTool` instances.

```typescript
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-langchain';

const toolService = new McpToolRegistrationService();
```

## Usage

### 1. Basic Tool Server Registration

Register all available MCP tool servers with LangChain client configuration:

```typescript
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-langchain';
import { ClientConfig } from '@langchain/mcp-adapters';
import { Authorization, TurnContext } from '@microsoft/agents-hosting';

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
  name: 'LangChain Agent',
  includeAgentName: 'inline'
});
```

### 2. Complete Agent Setup with Agent365 Integration

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
