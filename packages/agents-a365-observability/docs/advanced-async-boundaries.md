# Advanced: Async Boundaries and Parent Span References

## Overview

In complex Node.js applications, asynchronous operations can sometimes break OpenTelemetry's automatic context propagation. This is particularly common in scenarios such as:

- **WebSocket callbacks** - Event handlers that execute in a different async context
- **Event emitters** - Listeners that fire outside the original request context
- **Message queue handlers** - Processing messages that arrive asynchronously
- **Timers and deferred execution** - Scheduled callbacks that lose context

The `@microsoft/agents-a365-observability` package provides explicit parent span support to maintain proper tracing hierarchies across these async boundaries.

## The Problem

When automatic context propagation fails, new spans created in async callbacks may not be correctly parented to the original request span. This results in:

- Disconnected traces that are hard to correlate
- Lost distributed tracing context
- Incomplete visibility into request flows

## The Solution: ParentSpanRef

The SDK provides the `ParentSpanRef` interface and helper functions to explicitly link spans across async boundaries.

### ParentSpanRef Interface

```typescript
interface ParentSpanRef {
  /**
   * Trace ID (32-character hex string)
   */
  traceId: string;

  /**
   * Span ID (16-character hex string)
   */
  spanId: string;
}
```

## Core APIs

### 1. Capturing Parent Span Context

Every scope (InvokeAgentScope, InferenceScope, ExecuteToolScope) exposes a `getSpanContext()` method:

```typescript
import { InvokeAgentScope, ParentSpanRef } from '@microsoft/agents-a365-observability';

// Create a root scope
const invokeScope = InvokeAgentScope.start(
  invokeAgentDetails,
  tenantDetails
);

// Capture the span context
const spanContext = invokeScope.getSpanContext();

// Create a ParentSpanRef for later use
const parentRef: ParentSpanRef = {
  traceId: spanContext.traceId,
  spanId: spanContext.spanId,
};

// Store parentRef for use in async callbacks
```

### 2. Using Parent Span References

There are two ways to use a `ParentSpanRef`:

#### Option A: runWithParentSpanRef Helper

Use the helper function to run code within a parent span context:

```typescript
import { runWithParentSpanRef, runWithExportToken } from '@microsoft/agents-a365-observability';

// Later, in an async callback where context is lost:
runWithParentSpanRef(parentRef, () => {
  runWithExportToken(exportToken, async () => {
    // Spans created here will be correctly parented
    using inferenceScope = InferenceScope.start(
      inferenceDetails,
      agentDetails,
      tenantDetails
    );
    
    // This span will be a child of the original invokeScope
  });
});
```

#### Option B: Explicit parentSpanRef Parameter

Pass the parent reference directly when creating a scope:

```typescript
import { InferenceScope } from '@microsoft/agents-a365-observability';

// Create a child scope with explicit parent
const inferenceScope = InferenceScope.start(
  inferenceDetails,
  agentDetails,
  tenantDetails,
  conversationId,
  sourceMetadata,
  parentRef  // Explicit parent reference
);
```

## Complete Example: WebSocket Scenario

Here's a complete example showing how to maintain tracing across a WebSocket boundary:

```typescript
import {
  InvokeAgentScope,
  InferenceScope,
  ExecuteToolScope,
  ParentSpanRef,
  runWithParentSpanRef,
  runWithExportToken,
} from '@microsoft/agents-a365-observability';
import { WebSocket } from 'ws';

// Initial HTTP request handler
async function handleAgentRequest(req: Request, res: Response) {
  // Create the root span for this agent invocation
  using invokeScope = InvokeAgentScope.start(
    {
      agentId: req.body.agentId,
      agentName: 'MyAgent',
      conversationId: req.body.conversationId,
    },
    { tenantId: req.body.tenantId }
  );

  // Capture parent span context for later use
  const spanContext = invokeScope.getSpanContext();
  const parentRef: ParentSpanRef = {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };

  // Capture the export token from the request
  const exportToken = req.headers['x-export-token'];

  // Set up WebSocket connection
  const ws = new WebSocket(agentWebSocketUrl);
  
  ws.on('message', (message) => {
    // This callback runs in a different async context!
    // Use runWithParentSpanRef to restore the parent context
    runWithParentSpanRef(parentRef, () => {
      // Also restore the export token for telemetry export
      runWithExportToken(exportToken, async () => {
        // Parse the AI model response
        const response = JSON.parse(message);

        // Create inference span - it will be correctly parented
        using inferenceScope = InferenceScope.start(
          {
            operationName: 'chat',
            model: 'gpt-4',
            providerName: 'openai',
            responseId: response.id,
            inputTokens: response.usage?.prompt_tokens,
            outputTokens: response.usage?.completion_tokens,
          },
          { agentId: req.body.agentId, agentName: 'MyAgent' },
          { tenantId: req.body.tenantId }
        );

        // Record telemetry
        inferenceScope.recordOutputMessages([response.message]);

        // If the response includes tool calls
        if (response.tool_calls) {
          for (const toolCall of response.tool_calls) {
            using toolScope = ExecuteToolScope.start(
              {
                toolName: toolCall.function.name,
                arguments: toolCall.function.arguments,
                toolCallId: toolCall.id,
              },
              { agentId: req.body.agentId, agentName: 'MyAgent' },
              { tenantId: req.body.tenantId }
            );

            // Execute tool
            const toolResult = await executeTool(toolCall);
            toolScope.recordResponse(JSON.stringify(toolResult));
          }
        }

        // All spans created above are correctly parented to invokeScope
        // even though they were created in a WebSocket callback
      });
    });
  });

  res.json({ status: 'processing' });
}
```

