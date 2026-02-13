// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

// Main SDK classes
export { ObservabilityManager } from './ObservabilityManager';
export { ObservabilityBuilder as Builder, BuilderOptions } from './ObservabilityBuilder';
export { Agent365ExporterOptions } from './tracing/exporter/Agent365ExporterOptions';
// Tracing constants
export { OpenTelemetryConstants } from './tracing/constants';
export { ExporterEventNames } from './tracing/exporter/ExporterEventNames';

// Baggage builder
export { BaggageBuilder, BaggageScope } from './tracing/middleware/BaggageBuilder';

// Per-request export utilities
export { runWithExportToken, updateExportToken, getExportToken } from './tracing/context/token-context';

// Parent span context utilities
export { ParentSpanRef, runWithParentSpanRef, createContextWithParentSpanRef } from './tracing/context/parent-span-context';

// Contracts and interfaces
export {
  ExecutionType,
  InvocationRole,
  SourceMetadata,
  AgentRequest,
  AgentDetails,
  TenantDetails,
  ToolCallDetails,
  InvokeAgentDetails,
  CallerDetails,
  EnhancedAgentDetails,
  ServiceEndpoint,
  InferenceDetails,
  InferenceOperationType,
  InferenceResponse,
  OutputResponse
} from './tracing/contracts';

// Scopes
export { OpenTelemetryScope } from './tracing/scopes/OpenTelemetryScope';
export { ExecuteToolScope } from './tracing/scopes/ExecuteToolScope';
export { InvokeAgentScope } from './tracing/scopes/InvokeAgentScope';
export { InferenceScope } from './tracing/scopes/InferenceScope';
export { OutputScope } from './tracing/scopes/OutputScope';
export { logger, setLogger, getLogger, resetLogger, formatError } from './utils/logging';
export type { ILogger } from './utils/logging';

// Configuration
export * from './configuration';
