// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ActivityTypes } from '@microsoft/agents-activity';
import { TurnContext } from '@microsoft/agents-hosting';
import {
  InvocationIdentityResolutionSource,
  InvocationRole,
  ResolvedInvocationIdentity,
} from '@microsoft/agents-a365-observability';

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const AGENT_IDENTITY_FACET = '11';
const AGENT_USER_FACET = '13';

export interface ValidatedInvocationPrincipal {
  role?: InvocationRole;
  humanOid?: string;
  callerAgentUserOid?: string;
  callerAgentBlueprintId?: string;
  callerAgentInstanceId?: string;
}

export interface TargetInvocationIdentity {
  agentId?: string;
  agentAuid?: string;
  agentBlueprintId?: string;
  tenantId?: string;
}

export enum TurnContextIdentityTrustSource {
  None = 'none',
  StandardAuthorizeJwt = 'standard_authorize_jwt',
}

export type InvocationIdentityField =
  | 'role'
  | 'humanOid'
  | 'callerAgentUserOid'
  | 'callerAgentBlueprintId'
  | 'callerAgentInstanceId'
  | 'targetAgentId'
  | 'targetAgentBlueprintId'
  | 'targetAgentAuid'
  | 'tenantId';

export interface InvocationIdentityConflict {
  field: InvocationIdentityField;
  winningSource: InvocationIdentityResolutionSource;
  losingSource: InvocationIdentityResolutionSource;
  winningValue: string;
  losingValue: string;
}

export interface InvocationIdentityResolverOptions {
  turnContextIdentityTrustSource?: TurnContextIdentityTrustSource;
  validatedPrincipal?: ValidatedInvocationPrincipal;
  invocationRole?: InvocationRole;
  targetIdentity?: TargetInvocationIdentity;
  onConflict?: (conflict: InvocationIdentityConflict) => void;
}

export enum InvocationIdentityValidationCode {
  MissingHumanIdentity = 'missing_human_identity',
  MissingAgentIdentity = 'missing_agent_identity',
  UnknownInvocationRole = 'unknown_invocation_role',
  MissingEventExecutionIdentity = 'missing_event_execution_identity',
}

export class InvocationIdentityValidationError extends Error {
  constructor(
    public readonly code: InvocationIdentityValidationCode,
    message: string,
  ) {
    super(message);
    this.name = 'InvocationIdentityValidationError';
  }
}

interface Candidate<T extends string> {
  value?: T;
  source: InvocationIdentityResolutionSource;
}

interface SelectedCandidate<T extends string> {
  value: T;
  source: InvocationIdentityResolutionSource;
}

interface ActivityIdentityEvidence extends ValidatedInvocationPrincipal {
  targetAgentId?: string;
  targetAgentBlueprintId?: string;
  targetAgentAuid?: string;
  tenantId?: string;
}

function normalizeUuid(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized) || normalized === NIL_UUID) {
    return undefined;
  }

  return normalized;
}

function normalizeInvocationRole(value: unknown): InvocationRole | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return Object.values(InvocationRole).find(
    role => role.toLowerCase() === value.trim().toLowerCase(),
  );
}

function hasNonEmptyClaim(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return Array.isArray(value) && value.some(item => typeof item === 'string' && item.trim().length > 0);
}

function hasFacet(value: unknown, facet: string): boolean {
  if (typeof value === 'string') {
    return value.split(/\s+/).includes(facet);
  }

  return Array.isArray(value) && value.some(item => String(item) === facet);
}

function getTrustedClaims(
  turnContext: TurnContext,
  trustSource: TurnContextIdentityTrustSource,
): Record<string, unknown> | undefined {
  if (trustSource !== TurnContextIdentityTrustSource.StandardAuthorizeJwt) {
    return undefined;
  }

  const identity: unknown = turnContext?.identity;
  if (typeof identity !== 'object' || identity === null || Array.isArray(identity)) {
    return undefined;
  }

  const claims = identity as Record<string, unknown>;
  const keys = Object.keys(claims);
  if (keys.length === 0 || (keys.length === 1 && claims.name === 'anonymous')) {
    return undefined;
  }

  return claims;
}

function normalizePrincipal(
  principal: ValidatedInvocationPrincipal | undefined,
): ValidatedInvocationPrincipal | undefined {
  if (!principal) {
    return undefined;
  }

  return {
    role: normalizeInvocationRole(principal.role),
    humanOid: normalizeUuid(principal.humanOid),
    callerAgentUserOid: normalizeUuid(principal.callerAgentUserOid),
    callerAgentBlueprintId: normalizeUuid(principal.callerAgentBlueprintId),
    callerAgentInstanceId: normalizeUuid(principal.callerAgentInstanceId),
  };
}

