// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { TurnContext, Authorization } from '@microsoft/agents-hosting';
import { getObservabilityAuthenticationScope } from '@microsoft/agents-a365-runtime';
import logger, { formatError } from './logging';

// Structure stored per key
interface CacheEntry {
  turnContext: TurnContext;
  scopes: string[];
  token?: string;       // Cached token value
  expiresOn?: number;   // Expiration epoch millis (if provided by exchange response)
  authorization: Authorization;
}


export class AgenticTokenCache {
  private readonly _map = new Map<string, CacheEntry>();
  private readonly _defaultRefreshSkewMs = 60_000; // refresh 60s before expiry
  // Per-key promise chain to serialize mutations & exchanges
  private readonly _keyLocks = new Map<string, Promise<unknown>>();
  private makeKey(agentId: string, tenantId: string): string {
    return `${agentId}:${tenantId}`;
  }

  /**
   * Registers observability context for (agentId, tenantId).
   * First registration wins; subsequent calls are ignored (idempotent, no mutation/merge).
   */
  registerObservability(
    agentId: string,
    tenantId: string,
    turnContext: TurnContext,
    authorization: Authorization,
    scopes?: string[],
  ): void {
    if (!authorization) {
      throw new Error('authorization cannot be null.');
    }
    if (!agentId || !agentId.trim()) {
      throw new Error('agentId cannot be null or whitespace.');
    }
    if (!tenantId || !tenantId.trim()) {
      throw new Error('tenantId cannot be null or whitespace.');
    }
    if (!turnContext) {
      throw new Error('turnContext cannot be null.');
    }

    const key = this.makeKey(agentId, tenantId);
    const effectiveScopes = (scopes && scopes.length > 0)
      ? scopes
      : getObservabilityAuthenticationScope();
    if (this._map.has(key)) {
      return;
    }
    // Clone the TurnContext to avoid later 'Proxy has been revoked' errors when accessed asynchronously
    const cloned = this.cloneTurnContext(turnContext);
    this._map.set(key, {
      turnContext: cloned,
      scopes: effectiveScopes,
      authorization,
    });
  }

  /**
   * Retrieves (and if necessary exchanges) the observability token.
   * Returns null on failure or if not registered.
   */
  async getObservabilityToken(agentId: string, tenantId: string): Promise<string | null> {
    const key = this.makeKey(agentId, tenantId);
    const entry = this._map.get(key);
    if (!entry) {
      logger.error(`AgenticTokenCache: No auth registration needed is found. No exchange token will run. agentId: ${agentId}, tenantId: ${tenantId}`);
      return null;
    }

    return this.withKeyLock<string | null>(key, async () => {
      if (entry.token && !this.isExpired(entry)) {
        return entry.token;
      }
      const token = await this.exchangeToken(entry).catch(() => null);
      entry.token = token || undefined;
      return token;
    });
  }

  /**
   * Explicitly invalidates a cached token forcing re-exchange on next request.
   */
  invalidateToken(agentId: string, tenantId: string): void {
    const key = this.makeKey(agentId, tenantId);
    const entry = this._map.get(key);
    if (entry) {
      entry.token = undefined;
      entry.expiresOn = undefined;
    }
  }

  /** Clears all cached tokens & registrations. */
  invalidateAll(): void {
    this._map.clear();
  }

  private isExpired(entry: CacheEntry): boolean {
    if (!entry.expiresOn) {
      return false; // If we don't have expiration metadata, assume still valid
    }
    const now = Date.now();
    return now >= (entry.expiresOn - this._defaultRefreshSkewMs); // Refresh early by skew
  }

  private async exchangeToken(entry: CacheEntry): Promise<string | null> {
    logger.info('AgenticTokenCache: Exchanging token via Authorization.exchangeToken...');
    if(!entry.authorization) {
      throw new Error('Authorization instance not set.');
    }
    try {
      const tokenResponse = await entry.authorization.exchangeToken(
        entry.turnContext,
        'agentic',
        { scopes: entry.scopes }
      );
      if (!tokenResponse?.token) {
        logger.error('AgenticTokenCache: Token exchange returned undefined token');
        return null;
      }
      const expiresOn = (tokenResponse as { expiresOn?: number | Date | string }).expiresOn;
      if (expiresOn instanceof Date) {
        entry.expiresOn = expiresOn.getTime();
      } else if (typeof expiresOn === 'number') {
        entry.expiresOn = expiresOn;
      } else if (typeof expiresOn === 'string') {
        const parsed = Date.parse(expiresOn);
        if (!isNaN(parsed)) {
          entry.expiresOn = parsed;
        }
      }
      return tokenResponse.token;
    } catch (e) {
      logger.error('AgenticTokenCache: Token exchange failed with', formatError(e));
      return null; // Silent failure
    }
  }

  private async withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this._keyLocks.get(key);
    if (previous) {
      try { await previous; } catch { /* empty */ }
    }
    const currentPromise: Promise<T> = fn().finally(() => {
      if (this._keyLocks.get(key) === currentPromise) {
        this._keyLocks.delete(key);
      }
    });
    this._keyLocks.set(key, currentPromise);
    return currentPromise;
  }

  /**
   * Creates a shallow clone of the TurnContext preserving activity and services.
   * Falls back gracefully if a native clone() exists.
   */
  private cloneTurnContext(ctx: TurnContext): TurnContext {
    // Prefer native implementation if available
    const possibleClone = (ctx as unknown as { clone?: () => TurnContext }).clone;
    if (typeof possibleClone === 'function') {
      try {
        return possibleClone.call(ctx);
      } catch {
        // Ignore and fallback
      }
    }

    // Derive a typed helper interface to avoid 'any'
    interface TurnContextLike {
      activity: Record<string, unknown>;
      [key: string]: unknown;
    }
    const original = ctx as unknown as TurnContextLike;

    const proto = Object.getPrototypeOf(ctx);
    const shallow: TurnContextLike = Object.create(proto);
    for (const k of Object.keys(original)) {
      shallow[k] = original[k];
    }
    // Shallow copy activity object
    shallow.activity = { ...original.activity };
    return shallow as unknown as TurnContext;
  }
}

// Helper for external callers to build a cache key if needed
export function createAgenticTokenCacheKey(agentId: string, tenantId: string): string {
  return `${agentId}:${tenantId}`;
}

export type TokenResolver = (agentId: string, tenantId: string) => string | null | Promise<string | null>;

export const AgenticTokenCacheInstance = new AgenticTokenCache();
