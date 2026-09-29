// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { InvocationRole } from '../contracts';
import { OpenTelemetryConstants } from '../constants';

export enum InvocationIdentityDiagnosticCode {
  MissingHumanIdentity = 'missing_human_identity',
  MissingAgentIdentity = 'missing_agent_identity',
  UnknownInvocationRole = 'unknown_invocation_role',
  MissingEventExecutionIdentity = 'missing_event_execution_identity',
}

const MAX_WARNING_KEYS = 1024;
const warningKeys = new Map<string, true>();

function stringAttribute(span: ReadableSpan, key: string): string | undefined {
  const value = span.attributes[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function getWarningCode(span: ReadableSpan): InvocationIdentityDiagnosticCode | undefined {
  const role = stringAttribute(span, OpenTelemetryConstants.INVOCATION_ROLE_KEY);

  switch (role) {
    case InvocationRole.Human:
      return stringAttribute(span, OpenTelemetryConstants.USER_ID_KEY)
        ? undefined
        : InvocationIdentityDiagnosticCode.MissingHumanIdentity;
    case InvocationRole.Agent:
      return stringAttribute(span, OpenTelemetryConstants.GEN_AI_CALLER_AGENT_USER_ID_KEY)
        || stringAttribute(span, OpenTelemetryConstants.GEN_AI_CALLER_AGENT_ID_KEY)
        || stringAttribute(span, OpenTelemetryConstants.GEN_AI_CALLER_AGENT_APPLICATION_ID_KEY)
        ? undefined
        : InvocationIdentityDiagnosticCode.MissingAgentIdentity;
    case InvocationRole.Event:
      return stringAttribute(span, OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY)
        || stringAttribute(span, OpenTelemetryConstants.GEN_AI_AGENT_AUID_KEY)
        || stringAttribute(span, OpenTelemetryConstants.GEN_AI_AGENT_BLUEPRINT_ID_KEY)
        ? undefined
        : InvocationIdentityDiagnosticCode.MissingEventExecutionIdentity;
    default:
      return InvocationIdentityDiagnosticCode.UnknownInvocationRole;
  }
}

function shouldWarn(key: string): boolean {
  if (warningKeys.has(key)) {
    return false;
  }

  if (warningKeys.size >= MAX_WARNING_KEYS) {
    const oldestKey = warningKeys.keys().next().value as string | undefined;
    if (oldestKey !== undefined) {
      warningKeys.delete(oldestKey);
    }
  }

  warningKeys.set(key, true);
  return true;
}

export function diagnoseInvocationIdentitySpan(span: ReadableSpan): void {
  try {
    if (
      stringAttribute(span, OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY)
      !== OpenTelemetryConstants.INVOKE_AGENT_OPERATION_NAME
    ) {
      return;
    }

    const code = getWarningCode(span);
    if (!code) {
      return;
    }

    const tenantId = stringAttribute(span, OpenTelemetryConstants.TENANT_ID_KEY) ?? 'unknown-tenant';
    const targetAgent = stringAttribute(span, OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY)
      ?? stringAttribute(span, OpenTelemetryConstants.GEN_AI_AGENT_AUID_KEY)
      ?? stringAttribute(span, OpenTelemetryConstants.GEN_AI_AGENT_BLUEPRINT_ID_KEY)
      ?? 'unknown-target';
    const warningKey = `${tenantId}|${targetAgent}|${code}`;

    if (shouldWarn(warningKey)) {
      console.warn(
        `[A365Observability][${code}] Invocation identity is incomplete for tenant '${tenantId}' and target '${targetAgent}'.`,
      );
    }
  } catch {
    // Diagnostics must never affect application execution.
  }
}
