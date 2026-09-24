# Observability Hosting - Design Document

This document describes the architecture and design of the `@microsoft/agents-a365-observability-hosting` package.

## Overview

The observability hosting package provides hosting-specific utilities for integrating observability with the Microsoft Agents Hosting SDK. It bridges the gap between `TurnContext` and OpenTelemetry baggage/scope creation.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        TurnContext                               │
│               (@microsoft/agents-hosting)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Utility Classes                              │
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │ TurnContextUtils    │    │ BaggageBuilderUtils │            │
│  │                     │    │                     │            │
│  │ Extract baggage     │───▶│ Populate builder    │            │
│  │ pairs from context  │    │ from context        │            │
│  └─────────────────────┘    └─────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BaggageBuilder                                │
│           (@microsoft/agents-a365-observability)                │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### BaggageBuilderUtils ([BaggageBuilderUtils.ts](../src/utils/BaggageBuilderUtils.ts))

Utilities to populate `BaggageBuilder` from a `TurnContext`:

```typescript
import { BaggageBuilderUtils } from '@microsoft/agents-a365-observability-hosting';
import { BaggageBuilder } from '@microsoft/agents-a365-observability';

const builder = new BaggageBuilder();

// Populate all baggage from turn context
BaggageBuilderUtils.fromTurnContext(builder, turnContext);

// Or populate specific baggage categories
BaggageBuilderUtils.setCallerBaggage(builder, turnContext);
BaggageBuilderUtils.setTargetAgentBaggage(builder, turnContext);
BaggageBuilderUtils.setTenantIdBaggage(builder, turnContext);
BaggageBuilderUtils.setChannelBaggage(builder, turnContext);
BaggageBuilderUtils.setConversationIdBaggage(builder, turnContext);

// Build and use the scope
const scope = builder.build();
scope.run(() => {
  // All child spans inherit the baggage
});
```

**Methods:**

| Method | Purpose |
|--------|---------|
| `fromTurnContext(builder, turnContext)` | Populate all supported baggage pairs |
| `setCallerBaggage(builder, turnContext)` | Set caller ID, name, UPN, tenant |
| `setTargetAgentBaggage(builder, turnContext)` | Set target agent ID, name, description |
| `setTenantIdBaggage(builder, turnContext)` | Set tenant ID from recipient or channel data |
| `setChannelBaggage(builder, turnContext)` | Set channel name and subchannel |
| `setConversationIdBaggage(builder, turnContext)` | Set conversation ID and item link |

### TurnContextUtils ([TurnContextUtils.ts](../src/utils/TurnContextUtils.ts))

Low-level utilities to extract OpenTelemetry baggage pairs from `TurnContext`:

```typescript
import {
  getCallerBaggagePairs,
  getTargetAgentBaggagePairs,
  getTenantIdPair,
  getChannelBaggagePairs,
  getConversationIdAndItemLinkPairs
} from '@microsoft/agents-a365-observability-hosting';

// Extract caller information
const callerPairs = getCallerBaggagePairs(turnContext);
// => [['gen_ai.caller.id', 'aad-object-id'], ['gen_ai.caller.name', 'John'], ...]

// Extract target agent information
const agentPairs = getTargetAgentBaggagePairs(turnContext);
// => [['gen_ai.agent.id', 'agent-123'], ['gen_ai.agent.name', 'MyAgent'], ...]
```

**Functions:**

| Function | Extracted Keys |
|----------|----------------|
| `getCallerBaggagePairs()` | `gen_ai.caller.id`, `gen_ai.caller.name`, `gen_ai.caller.upn`, `gen_ai.caller.tenant_id`, `gen_ai.agent.blueprint_id` |
| `getTargetAgentBaggagePairs()` | `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.agent.description`, `gen_ai.agent.auid` |
| `getTenantIdPair()` | `tenant_id` |
| `getChannelBaggagePairs()` | `gen_ai.execution.source.name`, `gen_ai.execution.source.description` |
| `getConversationIdAndItemLinkPairs()` | `gen_ai.conversation.id`, `gen_ai.conversation.item_link` |

### AgenticTokenCacheInstance ([AgenticTokenCache.ts](../src/caching/AgenticTokenCache.ts))

Cache app-only OBS tokens independently of the workload's AI Teammate or OBO
authorization. The former overload accepting `TurnContext` and `Authorization`
now throws rather than acquiring a delegated token incompatible with S2S.

```typescript
import { AgenticTokenCacheInstance } from '@microsoft/agents-a365-observability-hosting';

// acquireAppOnlyObsToken is your app-only token acquisition callback.
// It receives (agentId, tenantId, scopes) and returns the final OBS access token.
await AgenticTokenCacheInstance.RefreshObservabilityToken(
  agentId, tenantId, acquireAppOnlyObsToken
);

const token = AgenticTokenCacheInstance.getObservabilityToken(agentId, tenantId);
```

