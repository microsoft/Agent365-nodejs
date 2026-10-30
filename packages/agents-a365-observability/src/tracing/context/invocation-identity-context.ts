// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Context, context, createContextKey } from '@opentelemetry/api';
import { InvocationRole } from '../contracts';

export enum InvocationIdentityResolutionSource {
  Unknown = 'unknown',
  Activity = 'activity',
  HostingPrincipal = 'hosting_principal',
  ValidatedPrincipal = 'validated_principal',
  Configuration = 'configuration',
  Explicit = 'explicit',
  Composite = 'composite',
}

export interface ResolvedInvocationIdentity {
  role: InvocationRole;
  humanOid?: string;
  callerAgentUserOid?: string;
  callerAgentBlueprintId?: string;
  callerAgentInstanceId?: string;
  targetAgentId?: string;
  targetAgentBlueprintId?: string;
  targetAgentAuid?: string;
  tenantId?: string;
  resolutionSource: InvocationIdentityResolutionSource;
}

const RESOLVED_INVOCATION_IDENTITY_KEY = createContextKey('a365_resolved_invocation_identity');

export function createContextWithResolvedInvocationIdentity(
  baseContext: Context,
  identity: ResolvedInvocationIdentity,
): Context {
  const frozenIdentity = Object.freeze({ ...identity });
  return baseContext.setValue(RESOLVED_INVOCATION_IDENTITY_KEY, frozenIdentity);
}

export function getResolvedInvocationIdentity(
  otelContext: Context = context.active(),
): ResolvedInvocationIdentity | undefined {
  return otelContext.getValue(RESOLVED_INVOCATION_IDENTITY_KEY) as ResolvedInvocationIdentity | undefined;
}

export function runWithResolvedInvocationIdentity<T>(
  identity: ResolvedInvocationIdentity,
  callback: () => T,
): T {
  return context.with(
    createContextWithResolvedInvocationIdentity(context.active(), identity),
    callback,
  );
}
