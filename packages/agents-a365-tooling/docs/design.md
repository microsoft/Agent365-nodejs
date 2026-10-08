# Tooling - Design Document

This document describes the architecture and design of the `@microsoft/agents-a365-tooling` package.

## Overview

The tooling package provides MCP (Model Context Protocol) tool server configuration and discovery services. It enables agents to dynamically discover and connect to tool servers for extending agent capabilities.

It also provides `DefenderRtpClient`, the client for Microsoft Defender for AI real-time protection (Defender RTP) on the agent-hooks control contract. The agent-hooks interceptor that drives it is in `@microsoft/agents-a365-tooling-extensions-agenthooks`.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Public API                                │
│  McpToolServerConfigurationService | Utility | Contracts        │
│  ToolingConfiguration                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              McpToolServerConfigurationService                   │
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │   Development Mode   │    │   Production Mode   │            │
│  │                     │    │                     │            │
│  │ ToolingManifest.json│    │  Tooling Gateway    │            │
│  │    (local file)     │    │   (HTTP endpoint)   │            │
│  └─────────────────────┘    └─────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     MCPServerConfig[]                            │
│  { mcpServerName, url, headers? }                               │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### McpToolServerConfigurationService ([McpToolServerConfigurationService.ts](../src/McpToolServerConfigurationService.ts))

The main service for discovering and configuring MCP tool servers.

```typescript
import { McpToolServerConfigurationService } from '@microsoft/agents-a365-tooling';

const service = new McpToolServerConfigurationService();

// Discover tool servers
const servers = await service.listToolServers(
  agenticAppId,
  bearerToken,
  { orchestratorName: 'MyOrchestrator' }
);

// Get tools from a specific server
const tools = await service.getMcpClientTools(
  server.mcpServerName,
  server
);
```

#### Environment Detection

The service automatically selects the configuration source based on the `ToolingConfiguration.useToolingManifest` setting:

| Configuration | Source | Description |
|---------------|--------|-------------|
| `useToolingManifest: true` | `ToolingManifest.json` | Local file-based configuration |
| `useToolingManifest: false` (default) | Tooling Gateway | HTTP endpoint discovery |

The `useToolingManifest` property checks `NODE_ENV === 'development'` by default, but can be overridden via configuration:

```typescript
private isDevScenario(): boolean {
  return defaultToolingConfigurationProvider.getConfiguration().useToolingManifest;
}
```

#### Development Mode: Manifest-Based Configuration

In development mode, the service reads from `ToolingManifest.json`:

```json
{
  "mcpServers": [
    {
      "mcpServerName": "mailMCPServer",
      "mcpServerUniqueName": "mcp_MailTools"
    },
    {
      "mcpServerName": "sharePointMCPServer",
      "mcpServerUniqueName": "mcp_SharePointTools"
    }
  ]
}
```

**Search locations for manifest file:**
1. Current working directory (`process.cwd()`)
2. Directory of the main script (`process.argv[1]`)

#### Production Mode: Gateway-Based Configuration

In production mode, the service calls the tooling gateway endpoint:

```
GET https://agent365.svc.cloud.microsoft/agents/{agenticAppId}/mcpServers
Authorization: Bearer {authToken}
User-Agent: Agent365SDK/x.x.x (...)
```

### Utility Class ([Utility.ts](../src/Utility.ts))

Helper functions for token validation and header composition:

```typescript
import { Utility } from '@microsoft/agents-a365-tooling';

// Compose standard headers for MCP requests
const headers = Utility.GetToolRequestHeaders(
  authToken,
  turnContext,
  { orchestratorName: 'MyOrchestrator' }
);

// Validate JWT token (throws if invalid or expired)
Utility.ValidateAuthToken(authToken);
```

**Deprecated Methods:**

The following URL construction methods are deprecated and for internal use only. Use `McpToolServerConfigurationService` instead:

| Method | Replacement |
|--------|-------------|
| `GetToolingGatewayForDigitalWorker()` | `McpToolServerConfigurationService.listToolServers()` |
| `GetMcpBaseUrl()` | Use `McpToolServerConfigurationService` |
| `BuildMcpServerUrl()` | Use `McpToolServerConfigurationService` |
| `GetChatHistoryEndpoint()` | `McpToolServerConfigurationService.sendChatHistory()` |

**Header Constants:**

| Constant | Header Name |
|----------|-------------|
| `HEADER_CHANNEL_ID` | `x-ms-channel-id` |
| `HEADER_SUBCHANNEL_ID` | `x-ms-subchannel-id` |
| `HEADER_USER_AGENT` | `User-Agent` |

### DefenderRtpClient ([DefenderRtpClient.ts](../src/defender/DefenderRtpClient.ts))

