# PRD: Configuration Provider for Agent365 SDK

## Document Information

| Field | Value |
|-------|-------|
| Status | Draft |
| Author | Agent365 Team |
| Created | 2026-02-02 |
| Last Updated | 2026-02-03 |

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
6. **No Lazy Loading**: Some settings are read repeatedly instead of cached

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
| Cluster Category | `CLUSTER_CATEGORY` | `'prod'` | `ClusterCategory` | environment-utils.ts |
| Development Mode | `NODE_ENV` | `''` (prod) | `string` | McpToolServerConfigurationService.ts |

#### Tooling Settings

| Setting | Env Variable | Default | Type | Used In |
|---------|--------------|---------|------|---------|
| MCP Platform Endpoint | `MCP_PLATFORM_ENDPOINT` | `'https://agent365.svc.cloud.microsoft'` | `string` | Utility.ts |
| MCP Platform Auth Scope | `MCP_PLATFORM_AUTHENTICATION_SCOPE` | `'ea9ffc3e-8a23-4a7d-836d-234d7c7565c1/.default'` | `string` | environment-utils.ts |

#### Observability Settings

| Setting | Env Variable | Default | Type | Used In |
|---------|--------------|---------|------|---------|
| Observability Auth Scopes | `A365_OBSERVABILITY_SCOPES_OVERRIDE` | `['https://api.powerplatform.com/.default']` | `string[]` | environment-utils.ts |
| Exporter Enabled | `ENABLE_A365_OBSERVABILITY_EXPORTER` | `false` | `boolean` | exporter/utils.ts |
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

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Runtime Package                              │
│  ┌─────────────────┐  ┌─────────────────────────────────────────┐  │
│  │  Lazy<T>        │  │  IConfigurationProvider<T>              │  │
│  │  (utility)      │  │  (generic base interface)               │  │
│  └─────────────────┘  └─────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  RuntimeConfiguration                                        │   │
│  │  - clusterCategory                                          │   │
│  │  - isDevelopmentEnvironment                                 │   │
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
│  │ + mcpPlatformEndpoint │  │     │  │ + authScopes          │  │
│  │ + mcpPlatformAuthScope│  │     │  │ + exporterEnabled     │  │
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

#### Lazy<T> Utility Class

```typescript
// packages/agents-a365-runtime/src/configuration/Lazy.ts

/**
 * Lazy evaluation wrapper - computes value on first access, then caches.
 */
export class Lazy<T> {
  private _value?: T;
  private _evaluated = false;

  constructor(private readonly factory: () => T) {}

  get value(): T {
    if (!this._evaluated) {
      this._value = this.factory();
      this._evaluated = true;
    }
    return this._value as T;
  }
}
```

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
 * Runtime configuration options - all optional.
 * Unset values fall back to environment variables.
 */
export type RuntimeConfigurationOptions = {
  clusterCategory?: ClusterCategory;
};
```

#### RuntimeConfiguration Class

```typescript
// packages/agents-a365-runtime/src/configuration/RuntimeConfiguration.ts

import { ClusterCategory } from '../power-platform-api-discovery';
import { RuntimeConfigurationOptions } from './RuntimeConfigurationOptions';
import { Lazy } from './Lazy';

/**
 * Base configuration class for Agent365 SDK.
 * Other packages extend this to add their own settings.
 */
export class RuntimeConfiguration {
  protected readonly overrides: RuntimeConfigurationOptions;

  private readonly _clusterCategory = new Lazy<ClusterCategory>(() =>
    this.overrides.clusterCategory
      ?? (process.env.CLUSTER_CATEGORY?.toLowerCase() as ClusterCategory)
      ?? 'prod'
  );

  constructor(overrides?: RuntimeConfigurationOptions) {
    this.overrides = overrides ?? {};
  }

  get clusterCategory(): ClusterCategory {
    return this._clusterCategory.value;
  }

