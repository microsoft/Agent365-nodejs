// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

const { AgenticTokenCacheInstance } = require('@microsoft/agents-a365-observability-tokencache') as { AgenticTokenCacheInstance: any };

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
    await AgenticTokenCacheInstance.RefreshObservabilityToken('agentA', 'tenantA', makeTurnContext(), auth as any, ['scope.read']);
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
    const p = AgenticTokenCacheInstance.RefreshObservabilityToken('agentB', 'tenantB', makeTurnContext() as any, auth as any, ['scope.read']);
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
    await AgenticTokenCacheInstance.RefreshObservabilityToken('agentC', 'tenantC', makeTurnContext(), auth as any, ['scope.read']);
    const token = AgenticTokenCacheInstance.getObservabilityToken('agentC', 'tenantC');
    expect(token).toBeNull();
  });

  it('treats near-expiry token as expired (skew refresh)', async () => {
    const auth = makeAuthorizationMock([{ token: makeJwtWithExp(30) }]);
    await AgenticTokenCacheInstance.RefreshObservabilityToken('agentD', 'tenantD', makeTurnContext(), auth as any, ['scope.read']);
    const token = AgenticTokenCacheInstance.getObservabilityToken('agentD', 'tenantD');
    expect(token).toBeNull();
  });

  it('returns cached token before expiry then invalid after advancing time', async () => {
    const auth = makeAuthorizationMock([{ token: makeJwtWithExp(120) }]);
    await AgenticTokenCacheInstance.RefreshObservabilityToken('agentE', 'tenantE', makeTurnContext(), auth as any, ['scope.read']);
    const tokenBefore = AgenticTokenCacheInstance.getObservabilityToken('agentE', 'tenantE');
    expect(tokenBefore).not.toBeNull();
    jest.advanceTimersByTime(61_000);
    const tokenAfter = AgenticTokenCacheInstance.getObservabilityToken('agentE', 'tenantE');
    expect(tokenAfter).toBeNull();
  });
});