function normalizeTargetIdentity(
  identity: TargetInvocationIdentity | undefined,
): ActivityIdentityEvidence {
  return {
    targetAgentId: normalizeUuid(identity?.agentId),
    targetAgentAuid: normalizeUuid(identity?.agentAuid),
    targetAgentBlueprintId: normalizeUuid(identity?.agentBlueprintId),
    tenantId: normalizeUuid(identity?.tenantId),
  };
}

function selectCandidate<T extends string>(
  field: InvocationIdentityField,
  candidates: Array<Candidate<T>>,
  onConflict?: (conflict: InvocationIdentityConflict) => void,
): SelectedCandidate<T> | undefined {
  const available = candidates.filter(
    (candidate): candidate is SelectedCandidate<T> =>
      typeof candidate.value === 'string' && candidate.value.trim().length > 0,
  );
  const winner = available[0];

  if (!winner) {
    return undefined;
  }

  for (const loser of available.slice(1)) {
    if (loser.value !== winner.value) {
      onConflict?.({
        field,
        winningSource: winner.source,
        losingSource: loser.source,
        winningValue: winner.value,
        losingValue: loser.value,
      });
    }
  }

  return winner;
}

function normalizeActivityRole(role: unknown): string | undefined {
  if (typeof role !== 'string') {
    return undefined;
  }

  const normalized = role.replace(/[\s_-]/g, '').toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function resolveActivityIdentityEvidence(
  turnContext: TurnContext,
  trustSource: TurnContextIdentityTrustSource,
): ActivityIdentityEvidence {
  if (!getTrustedClaims(turnContext, trustSource)) {
    return {};
  }

  const activity = turnContext.activity;
  const from = activity?.from;
  const recipient = activity?.recipient;
  const normalizedRole = normalizeActivityRole(from?.role);
  const isEvent = activity?.type === ActivityTypes.Event;
  const isAgentRole = normalizedRole !== undefined && [
    'bot',
    'skill',
    'agent',
    'agenticappinstance',
    'agenticuser',
  ].includes(normalizedRole);

  let role = InvocationRole.Unknown;
  if (!isEvent && normalizedRole === 'user') {
    role = InvocationRole.Human;
  } else if (!isEvent && isAgentRole) {
    role = InvocationRole.Agent;
  }

  const isAgenticUser = normalizedRole === 'agenticuser';
  const hasAgentInstance = isAgenticUser || normalizedRole === 'agenticappinstance';
  const isAgenticRequest = activity?.isAgenticRequest?.() === true;

  return {
    role,
    humanOid: role === InvocationRole.Human
      ? normalizeUuid(from?.aadObjectId)
      : undefined,
    callerAgentUserOid: isAgenticUser
      ? normalizeUuid(from?.aadObjectId)
      : undefined,
    callerAgentBlueprintId: role === InvocationRole.Agent
      ? normalizeUuid(from?.agenticAppBlueprintId)
      : undefined,
    callerAgentInstanceId: hasAgentInstance
      ? normalizeUuid(from?.agenticAppId)
      : undefined,
    targetAgentId: isAgenticRequest
      ? normalizeUuid(activity?.getAgenticInstanceId?.())
      : undefined,
    targetAgentAuid: normalizeUuid(recipient?.aadObjectId),
    targetAgentBlueprintId: normalizeUuid(recipient?.agenticAppBlueprintId),
    tenantId: normalizeUuid(activity?.getAgenticTenantId?.() ?? recipient?.tenantId),
  };
}

export function resolveValidatedPrincipalFromTurnContext(
  turnContext: TurnContext,
  trustSource: TurnContextIdentityTrustSource = TurnContextIdentityTrustSource.None,
): ValidatedInvocationPrincipal | undefined {
  const claims = getTrustedClaims(turnContext, trustSource);
  if (!claims) {
    return undefined;
  }

  const idtyp = typeof claims.idtyp === 'string'
    ? claims.idtyp.trim().toLowerCase()
    : undefined;
  const oid = normalizeUuid(claims.oid);
  const callerBlueprintId = normalizeUuid(claims.xms_par_app_azp);
  const subjectIsAgentUser = hasFacet(claims.xms_sub_fct, AGENT_USER_FACET);
  const subjectIsAgentIdentity = hasFacet(claims.xms_sub_fct, AGENT_IDENTITY_FACET);
  const actorIsAgentIdentity = hasFacet(claims.xms_act_fct, AGENT_IDENTITY_FACET);
  const hasUserAgentMarker = subjectIsAgentUser
    || subjectIsAgentIdentity
    || actorIsAgentIdentity
    || callerBlueprintId !== undefined;
  const hasAppAgentMarker = subjectIsAgentIdentity || actorIsAgentIdentity;

  if (idtyp === 'user' && oid && hasNonEmptyClaim(claims.scp)) {
    if (subjectIsAgentUser) {
      return {
        role: InvocationRole.Agent,
        callerAgentUserOid: oid,
        callerAgentBlueprintId: callerBlueprintId,
      };
    }

    if (actorIsAgentIdentity || callerBlueprintId) {
      return {
        role: InvocationRole.Agent,
        humanOid: oid,
        callerAgentBlueprintId: callerBlueprintId,
      };
    }

    if (!hasUserAgentMarker) {
      return {
        role: InvocationRole.Human,
        humanOid: oid,
      };
    }
  }

  if (idtyp === 'app' && hasNonEmptyClaim(claims.roles) && hasAppAgentMarker) {
    return {
      role: InvocationRole.Agent,
      callerAgentBlueprintId: callerBlueprintId,
    };
  }

  return undefined;
}

export function resolveInvocationIdentityFromTurnContext(
  turnContext: TurnContext,
  options: InvocationIdentityResolverOptions = {},
): ResolvedInvocationIdentity {
  const trustSource = options.turnContextIdentityTrustSource
    ?? TurnContextIdentityTrustSource.None;
  const applicationPrincipal = normalizePrincipal(options.validatedPrincipal);
  const hostingPrincipal = normalizePrincipal(
    resolveValidatedPrincipalFromTurnContext(turnContext, trustSource),
  );
  const activity = resolveActivityIdentityEvidence(turnContext, trustSource);
  const configuredTarget = normalizeTargetIdentity(options.targetIdentity);
  const onConflict = options.onConflict;

  const roleCandidate = selectCandidate('role', [
    {
      value: normalizeInvocationRole(options.invocationRole),
      source: InvocationIdentityResolutionSource.Explicit,
    },
    {
      value: applicationPrincipal?.role,
      source: InvocationIdentityResolutionSource.ValidatedPrincipal,
    },
    {
      value: hostingPrincipal?.role,
      source: InvocationIdentityResolutionSource.HostingPrincipal,
    },
    {
      value: activity.role === InvocationRole.Unknown ? undefined : activity.role,
      source: InvocationIdentityResolutionSource.Activity,
    },
  ], onConflict);

  const humanOid = selectCandidate('humanOid', [
    {
      value: applicationPrincipal?.humanOid,
      source: InvocationIdentityResolutionSource.ValidatedPrincipal,
    },
    {
      value: hostingPrincipal?.humanOid,
      source: InvocationIdentityResolutionSource.HostingPrincipal,
    },
    {
      value: activity.humanOid,
      source: InvocationIdentityResolutionSource.Activity,
    },
  ], onConflict);
  const callerAgentUserOid = selectCandidate('callerAgentUserOid', [
    {
      value: applicationPrincipal?.callerAgentUserOid,
      source: InvocationIdentityResolutionSource.ValidatedPrincipal,
    },
    {
      value: hostingPrincipal?.callerAgentUserOid,
      source: InvocationIdentityResolutionSource.HostingPrincipal,
    },
    {
      value: activity.callerAgentUserOid,
      source: InvocationIdentityResolutionSource.Activity,
    },
  ], onConflict);
  const callerAgentBlueprintId = selectCandidate('callerAgentBlueprintId', [
    {
      value: applicationPrincipal?.callerAgentBlueprintId,
      source: InvocationIdentityResolutionSource.ValidatedPrincipal,
    },
    {
      value: hostingPrincipal?.callerAgentBlueprintId,
      source: InvocationIdentityResolutionSource.HostingPrincipal,
    },
    {
      value: activity.callerAgentBlueprintId,
      source: InvocationIdentityResolutionSource.Activity,
    },
  ], onConflict);
  const callerAgentInstanceId = selectCandidate('callerAgentInstanceId', [
    {
      value: applicationPrincipal?.callerAgentInstanceId,
      source: InvocationIdentityResolutionSource.ValidatedPrincipal,
    },
    {
      value: hostingPrincipal?.callerAgentInstanceId,
      source: InvocationIdentityResolutionSource.HostingPrincipal,
    },
    {
      value: activity.callerAgentInstanceId,
      source: InvocationIdentityResolutionSource.Activity,
    },
  ], onConflict);
  const targetAgentId = selectCandidate('targetAgentId', [
    {
      value: activity.targetAgentId,
      source: InvocationIdentityResolutionSource.Activity,
    },
    {
      value: configuredTarget.targetAgentId,
      source: InvocationIdentityResolutionSource.Configuration,
    },
  ], onConflict);
  const targetAgentBlueprintId = selectCandidate('targetAgentBlueprintId', [
    {
      value: activity.targetAgentBlueprintId,
      source: InvocationIdentityResolutionSource.Activity,
    },
    {
      value: configuredTarget.targetAgentBlueprintId,
      source: InvocationIdentityResolutionSource.Configuration,
    },
  ], onConflict);
  const targetAgentAuid = selectCandidate('targetAgentAuid', [
    {
      value: activity.targetAgentAuid,
      source: InvocationIdentityResolutionSource.Activity,
    },
    {
      value: configuredTarget.targetAgentAuid,
      source: InvocationIdentityResolutionSource.Configuration,
    },
  ], onConflict);
  const tenantId = selectCandidate('tenantId', [
    {
      value: activity.tenantId,
      source: InvocationIdentityResolutionSource.Activity,
    },
    {
      value: configuredTarget.tenantId,
      source: InvocationIdentityResolutionSource.Configuration,
    },
  ], onConflict);

  const role = roleCandidate?.value ?? InvocationRole.Unknown;
  const retainedSources: InvocationIdentityResolutionSource[] = [];
  const identity: ResolvedInvocationIdentity = {
    role,
    targetAgentId: targetAgentId?.value,
    targetAgentBlueprintId: targetAgentBlueprintId?.value,
    targetAgentAuid: targetAgentAuid?.value,
    tenantId: tenantId?.value,
    resolutionSource: InvocationIdentityResolutionSource.Unknown,
  };

  if (roleCandidate) {
    retainedSources.push(roleCandidate.source);
  }

  for (const target of [targetAgentId, targetAgentBlueprintId, targetAgentAuid, tenantId]) {
    if (target) {
      retainedSources.push(target.source);
    }
  }

  if (role === InvocationRole.Human) {
    identity.humanOid = humanOid?.value;
    if (humanOid) {
      retainedSources.push(humanOid.source);
    }
  } else if (role === InvocationRole.Agent) {
    const validatedHumanOid = humanOid
      && humanOid.source !== InvocationIdentityResolutionSource.Activity
      ? humanOid
      : undefined;

    identity.humanOid = validatedHumanOid?.value;
    identity.callerAgentUserOid = callerAgentUserOid?.value;
    identity.callerAgentBlueprintId = callerAgentBlueprintId?.value;
    identity.callerAgentInstanceId = callerAgentInstanceId?.value;

    for (const caller of [
      validatedHumanOid,
      callerAgentUserOid,
      callerAgentBlueprintId,
      callerAgentInstanceId,
    ]) {
      if (caller) {
        retainedSources.push(caller.source);
      }
    }
  }

  const uniqueSources = new Set(
    retainedSources.filter(source => source !== InvocationIdentityResolutionSource.Unknown),
  );
  if (uniqueSources.size === 1) {
    identity.resolutionSource = [...uniqueSources][0];
  } else if (uniqueSources.size > 1) {
    identity.resolutionSource = InvocationIdentityResolutionSource.Composite;
  }

  return identity;
}

export function validateResolvedInvocationIdentity(
  identity: ResolvedInvocationIdentity,
): void {
  switch (identity.role) {
    case InvocationRole.Human:
      if (!identity.humanOid) {
        throw new InvocationIdentityValidationError(
          InvocationIdentityValidationCode.MissingHumanIdentity,
          'Human invocation identity requires humanOid.',
        );
      }
      return;
    case InvocationRole.Agent:
      if (
        !identity.callerAgentUserOid
        && !identity.callerAgentInstanceId
        && !identity.callerAgentBlueprintId
      ) {
        throw new InvocationIdentityValidationError(
          InvocationIdentityValidationCode.MissingAgentIdentity,
          'Agent invocation identity requires a caller user, instance, or blueprint ID.',
        );
      }
      return;
    case InvocationRole.Event:
      if (
        !identity.targetAgentId
        && !identity.targetAgentAuid
        && !identity.targetAgentBlueprintId
      ) {
        throw new InvocationIdentityValidationError(
          InvocationIdentityValidationCode.MissingEventExecutionIdentity,
          'Event invocation identity requires a target agent ID, AUID, or blueprint ID.',
        );
      }
      return;
    default:
      throw new InvocationIdentityValidationError(
        InvocationIdentityValidationCode.UnknownInvocationRole,
        'Invocation identity role must be Human, Agent, or Event.',
      );
  }
}
