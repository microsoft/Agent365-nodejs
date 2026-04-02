// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { LIB_VERSION } from '../version';
// Note: one-way dependency (constants → contracts). Do not add reverse imports from contracts → constants.
import { A365_MESSAGE_SCHEMA_VERSION } from './contracts';

/**
 * OpenTelemetry constants for Agent 365
 */
export class OpenTelemetryConstants {
  // Span operation names
  public static readonly INVOKE_AGENT_OPERATION_NAME = 'invoke_agent';
  public static readonly EXECUTE_TOOL_OPERATION_NAME = 'execute_tool';
  public static readonly OUTPUT_MESSAGES_OPERATION_NAME = 'output_messages';
  public static readonly CHAT_OPERATION_NAME = 'chat';

  // OpenTelemetry semantic conventions
  public static readonly ERROR_TYPE_KEY = 'error.type';
  public static readonly ERROR_TYPE_CANCELLED = 'TaskCanceledException';
  public static readonly ERROR_MESSAGE_KEY = 'error.message';
  public static readonly AZ_NAMESPACE_KEY = 'az.namespace';
  public static readonly SERVER_ADDRESS_KEY = 'server.address';
  public static readonly SERVER_PORT_KEY = 'server.port';
  public static readonly AZURE_RP_NAMESPACE_VALUE = 'Microsoft.CognitiveServices';
  public static readonly SOURCE_NAME = 'Agent365Sdk';
  public static readonly ENABLE_OPENTELEMETRY_SWITCH = 'Azure.Experimental.EnableActivitySource';
  public static readonly TRACE_CONTENTS_SWITCH = 'Azure.Experimental.TraceGenAIMessageContent';
  public static readonly TRACE_CONTENTS_ENVIRONMENT_VARIABLE = 'AZURE_TRACING_GEN_AI_CONTENT_RECORDING_ENABLED';
  public static readonly ENABLE_OBSERVABILITY = 'ENABLE_OBSERVABILITY';
  public static readonly ENABLE_A365_OBSERVABILITY_EXPORTER = 'ENABLE_A365_OBSERVABILITY_EXPORTER';
  public static readonly ENABLE_A365_OBSERVABILITY = 'ENABLE_A365_OBSERVABILITY';
  public static readonly ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT = 'ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT';

  // GenAI semantic conventions
  public static readonly GEN_AI_CLIENT_OPERATION_DURATION_METRIC_NAME = 'gen_ai.client.operation.duration';
  public static readonly GEN_AI_CLIENT_TOKEN_USAGE_METRIC_NAME = 'gen_ai.client.token.usage';
  public static readonly GEN_AI_OPERATION_NAME_KEY = 'gen_ai.operation.name';
  public static readonly GEN_AI_REQUEST_MAX_TOKENS_KEY = 'gen_ai.request.max_tokens';
  public static readonly GEN_AI_REQUEST_MODEL_KEY = 'gen_ai.request.model';
  public static readonly GEN_AI_REQUEST_TEMPERATURE_KEY = 'gen_ai.request.temperature';
  public static readonly GEN_AI_REQUEST_TOP_P_KEY = 'gen_ai.request.top_p';
  public static readonly GEN_AI_RESPONSE_FINISH_REASONS_KEY = 'gen_ai.response.finish_reasons';
  public static readonly GEN_AI_RESPONSE_MODEL_KEY = 'gen_ai.response.model';
  public static readonly GEN_AI_AGENT_ID_KEY = 'gen_ai.agent.id';
  public static readonly GEN_AI_AGENT_NAME_KEY = 'gen_ai.agent.name';
  public static readonly GEN_AI_AGENT_DESCRIPTION_KEY = 'gen_ai.agent.description';
  public static readonly GEN_AI_AGENT_PLATFORM_ID_KEY = 'microsoft.a365.agent.platform.id';
  public static readonly GEN_AI_AGENT_THOUGHT_PROCESS_KEY = 'microsoft.a365.agent.thought.process';
  public static readonly GEN_AI_CONVERSATION_ID_KEY = 'gen_ai.conversation.id';
  public static readonly GEN_AI_CONVERSATION_ITEM_LINK_KEY = 'microsoft.conversation.item.link';
  public static readonly GEN_AI_TOKEN_TYPE_KEY = 'gen_ai.token.type';
  public static readonly GEN_AI_USAGE_INPUT_TOKENS_KEY = 'gen_ai.usage.input_tokens';
  public static readonly GEN_AI_USAGE_OUTPUT_TOKENS_KEY = 'gen_ai.usage.output_tokens';
  public static readonly GEN_AI_CHOICE = 'gen_ai.choice';
  public static readonly GEN_AI_PROVIDER_NAME_KEY = 'gen_ai.provider.name';

