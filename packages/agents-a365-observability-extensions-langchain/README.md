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
import { ObservabilityManager } from '@microsoft/agents-a365-observability';

ObservabilityManager.configure({
  // your exporter/provider configuration
});

const lcInstr = new LangChainTraceInstrumentor({
  enabled: true,
  tracerName: 'agent365-langchain'
});

lcInstr.enable();

// After this, LangChain Runnable.invoke calls will be traced automatically
```

## Configuration

- `enabled` (default: false): Whether to enable instrumentation on construction.
- `tracerName`: Custom tracer name.
- `tracerVersion`: Custom tracer version.

## Notes

- This instrumentation patches `@langchain/core` `Runnable.prototype.invoke` for auto-tracing.
- Model names are inferred from common fields like `modelName` or `model`.