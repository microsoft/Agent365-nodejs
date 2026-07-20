// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ResolvedInvocationIdentity } from './context/invocation-identity-context';
import { OpenTelemetryConstants } from './constants';

export const INVOCATION_IDENTITY_ATTRIBUTE_KEYS: ReadonlySet<string> = new Set([
  OpenTelemetryConstants.INVOCATION_ROLE_KEY,
  OpenTelemetryConstants.USER_ID_KEY,
  OpenTelemetryConstants.GEN_AI_CALLER_AGENT_USER_ID_KEY,
  OpenTelemetryConstants.GEN_AI_CALLER_AGENT_APPLICATION_ID_KEY,
  OpenTelemetryConstants.GEN_AI_CALLER_AGENT_ID_KEY,
  OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY,
  OpenTelemetryConstants.GEN_AI_AGENT_BLUEPRINT_ID_KEY,
  OpenTelemetryConstants.GEN_AI_AGENT_AUID_KEY,
  OpenTelemetryConstants.TENANT_ID_KEY,
]);

export function getInvocationIdentityAttributes(
  identity: ResolvedInvocationIdentity,
): ReadonlyArray<readonly [string, string | undefined]> {
  return [
    [OpenTelemetryConstants.INVOCATION_ROLE_KEY, identity.role],
    [OpenTelemetryConstants.USER_ID_KEY, identity.humanOid],
    [OpenTelemetryConstants.GEN_AI_CALLER_AGENT_USER_ID_KEY, identity.callerAgentUserOid],
    [OpenTelemetryConstants.GEN_AI_CALLER_AGENT_APPLICATION_ID_KEY, identity.callerAgentBlueprintId],
    [OpenTelemetryConstants.GEN_AI_CALLER_AGENT_ID_KEY, identity.callerAgentInstanceId],
    [OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY, identity.targetAgentId],
    [OpenTelemetryConstants.GEN_AI_AGENT_BLUEPRINT_ID_KEY, identity.targetAgentBlueprintId],
    [OpenTelemetryConstants.GEN_AI_AGENT_AUID_KEY, identity.targetAgentAuid],
    [OpenTelemetryConstants.TENANT_ID_KEY, identity.tenantId],
  ];
}

export function hasNonBlankIdentityAttribute(value: unknown): boolean {
  return typeof value === 'string'
    ? value.trim().length > 0
    : value !== null && value !== undefined;
}

export function isBlankIdentityAttributeValue(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length === 0;
}
