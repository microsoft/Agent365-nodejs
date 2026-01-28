// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Run } from "@langchain/core/tracers/base";
import { Span } from "@opentelemetry/api";
import { OpenTelemetryConstants } from "@microsoft/agents-a365-observability";
import * as Utils from "../../../../packages/agents-a365-observability-extensions-langchain/src/Utils";

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
      const run: Partial<Run> = {
        run_type: "chain",
        name: "LangChainA365Agent",
        serialized: {
          id: ["langgraph", "pregel", "CompiledStateGraph"],
        } as any,
      };

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

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY,
        JSON.stringify(["hi"])
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

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY,
        JSON.stringify(["hello agent"])
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

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY,
        JSON.stringify(["Hello! How can I assist you today?"])
      );
    });

    it("should extract conversation/session ID from metadata", () => {
      const run: Partial<Run> = {
        extra: {
          metadata: {
            conversation_id: "conv-789",
          },
        },
      };

      Utils.setSessionIdAttribute(run as Run, mockSpan as Span);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        OpenTelemetryConstants.SESSION_ID_KEY,
        "conv-789"
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
        JSON.stringify("The weather in Seattle is currently rainy with a temperature of 39°C.")
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
        OpenTelemetryConstants.GEN_AI_REQUEST_MAX_TOKENS_KEY,
        2048
      );
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
  });
});