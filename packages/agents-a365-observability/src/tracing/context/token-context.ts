// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { context, createContextKey, Context } from '@opentelemetry/api';

const EXPORT_TOKEN_KEY = createContextKey('a365_export_token');

/**
 * Run a function within a Context that carries the per-request export token.
 * This keeps the token only in OTel Context (ALS), never in any registry.
 */
export function runWithExportToken<T>(token: string, fn: () => T): T {
  const ctxWithToken = context.active().setValue(EXPORT_TOKEN_KEY, token);
  return context.with(ctxWithToken, fn);
}

/**
 * Retrieve the per-request export token from a given OTel Context (or the active one).
 */
export function getExportToken(ctx: Context = context.active()): string | undefined {
  return ctx.getValue(EXPORT_TOKEN_KEY) as string | undefined;
}
