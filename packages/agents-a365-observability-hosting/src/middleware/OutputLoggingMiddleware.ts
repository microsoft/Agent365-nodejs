// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TurnContext, Middleware, SendActivitiesHandler } from '@microsoft/agents-hosting';
import {
  OutputScope,
  AgentDetails,
  TenantDetails,
  CallerDetails,
  ExecutionType,
  parseExecutionType,
  ParentSpanRef,
  logger,
} from '@microsoft/agents-a365-observability';
import { ScopeUtils } from '../utils/ScopeUtils';
import { getExecutionTypePair } from '../utils/TurnContextUtils';

/**
 * TurnState key for the parent span reference.
 * Set this in `turnState` to link OutputScope spans as children of an InvokeAgentScope.
 */
export const A365_PARENT_SPAN_KEY = 'A365ParentSpanId';

/**
 * Middleware that creates {@link OutputScope} spans for outgoing messages.
 * Links to a parent span when {@link A365_PARENT_SPAN_KEY} is set in turnState.
 *
 * **Privacy note:** Outgoing message content is captured verbatim
 * as span attributes and exported to the configured telemetry backend.
 */
export class OutputLoggingMiddleware implements Middleware {

  async onTurn(context: TurnContext, next: () => Promise<void>): Promise<void> {
    const agentDetails = ScopeUtils.deriveAgentDetails(context);
    const tenantDetails = ScopeUtils.deriveTenantDetails(context);

    if (!agentDetails || !tenantDetails) {
      await next();
      return;
    }

    const callerDetails = ScopeUtils.deriveCallerDetails(context);
    const conversationId = ScopeUtils.deriveConversationId(context);
    const sourceMetadata = ScopeUtils.deriveSourceMetadataObject(context);
    const executionTypePair = getExecutionTypePair(context);
    const executionType = executionTypePair.length > 0
      ? parseExecutionType(executionTypePair[0][1])
      : undefined;

    context.onSendActivities(
      this._createSendHandler(context, agentDetails, tenantDetails, callerDetails, conversationId, sourceMetadata, executionType)
    );

    await next();
  }

  /**
   * Creates a send handler that wraps outgoing messages in OutputScope spans.
   * Reads parent span ref lazily so the agent handler can set it during `next()`.
   */
  private _createSendHandler(
    turnContext: TurnContext,
    agentDetails: AgentDetails,
    tenantDetails: TenantDetails,
    callerDetails?: CallerDetails,
    conversationId?: string,
    sourceMetadata?: { name?: string; description?: string },
    executionType?: ExecutionType,
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

      const outputScope = OutputScope.start(
        { messages },
        agentDetails,
        tenantDetails,
        callerDetails,
        conversationId,
        sourceMetadata,
        executionType,
        parentSpanRef,
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
