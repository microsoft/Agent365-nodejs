// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

/**
 * OpenTelemetry constants for Agent365
 */
export class OpenTelemetryConstants {
  // Span operation names
  public static readonly INVOKE_AGENT_OPERATION_NAME = 'invoke_agent';
  public static readonly EXECUTE_TOOL_OPERATION_NAME = 'execute_tool';

  // OpenTelemetry semantic conventions
  public static readonly ERROR_TYPE_KEY = 'error.type';
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
  public static readonly ENABLE_KAIRO_EXPORTER = 'ENABLE_KAIRO_EXPORTER';
  public static readonly ENABLE_A365_OBSERVABILITY_EXPORTER = 'ENABLE_A365_OBSERVABILITY_EXPORTER';
  public static readonly ENABLE_A365_OBSERVABILITY = 'ENABLE_A365_OBSERVABILITY';

  // GenAI semantic conventions
  public static readonly GEN_AI_CLIENT_OPERATION_DURATION_METRIC_NAME = 'gen_ai.client.operation.duration';
  public static readonly GEN_AI_CLIENT_TOKEN_USAGE_METRIC_NAME = 'gen_ai.client.token.usage';
  public static readonly GEN_AI_OPERATION_NAME_KEY = 'gen_ai.operation.name';
  public static readonly GEN_AI_REQUEST_MAX_TOKENS_KEY = 'gen_ai.request.max_tokens';
  public static readonly GEN_AI_REQUEST_MODEL_KEY = 'gen_ai.request.model';
  public static readonly GEN_AI_REQUEST_CONTENT_KEY = 'gen_ai.request.content';
  public static readonly GEN_AI_REQUEST_TEMPERATURE_KEY = 'gen_ai.request.temperature';
  public static readonly GEN_AI_REQUEST_TOP_P_KEY = 'gen_ai.request.top_p';
  public static readonly GEN_AI_RESPONSE_ID_KEY = 'gen_ai.response.id';
  public static readonly GEN_AI_RESPONSE_FINISH_REASONS_KEY = 'gen_ai.response.finish_reasons';
  public static readonly GEN_AI_RESPONSE_MODEL_KEY = 'gen_ai.response.model';
  public static readonly GEN_AI_RESPONSE_CONTENT_KEY = 'gen_ai.response.content';
  public static readonly GEN_AI_SYSTEM_KEY = 'gen_ai.system';
  public static readonly GEN_AI_SYSTEM_VALUE = 'az.ai.agent365';

  public static readonly GEN_AI_AGENT_ID_KEY = 'gen_ai.agent.id';
  public static readonly GEN_AI_AGENT_NAME_KEY = 'gen_ai.agent.name';
  public static readonly GEN_AI_AGENT_DESCRIPTION_KEY = 'gen_ai.agent.description';
  public static readonly GEN_AI_CONVERSATION_ID_KEY = 'gen_ai.conversation.id';
  public static readonly GEN_AI_CONVERSATION_ITEM_LINK_KEY = 'gen_ai.conversation.item.link';
  public static readonly GEN_AI_TOKEN_TYPE_KEY = 'gen_ai.token.type';
  public static readonly GEN_AI_USAGE_INPUT_TOKENS_KEY = 'gen_ai.usage.input_tokens';
  public static readonly GEN_AI_USAGE_OUTPUT_TOKENS_KEY = 'gen_ai.usage.output_tokens';
  public static readonly GEN_AI_CHOICE = 'gen_ai.choice';
  public static readonly GEN_AI_PROVIDER_NAME_KEY = 'gen_ai.provider.name';

  public static readonly GEN_AI_SYSTEM_INSTRUCTIONS_KEY = 'gen_ai.system_instructions';
  public static readonly GEN_AI_INPUT_MESSAGES_KEY = 'gen_ai.input.messages';
  public static readonly GEN_AI_OUTPUT_MESSAGES_KEY = 'gen_ai.output.messages';
  public static readonly GEN_AI_EVENT_CONTENT = 'gen_ai.event.content';

