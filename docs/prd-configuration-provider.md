# PRD: Configuration Provider for Agent365 SDK

## Document Information

| Field | Value |
|-------|-------|
| Status | Draft |
| Author | Agent365 Team |
| Created | 2026-02-02 |
| Last Updated | 2026-02-04 |

---

## 1. Problem Statement

### Current State

The Agent365 SDK currently relies on environment variables for all configuration settings. Configuration is read directly from `process.env` wherever needed throughout the codebase.

### Limitations

1. **No Multi-Tenant Support**: Settings are global and cannot vary per tenant/user
2. **No Programmatic Override**: Consumers cannot override settings without modifying environment variables
3. **Scattered Access**: `process.env` is accessed in 15+ locations across 4 packages
4. **Testing Friction**: Tests must manipulate `process.env` directly, risking pollution
5. **No Validation**: Settings are parsed at point-of-use with no centralized validation
6. **No Dynamic Resolution**: Settings cannot vary based on request context (e.g., async local storage)

### User Stories

1. **As a multi-tenant application developer**, I need different MCP endpoints per tenant so that each tenant can use their own infrastructure.

2. **As an SDK consumer**, I want to programmatically configure the SDK without relying on environment variables so that I can integrate with my existing configuration system.

3. **As a developer**, I want sensible defaults from environment variables so that simple deployments "just work" without code changes.

---

## 2. Configuration Inventory

### 2.1 Complete Settings Catalog

#### Core Runtime Settings

| Setting | Env Variable | Default | Type | Used In |
|---------|--------------|---------|------|---------|
| Cluster Category | `CLUSTER_CATEGORY` | `'prod'` | `ClusterCategory` | RuntimeConfiguration |

#### Tooling Settings

| Setting | Env Variable | Default | Type | Used In |
|---------|--------------|---------|------|---------|
| MCP Platform Endpoint | `MCP_PLATFORM_ENDPOINT` | `'https://agent365.svc.cloud.microsoft'` | `string` | ToolingConfiguration |
| MCP Platform Auth Scope | `MCP_PLATFORM_AUTHENTICATION_SCOPE` | `'ea9ffc3e-8a23-4a7d-836d-234d7c7565c1/.default'` | `string` | ToolingConfiguration |
| Use Tooling Manifest | `NODE_ENV` | `false` (true if NODE_ENV='development') | `boolean` | ToolingConfiguration |

#### Observability Settings

| Setting | Env Variable | Default | Type | Used In |
|---------|--------------|---------|------|---------|
| Observability Auth Scopes | `A365_OBSERVABILITY_SCOPES_OVERRIDE` | `['https://api.powerplatform.com/.default']` | `string[]` | ObservabilityConfiguration |
| Exporter Enabled | `ENABLE_A365_OBSERVABILITY_EXPORTER` | `false` | `boolean` | ObservabilityConfiguration |
| Per-Request Export | `ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT` | `false` | `boolean` | exporter/utils.ts |
| Use Custom Domain | `A365_OBSERVABILITY_USE_CUSTOM_DOMAIN` | `false` | `boolean` | exporter/utils.ts |
| Domain Override | `A365_OBSERVABILITY_DOMAIN_OVERRIDE` | `null` | `string \| null` | exporter/utils.ts |
| Log Level | `A365_OBSERVABILITY_LOG_LEVEL` | `'none'` | `string` | logging.ts |

#### Per-Request Processor Settings (Advanced)

| Setting | Env Variable | Default | Type | Used In |
|---------|--------------|---------|------|---------|
| Max Buffered Traces | `A365_PER_REQUEST_MAX_TRACES` | `1000` | `number` | PerRequestSpanProcessor.ts |
| Max Spans Per Trace | `A365_PER_REQUEST_MAX_SPANS_PER_TRACE` | `5000` | `number` | PerRequestSpanProcessor.ts |
| Max Concurrent Exports | `A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS` | `20` | `number` | PerRequestSpanProcessor.ts |

### 2.2 Hardcoded Constants (Not Configurable)

| Constant | Value | Location | Notes |
|----------|-------|----------|-------|
| HTTP Timeout | 30000ms | Agent365Exporter.ts | Export timeout |
| Max Retries | 3 | Agent365Exporter.ts | Export retries |
| Chat History Timeout | 10000ms | McpToolServerConfigurationService.ts | API timeout |
| Flush Grace Period | 250ms | PerRequestSpanProcessor.ts | Per-request |
| Max Trace Age | 30000ms | PerRequestSpanProcessor.ts | Per-request |
| Batch Queue Size | 2048 | Agent365ExporterOptions.ts | Batch processor |
| Batch Delay | 5000ms | Agent365ExporterOptions.ts | Batch processor |
| Max Batch Size | 512 | Agent365ExporterOptions.ts | Batch processor |

### 2.3 Settings Access Locations

```
packages/agents-a365-runtime/src/
├── environment-utils.ts          # 3 env vars (lines 30, 45, 70)
└── power-platform-api-discovery.ts # Uses getClusterCategory()

packages/agents-a365-tooling/src/
├── Utility.ts                    # 1 env var (line 156)
└── McpToolServerConfigurationService.ts # 1 env var (line 287)

packages/agents-a365-observability/src/
├── utils/logging.ts              # 1 env var (line 70)
├── tracing/exporter/utils.ts     # 4 env vars (lines 116, 129, 142, 168)
└── tracing/PerRequestSpanProcessor.ts # 3 env vars (lines 68-70)
```

