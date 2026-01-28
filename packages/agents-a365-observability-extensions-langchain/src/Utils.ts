// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Run } from "@langchain/core/tracers/base";
import { Span } from "@opentelemetry/api";
import { ExecutionType, OpenTelemetryConstants } from "@microsoft/agents-a365-observability";

// Type guards
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

// Operation type mapping
export function getOperationType(run: Run): string {
  let operation = "unknown";

  if (run.run_type === "chain" && isLangGraphAgentInvoke(run)) {
    operation = "invoke_agent";
  } else if (run.run_type === "tool") {
    operation = "execute_tool";
  } else if (run.run_type === "llm") {
    operation = "chat"; 
  }
  return operation;
}

// Operation type mapping
export function setOperationTypeAttribute(operation: string, span: Span) {  
  span.setAttribute(OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY, operation);
}

// Agent attributes
export function setAgentAttributes(run: Run, span: Span) {
  if (isLangGraphAgentInvoke(run)) {
    const agentName = run.name;
    span.setAttribute(OpenTelemetryConstants.GEN_AI_EXECUTION_TYPE_KEY, getExecutionType(run));
    if (isString(agentName)) span.setAttribute(OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY, agentName);
  }
}

// Tool attributes
export function setToolAttributes(run: Run, span: Span) {
  if (run.run_type !== "tool") {
    return;
  }
  if (!run.serialized || typeof run.serialized !== "object" || Array.isArray(run.serialized)) {
    return;
  }

  if (isString(run.name)) span.setAttribute(OpenTelemetryConstants.GEN_AI_TOOL_NAME_KEY, run.name);
  if (run.inputs) span.setAttribute(OpenTelemetryConstants.GEN_AI_TOOL_ARGS_KEY, JSON.stringify(run.inputs['input'] ?? run.inputs));
  if (run.outputs?.output?.kwargs?.content) span.setAttribute(OpenTelemetryConstants.GEN_AI_TOOL_CALL_RESULT_KEY, JSON.stringify(run.outputs.output.kwargs.content));
  span.setAttribute(OpenTelemetryConstants.GEN_AI_TOOL_TYPE_KEY, "extension");  
  if (run.outputs?.output?.tool_call_id) span.setAttribute(OpenTelemetryConstants.GEN_AI_TOOL_CALL_ID_KEY, run.outputs.output.tool_call_id);
}

export function setInputMessagesAttribute(run: Run, span: Span) {
  const messages = run.inputs?.messages;
  if (!Array.isArray(messages)) {
    return;
  }

  // Determine scope type from run_type
  const isAgentScope = run.run_type === "chain" && isLangGraphAgentInvoke(run);
  const isInferenceScope = run.run_type === "llm";
  
  const preprocess = isInferenceScope ? messages[0] : messages;
  const processed = preprocess?.map((msg: Record<string, unknown>) => {
      const content = extractMessageContent(msg);
      if (!content) return null;

      const msgType = getMessageType(msg);

      // InvokeAgentScope: user messages only
      if (isAgentScope) {
        if (msgType === "user" || msgType === "human") {
          return content;
        }
      }
      // InferenceScope: user messages only (exclude system)
      else if (isInferenceScope) {
        if (msgType === "user" || msgType === "human") {
          return content;
        }
      }
      // ExecuteToolScope and others: user messages
      else {
        if (msgType === "user" || msgType === "human") {
          return content;
        }
      }
      return null;
    })
    .filter(Boolean);

  if (processed.length > 0) {
    span.setAttribute(OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY, JSON.stringify(processed));
  }
}

// Helper: Extract message content from various formats
function extractMessageContent(msg: Record<string, unknown>): string | null {
  // Simple format: {role: "user", content}
  if (isString(msg.content)) {
    return msg.content;
  }

  // LangChain format: {lc_type: "human", lc_kwargs: {content}}
  if (msg.lc_kwargs && typeof msg.lc_kwargs === "object" && !Array.isArray(msg.lc_kwargs)) {
    const kwargs = msg.lc_kwargs as Record<string, unknown>;
    if (isString(kwargs.content)) return kwargs.content;
  }

  // New LangChain format: {lc: 1, type: "constructor", kwargs: {content}}
  if (msg.lc === 1 && msg.type === "constructor" && msg.kwargs && typeof msg.kwargs === "object" && !Array.isArray(msg.kwargs)) {
    const kwargs = msg.kwargs as Record<string, unknown>;
    if (isString(kwargs.content)) return kwargs.content;
  }
  return null;
}

