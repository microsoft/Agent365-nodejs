// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AgenticTokenCache, ObservabilityTokenResolver } from '@microsoft/agents-a365-observability-hosting';
import { ObservabilityConfiguration } from '@microsoft/agents-a365-observability';
import type { Authorization, TurnContext } from '@microsoft/agents-hosting';

const obsScopes = ['api://9b975845-388f-4429-889e-eab1ef63949c/.default'];

function makeJwtWithExp(expSecondsFromNow: number, claims: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + expSecondsFromNow,
    idtyp: 'app',
    ...claims,
  })).toString('base64url');
  return `${header}.${payload}.test-signature`;
}

describe('AgenticTokenCache app-only OBS authentication', () => {
  let cache: AgenticTokenCache;

  beforeEach(() => {
    cache = new AgenticTokenCache();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns null when no entry exists', () => {
    expect(cache.getObservabilityToken('agent', 'tenant')).toBeNull();
  });

  it('passes exporting identity and configured OBS scopes to an app-only resolver', async () => {
    const token = makeJwtWithExp(300);
    const resolver = jest.fn<ReturnType<ObservabilityTokenResolver>, Parameters<ObservabilityTokenResolver>>(() => token);

    await cache.RefreshObservabilityToken('agent', 'tenant', resolver);

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith('agent', 'tenant', obsScopes);
    expect(cache.getObservabilityToken('agent', 'tenant')).toBe(token);
  });

  it('uses a configuration provider for app-only scopes', async () => {
    const scopes = ['api://custom-obs/.default'];
    cache = new AgenticTokenCache({
      getConfiguration: () => new ObservabilityConfiguration({
        observabilityAuthenticationScopes: () => scopes,
      }),
    });
    const resolver = jest.fn(() => makeJwtWithExp(300));

    await cache.RefreshObservabilityToken('agent', 'tenant', resolver);

    expect(resolver).toHaveBeenCalledWith('agent', 'tenant', scopes);
  });

  it.each([
    { description: 'absent', roles: undefined },
    { description: 'empty', roles: [] },
  ])('caches an explicitly app-only token with $description roles', async ({ roles }) => {
    const token = makeJwtWithExp(300, { roles });
    await cache.RefreshObservabilityToken('agent', 'tenant', () => token);
    expect(cache.getObservabilityToken('agent', 'tenant')).toBe(token);
  });

  it('deduplicates concurrent roleless-token acquisitions for the same identity', async () => {
    const token = makeJwtWithExp(300);
    const resolver = jest.fn(async () => token);
    await Promise.all(Array.from({ length: 8 }, () =>
      cache.RefreshObservabilityToken('agent', 'tenant', resolver)));
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(cache.getObservabilityToken('agent', 'tenant')).toBe(token);
  });

  it('fails for an empty scope configuration without requesting a token', async () => {
    cache = new AgenticTokenCache({
      getConfiguration: () => new ObservabilityConfiguration({
        observabilityAuthenticationScopes: () => [],
      }),
    });
    const resolver = jest.fn(() => makeJwtWithExp(300));
    await expect(cache.RefreshObservabilityToken('agent', 'tenant', resolver)).rejects.toThrow('No valid scopes');
    expect(resolver).not.toHaveBeenCalled();
  });

  it.each(['agentic', 'obo'])('rejects legacy %s user authorization without exchanging a token', async (handler) => {
    const exchangeToken = jest.fn();
    const authorization: Authorization = {
      exchangeToken,
      getToken: jest.fn(),
      signOut: jest.fn(),
      onSignInSuccess: jest.fn(),
      onSignInFailure: jest.fn(),
    };
    const context = {} as TurnContext;

    await expect(cache.RefreshObservabilityToken(
      'agent', 'tenant', context, authorization, obsScopes, handler,
    )).rejects.toThrow('S2S OBS requires an app-only token resolver');

    expect(exchangeToken).not.toHaveBeenCalled();
    expect(cache.getObservabilityToken('agent', 'tenant')).toBeNull();
  });

  it.each([['', 'tenant'], ['agent', ' ']])('rejects empty identity (%s, %s)', async (agent, tenant) => {
    const resolver = jest.fn(() => makeJwtWithExp(300));
    await expect(cache.RefreshObservabilityToken(agent, tenant, resolver)).rejects.toThrow('Agent and tenant IDs');
    expect(resolver).not.toHaveBeenCalled();
  });

  it('retries a transient acquisition failure then caches the app-only token', async () => {
    const token = makeJwtWithExp(300);
    const resolver = jest.fn()
      .mockRejectedValueOnce({ status: 500, message: 'service unavailable' })
      .mockResolvedValueOnce(token);

    const pending = cache.RefreshObservabilityToken('agent', 'tenant', resolver);
    await jest.advanceTimersByTimeAsync(1000);
    await pending;

    expect(resolver).toHaveBeenCalledTimes(2);
    expect(cache.getObservabilityToken('agent', 'tenant')).toBe(token);
  });

  it('surfaces a permanent acquisition failure and clears stale tokens', async () => {
    await cache.RefreshObservabilityToken('agent', 'tenant', () => makeJwtWithExp(120));
    jest.advanceTimersByTime(61_000);
    const error = new Error('permission denied');
    const resolver = jest.fn().mockRejectedValue(error);

    await expect(cache.RefreshObservabilityToken('agent', 'tenant', resolver)).rejects.toBe(error);

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(cache.getObservabilityToken('agent', 'tenant')).toBeNull();
  });

  it('surfaces exhausted transient failures without caching a token', async () => {
    const error = { status: 503, message: 'service unavailable' };
    const resolver = jest.fn().mockRejectedValue(error);
    const pending = expect(cache.RefreshObservabilityToken('agent', 'tenant', resolver)).rejects.toBe(error);
    await jest.advanceTimersByTimeAsync(1000);
    await pending;
    expect(resolver).toHaveBeenCalledTimes(3);
    expect(cache.getObservabilityToken('agent', 'tenant')).toBeNull();
  });

  it.each([null, '', ' '])('surfaces an empty resolver result (%s)', async (token) => {
    await expect(cache.RefreshObservabilityToken('agent', 'tenant', () => token)).rejects.toThrow('returned no token');
    expect(cache.getObservabilityToken('agent', 'tenant')).toBeNull();
  });

  it.each([-30, 0, 30])('does not return a token expiring in %s seconds', async (seconds) => {
    await cache.RefreshObservabilityToken('agent', 'tenant', () => makeJwtWithExp(seconds));
    expect(cache.getObservabilityToken('agent', 'tenant')).toBeNull();
  });

  it('reuses a cached token and refreshes after expiry skew', async () => {
    const token = makeJwtWithExp(120);
    const resolver = jest.fn(() => token);
    await cache.RefreshObservabilityToken('agent', 'tenant', resolver);
    await cache.RefreshObservabilityToken('agent', 'tenant', resolver);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(cache.getObservabilityToken('agent', 'tenant')).toBe(token);
    jest.advanceTimersByTime(61_000);
    expect(cache.getObservabilityToken('agent', 'tenant')).toBeNull();
    resolver.mockReturnValue(makeJwtWithExp(300));
    await cache.RefreshObservabilityToken('agent', 'tenant', resolver);
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it('isolates tokens by agent and tenant', async () => {
    const resolver = (agent: string, tenant: string) => `${agent}-${tenant}`;
    await cache.RefreshObservabilityToken('one', 'tenant-a', resolver);
    await cache.RefreshObservabilityToken('two', 'tenant-a', resolver);
    await cache.RefreshObservabilityToken('one', 'tenant-b', resolver);
    expect(cache.getObservabilityToken('one', 'tenant-a')).toBe('one-tenant-a');
    expect(cache.getObservabilityToken('two', 'tenant-a')).toBe('two-tenant-a');
    expect(cache.getObservabilityToken('one', 'tenant-b')).toBe('one-tenant-b');
  });

  it('uses a fresh fallback TTL when an opaque token replaces an expired JWT', async () => {
    await cache.RefreshObservabilityToken('agent', 'tenant', () => makeJwtWithExp(120));
    jest.advanceTimersByTime(61_000);
    await cache.RefreshObservabilityToken('agent', 'tenant', () => 'opaque-app-only-token');
    expect(cache.getObservabilityToken('agent', 'tenant')).toBe('opaque-app-only-token');
    jest.advanceTimersByTime(3_600_000);
    expect(cache.getObservabilityToken('agent', 'tenant')).toBeNull();
  });

  it('evicts the oldest token when the cache reaches capacity', async () => {
    const token = makeJwtWithExp(300);
    const capacity = cache['_maxCacheSize'];
    const resolver = () => token;
    for (let i = 0; i <= capacity; i++) {
      await cache.RefreshObservabilityToken(`agent-${i}`, 'tenant', resolver);
    }
    expect(cache.getObservabilityToken('agent-0', 'tenant')).toBeNull();
    expect(cache.getObservabilityToken('agent-1', 'tenant')).toBe(token);
    expect(cache.getObservabilityToken(`agent-${capacity}`, 'tenant')).toBe(token);
  });

  it('caps token lifetime to 24 hours', async () => {
    const token = makeJwtWithExp(48 * 60 * 60);
    await cache.RefreshObservabilityToken('agent', 'tenant', () => token);
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(cache.getObservabilityToken('agent', 'tenant')).toBeNull();
  });

  it('invalidates one token independently, then all tokens', async () => {
    const token = makeJwtWithExp(300);
    await cache.RefreshObservabilityToken('one', 'tenant', () => token);
    await cache.RefreshObservabilityToken('two', 'tenant', () => token);
    cache.invalidateToken('one', 'tenant');
    expect(cache.getObservabilityToken('one', 'tenant')).toBeNull();
    expect(cache.getObservabilityToken('two', 'tenant')).toBe(token);
    cache.invalidateAll();
    expect(cache.getObservabilityToken('two', 'tenant')).toBeNull();
  });
});
