# Runtime - Design Document

This document describes the architecture and design of the `@microsoft/agents-a365-runtime` package.

## Overview

The runtime package provides foundational utilities shared across the Microsoft Agent 365 SDK. It offers Power Platform endpoint discovery, JWT token handling, environment configuration, and agent identity resolution.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Public API                                │
│  Utility | AgenticAuthenticationService | PowerPlatformApiDiscovery │
└─────────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│     Utility      │ │   Authentication │ │  API Discovery   │
│                  │ │                  │ │                  │
│ - Token decode   │ │ - Token exchange │ │ - Endpoint URLs  │
│ - Agent identity │ │ - Scopes         │ │ - Cluster config │
│ - User-Agent     │ │                  │ │                  │
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

### AgenticAuthenticationService ([agentic-authorization-service.ts](../src/agentic-authorization-service.ts))

Handles token exchange for MCP platform authentication:

```typescript
import { AgenticAuthenticationService } from '@microsoft/agents-a365-runtime';

const token = await AgenticAuthenticationService.GetAgenticUserToken(
  authorization,
  authHandlerName,
  turnContext
);
```

The service retrieves the MCP platform authentication scope from environment configuration and exchanges the user's token for a scoped access token.

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

### Environment Utilities ([environment-utils.ts](../src/environment-utils.ts))

Helper functions for environment-specific configuration:

```typescript
import {
  getObservabilityAuthenticationScope,
  getClusterCategory,
  isDevelopmentEnvironment,
  getMcpPlatformAuthenticationScope,
} from '@microsoft/agents-a365-runtime';

// Get observability auth scopes (supports override via env var)
const scopes = getObservabilityAuthenticationScope();
// => ["https://api.powerplatform.com/.default"]

// Get cluster category from CLUSTER_CATEGORY env var
const cluster = getClusterCategory();
// => "prod" (default)

// Check if running in development
const isDev = isDevelopmentEnvironment();
// => true if cluster is "local" or "dev"

// Get MCP platform auth scope
const mcpScope = getMcpPlatformAuthenticationScope();
```

**Environment Variables:**

| Variable | Purpose | Default |
|----------|---------|---------|
| `A365_OBSERVABILITY_SCOPES_OVERRIDE` | Override observability auth scopes | Production scope |
| `CLUSTER_CATEGORY` | Environment cluster category | `prod` |
| `MCP_PLATFORM_AUTHENTICATION_SCOPE` | MCP platform auth scope | Production scope |

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

### Environment-Based Configuration

Configuration is environment-aware with sensible defaults:

```typescript
export function getClusterCategory(): string {
  const clusterCategory = process.env.CLUSTER_CATEGORY;
  return clusterCategory?.toLowerCase() ?? 'prod';
}
```

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
├── environment-utils.ts              # Environment helpers
└── version.ts                        # Package version constant
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