---

## 3. Proposed Solution

### 3.1 Design Overview

Configuration is distributed across packages with an **inheritance-based** design. Each package defines only its own settings, and child configurations inherit from parent configurations.

**Key Design Choice**: Overrides are **functions** that are called on each property access. This enables:
- **Dynamic resolution**: Functions can read from async context (e.g., OpenTelemetry baggage) per-request
- **Multi-tenant support**: Different values returned based on current request context
- **Simpler implementation**: No caching/lazy evaluation needed

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Runtime Package                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  IConfigurationProvider<T>                                   │   │
│  │  (generic base interface)                                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  RuntimeConfiguration                                        │   │
│  │  - clusterCategory (calls override function or reads env)   │   │
│  │  - isDevelopmentEnvironment (derived)                       │   │
│  │  - mcpPlatformAuthScope (used by AgenticAuthenticationSvc)  │   │
│  │  - observabilityAuthScopes (used by AgenticTokenCache)      │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │ extends
        ┌─────────────────────┴─────────────────────┐
        ▼                                           ▼
┌─────────────────────────────┐     ┌─────────────────────────────┐
│     Tooling Package         │     │   Observability Package     │
│  ┌───────────────────────┐  │     │  ┌───────────────────────┐  │
│  │ ToolingConfiguration  │  │     │  │ ObservabilityConfig   │  │
│  │ extends Runtime       │  │     │  │ extends Runtime       │  │
│  │ + mcpPlatformEndpoint │  │     │  │ + exporterEnabled     │  │
│  └───────────────────────┘  │     │  │ + perRequestExport    │  │
│            │ extends        │     │  │ + customDomain        │  │
│            ▼                │     │  │ + domainOverride      │  │
│  ┌───────────────────────┐  │     │  │ + logLevel            │  │
│  │ OpenAIToolingConfig   │  │     │  └───────────────────────┘  │
│  │ + openAIModel         │  │     │                             │
│  │ + openAIApiKey        │  │     │                             │
│  └───────────────────────┘  │     │                             │
└─────────────────────────────┘     └─────────────────────────────┘
```

### 3.2 Core Components (Runtime Package)

#### IConfigurationProvider<T> Interface

```typescript
// packages/agents-a365-runtime/src/configuration/IConfigurationProvider.ts

/**
 * Generic interface for providing configuration.
 * Each package defines its own configuration type T.
 */
export interface IConfigurationProvider<T> {
  getConfiguration(): T;
}
```

#### RuntimeConfigurationOptions Type

```typescript
// packages/agents-a365-runtime/src/configuration/RuntimeConfigurationOptions.ts

import { ClusterCategory } from '../power-platform-api-discovery';

/**
 * Runtime configuration options - all optional functions.
 * Functions are called on each property access, enabling dynamic resolution.
 * Unset values fall back to environment variables.
 */
export type RuntimeConfigurationOptions = {
  clusterCategory?: () => ClusterCategory;
};
```

#### RuntimeConfiguration Class

```typescript
// packages/agents-a365-runtime/src/configuration/RuntimeConfiguration.ts

import { ClusterCategory } from '../power-platform-api-discovery';
import { RuntimeConfigurationOptions } from './RuntimeConfigurationOptions';

/**
 * Base configuration class for Agent365 SDK.
 * Other packages extend this to add their own settings.
 *
 * Override functions are called on each property access, enabling dynamic
 * resolution from async context (e.g., OpenTelemetry baggage) per-request.
 */
export class RuntimeConfiguration {
  protected readonly overrides: RuntimeConfigurationOptions;

  constructor(overrides?: RuntimeConfigurationOptions) {
    this.overrides = overrides ?? {};
  }

  get clusterCategory(): ClusterCategory {
    return this.overrides.clusterCategory?.()
      ?? (process.env.CLUSTER_CATEGORY?.toLowerCase() as ClusterCategory)
      ?? 'prod';
  }

  get isDevelopmentEnvironment(): boolean {
    return ['local', 'dev'].includes(this.clusterCategory);
  }

  get isNodeEnvDevelopment(): boolean {
    const nodeEnv = process.env.NODE_ENV ?? '';
    return nodeEnv.toLowerCase() === 'development';
  }
}
```

#### DefaultConfigurationProvider<T> Class

```typescript
// packages/agents-a365-runtime/src/configuration/DefaultConfigurationProvider.ts

import { IConfigurationProvider } from './IConfigurationProvider';
import { RuntimeConfiguration } from './RuntimeConfiguration';

/**
 * Default provider that returns environment-based configuration.
 * Use the static `instance` for shared access across the application.
 */
export class DefaultConfigurationProvider<T extends RuntimeConfiguration>
  implements IConfigurationProvider<T> {

  private readonly _configuration: T;

  constructor(factory: () => T) {
    this._configuration = factory();
  }

  getConfiguration(): T {
    return this._configuration;
  }
}

/**
 * Shared default provider for RuntimeConfiguration.
 */
export const defaultRuntimeConfigurationProvider =
  new DefaultConfigurationProvider(() => new RuntimeConfiguration());
```

### 3.3 Tooling Package Configuration

#### ToolingConfigurationOptions Type

```typescript
// packages/agents-a365-tooling/src/configuration/ToolingConfigurationOptions.ts

import { RuntimeConfigurationOptions } from '@microsoft/agents-a365-runtime';

