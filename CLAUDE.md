# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Microsoft Agent 365 SDK extends the Microsoft 365 Agents SDK with enterprise-grade capabilities for building sophisticated AI agents. This Node.js/TypeScript monorepo provides comprehensive tooling across four core areas:

- **Observability**: OpenTelemetry-based tracing and monitoring for agent applications
- **Notifications**: Agent notification services and lifecycle event handling
- **Runtime**: Core utilities for agent operations and Power Platform integration
- **Tooling**: MCP (Model Context Protocol) server configuration and tool discovery

## Essential Commands

### Package Management
This project uses **pnpm** (version 10.20.0+) as its package manager:

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Build and watch for changes
pnpm build:watch

# Clean build artifacts
pnpm clean
```

### Testing

```bash
# Run all unit tests (excludes integration tests)
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test:watch

# Run integration tests
pnpm test:integration

# Run tests for a specific package
cd packages/agents-a365-observability && pnpm test
```

### Code Quality

```bash
# Run linter
pnpm lint

# Auto-fix linting issues
pnpm lint:fix
```

### Package Building and Distribution

```bash
# Build and create .tgz files for distribution
pnpm build
cd packages && pnpm pack --workspaces

# The .tgz files will be created in the root directory
```

## Architecture

### Monorepo Structure

This is a pnpm workspace monorepo with 9 packages in `packages/`:

```
packages/
├── agents-a365-runtime/                    # Core utilities (no external deps)
├── agents-a365-observability/              # OpenTelemetry tracing (depends on runtime)
├── agents-a365-observability-hosting/      # Hosting-specific observability
├── agents-a365-observability-extensions-openai/  # OpenAI instrumentation
├── agents-a365-notifications/              # Agent notification services
├── agents-a365-tooling/                    # MCP server configuration
├── agents-a365-tooling-extensions-claude/  # Claude/Anthropic integration
├── agents-a365-tooling-extensions-langchain/  # LangChain integration
└── agents-a365-tooling-extensions-openai/  # OpenAI Agents SDK integration
```

**Dependency Flow:**
```
runtime ──► observability ──► observability-hosting ──► observability-extensions-openai
   │
   └─────────► tooling ──► tooling-extensions-* (claude, langchain, openai)
   │
   └─────────► notifications
