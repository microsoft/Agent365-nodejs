// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

// Main SDK classes
export { ObservabilityManager } from './ObservabilityManager';
export { ObservabilityBuilder as Builder, BuilderOptions } from './ObservabilityBuilder';

// Tracing constants
export { OpenTelemetryConstants } from './tracing/constants';

// Baggage builder
export { BaggageBuilder, BaggageScope } from './tracing/middleware/BaggageBuilder';

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
  InferenceResponse
} from './tracing/contracts';

// Scopes
export { OpenTelemetryScope } from './tracing/scopes/OpenTelemetryScope';
export { ExecuteToolScope } from './tracing/scopes/ExecuteToolScope';
export { InvokeAgentScope } from './tracing/scopes/InvokeAgentScope';
export { InferenceScope} from './tracing/scopes/InferenceScope';
