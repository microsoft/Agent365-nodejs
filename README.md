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

## 📄 **License**

This project is licensed under the MIT License - see the LICENSE file for details.