  get isDevelopmentEnvironment(): boolean {
    return ['local', 'dev'].includes(this.clusterCategory);
  }
}
```

#### DefaultConfigurationProvider<T> Class

```typescript
// packages/agents-a365-runtime/src/configuration/DefaultConfigurationProvider.ts

import { IConfigurationProvider } from './IConfigurationProvider';
import { RuntimeConfiguration } from './RuntimeConfiguration';
import { Lazy } from './Lazy';

/**
 * Default provider that returns environment-based configuration.
 * Use the static `instance` for shared access across the application.
 */
export class DefaultConfigurationProvider<T extends RuntimeConfiguration>
  implements IConfigurationProvider<T> {

  private readonly _configuration: Lazy<T>;

  constructor(factory: () => T) {
    this._configuration = new Lazy(factory);
  }

  getConfiguration(): T {
    return this._configuration.value;
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
 */
export type ToolingConfigurationOptions = RuntimeConfigurationOptions & {
  mcpPlatformEndpoint?: string;
  mcpPlatformAuthenticationScope?: string;
};
```

#### ToolingConfiguration Class

```typescript
// packages/agents-a365-tooling/src/configuration/ToolingConfiguration.ts

import { RuntimeConfiguration, Lazy } from '@microsoft/agents-a365-runtime';
import { ToolingConfigurationOptions } from './ToolingConfigurationOptions';

/**
 * Configuration for tooling package.
 * Inherits runtime settings and adds tooling-specific settings.
 */
export class ToolingConfiguration extends RuntimeConfiguration {
  // Type-safe access to tooling overrides
  protected get toolingOverrides(): ToolingConfigurationOptions {
    return this.overrides as ToolingConfigurationOptions;
  }

  private readonly _mcpPlatformEndpoint = new Lazy<string>(() =>
    this.toolingOverrides.mcpPlatformEndpoint
      ?? process.env.MCP_PLATFORM_ENDPOINT
      ?? 'https://agent365.svc.cloud.microsoft'
  );

  private readonly _mcpPlatformAuthenticationScope = new Lazy<string>(() =>
    this.toolingOverrides.mcpPlatformAuthenticationScope
      ?? process.env.MCP_PLATFORM_AUTHENTICATION_SCOPE
      ?? 'ea9ffc3e-8a23-4a7d-836d-234d7c7565c1/.default'
  );

  constructor(overrides?: ToolingConfigurationOptions) {
    super(overrides);
  }

  // Inherited: clusterCategory, isDevelopmentEnvironment

  get mcpPlatformEndpoint(): string {
    return this._mcpPlatformEndpoint.value;
  }

  get mcpPlatformAuthenticationScope(): string {
    return this._mcpPlatformAuthenticationScope.value;
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
 */
export type ObservabilityConfigurationOptions = RuntimeConfigurationOptions & {
  observabilityAuthenticationScopes?: string[];
  isObservabilityExporterEnabled?: boolean;
  isPerRequestExportEnabled?: boolean;
  useCustomDomainForObservability?: boolean;
  observabilityDomainOverride?: string | null;
  observabilityLogLevel?: string;
  // Per-Request Processor (Advanced)
  perRequestMaxTraces?: number;
  perRequestMaxSpansPerTrace?: number;
  perRequestMaxConcurrentExports?: number;
};
```

#### ObservabilityConfiguration Class

```typescript
// packages/agents-a365-observability/src/configuration/ObservabilityConfiguration.ts

import { RuntimeConfiguration, Lazy } from '@microsoft/agents-a365-runtime';
import { ObservabilityConfigurationOptions } from './ObservabilityConfigurationOptions';

/**
 * Configuration for observability package.
 * Inherits runtime settings and adds observability-specific settings.
 */
export class ObservabilityConfiguration extends RuntimeConfiguration {
  protected get observabilityOverrides(): ObservabilityConfigurationOptions {
    return this.overrides as ObservabilityConfigurationOptions;
  }

  private readonly _observabilityAuthenticationScopes = new Lazy<readonly string[]>(() => {
    if (this.observabilityOverrides.observabilityAuthenticationScopes !== undefined) {
      return this.observabilityOverrides.observabilityAuthenticationScopes;
    }
    const override = process.env.A365_OBSERVABILITY_SCOPES_OVERRIDE;
    if (override?.trim()) {
      return override.trim().split(/\s+/);
    }
    return ['https://api.powerplatform.com/.default'];
  });

  private readonly _isObservabilityExporterEnabled = new Lazy<boolean>(() => {
    if (this.observabilityOverrides.isObservabilityExporterEnabled !== undefined) {
      return this.observabilityOverrides.isObservabilityExporterEnabled;
    }
    const value = process.env.ENABLE_A365_OBSERVABILITY_EXPORTER?.toLowerCase() ?? '';
    return ['true', '1', 'yes', 'on'].includes(value);
  });

  private readonly _isPerRequestExportEnabled = new Lazy<boolean>(() => {
    if (this.observabilityOverrides.isPerRequestExportEnabled !== undefined) {
      return this.observabilityOverrides.isPerRequestExportEnabled;
    }
    const value = process.env.ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT?.toLowerCase() ?? '';
    return ['true', '1', 'yes', 'on'].includes(value);
  });

  private readonly _useCustomDomainForObservability = new Lazy<boolean>(() => {
    if (this.observabilityOverrides.useCustomDomainForObservability !== undefined) {
      return this.observabilityOverrides.useCustomDomainForObservability;
    }
    const value = process.env.A365_OBSERVABILITY_USE_CUSTOM_DOMAIN?.toLowerCase() ?? '';
    return ['true', '1', 'yes', 'on'].includes(value);
  });

  private readonly _observabilityDomainOverride = new Lazy<string | null>(() => {
    if (this.observabilityOverrides.observabilityDomainOverride !== undefined) {
      return this.observabilityOverrides.observabilityDomainOverride;
    }
    const override = process.env.A365_OBSERVABILITY_DOMAIN_OVERRIDE;
    if (override?.trim()) {
      return override.trim().replace(/\/+$/, '');
    }
    return null;
  });

  private readonly _observabilityLogLevel = new Lazy<string>(() =>
    this.observabilityOverrides.observabilityLogLevel
      ?? process.env.A365_OBSERVABILITY_LOG_LEVEL
      ?? 'none'
  );

  // Per-Request Processor settings
  private readonly _perRequestMaxTraces = new Lazy<number>(() =>
    this.observabilityOverrides.perRequestMaxTraces
      ?? parseInt(process.env.A365_PER_REQUEST_MAX_TRACES ?? '1000', 10)
  );

  private readonly _perRequestMaxSpansPerTrace = new Lazy<number>(() =>
    this.observabilityOverrides.perRequestMaxSpansPerTrace
      ?? parseInt(process.env.A365_PER_REQUEST_MAX_SPANS_PER_TRACE ?? '5000', 10)
  );

  private readonly _perRequestMaxConcurrentExports = new Lazy<number>(() =>
    this.observabilityOverrides.perRequestMaxConcurrentExports
      ?? parseInt(process.env.A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS ?? '20', 10)
  );

  constructor(overrides?: ObservabilityConfigurationOptions) {
    super(overrides);
  }

  // Inherited: clusterCategory, isDevelopmentEnvironment

  get observabilityAuthenticationScopes(): readonly string[] {
    return this._observabilityAuthenticationScopes.value;
  }
  get isObservabilityExporterEnabled(): boolean {
    return this._isObservabilityExporterEnabled.value;
  }
  get isPerRequestExportEnabled(): boolean {
    return this._isPerRequestExportEnabled.value;
  }
  get useCustomDomainForObservability(): boolean {
    return this._useCustomDomainForObservability.value;
  }
  get observabilityDomainOverride(): string | null {
    return this._observabilityDomainOverride.value;
  }
  get observabilityLogLevel(): string {
    return this._observabilityLogLevel.value;
  }
  get perRequestMaxTraces(): number {
    return this._perRequestMaxTraces.value;
  }
  get perRequestMaxSpansPerTrace(): number {
    return this._perRequestMaxSpansPerTrace.value;
  }
  get perRequestMaxConcurrentExports(): number {
    return this._perRequestMaxConcurrentExports.value;
  }
}
```

### 3.5 Extension Package Example (OpenAI Tooling)

```typescript
// packages/agents-a365-tooling-extensions-openai/src/configuration/OpenAIToolingConfiguration.ts

import { Lazy } from '@microsoft/agents-a365-runtime';
import { ToolingConfiguration, ToolingConfigurationOptions } from '@microsoft/agents-a365-tooling';

export type OpenAIToolingConfigurationOptions = ToolingConfigurationOptions & {
  openAIModel?: string;
};

export class OpenAIToolingConfiguration extends ToolingConfiguration {
  protected get openAIToolingOverrides(): OpenAIToolingConfigurationOptions {
    return this.overrides as OpenAIToolingConfigurationOptions;
  }

  private readonly _openAIModel = new Lazy<string>(() =>
    this.openAIToolingOverrides.openAIModel
      ?? process.env.OPENAI_MODEL
      ?? 'gpt-4'
  );

  constructor(overrides?: OpenAIToolingConfigurationOptions) {
    super(overrides);
  }

  // Inherited: clusterCategory, isDevelopmentEnvironment, mcpPlatformEndpoint, mcpPlatformAuthenticationScope

  get openAIModel(): string {
    return this._openAIModel.value;
  }
}
```

### 3.6 Usage Examples

```typescript
// Simple case - all from environment variables
const config = new ToolingConfiguration();
console.log(config.clusterCategory);      // From runtime (inherited)
console.log(config.mcpPlatformEndpoint);  // From tooling

// With overrides at any level
const config = new OpenAIToolingConfiguration({
  clusterCategory: 'gov',                 // Runtime setting
  mcpPlatformEndpoint: 'https://custom',  // Tooling setting
  openAIModel: 'gpt-4-turbo'              // OpenAI setting
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
│   ├── Lazy.ts
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
| **Lazy evaluation** | Settings computed once on first access |
| **Env var fallback** | Works out of the box without any overrides |
| **Testable** | Can override any setting for testing |

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
- `Lazy.ts` - Lazy evaluation utility
- `IConfigurationProvider.ts` - Generic provider interface
- `RuntimeConfigurationOptions.ts` - Options type
- `RuntimeConfiguration.ts` - Base configuration class
- `DefaultConfigurationProvider.ts` - Default provider implementation
- `index.ts` - Re-exports

Write unit tests:
- `tests/runtime/configuration/Lazy.test.ts`
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
   ├── Utility.ts - Use ToolingConfiguration for getMcpPlatformBaseUrl()
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
import { IConfigurationProvider, defaultToolingConfigurationProvider } from './configuration';
import { ToolingConfiguration } from './configuration/ToolingConfiguration';

class McpToolServerConfigurationService {
  constructor(
    private readonly configProvider: IConfigurationProvider<ToolingConfiguration> =
      defaultToolingConfigurationProvider
  ) {}

  private get config(): ToolingConfiguration {
    return this.configProvider.getConfiguration();
  }

  private isDevScenario(): boolean {
    return this.config.isDevelopmentEnvironment;  // Inherited from RuntimeConfiguration
  }

  private getMcpPlatformBaseUrl(): string {
    return this.config.mcpPlatformEndpoint;       // From ToolingConfiguration
  }
}
```

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
  it('should use override value when provided', () => {
    const config = new RuntimeConfiguration({ clusterCategory: 'gov' });
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

  it('should cache value after first access (lazy evaluation)', () => {
    const config = new RuntimeConfiguration({});
    const first = config.clusterCategory;
    process.env.CLUSTER_CATEGORY = 'changed';
    const second = config.clusterCategory;
    expect(first).toBe(second); // Cached, not re-read
  });

  it('should derive isDevelopmentEnvironment from clusterCategory', () => {
    expect(new RuntimeConfiguration({ clusterCategory: 'local' }).isDevelopmentEnvironment).toBe(true);
    expect(new RuntimeConfiguration({ clusterCategory: 'dev' }).isDevelopmentEnvironment).toBe(true);
    expect(new RuntimeConfiguration({ clusterCategory: 'prod' }).isDevelopmentEnvironment).toBe(false);
  });
});

// Tooling Configuration Tests (Inheritance)
describe('ToolingConfiguration', () => {
  it('should inherit runtime settings', () => {
    const config = new ToolingConfiguration({ clusterCategory: 'gov' });
    expect(config.clusterCategory).toBe('gov');
    expect(config.isDevelopmentEnvironment).toBe(false);
  });

  it('should have tooling-specific settings', () => {
    const config = new ToolingConfiguration({ mcpPlatformEndpoint: 'https://custom.endpoint' });
    expect(config.mcpPlatformEndpoint).toBe('https://custom.endpoint');
  });

  it('should allow overriding both runtime and tooling settings', () => {
    const config = new ToolingConfiguration({
      clusterCategory: 'dev',
      mcpPlatformEndpoint: 'https://dev.endpoint'
    });
    expect(config.clusterCategory).toBe('dev');
    expect(config.isDevelopmentEnvironment).toBe(true);
    expect(config.mcpPlatformEndpoint).toBe('https://dev.endpoint');
  });
});

// Observability Configuration Tests (Inheritance)
describe('ObservabilityConfiguration', () => {
  it('should inherit runtime settings', () => {
    const config = new ObservabilityConfiguration({ clusterCategory: 'gov' });
    expect(config.clusterCategory).toBe('gov');
  });

  it('should have observability-specific settings', () => {
    const config = new ObservabilityConfiguration({ isObservabilityExporterEnabled: true });
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
| `Lazy.ts` | 100% |
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
    ]
  },
  overrides: [
    {
      files: ['**/configuration/**/*.ts'],
      rules: {
        'no-restricted-properties': 'off'  // Allow in configuration classes
      }
    }
  ]
}
```

**Note**: This rule catches the common `process.env.SOMETHING` pattern but won't catch destructuring (`const { env } = process`) or indirect access. These edge cases are unlikely to occur accidentally.

This rule should be added as part of Phase 4 after all `process.env` reads have been migrated to configuration classes.

---

## 8. Resolved Design Decisions

| Question | Decision |
|----------|----------|
| Should `Lazy<T>` be exported publicly? | **No** - Keep internal for now |
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
| `NODE_ENV` | string | `''` | runtime |
| `MCP_PLATFORM_ENDPOINT` | string | `'https://agent365...'` | tooling |
| `MCP_PLATFORM_AUTHENTICATION_SCOPE` | string | `'ea9ffc3e-...'` | tooling |
| `A365_OBSERVABILITY_SCOPES_OVERRIDE` | string (space-sep) | prod scope | observability |
| `ENABLE_A365_OBSERVABILITY_EXPORTER` | boolean | `false` | observability |
| `ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT` | boolean | `false` | observability |
| `A365_OBSERVABILITY_USE_CUSTOM_DOMAIN` | boolean | `false` | observability |
| `A365_OBSERVABILITY_DOMAIN_OVERRIDE` | string | `null` | observability |
| `A365_OBSERVABILITY_LOG_LEVEL` | string | `'none'` | observability |
| `A365_PER_REQUEST_MAX_TRACES` | number | `1000` | observability |
| `A365_PER_REQUEST_MAX_SPANS_PER_TRACE` | number | `5000` | observability |
| `A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS` | number | `20` | observability |
