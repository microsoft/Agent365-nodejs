// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ActivityEventNames, ActivityTypes } from '@microsoft/agents-activity';
import type { TurnContext } from '@microsoft/agents-hosting';
import {
  InvocationIdentityResolutionSource,
  InvocationRole,
  type ResolvedInvocationIdentity,
} from '@microsoft/agents-a365-observability';
import {
  InvocationIdentityValidationCode,
  InvocationIdentityValidationError,
  TurnContextIdentityTrustSource,
  resolveInvocationIdentityFromTurnContext,
  resolveValidatedPrincipalFromTurnContext,
  validateResolvedInvocationIdentity,
} from '../../../../packages/agents-a365-observability-hosting/src/identity/InvocationIdentityResolver';

const HUMAN_OID = '11111111-1111-4111-8111-111111111111';
const HOSTING_HUMAN_OID = '22222222-2222-4222-8222-222222222222';
const ACTIVITY_HUMAN_OID = '33333333-3333-4333-8333-333333333333';
const CALLER_AGENT_USER_OID = '44444444-4444-4444-8444-444444444444';
const CALLER_AGENT_BLUEPRINT_ID = '55555555-5555-4555-8555-555555555555';
const CALLER_AGENT_INSTANCE_ID = '66666666-6666-4666-8666-666666666666';
const TARGET_AGENT_ID = '77777777-7777-4777-8777-777777777777';
const TARGET_AGENT_BLUEPRINT_ID = '88888888-8888-4888-8888-888888888888';
const TARGET_AGENT_AUID = '99999999-9999-4999-8999-999999999999';
const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONFIGURED_TARGET_AGENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONFIGURED_TARGET_BLUEPRINT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CONFIGURED_TARGET_AUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CONFIGURED_TENANT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

interface MockTurnContextOptions {
  identity?: unknown;
  activity?: {
    type?: string;
    name?: string;
    channelId?: string;
    from?: Record<string, unknown>;
    recipient?: Record<string, unknown>;
    isAgenticRequest?: boolean;
    targetAgentId?: string;
    tenantId?: string;
  };
}

function makeTurnContext(options: MockTurnContextOptions = {}): TurnContext {
  const activity = options.activity ?? {};
  return {
    identity: options.identity,
    activity: {
      type: activity.type ?? 'message',
      name: activity.name,
      channelId: activity.channelId,
      from: activity.from,
      recipient: activity.recipient,
      isAgenticRequest: () => activity.isAgenticRequest === true,
      getAgenticInstanceId: () => activity.targetAgentId,
      getAgenticTenantId: () => activity.tenantId,
    },
    turnState: new Map(),
  } as unknown as TurnContext;
}

const trustedOptions = {
  turnContextIdentityTrustSource: TurnContextIdentityTrustSource.StandardAuthorizeJwt,
};

