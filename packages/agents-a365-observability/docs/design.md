# Observability - Design Document

This document describes the architecture and design of the `@microsoft/agents-a365-observability` package.

## Overview

The observability package provides OpenTelemetry-based distributed tracing infrastructure for AI agent applications. It enables comprehensive observability by tracing agent invocations, LLM inference calls, and tool executions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Public API                                │
│  ObservabilityManager | Builder | Scopes | BaggageBuilder       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ObservabilityBuilder                          │
│              (Fluent configuration API)                          │
│  - Service name/version                                          │
│  - Token resolver                                                │
│  - Cluster category                                              │
│  - Exporter options                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  SpanProcessor   │ │ BatchSpanProcessor│ │ Agent365Exporter │
│ (Baggage to      │ │  (OTEL SDK)      │ │ (HTTP export)    │
│  attributes)     │ │                  │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

## Key Components

### ObservabilityManager ([ObservabilityManager.ts](../src/ObservabilityManager.ts))

Main entry point using singleton pattern:

```typescript
import { ObservabilityManager } from '@microsoft/agents-a365-observability';

// Option 1: Simple start with options
ObservabilityManager.start({
  serviceName: 'my-agent',
  serviceVersion: '1.0.0',
  tokenResolver: async (agentId, tenantId) => getAuthToken(),
  clusterCategory: 'prod'
});

// Option 2: Configure with callback
ObservabilityManager.configure((builder) => {
  builder
    .withService('my-agent', '1.0.0')
    .withTokenResolver(tokenResolver)
    .withClusterCategory('prod');
}).start();

// Get current instance
const instance = ObservabilityManager.getInstance();

// Shutdown
await ObservabilityManager.shutdown();
```

### ObservabilityBuilder ([ObservabilityBuilder.ts](../src/ObservabilityBuilder.ts))

Fluent API for configuring telemetry:

```typescript
import { Builder } from '@microsoft/agents-a365-observability';

const builder = new Builder()
  .withService('my-agent', '1.0.0')
  .withTokenResolver(async (agentId, tenantId) => getToken())
  .withClusterCategory('prod')
  .withExporterOptions({
    maxQueueSize: 2048,
    scheduledDelayMilliseconds: 5000
  });

builder.build();
builder.start();
```

**Builder Methods:**

| Method | Purpose |
|--------|---------|
| `withService(name, version?)` | Set service name and version |
| `withTokenResolver(resolver)` | Set token resolver for exporter auth |
| `withClusterCategory(category)` | Set environment cluster |
| `withExporterOptions(options)` | Configure exporter options |
| `build()` | Initialize OpenTelemetry SDK |
| `start()` | Start the SDK |
| `shutdown()` | Graceful shutdown |

### Scope Classes

#### OpenTelemetryScope (Base Class) ([OpenTelemetryScope.ts](../src/tracing/scopes/OpenTelemetryScope.ts))

Base class for all tracing scopes, implementing `Disposable`:

```typescript
abstract class OpenTelemetryScope implements Disposable {
  // Make span active for async callback
  withActiveSpanAsync<T>(callback: () => Promise<T>): Promise<T>;

  // Record an error
  recordError(error: Error): void;

  // Record multiple attributes
  recordAttributes(attributes: Record<string, any>): void;

  // Set attribute if value is not null
  protected setTagMaybe<T>(name: string, value: T | null | undefined): void;

  // Dispose and end span
  [Symbol.dispose](): void;
  dispose(): void;
}
```

#### InvokeAgentScope ([InvokeAgentScope.ts](../src/tracing/scopes/InvokeAgentScope.ts))

Traces agent invocation operations:

