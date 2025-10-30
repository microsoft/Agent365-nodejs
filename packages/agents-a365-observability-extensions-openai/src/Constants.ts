// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

/**
 * Constants for OpenAI Agents SDK wrapper
 */

// Span Attribute Types
export const GEN_AI_SPAN_KIND_AGENT_KEY = 'agent';
export const GEN_AI_SPAN_KIND_TOOL_KEY = 'tool';
export const GEN_AI_SPAN_KIND_CHAIN_KEY = 'chain';
export const GEN_AI_SPAN_KIND_LLM_KEY = 'chat';
export const GEN_AI_SPAN_KIND_RETRIEVER_KEY = 'retriever';
export const GEN_AI_SPAN_KIND_EMBEDDING_KEY = 'embedding';
export const GEN_AI_SPAN_KIND_RERANKER_KEY = 'reranker';
export const GEN_AI_SPAN_KIND_GUARDRAIL_KEY = 'guardrail';
export const GEN_AI_SPAN_KIND_EVALUATOR_KEY = 'evaluator';
export const GEN_AI_SPAN_KIND_UNKNOWN_KEY = 'unknown';

// Message Prefixes
export const GEN_AI_MESSAGE_ROLE = 'message_role';
export const GEN_AI_MESSAGE_CONTENT = 'message_content';
export const GEN_AI_MESSAGE_CONTENTS = 'message_contents';
export const GEN_AI_MESSAGE_CONTENT_TYPE = 'content_type';
export const GEN_AI_MESSAGE_TOOL_CALLS = 'message_tool_calls';
export const GEN_AI_MESSAGE_TOOL_CALL_ID = 'message_tool_id';
export const GEN_AI_MESSAGE_TOOL_CALL_NAME = 'message_tool_name';
export const GEN_AI_TOOL_JSON_SCHEMA = 'tool_json_schema';
export const GEN_AI_LLM_TOKEN_COUNT_PROMPT_DETAILS_CACHED_READ = 'llm_token_count_prompt_details_cached_read';
export const GEN_AI_LLM_TOKEN_COUNT_COMPLETION_DETAILS_REASONING = 'llm_token_count_completion_details_reasoning';
export const GEN_AI_GRAPH_NODE_ID = 'graph_node_id';
export const GEN_AI_GRAPH_NODE_PARENT_ID = 'graph_node_parent_id';

export const GEN_AI_REQUEST_CONTENT_KEY = 'gen_ai.request.content';
export const GEN_AI_RESPONSE_CONTENT_KEY = 'gen_ai.response.content';
