// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

/**
 * Options for configuring the AgenticTokenCache.
 */
export interface AgenticTokenCacheOptions {
  /** Default time-to-live in milliseconds applied when set() is called without an explicit ttl. */
  defaultTtlMs?: number;
}

interface CacheEntry {
	token: string;
	/** Expiration timestamp in epoch milliseconds. */
	expiresAt: number;
	/** Creation timestamp. */
	createdAt: number;
}

/**
 * Lightweight in-memory TTL cache for agent tokens.
 * Minimal parity with C# version: set/get with expiration and cache key helper.
 */
export class AgenticTokenCache {
  private readonly options: Required<AgenticTokenCacheOptions>;
  private readonly store: Map<string, CacheEntry> = new Map();

  constructor(options?: AgenticTokenCacheOptions) {
    this.options = {
      defaultTtlMs: options?.defaultTtlMs ?? 50 * 60 * 1000
    };
  }

  /** Create a cache key from agent/tenant identifiers. */
  createCacheKey(agentId: string, tenantId?: string): string {
    return tenantId ? `${agentId}:${tenantId}` : agentId;
  }

  /** Set a token value with optional TTL override. */
  set(key: string, token: string, ttlMs?: number): void {
    const now = Date.now();
    const ttl = ttlMs ?? this.options.defaultTtlMs;
    const expiresAt = now + Math.max(0, ttl);

    this.store.set(key, { token, expiresAt, createdAt: now });
  }

  /** Retrieve a token if present and not expired; otherwise returns null. */
  get(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.token;
  }
}

export const AgenticTokenCacheInstance = new AgenticTokenCache();


