// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

export * from './utils/BaggageBuilderUtils';
export * from './utils/ScopeUtils';
export * from './utils/TurnContextUtils';
export { AgenticTokenCache, AgenticTokenCacheInstance } from './caching/AgenticTokenCache';
export { BaggageMiddleware } from './middleware/BaggageMiddleware';
export { OutputLoggingMiddleware, A365_PARENT_SPAN_KEY, A365_AUTH_TOKEN_KEY } from './middleware/OutputLoggingMiddleware';
export { ObservabilityHostingManager } from './middleware/ObservabilityHostingManager';
export type { ObservabilityHostingOptions } from './middleware/ObservabilityHostingManager';
export {
  InvocationIdentityMiddleware,
} from './middleware/InvocationIdentityMiddleware';
export type {
  InvocationIdentityMiddlewareOptions,
  ValidatedInvocationPrincipalResolver,
  InvocationRoleResolver,
  TargetInvocationIdentityResolver,
  InvocationIdentityConflictHandler,
  InvocationIdentityResolvedHandler,
  InvocationIdentityResolutionErrorHandler,
} from './middleware/InvocationIdentityMiddleware';
export {
  InvocationIdentityValidationCode,
  InvocationIdentityValidationError,
  TurnContextIdentityTrustSource,
  resolveValidatedPrincipalFromTurnContext,
  resolveInvocationIdentityFromTurnContext,
  validateResolvedInvocationIdentity,
} from './identity/InvocationIdentityResolver';
export type {
  ValidatedInvocationPrincipal,
  TargetInvocationIdentity,
  InvocationIdentityField,
  InvocationIdentityConflict,
  InvocationIdentityResolverOptions,
} from './identity/InvocationIdentityResolver';