## Important Notes

### 1. Composition Pattern

The SDK intentionally keeps parent span context and export token management separate:

- Use `runWithParentSpanRef()` to set parent span context
- Use `runWithExportToken()` to set the export token for telemetry
- **Compose them** when you need both:

```typescript
runWithParentSpanRef(parentRef, () => {
  runWithExportToken(token, async () => {
    // Your code here
  });
});
```

### 2. Token Storage

The export token should be stored in the OpenTelemetry context via `runWithExportToken()`, **not** as a span attribute. This ensures:
- The token is available for telemetry export
- The token is not included in exported span data
- Proper separation of concerns

### 3. Scope Lifecycle

Even when using explicit parent references, follow proper scope lifecycle management:

```typescript
// Using 'using' keyword (recommended)
using scope = InvokeAgentScope.start(..., parentRef);

// Or manual disposal
const scope = InvokeAgentScope.start(..., parentRef);
try {
  // ... use scope
} finally {
  scope.dispose();
}
```

### 4. All Scope Types Support Parent References

All three scope types accept an optional `parentSpanRef` parameter:

- `InvokeAgentScope.start(..., parentSpanRef?)`
- `InferenceScope.start(..., parentSpanRef?)`
- `ExecuteToolScope.start(..., parentSpanRef?)`

## When to Use This Feature

Use explicit parent span references when:

1. ✅ You're creating spans in WebSocket or event handlers
2. ✅ Async context propagation is breaking your traces
3. ✅ You need to link spans across message queue boundaries
4. ✅ Timer or scheduled callbacks need proper parent context

Don't use explicit parent references when:

1. ❌ Automatic context propagation is working correctly
2. ❌ You're creating spans in the same async context as the parent
3. ❌ Simple promise chains with proper async/await

## Troubleshooting

### Issue: Child spans still not parented correctly

**Solution**: Make sure you're using both `runWithParentSpanRef()` and passing the reference:

```typescript
// Correct - use runWithParentSpanRef for context
runWithParentSpanRef(parentRef, () => {
  // Child scopes created here inherit the parent automatically
  using scope = InvokeAgentScope.start(...);
});

// OR correct - pass explicit parent reference
using scope = InvokeAgentScope.start(..., parentRef);
```

### Issue: Export token not available in async callback

**Solution**: Compose `runWithParentSpanRef` with `runWithExportToken`:

```typescript
runWithParentSpanRef(parentRef, () => {
  runWithExportToken(token, async () => {
    // Both parent context and export token are now available
  });
});
```

## API Reference

### Functions

- `createContextWithParentSpanRef(base: Context, parent: ParentSpanRef): Context`
  - Creates a new OpenTelemetry context with an explicit parent span
  - Returns a context that can be used with `context.with()`

- `runWithParentSpanRef<T>(parent: ParentSpanRef, callback: () => T): T`
  - Executes a callback within a context that has the specified parent span
  - Returns the result of the callback

### Scope Methods

- `scope.getSpanContext(): SpanContext`
  - Available on all scope types
  - Returns the span context containing `traceId` and `spanId`
  - Use this to capture parent context for later use

## Related Documentation

- [Observability Package Design](./design.md)
- [OpenTelemetry Context API](https://opentelemetry.io/docs/languages/js/context/)
- [Token Context Utilities](../src/tracing/context/token-context.ts)