// Helper: Determine message type
function getMessageType(msg: Record<string, unknown>): string {
  // Simple format
  if (isString(msg.role)) return msg.role;
  // LangChain old format
  if (isString(msg.lc_type)) return msg.lc_type;
  if (isString(msg.type)) return msg.type;
  // LangChain new format - check id array for message type
  if (Array.isArray(msg.id)) {
    const lastId = msg.id[msg.id.length - 1];
    if (isString(lastId)) {
      if (lastId.includes("Human")) return "human";
      if (lastId.includes("AI")) return "ai";
      if (lastId.includes("System")) return "system";
    }
  }
  return "unknown";
}

// Helper: Determine message type
function getExecutionType(run: Run): ExecutionType {
  switch(run?.inputs?.messages[0]?.role) {
    case "user":
      return ExecutionType.HumanToAgent;
    case "ai":
      return ExecutionType.Agent2Agent;
    default: return ExecutionType.Unknown;
  }  
}

export function setOutputMessagesAttribute(run: Run, span: Span) {
  const outputs = run.outputs;
  if (!outputs) {
    return;
  }

  // Determine scope type from run_type
  const isAgentScope = run.run_type === "chain" && isLangGraphAgentInvoke(run);
  const isToolScope = run.run_type === "tool";
  const isInferenceScope = run.run_type === "llm";

  const messages: string[] = [];

  // Direct messages array (used in agent/chain outputs)
  if (Array.isArray(outputs.messages)) {
    outputs.messages.forEach((msg: Record<string, unknown>) => {
      const content = extractMessageContent(msg);
      if (!content) return;

      const msgType = getMessageType(msg);

      // InvokeAgentScope: assistant/AI messages only
      if (isAgentScope) {
        if (msgType === "ai" || msgType === "assistant") {
          messages.push(content);
        }
      }
      // ExecuteToolScope: all output messages
      else if (isToolScope) {
        messages.push(content);
      }
      // InferenceScope: assistant/AI messages only
      else if (isInferenceScope) {
        if (msgType === "ai" || msgType === "assistant") {
          messages.push(content);
        }
      }
      // Default: extract all messages
      else {
        messages.push(content);
      }
    });
  }

  // LangChain generations format (used in LLM/inference outputs)
  if (Array.isArray(outputs.generations)) {
    outputs.generations.forEach((gen: unknown) => {
      if (Array.isArray(gen)) {
        gen.forEach((item: Record<string, unknown>) => {
          // Try message property
          if (item.message && typeof item.message === "object" && !Array.isArray(item.message)) {
            const msg = item.message as Record<string, unknown>;
            const content = extractMessageContent(msg);
            if (!content) { 
              return;
            }

            const msgType = getMessageType(msg);

            // InvokeAgentScope: assistant/AI messages only
            if (isAgentScope) {
              if (msgType === "ai" || msgType === "assistant") {
                messages.push(content);
              }
            }
            // ExecuteToolScope: all messages
            else if (isToolScope) {
              messages.push(content);
            }
            // InferenceScope: assistant/AI messages only
            else if (isInferenceScope) {
              if (msgType === "ai" || msgType === "assistant") {
                messages.push(content);
              }
            }
            // Default: extract all
            else {
              messages.push(content);
            }
          }
          // Try direct text property (for generation items)
          else if (isString(item.text) && isInferenceScope) {
            messages.push(item.text);
          }
        });
      }
    });
  }

  // Check for direct message object (some models return this)
  if (outputs.message && typeof outputs.message === "object" && !Array.isArray(outputs.message)) {
    const msg = outputs.message as Record<string, unknown>;
    const content = extractMessageContent(msg);
    if (content) {
      const msgType = getMessageType(msg);

      // InvokeAgentScope: assistant/AI messages only
      if (isAgentScope) {
        if (msgType === "ai" || msgType === "assistant") {
          messages.push(content);
        }
      }
      // ExecuteToolScope: all messages
      else if (isToolScope) {
        messages.push(content);
      }
      // InferenceScope: assistant/AI messages only
      else if (isInferenceScope) {
        if (msgType === "ai" || msgType === "assistant") {
          messages.push(content);
        }
      }
      // Default: extract all
      else {
        messages.push(content);
      }
    }
  }

  if (messages.length > 0) {
    span.setAttribute(OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY, JSON.stringify(messages));
  }
}

