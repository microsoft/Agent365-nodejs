// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { TurnContext } from '@microsoft/agents-hosting';
import {
  getCallerBaggagePairs,
  getExecutionTypePair,
  getTargetAgentBaggagePairs,
  getTenantIdPair,
  getSourceMetadataBaggagePairs,
  getConversationIdAndItemLinkPairs
} from './TurnContextUtils';
import { BaggageBuilder } from '@microsoft/agents-a365-observability';



/**
 * Utilities to populate BaggageBuilder from a TurnContext.
 */
export class BaggageBuilderUtils {
  /**
   * Populate all supported baggage pairs from the provided TurnContext.
   * @param builder The BaggageBuilder instance to populate.
   * @param turnContext The TurnContext containing activity information.
   * @returns The updated BaggageBuilder instance.
   */
  static fromTurnContext(builder: BaggageBuilder, turnContext: TurnContext): BaggageBuilder {
    if (!turnContext) {
      throw new Error('turnContext is required');
    }
    this.setCallerBaggage(builder, turnContext);
    this.setExecutionTypeBaggage(builder, turnContext);
    this.setTargetAgentBaggage(builder, turnContext);
    this.setTenantIdBaggage(builder, turnContext);
    this.setSourceMetadataBaggage(builder, turnContext);
    this.setConversationIdBaggage(builder, turnContext);
    return builder;
  }

  /**
   * Sets the caller-related baggage values from the TurnContext.
   * @param builder The BaggageBuilder instance.
   * @param turnContext The TurnContext containing activity information.
   * @returns The updated BaggageBuilder instance.
   */
  static setCallerBaggage(builder: BaggageBuilder, turnContext: TurnContext): BaggageBuilder {
    builder.setPairs(getCallerBaggagePairs(turnContext));
    return builder;
  }


  /**
   * Sets the execution type baggage value based on caller and recipient agentic status.
   * @param builder The BaggageBuilder instance.
   * @param turnContext The TurnContext containing activity information.
   * @returns The updated BaggageBuilder instance.
   */
  static setExecutionTypeBaggage(builder: BaggageBuilder, turnContext: TurnContext): BaggageBuilder {
    builder.setPairs(getExecutionTypePair(turnContext));
    return builder;
  }


  /**
   * Sets the target agent-related baggage values from the TurnContext.
   * @param builder The BaggageBuilder instance.
   * @param turnContext The TurnContext containing activity information.
   * @returns The updated BaggageBuilder instance.
   */
  static setTargetAgentBaggage(builder: BaggageBuilder, turnContext: TurnContext): BaggageBuilder {
    builder.setPairs(getTargetAgentBaggagePairs(turnContext));
    return builder;
  }


  /**
   * Sets the tenant ID baggage value, extracting from ChannelData if necessary.
   * @param builder The BaggageBuilder instance.
   * @param turnContext The TurnContext containing activity information.
   * @returns The updated BaggageBuilder instance.
   */
  static setTenantIdBaggage(builder: BaggageBuilder, turnContext: TurnContext): BaggageBuilder {
    builder.setPairs(getTenantIdPair(turnContext));
    return builder;
  }


  /**
   * Sets the source metadata baggage values from the TurnContext.
   * @param builder The BaggageBuilder instance.
   * @param turnContext The TurnContext containing activity information.
   * @returns The updated BaggageBuilder instance.
   */
  static setSourceMetadataBaggage(builder: BaggageBuilder, turnContext: TurnContext): BaggageBuilder {
    builder.setPairs(getSourceMetadataBaggagePairs(turnContext));
    return builder;
  }


  /**
   * Sets the conversation ID and item link baggage values from the TurnContext.
   * @param builder The BaggageBuilder instance.
   * @param turnContext The TurnContext containing activity information.
   * @returns The updated BaggageBuilder instance.
   */
  static setConversationIdBaggage(builder: BaggageBuilder, turnContext: TurnContext): BaggageBuilder {
    builder.setPairs(getConversationIdAndItemLinkPairs(turnContext));
    return builder;
  }
}
