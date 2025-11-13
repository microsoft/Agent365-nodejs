# Microsoft Agent 365 SDK - Node.js/TypeScript

[![npm](https://img.shields.io/npm/v/@microsoft/agents-a365-observability?label=npm&logo=npm)](https://www.npmjs.com/search?q=%40microsoft%2Fagents-a365)
[![npm Downloads](https://img.shields.io/npm/dm/@microsoft/agents-a365-observability?label=Downloads&logo=npm)](https://www.npmjs.com/search?q=%40microsoft%2Fagents-a365)
[![Build Status](https://img.shields.io/github/actions/workflow/status/microsoft/Agent365-nodejs/build.yml?branch=main&label=Build&logo=github)](https://github.com/microsoft/Agent365-nodejs/actions)
[![License](https://img.shields.io/github/license/microsoft/Agent365-nodejs?label=License)](LICENSE.md)
[![Node.js Version](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js)](https://nodejs.org/)
[![Contributors](https://img.shields.io/github/contributors/microsoft/Agent365-nodejs?label=Contributors&logo=github)](https://github.com/microsoft/Agent365-nodejs/graphs/contributors)

> #### Note:
> Use the information in this README to contribute to this open-source project. To learn about using this SDK in your projects, refer to the [Microsoft Agent 365 developer documentation](https://learn.microsoft.com/microsoft-agent-365/developer/).

The Microsoft Agent 365 SDK extends the Microsoft 365 Agents SDK with enterprise-grade capabilities for building sophisticated agents. This SDK provides comprehensive tooling for observability, notifications, runtime utilities, and development tools that help developers create production-ready agents for platforms including M365, Teams, Copilot Studio, and Webchat.

The Microsoft Agent 365 SDK focuses on four core areas:

- **Observability**: Comprehensive tracing, caching, and monitoring capabilities for agent applications
- **Notifications**: Agent notification services and models for handling user notifications
- **Runtime**: Core utilities and extensions for agent runtime operations
- **Tooling**: Developer tools and utilities for building sophisticated agent applications

## Current Project State

This project is currently in active development. Packages are published to npm as they become available.

### Public npm feed

The best way to consume this SDK is via our npm packages found here: [npmjs.com](https://www.npmjs.com/search?q=%40microsoft%2Fagents-a365). All packages begin with **@microsoft/agents-a365**.

## Working with this codebase

### Prerequisites

- Node.js 18 or later
- pnpm package manager
- Git

### Building the project

1. Clone the repository:

   ```bash
   git clone https://github.com/microsoft/Agent365-nodejs.git
   cd Agent365-nodejs
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Build the packages:

   ```bash
   # Build all packages
   pnpm build
   ```

4. Run tests:

   ```bash
   pnpm test
   ```

For more detailed build instructions, see the [HOW_TO_BUILD.md](HOW_TO_BUILD.md).

## Project Structure

- **packages/agents-a365-notifications**: Microsoft Agent 365 Notifications SDK - Agent notification services and models
- **packages/agents-a365-observability**: Microsoft Agent 365 Observability Core - Core observability functionality
- **packages/agents-a365-observability-extensions-openai**: OpenAI observability extensions
- **packages/agents-a365-runtime**: Microsoft Agent 365 Runtime - Core runtime utilities and extensions
- **packages/agents-a365-tooling**: Microsoft Agent 365 Tooling SDK - Agent tooling and MCP integration
- **packages/agents-a365-tooling-extensions-claude**: Claude/Anthropic tooling extensions
- **packages/agents-a365-tooling-extensions-langchain**: LangChain tooling extensions
- **packages/agents-a365-tooling-extensions-openai**: OpenAI tooling extensions
- For sample applications, see the [Microsoft Agent 365 SDK Samples repository](https://github.com/microsoft/Agent365-Samples)
- **tests/**: Unit and integration tests

## Support

For issues, questions, or feedback:

- **Issues**: Please file issues in the [GitHub Issues](https://github.com/microsoft/Agent365-nodejs/issues) section
- **Documentation**: See the [Microsoft Agent 365 developer documentation](https://learn.microsoft.com/microsoft-agent-365/developer/)
- **Security**: For security issues, please see [SECURITY.md](SECURITY.md)

## Contributing

This project welcomes contributions and suggestions. Most contributions require you to agree to a Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us the rights to use your contribution. For details, visit <https://cla.opensource.microsoft.com>.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Useful Links

### Microsoft 365 Agents SDK

The core SDK for building conversational AI agents for Microsoft 365 platforms.

- [Microsoft 365 Agents SDK - C# /.NET repository](https://github.com/Microsoft/Agents-for-net)
- [Microsoft 365 Agents SDK - NodeJS /TypeScript repository](https://github.com/Microsoft/Agents-for-js)
- [Microsoft 365 Agents SDK - Python repository](https://github.com/Microsoft/Agents-for-python)
- [Microsoft 365 Agents documentation](https://learn.microsoft.com/microsoft-365/agents-sdk/)

### Microsoft Agent 365 SDK

Enterprise-grade extensions for observability, notifications, runtime utilities, and developer tools.

- [Microsoft Agent 365 SDK - C# /.NET  repository](https://github.com/microsoft/Agent365-dotnet)
- [Microsoft Agent 365 SDK - Python repository](https://github.com/microsoft/Agent365-python)
- [Microsoft Agent 365 SDK - Node.js/TypeScript repository](https://github.com/microsoft/Agent365-nodejs) - You are here
- [Microsoft Agent 365 SDK Samples repository](https://github.com/microsoft/Agent365-Samples)
- [Microsoft Agent 365 developer documentation](https://learn.microsoft.com/microsoft-agent-365/developer/)

### Additional Resources

- [Node.js documentation](https://learn.microsoft.com/javascript/api/?view=m365-agents-sdk&preserve-view=true)

## 📋 Telemetry

Data Collection. The software may collect information about you and your use of the software and send it to Microsoft. Microsoft may use this information to provide services and improve our products and services. You may turn off the telemetry as described in the repository. There are also some features in the software that may enable you and Microsoft to collect data from users of your applications. If you use these features, you must comply with applicable law, including providing appropriate notices to users of your applications together with a copy of Microsoft's privacy statement. Our privacy statement is located at https://go.microsoft.com/fwlink/?LinkID=824704. You can learn more about data collection and use in the help documentation and our privacy statement. Your use of the software operates as your consent to these practices.

## Trademarks

*Microsoft, Windows, Microsoft Azure and/or other Microsoft products and services referenced in the documentation may be either trademarks or registered trademarks of Microsoft in the United States and/or other countries. The licenses for this project do not grant you rights to use any Microsoft names, logos, or trademarks. Microsoft's general trademark guidelines can be found at http://go.microsoft.com/fwlink/?LinkID=254653.*

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](LICENSE.md) file for details.
