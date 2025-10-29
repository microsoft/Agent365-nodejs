# @microsoft/agents-a365-instrument-extensions-openai

OpenAI Agents SDK instrumentation extensions for Agent365 telemetry and observability.

## Overview

This package provides OpenTelemetry instrumentation for Agent365 which uses OpenAI Agents SDK, enabling automatic tracing and telemetry collection for agent operations, function calls, and AI model interactions.

## Features

- **Automatic Instrumentation**: Seamlessly instruments OpenAI Agents SDK without manual instrumentation. 
- **OpenTelemetry Integration**: Full compatibility with OpenTelemetry ecosystem
- **Comprehensive Tracing**: Captures agent operations, function calls, AI generations

## Installation

```bash
npm install @microsoft/agents-a365-instrument-extensions-openai
```

## Prerequisites

- Node.js 18.0.0 or higher
- @openai/agents 0.1.5 or higher
- @microsoft/agents-a365-observability configured and initialized

## Usage

### Basic Setup

```typescript
import { ObservabilityManager } from '@microsoft/agents-a365-observability';
import { OpenAIAgentsTraceInstrumentor } from '@microsoft/agents-a365-instrument-extensions-openai';

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

### Automatic Tracing

Once configured, the instrumentor automatically traces:

- **Agent Operations**: Agent initialization, execution, and lifecycle
- **Function Calls**: Tool invocations with input/output parameters
- **AI Generations**: Model calls with prompts, responses, and token usage
- **Errors**: Exception handling and error propagation

### Span Attributes

The instrumentor captures rich telemetry attributes following OpenTelemetry semantic conventions:

#### Generation Spans
- `gen_ai.provider.name`: AI provider (always "openai")
- `gen_ai.request.model`: Model name (e.g., "gpt-4")
- `gen_ai.request.content`: Input prompt/messages
- `gen_ai.response.content`: Model response
- `gen_ai.response.id`: Response identifier
- `gen_ai.usage.input_tokens`: Input token count
- `gen_ai.usage.output_tokens`: Output token count

#### Function Spans
- `gen_ai.tool.name`: Function/tool name
- `gen_ai.request.content`: Function input parameters
- `gen_ai.response.content`: Function output/result

#### Agent Spans
- Agent metadata and execution context
- Session and conversation identifiers
- Performance metrics

## Advanced Usage

### Custom Processor Access

```typescript
const instrumentor = new OpenAIAgentsTraceInstrumentor();
instrumentor.enable();


```

### Lifecycle Management

```typescript
// Enable instrumentation
instrumentor.enable();

// Your application code using OpenAI Agents SDK
// Traces will be automatically collected

// Disable when shutting down
instrumentor.disable();

