# Changelog

All notable changes to the Agent365 TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-04-15

### Breaking Changes (`@microsoft/agents-a365-observability`)

- **New permission required: `Agent365.Observability.OtelWrite`** — The observability exporter now requires this scope as both a delegated and application permission on your agent blueprint. See [Upgrade Instructions](#upgrade-instructions-observability-permission-for-existing-agents) below.

---

<a id="upgrade-instructions-observability-permission-for-existing-agents"></a>

### Upgrade Instructions: Observability Permission for Existing Agents

Existing agent blueprints need `Agent365.Observability.OtelWrite` granted as both a **delegated permission** and an **application permission**. Choose either option below.

#### Option A — Agent 365 CLI (requires both config files)

Requires `a365.config.json` and `a365.generated.config.json` in your config directory, a Global Administrator account, and [Agent 365 CLI v1.1.139-preview](https://www.nuget.org/packages/Microsoft.Agents.A365.DevTools.Cli/1.1.139-preview) or later.

```bash
a365 setup admin --config-dir "<path-to-config-dir>"
```

This grants all missing permissions including the new Observability scopes.

#### Option B — Entra Portal (no config files required)

Requires Global Administrator access to the blueprint app registration.

1. Go to **Entra portal** > **App registrations** > select your Blueprint app
2. Go to **API permissions** > **Add a permission** > **APIs my organization uses** > search for `9b975845-388f-4429-889e-eab1ef63949c`
3. Select **Delegated permissions** > check `Agent365.Observability.OtelWrite` > **Add permissions**
4. Repeat step 2–3, this time select **Application permissions** > check `Agent365.Observability.OtelWrite` > **Add permissions**
5. Click **Grant admin consent** and confirm

Both `Agent365.Observability.OtelWrite` (Delegated) and `Agent365.Observability.OtelWrite` (Application) should show `Granted` status.

---

## [Unreleased]

### Added (`@microsoft/agents-a365-tooling`)

- **V1/V2 per-audience token acquisition** — `resolveTokenScopeForServer` now supports explicit `scope` field for V2 MCP servers. When a V2 server provides a `scope` value, the token is requested as `{audience}/{scope}`; otherwise falls back to `{audience}/.default` (pre-consented permissions cover both cases).

### Fixed (`@microsoft/agents-a365-tooling-extensions-openai`, `@microsoft/agents-a365-tooling-extensions-langchain`)

- **Per-audience Authorization headers now correctly applied** — OpenAI and LangChain extensions now merge the per-server `Authorization: Bearer` token from `server.headers` (set by `attachPerAudienceTokens`) with base request headers, instead of applying a single shared discovery token to all MCP servers. This ensures V2 servers receive their own correctly-scoped token.

### Breaking Changes (`@microsoft/agents-a365-observability`)

- **`InvokeAgentDetails` renamed to `InvokeAgentScopeDetails`** — Now contains only scope-level config (`endpoint`). Agent identity (`AgentDetails`) is a separate parameter. `sessionId` moved to `Request`.
- **`InvokeAgentScope.start()` — new signature.** `start(request, invokeScopeDetails, agentDetails, callerDetails?, spanDetails?)`. Tenant ID is derived from `agentDetails.tenantId` (required). `userDetails` and `callerAgentDetails` are wrapped in `CallerDetails`. Span options grouped in `SpanDetails`.
- **`InferenceScope.start()` — new signature.** `start(request, details, agentDetails, userDetails?, spanDetails?)`. Tenant ID derived from `agentDetails.tenantId` (required).
- **`ExecuteToolScope.start()` — new signature.** `start(request, details, agentDetails, userDetails?, spanDetails?)`. Tenant ID derived from `agentDetails.tenantId` (required).
- **`OutputScope.start()` — new signature.** `start(request, response, agentDetails, userDetails?, spanDetails?)`. Tenant ID derived from `agentDetails.tenantId` (required).
- **`tenantDetails` parameter removed** from all scope `start()` methods. Tenant ID is now required on `AgentDetails.tenantId`; scopes throw if missing.
- **`AgentRequest` renamed to `Request`** — Unified request interface used across all scopes. Removed `executionType` field. Removed separate `InferenceRequest`, `ToolRequest`, `OutputRequest`.
- **`CallerDetails` renamed to `UserDetails`** — Represents the human caller identity.
- **`injectTraceContext()` renamed to `injectContextToHeaders()`**.
- **`extractTraceContext()` renamed to `extractContextFromHeaders()`**.
- **Caller dimension constants renamed to `user.*` namespace** — Aligns with OpenTelemetry semantic conventions and .NET SDK:
  - `GEN_AI_CALLER_ID_KEY` (`microsoft.caller.id`) → `USER_ID_KEY` (`user.id`)
  - `GEN_AI_CALLER_NAME_KEY` (`microsoft.caller.name`) → `USER_NAME_KEY` (`user.name`)
  - `GEN_AI_CALLER_UPN_KEY` (`microsoft.caller.upn`) → `USER_EMAIL_KEY` (`user.email`)
  - `GEN_AI_AGENT_UPN_KEY` (`microsoft.agent.user.upn`) → `GEN_AI_AGENT_EMAIL_KEY` (`microsoft.agent.user.email`)
  - `GEN_AI_CALLER_AGENT_UPN_KEY` (`microsoft.a365.caller.agent.user.upn`) → `GEN_AI_CALLER_AGENT_EMAIL_KEY` (`microsoft.a365.caller.agent.user.email`)
- **`UserDetails` properties renamed** — `callerId` → `userId`, `callerUpn` → `userEmail`, `callerName` → `userName`.
- **`AgentDetails.agentUPN` renamed to `AgentDetails.agentEmail`**.
- **`BaggageBuilder` methods renamed** — `callerId()` → `userId()`, `callerName()` → `userName()`, `callerUpn()` → `userEmail()`, `agentUpn()` → `agentEmail()`.
- **`SourceMetadata` renamed to `Channel`** — The exported interface representing invocation channel information is renamed from `SourceMetadata` to `Channel`. The `AgentRequest.sourceMetadata` property is renamed to `channel`.
- **`BaggageBuilder.serviceName()` renamed to `BaggageBuilder.operationSource()`** — Fluent setter for the service name baggage value.
- **`BaggageBuilder.sourceMetadataName()` renamed to `BaggageBuilder.channelName()`** — Fluent setter for the channel name baggage value.
- **`BaggageBuilder.sourceMetadataDescription()` renamed to `BaggageBuilder.channelLink()`** — Fluent setter for the channel link baggage value.

- **`OutputResponse.messages` type changed from `string[]` to `OutputMessagesParam`** — The `OutputMessagesParam` union type (`string[] | OutputMessages`) allows passing either plain strings or a versioned `OutputMessages` wrapper (`{ version, messages: OutputMessage[] }`) with `finish_reason`, multi-modal parts, etc. Existing code passing `string[]` continues to work (auto-converted to OTEL format internally), preserving backward compatibility.
- **`recordInputMessages()` / `recordOutputMessages()` parameter type widened** — Methods now accept `InputMessagesParam` (`string[] | InputMessages`) and `OutputMessagesParam` (`string[] | OutputMessages`). `InputMessages` is a versioned wrapper `{ version, messages: ChatMessage[] }` and `OutputMessages` is a versioned wrapper `{ version, messages: OutputMessage[] }`. Plain `string[]` input is auto-wrapped to OTEL gen-ai format.

### Added

#### `@microsoft/agents-a365-observability`
- **OTEL Gen-AI Message Format types** — New types aligned with [OpenTelemetry Gen-AI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/): `MessageRole`, `FinishReason`, `Modality`, `ChatMessage`, `OutputMessage`, `InputMessages`, `OutputMessages`, and discriminated `MessagePart` union (`TextPart`, `ToolCallRequestPart`, `ToolCallResponsePart`, `ReasoningPart`, `BlobPart`, `FilePart`, `UriPart`, `ServerToolCallPart`, `ServerToolCallResponsePart`, `GenericPart`).
- **`SpanDetails`** — New interface grouping `parentContext`, `startTime`, `endTime`, `spanKind` for scope construction.
- **`CallerDetails`** — New interface wrapping `userDetails` and `callerAgentDetails` for `InvokeAgentScope`.
- **`Request`** — Unified request context interface (`conversationId`, `channel`, `content`, `sessionId`) used across all scopes.
- **`OpenTelemetryScope.recordCancellation()`** — Records a cancellation event on the span with `error.type = 'TaskCanceledException'`.
- **`OpenTelemetryConstants.ERROR_TYPE_CANCELLED`** — Constant for the cancellation error type value.
- **`ObservabilityBuilder.withServiceNamespace()`** — Configures the `service.namespace` resource attribute.
- **Span links support** — All scope classes (`InvokeAgentScope`, `InferenceScope`, `ExecuteToolScope`, `OutputScope`) now support span links via `SpanDetails.spanLinks` (passed through the existing `spanDetails?` argument) to establish causal relationships to other spans (e.g. linking a batch operation to individual trigger spans).
- **`BaggageBuilder.invokeAgentServer(address, port?)`** — Fluent setter for server address and port baggage values. Port is only recorded when different from 443 (default HTTPS). Clears stale port entries when port is omitted or 443.
- **Agent365ExporterOptions** — New `httpRequestTimeoutMilliseconds` option (default 30s) controls the per-HTTP-request timeout for backend calls. This is distinct from `exporterTimeoutMilliseconds` which controls the overall BatchSpanProcessor export deadline.

#### `@microsoft/agents-a365-observability-hosting`
- **OutputScope** — Tracing scope for outgoing agent messages with caller details, conversation ID, channel information, and parent span linking.
- **BaggageMiddleware** — Middleware for automatic OpenTelemetry baggage propagation from TurnContext.
- **OutputLoggingMiddleware** — Middleware that creates OutputScope spans for outgoing messages with lazy parent span linking via `A365_PARENT_SPAN_KEY`.
- **ObservabilityHostingManager** — Manager for configuring hosting-layer observability middleware with `ObservabilityHostingOptions`.

### Breaking Changes (`@microsoft/agents-a365-observability-hosting`)

- **`ScopeUtils.deriveCallerDetails()` now returns renamed properties** — `callerId` → `userId`, `callerUpn` → `userEmail`, `callerName` → `userName` (matching `CallerDetails` rename).
- **`ScopeUtils.deriveAgentDetails()` / `deriveCallerAgent()` now return `agentEmail` instead of `agentUPN`** (matching `AgentDetails` rename).
- **`getCallerBaggagePairs()` now emits `user.id`, `user.name`, `user.email`** instead of `microsoft.caller.id`, `microsoft.caller.name`, `microsoft.caller.upn`.
- **`ScopeUtils.deriveSourceMetadataObject()` renamed to `ScopeUtils.deriveChannelObject()`**.
- **`BaggageBuilderUtils.setSourceMetadataBaggage()` renamed to `BaggageBuilderUtils.setChannelBaggage()`**.
- **`getSourceMetadataBaggagePairs()` renamed to `getChannelBaggagePairs()`** in `TurnContextUtils`.
- **`ScopeUtils.deriveAgentDetails(turnContext, authToken)`** — New required `authToken: string` parameter.
- **`ScopeUtils.populateInferenceScopeFromTurnContext(details, turnContext, authToken, ...)`** — New required `authToken: string` parameter.
- **`ScopeUtils.populateInvokeAgentScopeFromTurnContext(details, turnContext, authToken, ...)`** — New required `authToken: string` parameter.
- **`ScopeUtils.populateExecuteToolScopeFromTurnContext(details, turnContext, authToken, ...)`** — New required `authToken: string` parameter.
- **`ScopeUtils.buildInvokeAgentDetails()`** — Now accepts `AgentDetails` (was `InvokeAgentDetails`) and returns flat `AgentDetails` instead of the old `InvokeAgentDetails` wrapper.

### Fixed

#### `@microsoft/agents-a365-observability`
- **Agent365ExporterOptions** — `exporterTimeoutMilliseconds` default increased from 30s to 90s to allow sufficient time for retries across multiple identity groups within a single export cycle.

### Changed

#### `@microsoft/agents-a365-observability`
- **InferenceScope.recordInputMessages() / recordOutputMessages()** — Now use JSON array format instead of comma-separated strings.
- **InvokeAgentScope.recordInputMessages() / recordOutputMessages()** — Now use JSON array format instead of comma-separated strings.
- **Environment variables** — Remove ENABLE_A365_OBSERVABILITY or ENABLE_OBSERVABILITY. No longer need to use environment variable for recordAttributes, setTagMaybe, and addBaggage.
- **EnhancedAgentDetails** — Merged `EnhancedAgentDetails` into `AgentDetails` to unify agent detail typing across scopes and middleware.

#### `@microsoft/agents-a365-observability-hosting`
- **ObservabilityHostingManager** — `enableBaggage` option now defaults to `false` (was `true`). Callers must explicitly set `enableBaggage: true` to register the BaggageMiddleware.
- **ScopeUtils.deriveAgentDetails** — Now resolves `agentId` via `activity.getAgenticInstanceId()` for embodied (agentic) agents only. For non-embodied agents, `agentId` is `undefined` since the token's app ID cannot reliably be attributed to the agent.
- **ScopeUtils.deriveAgentDetails** — Now resolves `agentBlueprintId` from the JWT `xms_par_app_azp` claim via `RuntimeUtility.getAgentIdFromToken()` instead of reading `recipient.agenticAppBlueprintId`.
- **ScopeUtils.deriveAgentDetails** — Now resolves `agentEmail` via `activity.getAgenticUser()` instead of `recipient.agenticUserId`.
- **ScopeUtils.deriveTenantDetails** — Now uses `activity.getAgenticTenantId()` instead of `recipient.tenantId`.
- **getTargetAgentBaggagePairs** — Now uses `activity.getAgenticInstanceId()` instead of `recipient.agenticAppId`.
- **getTenantIdPair** — Now uses `activity.getAgenticTenantId()` instead of manual `channelData` parsing.

---


### Deprecated
- `EnhancedAgentDetails` is now an alias of `AgentDetails` and marked as deprecated. Existing imports continue to work without breaking changes; migrate to `AgentDetails` when convenient.


## [0.1.0] - 2025-01-03

### Added
- Initial release of Agent365 TypeScript SDK
- OpenTelemetry integration for comprehensive observability
- Multi-agent support with context propagation
- Agent execution tracking with `ExecuteAgentScope`
- Tool execution tracking with `ExecuteToolScope`
- Agent invocation tracking with `InvokeAgentScope`
- Azure Monitor integration for cloud-based monitoring
- Fluent builder pattern for SDK configuration
- Complete TypeScript type definitions
- Sample TypeScript agent demonstrating usage
- Comprehensive test suite
- Full documentation and README

### Features
- **Agent Monitoring**: Specialized tracing scopes for AI agent invocations
- **Tool Execution Tracking**: Monitor tool executions with detailed telemetry
- **Azure Monitor Support**: Seamless integration with Azure Monitor
- **Builder Pattern**: Fluent configuration API similar to .NET SDK
- **Error Tracking**: Comprehensive error recording and propagation
- **Context Propagation**: Agent context automatically propagates via OpenTelemetry
- **Environment Configuration**: Support for environment-based configuration

### Supported Telemetry
- Custom agent and tool executions
- Agent-to-agent invocations
- Error tracking and performance metrics
- Request/response content (configurable)
- Channel metadata and execution context

### Requirements
- Node.js 18.0 or later
- TypeScript 5.0 or later (for development)
- OpenTelemetry 1.8.0 or later
