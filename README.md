# Microsoft Agent365 SDK for TypeScript

The Microsoft Agent365 SDK provides OpenTelemetry tracing and monitoring capabilities for AI agents and tools built with TypeScript/Node.js.

## Features

- **OpenTelemetry Integration**: Built-in OpenTelemetry tracing for comprehensive observability
- **Multi-Agent Support**: Track multiple agents within the same application
- **Agent Monitoring**: Specialized tracing scopes for AI agent invocations
- **Tool Execution Tracking**: Monitor tool executions with detailed telemetry
- **Azure Monitor Support**: Seamless integration with Azure Monitor for cloud-based monitoring
- **TypeScript Support**: Full TypeScript support with comprehensive type definitions

## Installation

Install the package via npm:

```bash
npm install @microsoft/agents-a365-observability
```

Or via yarn:

```bash
yarn add @microsoft/agents-a365-observability
```

## Quick Start

### Basic Setup

```typescript
import { Kairo } from '@microsoft/agents-a365-observability';

// Initialize the SDK
const sdk = Kairo.start({
  serviceName: 'my-typescript-agent',
  serviceVersion: '1.0.0',
  enableConsoleExporter: true, // For debugging
  connectionString: process.env.AZURE_MONITOR_CONNECTION_STRING
});
```

### Using Builder Pattern

```typescript
import { Kairo } from '@microsoft/agents-a365-observability';

// Configure using builder pattern
const builder = Kairo.configure(builder =>
  builder
    .withStaticAgentId('my-agent-id')
    .withConnectionString(process.env.AZURE_MONITOR_CONNECTION_STRING!)
    .withConsoleExporter(true)
);

// Start the SDK
builder.start();
```

## Usage

### Agent Execution Tracking

```typescript
import { ExecuteAgentScope, ExecutionType } from '@microsoft/agents-a365-observability';

async function executeAgent(userInput: string): Promise<string> {
  const scope = ExecuteAgentScope.start(
    {
      agentId: 'compliance-agent',
      agentName: 'Compliance Agent',
      agentDescription: 'Helps with compliance-related queries'
    },
    {
      content: userInput,
      executionType: ExecutionType.HumanToAgent,
      sessionId: 'session-123'
    }
  );

  try {
    // Your agent logic here
    const response = await processUserInput(userInput);

    scope?.recordResponse(response);
    return response;
  } catch (error) {
    scope?.recordError(error as Error);
    throw error;
  } finally {
    scope?.dispose();
  }
}
```

### Tool Execution Tracking

```typescript
import { ExecuteToolScope } from '@microsoft/agents-a365-observability';

async function executeTool(toolName: string, arguments: string): Promise<string> {
  const scope = ExecuteToolScope.start({
    toolName,
    arguments,
    toolCallId: 'tool-call-456',
    description: 'Email analysis tool'
  });

  try {
    // Your tool logic here
    const result = await runTool(toolName, arguments);

    scope?.recordResponse(result);
    return result;
  } catch (error) {
    scope?.recordError(error as Error);
    throw error;
  } finally {
    scope?.dispose();
  }
}
```

### Agent Invocation Tracking

```typescript
import { InvokeAgentScope } from '@microsoft/agents-a365-observability';

async function invokeOtherAgent(agentId: string, request: string): Promise<string> {
  const scope = InvokeAgentScope.start({
    agentId,
    agentName: 'External Agent',
    request: {
      content: request,
      executionType: ExecutionType.Agent2Agent
    }
  });

  try {
    // Call another agent
    const response = await callAgent(agentId, request);

    scope?.recordResponse(response);
    return response;
  } catch (error) {
    scope?.recordError(error as Error);
    throw error;
  } finally {
    scope?.dispose();
  }
}
```

### LLM Inference Tracking

```typescript
import { InferenceScope } from '@microsoft/agents-a365-observability';

async function performInference(prompt: string): Promise<string> {
  const scope = InferenceScope.start({
    modelName: 'gpt-4',
    provider: 'openai',
    modelVersion: '0613',
    temperature: 0.7,
    maxTokens: 500,
    topP: 0.9,
    prompt: 'Your prompt',
  });

  try {
    // Call LLM
    const response = await callLLM();

    scope?.recordResponse({
      content: response,
      responseId: `resp-${Date.now()}`,
      finishReason: 'stop',
      inputTokens: 45,
      outputTokens: 78,
      totalTokens: 123,
    });

    return response;
  } catch (error) {
    scope?.recordError(error as Error);
    throw error;
  } finally {
    scope?.dispose();
  }
}
```

## Azure Monitor Settings

Configure Azure Monitor integration by setting the connection string:

```typescript
Kairo.start({
  connectionString: 'InstrumentationKey=your-key;IngestionEndpoint=https://your-region.in.applicationinsights.azure.com/'
});
```

## What's Included

- **Kairo**: Main configuration class for setting up OpenTelemetry
- **KairoBuilder**: Fluent builder for SDK configuration
- **Tracing Scopes**: Specialized scopes for agent and tool monitoring
  - `ExecuteAgentScope`: For tracking agent executions
  - `ExecuteToolScope`: For tracking tool executions
  - `InvokeAgentScope`: For tracking agent invocations
- **OpenTelemetry Constants**: Standardized telemetry keys and values
- **TypeScript Interfaces**: Comprehensive type definitions for all SDK components

## Multi-Agent Architecture

The SDK supports multiple agents in several ways:

1. **Span Context**: Agent context automatically propagates to child spans via OpenTelemetry context
2. **Flexible Configuration**: Configuration is agent-agnostic, allowing all agents to use the same monitoring setup
3. **Fallback Support**: Configure a default agent ID for operations that don't specify one

## Supported Telemetry

The SDK automatically instruments:

- Custom agent and tool executions
- Agent-to-agent invocations
- Error tracking and performance metrics

## Requirements

- Node.js 18.0 or later
- TypeScript 5.0 or later (for development)
- OpenTelemetry dependencies (automatically installed)

## API Reference

For detailed API documentation, see the TypeScript type definitions included with the package.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
