# Microsoft Agent 365 SDK for Node.js - Architecture and Design

This document describes the architecture and design of the Microsoft Agent 365 SDK for Node.js/TypeScript. It is intended to help developers and coding agents understand the project structure and quickly get started reading, writing, and reviewing code.

## Overview

The Microsoft Agent 365 SDK extends the [Microsoft 365 Agents SDK](https://github.com/Microsoft/Agents-for-js) with enterprise-grade capabilities for building sophisticated AI agents. It provides comprehensive tooling for:

- **Observability**: OpenTelemetry-based tracing, monitoring, and context propagation
- **Notifications**: Agent notification services and activity routing for Microsoft 365 workloads
- **Runtime**: Core utilities for agent operations and Power Platform integration
- **Tooling**: MCP (Model Context Protocol) server configuration and tool discovery

The SDK supports production deployment across Microsoft 365, Teams, Copilot Studio, and Webchat platforms.

## Repository Structure

```
Agent365-nodejs/
├── packages/                                    # Core packages (9 total)
│   ├── agents-a365-runtime/
│   ├── agents-a365-tooling/
│   ├── agents-a365-observability/
│   ├── agents-a365-notifications/
│   ├── agents-a365-observability-hosting/
│   ├── agents-a365-observability-extensions-openai/
│   ├── agents-a365-tooling-extensions-claude/
│   ├── agents-a365-tooling-extensions-langchain/
│   └── agents-a365-tooling-extensions-openai/
├── tests/                                       # Test suite
├── tests-agent/                                 # Sample agent applications
├── docs/                                        # Documentation
└── package.json                                 # Workspace configuration
```

### Package Layout

Each package follows a consistent structure:

```
packages/agents-a365-<name>/
├── src/
│   ├── index.ts                                 # Public API exports
│   ├── <module>.ts                              # Core implementation
│   └── <submodule>/                             # Sub-modules
├── package.json                                 # Package configuration
├── tsconfig.json                                # TypeScript configuration
└── docs/
    └── design.md                                # Package-specific design doc
```

## Core Packages

> **Note**: Each package has its own detailed design document in `packages/<package-name>/docs/design.md`. The sections below provide an overview; refer to the package-specific documents for implementation details.

### 1. Runtime (`@microsoft/agents-a365-runtime`)

> **Detailed documentation**: [packages/agents-a365-runtime/docs/design.md](../packages/agents-a365-runtime/docs/design.md)

Core utilities shared across the SDK.

**Key Classes:**

| Class | Purpose |
|-------|---------|
| `Utility` | Token decoding, agent identity resolution, user-agent generation |
| `AgenticAuthenticationService` | Token exchange for MCP platform authentication |
| `PowerPlatformApiDiscovery` | Endpoint discovery for different cloud environments |

**Configuration:**

| Property | Purpose |
|----------|---------|
| `clusterCategory` | Environment classification (prod, dev, local) |
| `isDevelopmentEnvironment` | Check if running in development mode |
| `mcpPlatformAuthenticationScope` | MCP platform authentication scope |
| `observabilityAuthenticationScopes` | Auth scopes for observability service |

**Usage Example:**

```typescript
import {
  Utility,
  PowerPlatformApiDiscovery,
  defaultRuntimeConfigurationProvider,
} from '@microsoft/agents-a365-runtime';

// Access configuration via the default provider
const config = defaultRuntimeConfigurationProvider.getConfiguration();
console.log(`Cluster: ${config.clusterCategory}`);
console.log(`Is dev: ${config.isDevelopmentEnvironment}`);

// Decode agent identity from JWT token
const appId = Utility.GetAppIdFromToken(jwtToken);

// Resolve agent identity from context
const agentId = Utility.ResolveAgentIdentity(turnContext, authToken);

// Discover Power Platform endpoints
const discovery = new PowerPlatformApiDiscovery(config.clusterCategory);
const endpoint = discovery.getTenantIslandClusterEndpoint(tenantId);

// Generate User-Agent header
const userAgent = Utility.GetUserAgentHeader('MyOrchestrator');
```

### 2. Observability (`@microsoft/agents-a365-observability`)

> **Detailed documentation**: [packages/agents-a365-observability/docs/design.md](../packages/agents-a365-observability/docs/design.md)

The foundation for distributed tracing in agent applications. Built on OpenTelemetry.

**Key Classes:**

| Class | Purpose |
|-------|---------|
| `ObservabilityManager` | Main entry point, singleton pattern for telemetry configuration |
| `ObservabilityBuilder` | Fluent API for configuring telemetry |
| `InvokeAgentScope` | Trace agent invocation lifecycle (entry point for agent requests) |
| `InferenceScope` | Trace LLM/AI model inference calls |
| `ExecuteToolScope` | Trace tool execution operations |
| `BaggageBuilder` | Fluent API for context propagation across async boundaries |

**Data Classes:**

| Interface | Purpose |
|-----------|---------|
| `InvokeAgentDetails` | Agent endpoint, session ID, and invocation metadata |
| `AgentDetails` | Agent identification and metadata |
| `TenantDetails` | Tenant identification for multi-tenant scenarios |
| `InferenceDetails` | Model name, tokens, provider information |
| `ToolCallDetails` | Tool name, arguments, endpoint |
| `CallerDetails` | Caller identification and context |

**Usage Example:**

```typescript
import {
  ObservabilityManager,
  InvokeAgentScope,
  BaggageBuilder,
  ExecutionType,
} from '@microsoft/agents-a365-observability';

// Initialize telemetry
ObservabilityManager.start({
  serviceName: 'my-agent',
  tokenResolver: (agentId, tenantId) => getAuthToken(),
  clusterCategory: 'prod'
});

// Set context for child spans
const scope = new BaggageBuilder()
  .tenantId(tenantId)
  .agentId(agentId)
  .correlationId(correlationId)
  .build();

scope.run(() => {
  // Trace agent invocation
  using agentScope = InvokeAgentScope.start(
    invokeAgentDetails,
    tenantDetails,
    callerAgentDetails,
    callerDetails
  );

  // Agent logic here
  agentScope.recordResponse('result');
});
```

### 3. Observability Extensions

Framework-specific instrumentations that integrate with the observability core:

| Package | Purpose | Design Doc |
|---------|---------|------------|
| `observability-extensions-openai` | Instrument OpenAI Agents SDK | [design.md](../packages/agents-a365-observability-extensions-openai/docs/design.md) |
| `observability-hosting` | Hosting-specific observability utilities | [design.md](../packages/agents-a365-observability-hosting/docs/design.md) |

### 4. Tooling (`@microsoft/agents-a365-tooling`)

> **Detailed documentation**: [packages/agents-a365-tooling/docs/design.md](../packages/agents-a365-tooling/docs/design.md)

MCP (Model Context Protocol) tool server configuration and discovery.

**Key Classes:**

| Class | Purpose |
|-------|---------|
| `McpToolServerConfigurationService` | Discover and configure MCP tool servers |
| `Utility` | Header composition, token validation, URL construction |

**Interfaces:**

| Interface | Purpose |
|-----------|---------|
| `MCPServerConfig` | Tool server configuration (name, URL, headers) |
| `McpClientTool` | Tool metadata from MCP servers |
| `ToolOptions` | Tool request options with orchestrator name |

**Dual-Mode Configuration:**

The tooling package supports two modes based on the `NODE_ENV` variable:

- **Development** (`NODE_ENV=Development`): Loads tool servers from a local `ToolingManifest.json` file
- **Production** (default): Discovers tool servers from the Agent365 gateway endpoint

**Usage Example:**

```typescript
import {
  McpToolServerConfigurationService,
  Utility,
} from '@microsoft/agents-a365-tooling';

const service = new McpToolServerConfigurationService();

// Discover available tool servers
const servers = await service.listToolServers(
  agenticAppId,
  bearerToken,
  { orchestratorName: 'MyOrchestrator' }
);

for (const server of servers) {
  console.log(`Tool: ${server.mcpServerName}`);
  console.log(`URL: ${server.url}`);

  // Get tools from the server
  const tools = await service.getMcpClientTools(
    server.mcpServerName,
    server
  );
}
```

### 5. Tooling Extensions

Framework-specific adapters for MCP tool integration:

| Package | Purpose | Design Doc |
|---------|---------|------------|
| `tooling-extensions-claude` | Claude SDK integration | [design.md](../packages/agents-a365-tooling-extensions-claude/docs/design.md) |
| `tooling-extensions-langchain` | LangChain integration | [design.md](../packages/agents-a365-tooling-extensions-langchain/docs/design.md) |
| `tooling-extensions-openai` | OpenAI Agents SDK integration | [design.md](../packages/agents-a365-tooling-extensions-openai/docs/design.md) |

### 6. Notifications (`@microsoft/agents-a365-notifications`)

> **Detailed documentation**: [packages/agents-a365-notifications/docs/design.md](../packages/agents-a365-notifications/docs/design.md)

Agent notification and lifecycle event handling.

**Extension Methods:**

| Method | Purpose |
|--------|---------|
| `onAgentNotification()` | Generic agent notification routing |
| `onAgenticEmailNotification()` | Email notification handler |
| `onAgenticWordNotification()` | Word document notification handler |
| `onAgenticExcelNotification()` | Excel notification handler |
| `onAgenticPowerPointNotification()` | PowerPoint notification handler |
| `onLifecycleNotification()` | All lifecycle events handler |
| `onAgenticUserCreatedNotification()` | User creation event handler |
| `onAgenticUserWorkloadOnboardingNotification()` | User onboarding event handler |
| `onAgenticUserDeletedNotification()` | User deletion event handler |

**Usage Example:**

```typescript
import '@microsoft/agents-a365-notifications';
import { AgentApplication } from '@microsoft/agents-hosting';

const app = new AgentApplication();

// Handle email notifications
app.onAgenticEmailNotification(async (turnContext, turnState, notification) => {
  const emailRef = notification.emailReference;
  console.log(`Received email notification: ${emailRef?.subject}`);
});

// Handle lifecycle events
app.onLifecycleNotification(async (turnContext, turnState, notification) => {
  console.log(`Lifecycle event: ${notification.notificationType}`);
});
```

## Design Patterns

### 1. Singleton Pattern

`ObservabilityManager` uses singleton pattern to ensure a single tracer provider per application:

```typescript
export class ObservabilityManager {
  private static instance?: ObservabilityBuilder;

  public static start(options?: BuilderOptions): ObservabilityBuilder {
    const builder = new ObservabilityBuilder();
    // Configure builder...
    builder.start();
    ObservabilityManager.instance = builder;
    return builder;
  }

  public static getInstance(): ObservabilityBuilder | null {
    return ObservabilityManager.instance || null;
  }
}
```

### 2. Disposable Pattern

All scope classes implement the `Disposable` interface for automatic span lifecycle management:

```typescript
using scope = InvokeAgentScope.start(details, tenantDetails);
// Span is active
scope.recordResponse('result');
// Span automatically ends when scope is disposed
```

### 3. Builder Pattern

`BaggageBuilder` and `ObservabilityBuilder` provide fluent APIs for configuration:

```typescript
const scope = new BaggageBuilder()
  .tenantId(tenantId)
  .agentId(agentId)
  .correlationId(correlationId)
  .build();
```

### 4. Strategy Pattern

`McpToolServerConfigurationService` selects between manifest-based (dev) and gateway-based (prod) configuration loading based on environment:

```typescript
async listToolServers(agenticAppId: string, authToken: string): Promise<MCPServerConfig[]> {
  return this.isDevScenario()
    ? this.getMCPServerConfigsFromManifest()
    : this.getMCPServerConfigsFromToolingGateway(agenticAppId, authToken);
}
```

### 5. Configuration Provider Pattern

The SDK uses a hierarchical configuration system with function-based overrides for multi-tenant support:

```typescript
import {
  RuntimeConfiguration,
  RuntimeConfigurationOptions,
  DefaultConfigurationProvider,
  defaultRuntimeConfigurationProvider,
} from '@microsoft/agents-a365-runtime';

// Simple usage: default configuration with environment variables
const config = defaultRuntimeConfigurationProvider.getConfiguration();

// Multi-tenant: per-request configuration with dynamic overrides
const options: RuntimeConfigurationOptions = {
  clusterCategory: () => getTenantCluster(currentTenantId),
};
const tenantProvider = new DefaultConfigurationProvider(
  () => new RuntimeConfiguration(options)
);
const tenantConfig = tenantProvider.getConfiguration();
```

**Configuration Resolution Order:**

Each configuration property follows a consistent resolution chain. The first non-undefined value wins:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Configuration Resolution Order                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────────────┐                                               │
│   │  Override Function   │  ← Called on EVERY property access            │
│   │  (if provided)       │    Enables per-request/per-tenant values      │
│   └──────────┬───────────┘                                               │
│              │                                                           │
│              ▼ returns undefined?                                        │
│              │                                                           │
│   ┌──────────────────────┐                                               │
│   │  Environment Variable│  ← Process-level configuration                │
│   │  (if set and valid)  │    Standard 12-factor app approach            │
│   └──────────┬───────────┘                                               │
│              │                                                           │
│              ▼ not set or invalid?                                       │
│              │                                                           │
│   ┌──────────────────────┐                                               │
│   │   Default Value      │  ← Built-in production defaults               │
│   │   (always defined)   │    Safe fallback for all properties           │
│   └──────────────────────┘                                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Example Resolution:**

```typescript
// Configuration class getter implementation pattern:
get clusterCategory(): ClusterCategory {
  // 1. Check override function
  const override = this.overrides.clusterCategory?.();
  if (override !== undefined) return override;     // ← Override wins

  // 2. Check environment variable
  const envValue = process.env.CLUSTER_CATEGORY;
  if (isValidClusterCategory(envValue)) return envValue;  // ← Env var wins

  // 3. Return default
  return ClusterCategory.prod;                     // ← Default fallback
}
```

**Key Characteristics:**

| Aspect | Behavior |
|--------|----------|
| **Dynamic resolution** | Override functions called on each access, not cached |
| **Undefined vs false** | `undefined` falls through; explicit `false` is used |
| **Validation** | Invalid env var values fall through to defaults |
| **Thread safety** | Safe for concurrent access (no shared mutable state) |

**Inheritance Hierarchy:**
- `RuntimeConfiguration` → `ToolingConfiguration`, `ObservabilityConfiguration`
- Each child package extends the base with additional settings

### 6. Extension Methods Pattern

The notifications package uses TypeScript declaration merging to extend `AgentApplication`:

```typescript
declare module '@microsoft/agents-hosting' {
  interface AgentApplication<TState extends TurnState> {
    onAgenticEmailNotification(handler: AgentNotificationHandler<TState>): void;
  }
}

AgentApplication.prototype.onAgenticEmailNotification = function(...) { ... };
```

## Data Flow

### Agent Invocation Tracing Flow

```
Application
    │
    ▼
BaggageBuilder.build().run()              ← Set tenant, agent, correlation IDs
    │
    ▼
InvokeAgentScope.start()                  ← Create root span
    │
    ├──▶ SpanProcessor.onStart()          ← Copy baggage to span attributes
    │
    ▼
[Agent execution]
    │
    ├──▶ InferenceScope.start()           ← Child span for LLM calls
    │         └── recordInputTokens()
    │         └── recordOutputTokens()
    │
    ├──▶ ExecuteToolScope.start()         ← Child span for tool execution
    │         └── recordResponse()
    │
    ▼
scope.recordResponse()                    ← Record final response
    │
    ▼
BatchSpanProcessor                        ← Accumulate spans
    │
    ▼
Agent365Exporter.export()                 ← Send to backend
    ├── Partition by (tenant_id, agent_id)
    ├── Resolve endpoint via PowerPlatformApiDiscovery
    └── POST to observability service
```

### MCP Tool Discovery Flow

```
Application
    │
    ▼
McpToolServerConfigurationService.listToolServers()
    │
    ▼
isDevScenario()?
    │
    ├── YES ─▶ getMCPServerConfigsFromManifest()
    │              ├── Find ToolingManifest.json
    │              ├── Parse JSON configuration
    │              └── Return MCPServerConfig[]
    │
    └── NO ──▶ getMCPServerConfigsFromToolingGateway()
                   ├── Build gateway URL
                   ├── HTTP GET with auth token
                   └── Return MCPServerConfig[]
```

## Configuration

### Environment Variables

| Variable | Purpose | Values |
|----------|---------|--------|
| `NODE_ENV` | Controls development vs production behavior | `Development`, `production` (default) |
| `CLUSTER_CATEGORY` | Environment classification | `local`, `dev`, `prod`, `gov`, etc. |
| `A365_OBSERVABILITY_SCOPES_OVERRIDE` | Override observability auth scopes | Space-separated scope strings |
| `MCP_PLATFORM_AUTHENTICATION_SCOPE` | MCP platform auth scope | Scope string |
| `MCP_PLATFORM_ENDPOINT` | MCP platform base URL | URL string |

### Cluster Categories

The SDK supports multiple deployment environments via `ClusterCategory`:

| Category | Description |
|----------|-------------|
| `local` | Local development |
| `dev` | Development environment |
| `test` | Test environment |
| `preprod` | Pre-production |
| `firstrelease` | First release ring |
| `prod` | Production |
| `gov` | Government cloud |
| `high` | High security government |
| `dod` | Department of Defense |
| `mooncake` | China sovereign cloud |
| `ex` | Sovereign cloud (EagleX) |
| `rx` | Sovereign cloud (RX) |

## Testing

### Test Structure

```
tests/
├── observability/
├── runtime/
├── tooling/
└── jest.config.cjs
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run specific package tests
cd packages/agents-a365-observability && pnpm test

# Run integration tests
pnpm test:integration
```

### Test Conventions

- **Framework**: Jest
- **Pattern**: AAA (Arrange → Act → Assert)
- **Naming**: `<method>.test.ts` or `test_<method>.ts`

## Development

### Prerequisites

- Node.js >= 18.0.0
- pnpm 10.20.0+
- Git

### Setup

```bash
# Clone repository
git clone https://github.com/microsoft/Agent365-nodejs.git
cd Agent365-nodejs

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Building

```bash
# Build all packages
pnpm build

# Build specific package
cd packages/agents-a365-observability && pnpm build

# Watch mode (development)
pnpm build:watch
```

### Code Quality

The project uses ESLint with TypeScript support:

```bash
# Check linting
pnpm lint

# Auto-fix issues
pnpm lint:fix
```

### Package Dependencies

Dependencies between packages are managed via pnpm workspace:

```
runtime ◄─── observability
   │              │
   │              ▼
   │         observability-hosting
   │              │
   │              ▼
   │         observability-extensions-openai
   │
   ▼
tooling ◄─── tooling-extensions-*
   │
   ▼
notifications
```

## Key Files Reference

| File | Purpose |
|------|---------|
| [package.json](../package.json) | Workspace configuration, scripts |
| [packages/agents-a365-observability/src/index.ts](../packages/agents-a365-observability/src/index.ts) | Observability public API |
| [packages/agents-a365-tooling/src/index.ts](../packages/agents-a365-tooling/src/index.ts) | Tooling public API |
| [packages/agents-a365-runtime/src/index.ts](../packages/agents-a365-runtime/src/index.ts) | Runtime public API |
| [packages/agents-a365-notifications/src/index.ts](../packages/agents-a365-notifications/src/index.ts) | Notifications public API |

## External Resources

- [Microsoft Agent 365 Developer Documentation](https://learn.microsoft.com/en-us/javascript/api/agent365-sdk-node/agent365-overview?view=agent365-sdk-node-latest)
- [Microsoft 365 Agents SDK Documentation](https://learn.microsoft.com/microsoft-365/agents-sdk/)
- [OpenTelemetry Node.js Documentation](https://opentelemetry.io/docs/languages/js/)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [GitHub Repository](https://github.com/microsoft/Agent365-nodejs)
