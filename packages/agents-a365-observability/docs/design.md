# Observability - Design Document

This document describes the architecture and design of the `@microsoft/agents-a365-observability` package.

## Overview

The observability package provides OpenTelemetry-based distributed tracing infrastructure for AI agent applications. It enables comprehensive observability by tracing agent invocations, LLM inference calls, and tool executions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Public API                                │
│  ObservabilityManager | Builder | Scopes | BaggageBuilder       │
│  ObservabilityConfiguration | PerRequestSpanProcessorConfiguration│
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

Base class for all tracing scopes, implementing `Disposable`.

All scope constructors accept an optional `spanDetails?: SpanDetails` parameter, where span links can be provided via `spanDetails.spanLinks` to establish causal relationships to other spans (e.g. linking a batch operation to individual trigger spans):

```typescript
abstract class OpenTelemetryScope implements Disposable {
  // Make span active for async callback
  withActiveSpanAsync<T>(callback: () => Promise<T>): Promise<T>;

  // Get span context for parent-child linking
  getSpanContext(): SpanContext;

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
import { InvokeAgentScope, InvokeAgentScopeDetails, AgentDetails, Request, CallerDetails } from '@microsoft/agents-a365-observability';

const request: Request = { content: 'Hello', channel: { name: 'Teams' }, sessionId: 'session-456' };
const scopeDetails: InvokeAgentScopeDetails = {
  endpoint: { host: 'api.example.com', port: 443 }
};
const agentDetails: AgentDetails = { agentId: 'agent-123', agentName: 'MyAgent', tenantId: 'tenant-789' };
const callerInfo: CallerDetails = {
  userDetails: { userId: 'user-1', userName: 'User' },
  callerAgentDetails: callerAgent  // Optional, for A2A scenarios
};

using scope = InvokeAgentScope.start(request, scopeDetails, agentDetails, callerInfo);

scope.recordInputMessages(['Hello']);
// ... agent processing ...
scope.recordResponse('Hi there!');
scope.recordOutputMessages(['Hi there!']);
```

**Span attributes recorded:**
- Server address and port
- Session ID
- Channel name and link
- Input/output messages
- User details (ID, UPN, name, tenant, client IP)
- Caller agent details (if agent-to-agent)

#### InferenceScope ([InferenceScope.ts](../src/tracing/scopes/InferenceScope.ts))

Traces LLM/AI model inference calls:

```typescript
import { InferenceScope, InferenceDetails, InferenceOperationType } from '@microsoft/agents-a365-observability';

using scope = InferenceScope.start(
  { conversationId: 'conv-123' },  // Request (required)
  {
    operationName: InferenceOperationType.CHAT,
    model: 'gpt-4',
    providerName: 'openai'
  },
  agentDetails  // Must include tenantId
);

scope.recordInputMessages(['User message']);
// ... LLM call ...
scope.recordOutputMessages(['Assistant response']);
scope.recordInputTokens(100);
scope.recordOutputTokens(50);
scope.recordFinishReasons(['stop']);
```

#### ExecuteToolScope ([ExecuteToolScope.ts](../src/tracing/scopes/ExecuteToolScope.ts))

Traces tool execution operations:

```typescript
import { ExecuteToolScope, ToolCallDetails } from '@microsoft/agents-a365-observability';

using scope = ExecuteToolScope.start(
  {},  // Request (required)
  {
    toolName: 'search',
    arguments: JSON.stringify({ query: 'weather' }),
    toolCallId: 'call-123',
    toolType: 'mcp',
    endpoint: { host: 'tools.example.com' }
  },
  agentDetails  // Must include tenantId
);

// ... tool execution ...
scope.recordResponse('Tool result');
```

#### OutputScope ([OutputScope.ts](../src/tracing/scopes/OutputScope.ts))

Traces outgoing agent output messages:

```typescript
import { OutputScope, OutputResponse } from '@microsoft/agents-a365-observability';

const response: OutputResponse = { messages: ['Hello!', 'How can I help?'] };

using scope = OutputScope.start(
  { conversationId: 'conv-123', channel: { name: 'Teams' } },
  response,
  agentDetails  // Must include tenantId
);

scope.recordOutputMessages(['Additional response']);
// Messages are flushed to the span attribute on dispose
```

