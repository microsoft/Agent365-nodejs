// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
  PurviewDlpAccessTokenProvider,
  PurviewDlpAgentContext,
  PurviewDlpAgenticUserConnection,
  PurviewDlpTokenResolver,
} from './contracts';
import { isObject, nonEmpty, sdkError, withTokenCacheKey } from './internal';

/** Token resolvers for `PurviewDlpClient`. */
export class PurviewDlpTokenResolvers {
  /**
   * The agentic user's delegated Microsoft Graph token, from the agent's Agents SDK connection
   * (`getAgenticUserToken`), so Purview evaluates the content as the agentic user (`/me`). The token needs
   * `Content.Process.User`, which the agentic user inherits from its blueprint's delegated Microsoft Graph
   * grant. The client caches it per tenant, agent, agentic user and scope until five minutes before it
   * expires.
   *
   * The evaluation's agent context must carry `tenantId` (`activity.getAgenticTenantId()`), `agentId`
   * (`activity.getAgenticInstanceId()`) and `agenticUserId` (`activity.getAgenticUser()`).
   *
   * @param connection The agent's connection, for example `adapter.connectionManager.getDefaultConnection()`
   * (MSAL connections implement `getAgenticUserToken`).
   * @returns A resolver for `PurviewDlpClient.evaluate`.
   * @throws When the connection has no `getAgenticUserToken`.
   */
  public static fromAgenticUser(connection: PurviewDlpAgenticUserConnection): PurviewDlpTokenResolver {
    if (typeof connection?.getAgenticUserToken !== 'function') {
      throw new TypeError('connection must provide getAgenticUserToken.');
    }

    const resolver: PurviewDlpTokenResolver = async (agent, scopes, signal) => {
      signal?.throwIfAborted();
      const { tenantId, agentId, agenticUserId } = agenticIdentity(agent);
      const accessToken = await connection.getAgenticUserToken(tenantId, agentId, agenticUserId, scopes);
      if (typeof accessToken !== 'string' || !accessToken) {
        throw sdkError(new Error('The agent connection returned no agentic user token.'));
      }

      return { accessToken };
    };
    // The token is the agentic user's, fully determined by these ids and the scope, so it can be cached.
    return withTokenCacheKey(resolver, (agent, scope) => {
      const { tenantId, agentId, agenticUserId } = agenticIdentity(agent);
      return JSON.stringify([tenantId.toLowerCase(), agentId.toLowerCase(), agenticUserId.toLowerCase(), scope]);
    });
  }

  /**
   * A Microsoft Graph token from the host, for example an on-behalf-of token for the signed-in user
   * (`/me`, delegated `Content.Process.User`). With `userId`, the content is evaluated for that user
   * (`/users/{userId}`), for example with an app-only token that carries `Content.Process.All`; the app-only
   * path has not been validated end to end. The client does not cache these tokens: the provider is asked
   * for every evaluation, so it should cache them itself.
   *
   * @param getToken Returns the token for the requested scopes.
   * @param userId The user to evaluate the content for; unset for the token's own user (`/me`).
   * @returns A resolver for `PurviewDlpClient.evaluate`.
   * @throws When `getToken` is not a function, or `userId` is set but empty.
   */
  public static fromAccessTokenProvider(getToken: PurviewDlpAccessTokenProvider, userId?: string): PurviewDlpTokenResolver {
    if (typeof getToken !== 'function') {
      throw new TypeError('getToken is required.');
    }

    if (userId !== undefined && !nonEmpty(userId)) {
      throw new TypeError('userId must be a non-empty string when set.');
    }

    const user = nonEmpty(userId);
    return async (agent, scopes, signal) => {
      const accessToken = await getToken(scopes, signal, agent);
      return typeof accessToken === 'string' && accessToken ? { accessToken, ...(user ? { userId: user } : {}) } : null;
    };
  }
}

function agenticIdentity(agent: PurviewDlpAgentContext): { tenantId: string; agentId: string; agenticUserId: string } {
  const source: Record<string, unknown> = isObject(agent) ? agent as unknown as Record<string, unknown> : {};
  const tenantId = nonEmpty(source['tenantId']);
  const agentId = nonEmpty(source['agentId']);
  const agenticUserId = nonEmpty(source['agenticUserId']);
  if (!tenantId) {
    throw sdkError(new TypeError('agent.tenantId is required for the agentic user token.'));
  }

  if (!agentId) {
    throw sdkError(new TypeError('agent.agentId is required for the agentic user token.'));
  }

  if (!agenticUserId) {
    throw sdkError(new TypeError('agent.agenticUserId is required for the agentic user token.'));
  }

  return { tenantId, agentId, agenticUserId };
}
