// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { context as otelContext } from '@opentelemetry/api';
import type { TurnContext } from '@microsoft/agents-hosting';
import {
  getResolvedInvocationIdentity,
  InvocationRole,
} from '@microsoft/agents-a365-observability';
import {
  InvocationIdentityMiddleware,
} from '../../../../packages/agents-a365-observability-hosting/src/middleware/InvocationIdentityMiddleware';
import {
  InvocationIdentityValidationCode,
  InvocationIdentityValidationError,
  TurnContextIdentityTrustSource,
} from '../../../../packages/agents-a365-observability-hosting/src/identity/InvocationIdentityResolver';

const HUMAN_OID = '11111111-1111-4111-8111-111111111111';
const TARGET_AGENT_ID = '77777777-7777-4777-8777-777777777777';
const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeTurnContext(): TurnContext {
  return {
    identity: { aud: 'api://target' },
    activity: {
      type: 'message',
      from: {
        role: 'user',
        aadObjectId: HUMAN_OID,
      },
      isAgenticRequest: () => false,
      getAgenticInstanceId: () => undefined,
      getAgenticTenantId: () => undefined,
    },
    turnState: new Map(),
  } as unknown as TurnContext;
}

describe('InvocationIdentityMiddleware', () => {
  let contextManager: AsyncLocalStorageContextManager;

  beforeAll(() => {
    contextManager = new AsyncLocalStorageContextManager();
    contextManager.enable();
    otelContext.setGlobalContextManager(contextManager);
  });

  afterAll(() => {
    contextManager.disable();
    otelContext.disable();
  });

  it('invokes callbacks once, runs every hook in resolved context, and continues non-strict failures', async () => {
    const turnContext = makeTurnContext();
    const callbackError = new Error('validated principal lookup failed');
    const order: string[] = [];
    const resolveValidatedPrincipal = jest.fn(async () => {
      throw callbackError;
    });
    const invocationRole = jest.fn(async () => InvocationRole.Event);
    const targetIdentity = jest.fn(async () => ({
      agentId: TARGET_AGENT_ID,
      tenantId: TENANT_ID,
    }));
    const assertResolvedContext = () => {
      expect(getResolvedInvocationIdentity()).toMatchObject({
        role: InvocationRole.Event,
        targetAgentId: TARGET_AGENT_ID,
        tenantId: TENANT_ID,
      });
    };
    const onIdentityConflict = jest.fn(async () => {
      order.push('conflict');
      assertResolvedContext();
    });
    const onIdentityResolutionError = jest.fn(async (error: Error) => {
      order.push('error');
      expect(error).toBe(callbackError);
      assertResolvedContext();
    });
    const onIdentityResolved = jest.fn(async (identity) => {
      order.push('resolved');
      expect(getResolvedInvocationIdentity()).toEqual(identity);
    });
    const next = jest.fn(async () => {
      order.push('next');
      assertResolvedContext();
    });

    const middleware = new InvocationIdentityMiddleware({
      resolveValidatedPrincipal,
      invocationRole,
      targetIdentity,
      onIdentityConflict,
      onIdentityResolutionError,
      onIdentityResolved,
    });

    await expect(middleware.onTurn(turnContext, next)).resolves.toBeUndefined();

    expect(resolveValidatedPrincipal).toHaveBeenCalledTimes(1);
    expect(resolveValidatedPrincipal).toHaveBeenCalledWith(turnContext);
    expect(invocationRole).toHaveBeenCalledTimes(1);
    expect(invocationRole).toHaveBeenCalledWith(turnContext);
    expect(targetIdentity).toHaveBeenCalledTimes(1);
    expect(targetIdentity).toHaveBeenCalledWith(turnContext);
    expect(onIdentityConflict).toHaveBeenCalledTimes(1);
    expect(onIdentityResolutionError).toHaveBeenCalledTimes(1);
    expect(onIdentityResolved).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['conflict', 'error', 'resolved', 'next']);
    expect(getResolvedInvocationIdentity()).toBeUndefined();
  });

  it('throws a callback failure in strict mode after hooks and does not call next', async () => {
    const turnContext = makeTurnContext();
    const callbackError = new Error('validated principal lookup failed');
    const onIdentityResolutionError = jest.fn(() => {
      expect(getResolvedInvocationIdentity()?.role).toBe(InvocationRole.Event);
    });
    const onIdentityResolved = jest.fn(() => {
      expect(getResolvedInvocationIdentity()?.targetAgentId).toBe(TARGET_AGENT_ID);
    });
    const next = jest.fn();
    const middleware = new InvocationIdentityMiddleware({
      strictIdentityValidation: true,
      resolveValidatedPrincipal: async () => {
        throw callbackError;
      },
      invocationRole: InvocationRole.Event,
      targetIdentity: {
        agentId: TARGET_AGENT_ID,
        tenantId: TENANT_ID,
      },
      onIdentityResolutionError,
      onIdentityResolved,
    });

    await expect(middleware.onTurn(turnContext, next)).rejects.toBe(callbackError);

    expect(onIdentityResolutionError).toHaveBeenCalledTimes(1);
    expect(onIdentityResolved).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
    expect(getResolvedInvocationIdentity()).toBeUndefined();
  });

  it('throws strict validation errors for an unresolved identity', async () => {
    const turnContext = makeTurnContext();
    const onIdentityResolutionError = jest.fn();
    const next = jest.fn();
    const middleware = new InvocationIdentityMiddleware({
      strictIdentityValidation: true,
      turnContextIdentityTrustSource: TurnContextIdentityTrustSource.None,
      onIdentityResolutionError,
    });

    await expect(middleware.onTurn(turnContext, next)).rejects.toMatchObject({
      name: InvocationIdentityValidationError.name,
      code: InvocationIdentityValidationCode.UnknownInvocationRole,
    });

    expect(onIdentityResolutionError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: InvocationIdentityValidationCode.UnknownInvocationRole,
      }),
      turnContext,
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('continues non-strict turns when a callback rejects with a non-serializable value', async () => {
    const turnContext = makeTurnContext();
    const next = jest.fn();
    const circularValue: Record<string, unknown> = {};
    circularValue.self = circularValue;
    const middleware = new InvocationIdentityMiddleware({
      resolveValidatedPrincipal: async () => {
        throw circularValue;
      },
    });

    await expect(middleware.onTurn(turnContext, next)).resolves.toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