// Shutdown observability
await ObservabilityManager.shutdown();
```

## Trace Data Structure

The instrumentor processes various span types from the OpenAI Agents SDK:

- **Agent Spans**: High-level agent operations and workflows
- **Function Spans**: Tool and function executions
- **Response Spans**: Model response processing

## Error Handling

The instrumentor gracefully handles errors and provides detailed error tracking:

- Automatic error detection in spans
- Error message and stack trace capture  
- Span status reporting (OK/ERROR)
- Silent failure for non-critical operations

## Compatibility

- **OpenAI Agents SDK**: 0.1.5 or higher
- **OpenTelemetry**: 1.9.0 or higher
- **Node.js**: 18.0.0 or higher
- **TypeScript**: 5.5.0 or higher

## Complete Example
See the complete working example in [`/nodejs/samples/agents-a365-instrument-extensions-openai/`](../../../samples/agents-a365-instrument-extensions-openai/)

## Trace examples
```
{
  resource: {
    attributes: {
      'service.name': 'TypeScript Sample Agent',
      'host.name': 'pefan4-0',
      'host.arch': 'amd64',
      'host.id': '3dc679db-f652-4002-98b7-5e05e5071507',
      'process.pid': 3612,
      'process.executable.name': 'npm start',
      'process.executable.path': 'C:\\Program Files\\nodejs\\node.exe',
      'process.command_args': [
        'C:\\Program Files\\nodejs\\node.exe',
        'D:\\repos\\sdk\\Agent365\\nodejs\\samples\\openai-agents-sdk\\dist\\index.js'
      ],
      'process.runtime.version': '20.18.3',
      'process.runtime.name': 'nodejs',
      'process.runtime.description': 'Node.js',
      'process.command': 'D:\\repos\\sdk\\Agent365\\nodejs\\samples\\openai-agents-sdk\\dist\\index.js',
      'process.owner': 'pefan',
      'telemetry.sdk.language': 'nodejs',
      'telemetry.sdk.name': 'opentelemetry',
      'telemetry.sdk.version': '2.1.0'
    }
  },
  instrumentationScope: {
    name: 'openai-agents-tracer',
    version: '1.0.0',
    schemaUrl: undefined
  },
  traceId: '89fb62eb0d8a5658436fdd8eefb76942',
  parentSpanContext: {
    traceId: '89fb62eb0d8a5658436fdd8eefb76942',
    spanId: '545cbb53a808dc19',
    traceFlags: 1,
    traceState: undefined
  },
  traceState: undefined,
  name: 'execute_tool OneDriveMCPServer',
  id: '8f1a1cbe99cf4ef6',
  kind: 0,
  timestamp: 1761155395568000,
  duration: 5000,
  attributes: {
    'gen_ai.operation.name': 'execute_tool',
    'gen_ai.system': 'openai',
    'gen_ai.agent.id': 'REPLACE-WITH-YOUR-AGENT-ID-BUT-THIS-WILL-GO-AWAY-SOON',
    'gen_ai.event.content': '["graph_onedrive_createFolder","graph_onedrive_deleteFileOrFolder","graph_onedrive_listAllFiles","graph_onedrive_moveFileOrFolder","graph_onedrive_shareFileOrFolder"]',
    'gen_ai.tool.name': 'OneDriveMCPServer',
    'gen_ai.tool.type': 'extension'
  },
  status: { code: 1 },
  events: [],
  links: []
}
{
  resource: {
    attributes: {
      'service.name': 'TypeScript Sample Agent',
      'host.name': 'pefan4-0',
      'host.arch': 'amd64',
      'host.id': '3dc679db-f652-4002-98b7-5e05e5071507',
      'process.pid': 4448,
      'process.executable.name': 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'process.executable.path': 'C:\\Program Files\\nodejs\\node.exe',
      'process.command_args': [
        'C:\\Program Files\\nodejs\\node.exe',
        'D:\\repos\\sdk\\Agent365\\nodejs\\samples\\openai-agents-sdk\\dist\\index.js'
      ],
      'process.runtime.version': '20.18.3',
      'process.runtime.name': 'nodejs',
      'process.runtime.description': 'Node.js',
      'process.command': 'D:\\repos\\sdk\\Agent365\\nodejs\\samples\\openai-agents-sdk\\dist\\index.js',
      'process.owner': 'pefan',
      'telemetry.sdk.language': 'nodejs',
      'telemetry.sdk.name': 'opentelemetry',
      'telemetry.sdk.version': '2.1.0'
    }
  },
  instrumentationScope: {
    name: 'openai-agents-tracer',
    version: '1.0.0',
    schemaUrl: undefined
  },
  traceId: '8f9ebc7dc174208cd21a4d3939ef4455',
  parentSpanContext: undefined,
  traceState: undefined,
  name: 'invoke_agent OpenAI Agent',
  id: 'b98b2404088f8db4',
  kind: 0,
  timestamp: 1761063701211000,
  duration: 348000,
  attributes: {
    'gen_ai.operation.name': 'invoke_agent',
    'gen_ai.system': 'openai',
    'gen_ai.agent.id': 'REPLACE-WITH-YOUR-AGENT-ID-BUT-THIS-WILL-GO-AWAY-SOON',
    graph_node_id: 'OpenAI Agent'
  },
  status: { code: 2, message: 'Error in agent run' },
  events: [],
  links: []
}
{
  resource: {
    attributes: {
      'service.name': 'TypeScript Sample Agent',
      'host.name': 'pefan4-0',
      'host.arch': 'amd64',
      'host.id': '3dc679db-f652-4002-98b7-5e05e5071507',
      'process.pid': 53888,
      'process.executable.name': 'npm start',
      'process.executable.path': 'C:\\Program Files\\nodejs\\node.exe',
      'process.command_args': [
        'C:\\Program Files\\nodejs\\node.exe',
        'D:\\repos\\sdk\\Agent365\\nodejs\\samples\\openai-agents-sdk\\dist\\index.js'
      ],
      'process.runtime.version': '20.18.3',
      'process.runtime.name': 'nodejs',
      'process.runtime.description': 'Node.js',
      'process.command': 'D:\\repos\\sdk\\Agent365\\nodejs\\samples\\openai-agents-sdk\\dist\\index.js',
      'process.owner': 'pefan',
      'telemetry.sdk.language': 'nodejs',
      'telemetry.sdk.name': 'opentelemetry',
      'telemetry.sdk.version': '2.1.0'
    }
  },
  instrumentationScope: {
    name: 'openai-agents-tracer',
    version: '1.0.0',
    schemaUrl: undefined
  },
  traceId: '0f3cffc86d53373b64ac760d4d2ad489',
  parentSpanContext: {
    traceId: '0f3cffc86d53373b64ac760d4d2ad489',
    spanId: '148c242fffd8d4d0',
    traceFlags: 1,
    traceState: undefined
  },
  traceState: undefined,
  name: 'chat gpt-4o-mini-2024-07-18',
  id: '891ba741248959c1',
  kind: 0,
  timestamp: 1761152107806000,
  duration: 6392000,
  attributes: {
    'gen_ai.operation.name': 'chat',
    'gen_ai.system': 'openai',
    'gen_ai.agent.id': 'REPLACE-WITH-YOUR-AGENT-ID-BUT-THIS-WILL-GO-AWAY-SOON',
    'gen_ai.output.messages': `[{"id":"msg_06db8f945b1be6ff0068f90c6db78081a094b3e2975f51ee9c","type":"message","status":"completed","content":[{"type":"output_text","annotations":[],"logprobs":[],"text":"Determining the \\"best\\" park in the U.S. can be subjective, as it depends on personal preferences. However, some of the most highly regarded national parks include:\\n\\n1. **Yosemite National Park (California)** - Famous for its stunning granite cliffs, waterfalls, and diverse ecosystems.\\n2. **Yellowstone National Park (Wyoming, Montana, Idaho)** - Known for its geothermal features, wildlife, and expansive landscapes.\\n3. **Grand Canyon National Park (Arizona)** - Renowned for its awe-inspiring canyon views and hiking opportunities.\\n4. **Zion National Park (Utah)** - Celebrated for its dramatic cliffs, canyons, and hiking trails.\\n5. **Great Smoky Mountains National Park (Tennessee, North Carolina)** - Valued for its biodiversity and beautiful scenery.\\n\\nEach park offers unique experiences, so the \\"best\\" one depends on what you're looking for!"}],"role":"assistant"}]`,
    'gen_ai.request.model': 'gpt-4o-mini-2024-07-18',
    'gen_ai.usage.input_tokens': 14,
    'gen_ai.usage.output_tokens': 185,
    llm_token_count_total: 199,
    'gen_ai.input.messages': '[{"type":"message","role":"user","content":"which is the best park in US"}]'
  },
  status: { code: 1 },
  events: [],
  links: []
}
```

## Contributing

This project welcomes contributions and suggestions. Please follow the contributing guidelines in the main repository.

## License

This project is licensed under the MIT License - see the [LICENSE](../../../LICENSE.md) file for details.
