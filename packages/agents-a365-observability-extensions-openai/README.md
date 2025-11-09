# @microsoft/agents-a365-observability-extensions-openai

[![npm](https://img.shields.io/npm/v/@microsoft/agents-a365-observability-extensions-openai?label=npm&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-observability-extensions-openai)
[![npm Downloads](https://img.shields.io/npm/dm/@microsoft/agents-a365-observability-extensions-openai?label=Downloads&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-observability-extensions-openai)

OpenAI Agents SDK instrumentation for Microsoft Agents A365 observability. This package provides automatic OpenTelemetry tracing and telemetry collection for OpenAI Agents SDK operations, including agent execution, function calls, and AI model interactions.

## Installation

```bash
npm install @microsoft/agents-a365-observability-extensions-openai
```

## Usage

### Basic Setup

```typescript
import { ObservabilityManager } from '@microsoft/agents-a365-observability';
import { OpenAIAgentsTraceInstrumentor } from '@microsoft/agents-a365-observability-extensions-openai';

// Configure observability first
const sdk = ObservabilityManager.configure((builder) =>
  builder
    .withService('My Agent Service', '1.0.0')
    .withConsoleExporter(true)
);

// Create and enable the instrumentor
const instrumentor = new OpenAIAgentsTraceInstrumentor({
  enabled: true,
  tracerName: 'openai-agents-tracer',
  tracerVersion: '1.0.0'
});

sdk.start();
instrumentor.enable();
```

### Configuration Options

```typescript
interface OpenAIAgentsInstrumentationConfig {
  // Enable/disable instrumentation
  enabled?: boolean;
  
  // Custom tracer configuration
  tracerName?: string;
  tracerVersion?: string;
}
```

## Support

For issues, questions, or feedback:

- File issues in the [GitHub Issues](https://github.com/microsoft/Agent365-nodejs/issues) section
- See the [main documentation](../../README.md) for more information

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details
