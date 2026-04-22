// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Run } from "@langchain/core/tracers/base";
import { Span } from "@opentelemetry/api";
import { OpenTelemetryConstants } from "@microsoft/agents-a365-observability";
import * as Utils from "../../../../packages/agents-a365-observability-extensions-langchain/src/Utils";
import { expectValidInputMessages, expectValidOutputMessages, getSpanAttribute } from "../helpers/message-schema-validator";

describe("LangChain Observability - InvokeAgentScope Attributes", () => {
  let mockSpan: Partial<Span>;

  beforeEach(() => {
    mockSpan = {
      setAttribute: jest.fn(),
      setStatus: jest.fn(),
      end: jest.fn(),
      recordException: jest.fn(),
    };
  });

  describe("InvokeAgentScope - Agent Invoke Execution (LangGraph chain run)", () => {
    it("should extract operation type as agent_invoke for LangGraph chain", () => {
      Utils.setOperationTypeAttribute("agent_invoke", mockSpan as Span);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY,
        "agent_invoke"
      );
    });

    it("should extract input messages (user role only) for agent invoke", () => {
      const run: Partial<Run> = {
        inputs: {
          messages: [
            {
              role: "user",
              content: "hi",
            },
          ],
        },
      };

      Utils.setInputMessagesAttribute(run as Run, mockSpan as Span);

      const inputValue = getSpanAttribute(mockSpan as any, OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY);
      expectValidInputMessages(inputValue);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY,
        JSON.stringify({"version":"0.1.0","messages":[{"role":"user","parts":[{"type":"text","content":"hi"}]}]})
      );
    });

    it("should extract input messages from LangChain HumanMessage format", () => {
      const run: Partial<Run> = {
        inputs: {
          messages: [
            {
              lc_type: "human",
              lc_kwargs: {
                content: "hello agent",
              },
            },
          ],
        },
      };

      Utils.setInputMessagesAttribute(run as Run, mockSpan as Span);

      const inputValue = getSpanAttribute(mockSpan as any, OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY);
      expectValidInputMessages(inputValue);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY,
        JSON.stringify({"version":"0.1.0","messages":[{"role":"user","parts":[{"type":"text","content":"hello agent"}]}]})
      );
    });

    it("should extract output messages (assistant role only) for agent response", () => {
      const run: Partial<Run> = {
        outputs: {
          messages: [
            {
              lc_type: "ai",
              lc_kwargs: {
                content: "Hello! How can I assist you today?",
              },
            },
          ],
        },
      };

      Utils.setOutputMessagesAttribute(run as Run, mockSpan as Span);

      const outputValue = getSpanAttribute(mockSpan as any, OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY);
      expectValidOutputMessages(outputValue);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY,
        JSON.stringify({"version":"0.1.0","messages":[{"role":"assistant","parts":[{"type":"text","content":"Hello! How can I assist you today?"}]}]})
      );
    });

    it("should map conversation_id to gen_ai.conversation.id and session_id to session.id", () => {
      const run: Partial<Run> = {
        extra: {
          metadata: {
            conversation_id: "conv-789",
            session_id: "sess-123",
          },
        },
      };

      Utils.setSessionIdAttribute(run as Run, mockSpan as Span);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY,
        "conv-789"
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.SESSION_ID_KEY,
        "sess-123"
      );
    });

  });
});

describe("LangChain Observability - ExecuteToolScope Attributes", () => {
  let mockSpan: Partial<Span>;

  beforeEach(() => {
    mockSpan = {
      setAttribute: jest.fn(),
      setStatus: jest.fn(),
      end: jest.fn(),
      recordException: jest.fn(),
    };
  });

  describe("ExecuteToolScope - Tool Execution (LangChain tool run)", () => {
    it("should extract operation type as execute_tool", () => {
      Utils.setOperationTypeAttribute("execute_tool", mockSpan as Span);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY,
        "execute_tool"
      );
    });

    it("should extract tool attributes", () => {
      const run: Partial<Run> = {
        run_type: "tool",
        name: "get_weather",
        serialized: {
          name: "get_weather",
        },
        inputs: {
          input: '{"city": "Seattle"}',
        },
        outputs: {
          output: {
            lc: 1,
            type: "constructor",
            id: [
              "langchain_core",
              "messages",
              "ToolMessage"
            ],
            kwargs: {
              status: "success",
              content: "The weather in Seattle is currently rainy with a temperature of 39°C.",
              tool_call_id: "call_8urCabH7q39GzN0rMdN2BjaJ",
              name: "get_weather",
              metadata: {},
              additional_kwargs: {},
              response_metadata: {}
            }
          }
        }
      };

      Utils.setToolAttributes(run as Run, mockSpan as Span);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_TOOL_TYPE_KEY,
        "extension"
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_TOOL_NAME_KEY,
        "get_weather"
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_TOOL_CALL_RESULT_KEY,
        '{"result":"The weather in Seattle is currently rainy with a temperature of 39°C."}'
      );
      // Tool args: string input is already valid JSON, passed through by safeSerializeToJson
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_TOOL_ARGS_KEY,
        '{"city": "Seattle"}'
      );
    });

    it("should extract tool result from v1 plain string output", () => {
      const run: Partial<Run> = {
        run_type: "tool",
        name: "get_weather",
        serialized: { name: "get_weather" },
        inputs: {
          input: '{"city": "Seattle"}',
          tool_call_id: "call_v1_abc123",
        },
        outputs: {
          output: "Sunny, 25°C in Seattle.",
        },
      };

      Utils.setToolAttributes(run as Run, mockSpan as Span);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_TOOL_CALL_RESULT_KEY,
        '{"result":"Sunny, 25°C in Seattle."}'
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_TOOL_ARGS_KEY,
        '{"city": "Seattle"}'
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_TOOL_CALL_ID_KEY,
        "call_v1_abc123"
      );
    });

  });
});

