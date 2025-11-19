// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { TurnContext, Authorization } from '@microsoft/agents-hosting';
import { getObservabilityAuthenticationScope } from '@microsoft/agents-a365-runtime';
// We intentionally do not depend on the observability package logger to avoid circular dependency;
// lightweight console wrappers are used instead. Adjust if centralized logging is required.
const logger = {
	info: (...a: unknown[]) => console.info(...a),
	warn: (...a: unknown[]) => console.warn(...a),
	error: (...a: unknown[]) => console.error(...a)
};

function formatError(e: unknown): string {
	if (e instanceof Error) { return `${e.name}: ${e.message}`; }
	return String(e);
}

interface CacheEntry {
	scopes: string[];
	token?: string;
	expiresOn?: number;
	acquiredOn?: number;
}

class AgenticTokenCache {
	private readonly _map = new Map<string, CacheEntry>();
	private readonly _defaultRefreshSkewMs = 60_000;
	private readonly _defaultMaxTokenAgeMs = 3_600_000;
	private readonly _keyLocks = new Map<string, Promise<unknown>>();
	private makeKey(agentId: string, tenantId: string): string { return `${agentId}:${tenantId}`; }

	public getObservabilityToken(agentId: string, tenantId: string): string | null {
		const key = this.makeKey(agentId, tenantId);
		const entry = this._map.get(key);
		if (!entry) { logger.error(`[AgenticTokenCache] No cache entry for ${key}`); return null; }
		if (!entry.token) { logger.error(`[AgenticTokenCache] No token cached for ${key}`); return null; }
		if (this.isExpired(entry)) { logger.error(`[AgenticTokenCache] Token expired for ${key}`); return null; }
		return entry.token;
	}

	public async RefreshObservabilityToken(
		agentId: string,
		tenantId: string,
		turnContext: TurnContext,
		authorization: Authorization,
		scopes: string[]
	): Promise<void> {
		const key = this.makeKey(agentId, tenantId);
		if (!authorization) { logger.error('[AgenticTokenCache] Authorization not set'); return; }
		if (!turnContext) { logger.error('[AgenticTokenCache] TurnContext not set'); return; }
		return this.withKeyLock<void>(key, async () => {
			let entry = this._map.get(key);
			if (!entry) {
				const effectiveScopes = (scopes && scopes.length > 0) ? scopes : getObservabilityAuthenticationScope();
				if (!Array.isArray(effectiveScopes) || effectiveScopes.length === 0) { logger.error('[AgenticTokenCache] No valid scopes'); return; }
				entry = { scopes: effectiveScopes };
				this._map.set(key, entry);
			}
			if (!Array.isArray(entry.scopes) || entry.scopes.length === 0) { logger.error('[AgenticTokenCache] Entry has invalid scopes'); return; }
			try {
				if (entry.token && !this.isExpired(entry)) { return; }
				const maxRetries = 2;
				for (let attempt = 0; attempt <= maxRetries; attempt++) {
					logger.info(`[AgenticTokenCache] Exchanging token attempt ${attempt + 1}/${maxRetries + 1}`);
						try {
							const tokenResponse = await authorization.exchangeToken(turnContext, 'agentic', { scopes: entry.scopes });
							if (!tokenResponse?.token) { logger.error('[AgenticTokenCache] Undefined token returned'); entry.token = undefined; entry.expiresOn = undefined; break; }
							entry.token = tokenResponse.token;
							entry.acquiredOn = Date.now();
							const oboExp = this.decodeExp(entry.token);
							if (oboExp) { entry.expiresOn = oboExp * 1000; } else { logger.warn('[AgenticTokenCache] No exp claim, fallback TTL'); }
							logger.info('[AgenticTokenCache] Token cached');
							return;
						} catch (e) {
							const retriable = this.isRetriableError(e);
							if (retriable && attempt < maxRetries) { logger.warn(`[AgenticTokenCache] Retriable failure attempt ${attempt + 1}`, formatError(e)); await this.sleep(200 * (attempt + 1)); continue; }
							logger.error('[AgenticTokenCache] Non-retriable failure', formatError(e)); entry.token = undefined; entry.expiresOn = undefined; break;
						}
				}
			} catch (e) {
				logger.error('[AgenticTokenCache] Unexpected failure', formatError(e)); entry.token = undefined; entry.expiresOn = undefined;
			}
		});
	}

	invalidateToken(agentId: string, tenantId: string): void { const entry = this._map.get(this.makeKey(agentId, tenantId)); if (entry) { entry.token = undefined; entry.expiresOn = undefined; } }
	invalidateAll(): void { this._map.clear(); }

	private decodeExp(jwt: string): number | undefined {
		try { if (!jwt) return undefined; const parts = jwt.split('.'); if (parts.length < 2) return undefined; const payload = parts[1] + '='.repeat((4 - (parts[1].length % 4)) % 4); const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as { exp?: unknown }; return typeof json.exp === 'number' ? json.exp : undefined; } catch { return undefined; }
	}
	private isExpired(entry: CacheEntry): boolean { const now = Date.now(); if (entry.expiresOn) return now >= (entry.expiresOn - this._defaultRefreshSkewMs); if (entry.acquiredOn) return now >= (entry.acquiredOn + this._defaultMaxTokenAgeMs); return true; }
	private isRetriableError(err: unknown): boolean { const e = err as { code?: string; status?: number; message?: string } | undefined; if (!e) return false; const msg = (e.message || '').toLowerCase(); if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('network')) return true; if (typeof e.status === 'number') { if (e.status === 408 || e.status === 429) return true; if (e.status >= 500 && e.status < 600) return true; } return false; }
	private sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
	private async withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> { const previous = this._keyLocks.get(key); if (previous) { try { await previous; } catch (err) { logger.warn(`[AgenticTokenCache] previous promise for ${key} rejected:`, formatError(err)); } } const currentPromise: Promise<T> = fn().finally(() => { if (this._keyLocks.get(key) === currentPromise) { this._keyLocks.delete(key); } }); this._keyLocks.set(key, currentPromise); return currentPromise; }
}

export function createAgenticTokenCacheKey(agentId: string, tenantId: string): string { return `${agentId}:${tenantId}`; }
export const AgenticTokenCacheInstance = new AgenticTokenCache();

export default AgenticTokenCacheInstance;
