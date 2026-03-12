// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { AgenticTokenCacheInstance } from '@microsoft/agents-a365-observability-hosting';

interface TurnContextStub { activity: { id: string } }
interface AuthorizationStub {
  exchangeToken: (...args: any[]) => Promise<{ token: string | undefined }>
  getToken: (...args: any[]) => Promise<{ token: string }>
  signOut: () => Promise<void> | void
  onSignInSuccess: () => void
  onSignInFailure: () => void
}
interface SequenceStep { token?: string; error?: unknown }

const makeTurnContext = (): TurnContextStub => ({ activity: { id: 'a1' } });

// Helper to cast our minimal stub to the SDK TurnContext type expected by the cache
const asTurnContext = (stub: TurnContextStub): import('@microsoft/agents-hosting').TurnContext => {
  return stub as unknown as import('@microsoft/agents-hosting').TurnContext;
};

function makeJwtWithExp(expSecondsFromNow: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow;
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `${header}.${payload}.sig`;
}

function makeAuthorizationMock(sequence: SequenceStep[]): AuthorizationStub {
  let call = 0;
  const authLike: AuthorizationStub = {
    exchangeToken: async () => {
      const current = sequence[Math.min(call, sequence.length - 1)];
      call++;
      if (current.error) throw current.error;
      return { token: current.token || '' };
    },
    getToken: async () => ({ token: 'unused' }),
    signOut: async () => {},
    onSignInSuccess: () => {},
    onSignInFailure: () => {}
  };
  return authLike;
}

