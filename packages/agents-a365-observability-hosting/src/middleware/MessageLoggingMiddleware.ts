// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TurnContext, Middleware, SendActivitiesHandler } from '@microsoft/agents-hosting';
import { ActivityTypes, ActivityEventNames } from '@microsoft/agents-activity';
import {
  InputScope,
  OutputScope,
  BaggageBuilder,
  AgentDetails,
  TenantDetails,
  CallerDetails,
  AgentRequest,
  ExecutionType,
  parseExecutionType,
  ParentSpanRef,
} from '@microsoft/agents-a365-observability';
import { ScopeUtils } from '../utils/ScopeUtils';
import {
  getExecutionTypePair,
  getCallerBaggagePairs,
  getTargetAgentBaggagePairs,
  getTenantIdPair,
  getSourceMetadataBaggagePairs,
  getConversationIdAndItemLinkPairs,
} from '../utils/TurnContextUtils';

/**
 * TurnState key for the parent span reference ({@link ParentSpanRef}).
 * Developers set this value in `turnState` to link InputScope/OutputScope
 */
export const A365_PARENT_SPAN_KEY = 'A365ParentSpanId';

/**
 * Configuration options for MessageLoggingMiddleware.
 *
 * **Privacy note:** When enabled, this middleware captures user input and bot output
 * message content verbatim as OpenTelemetry span attributes (`gen_ai.input.messages`
 * and `gen_ai.output.messages`). This data may contain PII or other sensitive
 * information and will be exported to the configured telemetry backend. Ensure your
 * telemetry pipeline complies with your organization's data handling policies.
 */
export interface MessageLoggingMiddlewareOptions {
  /**
   * Whether to create InputScope spans for user (input) messages.
   * When true, the raw `activity.text` content is recorded as a span attribute.
   * Defaults to true.
   */
  logUserMessages?: boolean;

  /**
   * Whether to create OutputScope spans for bot (output) messages.
   * When true, outgoing message text is recorded as a span attribute.
   * Defaults to true.
   */
  logBotMessages?: boolean;
}

/**
 * Middleware for tracing input and output messages as OpenTelemetry spans.
 *
 * Creates {@link InputScope} / {@link OutputScope} spans for incoming/outgoing messages.
 * If the developer sets a {@link ParentSpanRef} in `context.turnState` under
 * {@link A365_PARENT_SPAN_KEY}, spans are created as children of that parent.
 *
 * @example
 * ```typescript
 * const adapter = new CloudAdapter();
 * adapter.use(new MessageLoggingMiddleware());
 * ```
 */
export class MessageLoggingMiddleware implements Middleware {
  private readonly _logUserMessages: boolean;
  private readonly _logBotMessages: boolean;

  constructor(options?: MessageLoggingMiddlewareOptions) {
    this._logUserMessages = options?.logUserMessages ?? true;
    this._logBotMessages = options?.logBotMessages ?? true;
  }

  /**
   * Called each time the agent processes a turn.
   * Creates an InputScope span for incoming messages and hooks onSendActivities
   * to create OutputScope spans for outgoing messages. If a {@link ParentSpanRef}
   * is set in `turnState` under {@link A365_PARENT_SPAN_KEY}, spans are linked
   * to that parent.
   * @param context The context object for the turn.
   * @param next The next middleware or handler to call.
   */
  async onTurn(context: TurnContext, next: () => Promise<void>): Promise<void> {
    const isAsyncReply =
      context.activity?.type === ActivityTypes.Event &&
      context.activity?.name === ActivityEventNames.ContinueConversation;

    const agentDetails = ScopeUtils.deriveAgentDetails(context);
    const tenantDetails = ScopeUtils.deriveTenantDetails(context);

    // If we can't derive required details, pass through without tracing
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

    // Register send activities handler for output tracing
    if (this._logBotMessages) {
      context.onSendActivities(
        this._createSendHandler(context, agentDetails, tenantDetails, callerDetails, conversationId, sourceMetadata, executionType)
      );
    }

    // For async replies, skip baggage and input tracing — just run next()
    if (isAsyncReply) {
      await next();
      return;
    }

    // Build baggage context from turn context for propagation
    const baggageScope = new BaggageBuilder()
      .setPairs(getCallerBaggagePairs(context))
      .setPairs(getTargetAgentBaggagePairs(context))
      .setPairs(getTenantIdPair(context))
      .setPairs(getSourceMetadataBaggagePairs(context))
      .setPairs(getConversationIdAndItemLinkPairs(context))
      .setPairs(executionTypePair)
      .build();

    await baggageScope.run(async () => {
      const shouldLogInput = this._logUserMessages && !!context.activity?.text;

      // Record start time before next() so the InputScope span reflects when the input arrived
      const inputStartTime = shouldLogInput ? Date.now() : undefined;
      let turnError: unknown;

      try {
        await next();
      } catch (error) {
        turnError = error;
      }

      // Create InputScope after next() so we can read the parent span ref from turnState
      if (shouldLogInput) {
        const parentSpanRef: ParentSpanRef | undefined = context.turnState.get(A365_PARENT_SPAN_KEY);
        const request = this._buildAgentRequest(context, executionType, sourceMetadata);
        const inputScope = InputScope.start(
          request, agentDetails, tenantDetails, callerDetails, conversationId,
          parentSpanRef, inputStartTime
        );
        if (turnError) {
          inputScope.recordError(
            turnError instanceof Error ? turnError : new Error(typeof turnError === 'string' ? turnError : JSON.stringify(turnError))
          );
        }
        inputScope.dispose();
      }
    });
  }

  /**
   * Builds an AgentRequest from the TurnContext for the InputScope.
   */
  private _buildAgentRequest(
    context: TurnContext,
    executionType?: ExecutionType,
    sourceMetadata?: { name?: string; description?: string }
  ): AgentRequest {
    return {
      content: context.activity?.text,
      executionType,
      sourceMetadata: (sourceMetadata?.name || sourceMetadata?.description)
        ? { name: sourceMetadata?.name, description: sourceMetadata?.description }
        : undefined,
    };
  }

  /**
   * Creates a handler for onSendActivities that wraps outgoing messages in OutputScope spans.
   * Reads {@link A365_PARENT_SPAN_KEY} from turnState lazily at execution time so the
   * agent handler has a chance to set it during `next()`.
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
      // Collect text from message-type activities
      const messages = activities
        .filter((a) => a.type === 'message' && a.text)
        .map((a) => a.text!);

      if (messages.length > 0) {
        // Read parent span ref lazily — the agent handler sets it during next()
        const parentSpanRef: ParentSpanRef | undefined = turnContext.turnState.get(A365_PARENT_SPAN_KEY);
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
        } finally {
          outputScope.dispose();
        }
      }

      return await sendNext();
    };
  }
}
