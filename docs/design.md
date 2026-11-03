# Microsoft Agent 365 SDK for Node.js - Architecture and Design

This document describes the architecture and design of the Microsoft Agent 365 SDK for Node.js/TypeScript. It is intended to help developers and coding agents understand the project structure and quickly get started reading, writing, and reviewing code.

## Overview

The Microsoft Agent 365 SDK extends the [Microsoft 365 Agents SDK](https://github.com/Microsoft/Agents-for-js) with enterprise-grade capabilities for building sophisticated AI agents. It provides comprehensive tooling for:

- **Notifications**: Agent notification services and activity routing for Microsoft 365 workloads
- **Runtime**: Core utilities for agent operations and Power Platform integration
- **Tooling**: MCP (Model Context Protocol) server configuration and tool discovery

The SDK supports production deployment across Microsoft 365, Teams, Copilot Studio, and Webchat platforms.

Observability is no longer implemented or released here. Applications use the Microsoft OpenTelemetry distro; see the [migration guide](observability-migration.md) for APIs, authentication, and package-owner retirement actions.

## Repository Structure

```
Agent365-nodejs/
├── packages/                                    # Six maintained packages
│   ├── agents-a365-runtime/
│   ├── agents-a365-tooling/
│   ├── agents-a365-notifications/
│   ├── agents-a365-tooling-extensions-claude/
│   ├── agents-a365-tooling-extensions-langchain/
│   └── agents-a365-tooling-extensions-openai/
├── tests/                                       # Test suite
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

### 2. Tooling (`@microsoft/agents-a365-tooling`)

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

### 3. Tooling Extensions

Framework-specific adapters for MCP tool integration:

| Package | Purpose | Design Doc |
|---------|---------|------------|
| `tooling-extensions-claude` | Claude SDK integration | [design.md](../packages/agents-a365-tooling-extensions-claude/docs/design.md) |
| `tooling-extensions-langchain` | LangChain integration | [design.md](../packages/agents-a365-tooling-extensions-langchain/docs/design.md) |
| `tooling-extensions-openai` | OpenAI Agents SDK integration | [design.md](../packages/agents-a365-tooling-extensions-openai/docs/design.md) |

### 4. Notifications (`@microsoft/agents-a365-notifications`)

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

### 1. Strategy Pattern

`McpToolServerConfigurationService` selects between manifest-based (dev) and gateway-based (prod) configuration loading based on environment:

```typescript
async listToolServers(agenticAppId: string, authToken: string): Promise<MCPServerConfig[]> {
  return this.isDevScenario()
    ? this.getMCPServerConfigsFromManifest()
    : this.getMCPServerConfigsFromToolingGateway(agenticAppId, authToken);
}
```

### 2. Configuration Provider Pattern

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
- `RuntimeConfiguration` → `ToolingConfiguration`
- Each child package extends the base with additional settings

### 3. Extension Methods Pattern

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
├── notifications/
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

# Run Runtime tests through the central runner
pnpm --filter @microsoft/agents-a365-tests test --runInBand --testPathPatterns=runtime
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
pnpm --filter @microsoft/agents-a365-runtime build

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
runtime → tooling → tooling-extensions-* (Claude, LangChain, OpenAI)
runtime → notifications
```

## Key Files Reference

| File | Purpose |
|------|---------|
| [package.json](../package.json) | Workspace configuration, scripts |
| [packages/agents-a365-tooling/src/index.ts](../packages/agents-a365-tooling/src/index.ts) | Tooling public API |
| [packages/agents-a365-runtime/src/index.ts](../packages/agents-a365-runtime/src/index.ts) | Runtime public API |
| [packages/agents-a365-notifications/src/index.ts](../packages/agents-a365-notifications/src/index.ts) | Notifications public API |

## External Resources

- [Microsoft Agent 365 Developer Documentation](https://learn.microsoft.com/en-us/javascript/api/agent365-sdk-node/agent365-overview?view=agent365-sdk-node-latest)
- [Microsoft 365 Agents SDK Documentation](https://learn.microsoft.com/microsoft-365/agents-sdk/)
- [OpenTelemetry Node.js Documentation](https://opentelemetry.io/docs/languages/js/)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [GitHub Repository](https://github.com/microsoft/Agent365-nodejs)
