// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import type { TurnContext, Authorization } from '@microsoft/agents-hosting';
import {
    logger, formatError, defaultObservabilityConfigurationProvider,
    type ObservabilityConfiguration, type TokenResolver,
} from '@microsoft/agents-a365-observability';
import type { IConfigurationProvider } from '@microsoft/agents-a365-runtime';

/** Acquires an app-only OBS token; must not perform user_fic or OBO authentication. */
export type ObservabilityTokenResolver = (
    agentId: string,
    tenantId: string,
    scopes: readonly string[]
) => ReturnType<TokenResolver>;

interface CacheEntry {
    scopes: string[];
    token?: string;
    expiresOn?: number;
    acquiredOn?: number;
}

/**
 * Cache for agentic authentication tokens used by observability services.
 *
 * For custom configuration, create a new instance with your own configuration provider:
 * ```typescript
 * const customCache = new AgenticTokenCache(myConfigProvider);
 * ```
 *
 * For default configuration using environment variables, use the exported
 * `AgenticTokenCacheInstance` singleton.
 */
export class AgenticTokenCache {
    private readonly _map = new Map<string, CacheEntry>();
    private readonly _defaultRefreshSkewMs = 60_000;
    private readonly _defaultMaxTokenAgeMs = 3_600_000;
    private readonly _maxCacheSize = 10_000;
    private readonly _maxExpSeconds = 86_400; // 24 hours
    private readonly _keyLocks = new Map<string, Promise<unknown>>();
    private readonly _configProvider: IConfigurationProvider<ObservabilityConfiguration>;

    /**
     * Construct an AgenticTokenCache.
     * @param configProvider Optional configuration provider. Defaults to defaultObservabilityConfigurationProvider if not specified.
     */
    constructor(configProvider?: IConfigurationProvider<ObservabilityConfiguration>) {
        this._configProvider = configProvider ?? defaultObservabilityConfigurationProvider;
    }

    public static makeKey(agentId: string, tenantId: string): string {
        return `${agentId}:${tenantId}`;
    }

    public getObservabilityToken(agentId: string, tenantId: string): string | null {
        const key = AgenticTokenCache.makeKey(agentId, tenantId);
        const entry = this._map.get(key);
        if (!entry) {
            logger.error(`[AgenticTokenCache] No cache entry for ${key}`);
            return null;
        }
        if (!entry.token) {
            logger.error(`[AgenticTokenCache] No token cached for ${key}`);
            return null;
        }
        if (this.isExpired(entry)) {
            logger.error(`[AgenticTokenCache] Token expired for ${key}`);
            return null;
        }
        return entry.token;
    }

    /**
     * Refreshes an app-only OBS token independently of the current user's authorization.
     * The resolver receives the configured OBS scopes and must acquire a token for
     * the exporting agent identity, not its blueprint or the workload's user.
     */
    public async RefreshObservabilityToken(
        agentId: string,
        tenantId: string,
        tokenResolver: ObservabilityTokenResolver
    ): Promise<void>;

    /** @deprecated User token exchange cannot authenticate S2S OBS. Pass an app-only token resolver instead. */
    public async RefreshObservabilityToken(
        agentId: string,
        tenantId: string,
        turnContext: TurnContext,
        authorization: Authorization,
        scopes: string[],
        authHandlerName?: string
    ): Promise<void>;

