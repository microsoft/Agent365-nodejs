// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { PurviewDlpAgentContext, PurviewDlpTokenResolver } from './contracts';

// Internal to the Purview module: not exported from the package.

const MAX_ERROR_CHARACTERS = 200;
const ERROR_TYPE = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;

/** Errors raised by the SDK itself, whose messages carry no token or response body. */
const sdkErrors = new WeakSet<object>();

/** Marks an error the SDK raises, so its message may be reported. */
export function sdkError<T extends Error>(error: T): T {
  sdkErrors.add(error);
  return error;
}

/**
 * The exception type (for example `TypeError`) and, for the SDK's own errors, the message. Nothing else of
 * another exception is reported, as it may carry a token or a response body.
 */
export function describeError(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return 'unknown error';
  }

  const name = (error as { name?: unknown }).name;
  const type = typeof name === 'string' && ERROR_TYPE.test(name) ? name : 'Error';
  return sdkErrors.has(error) ? singleLine(`${type}: ${(error as Error).message}`) : type;
}

/** The cache key of a token resolver whose token depends only on the agent identity and scope. */
export type TokenCacheKey = (agent: PurviewDlpAgentContext, scope: string) => string;

const tokenCacheKeys = new WeakMap<PurviewDlpTokenResolver, TokenCacheKey>();

/**
 * Lets the client cache the resolver's tokens under `key`. Only resolvers whose token is fully determined
 * by the key may be cached: a host's resolver may return a token for a user the agent context does not
 * identify, so it is never cached.
 */
export function withTokenCacheKey(resolver: PurviewDlpTokenResolver, key: TokenCacheKey): PurviewDlpTokenResolver {
  tokenCacheKeys.set(resolver, key);
  return resolver;
}

export function tokenCacheKeyOf(resolver: PurviewDlpTokenResolver): TokenCacheKey | undefined {
  return tokenCacheKeys.get(resolver);
}

/** A deadline for one evaluation that also aborts when the caller's signal aborts. */
export function createDeadline(timeoutMilliseconds: number, callerSignal?: AbortSignal): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('The Purview evaluation timed out.')), timeoutMilliseconds);
  const onCallerAbort = (): void => controller.abort(callerSignal?.reason);
  callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    },
  };
}

/** Settles like `promise`, or rejects with the signal's reason when it aborts first. */
export function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/** The system error code of a failed fetch (for example `ECONNREFUSED`), or the exception type. */
export function networkErrorCode(error: unknown): string {
  const cause = isObject(error) ? error['cause'] : undefined;
  const code = isObject(cause) && typeof cause['code'] === 'string' && ERROR_TYPE.test(cause['code']) ? cause['code'] : undefined;
  return code ?? describeError(error);
}

/** The `exp` of a JWT in epoch milliseconds, or undefined when the token is not a JWT with `exp`. */
export function readExpiry(token: string): number | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return undefined;
  }

  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const exp = isObject(payload) ? payload['exp'] : undefined;
    return typeof exp === 'number' && Number.isFinite(exp) ? Math.floor(exp) * 1000 : undefined;
  } catch (_error) {
    return undefined;
  }
}

/**
 * `value` with every lone surrogate replaced by U+FFFD. `JSON.stringify` would write a lone surrogate as a
 * `\uD8xx` escape, which strict JSON parsers reject, failing the request.
 */
export function wellFormed(value: string): string {
  const native = (value as unknown as { toWellFormed?: () => string }).toWellFormed;
  if (typeof native === 'function') {
    return native.call(value);
  }

  let result = '';
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0xd800 || code > 0xdfff) {
      continue;
    }

    const next = value.charCodeAt(index + 1);
    if (code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
      index += 1;
      continue;
    }

    result += `${value.slice(start, index)}\uFFFD`;
    start = index + 1;
  }

  return start === 0 ? value : result + value.slice(start);
}

/** The first `maxCharacters` characters of `value`, one fewer when that would split a surrogate pair. */
export function cut(value: string, maxCharacters: number): string {
  const code = value.charCodeAt(maxCharacters - 1);
  return value.slice(0, code >= 0xd800 && code <= 0xdbff ? maxCharacters - 1 : maxCharacters);
}

/** `value` parsed as an absolute https URL with a host (`https:host` reads as `https://host`), or undefined. */
export function parseHttpsUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname ? url : undefined;
  } catch (_error) {
    return undefined;
  }
}

/** Removes trailing slashes in linear time (a `/+$` pattern is polynomial). */
export function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }

  return value.slice(0, end);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A trimmed, well formed, non-empty string, or undefined. */
export function nonEmpty(value: unknown): string | undefined {
  const text = typeof value === 'string' ? wellFormed(value.trim()) : '';
  return text || undefined;
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function singleLine(value: string): string {
  const line = value.replace(/\s+/g, ' ').trim();
  return line.length > MAX_ERROR_CHARACTERS ? `${line.slice(0, MAX_ERROR_CHARACTERS)}...` : line;
}