  public static readonly GEN_AI_SYSTEM_INSTRUCTIONS_KEY = 'gen_ai.system_instructions';
  public static readonly GEN_AI_INPUT_MESSAGES_KEY = 'gen_ai.input.messages';
  public static readonly GEN_AI_OUTPUT_MESSAGES_KEY = 'gen_ai.output.messages';
  public static readonly A365_MESSAGES_SCHEMA_VERSION_KEY = 'microsoft.a365.messages.schema_version';
  // Tool execution constants
  public static readonly GEN_AI_TOOL_CALL_ID_KEY = 'gen_ai.tool.call.id';
  public static readonly GEN_AI_TOOL_NAME_KEY = 'gen_ai.tool.name';
  public static readonly GEN_AI_TOOL_DESCRIPTION_KEY = 'gen_ai.tool.description';
  public static readonly GEN_AI_TOOL_ARGS_KEY = 'gen_ai.tool.call.arguments';
  public static readonly GEN_AI_TOOL_CALL_RESULT_KEY = 'gen_ai.tool.call.result';
  public static readonly GEN_AI_TOOL_TYPE_KEY = 'gen_ai.tool.type';

  // Human caller dimensions (OTel user.* namespace)
  public static readonly USER_ID_KEY = 'user.id';
  public static readonly USER_NAME_KEY = 'user.name';
  public static readonly USER_EMAIL_KEY = 'user.email';
  public static readonly GEN_AI_CALLER_CLIENT_IP_KEY = 'client.address';

  // Agent to Agent caller agent dimensions
  public static readonly GEN_AI_CALLER_AGENT_USER_ID_KEY = 'microsoft.a365.caller.agent.user.id';
  public static readonly GEN_AI_CALLER_AGENT_EMAIL_KEY = 'microsoft.a365.caller.agent.user.email';
  public static readonly GEN_AI_CALLER_AGENT_NAME_KEY = 'microsoft.a365.caller.agent.name';
  public static readonly GEN_AI_CALLER_AGENT_ID_KEY = 'microsoft.a365.caller.agent.id';
  public static readonly GEN_AI_CALLER_AGENT_APPLICATION_ID_KEY = 'microsoft.a365.caller.agent.blueprint.id';
  public static readonly GEN_AI_CALLER_AGENT_PLATFORM_ID_KEY = 'microsoft.a365.caller.agent.platform.id';
  // Agent-specific dimensions
  public static readonly AGENT_ID_KEY = 'gen_ai.agent.id';
  public static readonly GEN_AI_TASK_ID_KEY = 'gen_ai.task.id';
  public static readonly SESSION_ID_KEY = 'microsoft.session.id';
  public static readonly SESSION_DESCRIPTION_KEY = 'microsoft.session.description';
  public static readonly GEN_AI_ICON_URI_KEY = 'gen_ai.agent365.icon_uri';
  public static readonly TENANT_ID_KEY = 'microsoft.tenant.id';

  // Baggage keys
  public static readonly GEN_AI_AGENT_AUID_KEY = 'microsoft.agent.user.id';
  public static readonly GEN_AI_AGENT_EMAIL_KEY = 'microsoft.agent.user.email';
  public static readonly GEN_AI_AGENT_BLUEPRINT_ID_KEY = 'microsoft.a365.agent.blueprint.id';

  // Execution context dimensions
  public static readonly GEN_AI_EXECUTION_TYPE_KEY = 'gen_ai.execution.type';
  public static readonly GEN_AI_EXECUTION_PAYLOAD_KEY = 'gen_ai.execution.payload';

  // Channel dimensions
  public static readonly CHANNEL_NAME_KEY = 'microsoft.channel.name';
  public static readonly CHANNEL_LINK_KEY = 'microsoft.channel.link';

  // Custom parent id and parent name key
  public static readonly CUSTOM_PARENT_SPAN_ID_KEY = 'custom.parent.span.id';
  public static readonly CUSTOM_SPAN_NAME_KEY = 'custom.span.name';

  // Service attributes
  public static readonly SERVICE_NAME_KEY = 'service.name';

  // Telemetry SDK attributes
  public static readonly TELEMETRY_SDK_NAME_KEY = 'telemetry.sdk.name';
  public static readonly TELEMETRY_SDK_LANGUAGE_KEY = 'telemetry.sdk.language';
  public static readonly TELEMETRY_SDK_VERSION_KEY = 'telemetry.sdk.version';
  public static readonly TELEMETRY_SDK_NAME_VALUE = 'A365ObservabilitySDK';
  public static readonly TELEMETRY_SDK_LANGUAGE_VALUE = 'nodejs';
  public static readonly TELEMETRY_SDK_VERSION_VALUE = LIB_VERSION;

  /**
   * A365 message schema version. Sourced from contracts.ts to stay in sync.
   */
  public static readonly A365_MESSAGE_SCHEMA_VERSION = A365_MESSAGE_SCHEMA_VERSION;
}
