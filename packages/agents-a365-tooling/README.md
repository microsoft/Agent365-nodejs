# @microsoft/agents-a365-tooling

[![npm](https://img.shields.io/npm/v/@microsoft/agents-a365-tooling?label=npm&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-tooling)
[![npm Downloads](https://img.shields.io/npm/dm/@microsoft/agents-a365-tooling?label=Downloads&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-tooling)

Core tooling functionality for MCP (Model Context Protocol) tool server management in Microsoft Agents A365 applications. This package provides the foundation for discovering, registering, and managing tool servers across different AI frameworks.

## Installation

```bash
npm install @microsoft/agents-a365-tooling
```

## Usage

### Tool Server Discovery

```typescript
import { McpToolServerConfigurationService } from '@microsoft/agents-a365-tooling';

const configService = new McpToolServerConfigurationService();

// List all available tool servers for an agent
const toolServers = await configService.listToolServers(
  agentUserId,
  environmentId,
  authToken
);

for (const server of toolServers) {
  console.log(`Tool Server: ${server.mcpServerName}`);
  console.log(`  Server URL: ${server.url}`);
}
```

### Get MCP Client Tools

```typescript
// Get tools from a specific server
const mcpTools = await configService.getMcpClientTools(
  turnContext,
  server,
  environmentId,
  authToken
);
```

## Support

For issues, questions, or feedback:

- File issues in the [GitHub Issues](https://github.com/microsoft/Agent365-nodejs/issues) section
- See the [main documentation](../../README.md) for more information

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details