```

### Package Structure

Each package follows this convention:

```
packages/agents-a365-<name>/
├── src/
│   ├── index.ts              # Public API exports (ONLY place for exports)
│   └── <implementation files>
├── dist/                     # Build output
│   ├── cjs/                  # CommonJS build
│   └── esm/                  # ES Module build
├── package.json
├── tsconfig.json             # Base config
├── tsconfig.cjs.json         # CommonJS build config
├── tsconfig.esm.json         # ESM build config
└── docs/design.md            # Package-specific design doc
```

**Build System:**
- Each package builds to **both CJS and ESM** formats
- `npm run build` runs `build:cjs && build:esm`
- TypeScript uses separate tsconfig files for each module format

### Key Design Patterns

1. **Singleton Pattern**: `ObservabilityManager` ensures single tracer provider per application
2. **Disposable Pattern**: Scope classes (`InvokeAgentScope`, `InferenceScope`, `ExecuteToolScope`) implement `Disposable` for automatic span lifecycle with `using` keyword
3. **Builder Pattern**: `ObservabilityBuilder` and `BaggageBuilder` provide fluent APIs
4. **Strategy Pattern**: `McpToolServerConfigurationService` switches between manifest (dev) and gateway (prod) based on `NODE_ENV`
5. **Extension Methods**: `notifications` package extends `AgentApplication` via TypeScript declaration merging
6. **Configuration Provider Pattern**: Hierarchical configuration with function-based overrides for multi-tenant support. Each package has its own configuration class (`RuntimeConfiguration`, `ToolingConfiguration`, `ObservabilityConfiguration`) with default singleton providers (`defaultRuntimeConfigurationProvider`, etc.)

## Core Package Functionality

### Runtime (`@microsoft/agents-a365-runtime`)
Foundation package with no SDK dependencies. Provides:
- **`RuntimeConfiguration`**: Base configuration class with `clusterCategory`, `isDevelopmentEnvironment`, `isNodeEnvDevelopment`
- **`defaultRuntimeConfigurationProvider`**: Singleton configuration provider for runtime settings
- **`Utility`**: Token decoding (`GetAppIdFromToken`), agent identity resolution (`ResolveAgentIdentity`), User-Agent generation (`GetUserAgentHeader`)
- **`AgenticAuthenticationService`**: Token exchange for MCP platform auth
- **`PowerPlatformApiDiscovery`**: Endpoint discovery for different clouds (prod, gov, dod, mooncake, etc.)
- **Environment utilities** _(deprecated)_: `getClusterCategory()`, `isDevelopmentEnvironment()`, etc. - use `RuntimeConfiguration` instead

### Observability (`@microsoft/agents-a365-observability`)
OpenTelemetry-based distributed tracing:
- **`ObservabilityConfiguration`**: Configuration with `observabilityAuthenticationScopes`, `isObservabilityExporterEnabled`, `observabilityLogLevel`, etc.
- **`PerRequestSpanProcessorConfiguration`**: Extends `ObservabilityConfiguration` with per-request processor settings (`isPerRequestExportEnabled`, `perRequestMaxTraces`, `perRequestMaxSpansPerTrace`, `perRequestMaxConcurrentExports`, `flushGraceMs`, `maxTraceAgeMs`). Separated from `ObservabilityConfiguration` because these settings are only relevant when using `PerRequestSpanProcessor`.
- **`defaultObservabilityConfigurationProvider`**: Singleton configuration provider for observability settings
- **`defaultPerRequestSpanProcessorConfigurationProvider`**: Singleton configuration provider for per-request span processor settings
- **`ObservabilityManager`**: Main entry point (singleton)
- **`ObservabilityBuilder`**: Fluent configuration API with methods to configure custom configuration providers:
  - `withObservabilityConfigurationProvider()`: Set custom observability configuration provider
  - `withPerRequestSpanProcessorConfigurationProvider()`: Set custom per-request span processor configuration provider
- **Scope classes**:
  - `InvokeAgentScope`: Trace agent invocations (root span)
  - `InferenceScope`: Trace LLM/AI inference calls
  - `ExecuteToolScope`: Trace tool execution
- **`BaggageBuilder`**: Context propagation across async boundaries (tenant ID, agent ID, correlation ID)
- **Data contracts**: `InvokeAgentDetails`, `AgentDetails`, `TenantDetails`, `InferenceDetails`, `ToolCallDetails`

**Configuration Provider Example:**
```typescript
import {
  ObservabilityManager,
  ObservabilityConfiguration,
  PerRequestSpanProcessorConfiguration,
  ObservabilityConfigurationOptions,
  PerRequestSpanProcessorConfigurationOptions
} from '@microsoft/agents-a365-observability';
import { DefaultConfigurationProvider, ClusterCategory } from '@microsoft/agents-a365-runtime';

// Define observability configuration overrides
const observabilityConfigOverrides: ObservabilityConfigurationOptions = {
  observabilityLogLevel: () => 'info',
  isObservabilityExporterEnabled: () => true,
};

// Create observability configuration provider
const observabilityConfigurationProvider = new DefaultConfigurationProvider(
  () => new ObservabilityConfiguration(observabilityConfigOverrides)
);

// Define per-request span processor configuration overrides
const perRequestSpanProcessorConfigOverrides: PerRequestSpanProcessorConfigurationOptions = {
  isPerRequestExportEnabled: () => true,
  flushGraceMs: () => 250,
  maxTraceAgeMs: () => 1800000, // 30 minutes
  perRequestMaxTraces: () => 1000,
  perRequestMaxConcurrentExports: () => 20,
  perRequestMaxSpansPerTrace: () => 5000
};

// Create per-request span processor configuration provider
const perRequestSpanProcessorConfigurationProvider = new DefaultConfigurationProvider(
  () => new PerRequestSpanProcessorConfiguration(perRequestSpanProcessorConfigOverrides)
);