```typescript
import { InvokeAgentScope, InvokeAgentDetails, TenantDetails } from '@microsoft/agents-a365-observability';

using scope = InvokeAgentScope.start(
  {
    agentId: 'agent-123',
    agentName: 'MyAgent',
    endpoint: { host: 'api.example.com', port: 443 },
    sessionId: 'session-456',
    request: {
      content: 'Hello',
      executionType: ExecutionType.HumanToAgent
    }
  },
  { tenantId: 'tenant-789' },
  callerAgentDetails,  // Optional caller agent
  callerDetails        // Optional caller user
);

scope.recordInputMessages(['Hello']);
// ... agent processing ...
scope.recordResponse('Hi there!');
scope.recordOutputMessages(['Hi there!']);
```

**Span attributes recorded:**
- Server address and port
- Session ID
- Execution type and source metadata
- Input/output messages
- Caller details (ID, UPN, name, tenant, client IP)
- Caller agent details (if agent-to-agent)

#### InferenceScope ([InferenceScope.ts](../src/tracing/scopes/InferenceScope.ts))

Traces LLM/AI model inference calls:

```typescript
import { InferenceScope, InferenceDetails, InferenceOperationType } from '@microsoft/agents-a365-observability';

using scope = InferenceScope.start(
  {
    operationName: InferenceOperationType.CHAT,
    model: 'gpt-4',
    providerName: 'openai'
  },
  agentDetails,
  tenantDetails,
  conversationId,
  sourceMetadata
);

scope.recordInputMessages(['User message']);
// ... LLM call ...
scope.recordOutputMessages(['Assistant response']);
scope.recordInputTokens(100);
scope.recordOutputTokens(50);
scope.recordResponseId('resp-123');
scope.recordFinishReasons(['stop']);
```

#### ExecuteToolScope ([ExecuteToolScope.ts](../src/tracing/scopes/ExecuteToolScope.ts))

Traces tool execution operations:

```typescript
import { ExecuteToolScope, ToolCallDetails } from '@microsoft/agents-a365-observability';

using scope = ExecuteToolScope.start(
  {
    toolName: 'search',
    arguments: JSON.stringify({ query: 'weather' }),
    toolCallId: 'call-123',
    toolType: 'mcp',
    endpoint: { host: 'tools.example.com' }
  },
  agentDetails,
  tenantDetails,
  conversationId,
  sourceMetadata
);

// ... tool execution ...
scope.recordResponse('Tool result');
```

### BaggageBuilder ([BaggageBuilder.ts](../src/tracing/middleware/BaggageBuilder.ts))

Fluent API for setting OpenTelemetry baggage:

```typescript
import { BaggageBuilder } from '@microsoft/agents-a365-observability';

// Full builder pattern
const scope = new BaggageBuilder()
  .tenantId('tenant-123')
  .agentId('agent-456')
  .correlationId('corr-789')
  .callerId('user-abc')
  .sessionId('session-xyz')
  .callerUpn('user@example.com')
  .conversationId('conv-123')
  .build();

// Execute code within baggage context
scope.run(() => {
  // All child spans inherit this baggage
});

// Convenience method
const scope2 = BaggageBuilder.setRequestContext(
  'tenant-123',
  'agent-456',
  'corr-789'
);
```

**Available baggage setters:**

| Method | Baggage Key |
|--------|-------------|
| `tenantId(value)` | `tenant_id` |
| `agentId(value)` | `gen_ai.agent.id` |
| `agentAuid(value)` | `gen_ai.agent.auid` |
| `agentUpn(value)` | `gen_ai.agent.upn` |
| `correlationId(value)` | `correlation_id` |
| `callerId(value)` | `gen_ai.caller.id` |
| `sessionId(value)` | `session_id` |
| `conversationId(value)` | `gen_ai.conversation.id` |
| `callerUpn(value)` | `gen_ai.caller.upn` |
| `sourceMetadataName(value)` | `gen_ai.execution.source.name` |

## Data Interfaces

### InvokeAgentDetails

```typescript
interface InvokeAgentDetails extends AgentDetails {
  request?: AgentRequest;
  endpoint?: ServiceEndpoint;
  sessionId?: string;
}
```

