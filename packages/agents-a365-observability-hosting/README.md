# @microsoft/agents-a365-observability-hosting

Hosting & observability utilities for Agent365 (Node.js)

## Features
- Baggage builder + request context (tenant / agent).
- Token cache abstraction.

## Install

```bash
npm install @microsoft/agents-a365-observability-hosting @opentelemetry/api
```

## Usage

### BaggageBuilderUtils Example

```ts
import { BaggageBuilderUtils } from '@microsoft/agents-a365-observability-hosting';
import { BaggageBuilder } from '@microsoft/agents-a365-observability';

const turnContext = /* your TurnContext object */;
const builder = new BaggageBuilder();
BaggageBuilderUtils.fromTurnContext(builder, turnContext);
// builder now has all relevant baggage pairs from the context
```

### InvokeAgentScopeUtils Example

```ts
import { InvokeAgentScopeUtils } from '@microsoft/agents-a365-observability-hosting';
import { InvokeAgentScope } from '@microsoft/agents-a365-observability';

const turnContext = /* your TurnContext object */;
const scope = InvokeAgentScope.start(
  {
    agentName: 'Agent Name',
    sessionId: 'session-id',
    endpoint: { host: 'localhost', port: 443 },
    conversationId: 'conv-id',
    request: { executionType: 'test' }
  } as any,
  { tenantId: 'tenant-id' } as any
);
InvokeAgentScopeUtils.populateFromTurnContext(scope, turnContext);
// scope now has all relevant tags from the context
```

## Token Cache

The hosting package currently exposes an agent/tenant-scoped token cache via the singleton `AgenticTokenCacheInstance`. It acquires and stores tokens (with retry + expiry logic) and lets you retrieve a valid cached token for a given `(agentId, tenantId)` pair.

```ts
import { AgenticTokenCacheInstance } from '@microsoft/agents-a365-observability-hosting';

// Refresh (or acquire) a token for an agent/tenant. This typically runs
// at the start of a request or scheduled operation.
await AgenticTokenCacheInstance.RefreshObservabilityToken(
  agentId,
  tenantId,
  turnContext,      // From your hosting environment
  authorization,    // Implements exchangeToken
  scopes            // e.g. ['https://service/.default'] or leave empty to use default
);

// Later, read the cached token (returns null if missing or expired)
const token = AgenticTokenCacheInstance.getObservabilityToken(agentId, tenantId);
if (!token) {
  // handle missing/expired token (e.g. trigger refresh or fail fast)
}
```

Key points:
- `RefreshObservabilityToken` is idempotent and will return early if a valid token is already cached.
- Expiry is derived from the token's `exp` claim when available; otherwise a fallback TTL is used.
- Minimal locking ensures only one active refresh per `(agentId, tenantId)` key.
- Use `invalidateToken(agentId, tenantId)` or `invalidateAll()` if forced revocation is required.

## License
See repository root.
