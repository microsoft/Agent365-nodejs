# @microsoft/agents-a365-observability-tokencache

Observability token cache utilities for Agent365 SDK. Provides an in-memory cache for observability bearer tokens with early refresh, retry, and per-key serialization.

## Installation

```bash
pnpm add @microsoft/agents-a365-observability-tokencache
```

## Usage

```ts
import { AgenticTokenCacheInstance } from '@microsoft/agents-a365-observability-tokencache';

const token = AgenticTokenCacheInstance.getObservabilityToken(agentId, tenantId);
```

## License
MIT