/**
 * Tooling configuration options - extends runtime options.
 * All overrides are functions called on each property access.
 */
export type ToolingConfigurationOptions = RuntimeConfigurationOptions & {
  mcpPlatformEndpoint?: () => string;
  /**
   * Override for MCP platform authentication scope.
   * Falls back to MCP_PLATFORM_AUTHENTICATION_SCOPE env var, then production default.
   */
  mcpPlatformAuthenticationScope?: () => string;
  /**
   * Override for using local manifest vs gateway discovery.
   * Falls back to NODE_ENV === 'development' check.
   */
  useToolingManifest?: () => boolean;
};
```

#### ToolingConfiguration Class

```typescript
// packages/agents-a365-tooling/src/configuration/ToolingConfiguration.ts

import { RuntimeConfiguration } from '@microsoft/agents-a365-runtime';
import { ToolingConfigurationOptions } from './ToolingConfigurationOptions';

// Default MCP platform authentication scope
const PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE = 'ea9ffc3e-8a23-4a7d-836d-234d7c7565c1/.default';

/**
 * Configuration for tooling package.
 * Inherits runtime settings and adds tooling-specific settings.
 */
export class ToolingConfiguration extends RuntimeConfiguration {
  // Type-safe access to tooling overrides
  protected get toolingOverrides(): ToolingConfigurationOptions {
    return this.overrides as ToolingConfigurationOptions;
  }

  constructor(overrides?: ToolingConfigurationOptions) {
    super(overrides);
  }

  // Inherited: clusterCategory, isDevelopmentEnvironment, isNodeEnvDevelopment

  get mcpPlatformEndpoint(): string {
    return this.toolingOverrides.mcpPlatformEndpoint?.()
      ?? process.env.MCP_PLATFORM_ENDPOINT
      ?? 'https://agent365.svc.cloud.microsoft';
  }

  /**
   * Gets the MCP platform authentication scope.
   * Used by AgenticAuthenticationService for token exchange.
   */
  get mcpPlatformAuthenticationScope(): string {
    const override = this.toolingOverrides.mcpPlatformAuthenticationScope?.();
    if (override) return override;

    const envValue = process.env.MCP_PLATFORM_AUTHENTICATION_SCOPE;
    if (envValue) return envValue;

    return PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE;
  }

  /**
   * Whether to use the local ToolingManifest.json file instead of gateway discovery.
   * Returns true when NODE_ENV is set to 'development' (case-insensitive).
   */
  get useToolingManifest(): boolean {
    const override = this.toolingOverrides.useToolingManifest?.();
    if (override !== undefined) return override;
    return this.isNodeEnvDevelopment;
  }
}
```

#### Default Tooling Provider

```typescript
// packages/agents-a365-tooling/src/configuration/index.ts

import { DefaultConfigurationProvider } from '@microsoft/agents-a365-runtime';
import { ToolingConfiguration } from './ToolingConfiguration';

export const defaultToolingConfigurationProvider =
  new DefaultConfigurationProvider(() => new ToolingConfiguration());
```

### 3.4 Observability Package Configuration

#### ObservabilityConfigurationOptions Type

```typescript
// packages/agents-a365-observability/src/configuration/ObservabilityConfigurationOptions.ts

import { RuntimeConfigurationOptions } from '@microsoft/agents-a365-runtime';

/**
 * Observability configuration options - extends runtime options.
 * All overrides are functions called on each property access.
 */
export type ObservabilityConfigurationOptions = RuntimeConfigurationOptions & {
  /**
   * Override for observability authentication scopes.
   * Falls back to A365_OBSERVABILITY_SCOPES_OVERRIDE env var, then production default.
   */
  observabilityAuthenticationScopes?: () => string[];
  isObservabilityExporterEnabled?: () => boolean;
  isPerRequestExportEnabled?: () => boolean;
  useCustomDomainForObservability?: () => boolean;
  observabilityDomainOverride?: () => string | null;
  observabilityLogLevel?: () => string;
  // Per-Request Processor (Advanced)
  perRequestMaxTraces?: () => number;
  perRequestMaxSpansPerTrace?: () => number;
  perRequestMaxConcurrentExports?: () => number;
};
```

#### ObservabilityConfiguration Class

```typescript
// packages/agents-a365-observability/src/configuration/ObservabilityConfiguration.ts

import { RuntimeConfiguration } from '@microsoft/agents-a365-runtime';
import { ObservabilityConfigurationOptions } from './ObservabilityConfigurationOptions';

// Default observability authentication scope
const PROD_OBSERVABILITY_SCOPE = 'https://api.powerplatform.com/.default';

/**
 * Configuration for observability package.
 * Inherits runtime settings and adds observability-specific settings.
 */
export class ObservabilityConfiguration extends RuntimeConfiguration {
  protected get observabilityOverrides(): ObservabilityConfigurationOptions {
    return this.overrides as ObservabilityConfigurationOptions;
  }

  constructor(overrides?: ObservabilityConfigurationOptions) {
    super(overrides);
  }

  // Inherited: clusterCategory, isDevelopmentEnvironment, isNodeEnvDevelopment

  /**
   * Gets the observability authentication scopes.
   * Used by AgenticTokenCache for observability service authentication.
   */
  get observabilityAuthenticationScopes(): readonly string[] {
    const result = this.observabilityOverrides.observabilityAuthenticationScopes?.();
    if (result !== undefined) {
      return result;
    }
    const override = process.env.A365_OBSERVABILITY_SCOPES_OVERRIDE;
    if (override?.trim()) {
      return override.trim().split(/\s+/);
    }
    return [PROD_OBSERVABILITY_SCOPE];
  }