  // Tool execution constants
  public static readonly GEN_AI_TOOL_CALL_ID_KEY = 'gen_ai.tool.call.id';
  public static readonly GEN_AI_TOOL_NAME_KEY = 'gen_ai.tool.name';
  public static readonly GEN_AI_TOOL_DESCRIPTION_KEY = 'gen_ai.tool.description';
  public static readonly GEN_AI_TOOL_ARGS_KEY = 'gen_ai.tool.arguments';
  public static readonly GEN_AI_TOOL_CALL_RESULT_KEY = 'gen_ai.event.content'; // GEN_AI_EVENT_CONTENT
  public static readonly GEN_AI_TOOL_TYPE_KEY = 'gen_ai.tool.type';

  // Agent user (user tied to agent instance during creation) or caller dimensions
  public static readonly GEN_AI_AGENT_USER_ID_KEY = 'gen_ai.agent.userid';
  public static readonly GEN_AI_CALLER_USER_ID_KEY = 'gen_ai.caller.userid';
  public static readonly GEN_AI_CALLER_TENANT_ID_KEY = 'gen_ai.caller.tenantid';
  public static readonly GEN_AI_CALLER_ID_KEY = 'gen_ai.caller.id';
  public static readonly GEN_AI_CALLER_NAME_KEY = 'gen_ai.caller.name';
  public static readonly GEN_AI_CALLER_UPN_KEY = 'gen_ai.caller.upn';

  // Agent to Agent caller agent dimensions
  public static readonly GEN_AI_CALLER_AGENT_USER_ID_KEY = 'gen_ai.caller.agent.userid';
  public static readonly GEN_AI_CALLER_AGENT_UPN_KEY = 'gen_ai.caller.agent.upn';
  public static readonly GEN_AI_CALLER_AGENT_TENANT_ID_KEY = 'gen_ai.caller.agent.tenantid';
  public static readonly GEN_AI_CALLER_AGENT_NAME_KEY = 'gen_ai.caller.agent.name';
  public static readonly GEN_AI_CALLER_AGENT_ID_KEY = 'gen_ai.caller.agent.id';
  public static readonly GEN_AI_CALLER_AGENT_APPLICATION_ID_KEY = 'gen_ai.caller.agent.applicationid';

  // Agent-specific dimensions
  public static readonly AGENT_ID_KEY = 'gen_ai.agent.id';
  public static readonly GEN_AI_TASK_ID_KEY = 'gen_ai.task.id';
  public static readonly SESSION_ID_KEY = 'session.id';
  public static readonly GEN_AI_ICON_URI_KEY = 'gen_ai.agent365.icon_uri';
  public static readonly TENANT_ID_KEY = 'tenant.id';

  // Baggage keys
  public static readonly OPERATION_SOURCE_KEY = 'operation.source';
  public static readonly GEN_AI_AGENT_AUID_KEY = 'gen_ai.agent.user.id';
  public static readonly GEN_AI_AGENT_UPN_KEY = 'gen_ai.agent.upn';
  public static readonly GEN_AI_AGENT_BLUEPRINT_ID_KEY = 'gen_ai.agent.applicationid';
  public static readonly CORRELATION_ID_KEY = 'correlation.id';
  public static readonly HIRING_MANAGER_ID_KEY = 'hiring.manager.id';

  // Execution context dimensions
  public static readonly GEN_AI_EXECUTION_TYPE_KEY = 'gen_ai.execution.type';
  public static readonly GEN_AI_EXECUTION_PAYLOAD_KEY = 'gen_ai.execution.payload';

  // Source metadata dimensions
  public static readonly GEN_AI_EXECUTION_SOURCE_ID_KEY = 'gen_ai.execution.sourceMetadata.id';
  public static readonly GEN_AI_EXECUTION_SOURCE_NAME_KEY = 'gen_ai.channel.name';
  public static readonly GEN_AI_EXECUTION_SOURCE_DESCRIPTION_KEY = 'gen_ai.channel.link';

  // Legacy constant for backward compatibility
  public static readonly KAIRO_AGENT_ID_KEY = 'gen_ai.agent.id';

  // Custom parent id and parent name key
  public static readonly CUSTOM_PARENT_SPAN_ID_KEY = 'custom.parent.span.id';
  public static readonly CUSTOM_SPAN_NAME_KEY = 'custom.span.name';
}
