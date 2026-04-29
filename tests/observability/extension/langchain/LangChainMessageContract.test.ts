// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { Run } from "@langchain/core/tracers/base";
import { Span } from "@opentelemetry/api";
import { OpenTelemetryConstants } from "@microsoft/agents-a365-observability";
import * as Utils from "../../../../packages/agents-a365-observability-extensions-langchain/src/Utils";
import { expectValidInputMessages, expectValidOutputMessages, getSpanAttribute } from "../helpers/message-schema-validator";

describe("LangChain Message Contract Tests", () => {
  let mockSpan: { setAttribute: jest.Mock; setStatus: jest.Mock; end: jest.Mock; recordException: jest.Mock };

  beforeEach(() => {
    mockSpan = {
      setAttribute: jest.fn(),
      setStatus: jest.fn(),
      end: jest.fn(),
      recordException: jest.fn(),
    };
  });

  function getInputAttr(): string {
    const value = getSpanAttribute(mockSpan, OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY);
    expect(value).toBeDefined();
    return value as string;
  }

  function getOutputAttr(): string {
    const value = getSpanAttribute(mockSpan, OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY);
    expect(value).toBeDefined();
    return value as string;
  }

  function setInput(messages: unknown[]): void {
    const run: Partial<Run> = { run_type: "llm", inputs: { messages: [messages] } };
    Utils.setInputMessagesAttribute(run as Run, mockSpan as unknown as Span);
  }

  describe("Input messages from real LangChain types", () => {
    it("should map a full conversation with all message types", () => {
      setInput([
        new SystemMessage("You are a weather assistant."),
        new HumanMessage("What's the weather in Seattle?"),
        new AIMessage({
          content: "Let me check.",
          tool_calls: [{ name: "get_weather", args: { city: "Seattle" }, id: "call_1" }],
        }),
        new ToolMessage({ content: "Rainy, 45°F", tool_call_id: "call_1" }),
      ]);

      const value = getInputAttr();
      expectValidInputMessages(value);

      const parsed = JSON.parse(value);
      const roles = parsed.messages.map((m: Record<string, unknown>) => m.role);
      expect(roles).toEqual(["system", "user", "assistant", "tool"]);

      expect(parsed.messages[0].parts[0].content).toBe("You are a weather assistant.");
      expect(parsed.messages[1].parts[0].content).toBe("What's the weather in Seattle?");

      const aiParts = parsed.messages[2].parts;
      expect(aiParts.find((p: Record<string, unknown>) => p.type === "text").content).toBe("Let me check.");
      const toolCallPart = aiParts.find((p: Record<string, unknown>) => p.type === "tool_call");
      expect(toolCallPart.name).toBe("get_weather");
      expect(toolCallPart.id).toBe("call_1");

      expect(parsed.messages[3].parts[0].content).toBe("Rainy, 45°F");
    });
  });

  describe("Output messages from real LangChain types", () => {
    it("should map AIMessage text output via generations", () => {
      const run: Partial<Run> = {
        run_type: "llm",
        outputs: { generations: [[{ text: "Hello!", message: new AIMessage("Hello!") }]] },
      };
      Utils.setOutputMessagesAttribute(run as Run, mockSpan as unknown as Span);

      const value = getOutputAttr();
      expectValidOutputMessages(value);

      const parsed = JSON.parse(value);
      expect(parsed.messages[0].role).toBe("assistant");
      expect(parsed.messages[0].parts[0].content).toBe("Hello!");
    });

    it("should map AIMessage with tool_calls in output via generations", () => {
      const aiMsg = new AIMessage({
        content: "",
        tool_calls: [{ name: "search", args: { query: "weather" }, id: "call_456" }],
      });
      const run: Partial<Run> = {
        run_type: "llm",
        outputs: { generations: [[{ text: "", message: aiMsg }]] },
      };
      Utils.setOutputMessagesAttribute(run as Run, mockSpan as unknown as Span);

      const value = getOutputAttr();
      expectValidOutputMessages(value);

      const toolPart = JSON.parse(value).messages[0].parts.find((p: Record<string, unknown>) => p.type === "tool_call");
      expect(toolPart.name).toBe("search");
      expect(toolPart.id).toBe("call_456");
    });

    it("should map direct output messages array (LangGraph path)", () => {
      const run: Partial<Run> = {
        run_type: "chain",
        serialized: { id: ["langgraph", "graph", "CompiledStateGraph"] },
        outputs: { messages: [new AIMessage("Task complete.")] },
      };
      Utils.setOutputMessagesAttribute(run as Run, mockSpan as unknown as Span);

      const value = getOutputAttr();
      expectValidOutputMessages(value);
    });
  });
});
