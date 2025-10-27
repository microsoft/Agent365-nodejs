# Agent365 Observability SDK for Node.js

## 🚀 Features

- **🔍 Agent Monitoring**: Specialized tracing for AI agent invocations with detailed telemetry
- **🛠️ Tool Execution Tracking**: Monitor tool executions and function calls with comprehensive metrics
- **📊 OpenTelemetry Integration**: Built-in OpenTelemetry tracing for standardized observability
- **☁️ Azure Monitor Support**: Seamless integration with Azure Monitor for cloud-based monitoring
- **🧳 Baggage Propagation**: Context propagation across distributed agent systems
- **🎯 Multiple Span Types**: Support for invoke agent, execute tool, and inference call spans
- **👤 Enhanced Caller Tracking**: Detailed agent information with caller details and agent metadata
- **🌐 Service Endpoint Support**: Track service endpoints with host, port, and protocol information
- **🧠 Granular Inference Telemetry**: Token counting, message recording, and finish reason tracking
- **↔️ C# Implementation Parity**: Full feature compatibility with the C# observability SDK

## 📋 Table of Contents

- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Span Types](#span-types)
- [Baggage Usage](#baggage-usage)
- [Enhanced Interfaces](#enhanced-interfaces)
- [Advanced Usage](#advanced-usage)

## 📦 Installation

Install the package via npm:

```bash
npm install @microsoft/agents-a365-observability
```

## 🌍 Environment Variables

The SDK supports various environment variables for configuration:

### Telemetry Control
- `ENABLE_OBSERVABILITY`: Enable/disable observability (default: `false`)
  - Values: `true`, `1`, `yes`, `on` (case-insensitive)
- `ENABLE_A365_OBSERVABILITY`: Alternative flag for enabling observability
  - Values: `true`, `1` (case-insensitive)

### Exporter Configuration
- `ENABLE_A365_OBSERVABILITY_EXPORTER`: Alternative flag for custom exporter
  - Values: `true`, `1`, `yes`, `on` (case-insensitive)

### Environment/Cluster Configuration
- `CLUSTER_CATEGORY`: Deployment environment (default: `prod`)
  - Values: `preprod`, `prod`

## 🚀 Quick Start

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
import { getUserManagedIdentityToken } from '@microsoft/agents-a365-runtime';

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

## ⚙️ Configuration

### BuilderOptions Interface

```typescript
interface BuilderOptions {
  /** Custom service name for telemetry */
  serviceName?: string;
  
  /** Custom service version for telemetry */
  serviceVersion?: string;
  
  /** Token resolver function for authentication */
  tokenResolver?: TokenResolver;
  
  /** Environment/cluster category (e.g., "preprod", "prod") */
  clusterCategory?: ClusterCategory;
}
```

### Token Resolver

When using the Agent365 exporter, you must provide a token resolver function for authentication. The token resolver can be either synchronous or asynchronous:

#### Async Token Resolver

```typescript
import { getUserManagedIdentityToken } from '@microsoft/agents-a365-runtime';

// Custom async token acquisition
const customAsyncTokenResolver = async (agentId: string, tenantId: string): Promise<string> => {
  // Implement your custom token acquisition logic
  const token = await getCustomTokenAsync(agentId, tenantId);
  return token;
};
```

#### Synchronous Token Resolver

```typescript
// Using cached tokens
const cachedTokenResolver = (agentId: string, tenantId: string): string => {
  const cacheKey = `${agentId}:${tenantId}`;
  return tokenCache.get(cacheKey) || 'default-token';
};
```

## 🎯 Span Types

The SDK provides three main span types for comprehensive agent observability:

### 1. Invoke Agent Spans

Track agent-to-agent invocations and human-to-agent interactions with enhanced caller information:

```typescript
import { 
  InvokeAgentScope, 
  ExecutionType, 
  CallerDetails, 
  EnhancedAgentDetails 
} from '@microsoft/agents-a365-observability';

// Basic agent invocation details
const invokeDetails = {
  agentId: 'email-agent-123',
  agentName: 'Email Assistant',
  agentDescription: 'AI assistant for email management',
  conversationId: 'conv-456',
  sessionId: 'session-789',
  endpoint: {
    host: 'agents.contoso.com',
    port: 443,
    protocol: 'https'
  },
  request: {
    content: 'Please help me organize my emails',
    executionType: ExecutionType.HumanToAgent,
    sessionId: 'session-123',
    sourceMetadata: {
      id: 'teams-channel-123',
      name: 'General Channel',
      description: 'Main team communication channel'
    }
  }
};

const tenantDetails = {
  tenantId: 'tenant-789'
};

// Optional: Caller details (human user)
const callerDetails: CallerDetails = {
  callerId: 'user-456',
  callerName: 'John Doe',
  callerUpn: 'john.doe@contoso.com',
  callerUserId: 'userid-789',
  tenantId: 'tenant-123'
};

// Optional: Caller agent details (for agent-to-agent calls)
const callerAgentDetails: EnhancedAgentDetails = {
  agentId: 'calendar-agent-789',
  agentName: 'Calendar Assistant',
  agentAUID: 'agent-auid-456',
  agentUPN: 'calendar-agent@contoso.com',
  agentBlueprintId: 'blueprint-calendar-v1',
  tenantId: 'tenant-123'
};

// Enhanced invocation with caller context
using scope = InvokeAgentScope.start(
  invokeDetails,
  tenantDetails,
  callerAgentDetails,
  callerDetails
);

try {
  // Record input messages
  scope.recordInputMessages(['Please help me organize my emails', 'Focus on urgent items']);
  
  // Your agent invocation logic here
  const response = await invokeAgent(invokeDetails.request.content);
  
  // Record output messages
  scope.recordOutputMessages(['I found 15 urgent emails', 'Here is your organized inbox']);
  
} catch (error) {
  scope.recordError(error as Error);
  throw error;
}
// Scope automatically disposed at end of using block
```

### 2. Execute Tool Spans

Track tool executions and function calls with endpoint support:

```typescript
import { ExecuteToolScope } from '@microsoft/agents-a365-observability';

const toolDetails = {
  toolName: 'email-search',
  arguments: JSON.stringify({ query: 'from:boss@company.com', limit: 10 }),
  toolCallId: 'tool-call-456',
  description: 'Search emails by criteria',
  toolType: 'function',
  endpoint: {
    host: 'tools.contoso.com',
    port: 8080,  // Will be recorded since not 443
    protocol: 'https'
  }
};

using scope = ExecuteToolScope.start(toolDetails, agentDetails, tenantDetails);

try {
  // Execute the tool
  const result = await searchEmails(toolDetails.arguments);
  
  // Record the tool execution result
  scope.recordResponse(JSON.stringify(result));
  
  return result;
} catch (error) {
  scope.recordError(error as Error);
  throw error;
}
```

### 3. Inference Call Spans

Track LLM/AI model inference calls with enhanced telemetry methods:

```typescript
import { InferenceScope, InferenceOperationType } from '@microsoft/agents-a365-observability';

const inferenceDetails = {
  operationName: InferenceOperationType.CHAT,
  model: 'gpt-4',
  providerName: 'openai',
  inputTokens: 150,
  outputTokens: 75,
  finishReasons: ['stop'],
  responseId: 'resp-123456'
};

using scope = InferenceScope.start(inferenceDetails, agentDetails, tenantDetails);

try {
  // Record input messages
  scope.recordInputMessages(['Summarize the following emails for me...']);
  
  // Call the LLM
  const response = await callLLM();
  
  // Record detailed telemetry with granular methods
  scope.recordOutputMessages(['Here is your email summary...']);
  scope.recordInputTokens(145);  // Update if different from constructor
  scope.recordOutputTokens(82);  // Update if different from constructor
  scope.recordResponseId('resp-789123');
  scope.recordFinishReasons(['stop', 'max_tokens']);
  
  return response.text;
} catch (error) {
  scope.recordError(error as Error);
  throw error;
}
```

#### Available Methods for Inference Scope:

- `recordInputMessages(messages: string[])` - Record input message array
- `recordOutputMessages(messages: string[])` - Record output message array  
- `recordInputTokens(inputTokens: number)` - Record input token count
- `recordOutputTokens(outputTokens: number)` - Record output token count
- `recordResponseId(responseId: string)` - Record response ID with validation
- `recordFinishReasons(finishReasons: string[])` - Record finish reasons array

## 🧳 Baggage Usage

Baggage enables context propagation across distributed agent systems. Use the `BaggageBuilder` to set contextual information that flows through all spans in a request:

### Basic Baggage Usage

```typescript
import { BaggageBuilder } from '@microsoft/agents-a365-observability';

// Create and apply baggage context
using baggageScope = new BaggageBuilder()
  // Core identifiers
  .tenantId('tenant-123')
  .agentId('agent-456')
  .correlationId('correlation-789')
  
  // Agent information
  .agentName('Email Assistant')
  .agentDescription('AI assistant for email management')
  .agentAuid('auid-123')  // Agent User ID
  .agentUpn('agent@company.com')
  .agentBlueprintId('blueprint-456')
  
  // Caller information
  .callerId('user-789')
  .callerName('Jane Smith')
  .callerUpn('jane.smith@company.com')
  
  // Conversation context
  .conversationId('conv-123')
  .conversationItemLink('https://teams.microsoft.com/...')
  
  // Source metadata (e.g., Teams channel)
  .sourceMetadataId('channel-123')
  .sourceMetadataName('msteams')
  .sourceMetadataDescription('Main team channel')
  
  // Operation context
  .operationSource('sdk')
  .hiringManagerId('manager-456')
  .build();

// Execute operations within the baggage context
baggageScope.run(() => {
  // All spans created within this context will inherit the baggage values
  
  // Invoke another agent
  using agentScope = InvokeAgentScope.start(invokeDetails, agentDetails, tenantDetails);
  // ... agent logic
  
  // Execute tools
  using toolScope = ExecuteToolScope.start(toolDetails, agentDetails, tenantDetails);
  // ... tool logic
});
```

## � Enhanced Interfaces

### CallerDetails Interface
For tracking non-agent callers (human users):

```typescript
interface CallerDetails {
  callerId?: string;
  callerName?: string;
  callerUpn?: string;
  callerUserId?: string;
  tenantId?: string;
}
```

### EnhancedAgentDetails Interface
For tracking caller agent information in agent-to-agent calls:

```typescript
interface EnhancedAgentDetails extends AgentDetails {
  agentAUID?: string;          // Agent User ID
  agentUPN?: string;           // Agent User Principal Name
  agentBlueprintId?: string;   // Agent Blueprint/Application ID
  tenantId?: string;           // Agent tenant ID
}
```

### ServiceEndpoint Interface
For endpoint information in tool calls and agent invocations:

```typescript
interface ServiceEndpoint {
  host: string;
  port?: number;               // Defaults to 443 for HTTPS
  protocol?: string;           // http or https
}
```

## �🔧 Advanced Usage

### Enhanced Agent Invocation Methods

InvokeAgentScope provides methods for recording detailed message arrays and responses:

```typescript
using scope = InvokeAgentScope.start(invokeDetails, tenantDetails, callerAgentDetails, callerDetails);

// Record multiple input messages
scope.recordInputMessages([
  'Please analyze my email traffic',
  'Focus on the last 7 days',
  'Include sender statistics'
]);

// Record multiple output messages
scope.recordOutputMessages([
  'Analysis complete',
  'Found 147 emails from 23 unique senders',
  'Most active sender: boss@company.com (45 emails)'
]);
```

### Granular Inference Telemetry

InferenceScope supports detailed telemetry recording:

```typescript
using scope = InferenceScope.start(inferenceDetails, agentDetails, tenantDetails);

// Record tokens separately
scope.recordInputTokens(250);
scope.recordOutputTokens(180);

// Record response metadata
scope.recordResponseId('chat-resp-456789');
scope.recordFinishReasons(['stop', 'length']);

// Record message arrays
scope.recordInputMessages(['System prompt', 'User message']);
scope.recordOutputMessages(['Assistant response']);
```

### Manual Scope Management

If you prefer manual disposal over `using` declarations:

```typescript
const scope = InvokeAgentScope.start(invokeDetails, tenantDetails, callerAgentDetails, callerDetails);

try {
  // Your logic here
  const result = await processRequest();
  scope.recordOutputMessages([result]);
} catch (error) {
  scope.recordError(error as Error);
  throw error;
} finally {
  scope.dispose(); // Manual cleanup
}
```

### Error Handling and Recording

```typescript
using scope = ExecuteToolScope.start(toolDetails, agentDetails, tenantDetails);

try {
  const result = await executeTool();
  scope.recordResponse(JSON.stringify(result));
} catch (error) {
  // Record detailed error information
  scope.recordError(error as Error);
  
  throw error; // Re-throw to maintain error flow
}
```

### Shutdown and Cleanup

```typescript
// Graceful shutdown
await ObservabilityManager.shutdown();
```