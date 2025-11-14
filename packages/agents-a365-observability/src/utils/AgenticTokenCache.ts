// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { TurnContext, Authorization } from '@microsoft/agents-hosting';
import { getObservabilityAuthenticationScope } from '@microsoft/agents-a365-runtime';
import logger, { formatError } from './logging';

// Structure stored per key
interface CacheEntry {
  scopes: string[];
  token?: string;        // Cached token value
  expiresOn?: number;    // Expiration epoch millis (if provided by exchange response)
  acquiredOn?: number;   // Epoch millis when token was acquired (fallback TTL when expiresOn missing)
}

/**
 * In-memory cache for observability tokens keyed by agentId and tenantId.
 * Features:
 *  - Stores bearer token + decoded expiration per (agentId, tenantId) key.
 *  - Applies an early refresh skew so tokens are proactively refreshed before hard expiry.
 *  - Retries transient exchange failures (network / HTTP 408, 429, 5xx) with linear backoff (200ms, 400ms).
 *  - Serializes write/exchange operations per key with a Promise chain (withKeyLock) to avoid duplicate exchanges.
 *  - Provides synchronous read access (getObservabilityToken) that never triggers network IO.
 *  - Applies a fallback max age (1h) for tokens that lack embedded expiration metadata (exp claim).
 *
 * Thread Safety:
 *  Per-key serialization ensures at most one exchange updates a given entry concurrently. Reads are lock‑free.
 *
 * Limitations:
 *  Process-local only; for multi-process or horizontal scaling scenarios a distributed cache/service is required.
 */
class AgenticTokenCache {
  private readonly _map = new Map<string, CacheEntry>();
  private readonly _defaultRefreshSkewMs = 60_000; // refresh 60s before expiry
  private readonly _defaultMaxTokenAgeMs = 3_600_000; // 1 hour fallback TTL if exp not provided
  // Per-key promise chain to serialize mutations & exchanges
  private readonly _keyLocks = new Map<string, Promise<unknown>>();
  private makeKey(agentId: string, tenantId: string): string {
    return `${agentId}:${tenantId}`;
  }

  /**
   * Returns the currently cached valid token for the key (no network calls).
   * @param agentId Unique agent/application identifier.
   * @param tenantId Tenant identifier (AAD tenant / customer context).
   * @returns Cached bearer token string if present & not expired; otherwise null.
   */
  public getObservabilityToken(agentId: string, tenantId: string): string | null {
    const key = this.makeKey(agentId, tenantId);
    const entry = this._map.get(key);
    if (!entry) {
      logger.error(`[AgenticTokenCache] No cache entry found for agentId=${agentId} tenantId=${tenantId}`);
      return null;
    }
    if (!entry.token) {
      logger.error(`[AgenticTokenCache] No token cached for agentId=${agentId} tenantId=${tenantId}`);
      return null;
    }
    if (this.isExpired(entry)) {
      logger.error(`[AgenticTokenCache] Cached token expired for agentId=${agentId} tenantId=${tenantId}`);
      return null;
    }
    return entry.token;
  }

