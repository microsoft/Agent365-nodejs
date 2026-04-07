// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { OpenTelemetryConstants as consts } from '../constants';

/**
 * Generic / common tracing attributes applied to all spans
 */
export const GENERIC_ATTRIBUTES: readonly string[] = [
  consts.TENANT_ID_KEY,
  consts.CUSTOM_PARENT_SPAN_ID_KEY,
  consts.CUSTOM_SPAN_NAME_KEY,
  consts.SESSION_ID_KEY,
  consts.GEN_AI_CONVERSATION_ID_KEY,
  consts.GEN_AI_CONVERSATION_ITEM_LINK_KEY,
  consts.GEN_AI_OPERATION_NAME_KEY,
  consts.GEN_AI_AGENT_ID_KEY,
  consts.GEN_AI_AGENT_NAME_KEY,
  consts.GEN_AI_AGENT_DESCRIPTION_KEY,
  consts.SESSION_DESCRIPTION_KEY,
  consts.GEN_AI_AGENT_EMAIL_KEY,
  consts.GEN_AI_AGENT_AUID_KEY,
  consts.GEN_AI_AGENT_PLATFORM_ID_KEY,
  consts.GEN_AI_AGENT_BLUEPRINT_ID_KEY,
  consts.GEN_AI_AGENT_VERSION_KEY,
  consts.SERVICE_NAME_KEY,
  // Caller / Invoker attributes
  consts.USER_ID_KEY,
  consts.USER_NAME_KEY,
  consts.USER_EMAIL_KEY,
  consts.GEN_AI_CALLER_CLIENT_IP_KEY,
  // Channel attributes
  consts.CHANNEL_NAME_KEY,
  consts.CHANNEL_LINK_KEY,
];

/**
 * Invoke Agent-specific attributes
 */
export const INVOKE_AGENT_ATTRIBUTES: readonly string[] = [
  // Caller Agent (A2A) attributes
  consts.GEN_AI_CALLER_AGENT_ID_KEY,
  consts.GEN_AI_CALLER_AGENT_NAME_KEY,
  consts.GEN_AI_CALLER_AGENT_USER_ID_KEY,
  consts.GEN_AI_CALLER_AGENT_EMAIL_KEY,
  consts.GEN_AI_CALLER_AGENT_APPLICATION_ID_KEY,
  consts.GEN_AI_CALLER_AGENT_PLATFORM_ID_KEY,
  consts.GEN_AI_CALLER_AGENT_VERSION_KEY,
];
