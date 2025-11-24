// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { TurnContext } from '@microsoft/agents-hosting';
import { InvokeAgentScope, OpenTelemetryConstants } from '@microsoft/agents-a365-observability';
import {
	getCallerBaggagePairs,
	getExecutionTypePair,
	getTargetAgentBaggagePairs,
	getTenantIdPair,
	getSourceMetadataBaggagePairs,
	getConversationIdAndItemLinkPairs
} from './TurnContextUtils';


/**
 * Utilities to populate InvokeAgentScope tags from a TurnContext.
 */
export class InvokeAgentScopeUtils {
	/**
	 * Populate all supported InvokeAgentScope tags from the provided TurnContext.
	 * @param scope The InvokeAgentScope instance to populate.
	 * @param turnContext The TurnContext containing activity information.
	 * @returns The updated InvokeAgentScope instance.
	 */
	static populateFromTurnContext(scope: InvokeAgentScope, turnContext: TurnContext): any {
		if (!turnContext) {
			throw new Error('turnContext is required');
		}
		this.setCallerTags(scope, turnContext);
		this.setExecutionTypeTags(scope, turnContext);
		this.setTargetAgentTags(scope, turnContext);
		this.setTenantIdTags(scope, turnContext);
		this.setSourceMetadataTags(scope, turnContext);
		this.setConversationIdTags(scope, turnContext);
		return scope;
	}

	/**
	 * Sets the caller-related attribute values from the TurnContext.
	 * @param scope The InvokeAgentScope instance.
	 * @param turnContext The TurnContext containing activity information.
	 * @returns The updated InvokeAgentScope instance.
	 */
	static setCallerTags(scope: InvokeAgentScope, turnContext: TurnContext): any {
		scope.recordAttributes(getCallerBaggagePairs(turnContext));
		return scope;
	}

	/**
	 * Sets the execution type tag based on caller and recipient agentic status.
	 * @param scope The InvokeAgentScope instance.
	 * @param turnContext The TurnContext containing activity information.
	 * @returns The updated InvokeAgentScope instance.
	 */
	static setExecutionTypeTags(scope: InvokeAgentScope, turnContext: TurnContext): any {
		scope.recordAttributes(getExecutionTypePair(turnContext));
		return scope;
	}

	/**
	 * Sets the target agent-related tags from the TurnContext.
	 * @param scope The InvokeAgentScope instance.
	 * @param turnContext The TurnContext containing activity information.
	 * @returns The updated InvokeAgentScope instance.
	 */
	static setTargetAgentTags(scope: InvokeAgentScope, turnContext: TurnContext): any {
		scope.recordAttributes(getTargetAgentBaggagePairs(turnContext));
		return scope;
	}

	/**
	 * Sets the tenant ID tag, extracting from ChannelData if necessary.
	 * @param scope The InvokeAgentScope instance.
	 * @param turnContext The TurnContext containing activity information.
	 * @returns The updated InvokeAgentScope instance.
	 */
	static setTenantIdTags(scope: InvokeAgentScope, turnContext: TurnContext): any {
		scope.recordAttributes(getTenantIdPair(turnContext));
		return scope;
	}

	/**
	 * Sets the source metadata tags from the TurnContext.
	 * @param scope The InvokeAgentScope instance.
	 * @param turnContext The TurnContext containing activity information.
	 * @returns The updated InvokeAgentScope instance.
	 */
	static setSourceMetadataTags(scope: InvokeAgentScope, turnContext: TurnContext): any {
		scope.recordAttributes(getSourceMetadataBaggagePairs(turnContext));
		return scope;
	}

	/**
	 * Sets the conversation ID and item link tags from the TurnContext.
	 * @param scope The InvokeAgentScope instance.
	 * @param turnContext The TurnContext containing activity information.
	 * @returns The updated InvokeAgentScope instance.
	 */
	static setConversationIdTags(scope: any, turnContext: TurnContext): any {
		scope.recordAttributes(getConversationIdAndItemLinkPairs(turnContext));
		return scope;
	}

	/**
	 * Sets the input message tag from the TurnContext.
	 * @param scope The InvokeAgentScope instance.
	 * @param turnContext The TurnContext containing activity information.
	 * @returns The updated InvokeAgentScope instance.
	 */
	static setInputMessageTags(scope: any, turnContext: TurnContext): any {
		scope.setTagMaybe(OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY, turnContext?.activity?.text);
		return scope;
	}
}