// Model
export function setModelAttribute(run: Run, span: Span) {
  const model =
    [run.outputs?.generations?.[0]?.[0]?.message?.kwargs?.response_metadata?.model_name,
     run.extra?.metadata?.ls_model_name,
     run.extra?.invocation_params?.model,
     run.extra?.invocation_params?.model_name]
      .map((v) => (v != null ? String(v).trim() : ""))
      .find((v) => v.length > 0);

  if (model) span.setAttribute(OpenTelemetryConstants.GEN_AI_REQUEST_MODEL_KEY, model);
}

// Provider
export function setProviderNameAttribute(run: Run, span: Span) {
  const provider = (run.extra?.metadata as Record<string, unknown> | undefined)?.ls_provider;
  if (isString(provider)) span.setAttribute(OpenTelemetryConstants.GEN_AI_PROVIDER_NAME_KEY, provider.toLowerCase());
}


export function setSessionIdAttribute(run: Run, span: Span): void {
  const metadata = run.extra?.metadata as Record<string, unknown> | undefined;
  if (!metadata) return;

  const sessionId =
    metadata.session_id ??
    metadata.conversation_id ??
    metadata.thread_id;

  if (typeof sessionId === "string" && sessionId.length > 0) {
    span.setAttribute(OpenTelemetryConstants.SESSION_ID_KEY, sessionId);
  }
}

// System instructions
export function setSystemInstructionsAttribute(run: Run, span: Span) {
  const inputs = run.inputs as Record<string, unknown> | undefined;
  if (!inputs) {
    return;
  }

  const prompts = Array.isArray(inputs.prompts) ? inputs.prompts.map(p => String(p ?? "").trim()).filter(Boolean).join("\n") : "";
  if (prompts) return span.setAttribute(OpenTelemetryConstants.GEN_AI_SYSTEM_INSTRUCTIONS_KEY, prompts);

  const messages = Array.isArray(inputs.messages) ? inputs.messages : [];
  const systemText = messages
    .filter((m: Record<string, unknown>) => m.lc_type === "system")
    .map((m: Record<string, unknown>) => String((m.lc_kwargs as Record<string, unknown> | undefined)?.content ?? "").trim())
    .filter(Boolean)
    .join("\n");
  if (systemText) span.setAttribute(OpenTelemetryConstants.GEN_AI_SYSTEM_INSTRUCTIONS_KEY, systemText);
}

// Tokens (input and output)
export function setTokenAttributes(run: Run, span: Span) {
  const maxTokens = run.extra?.invocation_params?.max_tokens;
  if (typeof maxTokens === "number") {
    span.setAttribute(OpenTelemetryConstants.GEN_AI_REQUEST_MAX_TOKENS_KEY, maxTokens);
  }

  // Try multiple paths to find usage metadata using optional chaining
  const usage = 
    run.outputs?.generations?.[0]?.[0]?.message?.usage_metadata || //llm - direct usage_metadata
    run.outputs?.generations?.[0]?.[0]?.message?.kwargs?.usage_metadata || //llm - kwargs.usage_metadata
    run.outputs?.generations?.[0]?.[0]?.message?.kwargs?.response_metadata?.tokenUsage || //llm - response_metadata
    run.outputs?.messages?.[1]?.usage_metadata || // agent call
    run.outputs?.message?.response_metadata?.usage ||
    run.outputs?.message?.response_metadata?.tokenUsage ||
    run.outputs?.messages
      ?.map((msg: Record<string, unknown>) => (msg.response_metadata as Record<string, unknown> | undefined)?.tokenUsage)
      .filter(Boolean)[0];  //mode_request, chain

  if (!usage || typeof usage !== "object") {
    return;
  }

  const usageObj = usage as Record<string, unknown>;
  if (typeof usageObj.input_tokens === "number") {
    span.setAttribute(OpenTelemetryConstants.GEN_AI_USAGE_INPUT_TOKENS_KEY, usageObj.input_tokens);
  }
  if (typeof usageObj.output_tokens === "number") {
    span.setAttribute(OpenTelemetryConstants.GEN_AI_USAGE_OUTPUT_TOKENS_KEY, usageObj.output_tokens);
  }
}


// LangGraph agent check
function isLangGraphAgentInvoke(run: Run): boolean {
  if (run.run_type !== "chain") {
    return false;
  }
  if (!run.serialized || typeof run.serialized !== "object" || Array.isArray(run.serialized)) {
    return false;
  }
  const serialized = run.serialized as Record<string, unknown>;
  const id = serialized.id;
  return Array.isArray(id) && id.includes("langgraph") && id.includes("CompiledStateGraph");
}