    public async RefreshObservabilityToken(
        agentId: string,
        tenantId: string,
        resolverOrContext: ObservabilityTokenResolver | TurnContext,
        _authorization?: Authorization,
        _scopes?: string[],
        _authHandlerName?: string
    ): Promise<void> {
        if (typeof resolverOrContext !== 'function') {
            throw new Error('[AgenticTokenCache] S2S OBS requires an app-only token resolver. Use RefreshObservabilityToken(agentId, tenantId, tokenResolver); delegated user token exchange is no longer supported.');
        }
        if (!agentId?.trim() || !tenantId?.trim()) {
            throw new Error('[AgenticTokenCache] Agent and tenant IDs are required');
        }
        const key = AgenticTokenCache.makeKey(agentId, tenantId);
        return this.withKeyLock<void>(key, async () => {
            let entry = this._map.get(key);
            if (!entry) {
                const effectiveScopes = [...this._configProvider.getConfiguration().observabilityAuthenticationScopes];
                if (!Array.isArray(effectiveScopes) || effectiveScopes.length === 0) {
                    throw new Error('[AgenticTokenCache] No valid scopes');
                }
                entry = { scopes: effectiveScopes };
                if (this._map.size >= this._maxCacheSize) {
                    const oldest = this._map.keys().next().value;
                    if (oldest !== undefined) {
                        this._map.delete(oldest);
                    }
                }
                this._map.set(key, entry);
            }
            if (!Array.isArray(entry.scopes) || entry.scopes.length === 0) {
                throw new Error('[AgenticTokenCache] Entry has invalid scopes');
            }

            if (entry.token && !this.isExpired(entry)) {
                return;
            }

            const maxRetries = 2;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                logger.info(`[AgenticTokenCache] Acquiring app-only token attempt ${attempt + 1}/${maxRetries + 1}`);
                try {
                    const token = await resolverOrContext(agentId, tenantId, [...entry.scopes]);
                    if (!token?.trim()) {
                        throw new Error('[AgenticTokenCache] App-only token resolver returned no token');
                    }
                    entry.token = token;
                    entry.acquiredOn = Date.now();
                    const exp = this.decodeExp(token);
                    if (exp) {
                        entry.expiresOn = exp * 1000;
                    } else {
                        entry.expiresOn = undefined;
                        logger.warn('[AgenticTokenCache] No exp claim, fallback TTL');
                    }
                    logger.info('[AgenticTokenCache] Token cached');
                    return;
                } catch (e) {
                    const retriable = this.isRetriableError(e);
                    if (retriable && attempt < maxRetries) {
                        logger.warn(`[AgenticTokenCache] Retriable failure attempt ${attempt + 1}`, formatError(e));
                        await this.sleep(200 * (attempt + 1));
                        continue;
                    }
                    logger.error('[AgenticTokenCache] Non-retriable failure', formatError(e));
                    entry.token = undefined;
                    entry.expiresOn = undefined;
                    entry.acquiredOn = undefined;
                    throw e;
                }
            }
        });
    }

    public invalidateToken(agentId: string, tenantId: string): void {
        const entry = this._map.get(AgenticTokenCache.makeKey(agentId, tenantId));
        if (entry) {
            entry.token = undefined;
            entry.expiresOn = undefined;
        }
    }

    public invalidateAll(): void {
        this._map.clear();
    }

    private decodeExp(jwt: string): number | undefined {
        try {
            if (!jwt) {
                return undefined;
            }
            const parts = jwt.split('.');
            if (parts.length < 2) {
                return undefined;
            }
            const payloadSegment = parts[1];
            const padded = payloadSegment + '='.repeat((4 - (payloadSegment.length % 4)) % 4);
            const json = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as { exp?: unknown };
            if (typeof json.exp !== 'number') return undefined;
            const maxExp = Math.floor(Date.now() / 1000) + this._maxExpSeconds;
            return Math.min(json.exp, maxExp);
        } catch {
            return undefined;
        }
    }

    private isExpired(entry: CacheEntry): boolean {
        const now = Date.now();
        if (entry.expiresOn) {
            return now >= (entry.expiresOn - this._defaultRefreshSkewMs);
        }
        if (entry.acquiredOn) {
            return now >= (entry.acquiredOn + this._defaultMaxTokenAgeMs);
        }
        return true;
    }

    private isRetriableError(err: unknown): boolean {
        const e = err as { code?: string; status?: number; message?: string } | undefined;
        if (!e) {
            return false;
        }
        const msg = (e.message || '').toLowerCase();
        if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('network')) {
            return true;
        }
        if (typeof e.status === 'number') {
            if (e.status === 408 || e.status === 429) {
                return true;
            }
            if (e.status >= 500 && e.status < 600) {
                return true;
            }
        }
        return false;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
        const previous = this._keyLocks.get(key);
        if (previous) {
            try {
                await previous;
            } catch (err) {
                logger.warn(`[AgenticTokenCache] previous promise for ${key} rejected:`, formatError(err));
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
 * Default singleton instance of AgenticTokenCache using the default configuration provider.
 *
 * This instance uses `defaultObservabilityConfigurationProvider` which reads from
 * environment variables. It is suitable for:
 * - Single-tenant deployments
 * - Multi-tenant deployments using dynamic override functions in the configuration
 *
 * **For custom configuration:** Create a new `AgenticTokenCache` instance with your
 * own `IConfigurationProvider<ObservabilityConfiguration>`:
 * ```typescript
 * import { AgenticTokenCache } from '@microsoft/agents-a365-observability-hosting';
 *
 * const customCache = new AgenticTokenCache(myCustomConfigProvider);
 * ```
 */
export const AgenticTokenCacheInstance = new AgenticTokenCache();
export default AgenticTokenCacheInstance;
