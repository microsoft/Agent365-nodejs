// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Middleware, TurnContext } from '@microsoft/agents-hosting';
import {
  InvocationRole,
  ResolvedInvocationIdentity,
  logger,
  runWithResolvedInvocationIdentity,
} from '@microsoft/agents-a365-observability';
import {
  InvocationIdentityConflict,
  InvocationIdentityValidationError,
  TargetInvocationIdentity,
  TurnContextIdentityTrustSource,
  ValidatedInvocationPrincipal,
  resolveInvocationIdentityFromTurnContext,
  validateResolvedInvocationIdentity,
} from '../identity/InvocationIdentityResolver';

type MaybePromise<T> = T | Promise<T>;

export type ValidatedInvocationPrincipalResolver = (
  turnContext: TurnContext,
) => MaybePromise<ValidatedInvocationPrincipal | undefined>;

export type InvocationRoleResolver = (
  turnContext: TurnContext,
) => MaybePromise<InvocationRole | undefined>;

export type TargetInvocationIdentityResolver = (
  turnContext: TurnContext,
) => MaybePromise<TargetInvocationIdentity | undefined>;

export type InvocationIdentityConflictHandler = (
  conflict: InvocationIdentityConflict,
  turnContext: TurnContext,
) => MaybePromise<void>;

export type InvocationIdentityResolvedHandler = (
  identity: ResolvedInvocationIdentity,
  turnContext: TurnContext,
) => MaybePromise<void>;

export type InvocationIdentityResolutionErrorHandler = (
  error: Error,
  turnContext: TurnContext,
) => MaybePromise<void>;

export interface InvocationIdentityMiddlewareOptions {
  turnContextIdentityTrustSource?: TurnContextIdentityTrustSource;
  resolveValidatedPrincipal?: ValidatedInvocationPrincipalResolver;
  invocationRole?: InvocationRole | InvocationRoleResolver;
  targetIdentity?: TargetInvocationIdentity | TargetInvocationIdentityResolver;
  onIdentityConflict?: InvocationIdentityConflictHandler;
  onIdentityResolved?: InvocationIdentityResolvedHandler;
  onIdentityResolutionError?: InvocationIdentityResolutionErrorHandler;
  strictIdentityValidation?: boolean;
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  try {
    return new Error(JSON.stringify(error) ?? String(error));
  } catch {
    return new Error(String(error));
  }
}

export class InvocationIdentityMiddleware implements Middleware {
  constructor(private readonly options: InvocationIdentityMiddlewareOptions = {}) {}

  async onTurn(turnContext: TurnContext, next: () => Promise<void>): Promise<void> {
    const errors: Error[] = [];
    const conflicts: InvocationIdentityConflict[] = [];
    const strict = this.options.strictIdentityValidation === true;

    const validatedPrincipal = await this.resolveCallbackValue(
      'resolveValidatedPrincipal',
      this.options.resolveValidatedPrincipal,
      turnContext,
      errors,
    );
    const invocationRole = typeof this.options.invocationRole === 'function'
      ? await this.resolveCallbackValue(
        'invocationRole',
        this.options.invocationRole,
        turnContext,
        errors,
      )
      : this.options.invocationRole;
    const targetIdentity = typeof this.options.targetIdentity === 'function'
      ? await this.resolveCallbackValue(
        'targetIdentity',
        this.options.targetIdentity,
        turnContext,
        errors,
      )
      : this.options.targetIdentity;

    const identity = resolveInvocationIdentityFromTurnContext(turnContext, {
      turnContextIdentityTrustSource: this.options.turnContextIdentityTrustSource
        ?? TurnContextIdentityTrustSource.StandardAuthorizeJwt,
      validatedPrincipal,
      invocationRole,
      targetIdentity,
      onConflict: conflict => conflicts.push(conflict),
    });

    try {
      validateResolvedInvocationIdentity(identity);
    } catch (error) {
      const validationError = toError(error);
      errors.push(validationError);
      if (!strict) {
        logger.warn(`[InvocationIdentityMiddleware] ${validationError.message}`);
      }
    }

    await runWithResolvedInvocationIdentity(identity, async () => {
      for (const conflict of conflicts) {
        await this.invokeHook(
          'onIdentityConflict',
          this.options.onIdentityConflict,
          [conflict, turnContext],
          strict,
        );
      }

      for (const error of errors) {
        await this.invokeHook(
          'onIdentityResolutionError',
          this.options.onIdentityResolutionError,
          [error, turnContext],
          strict,
        );
      }

      await this.invokeHook(
        'onIdentityResolved',
        this.options.onIdentityResolved,
        [identity, turnContext],
        strict,
      );

      if (strict && errors.length > 0) {
        throw errors[0];
      }

      await next();
    });
  }

  private async resolveCallbackValue<T>(
    name: string,
    callback: ((turnContext: TurnContext) => MaybePromise<T>) | undefined,
    turnContext: TurnContext,
    errors: Error[],
  ): Promise<T | undefined> {
    if (!callback) {
      return undefined;
    }

    try {
      return await callback(turnContext);
    } catch (error) {
      const callbackError = toError(error);
      errors.push(callbackError);
      logger.warn(`[InvocationIdentityMiddleware] ${name} failed: ${callbackError.message}`);
      return undefined;
    }
  }

  private async invokeHook<TArgs extends unknown[]>(
    name: string,
    hook: ((...args: TArgs) => MaybePromise<void>) | undefined,
    args: TArgs,
    strict: boolean,
  ): Promise<void> {
    if (!hook) {
      return;
    }

    try {
      await hook(...args);
    } catch (error) {
      const hookError = toError(error);
      logger.warn(`[InvocationIdentityMiddleware] ${name} failed: ${hookError.message}`);
      if (strict) {
        throw hookError;
      }
    }
  }
}

export { InvocationIdentityValidationError };
