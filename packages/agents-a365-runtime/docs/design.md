# Runtime - Design Document

This document describes the architecture and design of the `@microsoft/agents-a365-runtime` package.

## Overview

The runtime package provides foundational utilities shared across the Microsoft Agent 365 SDK. It offers Power Platform endpoint discovery, JWT token handling, environment configuration, and agent identity resolution.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Public API                                │
│  Utility | AgenticAuthenticationService | RuntimeConfiguration   │
│  PowerPlatformApiDiscovery                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│     Utility      │ │  Configuration   │ │  API Discovery   │
│                  │ │                  │ │                  │
│ - Token decode   │ │ - Cluster cat.   │ │ - Endpoint URLs  │
│ - Agent identity │ │ - isDevEnv       │ │ - Cluster config │
│ - User-Agent     │ │ - isNodeEnvDev   │ │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

## Key Components

### Utility Class ([utility.ts](../src/utility.ts))

The `Utility` class provides static helper methods for common agent operations:

```typescript
import { Utility } from '@microsoft/agents-a365-runtime';

// Decode App ID from JWT token
const appId = Utility.GetAppIdFromToken(jwtToken);

// Resolve agent identity from turn context or token
const agentId = Utility.ResolveAgentIdentity(turnContext, authToken);

// Generate User-Agent header
const userAgent = Utility.GetUserAgentHeader('MyOrchestrator');
// => "Agent365SDK/1.0.0 (Windows_NT; Node.js v18.0.0; MyOrchestrator)"
```

**Methods:**

| Method | Purpose |
|--------|---------|
| `GetAppIdFromToken(token)` | Decode JWT and extract `appid` or `azp` claim |
| `ResolveAgentIdentity(context, authToken)` | Get agent identity from agentic request or token |
| `GetUserAgentHeader(orchestrator?)` | Generate formatted User-Agent string |

### PowerPlatformApiDiscovery ([power-platform-api-discovery.ts](../src/power-platform-api-discovery.ts))

Handles cluster-based endpoint resolution for Power Platform APIs:

```typescript
import { PowerPlatformApiDiscovery } from '@microsoft/agents-a365-runtime';

const discovery = new PowerPlatformApiDiscovery('prod');

// Get token audience
const audience = discovery.getTokenAudience();
// => "https://api.powerplatform.com"

// Get tenant endpoint
const endpoint = discovery.getTenantEndpoint(tenantId);

// Get tenant island cluster endpoint
const islandEndpoint = discovery.getTenantIslandClusterEndpoint(tenantId);
```

**Supported Cluster Categories:**

| Category | API Hostname Suffix |
|----------|---------------------|
| `local` | `api.powerplatform.localhost` |
| `dev`, `test`, `preprod` | `api.powerplatform.com` |
| `firstrelease`, `prod` | `api.powerplatform.com` |
| `gov` | `api.gov.powerplatform.microsoft.us` |
| `high` | `api.high.powerplatform.microsoft.us` |
| `dod` | `api.appsplatform.us` |
| `mooncake` | `api.powerplatform.partner.microsoftonline.cn` |
| `ex` | `api.powerplatform.eaglex.ic.gov` |
| `rx` | `api.powerplatform.microsoft.scloud` |

### AgenticAuthenticationService ([agentic-authorization-service.ts](../src/agentic-authorization-service.ts))

Handles token exchange for platform authentication:

```typescript
import { AgenticAuthenticationService } from '@microsoft/agents-a365-runtime';

// Get token with specified scopes
const token = await AgenticAuthenticationService.GetAgenticUserToken(
  authorization,
  authHandlerName,
  turnContext,
  ['scope1/.default', 'scope2/.default']  // Scopes to request
);
```

The service exchanges the user's token for a scoped access token. Callers should obtain the appropriate scopes from their domain-specific configuration (e.g., `ToolingConfiguration.mcpPlatformAuthenticationScope` for MCP platform authentication).

### Configuration ([configuration/](../src/configuration/))

The runtime package provides a configuration system that supports programmatic overrides and environment variable fallbacks:

```typescript
import {
  RuntimeConfiguration,
  ClusterCategory,
  defaultRuntimeConfigurationProvider,
} from '@microsoft/agents-a365-runtime';

// Using the default configuration provider (reads from env vars)
const config = defaultRuntimeConfigurationProvider.getConfiguration();

// Get cluster category
const cluster = config.clusterCategory;
// => "prod" (default, or from CLUSTER_CATEGORY env var)

// Check if running in development cluster
const isDev = config.isDevelopmentEnvironment;
// => true if cluster is "local" or "dev"

// Check if NODE_ENV is 'development'
const isNodeDev = config.isNodeEnvDevelopment;
// => true if NODE_ENV === 'development'
```

**Custom Configuration with Overrides:**

