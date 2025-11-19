# @microsoft/agents-a365-observability-tokencache

Observability token cache utilities for the Agent365 SDK. This package provides:

- In‑memory storage for observability (telemetry/export) bearer tokens
- Early refresh using an expiration skew (default 60s before real expiry)
- Automatic fallback TTL if the token lacks an `exp` claim
- Linear retry on transient failures (timeouts, 5xx, 408, 429) during token exchange
- Per key (agent + tenant) serialization to avoid thundering herds

## Installation

```bash
pnpm add @microsoft/agents-a365-observability-tokencache
```

## Core API

```ts
import { AgenticTokenCacheInstance } from '@microsoft/agents-a365-observability-tokencache';
```

## Using With Observability Builder (Telemetry Exporter)

When configuring the observability manager, supply a token resolver. Do **not** pass the method reference directly (it would lose `this`); wrap it to preserve context or use `bind`:

```ts
import { Builder, ObservabilityManager, Agent365ExporterOptions } from '@microsoft/agents-a365-observability';
import { AgenticTokenCacheInstance } from '@microsoft/agents-a365-observability-tokencache';

export const a365Observability = ObservabilityManager.configure((builder: Builder) => {
	const exporterOptions = new Agent365ExporterOptions();
	exporterOptions.maxQueueSize = 10;

	builder
		.withService('TypeScript Sample Agent', '1.0.0')
		.withClusterCategory('prod')
		.withExporterOptions(exporterOptions)
		// Wrap to ensure `this` binding (so internal map & methods work).
		.withTokenResolver((agentId, tenantId) => AgenticTokenCacheInstance.getObservabilityToken(agentId, tenantId));
});
```

Alternatively:

```ts
builder.withTokenResolver(AgenticTokenCacheInstance.getObservabilityToken.bind(AgenticTokenCacheInstance));
```

## Example: Preloading in an Agent Turn

```ts
import { AgenticTokenCacheInstance } from '@microsoft/agents-a365-observability-tokencache';
import { getObservabilityAuthenticationScope } from '@microsoft/agents-a365-runtime';

// Inside activity handler:
await AgenticTokenCacheInstance.RefreshObservabilityToken(
	agentInfo.agentId,
	tenantInfo.tenantId,
	context,
	agentApplication.authorization,
	getObservabilityAuthenticationScope()
);
// Token is now cached (non-blocking if acquisition fails; subsequent resolver will return null until success).
```

## Custom Token Resolver Example (Using Application-Level Cache)

If you prefer to manage the token yourself and only use this cache for retrieval:

```ts
const tokenResolver = (agentId: string, tenantId: string): string | null => {
	const t = AgenticTokenCacheInstance.getObservabilityToken(agentId, tenantId);
	return t ?? null;
};

builder.withTokenResolver(tokenResolver);
```

## When to Refresh vs. When to Read

- Use `RefreshObservabilityToken` when you have access to `TurnContext` and `Authorization` and want to ensure a fresh token is available.
- Use `getObservabilityToken` inside exporters / resolvers where only agent & tenant IDs are available, and you can tolerate `null` (meaning skip authenticated export or wait until later).

## Handling Expiration

The cache considers a token expired if:
1. It has an `exp` and current time >= `exp * 1000 - skewMs` (default skew 60s)
2. Or it has no `exp` and current time >= `acquiredOn + maxTokenAgeMs` (default 1h)

Expired tokens are not returned; they force a refresh on next `RefreshObservabilityToken` call.

## Error & Retry Behavior

- Transient errors (timeouts, network issues, 408, 429, 5xx) trigger up to 2 linear backoff retries (200ms, then 400ms).
- Non-retriable errors clear the entry’s token & expiry; subsequent reads return `null` until a successful refresh.
- All events are logged via lightweight console wrappers (info/warn/error).

## License
MIT
