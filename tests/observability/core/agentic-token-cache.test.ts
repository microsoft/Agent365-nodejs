// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AgenticTokenCacheInstance } from '@microsoft/agents-a365-observability/src/utils/AgenticTokenCache';
import type { Authorization, TurnContext } from '@microsoft/agents-hosting';

// Minimal stubs
const makeTurnContext = (): TurnContext => ({ activity: { id: 'a1' } } as unknown as TurnContext);

function makeJwtWithExp(expSecondsFromNow: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow;
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `${header}.${payload}.sig`; // signature value irrelevant for our decoder
}

function makeAuthorizationMock(sequence: Array<{ token?: string; error?: any }>): Authorization {
  let call = 0;
  const authLike = {
    exchangeToken: async () => {
      const current = sequence[Math.min(call, sequence.length - 1)];
      call++;
      if (current.error) {
        throw current.error;
      }
      return { token: current.token } as any;
    },
    // Unused members stubbed to satisfy Authorization interface typing expectations.
    getToken: async () => undefined,
    signOut: async () => {},
    onSignInSuccess: () => {},
    onSignInFailure: () => {}
  } as unknown as Authorization;
  return authLike;
}

// Silence logger noise in tests by mocking logger's methods if available
jest.mock('@microsoft/agents-a365-observability/src/utils/logging', () => {
  const orig: any = jest.requireActual('@microsoft/agents-a365-observability/src/utils/logging');
  return {
    __esModule: true,
    default: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    },
    formatError: orig.formatError || ((e: unknown) => String(e))
  };
});

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
    await AgenticTokenCacheInstance.RefreshObservabilityToken('agentA', 'tenantA', makeTurnContext(), auth, ['scope.read']);
    const tokenReturned = AgenticTokenCacheInstance.getObservabilityToken('agentA', 'tenantA');
    expect(tokenReturned).not.toBeNull();
    expect(tokenReturned).toBe(token);
  });

  it('retries on retriable error then succeeds', async () => {
    const token = makeJwtWithExp(300);
    const retriableErr = { status: 500, message: 'server error' };
    const sequence: Array<{ token?: string; error?: any }> = [
      { error: retriableErr },
      { token }
    ];
    let call = 0;
    const exchangeFn = jest.fn(async () => {
      const current = sequence[Math.min(call, sequence.length - 1)];
      call++;
      if (current.error) throw current.error;
      return { token: current.token } as any;
    });
    const auth = {
      exchangeToken: exchangeFn,
      getToken: async () => undefined,
      signOut: async () => {},
      onSignInSuccess: () => {},
      onSignInFailure: () => {}
    } as unknown as Authorization;
    const p = AgenticTokenCacheInstance.RefreshObservabilityToken('agentB', 'tenantB', makeTurnContext(), auth, ['scope.read']);
    // Fast-forward timers to allow retry backoff sleeps (200ms + 400ms linear)
    await jest.advanceTimersByTimeAsync(1000);
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
    await AgenticTokenCacheInstance.RefreshObservabilityToken('agentC', 'tenantC', makeTurnContext(), auth, ['scope.read']);
    const token = AgenticTokenCacheInstance.getObservabilityToken('agentC', 'tenantC');
    expect(token).toBeNull();
  });

  it('treats near-expiry token as expired (skew refresh)', async () => {
    // exp in 30s, skew is 60s -> considered expired immediately
    const auth = makeAuthorizationMock([{ token: makeJwtWithExp(30) }]);
    await AgenticTokenCacheInstance.RefreshObservabilityToken('agentD', 'tenantD', makeTurnContext(), auth, ['scope.read']);
    const token = AgenticTokenCacheInstance.getObservabilityToken('agentD', 'tenantD');
    expect(token).toBeNull(); // because isExpired returned true and retrieval logs expiration
  });

  it('returns cached token before expiry then invalid after advancing time', async () => {
    const auth = makeAuthorizationMock([{ token: makeJwtWithExp(120) }]); // 2 minutes
    await AgenticTokenCacheInstance.RefreshObservabilityToken('agentE', 'tenantE', makeTurnContext(), auth, ['scope.read']);
    const tokenBefore = AgenticTokenCacheInstance.getObservabilityToken('agentE', 'tenantE');
    expect(tokenBefore).not.toBeNull();
    // Advance time just before skew boundary (expire - skew + 1000ms)
    jest.advanceTimersByTime(61_000); // move forward > skew (60s) so token becomes expired
    const tokenAfter = AgenticTokenCacheInstance.getObservabilityToken('agentE', 'tenantE');
    expect(tokenAfter).toBeNull();
  });
});