describe('InvocationIdentityResolver', () => {
  describe('trusted principal classification', () => {
    it('resolves an ordinary delegated user as a human', () => {
      const context = makeTurnContext({
        identity: {
          idtyp: 'user',
          oid: HUMAN_OID.toUpperCase(),
          scp: 'access_as_user',
        },
      });

      expect(resolveValidatedPrincipalFromTurnContext(
        context,
        TurnContextIdentityTrustSource.StandardAuthorizeJwt,
      )).toEqual({
        role: InvocationRole.Human,
        humanOid: HUMAN_OID,
      });

      expect(resolveInvocationIdentityFromTurnContext(context, trustedOptions)).toMatchObject({
        role: InvocationRole.Human,
        humanOid: HUMAN_OID,
        resolutionSource: InvocationIdentityResolutionSource.HostingPrincipal,
      });
    });

    it('resolves xms_sub_fct=13 as an agent user', () => {
      const context = makeTurnContext({
        identity: {
          idtyp: 'user',
          oid: CALLER_AGENT_USER_OID.toUpperCase(),
          scp: ['Agent.Read'],
          xms_sub_fct: '7 13',
          xms_par_app_azp: CALLER_AGENT_BLUEPRINT_ID.toUpperCase(),
        },
      });

      const principal = resolveValidatedPrincipalFromTurnContext(
        context,
        TurnContextIdentityTrustSource.StandardAuthorizeJwt,
      );

      expect(principal).toEqual({
        role: InvocationRole.Agent,
        callerAgentUserOid: CALLER_AGENT_USER_OID,
        callerAgentBlueprintId: CALLER_AGENT_BLUEPRINT_ID,
      });
      expect(resolveInvocationIdentityFromTurnContext(context, trustedOptions)).toMatchObject({
        role: InvocationRole.Agent,
        callerAgentUserOid: CALLER_AGENT_USER_OID,
        callerAgentBlueprintId: CALLER_AGENT_BLUEPRINT_ID,
      });
    });

    it('resolves OBO actor-facet and parent-app claims while retaining the human', () => {
      const context = makeTurnContext({
        identity: {
          idtyp: 'user',
          oid: HUMAN_OID,
          scp: 'access_as_user',
          xms_act_fct: ['11'],
          xms_par_app_azp: CALLER_AGENT_BLUEPRINT_ID.toUpperCase(),
        },
      });

      expect(resolveInvocationIdentityFromTurnContext(context, trustedOptions)).toMatchObject({
        role: InvocationRole.Agent,
        humanOid: HUMAN_OID,
        callerAgentBlueprintId: CALLER_AGENT_BLUEPRINT_ID,
        resolutionSource: InvocationIdentityResolutionSource.HostingPrincipal,
      });
    });

    it('treats a parent application claim as agent evidence for an OBO user token', () => {
      const context = makeTurnContext({
        identity: {
          idtyp: 'user',
          oid: HUMAN_OID,
          scp: 'access_as_user',
          xms_par_app_azp: CALLER_AGENT_BLUEPRINT_ID,
        },
      });

      expect(resolveValidatedPrincipalFromTurnContext(
        context,
        TurnContextIdentityTrustSource.StandardAuthorizeJwt,
      )).toEqual({
        role: InvocationRole.Agent,
        humanOid: HUMAN_OID,
        callerAgentBlueprintId: CALLER_AGENT_BLUEPRINT_ID,
      });
    });

    it('resolves an app-only agent principal', () => {
      const context = makeTurnContext({
        identity: {
          idtyp: 'app',
          roles: ['Agent.Invoke'],
          xms_sub_fct: '11',
          xms_par_app_azp: CALLER_AGENT_BLUEPRINT_ID,
        },
      });

      expect(resolveInvocationIdentityFromTurnContext(context, trustedOptions)).toMatchObject({
        role: InvocationRole.Agent,
        callerAgentBlueprintId: CALLER_AGENT_BLUEPRINT_ID,
        resolutionSource: InvocationIdentityResolutionSource.HostingPrincipal,
      });
    });

    it('leaves an ordinary app principal Unknown', () => {
      const context = makeTurnContext({
        identity: {
          idtyp: 'app',
          oid: CALLER_AGENT_INSTANCE_ID,
          roles: ['Agent.Invoke'],
          appid: CALLER_AGENT_BLUEPRINT_ID,
        },
      });

      expect(resolveValidatedPrincipalFromTurnContext(
        context,
        TurnContextIdentityTrustSource.StandardAuthorizeJwt,
      )).toBeUndefined();
      expect(resolveInvocationIdentityFromTurnContext(context, trustedOptions)).toMatchObject({
        role: InvocationRole.Unknown,
        resolutionSource: InvocationIdentityResolutionSource.Unknown,
      });
    });

    it('does not treat a parent-app claim alone as an app Agent ID marker', () => {
      const context = makeTurnContext({
        identity: {
          idtyp: 'app',
          roles: ['Agent.Invoke'],
          xms_par_app_azp: CALLER_AGENT_BLUEPRINT_ID,
        },
      });

      expect(resolveValidatedPrincipalFromTurnContext(
        context,
        TurnContextIdentityTrustSource.StandardAuthorizeJwt,
      )).toBeUndefined();
    });
  });

  describe('Activity evidence', () => {
    it.each([
      ['Event', ActivityTypes.Event, 'custom-event'],
      ['ContinueConversation', ActivityTypes.Event, ActivityEventNames.ContinueConversation],
    ])('leaves %s activities Unknown unless the role is explicit', (_label, type, name) => {
      const context = makeTurnContext({
        identity: { aud: 'api://target' },
        activity: {
          type,
          name,
          from: { role: 'user', aadObjectId: HUMAN_OID },
        },
      });

      expect(resolveInvocationIdentityFromTurnContext(context, trustedOptions).role)
        .toBe(InvocationRole.Unknown);

      expect(resolveInvocationIdentityFromTurnContext(context, {
        ...trustedOptions,
        invocationRole: InvocationRole.Event,
        targetIdentity: { agentId: TARGET_AGENT_ID },
      })).toMatchObject({
        role: InvocationRole.Event,
        targetAgentId: TARGET_AGENT_ID,
      });
    });

    it('ignores a raw string identity instead of trusting Activity identity', () => {
      const context = makeTurnContext({
        identity: JSON.stringify({
          idtyp: 'user',
          oid: HUMAN_OID,
          scp: 'access_as_user',
        }),
        activity: {
          from: { role: 'user', aadObjectId: HUMAN_OID },
        },
      });

      expect(resolveInvocationIdentityFromTurnContext(context, trustedOptions)).toMatchObject({
        role: InvocationRole.Unknown,
        resolutionSource: InvocationIdentityResolutionSource.Unknown,
      });
    });

    it('ignores sub, email, UPN, channel, conversation, and generic IDs', () => {
      const context = makeTurnContext({
        identity: {
          idtyp: 'user',
          scp: 'access_as_user',
          sub: HUMAN_OID,
          email: 'human@contoso.com',
          upn: 'human@contoso.com',
        },
        activity: {
          channelId: TARGET_AGENT_ID,
          from: {
            role: 'user',
            id: HUMAN_OID,
            email: 'human@contoso.com',
            userPrincipalName: 'human@contoso.com',
          },
          recipient: {
            id: TARGET_AGENT_AUID,
          },
        },
      });

      const identity = resolveInvocationIdentityFromTurnContext(context, trustedOptions);
      expect(identity.role).toBe(InvocationRole.Human);
      expect(identity.humanOid).toBeUndefined();
      expect(identity.callerAgentUserOid).toBeUndefined();
      expect(identity.callerAgentBlueprintId).toBeUndefined();
      expect(identity.callerAgentInstanceId).toBeUndefined();
      expect(identity.targetAgentId).toBeUndefined();
      expect(identity.targetAgentAuid).toBeUndefined();
      expect(identity.targetAgentBlueprintId).toBeUndefined();
      expect(identity.tenantId).toBeUndefined();
    });

    it.each([
      [' USER ', InvocationRole.Human, { aadObjectId: HUMAN_OID }, 'humanOid', HUMAN_OID],
      [
        'aGeNt',
        InvocationRole.Agent,
        { agenticAppBlueprintId: CALLER_AGENT_BLUEPRINT_ID },
        'callerAgentBlueprintId',
        CALLER_AGENT_BLUEPRINT_ID,
      ],
      [
        'agentic-app-instance',
        InvocationRole.Agent,
        { agenticAppId: CALLER_AGENT_INSTANCE_ID },
        'callerAgentInstanceId',
        CALLER_AGENT_INSTANCE_ID,
      ],
      [
        'Agentic_User',
        InvocationRole.Agent,
        {
          aadObjectId: CALLER_AGENT_USER_OID,
          agenticAppId: CALLER_AGENT_INSTANCE_ID,
        },
        'callerAgentUserOid',
        CALLER_AGENT_USER_OID,
      ],
      [
        'SKILL',
        InvocationRole.Agent,
        { agenticAppBlueprintId: CALLER_AGENT_BLUEPRINT_ID },
        'callerAgentBlueprintId',
        CALLER_AGENT_BLUEPRINT_ID,
      ],
    ])('normalizes Activity role %s', (role, expectedRole, from, field, expectedValue) => {
      const context = makeTurnContext({
        identity: { aud: 'api://target' },
        activity: { from: { role, ...from } },
      });

      const identity = resolveInvocationIdentityFromTurnContext(context, trustedOptions);
      expect(identity.role).toBe(expectedRole);
      expect(identity[field as keyof ResolvedInvocationIdentity]).toBe(expectedValue);
      expect(identity.resolutionSource).toBe(InvocationIdentityResolutionSource.Activity);
    });
  });

  describe('normalization, precedence, and composition', () => {
    it('rejects invalid and nil UUIDs while lowercasing accepted UUIDs', () => {
      const identity = resolveInvocationIdentityFromTurnContext(makeTurnContext(), {
        invocationRole: InvocationRole.Agent,
        validatedPrincipal: {
          humanOid: HUMAN_OID.toUpperCase(),
          callerAgentUserOid: NIL_UUID,
          callerAgentBlueprintId: 'not-a-uuid',
          callerAgentInstanceId: CALLER_AGENT_INSTANCE_ID.toUpperCase(),
        },
        targetIdentity: {
          agentId: TARGET_AGENT_ID.toUpperCase(),
          agentAuid: NIL_UUID,
          agentBlueprintId: 'invalid',
          tenantId: TENANT_ID.toUpperCase(),
        },
      });

      expect(identity).toMatchObject({
        role: InvocationRole.Agent,
        humanOid: HUMAN_OID,
        callerAgentInstanceId: CALLER_AGENT_INSTANCE_ID,
        targetAgentId: TARGET_AGENT_ID,
        tenantId: TENANT_ID,
        resolutionSource: InvocationIdentityResolutionSource.Composite,
      });
      expect(identity.callerAgentUserOid).toBeUndefined();
      expect(identity.callerAgentBlueprintId).toBeUndefined();
      expect(identity.targetAgentAuid).toBeUndefined();
      expect(identity.targetAgentBlueprintId).toBeUndefined();
      expect(() => validateResolvedInvocationIdentity(identity)).not.toThrow();
    });

    it('uses exact source precedence and reports normalized conflict payloads', () => {
      const conflicts: unknown[] = [];
      const context = makeTurnContext({
        identity: {
          idtyp: 'user',
          oid: HOSTING_HUMAN_OID.toUpperCase(),
          scp: 'access_as_user',
        },
        activity: {
          from: {
            role: 'user',
            aadObjectId: ACTIVITY_HUMAN_OID.toUpperCase(),
          },
        },
      });

      const identity = resolveInvocationIdentityFromTurnContext(context, {
        ...trustedOptions,
        invocationRole: InvocationRole.Agent,
        validatedPrincipal: {
          role: InvocationRole.Human,
          humanOid: HUMAN_OID.toUpperCase(),
          callerAgentBlueprintId: CALLER_AGENT_BLUEPRINT_ID.toUpperCase(),
        },
        onConflict: conflict => conflicts.push(conflict),
      });

      expect(identity).toMatchObject({
        role: InvocationRole.Agent,
        humanOid: HUMAN_OID,
        callerAgentBlueprintId: CALLER_AGENT_BLUEPRINT_ID,
        resolutionSource: InvocationIdentityResolutionSource.Composite,
      });
      expect(conflicts).toEqual([
        {
          field: 'role',
          winningSource: InvocationIdentityResolutionSource.Explicit,
          losingSource: InvocationIdentityResolutionSource.ValidatedPrincipal,
          winningValue: InvocationRole.Agent,
          losingValue: InvocationRole.Human,
        },
        {
          field: 'role',
          winningSource: InvocationIdentityResolutionSource.Explicit,
          losingSource: InvocationIdentityResolutionSource.HostingPrincipal,
          winningValue: InvocationRole.Agent,
          losingValue: InvocationRole.Human,
        },
        {
          field: 'role',
          winningSource: InvocationIdentityResolutionSource.Explicit,
          losingSource: InvocationIdentityResolutionSource.Activity,
          winningValue: InvocationRole.Agent,
          losingValue: InvocationRole.Human,
        },
        {
          field: 'humanOid',
          winningSource: InvocationIdentityResolutionSource.ValidatedPrincipal,
          losingSource: InvocationIdentityResolutionSource.HostingPrincipal,
          winningValue: HUMAN_OID,
          losingValue: HOSTING_HUMAN_OID,
        },
        {
          field: 'humanOid',
          winningSource: InvocationIdentityResolutionSource.ValidatedPrincipal,
          losingSource: InvocationIdentityResolutionSource.Activity,
          winningValue: HUMAN_OID,
          losingValue: ACTIVITY_HUMAN_OID,
        },
      ]);
    });

    it('prefers target identity from Activity over configured target identity', () => {
      const conflicts: unknown[] = [];
      const context = makeTurnContext({
        identity: { aud: 'api://target' },
        activity: {
          isAgenticRequest: true,
          targetAgentId: TARGET_AGENT_ID,
          tenantId: TENANT_ID,
          recipient: {
            aadObjectId: TARGET_AGENT_AUID,
            agenticAppBlueprintId: TARGET_AGENT_BLUEPRINT_ID,
          },
        },
      });

      const identity = resolveInvocationIdentityFromTurnContext(context, {
        ...trustedOptions,
        invocationRole: InvocationRole.Event,
        targetIdentity: {
          agentId: CONFIGURED_TARGET_AGENT_ID,
          agentAuid: CONFIGURED_TARGET_AUID,
          agentBlueprintId: CONFIGURED_TARGET_BLUEPRINT_ID,
          tenantId: CONFIGURED_TENANT_ID,
        },
        onConflict: conflict => conflicts.push(conflict),
      });

      expect(identity).toMatchObject({
        role: InvocationRole.Event,
        targetAgentId: TARGET_AGENT_ID,
        targetAgentAuid: TARGET_AGENT_AUID,
        targetAgentBlueprintId: TARGET_AGENT_BLUEPRINT_ID,
        tenantId: TENANT_ID,
        resolutionSource: InvocationIdentityResolutionSource.Composite,
      });
      expect(conflicts).toEqual([
        {
          field: 'targetAgentId',
          winningSource: InvocationIdentityResolutionSource.Activity,
          losingSource: InvocationIdentityResolutionSource.Configuration,
          winningValue: TARGET_AGENT_ID,
          losingValue: CONFIGURED_TARGET_AGENT_ID,
        },
        {
          field: 'targetAgentBlueprintId',
          winningSource: InvocationIdentityResolutionSource.Activity,
          losingSource: InvocationIdentityResolutionSource.Configuration,
          winningValue: TARGET_AGENT_BLUEPRINT_ID,
          losingValue: CONFIGURED_TARGET_BLUEPRINT_ID,
        },
        {
          field: 'targetAgentAuid',
          winningSource: InvocationIdentityResolutionSource.Activity,
          losingSource: InvocationIdentityResolutionSource.Configuration,
          winningValue: TARGET_AGENT_AUID,
          losingValue: CONFIGURED_TARGET_AUID,
        },
        {
          field: 'tenantId',
          winningSource: InvocationIdentityResolutionSource.Activity,
          losingSource: InvocationIdentityResolutionSource.Configuration,
          winningValue: TENANT_ID,
          losingValue: CONFIGURED_TENANT_ID,
        },
      ]);
    });

    it('retains both a delegated human and the immediate A2A caller agent', () => {
      const identity = resolveInvocationIdentityFromTurnContext(makeTurnContext(), {
        validatedPrincipal: {
          role: InvocationRole.Agent,
          humanOid: HUMAN_OID,
          callerAgentUserOid: CALLER_AGENT_USER_OID,
          callerAgentBlueprintId: CALLER_AGENT_BLUEPRINT_ID,
          callerAgentInstanceId: CALLER_AGENT_INSTANCE_ID,
        },
      });

      expect(identity).toMatchObject({
        role: InvocationRole.Agent,
        humanOid: HUMAN_OID,
        callerAgentUserOid: CALLER_AGENT_USER_OID,
        callerAgentBlueprintId: CALLER_AGENT_BLUEPRINT_ID,
        callerAgentInstanceId: CALLER_AGENT_INSTANCE_ID,
        resolutionSource: InvocationIdentityResolutionSource.ValidatedPrincipal,
      });
    });
  });

  describe('validation', () => {
    it.each([
      [
        {
          role: InvocationRole.Human,
          resolutionSource: InvocationIdentityResolutionSource.Explicit,
        },
        InvocationIdentityValidationCode.MissingHumanIdentity,
      ],
      [
        {
          role: InvocationRole.Agent,
          humanOid: HUMAN_OID,
          resolutionSource: InvocationIdentityResolutionSource.Explicit,
        },
        InvocationIdentityValidationCode.MissingAgentIdentity,
      ],
      [
        {
          role: InvocationRole.Event,
          resolutionSource: InvocationIdentityResolutionSource.Explicit,
        },
        InvocationIdentityValidationCode.MissingEventExecutionIdentity,
      ],
      [
        {
          role: InvocationRole.Unknown,
          resolutionSource: InvocationIdentityResolutionSource.Unknown,
        },
        InvocationIdentityValidationCode.UnknownInvocationRole,
      ],
    ])('rejects incomplete identity %# with the expected code', (identity, code) => {
      expect(() => validateResolvedInvocationIdentity(identity as ResolvedInvocationIdentity))
        .toThrow(expect.objectContaining({
          name: InvocationIdentityValidationError.name,
          code,
        }));
    });
  });
});
