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
    return result.finalOutput || \"Sorry, I couldn't process your request.\";
  } catch (error) {
    console.error('OpenAI agent error:', error);
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