  get isObservabilityExporterEnabled(): boolean {
    const result = this.observabilityOverrides.isObservabilityExporterEnabled?.();
    if (result !== undefined) {
      return result;
    }
    const value = process.env.ENABLE_A365_OBSERVABILITY_EXPORTER?.toLowerCase() ?? '';
    return ['true', '1', 'yes', 'on'].includes(value);
  }

  get isPerRequestExportEnabled(): boolean {
    const result = this.observabilityOverrides.isPerRequestExportEnabled?.();
    if (result !== undefined) {
      return result;
    }
    const value = process.env.ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT?.toLowerCase() ?? '';
    return ['true', '1', 'yes', 'on'].includes(value);
  }

  get useCustomDomainForObservability(): boolean {
    const result = this.observabilityOverrides.useCustomDomainForObservability?.();
    if (result !== undefined) {
      return result;
    }
    const value = process.env.A365_OBSERVABILITY_USE_CUSTOM_DOMAIN?.toLowerCase() ?? '';
    return ['true', '1', 'yes', 'on'].includes(value);
  }

  get observabilityDomainOverride(): string | null {
    const result = this.observabilityOverrides.observabilityDomainOverride?.();
    if (result !== undefined) {
      return result;
    }
    const override = process.env.A365_OBSERVABILITY_DOMAIN_OVERRIDE;
    if (override?.trim()) {
      return override.trim().replace(/\/+$/, '');
    }
    return null;
  }

  get observabilityLogLevel(): string {
    return this.observabilityOverrides.observabilityLogLevel?.()
      ?? process.env.A365_OBSERVABILITY_LOG_LEVEL
      ?? 'none';
  }

  // Per-Request Processor settings
  get perRequestMaxTraces(): number {
    return this.observabilityOverrides.perRequestMaxTraces?.()
      ?? parseInt(process.env.A365_PER_REQUEST_MAX_TRACES ?? '1000', 10);
  }

  get perRequestMaxSpansPerTrace(): number {
    return this.observabilityOverrides.perRequestMaxSpansPerTrace?.()
      ?? parseInt(process.env.A365_PER_REQUEST_MAX_SPANS_PER_TRACE ?? '5000', 10);
  }

  get perRequestMaxConcurrentExports(): number {
    return this.observabilityOverrides.perRequestMaxConcurrentExports?.()
      ?? parseInt(process.env.A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS ?? '20', 10);
  }
}
```

### 3.5 Extension Package Example (OpenAI Tooling)

```typescript
// packages/agents-a365-tooling-extensions-openai/src/configuration/OpenAIToolingConfiguration.ts

import { ToolingConfiguration, ToolingConfigurationOptions } from '@microsoft/agents-a365-tooling';

export type OpenAIToolingConfigurationOptions = ToolingConfigurationOptions & {
  openAIModel?: () => string;
};

export class OpenAIToolingConfiguration extends ToolingConfiguration {
  protected get openAIToolingOverrides(): OpenAIToolingConfigurationOptions {
    return this.overrides as OpenAIToolingConfigurationOptions;
  }

  constructor(overrides?: OpenAIToolingConfigurationOptions) {
    super(overrides);
  }

  // Inherited: clusterCategory, isDevelopmentEnvironment, isNodeEnvDevelopment, mcpPlatformEndpoint, mcpPlatformAuthenticationScope, useToolingManifest

  get openAIModel(): string {
    return this.openAIToolingOverrides.openAIModel?.()
      ?? process.env.OPENAI_MODEL
      ?? 'gpt-4';
  }
}
```

### 3.6 Usage Examples

```typescript
// Simple case - all from environment variables
const config = new ToolingConfiguration();
console.log(config.clusterCategory);      // From runtime (inherited)
console.log(config.mcpPlatformEndpoint);  // From tooling

// With static overrides - wrap values in arrow functions
const config = new OpenAIToolingConfiguration({
  clusterCategory: () => 'gov',                    // Runtime setting
  mcpPlatformEndpoint: () => 'https://custom',     // Tooling setting
  openAIModel: () => 'gpt-4-turbo'                 // OpenAI setting
});

// Dynamic overrides - read from async context per-request
import { context } from '@opentelemetry/api';

const TENANT_CONFIG_KEY = context.createKey('tenant-config');

const config = new ToolingConfiguration({
  clusterCategory: () => {
    const tenantConfig = context.active().getValue(TENANT_CONFIG_KEY);
    return tenantConfig?.clusterCategory ?? 'prod';
  },
  mcpPlatformEndpoint: () => {
    const tenantConfig = context.active().getValue(TENANT_CONFIG_KEY);
    return tenantConfig?.mcpEndpoint ?? 'https://agent365.svc.cloud.microsoft';
  }
});

// Inject into services
class McpToolServerConfigurationService {
  constructor(
    private readonly configProvider: IConfigurationProvider<ToolingConfiguration> =
      defaultToolingConfigurationProvider
  ) {}

  private get config(): ToolingConfiguration {
    return this.configProvider.getConfiguration();
  }

  private isDevScenario(): boolean {
    return this.config.isDevelopmentEnvironment;  // From inherited RuntimeConfiguration
  }

