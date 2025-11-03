# Microsoft Agent365 SDK for TypeScript

The Microsoft Agent365 SDK provides comprehensive observability, tooling, and runtime capabilities for AI agents and tools built with TypeScript/Node.js.

## 📦 Packages

This monorepo contains several specialized packages:

### 🔍 **Observability**
- **[@microsoft/agents-a365-observability](./packages/agents-a365-observability/README.md)** - OpenTelemetry-based tracing and monitoring for AI agents
  - Agent invocation tracking with caller context
  - Tool execution monitoring with endpoint support  
  - LLM inference telemetry with granular token tracking
  - Baggage propagation for distributed agent systems

### 🛠️ **Tooling & Extensions**
- **[@microsoft/agents-a365-tooling](./packages/agents-a365-tooling/README.md)** - Core MCP (Model Context Protocol) tooling infrastructure
- **[@microsoft/agents-a365-tooling-extensions-claude](./packages/agents-a365-tooling-extensions-claude/README.md)** - Claude/Anthropic integration
- **[@microsoft/agents-a365-tooling-extensions-langchain](./packages/agents-a365-tooling-extensions-langchain/README.md)** - LangChain integration
- **[@microsoft/agents-a365-tooling-extensions-openai](./packages/agents-a365-tooling-extensions-openai/README.md)** - OpenAI integration

### 🚀 **Runtime & Infrastructure**  
- **[@microsoft/agents-a365-runtime](./packages/agents-a365-runtime/README.md)** - Authentication, authorization, and Power Platform integration
- **[@microsoft/agents-a365-notifications](./packages/agents-a365-notifications/README.md)** - Agent notification and messaging system


## 📋 **Package Overview**

| Package | Purpose | Key Features |
|---------|---------|--------------|
| **Observability** | Monitoring & Tracing | OpenTelemetry, Azure Monitor, Agent/Tool/Inference tracking |
| **Tooling** | MCP Infrastructure | Tool registration, configuration, server management |
| **Runtime** | Auth & Platform | Microsoft identity, Power Platform APIs, token management |
| **Notifications** | Messaging | Agent notifications, email integration, activity tracking |
| **Extensions** | LLM Integrations | OpenAI, Claude, LangChain tool registration |


## 📋 **Telemetry**

Data Collection. The software may collect information about you and your use of the software and send it to Microsoft. Microsoft may use this information to provide services and improve our products and services. You may turn off the telemetry as described in the repository. There are also some features in the software that may enable you and Microsoft to collect data from users of your applications. If you use these features, you must comply with applicable law, including providing appropriate notices to users of your applications together with a copy of Microsoft’s privacy statement. Our privacy statement is located at https://go.microsoft.com/fwlink/?LinkID=824704. You can learn more about data collection and use in the help documentation and our privacy statement. Your use of the software operates as your consent to these practices.


## 📄 **License**

This project is licensed under the MIT License - see the LICENSE file for details.