describe('AgenticTokenCacheInstance', () => {
  beforeEach(() => {
    AgenticTokenCacheInstance.invalidateAll();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns null when no entry exists', () => {
    const token = AgenticTokenCacheInstance.getObservabilityToken('agentX', 'tenantY');
    expect(token).toBeNull();
  });

  it('exchanges and caches token on first call', async () => {
    const token = makeJwtWithExp(300);
    const auth = makeAuthorizationMock([{ token }]);
    await AgenticTokenCacheInstance.RefreshObservabilityToken(
      'agentA',
      'tenantA',
      asTurnContext(makeTurnContext()),
      auth as any,
      ['scope.read']
    );
    const tokenReturned = AgenticTokenCacheInstance.getObservabilityToken('agentA', 'tenantA');
    expect(tokenReturned).not.toBeNull();
    expect(tokenReturned).toBe(token);
  });

  it('retries on retriable error then succeeds', async () => {
    const token = makeJwtWithExp(300);
    const retriableErr = { status: 500, message: 'server error' };
    const sequence: SequenceStep[] = [
      { error: retriableErr },
      { token }
    ];
    let call = 0;
    const exchangeFn = jest.fn(async () => {
      const current = sequence[Math.min(call, sequence.length - 1)];
      call++;
      if (current.error) throw current.error;
      return { token: current.token };
    });
    const auth: AuthorizationStub = {
      exchangeToken: exchangeFn,
      getToken: async () => ({ token: 'unused' }),
      signOut: async () => {},
      onSignInSuccess: () => {},
      onSignInFailure: () => {}
    };
    const p = AgenticTokenCacheInstance.RefreshObservabilityToken(
      'agentB',
      'tenantB',
      asTurnContext(makeTurnContext()),
      auth as any,
      ['scope.read']
    );
    await (jest as any).advanceTimersByTimeAsync?.(1000) || jest.advanceTimersByTime(1000);
    await p;
    const tokenReturned = AgenticTokenCacheInstance.getObservabilityToken('agentB', 'tenantB');
    expect(tokenReturned).not.toBeNull();
    expect(tokenReturned).toBe(token);
    expect(exchangeFn).toHaveBeenCalledTimes(2);
  });

  it('stops on non-retriable error and leaves token null', async () => {
    const nonRetriableErr = { status: 400, message: 'bad request' };
    const auth = makeAuthorizationMock([
      { error: nonRetriableErr },
      { token: makeJwtWithExp(300) } // should not be used
    ]);
    await AgenticTokenCacheInstance.RefreshObservabilityToken(
      'agentC',
      'tenantC',
      asTurnContext(makeTurnContext()),
      auth as any,
      ['scope.read']
    );
    const token = AgenticTokenCacheInstance.getObservabilityToken('agentC', 'tenantC');
    expect(token).toBeNull();
  });

  it('treats near-expiry token as expired (skew refresh)', async () => {
    const auth = makeAuthorizationMock([{ token: makeJwtWithExp(30) }]);
    await AgenticTokenCacheInstance.RefreshObservabilityToken(
      'agentD',
      'tenantD',
      asTurnContext(makeTurnContext()),
      auth as any,
      ['scope.read']
    );
    const token = AgenticTokenCacheInstance.getObservabilityToken('agentD', 'tenantD');
    expect(token).toBeNull();
  });

  it('returns cached token before expiry then invalid after advancing time', async () => {
    const auth = makeAuthorizationMock([{ token: makeJwtWithExp(120) }]);
    await AgenticTokenCacheInstance.RefreshObservabilityToken(
      'agentE',
      'tenantE',
      asTurnContext(makeTurnContext()),
      auth as any,
      ['scope.read']
    );
    const tokenBefore = AgenticTokenCacheInstance.getObservabilityToken('agentE', 'tenantE');
    expect(tokenBefore).not.toBeNull();
    jest.advanceTimersByTime(61_000);
    const tokenAfter = AgenticTokenCacheInstance.getObservabilityToken('agentE', 'tenantE');
    expect(tokenAfter).toBeNull();
  });

  it('evicts oldest entry when cache exceeds max size', async () => {
    const { AgenticTokenCache } = require('@microsoft/agents-a365-observability-hosting');
    const cache = new AgenticTokenCache();
    const map = (cache as any)._map as Map<string, any>;

    // Pre-fill the map to capacity
    const MAX = (cache as any)._maxCacheSize as number;
    for (let i = 0; i < MAX; i++) {
      map.set(`agent-${i}:tenant-${i}`, { scopes: ['s'], token: `t-${i}`, acquiredOn: Date.now() });
    }
    expect(map.size).toBe(MAX);

    // Insert one more via RefreshObservabilityToken
    const token = makeJwtWithExp(300);
    const auth = makeAuthorizationMock([{ token }]);
    await cache.RefreshObservabilityToken(
      'agent-new',
      'tenant-new',
      asTurnContext(makeTurnContext()),
      auth as any,
      ['scope.read']
    );

    // Size should still be at MAX (oldest evicted, new one added)
    expect(map.size).toBe(MAX);
    // First entry should have been evicted
    expect(map.has('agent-0:tenant-0')).toBe(false);
    // New entry should exist
    expect(map.has('agent-new:tenant-new')).toBe(true);
  });

  it('caps JWT exp claim to 24 hours', async () => {
    const { AgenticTokenCache } = require('@microsoft/agents-a365-observability-hosting');
    const cache = new AgenticTokenCache();

    // Create JWT with exp 48 hours from now
    const farFutureExp = Math.floor(Date.now() / 1000) + (48 * 60 * 60);
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ exp: farFutureExp })).toString('base64url');
    const farFutureToken = `${header}.${payload}.sig`;

    const auth = makeAuthorizationMock([{ token: farFutureToken }]);
    await cache.RefreshObservabilityToken(
      'agent-exp',
      'tenant-exp',
      asTurnContext(makeTurnContext()),
      auth as any,
      ['scope.read']
    );

    const map = (cache as any)._map as Map<string, any>;
    const entry = map.get('agent-exp:tenant-exp');
    expect(entry).toBeDefined();
    expect(entry.expiresOn).toBeDefined();

    // The expiresOn should be capped to ~24 hours from now (not 48 hours)
    const maxAllowed = Date.now() + (24 * 60 * 60 * 1000) + 5000; // 24h + small tolerance
    expect(entry.expiresOn).toBeLessThanOrEqual(maxAllowed);
    // And should be well below the 48-hour uncapped value
    const uncapped = farFutureExp * 1000;
    expect(entry.expiresOn).toBeLessThan(uncapped);
  });
});
