// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TurnContext, Middleware, SendActivitiesHandler } from '@microsoft/agents-hosting';
import {
  OutputScope,
  AgentDetails,
  UserDetails,
  ParentSpanRef,
  Request,
  SpanDetails,
  logger,
  isPerRequestExportEnabled,
} from '@microsoft/agents-a365-observability';
import { ScopeUtils } from '../utils/ScopeUtils';
import { AgenticTokenCacheInstance } from '../caching/AgenticTokenCache';

/**
 * TurnState key for the parent span reference.
 * Set this in `turnState` to link OutputScope spans as children of an InvokeAgentScope.
 */
export const A365_PARENT_SPAN_KEY = 'A365ParentSpanId';

/**
 * TurnState key for the auth token.
 * Set this in `turnState` so middleware can resolve the agent blueprint ID
 * from token claims (used for embodied/agentic requests).
 */
export const A365_AUTH_TOKEN_KEY = 'A365AuthToken';

/**
 * Middleware that creates {@link OutputScope} spans for outgoing messages.
 * Links to a parent span when {@link A365_PARENT_SPAN_KEY} is set in turnState.
 *
 * **Privacy note:** Outgoing message content is captured verbatim
 * as span attributes and exported to the configured telemetry backend.
 */
export class OutputLoggingMiddleware implements Middleware {

  async onTurn(context: TurnContext, next: () => Promise<void>): Promise<void> {
    const authToken = this.resolveAuthToken(context);
    const agentDetails = ScopeUtils.deriveAgentDetails(context, authToken);

    if (!agentDetails) {
      await next();
      return;
    }

    const userDetails = ScopeUtils.deriveCallerDetails(context);
    const conversationId = ScopeUtils.deriveConversationId(context);
    const channel = ScopeUtils.deriveChannelObject(context);

    const request: Request = {
      conversationId,
      channel,
    };

    context.onSendActivities(
      this._createSendHandler(context, agentDetails, userDetails, request)
    );

    await next();
  }

  /**
   * Resolve the auth token for agent identity resolution.
   * When per-request export is enabled, reads from turnState.
   * Otherwise, reads from the cached observability token.
   */
  private resolveAuthToken(context: TurnContext): string {
    if (isPerRequestExportEnabled()) {
      return context.turnState.get(A365_AUTH_TOKEN_KEY) as string ?? '';
    }
    const agentId = context.activity?.getAgenticInstanceId?.() ?? '';
    const tenantId = context.activity?.getAgenticTenantId?.() ?? '';
    if (agentId && tenantId) {
      return AgenticTokenCacheInstance.getObservabilityToken(agentId, tenantId) ?? '';
    }
    return '';
  }

  /**
   * Creates a send handler that wraps outgoing messages in OutputScope spans.
   * Reads parent span ref lazily so the agent handler can set it during `next()`.
   */
  private _createSendHandler(
    turnContext: TurnContext,
    agentDetails: AgentDetails,
    userDetails?: UserDetails,
    request?: Request,
  ): SendActivitiesHandler {
    return async (_ctx, activities, sendNext) => {
      const messages = activities
        .filter((a) => a.type === 'message' && a.text)
        .map((a) => a.text!);

      if (messages.length === 0) {
        return await sendNext();
      }

      const parentSpanRef: ParentSpanRef | undefined = turnContext.turnState.get(A365_PARENT_SPAN_KEY);
      if (!parentSpanRef) {
        logger.warn(
          `[OutputLoggingMiddleware] No parent span ref in turnState under '${A365_PARENT_SPAN_KEY}'. OutputScope will not be linked to a parent.`
        );
      }

      const spanDetails: SpanDetails | undefined = parentSpanRef
        ? { parentContext: parentSpanRef }
        : undefined;

      const outputScope = OutputScope.start(
        request ?? {},
        { messages },
        agentDetails,
        userDetails,
        spanDetails,
      );
      try {
        return await sendNext();
      } catch (error) {
        outputScope.recordError(
          error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error))
        );
        throw error;
      } finally {
        outputScope.dispose();
      }
    };
  }
}