  private getMcpPlatformBaseUrl(): string {
    return this.config.mcpPlatformEndpoint;       // From ToolingConfiguration
  }
}
```

### 3.7 File Structure Per Package

```
packages/agents-a365-runtime/src/
├── configuration/
│   ├── index.ts
│   ├── IConfigurationProvider.ts
│   ├── RuntimeConfigurationOptions.ts
│   ├── RuntimeConfiguration.ts
│   └── DefaultConfigurationProvider.ts
└── index.ts  # Add: export * from './configuration'

packages/agents-a365-tooling/src/
├── configuration/
│   ├── index.ts
│   ├── ToolingConfigurationOptions.ts
│   └── ToolingConfiguration.ts
└── index.ts  # Add: export * from './configuration'

packages/agents-a365-observability/src/
├── configuration/
│   ├── index.ts
│   ├── ObservabilityConfigurationOptions.ts
│   └── ObservabilityConfiguration.ts
└── index.ts  # Add: export * from './configuration'

packages/agents-a365-tooling-extensions-openai/src/
├── configuration/
│   ├── index.ts
│   ├── OpenAIToolingConfigurationOptions.ts
│   └── OpenAIToolingConfiguration.ts
└── index.ts  # Add: export * from './configuration'
```

### 3.8 Key Design Benefits

| Aspect | Benefit |
|--------|---------|
| **Inheritance** | Child configs automatically have all parent settings |
| **Package ownership** | Each package defines only its own settings |
| **Single options object** | All overrides passed to constructor at once |
| **Type-safe** | Options types extend each other |
| **Dynamic resolution** | Functions called on each access - can read from async context |
| **Multi-tenant support** | Different values returned based on current request context |
| **Env var fallback** | Works out of the box without any overrides |
| **Testable** | Can override any setting for testing |
| **Simple implementation** | No caching/lazy evaluation complexity |

---

## 4. Implementation Strategy

### Phase 1: Establish Test Coverage Baseline (Pre-Implementation)

**Goal**: Achieve comprehensive test coverage for all existing settings-related code BEFORE making changes.

#### 4.1.1 Current Test Coverage Gaps

| Area | Current Coverage | Target | Gap |
|------|-----------------|--------|-----|
| environment-utils.ts | 95% | 100% | Minor edge cases |
| McpToolServerConfigurationService (dev mode) | 85% | 100% | Error scenarios |
| McpToolServerConfigurationService (prod mode) | 10% | 80% | Gateway discovery |
| exporter/utils.ts | 80% | 100% | Boolean parsing variants |
| logging.ts | 0% | 100% | **CRITICAL - No tests exist** |
| PerRequestSpanProcessor settings | 0% | 80% | Env var parsing |

#### 4.1.2 New Test Files Required

1. **`tests/observability/utils/logging.test.ts`** (NEW)
   - Log level parsing with all valid values
   - Pipe-separated combinations (`info|warn|error`)
   - Invalid/malformed values
   - Default value when not set

2. **`tests/observability/tracing/exporter-utils.test.ts`** (NEW)
   - `isAgent365ExporterEnabled()` with all boolean variants
   - `isPerRequestExportEnabled()` with all boolean variants
   - `useCustomDomainForObservability()` edge cases
   - `getAgent365ObservabilityDomainOverride()` edge cases
   - `resolveAgent365Endpoint()` for all cluster categories

3. **`tests/observability/tracing/per-request-span-processor.test.ts`** (EXPAND)
   - Environment variable parsing for all 3 settings
   - Default values when not set
   - Invalid numeric values

4. **`tests/tooling/mcp-tool-server-configuration-service.test.ts`** (EXPAND)
   - Production mode gateway discovery (mock HTTP)
   - Invalid JSON manifest handling
   - Network timeout scenarios

#### 4.1.3 Test Patterns to Follow

```typescript
// Standard environment variable test setup
const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