// Configure observability with custom providers
ObservabilityManager.configure((builder) => {
  builder
    .withService('my-agent', '1.0.0')
    .withClusterCategory(ClusterCategory.prod)
    .withTokenResolver(async (agentId, tenantId) => getAuthToken(agentId, tenantId))
    .withObservabilityConfigurationProvider(observabilityConfigurationProvider)
    .withPerRequestSpanProcessorConfigurationProvider(perRequestSpanProcessorConfigurationProvider)
    .start();
});
```

**Tracing Flow:**
```
BaggageBuilder.build().run()
  └─► InvokeAgentScope.start()           [Root span - agent request]
        ├─► InferenceScope.start()        [Child span - LLM call]
        ├─► ExecuteToolScope.start()      [Child span - tool execution]
        └─► Agent365Exporter.export()     [Batched HTTP export]
```

### Tooling (`@microsoft/agents-a365-tooling`)
MCP tool server discovery and configuration:
- **`ToolingConfiguration`**: Configuration with `mcpPlatformEndpoint`, `mcpPlatformAuthenticationScope`, `useToolingManifest`
- **`defaultToolingConfigurationProvider`**: Singleton configuration provider for tooling settings
- **`McpToolServerConfigurationService`**: Discover/configure MCP tool servers
  - Dev mode (`NODE_ENV=Development`): Loads from `ToolingManifest.json`
  - Prod mode (default): Discovers from Agent365 gateway endpoint
- **`Utility`**: Header composition, token validation, URL construction
- **Interfaces**: `MCPServerConfig`, `McpClientTool`, `ToolOptions`

### Notifications (`@microsoft/agents-a365-notifications`)
Extends `AgentApplication` with notification handlers via declaration merging:
- `onAgenticEmailNotification()`, `onAgenticWordNotification()`, `onAgenticExcelNotification()`, `onAgenticPowerPointNotification()`
- `onLifecycleNotification()`: All lifecycle events
- `onAgenticUserCreatedNotification()`, `onAgenticUserWorkloadOnboardingNotification()`, `onAgenticUserDeletedNotification()`

## Important Development Rules

### Copyright Headers
**CRITICAL**: All `.js`, `.ts`, `.jsx`, `.tsx` files must include a Microsoft copyright header. Check `.github/copilot-instructions.md` for the exact format:

```typescript
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
```

Exceptions: Test files, config files (`.json`, `.yaml`, `.md`), third-party code, build output.

### Legacy Keyword Check
The keyword "Kairo" is legacy and should not appear in any code. Flag and remove if found.

### Code Standards
- **Unused variables**: Prefix with `_` to avoid ESLint errors (configured in `eslint.config.mjs`)
- **Module format**: This is an ESM project (`"type": "module"` in root `package.json`)
- **Node.js version**: Requires Node.js >= 18.0.0
- **Dependency versions**: Never specify version constraints directly in `package.json` files. All dependency versions must be defined in the `catalog:` section of `pnpm-workspace.yaml` and referenced using `catalog:` in package.json files. This applies to `dependencies`, `devDependencies`, and `peerDependencies`.

## Environment Variables

| Variable | Purpose | Values |
|----------|---------|--------|
| `NODE_ENV` | Dev vs prod mode | `Development`, `production` (default) |
| `CLUSTER_CATEGORY` | Environment classification | `local`, `dev`, `test`, `preprod`, `prod`, `gov`, `high`, `dod`, `mooncake`, `ex`, `rx` |
| `MCP_PLATFORM_ENDPOINT` | MCP platform base URL | URL string |
| `MCP_PLATFORM_AUTHENTICATION_SCOPE` | MCP platform auth scope | Scope string |
| `A365_OBSERVABILITY_SCOPES_OVERRIDE` | Override observability auth scopes | Space-separated scope strings |
| `ENABLE_A365_OBSERVABILITY_EXPORTER` | Enable Agent365 exporter | `true`, `false` (default) |
| `ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT` | Enable per-request export mode | `true`, `false` (default) |
| `A365_OBSERVABILITY_USE_CUSTOM_DOMAIN` | Use custom domain for export | `true`, `false` (default) |
| `A365_OBSERVABILITY_DOMAIN_OVERRIDE` | Custom domain URL override | URL string |
| `A365_OBSERVABILITY_LOG_LEVEL` | Internal logging level | `none` (default), `error`, `warn`, `info`, `debug` |
| `A365_PER_REQUEST_MAX_TRACES` | Max buffered traces per request (`PerRequestSpanProcessorConfiguration`) | Number (default: 1000) |
| `A365_PER_REQUEST_MAX_SPANS_PER_TRACE` | Max spans per trace (`PerRequestSpanProcessorConfiguration`) | Number (default: 5000) |
| `A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS` | Max concurrent exports (`PerRequestSpanProcessorConfiguration`) | Number (default: 20) |
| `A365_PER_REQUEST_FLUSH_GRACE_MS` | Grace period (ms) to wait for child spans after root span ends (`PerRequestSpanProcessorConfiguration`) | Number (default: 250) |
| `A365_PER_REQUEST_MAX_TRACE_AGE_MS` | Maximum age (ms) for a trace before forcing flush (`PerRequestSpanProcessorConfiguration`) | Number (default: 1800000, i.e., 30 minutes) |

## Testing

### Test Configuration
- **Framework**: Jest with ts-jest preset
- **Config**: `tests/jest.config.cjs`
- **Coverage**: HTML, text, lcov, cobertura formats
- **Pattern**: Tests can be named `<method>.test.ts` or `<method>.spec.ts`

### Module Resolution in Tests
The Jest config includes module name mappers to resolve workspace packages:
```javascript
'@microsoft/agents-a365-runtime$': '<rootDir>/packages/agents-a365-runtime/src'
'@microsoft/agents-a365-observability$': '<rootDir>/packages/agents-a365-observability/src'
// etc.
```

This allows tests to import from package names directly even though they're not published.

## Version Management

The project uses [Nerdbank.GitVersioning](https://github.com/dotnet/Nerdbank.GitVersioning):

```bash
# Update version
npm run version