Client for the Microsoft Defender for AI prevention endpoint (`POST .../v1/protection/evaluate`). Defender
evaluates four agent-hooks/0.1 interception points: `input` (the user's message, before the agent runs),
`pre_tool_call`, `post_tool_call`, and `output` (the reply, before it is sent).

```typescript
import { DefenderRtpClient, DefenderRtpTokenResolvers } from '@microsoft/agents-a365-tooling';

const defender = new DefenderRtpClient(); // defaultToolingConfigurationProvider
const tokens = DefenderRtpTokenResolvers.fromAgenticConnection(connection);

await defender.prefetchAccessToken({ agentId, tenantId }, tokens); // optional, at startup

const result = await defender.evaluateHookContext(agentHooksContext, { agentId, tenantId, userId }, tokens);
// null when disabled or the point is not evaluated
if (result && !result.allowed) { /* block: result.blockReason */ }
```

- **Forwarding**: `evaluateHookContext` sends a copy of the emitted context, fitted to Defender's request
  validation, and never modifies the host's context. The copy keeps the session, sequence and tool call ids.
  When the context has no `sequence`, the client numbers each session's contexts itself, for the last 1000
  sessions; a session seen again after that resumes above every number given to a dropped session, so its
  sequence keeps increasing. `spec` is `agent-hooks/0.1`, the timestamp is UTC, `agent.framework` matches
  `^[a-z0-9_-]+$`, `target` equals the point's field, `tool_call`/`tool_result` carry only spec members, and
  loosely filled optional fields (extensions, model, tools, messages, actor) are repaired or dropped. `tenant.id`
  is always the agent's tenant, because Defender requires it to equal the token's tenant (a different host tenant
  is replaced, with its other fields). `agent.id`, `actor`, `request_id` and `model` are filled from
  `DefenderRtpAgentContext` when the context has none. Every optional field is shape-checked before it is read:
  one of another shape (for example a `model` or `actor` that is a string, a `request_id` that is not a string,
  or an `a365` extension that is not an object) is left out, never indexed, so it cannot fail an evaluation; a
  `session` that is not an object has no `session.id`, which is required. Every string and object key is well
  formed: a lone UTF-16 surrogate becomes U+FFFD (`String.prototype.toWellFormed`, with a fallback on Node.js 18),
  because `JSON.stringify` would write it as a `\uD8xx` escape that Defender's JSON parser rejects, failing the
  request. When two keys of one object become equal that way, only the first is sent, and in the content under
  decision the copy counts as incomplete.
- **Size**: the copy is built while reading the context, field by field, never by serializing it whole.
  - Each content string (input and output content, tool arguments and results, tool descriptions and schemas,
    messages, extensions, other fields) is cut to at most `defenderRtpMaxContentCharacters`, ending with a
    `...[truncated N chars]` marker when the marker fits, and nesting deeper than 32 levels is cut.
  - The whole copy carries at most four times `defenderRtpMaxContentCharacters` of content. Strings, keys and
    other values count their length (at least one character, so empty strings and nulls count too); each array,
    object, tool declaration and message counts one more; and tool declarations and messages count their keys.
  - The content under decision comes first and may use half of the total, as it is sent twice (`target` mirrors
    it). Twice what it leaves goes to the rest of the context, in this order: the tool call arguments at
    `post_tool_call`, the tool declarations (the called tool first and always declared, from
    `extensions.a365.tool` when `tools` leaves it out), the newest messages, extensions, then any other fields.
  - Lists and objects are read only as far as the budget reaches, so a huge one is never scanned whole: the
    called tool is looked for only among the declarations that could fit (otherwise it is declared by name), the
    history is read newest first and stops before a message without a role or content, and keys that cost
    nothing (namespaces Defender does not accept, values JSON leaves out) count toward what is read.
  - Identifiers and protocol fields (`spec`, `timestamp`, `agent`, `session`, `tenant`, `actor`, `model`,
    `request_id`, `trace`, tool call ids and names, `input.role`) are sent whole and do not count.
- **Truncated content**: when the content under decision (`input.content`, `tool_call.args` at
  `pre_tool_call`, `tool_result.value` at `post_tool_call`, `output.content`) was cut (a string longer than the
  limit, nesting deeper than 32 levels, or more content than its share), or two of its keys became one once made
  well formed, Defender saw only part of it. A block (`deny` or `transform`) still stands, but an allow does not
  cover the rest: the result is `truncated: true`, `allowed` follows `defenderRtpFailClosed`, and `error` says
  why. Otherwise content padded past the limit would be authorized unseen. Trimming elsewhere (tool
  declarations, extensions, messages) does not count.
- **Authentication**: always the agent identity's app-only token in the agent's tenant, for the Defender API
  (`api://86a21212-634e-4553-b3d6-e477e4c9d9ec/.default`, app role `RealtimeProtection.Evaluate.All`).
  `DefenderRtpTokenResolver` is `(agentId, tenantId, scopes, signal) => token`;
  `DefenderRtpTokenResolvers.fromAgenticConnection` gets the agent identity's assertion from the Agents SDK
  connection (`getAgenticApplicationToken`) and exchanges it (`client_credentials` with a `jwt-bearer` client
  assertion). Tokens are cached per agent, tenant and scope until five minutes before expiry, and concurrent
  evaluations share one acquisition; the shared entry is dropped when the acquisition completes, and a failed
  acquisition is never cached. Within five minutes of expiry, evaluations keep using the still-valid cached token
  while it is refreshed in the background, so a slow or failed early refresh neither delays nor fails them
  (`prefetchAccessToken` waits for the refresh and reports its failure). The endpoint and the token authority must
  be absolute `https` URLs.
- **Correlation**: every call sends a unique `x-ms-correlation-id`, returned as `result.correlationId`.
- **Verdicts**: `allow` proceeds (warnings and `resultLabels` are kept); `deny` and `transform` block. Members of
  another shape in a response (a `transform` that is not an object, warnings or labels that are not arrays) are
  ignored, so they never cost Defender its decision; likewise a `400` whose `diagnostics` has another shape is
  reported by its title, and a token whose payload has no numeric `exp` is used but not cached.
- **Failures**: a token, transport, timeout, HTTP or response failure, or any other error while sending or reading
  (for example from a wrapping fetch), returns `evaluated: false`, with `allowed` following `defenderRtpFailClosed`
  and the reason in `error` (a `400` lists the failed validation rules); only the caller's own cancellation
  rejects. One deadline (`defenderRtpTimeoutMilliseconds`) bounds each evaluation, token acquisition included. An
  invalid context (for example one without `session.id`, or with a circular reference) or agent identity throws;
  `unavailable(...)` builds the matching not-evaluated result.

The client has no agent-hooks dependency: contexts are plain JSON (`DefenderRtpHookContext`).

## Data Models

### MCPServerConfig ([contracts.ts](../src/contracts.ts))

```typescript
interface MCPServerConfig {
  mcpServerName: string;      // Display name of the tool server
  url: string;                // Full URL endpoint for the MCP server
  headers?: Record<string, string>;  // Optional request headers
}
```

### McpClientTool

```typescript
interface McpClientTool {
  name: string;               // Tool name
  description?: string;       // Tool description
  inputSchema: InputSchema;   // JSON schema for tool inputs
}
```

### InputSchema

```typescript
interface InputSchema {
  type: string;
  properties?: Record<string, object>;
  required?: string[];
  additionalProperties?: boolean;
}
```

### ToolOptions

```typescript
interface ToolOptions {
  orchestratorName?: string;  // Name for User-Agent header
}
```

## Design Patterns

### Strategy Pattern

The service uses the Strategy pattern to select between configuration sources:

```typescript
async listToolServers(agenticAppId: string, authToken: string): Promise<MCPServerConfig[]> {
  return this.isDevScenario()
    ? this.getMCPServerConfigsFromManifest()        // Strategy A
    : this.getMCPServerConfigsFromToolingGateway(); // Strategy B
}
```

### MCP Client Integration

The service uses the official MCP SDK for tool discovery:

```typescript
async getMcpClientTools(serverName: string, config: MCPServerConfig): Promise<McpClientTool[]> {
  const transport = new StreamableHTTPClientTransport(
    new URL(config.url),
    { requestInit: { headers: config.headers } }
  );

  const client = new Client({ name: serverName + ' Client', version: '1.0' });
  await client.connect(transport);
  const tools = await client.listTools();
  await client.close();

  return tools.tools;
}
```

## Configuration

The tooling package provides configuration via `ToolingConfiguration`, which extends `RuntimeConfiguration`:

```typescript
import {
  ToolingConfiguration,
  defaultToolingConfigurationProvider
} from '@microsoft/agents-a365-tooling';

// Using the default provider (reads from env vars)
const config = defaultToolingConfigurationProvider.getConfiguration();
console.log(config.mcpPlatformEndpoint);  // MCP platform base URL
console.log(config.useToolingManifest);     // true if NODE_ENV=development
console.log(config.mcpPlatformAuthenticationScope);  // MCP auth scope

// Custom configuration with overrides
const customConfig = new ToolingConfiguration({
  mcpPlatformEndpoint: () => 'https://custom.endpoint',
  useToolingManifest: () => true,  // Force manifest mode
  mcpPlatformAuthenticationScope: () => 'custom-scope/.default'
});
```

**Configuration Properties:**

| Property | Env Variable | Default | Description |
|----------|--------------|---------|-------------|
| `mcpPlatformEndpoint` | `MCP_PLATFORM_ENDPOINT` | `https://agent365.svc.cloud.microsoft` | Base URL for MCP platform |
| `useToolingManifest` | `NODE_ENV` | `false` | Use local manifest (true if NODE_ENV='development') |
| `mcpPlatformAuthenticationScope` | `MCP_PLATFORM_AUTHENTICATION_SCOPE` | Production scope | OAuth scope for MCP platform auth |
| `isDefenderRtpEnabled` | `ENABLE_A365_DEFENDER_RTP` | `false` | Enables Defender RTP (`DefenderRtpClient`) |
| `defenderRtpEndpoint` | `A365_DEFENDER_RTP_ENDPOINT` | None (required when enabled) | Defender prevention endpoint |
| `defenderRtpFailClosed` | `A365_DEFENDER_RTP_FAIL_MODE` | `false` (open) | `closed` blocks when no verdict is obtained; values other than `open` and `closed` throw |
| `defenderRtpTimeoutMilliseconds` | `A365_DEFENDER_RTP_TIMEOUT_MILLISECONDS` | `10000` | Timeout of each evaluation; at most 2147481647, as Node fires a longer timer after 1 ms |
| `defenderRtpAuthenticationScope` | `A365_DEFENDER_RTP_AUTHENTICATION_SCOPE` | Defender API scope | OAuth scope of the Defender token |
| `defenderRtpMaxContentCharacters` | `A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS` | `20000` | Maximum characters of each content string; the request carries at most four times as much content |
| `clusterCategory` | `CLUSTER_CATEGORY` | `prod` | (Inherited) Environment cluster |
| `isDevelopmentEnvironment` | - | Derived | (Inherited) true if cluster is 'local' or 'dev' |
| `isNodeEnvDevelopment` | `NODE_ENV` | `false` | (Inherited) true if NODE_ENV='development' |

## File Structure

```
src/
├── index.ts                              # Public API exports
├── McpToolServerConfigurationService.ts  # Main service
├── Utility.ts                            # Helper utilities
├── contracts.ts                          # Type definitions
├── models.ts                             # Data models
├── configuration/
│   ├── index.ts                          # Configuration exports
│   ├── ToolingConfigurationOptions.ts    # Options type
│   └── ToolingConfiguration.ts           # Configuration class
└── defender/
    ├── index.ts                          # Defender RTP exports
    ├── contracts.ts                      # Agent context, token resolver, evaluation result
    ├── DefenderRtpClient.ts              # Defender prevention endpoint client
    └── DefenderRtpTokenResolvers.ts      # Agent identity token resolver (fromAgenticConnection)
```

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `NODE_ENV` | Controls useToolingManifest (dev mode) | Production |
| `MCP_PLATFORM_ENDPOINT` | Base URL for MCP platform | `https://agent365.svc.cloud.microsoft` |
| `MCP_PLATFORM_AUTHENTICATION_SCOPE` | OAuth scope for MCP platform | Production scope |
| `ENABLE_A365_DEFENDER_RTP` | Enables Defender RTP | `false` |
| `A365_DEFENDER_RTP_ENDPOINT` | Defender prevention endpoint (`https://<host>/v1/protection/evaluate`) | None |
| `A365_DEFENDER_RTP_FAIL_MODE` | `closed` blocks when no verdict is obtained; values other than `open` and `closed` are rejected | `open` |
| `A365_DEFENDER_RTP_TIMEOUT_MILLISECONDS` | Timeout of each evaluation (at most 2147481647) | `10000` |
| `A365_DEFENDER_RTP_AUTHENTICATION_SCOPE` | OAuth scope of the Defender token | Defender API scope |
| `A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS` | Maximum characters of each content string; the request carries at most four times as much content | `20000` |

## Error Handling

The service provides detailed error messages:

```typescript
// Token validation errors
Error('Authentication token is required')
Error('Invalid JWT token format')
Error('Failed to decode JWT token payload')
Error('Authentication token has expired')
Error('Authentication token does not contain expiration claim')

// Gateway errors
Error(`Failed to read MCP servers from endpoint: ${code} ${message}`)
```

## Dependencies

- `@microsoft/agents-a365-runtime` - Agent identity resolution, User-Agent generation
- `@microsoft/agents-hosting` - TurnContext type
- `@modelcontextprotocol/sdk` - MCP client and transport
- `axios` - HTTP client for gateway communication

## Integration with Framework Extensions

The tooling package is extended by framework-specific packages:

| Extension Package | Purpose |
|-------------------|---------|
| `tooling-extensions-agenthooks` | agent-hooks interceptor for Defender RTP (`A365DefenderInterceptor`) |
| `tooling-extensions-claude` | Claude SDK integration |
| `tooling-extensions-langchain` | LangChain integration |
| `tooling-extensions-openai` | OpenAI Agents SDK integration |

The framework extensions adapt the `MCPServerConfig` objects to framework-specific tool definitions.