### Message Format (OTEL Gen-AI Semantic Conventions)

The SDK uses [OpenTelemetry Gen-AI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) for message tracing. All `recordInputMessages`/`recordOutputMessages` methods accept both plain strings and structured OTEL message objects.

#### Message Types ([contracts.ts](../src/tracing/contracts.ts))

| Type | Description |
|------|-------------|
| `ChatMessage` | Input message with `role`, `parts[]`, and optional `name` |
| `OutputMessage` | Output message extending `ChatMessage` with `finish_reason` |
| `InputMessages` | Versioned wrapper: `{ version, messages: ChatMessage[] }` |
| `OutputMessages` | Versioned wrapper: `{ version, messages: OutputMessage[] }` |
| `InputMessagesParam` | Union: `string[] \| InputMessages` |
| `OutputMessagesParam` | Union: `string[] \| OutputMessages` |
| `MessageRole` | Enum: `system`, `user`, `assistant`, `tool` |
| `FinishReason` | Enum: `stop`, `length`, `content_filter`, `tool_call`, `error` |
| `MessagePart` | Discriminated union of all content part types |

#### Message Part Types

| Part Type | `type` Discriminator | Purpose |
|-----------|---------------------|---------|
| `TextPart` | `text` | Plain text content |
| `ToolCallRequestPart` | `tool_call` | Tool invocation by the model |
| `ToolCallResponsePart` | `tool_call_response` | Tool execution result |
| `ReasoningPart` | `reasoning` | Chain-of-thought / reasoning content |
| `BlobPart` | `blob` | Inline base64 binary data (image, audio, video) |
| `FilePart` | `file` | Reference to a pre-uploaded file |
| `UriPart` | `uri` | External URI reference |
| `ServerToolCallPart` | `server_tool_call` | Server-side tool invocation |
| `ServerToolCallResponsePart` | `server_tool_call_response` | Server-side tool response |
| `GenericPart` | *(custom)* | Extensible part for future types |

> **Forward compatibility note:** `GenericPart` uses `type: string` rather than a fixed literal, which means it acts as a catch-all for any part type not covered by the other discriminated union members. As a consequence, an exhaustive `switch`/`case` on `part.type` will **not** produce compile-time errors for unhandled cases. Consumers should always include a `default` case in their switch statements to handle unknown or future part types gracefully.

#### Auto-Wrapping Behavior

Plain `string[]` input is automatically wrapped to OTEL format:
- Input strings become `ChatMessage` with `role: 'user'` and a single `TextPart`
- Output strings become `OutputMessage` with `role: 'assistant'` and a single `TextPart`

#### Structured Message Example

```typescript
import { InputMessages, OutputMessages, MessageRole, FinishReason, A365_MESSAGE_SCHEMA_VERSION } from '@microsoft/agents-a365-observability';

// Option 1: Plain string array (auto-wrapped to OTEL format)
scope.recordInputMessages(['What is the weather?']);

// Option 2: Versioned wrapper with structured messages
const input: InputMessages = {
  version: A365_MESSAGE_SCHEMA_VERSION,
  messages: [
    { role: MessageRole.SYSTEM, parts: [{ type: 'text', content: 'You are a helpful assistant.' }] },
    { role: MessageRole.USER, parts: [{ type: 'text', content: 'What is the weather?' }] }
  ]
};
scope.recordInputMessages(input);

// Structured output with tool call and finish reason (versioned wrapper)
const output: OutputMessages = {
  version: A365_MESSAGE_SCHEMA_VERSION,
  messages: [{
    role: MessageRole.ASSISTANT,
    parts: [
      { type: 'text', content: 'Let me check that for you.' },
      { type: 'tool_call', name: 'get_weather', id: 'call_1', arguments: { city: 'Seattle' } }
    ],
    finish_reason: FinishReason.TOOL_CALL
  }]
};
scope.recordOutputMessages(output);
```

#### Message Serialization ([message-utils.ts](../src/tracing/message-utils.ts))