### AgentDetails

```typescript
interface AgentDetails {
  agentId: string;
  conversationId?: string;
  agentName?: string;
  agentType?: string;
  agentDescription?: string;
  iconUri?: string;
  platformId?: string;
  agentAUID?: string;
  agentUPN?: string;
  agentBlueprintId?: string;
  tenantId?: string;
  agentClientIP?: string;
}
```

### InferenceDetails

```typescript
interface InferenceDetails {
  operationName: InferenceOperationType;
  model: string;
  providerName?: string;
  inputTokens?: number;
  outputTokens?: number;
  finishReasons?: string[];
  responseId?: string;
}
```

### ToolCallDetails

```typescript
interface ToolCallDetails {
  toolName: string;
  arguments?: string;
  toolCallId?: string;
  description?: string;
  toolType?: string;
  endpoint?: ServiceEndpoint;
}
```

### Enums

```typescript
enum ExecutionType {
  HumanToAgent = 'HumanToAgent',
  Agent2Agent = 'Agent2Agent',
  EventToAgent = 'EventToAgent',
  Unknown = 'Unknown'
}

enum InvocationRole {
  Human = 'Human',
  Agent = 'Agent',
  Event = 'Event',
  Unknown = 'Unknown'
}

enum InferenceOperationType {
  CHAT = 'Chat',
  TEXT_COMPLETION = 'TextCompletion',
  GENERATE_CONTENT = 'GenerateContent'
}
```

## Design Patterns

### Singleton Pattern

`ObservabilityManager` ensures a single telemetry configuration per application:

```typescript
export class ObservabilityManager {
  private static instance?: ObservabilityBuilder;

  public static getInstance(): ObservabilityBuilder | null {
    return ObservabilityManager.instance || null;
  }
}
```

### Disposable Pattern

All scope classes implement `Disposable` for automatic span lifecycle:

```typescript
using scope = InvokeAgentScope.start(...);
// Span is active
scope.recordResponse('result');
// Span automatically ends when scope is disposed
```

### Builder Pattern

`ObservabilityBuilder` and `BaggageBuilder` use method chaining:

```typescript
const builder = new ObservabilityBuilder()
  .withService('my-agent')
  .withTokenResolver(resolver)
  .withClusterCategory('prod');
```

## File Structure

```
src/
├── index.ts                              # Public API exports
├── ObservabilityManager.ts               # Main entry point
├── ObservabilityBuilder.ts               # Configuration builder
├── tracing/
│   ├── constants.ts                      # OpenTelemetry attribute keys
│   ├── contracts.ts                      # Data interfaces and enums
│   ├── scopes/
│   │   ├── OpenTelemetryScope.ts         # Base scope class
│   │   ├── InvokeAgentScope.ts           # Agent invocation tracing
│   │   ├── InferenceScope.ts             # LLM inference tracing
│   │   └── ExecuteToolScope.ts           # Tool execution tracing
│   ├── middleware/
│   │   └── BaggageBuilder.ts             # Baggage context builder
│   ├── processors/
│   │   └── SpanProcessor.ts              # Baggage-to-attribute processor
│   └── exporter/
│       ├── Agent365Exporter.ts           # Custom HTTP exporter
│       ├── Agent365ExporterOptions.ts    # Exporter configuration
│       └── utils.ts                      # Exporter utilities
└── utils/
    └── logging.ts                        # Internal logging
```

## Dependencies

- `@opentelemetry/api` - OpenTelemetry API interfaces
- `@opentelemetry/sdk-node` - OpenTelemetry SDK
- `@opentelemetry/sdk-trace-base` - Span processors and exporters
- `@opentelemetry/resources` - Resource configuration
- `@opentelemetry/semantic-conventions` - Semantic attribute keys
- `@microsoft/agents-a365-runtime` - Cluster category type

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `ENABLE_A365_OBSERVABILITY_EXPORTER` | Enable/disable Agent365 exporter |
