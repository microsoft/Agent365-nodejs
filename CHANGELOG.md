# Changelog

All notable changes to the Agent365 TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Added (`@microsoft/agents-a365-observability`)

- **`SpanDetails`** — New interface grouping `parentContext`, `startTime`, `endTime`, `spanKind` for scope construction.
- **`CallerDetails`** — New interface wrapping `userDetails` and `callerAgentDetails` for `InvokeAgentScope`.
- **`Request`** — Unified request context interface (`conversationId`, `channel`, `content`, `sessionId`) used across all scopes.
- **`OpenTelemetryScope.recordCancellation()`** — Records a cancellation event on the span with `error.type = 'TaskCanceledException'`.
- **`OpenTelemetryConstants.ERROR_TYPE_CANCELLED`** — Constant for the cancellation error type value.
- **`ObservabilityBuilder.withServiceNamespace()`** — Configures the `service.namespace` resource attribute.

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

### Added

- **Span links support** — All scope classes (`InvokeAgentScope`, `InferenceScope`, `ExecuteToolScope`, `OutputScope`) now accept an optional `spanLinks?: Link[]` parameter to establish causal relationships to other spans (e.g. linking a batch operation to individual trigger spans).
- **`BaggageBuilder.invokeAgentServer(address, port?)`** — Fluent setter for server address and port baggage values. Port is only recorded when different from 443 (default HTTPS). Clears stale port entries when port is omitted or 443.
- **`OpenAIAgentsInstrumentationConfig.isContentRecordingEnabled`** — Optional `boolean` to enable content recording in OpenAI trace processor.
- **`LangChainTraceInstrumentor.instrument(module, options?)`** — New optional `{ isContentRecordingEnabled?: boolean }` parameter to enable content recording in LangChain tracer.
- **`truncateValue`** / **`MAX_ATTRIBUTE_LENGTH`** — Exported utilities for attribute value truncation (8192 char limit).
- **OutputScope**: Tracing scope for outgoing agent messages with caller details, conversation ID, channel information, and parent span linking.
- **BaggageMiddleware**: Middleware for automatic OpenTelemetry baggage propagation from TurnContext.
- **OutputLoggingMiddleware**: Middleware that creates OutputScope spans for outgoing messages with lazy parent span linking via `A365_PARENT_SPAN_KEY`.
- **ObservabilityHostingManager**: Manager for configuring hosting-layer observability middleware with `ObservabilityHostingOptions`.
- **Agent365ExporterOptions**: New `httpRequestTimeoutMilliseconds` option (default 30s) controls the per-HTTP-request timeout for backend calls. This is distinct from `exporterTimeoutMilliseconds` which controls the overall BatchSpanProcessor export deadline.

### Fixed
- **Agent365ExporterOptions**: `exporterTimeoutMilliseconds` default increased from 30s to 90s to allow sufficient time for retries across multiple identity groups within a single export cycle.

### Changed
- **ObservabilityHostingManager**: `enableBaggage` option now defaults to `false` (was `true`). Callers must explicitly set `enableBaggage: true` to register the BaggageMiddleware.
- `ScopeUtils.deriveAgentDetails` now resolves `agentId` via `activity.getAgenticInstanceId()` for embodied (agentic) agents only. For non-embodied agents, `agentId` is `undefined` since the token's app ID cannot reliably be attributed to the agent.
- `ScopeUtils.deriveAgentDetails` now resolves `agentBlueprintId` from the JWT `xms_par_app_azp` claim via `RuntimeUtility.getAgentIdFromToken()` instead of reading `recipient.agenticAppBlueprintId`.
- `ScopeUtils.deriveAgentDetails` now resolves `agentEmail` via `activity.getAgenticUser()` instead of `recipient.agenticUserId`.
- `ScopeUtils.deriveTenantDetails` now uses `activity.getAgenticTenantId()` instead of `recipient.tenantId`.
- `getTargetAgentBaggagePairs` now uses `activity.getAgenticInstanceId()` instead of `recipient.agenticAppId`.
- `getTenantIdPair` now uses `activity.getAgenticTenantId()` instead of manual `channelData` parsing.
- `InferenceScope.recordInputMessages()` / `recordOutputMessages()` now use JSON array format instead of comma-separated strings.
- `InvokeAgentScope.recordInputMessages()` / `recordOutputMessages()` now use JSON array format instead of comma-separated strings.

## [1.1.0] - 2025-12-09

### Changed
- Remove ENABLE_A365_OBSERVABILITY or ENABLE_OBSERVABILITY. No longer need to use environment variable for recordAttributes, setTagMaybe, and addBaggage.
- Merged `EnhancedAgentDetails` into `AgentDetails` to unify agent detail typing across scopes and middleware.

### Deprecated
- `EnhancedAgentDetails` is now an alias of `AgentDetails` and marked as deprecated. Existing imports continue to work without breaking changes; migrate to `AgentDetails` when convenient.

### Notes
- This release is non-breaking. A minor version bump reflects additive API changes and deprecation guidance.

## [1.0.0] - 2025-01-03

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