```typescript
// Create configuration with programmatic overrides
const config = new RuntimeConfiguration({
  clusterCategory: () => ClusterCategory.gov,
  isNodeEnvDevelopment: () => false,
});

// Dynamic per-tenant configuration
const tenantConfigs: Record<string, ClusterCategory> = {
  'tenant-a': ClusterCategory.prod,
  'tenant-b': ClusterCategory.gov,
};
let currentTenant = 'tenant-a';

const dynamicConfig = new RuntimeConfiguration({
  clusterCategory: () => tenantConfigs[currentTenant],
});
```

**Environment Variables:**

| Variable | Purpose | Default |
|----------|---------|---------|
| `CLUSTER_CATEGORY` | Environment cluster category | `prod` |
| `NODE_ENV` | Node.js environment (`development` enables local mode) | - |

### Environment Utilities ([environment-utils.ts](../src/environment-utils.ts)) - Deprecated

> **Note:** These functions are deprecated. Use the appropriate configuration class instead:
> - `RuntimeConfiguration` for `clusterCategory` and `isDevelopmentEnvironment`
> - `ToolingConfiguration` for `mcpPlatformAuthenticationScope`
> - `ObservabilityConfiguration` for `observabilityAuthenticationScopes`

```typescript
import {
  getObservabilityAuthenticationScope,  // @deprecated - use ObservabilityConfiguration
  getClusterCategory,                    // @deprecated - use RuntimeConfiguration
  isDevelopmentEnvironment,              // @deprecated - use RuntimeConfiguration
  getMcpPlatformAuthenticationScope,     // @deprecated - use ToolingConfiguration
} from '@microsoft/agents-a365-runtime';
```

These functions are maintained only for backward compatibility. The `getClusterCategory` and `isDevelopmentEnvironment` functions delegate to `defaultRuntimeConfigurationProvider`, while the auth scope functions return hardcoded production defaults.

## Type Definitions

### ClusterCategory

```typescript
type ClusterCategory =
  | 'local'
  | 'dev'
  | 'test'
  | 'preprod'
  | 'firstrelease'
  | 'prod'
  | 'gov'
  | 'high'
  | 'dod'
  | 'mooncake'
  | 'ex'
  | 'rx';
```

## Design Patterns

### Static Utility Methods

The `Utility` class uses static methods for stateless operations, making it easy to use without instantiation:

```typescript
// No instantiation needed
const appId = Utility.GetAppIdFromToken(token);
```

### Configuration Provider Pattern

Configuration is centralized in configuration classes with function-based overrides for dynamic resolution:

```typescript
export class RuntimeConfiguration {
  protected readonly overrides: RuntimeConfigurationOptions;

  constructor(overrides?: RuntimeConfigurationOptions) {
    this.overrides = overrides ?? {};
  }

  get clusterCategory(): ClusterCategory {
    // Override function called on each access (enables per-request resolution)
    if (this.overrides.clusterCategory) {
      return this.overrides.clusterCategory();
    }
    // Fall back to environment variable
    const envValue = process.env.CLUSTER_CATEGORY;
    if (envValue) {
      return envValue.toLowerCase() as ClusterCategory;
    }
    // Default value
    return 'prod';
  }
}
```

This pattern enables:
- **Multi-tenant support**: Different values per request via async context
- **Testability**: Easy to override for testing without modifying env vars
- **Centralized access**: All env var reads in one place (enforced by ESLint)

### Defensive Token Handling

Token decoding handles edge cases gracefully:

```typescript
public static GetAppIdFromToken(token: string): string {
  if (!token || token.trim() === '') {
    return '00000000-0000-0000-0000-000000000000';
  }

  try {
    const decoded = jwt.decode(token) as jwt.JwtPayload;
    return decoded?.['appid'] || decoded?.['azp'] || '';
  } catch {
    return '';
  }
}
```

## File Structure

```
src/
├── index.ts                          # Public API exports
├── utility.ts                        # Utility class
├── agentic-authorization-service.ts  # Token exchange service
├── power-platform-api-discovery.ts   # Endpoint discovery
├── environment-utils.ts              # Environment helpers (deprecated)
├── version.ts                        # Package version constant
├── operation-error.ts                # Operation error types
├── operation-result.ts               # Operation result types
├── configuration/
│   ├── index.ts                      # Configuration exports
│   ├── IConfigurationProvider.ts     # Generic provider interface
│   ├── RuntimeConfiguration.ts       # Base configuration class
│   ├── RuntimeConfigurationOptions.ts # Options type definition
│   └── DefaultConfigurationProvider.ts # Default provider implementation
```

## Dependencies

- `@microsoft/agents-hosting` - TurnContext and Authorization types
- `jsonwebtoken` - JWT token decoding
- `os` - Operating system information for User-Agent

## Integration with Other Packages

The runtime package is a foundational dependency used by:

- `@microsoft/agents-a365-tooling` - For agent identity resolution and headers
- `@microsoft/agents-a365-observability` - For cluster category and environment utilities
- All tooling extension packages - For authentication and identity resolution