Messages are serialized to JSON via `JSON.stringify` and stored as span attributes (`gen_ai.input.messages`, `gen_ai.output.messages`). No per-attribute size limit is enforced at the SDK level. If serialization fails (e.g., non-JSON-serializable values such as `BigInt` or circular references), a fallback sentinel is returned so that telemetry recording never throws.

The schema version is embedded inside the serialized wrapper JSON (e.g., `{"version":"0.1.0","messages":[...]}`) rather than set as a separate span attribute. This enables cross-SDK schema evolution while keeping message data self-contained. The current version is `0.1.0` (`A365_MESSAGE_SCHEMA_VERSION`).

#### Span-Level Size Enforcement

Span size is enforced at export time in the `Agent365Exporter`. When a serialized OTLP span exceeds `MAX_SPAN_SIZE_BYTES` (250 KB), the exporter's `truncateSpan()` method reduces the payload until the span fits, operating on the mapped OTLP span object without mutating the original `ReadableSpan`.

Truncation is not implemented as a single `"TRUNCATED"` replacement for every oversized value. Depending on the attribute type and content, the exporter may:

- replace oversized text values with a truncated form ending in `"… [truncated]"`;
- replace structured message payload fields with sentinel markers such as `"[truncated]"`;
- replace oversized inline blob content with `"[blob truncated]"`;
- iteratively remeasure the serialized OTLP span after each shrink step until the span fits or no additional shrink actions remain.

Consumers of exported spans should therefore treat these sentinel strings as part of the documented export format for oversized spans rather than expecting a single uniform replacement value.

#### Scope Visibility

`recordInputMessages`/`recordOutputMessages` are `protected` on the base `OpenTelemetryScope` class and exposed as `public` only on scopes where they are semantically appropriate:

| Scope | `recordInputMessages` | `recordOutputMessages` |
|-------|----------------------|----------------------|
| `InvokeAgentScope` | public | public |
| `InferenceScope` | public | public |
| `OutputScope` | — | public (accumulating) |
| `ExecuteToolScope` | — | — |

`ExecuteToolScope` records tool input/output via `ToolCallDetails.arguments` and `recordResponse()` instead.

### BaggageBuilder ([BaggageBuilder.ts](../src/tracing/middleware/BaggageBuilder.ts))

Fluent API for setting OpenTelemetry baggage:

```typescript
import { BaggageBuilder } from '@microsoft/agents-a365-observability';

// Full builder pattern
const scope = new BaggageBuilder()
  .tenantId('tenant-123')
  .agentId('agent-456')
  .correlationId('corr-789')
  .userId('user-abc')
  .sessionId('session-xyz')
  .userEmail('user@example.com')
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
| `agentEmail(value)` | `microsoft.agent.user.email` |
| `correlationId(value)` | `correlation_id` |
| `userId(value)` | `user.id` |
| `sessionId(value)` | `session_id` |
| `conversationId(value)` | `gen_ai.conversation.id` |
| `userEmail(value)` | `user.email` |
| `operationSource(value)` | `service.name` |
| `channelName(value)` | `gen_ai.execution.source.name` |
| `channelLink(value)` | `gen_ai.execution.source.description` |
| `invokeAgentServer(address, port?)` | `server.address` / `server.port` |

## Data Interfaces

### InvokeAgentScopeDetails

```typescript
interface InvokeAgentScopeDetails {
  endpoint?: ServiceEndpoint;
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
│   ├── contracts.ts                      # Data interfaces, enums, OTEL message types
│   ├── message-utils.ts                  # Message conversion and serialization
│   ├── scopes/
│   │   ├── OpenTelemetryScope.ts         # Base scope class
│   │   ├── InvokeAgentScope.ts           # Agent invocation tracing
│   │   ├── InferenceScope.ts             # LLM inference tracing
│   │   ├── ExecuteToolScope.ts           # Tool execution tracing
│   │   └── OutputScope.ts               # Output message tracing
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

## Configuration

The observability package provides configuration via `ObservabilityConfiguration`, which extends `RuntimeConfiguration`:

```typescript
import {
  ObservabilityConfiguration,
  defaultObservabilityConfigurationProvider
} from '@microsoft/agents-a365-observability';

// Using the default provider (reads from env vars)
const config = defaultObservabilityConfigurationProvider.getConfiguration();
console.log(config.isObservabilityExporterEnabled);  // Enable/disable exporter
console.log(config.observabilityAuthenticationScopes);  // Auth scopes for token exchange
// Custom configuration with overrides
const customConfig = new ObservabilityConfiguration({
  isObservabilityExporterEnabled: () => true,
  observabilityAuthenticationScopes: () => ['custom-scope/.default'],
  observabilityDomainOverride: () => 'https://custom.domain'
});
```

**ObservabilityConfiguration Properties:**

| Property | Env Variable | Default | Description |
|----------|--------------|---------|-------------|
| `observabilityAuthenticationScopes` | `A365_OBSERVABILITY_SCOPES_OVERRIDE` | `['https://api.powerplatform.com/.default']` | OAuth scopes for observability auth |
| `isObservabilityExporterEnabled` | `ENABLE_A365_OBSERVABILITY_EXPORTER` | `false` | Enable Agent365 exporter |
| `observabilityDomainOverride` | `A365_OBSERVABILITY_DOMAIN_OVERRIDE` | `null` | Custom domain URL override |
| `observabilityLogLevel` | `A365_OBSERVABILITY_LOG_LEVEL` | `none` | Internal logging level |
| `clusterCategory` | `CLUSTER_CATEGORY` | `prod` | (Inherited) Environment cluster |
| `isDevelopmentEnvironment` | - | Derived | (Inherited) true if cluster is 'local' or 'dev' |
| `isNodeEnvDevelopment` | `NODE_ENV` | `false` | (Inherited) true if NODE_ENV='development' |

### PerRequestSpanProcessorConfiguration

`PerRequestSpanProcessorConfiguration` extends `ObservabilityConfiguration` and adds guardrail settings specific to the `PerRequestSpanProcessor`. These settings are separated from the common `ObservabilityConfiguration` because the per-request span processor is only used in specific scenarios.

```typescript
import {
  PerRequestSpanProcessorConfiguration,
  defaultPerRequestSpanProcessorConfigurationProvider
} from '@microsoft/agents-a365-observability';

const config = defaultPerRequestSpanProcessorConfigurationProvider.getConfiguration();
console.log(config.isPerRequestExportEnabled);  // Per-request export mode (default: false)
console.log(config.perRequestMaxTraces);  // Max buffered traces (default: 1000)
```

**PerRequestSpanProcessorConfiguration Properties (in addition to all ObservabilityConfiguration properties):**

| Property | Env Variable | Default | Description |
|----------|--------------|---------|-------------|
| `isPerRequestExportEnabled` | `ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT` | `false` | Enable per-request export mode |
| `perRequestMaxTraces` | `A365_PER_REQUEST_MAX_TRACES` | `1000` | Max buffered traces per request |
| `perRequestMaxSpansPerTrace` | `A365_PER_REQUEST_MAX_SPANS_PER_TRACE` | `5000` | Max spans per trace |
| `perRequestMaxConcurrentExports` | `A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS` | `20` | Max concurrent export operations |

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `ENABLE_A365_OBSERVABILITY_EXPORTER` | Enable/disable Agent365 exporter | `false` |
| `A365_OBSERVABILITY_SCOPES_OVERRIDE` | Override auth scopes (space-separated) | Production scope |
| `ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT` | Enable per-request export mode | `false` |
| `A365_OBSERVABILITY_DOMAIN_OVERRIDE` | Custom domain URL | - |
| `A365_OBSERVABILITY_LOG_LEVEL` | Internal log level | `none` |
| `A365_PER_REQUEST_MAX_TRACES` | Max buffered traces (`PerRequestSpanProcessorConfiguration`) | `1000` |
| `A365_PER_REQUEST_MAX_SPANS_PER_TRACE` | Max spans per trace (`PerRequestSpanProcessorConfiguration`) | `5000` |
| `A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS` | Max concurrent exports (`PerRequestSpanProcessorConfiguration`) | `20` |