  /**
   * Ensures a valid token is cached for the (agentId, tenantId) key. Performs an exchange when:
   *   - No token exists yet.
   *   - Token is expired OR within the early refresh skew window.
   * Retries transient failures up to 2 times (3 total attempts) with linear backoff (200ms, 400ms).
   * Idempotent under the per-key lock: concurrent callers serialize and reuse the first successful result.
   * @param agentId Unique agent identifier.
   * @param tenantId Tenant identifier.
   * @param turnContext TurnContext providing activity/service metadata required for exchange.
   * @param authorization Authorization instance used to perform the token exchange.
   * @param scopes Requested scopes; falls back to getObservabilityAuthenticationScope() if empty.
   * @returns Promise resolved once cache updated (success or failure). Inspect using getObservabilityToken().
   */
  public async RefreshObservabilityToken(
    agentId: string,
    tenantId: string,
    turnContext: TurnContext,
    authorization: Authorization,
    scopes: string[]
  ): Promise<void> {
    const key = this.makeKey(agentId, tenantId);
    if (!authorization) {
      logger.error('[AgenticTokenCache] Cannot exchange token. Authorization instance not set.');
      return;
    }

    if (!turnContext) {
      logger.error('[AgenticTokenCache] Cannot exchange token. TurnContext instance not set.');
      return;
    }

    // Acquire or return cached token under key lock
    return this.withKeyLock<void>(key, async () => {
      // Entry creation moved inside lock to avoid race on first initialization
      let entry = this._map.get(key);
      if (!entry) {
        const effectiveScopes = (scopes && scopes.length > 0) ? scopes : getObservabilityAuthenticationScope();
        if (!Array.isArray(effectiveScopes) || effectiveScopes.length === 0) {
          logger.error('[AgenticTokenCache] Cannot exchange token. No valid scopes provided or available from fallback.');
          return; // abort early; entry not created
        }
        entry = { scopes: effectiveScopes };
        this._map.set(key, entry);
      }

      // Validate existing entry scopes (in case previously created with empty array before fix)
      if (!Array.isArray(entry.scopes) || entry.scopes.length === 0) {
        logger.error('[AgenticTokenCache] Cannot exchange token. Cache entry has invalid/empty scopes.');
        return;
      }
      try {
        if (entry.token && !this.isExpired(entry)) {
          return;
        }

        const maxRetries = 2;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          logger.info(`[AgenticTokenCache] No cached token found. Exchanging token ... attempt ${attempt + 1}/${maxRetries + 1}`);
          try {
            const tokenResponse = await authorization.exchangeToken(
              turnContext,
              'agentic',
              { scopes: entry.scopes }
            );
            if (!tokenResponse?.token) {
              logger.error('[AgenticTokenCache] Token exchange returned undefined token, please check agent permission configuration.');
              entry.token = undefined;
              entry.expiresOn = undefined;
              // Undefined token generally not transient; stop retries.
              break;
            }
            entry.token = tokenResponse.token;
            entry.acquiredOn = Date.now();
            const oboExp = this.decodeExp(entry.token);
            if (oboExp) {
              entry.expiresOn = oboExp * 1000; // to epoch millisecond
            } else {
              // No exp claim present; will rely on fallback TTL.
              logger.warn('[AgenticTokenCache] Token has no exp claim. Applying fallback TTL (1h).');
            }
            logger.info('[AgenticTokenCache] Token exchange successful and cached.');
            // success
            return;
          } catch (e) {
            const retriable = this.isRetriableError(e);
            if (retriable && attempt < maxRetries) {
              logger.warn(`[AgenticTokenCache] Retriable token exchange failure (attempt ${attempt + 1})`, formatError(e));
              const backoffMs = 200 * (attempt + 1);
              await this.sleep(backoffMs);
              continue;
            }
            logger.error('[AgenticTokenCache] Non-retriable token exchange failure', formatError(e));
            entry.token = undefined;
            entry.expiresOn = undefined;
            break;
          }
        }
      } catch (e) {
        logger.error('[AgenticTokenCache] Token exchange failed unexpectedly', formatError(e));
        entry.token = undefined;
        entry.expiresOn = undefined;
      }
      return;
    });
  }

  /**
   * Explicitly clears token + expiration for one key forcing a fresh exchange next time.
   * @param agentId Agent identifier.
   * @param tenantId Tenant identifier.
   */
  invalidateToken(agentId: string, tenantId: string): void {
    const key = this.makeKey(agentId, tenantId);
    const entry = this._map.get(key);
    if (entry) {
      entry.token = undefined;
      entry.expiresOn = undefined;
    }
  }

  /**
   * Clears all cached entries (tokens + metadata) for every key.
   */
  invalidateAll(): void {
    this._map.clear();
  }


  /** Decode exp from JWT (returns epoch seconds). */
  private decodeExp(jwt: string): number | undefined {
    try {
      if (!jwt) { return undefined; }
      const parts = jwt.split('.');
      if (parts.length < 2) { return undefined; }
      const payload = parts[1] + '='.repeat((4 - (parts[1].length % 4)) % 4); // base64 padding
      const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as { exp?: unknown };
      return typeof json.exp === 'number' ? json.exp : undefined;
    } catch {
      return undefined;
    }
  }
  private isExpired(entry: CacheEntry): boolean {
    const now = Date.now();
    if (entry.expiresOn) {
      return now >= (entry.expiresOn - this._defaultRefreshSkewMs); // Refresh early by skew
    }
    // Fallback: if no explicit expiration, treat as expired after max age.
    if (entry.acquiredOn) {
      return now >= (entry.acquiredOn + this._defaultMaxTokenAgeMs);
    }
    // No timing metadata at all; force refresh immediately.
    return true;
  }

  /** Basic transient error classification for retry logic */
  private isRetriableError(err: unknown): boolean {
    const e = err as { code?: string; status?: number; message?: string } | undefined;
    if (!e) return false;
    // Network / timeout style codes
    const msg = (e.message || '').toLowerCase();
    if (msg.includes('timeout') || msg.includes('ECONNRESET') || msg.includes('network')) return true;
    // HTTP status heuristics
    if (typeof e.status === 'number') {
      if (e.status === 408 || e.status === 429) return true;
      if (e.status >= 500 && e.status < 600) return true;
    }
    return false;
  }

  /** Simple sleep helper for retry backoff */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this._keyLocks.get(key);
    if (previous) {
      try {
        await previous;
      } catch (err) {
        // Previous locked operation failed; log at warn level for visibility without throwing.
        logger.warn(`[AgenticTokenCache] withKeyLock: previous promise for key "${key}" rejected:`, formatError(err));
      }
    }
    const currentPromise: Promise<T> = fn().finally(() => {
      if (this._keyLocks.get(key) === currentPromise) {
        this._keyLocks.delete(key);
      }
    });
    this._keyLocks.set(key, currentPromise);
    return currentPromise;
  }
}

/**
 * Helper for external callers to build a cache key string (agentId:tenantId) consistent with internal usage.
 * @param agentId Agent identifier.
 * @param tenantId Tenant identifier.
 * @returns Combined cache key string in format "agentId:tenantId".
 */
export function createAgenticTokenCacheKey(agentId: string, tenantId: string): string {
  return `${agentId}:${tenantId}`;
}


export const AgenticTokenCacheInstance = new AgenticTokenCache();
