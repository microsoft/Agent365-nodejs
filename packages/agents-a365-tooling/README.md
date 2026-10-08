# @microsoft/agents-a365-tooling

[![npm](https://img.shields.io/npm/v/@microsoft/agents-a365-tooling?label=npm&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-tooling)
[![npm Downloads](https://img.shields.io/npm/dm/@microsoft/agents-a365-tooling?label=Downloads&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-tooling)

Core tooling functionality for MCP (Model Context Protocol) tool server management in applications built with the Microsoft Agent 365 SDK. This package provides the foundation for discovering, registering, and managing tool servers across different AI frameworks.

## Installation

```bash
npm install @microsoft/agents-a365-tooling
```

## Usage

For detailed usage examples and implementation guidance, see the [Microsoft Agent 365 Tooling Documentation](https://learn.microsoft.com/microsoft-agent-365/developer/tooling?tabs=nodejs).

## Microsoft Defender for AI real-time protection

`DefenderRtpClient` sends agent-hooks contexts to the Microsoft Defender for AI prevention endpoint at the points Defender evaluates (`input`, `pre_tool_call`, `post_tool_call`, `output`) and returns its verdict, using the agent identity's own app-only token. It is disabled by default (`ENABLE_A365_DEFENDER_RTP`). To use it from an agent-hooks host, register `A365DefenderInterceptor` from [`@microsoft/agents-a365-tooling-extensions-agenthooks`](../agents-a365-tooling-extensions-agenthooks/README.md), which also lists the configuration. See the [design document](docs/design.md) for details.

## Support

For issues, questions, or feedback:

- File issues in the [GitHub Issues](https://github.com/microsoft/Agent365-nodejs/issues) section
- See the [main documentation](../../README.md) for more information

## Trademarks

*Microsoft, Windows, Microsoft Azure and/or other Microsoft products and services referenced in the documentation may be either trademarks or registered trademarks of Microsoft in the United States and/or other countries. The licenses for this project do not grant you rights to use any Microsoft names, logos, or trademarks. Microsoft's general trademark guidelines can be found at http://go.microsoft.com/fwlink/?LinkID=254653.*

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details
