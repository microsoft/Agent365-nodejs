# Agent 365 Observability Extensions for LangChain (Node.js)

This package provides automatic instrumentation for LangChain.js `Runnable` invocations, emitting OpenTelemetry spans aligned with Agent 365 observability conventions.

## Installation

```bash
pnpm add @microsoft/agents-a365-observability-extensions-langchain
```

Ensure you have configured the Agent 365 `ObservabilityManager` and an OpenTelemetry tracer provider.

## Usage

Enable the instrumentation early in your application startup:

```ts
import { LangChainTraceInstrumentor } from '@microsoft/agents-a365-observability-extensions-langchain';
import * as LangChainCallbacks from "@langchain/core/callbacks/manager";
import { ObservabilityManager } from '@microsoft/agents-a365-observability';

// 1) Configure the tracing SDK
ObservabilityManager.start({
  serviceName: 'Your Service',
  serviceVersion: '1.0.0'
  // your exporter/provider configuration
});

// 2) set up langchain auto instrument
LangChainTraceInstrumentor.instrument(LangChainCallbacks as any);

// 3) Use LangChain; spans are created automatically for all Runnable operations
const result = await chain.invoke(input);
```