describe("LangChain Observability - InferenceScope Attributes", () => {
  let mockSpan: Partial<Span>;

  beforeEach(() => {
    mockSpan = {
      setAttribute: jest.fn(),
      setStatus: jest.fn(),
      end: jest.fn(),
      recordException: jest.fn(),
    };
  });

  describe("InferenceScope - LLM Model Inference", () => {

    it("should extract model name from multiple fallback sources", () => {
      const run: Partial<Run> = {
        outputs: {
          generations: [
            [
              {
                message: {
                  kwargs: {
                    response_metadata: {
                      model_name: "gpt-3.5-turbo-0125",
                    },
                  },
                },
              },
            ],
          ],
        },
        extra: {
          metadata: {
            ls_model_name: "gpt-3.5-turbo",
          },
          invocation_params: {
            model: "gpt-3.5-turbo",
          },
        },
      };

      Utils.setModelAttribute(run as Run, mockSpan as Span);

      // Should use response_metadata.model_name first (highest priority)
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_REQUEST_MODEL_KEY,
        "gpt-3.5-turbo-0125"
      );
    });

    it("should extract provider name from metadata", () => {
      const run: Partial<Run> = {
        extra: {
          metadata: {
            ls_provider: "openai",
          },
        },
      };

      Utils.setProviderNameAttribute(run as Run, mockSpan as Span);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_PROVIDER_NAME_KEY,
        "openai"
      );
    });


    it("should extract token usage information", () => {
      const run: Partial<Run> = {
        extra: {
          invocation_params: {
            max_tokens: 2048,
          },
        },
        outputs: {
          generations: [
            [
              {
                text: "Hello! How can I assist you today?",
                message: {
                  lc: 1,
                  type: "constructor",
                  id: [
                    "langchain_core",
                    "messages",
                    "AIMessage"
                  ],
                  kwargs: {
                    id: "chatcmpl-D1Kbl7pp0zgZBrfB9daIIOR1xRpEF",
                    content: "Hello! How can I assist you today?",
                    additional_kwargs: {},
                    response_metadata: {
                      tokenUsage: {
                        promptTokens: 356,
                        completionTokens: 10,
                        totalTokens: 366
                      },
                      finish_reason: "stop",
                      model_provider: "openai",
                      model_name: "gpt-3.5-turbo-0125"
                    },
                    type: "ai",
                    tool_calls: [],
                    invalid_tool_calls: [],
                    usage_metadata: {
                      output_tokens: 10,
                      input_tokens: 356,
                      total_tokens: 366,
                      input_token_details: {
                        audio: 0,
                        cache_read: 0
                      },
                      output_token_details: {
                        audio: 0,
                        reasoning: 0
                      }
                    }
                  }
                },
                generationInfo: {
                  finish_reason: "stop"
                }
              }
            ]
          ],
          llmOutput: {
            tokenUsage: {
              promptTokens: 356,
              completionTokens: 10,
              totalTokens: 366
            }
          }
        }
      };

      Utils.setTokenAttributes(run as Run, mockSpan as Span);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_USAGE_INPUT_TOKENS_KEY,
        356
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_USAGE_OUTPUT_TOKENS_KEY,
        10
      );
    });

    it("should extract system instructions from prompts", () => {
      const run: Partial<Run> = {
        inputs: {
          prompts: ["You are a helpful assistant"],
          messages: [],
        },
      };

      Utils.setSystemInstructionsAttribute(run as Run, mockSpan as Span);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_SYSTEM_INSTRUCTIONS_KEY,
        "You are a helpful assistant"
      );
    });

    it("should extract system instructions from SystemMessage", () => {
      const run: Partial<Run> = {
        inputs: {
          messages: [
            {
              lc_type: "system",
              lc_kwargs: {
                content: "You are a code generator",
              },
            },
            {
              lc_type: "human",
              lc_kwargs: {
                content: "Write a function",
              },
            },
          ],
        },
      };

      Utils.setSystemInstructionsAttribute(run as Run, mockSpan as Span);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_SYSTEM_INSTRUCTIONS_KEY,
        "You are a code generator"
      );
    });

    it("should extract system instructions from v1 constructor format", () => {
      const run: Partial<Run> = {
        inputs: {
          messages: [[
            {
              lc: 1,
              type: "constructor",
              id: ["langchain_core", "messages", "SystemMessage"],
              kwargs: { content: "v1 system prompt" },
            },
            {
              lc: 1,
              type: "constructor",
              id: ["langchain_core", "messages", "HumanMessage"],
              kwargs: { content: "user input" },
            },
          ]],
        },
      };

      Utils.setSystemInstructionsAttribute(run as Run, mockSpan as Span);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_SYSTEM_INSTRUCTIONS_KEY,
        "v1 system prompt"
      );
    });

    it("should extract tokens from tokenUsage shape (promptTokens/completionTokens)", () => {
      const run: Partial<Run> = {
        outputs: {
          generations: [[{
            message: {
              kwargs: {
                response_metadata: {
                  tokenUsage: {
                    promptTokens: 100,
                    completionTokens: 50,
                    totalTokens: 150,
                  },
                },
              },
            },
          }]],
        },
      };

      Utils.setTokenAttributes(run as Run, mockSpan as Span);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_USAGE_INPUT_TOKENS_KEY,
        100
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_USAGE_OUTPUT_TOKENS_KEY,
        50
      );
    });
  });
});