// Parameterized boolean parsing tests
describe('isAgent365ExporterEnabled', () => {
  it.each([
    { value: 'true', expected: true },
    { value: 'TRUE', expected: true },
    { value: '1', expected: true },
    { value: 'yes', expected: true },
    { value: 'YES', expected: true },
    { value: 'on', expected: true },
    { value: 'ON', expected: true },
    { value: 'false', expected: false },
    { value: '0', expected: false },
    { value: '', expected: false },
    { value: undefined, expected: false },
  ])('returns $expected when env var is "$value"', ({ value, expected }) => {
    if (value !== undefined) {
      process.env.ENABLE_A365_OBSERVABILITY_EXPORTER = value;
    } else {
      delete process.env.ENABLE_A365_OBSERVABILITY_EXPORTER;
    }
    expect(isAgent365ExporterEnabled()).toBe(expected);
  });
});
```

### Phase 2: Implement Configuration Classes

**Goal**: Implement the new configuration system in each package without breaking existing functionality.

#### 4.2.1 Implementation Order (by dependency)

**Step 1: Runtime Package (Foundation)**

Create configuration module in `agents-a365-runtime`:
- `IConfigurationProvider.ts` - Generic provider interface
- `RuntimeConfigurationOptions.ts` - Options type (functions)
- `RuntimeConfiguration.ts` - Base configuration class
- `DefaultConfigurationProvider.ts` - Default provider implementation
- `index.ts` - Re-exports

Write unit tests:
- `tests/runtime/configuration/RuntimeConfiguration.test.ts`
- `tests/runtime/configuration/DefaultConfigurationProvider.test.ts`

**Step 2: Tooling Package**

Create configuration module in `agents-a365-tooling`:
- `ToolingConfigurationOptions.ts` - Extends `RuntimeConfigurationOptions`
- `ToolingConfiguration.ts` - Extends `RuntimeConfiguration`
- `index.ts` - Re-exports + default provider

Write unit tests:
- `tests/tooling/configuration/ToolingConfiguration.test.ts`

**Step 3: Observability Package**

Create configuration module in `agents-a365-observability`:
- `ObservabilityConfigurationOptions.ts` - Extends `RuntimeConfigurationOptions`
- `ObservabilityConfiguration.ts` - Extends `RuntimeConfiguration`
- `index.ts` - Re-exports + default provider

Write unit tests:
- `tests/observability/configuration/ObservabilityConfiguration.test.ts`

**Step 4: Extension Packages (as needed)**

Create configuration in each extension package that extends parent:
- `agents-a365-tooling-extensions-openai`: `OpenAIToolingConfiguration extends ToolingConfiguration`
- `agents-a365-tooling-extensions-langchain`: `LangChainToolingConfiguration extends ToolingConfiguration`
- `agents-a365-tooling-extensions-claude`: `ClaudeToolingConfiguration extends ToolingConfiguration`

#### 4.2.2 Build Verification

After each step:
1. Run `pnpm build` to verify no compilation errors
2. Run `pnpm test` to verify new tests pass
3. Verify exports are correctly exposed

### Phase 3: Uptake in Codebase

**Goal**: Migrate existing code to use configuration provider while maintaining backward compatibility.

#### 4.3.1 Migration Order

```
1. agents-a365-runtime
   └── environment-utils.ts - Deprecate functions, delegate to RuntimeConfiguration

2. agents-a365-tooling
   ├── Utility.ts - Deprecate URL construction methods (use McpToolServerConfigurationService instead)
   └── McpToolServerConfigurationService.ts - Accept IConfigurationProvider<ToolingConfiguration>

3. agents-a365-observability
   ├── utils/logging.ts - Use ObservabilityConfiguration
   ├── tracing/exporter/utils.ts - Use ObservabilityConfiguration
   ├── tracing/PerRequestSpanProcessor.ts - Use ObservabilityConfiguration
   └── ObservabilityBuilder.ts - Accept IConfigurationProvider<ObservabilityConfiguration>

4. Extension packages
   ├── agents-a365-tooling-extensions-langchain - Accept IConfigurationProvider
   ├── agents-a365-tooling-extensions-openai - Accept IConfigurationProvider
   └── agents-a365-tooling-extensions-claude - Accept IConfigurationProvider
```

#### 4.3.2 Migration Pattern for Utility Functions

**Before (environment-utils.ts):**
```typescript
export function getClusterCategory(): string {
  const clusterCategory = process.env.CLUSTER_CATEGORY;
  if (!clusterCategory) {
    return 'prod';
  }
  return clusterCategory.toLowerCase();
}
```

**After (Backward Compatible - delegates to configuration):**
```typescript
import { defaultRuntimeConfigurationProvider } from './configuration';

/**
 * @deprecated Use RuntimeConfiguration.clusterCategory instead
 */
export function getClusterCategory(): ClusterCategory {
  return defaultRuntimeConfigurationProvider.getConfiguration().clusterCategory;
}
```

#### 4.3.3 Migration Pattern for Services

**Before (McpToolServerConfigurationService):**
```typescript
class McpToolServerConfigurationService {
  private isDevScenario(): boolean {
    const environment = process.env.NODE_ENV || '';
    return environment.toLowerCase() === 'development';
  }

  private getMcpPlatformBaseUrl(): string {
    return process.env.MCP_PLATFORM_ENDPOINT ?? 'https://agent365.svc.cloud.microsoft';
  }
}
```

**After:**
```typescript
import { defaultToolingConfigurationProvider } from './configuration';

class McpToolServerConfigurationService {
  private isDevScenario(): boolean {
    return defaultToolingConfigurationProvider.getConfiguration().useToolingManifest;
  }
}
```

Note: `useToolingManifest` is a ToolingConfiguration property that checks `NODE_ENV === 'development'`.

#### 4.3.4 Migration Pattern for Observability

**Before (exporter/utils.ts):**
```typescript
export function isAgent365ExporterEnabled(): boolean {
  const value = process.env.ENABLE_A365_OBSERVABILITY_EXPORTER?.toLowerCase() ?? '';
  return ['true', '1', 'yes', 'on'].includes(value);
}
```

**After:**
```typescript
import { defaultObservabilityConfigurationProvider } from '../configuration';

/**
 * @deprecated Use ObservabilityConfiguration.isObservabilityExporterEnabled instead
 */
