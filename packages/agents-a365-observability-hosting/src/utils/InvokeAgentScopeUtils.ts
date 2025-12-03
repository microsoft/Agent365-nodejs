// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { TurnContext } from '@microsoft/agents-hosting';
import { InvokeAgentScope } from '@microsoft/agents-a365-observability';
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
	static populateFromTurnContext(scope: InvokeAgentScope, turnContext: TurnContext): InvokeAgentScope {
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
	static setCallerTags(scope: InvokeAgentScope, turnContext: TurnContext): InvokeAgentScope {
		scope.recordAttributes(getCallerBaggagePairs(turnContext));
		return scope;
	}

	/**
	 * Sets the execution type tag based on caller and recipient agentic status.
	 * @param scope The InvokeAgentScope instance.
	 * @param turnContext The TurnContext containing activity information.
	 * @returns The updated InvokeAgentScope instance.
	 */
	static setExecutionTypeTags(scope: InvokeAgentScope, turnContext: TurnContext): InvokeAgentScope {
		scope.recordAttributes(getExecutionTypePair(turnContext));
		return scope;
	}

	/**
	 * Sets the target agent-related tags from the TurnContext.
	 * @param scope The InvokeAgentScope instance.
	 * @param turnContext The TurnContext containing activity information.
	 * @returns The updated InvokeAgentScope instance.
	 */
	static setTargetAgentTags(scope: InvokeAgentScope, turnContext: TurnContext): InvokeAgentScope {
		scope.recordAttributes(getTargetAgentBaggagePairs(turnContext));
		return scope;
	}

	/**
	 * Sets the tenant ID tag, extracting from ChannelData if necessary.
	 * @param scope The InvokeAgentScope instance.
	 * @param turnContext The TurnContext containing activity information.
	 * @returns The updated InvokeAgentScope instance.
	 */
	static setTenantIdTags(scope: InvokeAgentScope, turnContext: TurnContext): InvokeAgentScope {
		scope.recordAttributes(getTenantIdPair(turnContext));
		return scope;
	}

	/**
	 * Sets the source metadata tags from the TurnContext.
	 * @param scope The InvokeAgentScope instance.
	 * @param turnContext The TurnContext containing activity information.
	 * @returns The updated InvokeAgentScope instance.
	 */
	static setSourceMetadataTags(scope: InvokeAgentScope, turnContext: TurnContext): InvokeAgentScope {
		scope.recordAttributes(getSourceMetadataBaggagePairs(turnContext));
		return scope;
	}

	/**
	 * Sets the conversation ID and item link tags from the TurnContext.
	 * @param scope The InvokeAgentScope instance.
	 * @param turnContext The TurnContext containing activity information.
	 * @returns The updated InvokeAgentScope instance.
	 */
	static setConversationIdTags(scope: InvokeAgentScope, turnContext: TurnContext): InvokeAgentScope {
		scope.recordAttributes(getConversationIdAndItemLinkPairs(turnContext));
		return scope;
	}

	/**
	 * Sets the input message tag from the TurnContext.
	 * @param scope The InvokeAgentScope instance.
	 * @param turnContext The TurnContext containing activity information.
	 * @returns The updated InvokeAgentScope instance.
	 */
	static setInputMessageTags(scope: InvokeAgentScope, turnContext: TurnContext): InvokeAgentScope {
		if(turnContext?.activity?.text) {
		scope.recordInputMessages([turnContext?.activity?.text]);
		}
		return scope;
	}
}
