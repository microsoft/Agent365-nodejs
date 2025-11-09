# @microsoft/agents-a365-observability

[![npm](https://img.shields.io/npm/v/@microsoft/agents-a365-observability?label=npm&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-observability)
[![npm Downloads](https://img.shields.io/npm/dm/@microsoft/agents-a365-observability?label=Downloads&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-observability)

OpenTelemetry-based observability and tracing for Microsoft Agents A365 applications. This package provides comprehensive monitoring capabilities for agent invocations, tool executions, and AI model inference calls with seamless Azure Monitor integration.

## Installation

```bash
npm install @microsoft/agents-a365-observability
```

## Usage

### Basic Setup

```typescript
import { ObservabilityManager } from '@microsoft/agents-a365-observability';

// Simple configuration
const sdk = ObservabilityManager.start({
  serviceName: 'my-agent-service',
  serviceVersion: '1.0.0'
});
```

### Using Builder Pattern

```typescript
import { ObservabilityManager } from '@microsoft/agents-a365-observability';

// Advanced configuration with builder pattern
const builder = ObservabilityManager.configure(builder =>
  builder
    .withService('my-agent-service', '1.0.0')
    .withTokenResolver((agentId, tenantId) => {
      return getUserManagedIdentityToken();
    })
    .withClusterCategory('preprod')
);

builder.start();
```

### Creating Spans

```typescript
import { InvokeAgentScope, ExecuteToolScope } from '@microsoft/agents-a365-observability';

// Track agent invocation
const agentScope = new InvokeAgentScope({
  agentId: 'my-agent',
  agentName: 'My Agent',
  conversationId: 'conv-123'
});

// Track tool execution
const toolScope = new ExecuteToolScope({
  toolName: 'SearchTool',
  endpoint: 'https://api.example.com'
});
```

## Support

For issues, questions, or feedback:

- File issues in the [GitHub Issues](https://github.com/microsoft/Agent365-nodejs/issues) section
- See the [main documentation](../../README.md) for more information

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details