For a blueprint-backed agent, acquire a blueprint exchange assertion with
`fmi_path=agentId`, then use it as `client_assertion` in an instance
`client_credentials` request for the OBS `/.default` scope. Do not send the
intermediate assertion, a blueprint token, or a `user_fic`/OBO token to OBS.
The final token's application identity must match `agentId`, its tenant must
match `tenantId`, and its audience must be OBS. An eligible Agent 365-registered
instance can use a roleless app token when service policy permits; an
`Agent365.Observability.OtelWrite` grant is not a universal prerequisite. Entra
identity creation alone does not establish instance registration or service access.
The resolver must validate app-only identity (explicit `idtyp=app` for a roleless
token), reject delegated `scp` tokens, and check audience and lifetime before
returning a token. The cache does not perform token authentication or authorization.
Acquisition failures propagate to the caller and never trigger delegated authentication.

When migrating, replace only the OBS refresh call, not workload MCP/Graph/OBO
authorization. Configure an OBS resolver in both batch and per-request modes.
It should refresh the app-only cache at export time before returning its token,
so long-running requests do not depend on a token acquired at turn start:

```typescript
builder.withTokenResolver(async (agentId, tenantId) => {
  await AgenticTokenCacheInstance.RefreshObservabilityToken(
    agentId, tenantId, acquireAppOnlyObsToken
  );
  return AgenticTokenCacheInstance.getObservabilityToken(agentId, tenantId);
});
```

`Agent365Exporter` ignores tokens in `runWithExportToken`; those context helpers
remain available for custom exporters, not as an OBS authentication fallback.
An enabled exporter without an explicit resolver fails configuration.
Both modes use the S2S OTLP
route even if the deprecated `useS2SEndpoint` option is false. Missing tokens and
failed acquisition report export failure without sending a request; HTTP
401/403/404 never select an OBO fallback. Check instance registration and service
policy rather than adding OBS permissions automatically.

## Tenant ID Resolution

The package extracts tenant ID from multiple sources:

```typescript
function getTenantIdPair(turnContext: TurnContext): Array<[string, string]> {
  // Try recipient first
  let tenantId = turnContext.activity?.recipient?.tenantId;

  // Fallback to channelData
  if (!tenantId && turnContext.activity?.channelData) {
    const channelData = typeof turnContext.activity.channelData === 'string'
      ? JSON.parse(turnContext.activity.channelData)
      : turnContext.activity.channelData;

    tenantId = channelData?.tenant?.id;
  }

  return tenantId ? [[OpenTelemetryConstants.TENANT_ID_KEY, tenantId]] : [];
}
```

## Usage Example

Complete example of setting up observability from a turn context:

```typescript
import { BaggageBuilderUtils } from '@microsoft/agents-a365-observability-hosting';
import { BaggageBuilder, InvokeAgentScope } from '@microsoft/agents-a365-observability';

// In your agent's message handler
async function onMessage(turnContext: TurnContext, turnState: TurnState) {
  // Build baggage from turn context
  const builder = new BaggageBuilder();
  BaggageBuilderUtils.fromTurnContext(builder, turnContext);
  const baggageScope = builder.build();

  // Execute agent logic within baggage context
  return baggageScope.run(async () => {
    // Create agent invocation scope
    using scope = InvokeAgentScope.start(
      { conversationId: turnContext.activity.conversation?.id, sessionId: turnContext.activity.conversation?.id },
      {},  // InvokeAgentScopeDetails
      {
        agentId: turnContext.activity.recipient?.agenticAppId,
        agentName: turnContext.activity.recipient?.name,
        tenantId: turnContext.activity.recipient?.tenantId
      }
    );

    // Agent processing...
    const response = await processMessage(turnContext.activity.text);
    scope.recordResponse(response);

    await turnContext.sendActivity(response);
  });
}
```

## File Structure

```
src/
├── index.ts                              # Public API exports
├── utils/
│   ├── BaggageBuilderUtils.ts            # BaggageBuilder population utilities
│   ├── TurnContextUtils.ts               # Low-level extraction functions
│   └── ScopeUtils.ts                     # Scope creation utilities
└── caching/
    └── AgenticTokenCache.ts              # Token caching
```

## Dependencies

- `@microsoft/agents-a365-observability` - BaggageBuilder, OpenTelemetryConstants
- `@microsoft/agents-a365-runtime` - Runtime utilities
- `@microsoft/agents-hosting` - TurnContext type
- `@microsoft/agents-activity` - RoleTypes enum
