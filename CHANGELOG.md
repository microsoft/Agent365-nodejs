# Changelog

All notable changes to the Agent365 TypeScript SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Breaking Changes (`@microsoft/agents-a365-observability-hosting`)

- **`ScopeUtils.deriveAgentDetails(turnContext, authToken)`** — New required `authToken: string` parameter.
- **`ScopeUtils.populateInferenceScopeFromTurnContext(details, turnContext, authToken, ...)`** — New required `authToken: string` parameter.
- **`ScopeUtils.populateInvokeAgentScopeFromTurnContext(details, turnContext, authToken, ...)`** — New required `authToken: string` parameter.
- **`ScopeUtils.populateExecuteToolScopeFromTurnContext(details, turnContext, authToken, ...)`** — New required `authToken: string` parameter.
- **`ScopeUtils.buildInvokeAgentDetails(details, turnContext, authToken)`** — New required `authToken: string` parameter.

### Added
- **OutputScope**: Tracing scope for outgoing agent messages with caller details, conversation ID, source metadata, and parent span linking.
- **BaggageMiddleware**: Middleware for automatic OpenTelemetry baggage propagation from TurnContext.
- **OutputLoggingMiddleware**: Middleware that creates OutputScope spans for outgoing messages with lazy parent span linking via `A365_PARENT_SPAN_KEY`.
- **ObservabilityHostingManager**: Manager for configuring hosting-layer observability middleware with `ObservabilityHostingOptions`.

### Fixed
- **Agent365Exporter**: `exporterTimeoutMilliseconds` option is now respected for HTTP requests. Previously the exporter used a hardcoded 30-second timeout, ignoring the configured value.

### Changed
- **ObservabilityHostingManager**: `enableBaggage` option now defaults to `false` (was `true`). Callers must explicitly set `enableBaggage: true` to register the BaggageMiddleware.
- `ScopeUtils.deriveAgentDetails` now resolves `agentId` via `activity.getAgenticInstanceId()` for embodied (agentic) agents only. For non-embodied agents, `agentId` is `undefined` since the token's app ID cannot reliably be attributed to the agent.
- `ScopeUtils.deriveAgentDetails` now resolves `agentBlueprintId` from the JWT `xms_par_app_azp` claim via `RuntimeUtility.getAgentIdFromToken()` instead of reading `recipient.agenticAppBlueprintId`.
- `ScopeUtils.deriveAgentDetails` now resolves `agentUPN` via `activity.getAgenticUser()` instead of `recipient.agenticUserId`.
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
- Source metadata and execution context

### Requirements
- Node.js 18.0 or later
- TypeScript 5.0 or later (for development)
- OpenTelemetry 1.8.0 or later
