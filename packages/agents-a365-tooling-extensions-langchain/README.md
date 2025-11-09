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
import { createReactAgent } from \"@langchain/langgraph/prebuilt\";
import { ChatOpenAI } from \"@langchain/openai\";
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
  model: \"gpt-4o-mini\",
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
          role: \"user\",
          content: userMessage,
        },
      ],
    });
    
    return result.messages[result.messages.length - 1].content;
  } catch (error) {
    console.error('LangChain agent error:', error);
    return \Error: \\;
  }
}
```

## Support

For issues, questions, or feedback:

- File issues in the [GitHub Issues](https://github.com/microsoft/Agent365-nodejs/issues) section
- See the [main documentation](../../README.md) for more information

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details