describe("LangChain Observability - v1 Format Coverage", () => {
  let mockSpan: Partial<Span>;

  beforeEach(() => {
    mockSpan = { setAttribute: jest.fn() };
  });

  it("should extract input content from v1 constructor format", () => {
    const run: Partial<Run> = {
      run_type: "llm",
      inputs: {
        messages: [[
          {
            lc: 1,
            type: "constructor",
            id: ["langchain_core", "messages", "HumanMessage"],
            kwargs: { content: "v1 format message" },
          },
        ]],
      },
    };

    Utils.setInputMessagesAttribute(run as Run, mockSpan as Span);

    const value = getSpanAttribute(mockSpan as any, OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY);
    expectValidInputMessages(value);
    const parsed = JSON.parse(value as string);
    expect(parsed.messages[0].parts[0].content).toBe("v1 format message");
  });

  it("should extract output content from v1 AIMessage constructor format", () => {
    const run: Partial<Run> = {
      run_type: "llm",
      outputs: {
        generations: [[{
          message: {
            lc: 1,
            type: "constructor",
            id: ["langchain_core", "messages", "AIMessage"],
            kwargs: { content: "v1 AI response", tool_calls: [] },
          },
        }]],
      },
    };

    Utils.setOutputMessagesAttribute(run as Run, mockSpan as Span);

    const value = getSpanAttribute(mockSpan as any, OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY);
    expectValidOutputMessages(value);
    const parsed = JSON.parse(value as string);
    expect(parsed.messages[0].role).toBe("assistant");
    expect(parsed.messages[0].parts[0].content).toBe("v1 AI response");
  });

  it("should not set input attribute when inputs.messages is missing", () => {
    const run: Partial<Run> = { inputs: { other_key: "value" } };
    Utils.setInputMessagesAttribute(run as Run, mockSpan as Span);
    expect(mockSpan.setAttribute).not.toHaveBeenCalledWith(
      OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY,
      expect.anything()
    );
  });

  it("should filter out non-AI messages from agent scope outputs", () => {
    const run: Partial<Run> = {
      run_type: "chain",
      serialized: { id: ["langgraph", "graph", "CompiledStateGraph"] },
      outputs: {
        messages: [
          { role: "user", content: "user message in output" },
          { role: "system", content: "system in output" },
          { role: "assistant", content: "ai response" },
        ],
      },
    };

    Utils.setOutputMessagesAttribute(run as Run, mockSpan as Span);

    const value = getSpanAttribute(mockSpan as any, OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY);
    const parsed = JSON.parse(value as string);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].role).toBe("assistant");
    expect(parsed.messages[0].parts[0].content).toBe("ai response");
  });
});
