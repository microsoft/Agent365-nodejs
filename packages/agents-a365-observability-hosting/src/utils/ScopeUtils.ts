// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { TurnContext } from '@microsoft/agents-hosting';
import {
  OpenTelemetryScope,
  InvokeAgentScope,
  InferenceScope,
  ExecuteToolScope
} from '@microsoft/agents-a365-observability';
import { OpenTelemetryConstants } from '@microsoft/agents-a365-observability';
import {
  getTenantIdPair,
  getSourceMetadataBaggagePairs,
  getConversationIdAndItemLinkPairs,
  getCallerBaggagePairs,
  getExecutionTypePair,
  getTargetAgentBaggagePairs
} from './TurnContextUtils';

/**
 * Unified utilities to populate scope tags from a TurnContext.
 * Provides common tag population and scope-specific helpers.
 */
export class ScopeUtils {
  /** Populate common tags on any OpenTelemetryScope: tenant.id, source metadata, conversation.id */
  private static populateCommon(scope: OpenTelemetryScope, turnContext: TurnContext): void {
    if (!turnContext) throw new Error('turnContext is required');
    this.setTenantIdTags(scope, turnContext);
    this.setTargetAgentTags(scope, turnContext);
    this.setSourceMetadataTags(scope, turnContext);
    this.setConversationIdTag(scope, turnContext);
  }

  // ----------------------
  // InvokeAgent-specific setters
  // ----------------------
  /**
   * Sets the caller-related attribute values from the TurnContext.
   */
  static setCallerTags(scope: InvokeAgentScope, turnContext: TurnContext): InvokeAgentScope {
    scope.recordAttributes(getCallerBaggagePairs(turnContext));
    return scope;
  }

  /**
   * Sets the execution type tag based on caller and recipient agentic status.
   */
  static setExecutionTypeTags(scope: InvokeAgentScope, turnContext: TurnContext): InvokeAgentScope {
    scope.recordAttributes(getExecutionTypePair(turnContext));
    return scope;
  }

  /**
   * Sets the input message tag from the TurnContext.
   */
  static setInputMessageTags(scope: InvokeAgentScope | InferenceScope, turnContext: TurnContext): InvokeAgentScope | InferenceScope {
    if (turnContext?.activity?.text) {
      scope.recordInputMessages([turnContext.activity.text]);
    }
    return scope;
  }

  // ----------------------
  // Common setters
  // ----------------------
  /**
   * Sets the tenant ID tag (tenant.id) from TurnContext.
   */
  static setTenantIdTags(scope: OpenTelemetryScope, turnContext: TurnContext): OpenTelemetryScope {
    scope.recordAttributes(getTenantIdPair(turnContext));
    return scope;
  }

  /**
   * Sets the target agent-related tags from the TurnContext.
   */
  static setTargetAgentTags(scope: OpenTelemetryScope, turnContext: TurnContext): OpenTelemetryScope {
    scope.recordAttributes(getTargetAgentBaggagePairs(turnContext));
    return scope;
  }

  /**
   * Sets source metadata tags (channel name/description) from TurnContext.
   */
  static setSourceMetadataTags(scope: OpenTelemetryScope, turnContext: TurnContext): OpenTelemetryScope {
    scope.recordAttributes(getSourceMetadataBaggagePairs(turnContext));
    return scope;
  }

  /**
   * Sets only the conversation id tag from TurnContext (common subset).
   */
  static setConversationIdTag(scope: OpenTelemetryScope, turnContext: TurnContext): OpenTelemetryScope {
    const pairs = getConversationIdAndItemLinkPairs(turnContext).filter(([key]) => key === OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY);
    scope.recordAttributes(pairs);
    return scope;
  }

  // Overloads provide precise return type based on scope subtype
  static populateFromTurnContext(scope: InferenceScope, turnContext: TurnContext): InferenceScope;
  static populateFromTurnContext(scope: InvokeAgentScope, turnContext: TurnContext): InvokeAgentScope;
  static populateFromTurnContext(scope: ExecuteToolScope, turnContext: TurnContext): ExecuteToolScope;
  static populateFromTurnContext<T extends OpenTelemetryScope>(scope: T, turnContext: TurnContext): T;

  static populateFromTurnContext(scope: OpenTelemetryScope, turnContext: TurnContext): OpenTelemetryScope {
    this.populateCommon(scope, turnContext);

    if (scope instanceof InferenceScope) {
      this.setInputMessageTags(scope, turnContext);
      return scope;
    }

    if (scope instanceof InvokeAgentScope) {
      this.setCallerTags(scope, turnContext);
      this.setExecutionTypeTags(scope, turnContext);
      this.setInputMessageTags(scope, turnContext);
      return scope;
    }

    // ExecuteToolScope: only common tags
    return scope;
  }
}