# Update to local dev version
npm run version:local

# Dry run (check what would change)
npm run version:check
```

## Additional Resources

### Design Documents

- **Overall Architecture**: [docs/design.md](docs/design.md) - Main SDK architecture and design
- **Runtime Package**: [packages/agents-a365-runtime/docs/design.md](packages/agents-a365-runtime/docs/design.md)
- **Observability Package**: [packages/agents-a365-observability/docs/design.md](packages/agents-a365-observability/docs/design.md)
- **Observability Hosting**: [packages/agents-a365-observability-hosting/docs/design.md](packages/agents-a365-observability-hosting/docs/design.md)
- **Observability Extensions (OpenAI)**: [packages/agents-a365-observability-extensions-openai/docs/design.md](packages/agents-a365-observability-extensions-openai/docs/design.md)
- **Notifications Package**: [packages/agents-a365-notifications/docs/design.md](packages/agents-a365-notifications/docs/design.md)
- **Tooling Package**: [packages/agents-a365-tooling/docs/design.md](packages/agents-a365-tooling/docs/design.md)
- **Tooling Extensions (Claude)**: [packages/agents-a365-tooling-extensions-claude/docs/design.md](packages/agents-a365-tooling-extensions-claude/docs/design.md)
- **Tooling Extensions (LangChain)**: [packages/agents-a365-tooling-extensions-langchain/docs/design.md](packages/agents-a365-tooling-extensions-langchain/docs/design.md)
- **Tooling Extensions (OpenAI)**: [packages/agents-a365-tooling-extensions-openai/docs/design.md](packages/agents-a365-tooling-extensions-openai/docs/design.md)

### External Documentation

- **Microsoft Agent 365 Docs**: https://learn.microsoft.com/microsoft-agent-365/developer/
- **Microsoft 365 Agents SDK**: https://github.com/Microsoft/Agents-for-js
- **OpenTelemetry Node.js**: https://opentelemetry.io/docs/languages/js/
- **Model Context Protocol**: https://modelcontextprotocol.io/
