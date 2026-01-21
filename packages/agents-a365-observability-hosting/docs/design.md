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
BaggageBuilderUtils.setExecutionTypeBaggage(builder, turnContext);
BaggageBuilderUtils.setTargetAgentBaggage(builder, turnContext);
BaggageBuilderUtils.setTenantIdBaggage(builder, turnContext);
BaggageBuilderUtils.setSourceMetadataBaggage(builder, turnContext);
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
| `setExecutionTypeBaggage(builder, turnContext)` | Set execution type (HumanToAgent, Agent2Agent) |
| `setTargetAgentBaggage(builder, turnContext)` | Set target agent ID, name, description |
| `setTenantIdBaggage(builder, turnContext)` | Set tenant ID from recipient or channel data |
| `setSourceMetadataBaggage(builder, turnContext)` | Set channel name and subchannel |
| `setConversationIdBaggage(builder, turnContext)` | Set conversation ID and item link |

### TurnContextUtils ([TurnContextUtils.ts](../src/utils/TurnContextUtils.ts))

Low-level utilities to extract OpenTelemetry baggage pairs from `TurnContext`:

```typescript
import {
  getCallerBaggagePairs,
  getExecutionTypePair,
  getTargetAgentBaggagePairs,
  getTenantIdPair,
  getSourceMetadataBaggagePairs,
  getConversationIdAndItemLinkPairs
} from '@microsoft/agents-a365-observability-hosting';

// Extract caller information
const callerPairs = getCallerBaggagePairs(turnContext);
// => [['gen_ai.caller.id', 'aad-object-id'], ['gen_ai.caller.name', 'John'], ...]

// Extract execution type
const executionPair = getExecutionTypePair(turnContext);
// => [['gen_ai.execution.type', 'HumanToAgent']]

// Extract target agent information
const agentPairs = getTargetAgentBaggagePairs(turnContext);
// => [['gen_ai.agent.id', 'agent-123'], ['gen_ai.agent.name', 'MyAgent'], ...]
```

**Functions:**

| Function | Extracted Keys |
|----------|----------------|
| `getCallerBaggagePairs()` | `gen_ai.caller.id`, `gen_ai.caller.name`, `gen_ai.caller.upn`, `gen_ai.caller.tenant_id`, `gen_ai.agent.blueprint_id` |
| `getExecutionTypePair()` | `gen_ai.execution.type` |
| `getTargetAgentBaggagePairs()` | `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.agent.description`, `gen_ai.agent.auid` |
| `getTenantIdPair()` | `tenant_id` |
| `getSourceMetadataBaggagePairs()` | `gen_ai.execution.source.name`, `gen_ai.execution.source.description` |
| `getConversationIdAndItemLinkPairs()` | `gen_ai.conversation.id`, `gen_ai.conversation.item_link` |

### AgenticTokenCacheInstance ([AgenticTokenCache.ts](../src/caching/AgenticTokenCache.ts))

Token caching for improved performance:

```typescript
import { AgenticTokenCacheInstance } from '@microsoft/agents-a365-observability-hosting';

// Cache token with key
AgenticTokenCacheInstance.set('cache-key', 'token-value', ttlMs);

// Retrieve cached token
const token = AgenticTokenCacheInstance.get('cache-key');
```

## Execution Type Detection

The package automatically detects the execution type based on caller role:

```typescript
function getExecutionTypePair(turnContext: TurnContext): Array<[string, string]> {
  const from = turnContext.activity.from;
  let executionType = ExecutionType.HumanToAgent;

  if (from.role) {
    switch (from.role) {
      case RoleTypes.AgenticUser:
        executionType = ExecutionType.Agent2Agent;
        break;
      case RoleTypes.User:
        executionType = ExecutionType.HumanToAgent;
        break;
    }
  }

  return [[OpenTelemetryConstants.GEN_AI_EXECUTION_TYPE_KEY, executionType]];
}
```

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
      {
        agentId: turnContext.activity.recipient?.agenticAppId,
        agentName: turnContext.activity.recipient?.name,
        sessionId: turnContext.activity.conversation?.id
      },
      { tenantId: turnContext.activity.recipient?.tenantId }
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

- `@microsoft/agents-a365-observability` - BaggageBuilder, OpenTelemetryConstants, ExecutionType
- `@microsoft/agents-a365-runtime` - Runtime utilities
- `@microsoft/agents-hosting` - TurnContext type
- `@microsoft/agents-activity` - RoleTypes enum