export function isAgent365ExporterEnabled(): boolean {
  return defaultObservabilityConfigurationProvider.getConfiguration().isObservabilityExporterEnabled;
}
```

### Phase 4: Verify and Enforce

**Goal**: Ensure all existing tests pass and prevent future direct `process.env` access.

1. Run full test suite: `pnpm test`
2. Run integration tests: `pnpm test:integration`
3. Verify test coverage hasn't decreased: `pnpm test:coverage`
4. Verify no `process.env` reads remain outside configuration classes:
   ```bash
   # Should return 0 matches (excluding configuration/ directories)
   grep -r "process\.env" packages/*/src --include="*.ts" | grep -v "/configuration/"
   ```
5. **Add ESLint rule** to `eslint.config.mjs` to prevent future violations (see Section 7.1)

### Phase 5: Add Configuration Provider Tests

**Goal**: Add tests specifically for the new configuration override capabilities.

#### New Test Scenarios

```typescript
// Runtime Configuration Tests
describe('RuntimeConfiguration', () => {
  it('should use override function when provided', () => {
    const config = new RuntimeConfiguration({ clusterCategory: () => 'gov' });
    expect(config.clusterCategory).toBe('gov');
  });

  it('should fall back to env var when override not provided', () => {
    process.env.CLUSTER_CATEGORY = 'dev';
    const config = new RuntimeConfiguration({});
    expect(config.clusterCategory).toBe('dev');
  });

  it('should fall back to default when neither override nor env var', () => {
    delete process.env.CLUSTER_CATEGORY;
    const config = new RuntimeConfiguration({});
    expect(config.clusterCategory).toBe('prod');
  });

  it('should call override function on each access (dynamic resolution)', () => {
    let callCount = 0;
    const config = new RuntimeConfiguration({
      clusterCategory: () => {
        callCount++;
        return 'gov';
      }
    });
    config.clusterCategory;
    config.clusterCategory;
    expect(callCount).toBe(2); // Called twice, not cached
  });

  it('should support dynamic values from async context', () => {
    let currentTenant = 'tenant-a';
    const tenantConfigs = {
      'tenant-a': 'prod',
      'tenant-b': 'gov'
    };
    const config = new RuntimeConfiguration({
      clusterCategory: () => tenantConfigs[currentTenant] as ClusterCategory
    });

    expect(config.clusterCategory).toBe('prod');
    currentTenant = 'tenant-b';
    expect(config.clusterCategory).toBe('gov'); // Dynamic!
  });

  it('should derive isDevelopmentEnvironment from clusterCategory', () => {
    expect(new RuntimeConfiguration({ clusterCategory: () => 'local' }).isDevelopmentEnvironment).toBe(true);
    expect(new RuntimeConfiguration({ clusterCategory: () => 'dev' }).isDevelopmentEnvironment).toBe(true);
    expect(new RuntimeConfiguration({ clusterCategory: () => 'prod' }).isDevelopmentEnvironment).toBe(false);
  });
});

// Tooling Configuration Tests (Inheritance)
describe('ToolingConfiguration', () => {
  it('should inherit runtime settings', () => {
    const config = new ToolingConfiguration({ clusterCategory: () => 'gov' });
    expect(config.clusterCategory).toBe('gov');
    expect(config.isDevelopmentEnvironment).toBe(false);
  });

  it('should have tooling-specific settings', () => {
    const config = new ToolingConfiguration({ mcpPlatformEndpoint: () => 'https://custom.endpoint' });
    expect(config.mcpPlatformEndpoint).toBe('https://custom.endpoint');
  });

  it('should allow overriding both runtime and tooling settings', () => {
    const config = new ToolingConfiguration({
      clusterCategory: () => 'dev',
      mcpPlatformEndpoint: () => 'https://dev.endpoint'
    });
    expect(config.clusterCategory).toBe('dev');
    expect(config.isDevelopmentEnvironment).toBe(true);
    expect(config.mcpPlatformEndpoint).toBe('https://dev.endpoint');
  });
});

// Observability Configuration Tests (Inheritance)
describe('ObservabilityConfiguration', () => {
  it('should inherit runtime settings', () => {
    const config = new ObservabilityConfiguration({ clusterCategory: () => 'gov' });
    expect(config.clusterCategory).toBe('gov');
  });

  it('should have observability-specific settings', () => {
    const config = new ObservabilityConfiguration({ isObservabilityExporterEnabled: () => true });
    expect(config.isObservabilityExporterEnabled).toBe(true);
  });
});
```

---

## 5. Test Coverage Requirements

### 5.1 Phase 1 Completion Criteria

Before implementing the configuration provider:

| Test File | Required Tests | Status |
|-----------|---------------|--------|
| `logging.test.ts` | 12+ test cases | ⬜ Not started |
| `exporter-utils.test.ts` | 20+ test cases | ⬜ Not started |
| `per-request-span-processor.test.ts` | 8+ test cases | ⬜ Not started |
| `mcp-tool-server-configuration-service.test.ts` | 5+ additional cases | ⬜ Not started |
| `environment-utils.test.ts` | 3+ edge cases | ⬜ Not started |

### 5.2 Phase 2-5 Test Requirements

**Runtime Package:**

| Component | Required Coverage |
|-----------|------------------|
| `RuntimeConfiguration.ts` | 100% |
| `RuntimeConfigurationOptions.ts` | N/A (type only) |
| `IConfigurationProvider.ts` | N/A (interface only) |
| `DefaultConfigurationProvider.ts` | 100% |

**Tooling Package:**

| Component | Required Coverage |
|-----------|------------------|
| `ToolingConfiguration.ts` | 100% |
| `ToolingConfigurationOptions.ts` | N/A (type only) |

**Observability Package:**

| Component | Required Coverage |
|-----------|------------------|
| `ObservabilityConfiguration.ts` | 100% |
| `ObservabilityConfigurationOptions.ts` | N/A (type only) |
| `IConfigurationProvider.ts` | N/A (interface only) |
| `DefaultConfigurationProvider.ts` | 100% |
| Integration with existing services | All existing tests pass |

---

## 6. Rollout Plan

### 6.1 Breaking Changes

**None** - This is a backward-compatible enhancement:
- All existing code continues to work (uses `DefaultConfigurationProvider.instance`)
- Environment variables continue to be the default source
- New `IConfigurationProvider` parameter is optional everywhere

### 6.2 Documentation Updates

1. Update `CLAUDE.md` with new configuration pattern
2. Update `docs/design.md` with configuration architecture
3. Add inline documentation to all new classes
4. Create migration guide for consumers wanting custom providers

### 6.3 Version Considerations

- This is a **minor version** bump (adds functionality, no breaking changes)
- Deprecation warnings: None needed initially
- Future: Consider deprecating direct `process.env` access in favor of configuration provider

---

## 7. Success Metrics

| Metric | Target |
|--------|--------|
| All existing tests pass | 100% |
| New configuration code coverage | 100% |
| Overall settings-related coverage | >95% |
| Breaking changes | 0 |
| Multi-tenant scenario supported | Yes |
| `process.env` reads outside configuration classes | **0** |

### 7.1 Code Quality Enforcement

**Critical Success Criteria**: No direct `process.env` reads outside of configuration classes.

To enforce this, add an ESLint rule to prevent future violations:

```javascript
// eslint.config.mjs
{
  rules: {
    'no-restricted-properties': [
      'error',
      {
        object: 'process',
        property: 'env',
        message: 'Use configuration classes instead of direct process.env access.'
      }
    ],
    // Prevent usage of deprecated methods - causes compile-time errors
    '@typescript-eslint/no-deprecated': 'error'
  },
  overrides: [
    {
      files: ['**/configuration/**/*.ts'],
      rules: {
        'no-restricted-properties': 'off'  // Allow in configuration classes
      }
    },
    {
      files: ['**/tests/**/*.ts', '**/tests-agent/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
      rules: {
        'no-restricted-properties': 'off',  // Allow in test files and samples
        '@typescript-eslint/no-deprecated': 'off'  // Allow deprecated usage in tests
      }
    },
    {
      files: ['**/agents-a365-tooling/src/Utility.ts'],
      rules: {
        '@typescript-eslint/no-deprecated': 'off'  // Allow internal deprecated calls
      }
    }
  ]
}
```

**Note**: The `no-restricted-properties` rule catches the common `process.env.SOMETHING` pattern but won't catch destructuring (`const { env } = process`) or indirect access. These edge cases are unlikely to occur accidentally.

**Status (Updated 2026-02-04)**: Both ESLint rules have been implemented and are actively enforcing restrictions:
- `environment-utils.ts`: Now delegates to configuration classes
- `McpToolServerConfigurationService.ts`: Now uses `ToolingConfiguration.useToolingManifest`
- `Utility.ts`: URL construction methods are deprecated (use `McpToolServerConfigurationService` instead)

### 7.2 Deprecated Utility Methods

The following `Utility` class methods are deprecated and will cause ESLint errors if used in source code:

| Method | Replacement |
|--------|-------------|
| `GetToolingGatewayForDigitalWorker()` | `McpToolServerConfigurationService.listToolServers()` |
| `GetMcpBaseUrl()` | Use `McpToolServerConfigurationService` |
| `BuildMcpServerUrl()` | Use `McpToolServerConfigurationService` |
| `GetChatHistoryEndpoint()` | `McpToolServerConfigurationService.sendChatHistory()` |

These methods remain available for backward compatibility but should not be used in new code.

---

## 8. Resolved Design Decisions

| Question | Decision |
|----------|----------|
| Override values or functions? | **Functions only** - Enables dynamic resolution from async context |
| Caching/lazy evaluation? | **No caching** - Functions called on each access for multi-tenant support |
| Should we add validation? | **No** - Keep current behavior |
| Should hardcoded constants become configurable? | **No** - Keep as hardcoded constants |
| Per-request processor settings? | **Include from start** - Maintain consistency |
| Deprecation strategy for utility functions? | **Remove immediately** - Functions not expected to be used by customers |
| Extension packages configuration? | **Create from start** - Makes it easier to add settings later |

---

## 9. Appendix: Complete Environment Variable Reference

| Variable | Type | Default | Category |
|----------|------|---------|----------|
| `CLUSTER_CATEGORY` | string | `'prod'` | runtime |
| `MCP_PLATFORM_ENDPOINT` | string | `'https://agent365...'` | tooling |
| `MCP_PLATFORM_AUTHENTICATION_SCOPE` | string | `'ea9ffc3e-...'` | tooling |
| `NODE_ENV` | string | `''` | tooling (useToolingManifest) |
| `A365_OBSERVABILITY_SCOPES_OVERRIDE` | string (space-sep) | prod scope | observability |
| `ENABLE_A365_OBSERVABILITY_EXPORTER` | boolean | `false` | observability |
| `ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT` | boolean | `false` | observability |
| `A365_OBSERVABILITY_USE_CUSTOM_DOMAIN` | boolean | `false` | observability |
| `A365_OBSERVABILITY_DOMAIN_OVERRIDE` | string | `null` | observability |
| `A365_OBSERVABILITY_LOG_LEVEL` | string | `'none'` | observability |
| `A365_PER_REQUEST_MAX_TRACES` | number | `1000` | observability |
| `A365_PER_REQUEST_MAX_SPANS_PER_TRACE` | number | `5000` | observability |
| `A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS` | number | `20` | observability |
