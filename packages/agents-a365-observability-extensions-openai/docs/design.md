# Observability Extensions - OpenAI - Design Document

This document describes the architecture and design of the `@microsoft/agents-a365-observability-extensions-openai` package.

## Overview

The OpenAI observability extensions package provides automatic instrumentation for the OpenAI Agents SDK. It wraps the OpenAI Agents SDK tracer to integrate with Agent 365 Observability, converting OpenAI trace events to OpenTelemetry spans.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    OpenAI Agents SDK                             │
│                      (@openai/agents)                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                    (trace events)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              OpenAIAgentsTraceInstrumentor                       │
│          (InstrumentationBase implementation)                    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              OpenAIAgentsTraceProcessor                      ││
│  │                                                              ││
│  │  Converts OpenAI trace events → OpenTelemetry spans         ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    OpenTelemetry SDK                             │
│           (via ObservabilityManager)                             │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### OpenAIAgentsTraceInstrumentor ([OpenAIAgentsTraceInstrumentor.ts](../src/OpenAIAgentsTraceInstrumentor.ts))

Extends OpenTelemetry's `InstrumentationBase` to provide automatic tracing for OpenAI Agents:

```typescript
import { ObservabilityManager } from '@microsoft/agents-a365-observability';
import { OpenAIAgentsTraceInstrumentor } from '@microsoft/agents-a365-observability-extensions-openai';

// First, configure observability
ObservabilityManager.start({
  serviceName: 'my-openai-agent',
  tokenResolver: async (agentId, tenantId) => getToken(),
  clusterCategory: 'prod'
});

// Then create and enable the instrumentor
const instrumentor = new OpenAIAgentsTraceInstrumentor({
  enabled: true,
  tracerName: 'my-openai-agent-tracer',
  tracerVersion: '1.0.0',
  suppressInvokeAgentInput: false  // Set true to hide LLM inputs
});

// Enable instrumentation
instrumentor.enable();

// ... run your OpenAI agent ...

// Disable when done
instrumentor.disable();
```

**Configuration Options:**

```typescript
interface OpenAIAgentsInstrumentationConfig extends InstrumentationConfig {
  enabled?: boolean;              // Enable/disable instrumentation
  tracerName?: string;            // Custom tracer name
  tracerVersion?: string;         // Custom tracer version
  suppressInvokeAgentInput?: boolean;  // Hide LLM input messages
}
```

**Methods:**

| Method | Purpose |
|--------|---------|
| `enable()` | Enable tracing for OpenAI Agents SDK |
| `disable()` | Disable instrumentation and cleanup |
| `getProcessor()` | Access the trace processor instance |

### OpenAIAgentsTraceProcessor ([OpenAIAgentsTraceProcessor.ts](../src/OpenAIAgentsTraceProcessor.ts))

Custom trace processor that converts OpenAI Agents trace events to OpenTelemetry spans:

```typescript
import { OpenAIAgentsTraceProcessor } from '@microsoft/agents-a365-observability-extensions-openai';

const processor = new OpenAIAgentsTraceProcessor(tracer, {
  suppressInvokeAgentInput: false
});

// The processor is automatically registered with the OpenAI Agents SDK
// when using OpenAIAgentsTraceInstrumentor
```

The processor handles various OpenAI Agents trace events and converts them to appropriate OpenTelemetry span types:

- Agent runs → `InvokeAgentScope`
- LLM calls → `InferenceScope`
- Tool executions → `ExecuteToolScope`

## Prerequisites

The instrumentor requires `ObservabilityManager` to be configured before initialization:

```typescript
// This will throw an error
const instrumentor = new OpenAIAgentsTraceInstrumentor();
// Error: ObservabilityManager is not configured yet

// Correct usage
ObservabilityManager.start({ serviceName: 'my-agent' });
const instrumentor = new OpenAIAgentsTraceInstrumentor();
```

## Integration with OpenAI Agents SDK

The instrumentor integrates with the OpenAI Agents SDK's tracing system:

```typescript
import { setTraceProcessors, setTracingDisabled } from '@openai/agents';

// In enable():
setTracingDisabled(false);  // Enable tracing in OpenAI SDK
setTraceProcessors([this.processor]);  // Register our processor

// In disable():
setTraceProcessors([]);  // Clear processors
```

## Usage Example

Complete example with an OpenAI agent:

```typescript
import { Agent, run } from '@openai/agents';
import { ObservabilityManager } from '@microsoft/agents-a365-observability';
import { OpenAIAgentsTraceInstrumentor } from '@microsoft/agents-a365-observability-extensions-openai';

// 1. Configure observability
ObservabilityManager.start({
  serviceName: 'my-openai-agent',
  tokenResolver: async () => getObservabilityToken(),
  clusterCategory: 'prod'
});

// 2. Enable instrumentation
const instrumentor = new OpenAIAgentsTraceInstrumentor({
  enabled: true,
  suppressInvokeAgentInput: false
});
instrumentor.enable();

// 3. Create and run your agent
const agent = new Agent({
  name: 'MyAgent',
  model: 'gpt-4o',
  instructions: 'You are a helpful assistant.'
});

const result = await run(agent, 'Hello, world!');
console.log(result.finalOutput);

// 4. Cleanup
instrumentor.disable();
await ObservabilityManager.shutdown();
```

## File Structure

```
src/
├── index.ts                              # Public API exports
├── OpenAIAgentsTraceInstrumentor.ts      # Main instrumentor class
└── OpenAIAgentsTraceProcessor.ts         # Trace event processor
```

## Dependencies

- `@microsoft/agents-a365-observability` - ObservabilityManager, scope classes
- `@openai/agents` - OpenAI Agents SDK, trace types
- `@opentelemetry/api` - OpenTelemetry API
- `@opentelemetry/instrumentation` - InstrumentationBase class

## Supported OpenAI Agents SDK Versions

The instrumentor supports OpenAI Agents SDK versions `>=0.1.5`.

```typescript
protected init(): InstrumentationModuleDefinition {
  return {
    name: '@openai/agents',
    supportedVersions: ['>=0.1.5'],
    files: [],
  };
}
```
