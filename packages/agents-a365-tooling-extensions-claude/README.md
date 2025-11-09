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
  appendSystemPrompt: \You are a helpful AI assistant integrated with Microsoft 365.\,
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
  let claudeResponse = \"\";
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
    return claudeResponse || \"Sorry, I couldn't get a response from Claude.\";
  } catch (error) {
    console.error('Claude error:', error);
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
