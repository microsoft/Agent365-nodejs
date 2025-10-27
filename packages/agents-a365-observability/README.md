# Agent365 Observability SDK for Node.js

## 🚀 Features

- **🔍 Agent Monitoring**: Specialized tracing for AI agent invocations with detailed telemetry
- **🛠️ Tool Execution Tracking**: Monitor tool executions and function calls with comprehensive metrics
- **📊 OpenTelemetry Integration**: Built-in OpenTelemetry tracing for standardized observability
- **☁️ Azure Monitor Support**: Seamless integration with Azure Monitor for cloud-based monitoring



### 🚀 Quick Starts

Refer to documentation for the individual sections above.

#### NodeJS Quick Start

1. **Install the package**:
   ```bash
   npm install @microsoft/agents-a365-observability
   ```

2. **Configure the SDK**:
   ```typescript
   import { Kairo } from '@microsoft/agents-a365-observability';

   // Initialize the SDK
   const sdk = Kairo.start({
     serviceName: 'my-typescript-agent',
     serviceVersion: '1.0.0',
     enableConsoleExporter: true,
     connectionString: process.env.AZURE_MONITOR_CONNECTION_STRING
   });
   ```

3. **Add agent tracing**:
   ```typescript
   import { ExecuteAgentScope, ExecutionType } from '@microsoft/agents-a365-observability';

   const scope = ExecuteAgentScope.start(
     {
       agentId: 'my-agent',
       agentName: 'My Agent'
     },
     {
       content: userInput,
       executionType: ExecutionType.HumanToAgent
     }
   );
   // Your agent logic here
   scope?.dispose();
   ```

### 🛠️ Sample Applications

#### JavaScript/TypeScript Samples
- **Kairo TypeScript Sample**: [`/nodejs/samples/kairo-typescript-sample/`](../samples/kairo-typescript-sample/) - OpenTelemetry tracing demo with compliance agent
- **Teams Agent Sample**: [`/nodejs/samples/sample-agent/`](../samples/sample-agent/) - Microsoft Teams agent with Graph API integration
- **Claude Code SDK Integration**: [`/nodejs/samples/claude-code-sdk/`](../samples/claude-code-sdk/) - Claude AI integration with Microsoft 365 Agents SDK
