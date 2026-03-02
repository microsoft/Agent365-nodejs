// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TurnContext, Middleware } from '@microsoft/agents-hosting';
import { ActivityTypes, ActivityEventNames } from '@microsoft/agents-activity';
import { BaggageBuilder } from '@microsoft/agents-a365-observability';
import {
  getExecutionTypePair,
  getCallerBaggagePairs,
  getTargetAgentBaggagePairs,
  getTenantIdPair,
  getSourceMetadataBaggagePairs,
  getConversationIdAndItemLinkPairs,
} from '../utils/TurnContextUtils';

/**
 * Middleware that propagates OpenTelemetry baggage context derived from TurnContext.
 * Async replies (ContinueConversation) are passed through without baggage setup.
 */
export class BaggageMiddleware implements Middleware {

  async onTurn(context: TurnContext, next: () => Promise<void>): Promise<void> {
    const isAsyncReply =
      context.activity?.type === ActivityTypes.Event &&
      context.activity?.name === ActivityEventNames.ContinueConversation;

    if (isAsyncReply) {
      await next();
      return;
    }

    const baggageScope = new BaggageBuilder()
      .setPairs(getCallerBaggagePairs(context))
      .setPairs(getTargetAgentBaggagePairs(context))
      .setPairs(getTenantIdPair(context))
      .setPairs(getSourceMetadataBaggagePairs(context))
      .setPairs(getConversationIdAndItemLinkPairs(context))
      .setPairs(getExecutionTypePair(context))
      .build();

    await baggageScope.run(async () => {
      await next();
    });
  }
}
