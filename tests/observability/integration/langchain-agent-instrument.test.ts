// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { getAzureOpenAIConfig, validateEnvironment } from "./conftest";
import { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { SpanKind } from "@opentelemetry/api";
import { ObservabilityManager, Builder, OpenTelemetryConstants } from "@microsoft/agents-a365-observability";
import { LangChainTraceInstrumentor } from "@microsoft/agents-a365-observability-extensions-langchain";
import * as LangChainCallbacks from "@langchain/core/callbacks/manager";
import { AzureChatOpenAI } from "@langchain/openai";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — ts-jest module:commonjs cannot resolve package exports subpaths
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ObservabilityBuilder } from "@microsoft/agents-a365-observability/dist/esm/ObservabilityBuilder";
import { BaggageBuilder } from "@microsoft/agents-a365-observability";
import {
  validateInstrumentationScope,
  validateSpanProperties,
  validateMessageSchema,
  validateInputMessageContent,
  validateOutputMessageContent,
  waitForSpans,
} from "./helpers/span-validators";

// The LangChain instrumentor uses hardcoded tracer name/version
const TEST_INSTRUMENTATION_NAME = "agent365-langchain";
const TEST_INSTRUMENTATION_VERSION = "1.0.0";

describe("LangChain Trace Processor Integration Tests", () => {
  let a365Observability: ObservabilityBuilder;
  let consoleDirSpy: jest.SpyInstance;
  let spans: ReadableSpan[] = [];

  beforeAll(async () => {
    validateEnvironment();
    console.log("Setting up LangChain Trace Processor test suite...");

    // Spy on console.dir which ConsoleSpanExporter uses
    consoleDirSpy = jest
      .spyOn(console, "dir")
      .mockImplementation((obj: any) => {
        spans.push(obj as ReadableSpan);
      });

    // Configure observability (must happen before instrumentor init)
    a365Observability = ObservabilityManager.configure((builder: Builder) =>
      builder.withService("LangChain Agent Instrumentation Test", "1.0.0"),
    );

    // Instrument LangChain callbacks and enable
    LangChainTraceInstrumentor.instrument(LangChainCallbacks as any);
    LangChainTraceInstrumentor.enable();

    // Start observability
    a365Observability.start();
  });

  afterAll(async () => {
    console.log("Tearing down LangChain Trace Processor test suite...");

    if (consoleDirSpy) {
      consoleDirSpy.mockRestore();
    }

    LangChainTraceInstrumentor.disable();
    LangChainTraceInstrumentor.resetInstance();

    if (a365Observability) {
      await a365Observability.shutdown();
    }

    console.log("LangChain Trace Processor test suite teardown complete");
  });

  beforeEach(() => {
    spans = [];
  });

  it("validate chat span", async () => {
    const azureConfig = getAzureOpenAIConfig();

    if (!azureConfig) {
      throw new Error("Azure OpenAI configuration is required");
    }

    try {
      const model = new AzureChatOpenAI({
        azureOpenAIApiKey: azureConfig.apiKey,
        azureOpenAIEndpoint: azureConfig.endpoint,
        azureOpenAIApiDeploymentName: azureConfig.deployment,
        azureOpenAIApiVersion: azureConfig.apiVersion,
      });

      const agentName = "LangChain Test Agent";
      const agent = createReactAgent({
        llm: model,
        tools: [],
        name: agentName,
      });

      const prompt = "Say hello!";
      const result = await agent.invoke({
        messages: [{ role: "user", content: prompt }],
      });

      // Wait for spans
      await waitForSpans(spans, 2);

      // Verify we captured spans
      expect(spans.length).toBeGreaterThanOrEqual(2);
      console.log("Total spans captured:", spans.length);

      // Output all the spans
      spans.forEach((span, idx) => {
        console.log(`\n--- Span ${idx + 1} of ${spans.length} ---`);
        console.log(JSON.stringify(span, null, 2));
      });

      // Find the chat span (LLM inference)
      const chatSpan = spans.find(
        (span) =>
          span.attributes[
            OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY
          ] === "chat",
      );
      expect(chatSpan).toBeDefined();
      expect(chatSpan?.name?.toLowerCase()).toContain("chat");
      console.log("Validate chat span");

      if (chatSpan) {
        validateInstrumentationScope(chatSpan, TEST_INSTRUMENTATION_NAME, TEST_INSTRUMENTATION_VERSION);
        validateSpanProperties(chatSpan);
        expect(chatSpan.kind).toBe(SpanKind.CLIENT);
        expect(chatSpan.name.toLowerCase()).toContain("chat");

        // Validate gen_ai attributes
        expect(
          chatSpan.attributes[OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY],
        ).toBe("chat");
        const provider = chatSpan.attributes[OpenTelemetryConstants.GEN_AI_PROVIDER_NAME_KEY];
        expect(typeof provider).toBe("string");
        expect((provider as string).length).toBeGreaterThan(0);
        expect(
          chatSpan.attributes[OpenTelemetryConstants.GEN_AI_REQUEST_MODEL_KEY],
        ).toBeDefined();
        expect(
          chatSpan.attributes[OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY],
        ).toBeDefined();
        expect(
          chatSpan.attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY],
        ).toBeDefined();

        // Token usage from AzureChatOpenAI
        const inputTokens = chatSpan.attributes[OpenTelemetryConstants.GEN_AI_USAGE_INPUT_TOKENS_KEY];
        const outputTokens = chatSpan.attributes[OpenTelemetryConstants.GEN_AI_USAGE_OUTPUT_TOKENS_KEY];
        expect(typeof inputTokens).toBe("number");
        expect(typeof outputTokens).toBe("number");
        expect(inputTokens as number).toBeGreaterThan(0);
        expect(outputTokens as number).toBeGreaterThan(0);

        // Validate A365 message schema
        validateMessageSchema(chatSpan);
        validateInputMessageContent(chatSpan, {
          hasRole: "user",
          hasPartType: "text",
        });
        validateOutputMessageContent(chatSpan, {
          hasRole: "assistant",
          hasPartType: "text",
        });

        // Detailed envelope + parts checks
        const parsedInput = JSON.parse(
          chatSpan.attributes[OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY] as string,
        );
        expect(parsedInput.version).toBe("0.1.0");
        expect(Array.isArray(parsedInput.messages)).toBe(true);
        const userMsg = parsedInput.messages.find((m: any) => m.role === "user");
        expect(userMsg).toBeDefined();
        expect(Array.isArray(userMsg.parts)).toBe(true);
        expect(userMsg.parts[0].type).toBe("text");
        expect(typeof userMsg.parts[0].content).toBe("string");
        expect(userMsg.parts[0].content).toContain(prompt);

        const parsedOutput = JSON.parse(
          chatSpan.attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY] as string,
        );
        expect(parsedOutput.version).toBe("0.1.0");
        const assistantMsg = parsedOutput.messages.find((m: any) => m.role === "assistant");
        expect(assistantMsg).toBeDefined();
        expect(Array.isArray(assistantMsg.parts)).toBe(true);
        expect(assistantMsg.parts[0].type).toBe("text");
        expect(typeof assistantMsg.parts[0].content).toBe("string");
        expect((assistantMsg.parts[0].content as string).length).toBeGreaterThan(0);

        // Validate status
        expect(chatSpan.status).toBeDefined();
        expect(chatSpan.status.code).toBe(1);

        console.log("Chat span validation passed");
      }

      // Verify the response
      expect(result).toBeDefined();
      console.log("Agent response received");
    } catch (error) {
      console.error("Test error:", error);
      throw error;
    }
  });

  it("validate agent span", async () => {
    const azureConfig = getAzureOpenAIConfig();

    if (!azureConfig) {
      throw new Error("Azure OpenAI configuration is required");
    }

    try {
      const model = new AzureChatOpenAI({
        azureOpenAIApiKey: azureConfig.apiKey,
        azureOpenAIEndpoint: azureConfig.endpoint,
        azureOpenAIApiDeploymentName: azureConfig.deployment,
        azureOpenAIApiVersion: azureConfig.apiVersion,
      });

      const agentName = "LangChain Agent Span Test";
      const agent = createReactAgent({
        llm: model,
        tools: [],
        name: agentName,
      });

      const result = await agent.invoke({
        messages: [{ role: "user", content: "Say hello!" }],
      });

      await waitForSpans(spans, 2);

      // Find and validate the agent span only
      const agentSpan = spans.find(
        (span) => span.name === `invoke_agent ${agentName}`,
      );
      expect(agentSpan).toBeDefined();
      console.log("Validate agent span");

      if (agentSpan) {
        validateInstrumentationScope(agentSpan, TEST_INSTRUMENTATION_NAME, TEST_INSTRUMENTATION_VERSION);
        validateSpanProperties(agentSpan);
        expect(agentSpan.kind).toBe(SpanKind.SERVER);
        expect(agentSpan.name).toBe(`invoke_agent ${agentName}`);
        expect(
          agentSpan.attributes[OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY],
        ).toBe("invoke_agent");
        expect(
          agentSpan.attributes[OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY],
        ).toBe(agentName);
        // Top-level agent: no inbound caller
        expect(
          agentSpan.attributes[OpenTelemetryConstants.GEN_AI_CALLER_AGENT_NAME_KEY],
        ).toBeUndefined();
        expect(agentSpan.status).toBeDefined();
        expect(agentSpan.status.code).toBe(1);
        console.log("Agent span validation passed");
      }

      expect(result).toBeDefined();
      console.log("Agent response received");
    } catch (error) {
      console.error("Test error:", error);
      throw error;
    }
  });

  it("validate execute_tool span", async () => {
    const azureConfig = getAzureOpenAIConfig();

    if (!azureConfig) {
      throw new Error("Azure OpenAI configuration is required");
    }

    try {
      const model = new AzureChatOpenAI({
        azureOpenAIApiKey: azureConfig.apiKey,
        azureOpenAIEndpoint: azureConfig.endpoint,
        azureOpenAIApiDeploymentName: azureConfig.deployment,
        azureOpenAIApiVersion: azureConfig.apiVersion,
      });

      const addTool = new DynamicStructuredTool({
        name: "add_numbers",
        description: "Add two numbers together",
        schema: z.object({
          a: z.number().describe("The first number"),
          b: z.number().describe("The second number"),
        }),
        func: async ({ a, b }: { a: number; b: number }) => {
          const result = a + b;
          return `The sum of ${a} and ${b} is ${result}`;
        },
      });

      const agentName = "MathAgent";
      const agent = createReactAgent({
        llm: model,
        tools: [addTool],
        name: agentName,
      });

      const prompt = "What is 15 plus 27?";
      const result = await agent.invoke({
        messages: [{ role: "user", content: prompt }],
      });

      // Wait for spans (agent + chat + tool, possibly more chat spans for multi-turn)
      await waitForSpans(spans, 3);

      // Verify we captured spans
      expect(spans.length).toBeGreaterThanOrEqual(3);
      console.log("Total spans captured:", spans.length);

      // Output all the spans
      spans.forEach((span, idx) => {
        console.log(`\n--- Span ${idx + 1} of ${spans.length} ---`);
        console.log(JSON.stringify(span, null, 2));
      });

      // Find and validate the tool execution span only
      const toolSpan = spans.find(
        (span) => span.name === "execute_tool add_numbers",
      );
      expect(toolSpan).toBeDefined();
      console.log("Validate tool execution span");

      if (toolSpan) {
        validateInstrumentationScope(toolSpan, TEST_INSTRUMENTATION_NAME, TEST_INSTRUMENTATION_VERSION);
        validateSpanProperties(toolSpan);
        expect(toolSpan.kind).toBe(SpanKind.CLIENT);

        // Validate tool-specific attributes
        expect(
          toolSpan.attributes[OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY],
        ).toBe("execute_tool");
        expect(
          toolSpan.attributes[OpenTelemetryConstants.GEN_AI_TOOL_NAME_KEY],
        ).toBe("add_numbers");
        expect(
          toolSpan.attributes[OpenTelemetryConstants.GEN_AI_TOOL_TYPE_KEY],
        ).toBe("extension");

        // Validate tool args — serialized as JSON object
        const toolArgs = toolSpan.attributes[
          OpenTelemetryConstants.GEN_AI_TOOL_ARGS_KEY
        ] as string;
        expect(typeof toolArgs).toBe("string");
        const parsedArgs = JSON.parse(toolArgs);
        expect(parsedArgs.a).toBe(15);
        expect(parsedArgs.b).toBe(27);

        // Validate tool result — string results are wrapped as { result: "..." }
        const toolResult = toolSpan.attributes[
          OpenTelemetryConstants.GEN_AI_TOOL_CALL_RESULT_KEY
        ] as string;
        expect(typeof toolResult).toBe("string");
        const parsedResult = JSON.parse(toolResult);
        expect(typeof parsedResult.result).toBe("string");
        expect(parsedResult.result).toContain("42");
        expect(parsedResult.result).toContain("The sum of 15 and 27");

        // Validate status
        expect(toolSpan.status).toBeDefined();
        expect(toolSpan.status.code).toBe(1);

        console.log("Tool execution span validated");
      }

      // Verify the response
      expect(result).toBeDefined();
      console.log("Agent response received");
    } catch (error) {
      console.error("Test error:", error);
      throw error;
    }
  });

  it("validate baggage propagation to spans", async () => {
    const azureConfig = getAzureOpenAIConfig();

    if (!azureConfig) {
      throw new Error("Azure OpenAI configuration is required");
    }

    try {
      const model = new AzureChatOpenAI({
        azureOpenAIApiKey: azureConfig.apiKey,
        azureOpenAIEndpoint: azureConfig.endpoint,
        azureOpenAIApiDeploymentName: azureConfig.deployment,
        azureOpenAIApiVersion: azureConfig.apiVersion,
      });

      const agentName = "BaggageTestAgent";
      const agent = createReactAgent({
        llm: model,
        tools: [],
        name: agentName,
      });

      // Set up baggage context with known values
      const testTenantId = "test-tenant-123";
      const testAgentId = "test-agent-456";
      const testUserId = "test-user-789";
      const testSessionId = "test-session-abc";
      const testChannelName = "test-channel";
      const testConversationId = "test-conversation-def";

      const baggageScope = new BaggageBuilder()
        .tenantId(testTenantId)
        .agentId(testAgentId)
        .userId(testUserId)
        .sessionId(testSessionId)
        .channelName(testChannelName)
        .conversationId(testConversationId)
        .build();

      // Run agent within baggage scope
      const result = await baggageScope.run(async () => {
        return await agent.invoke({
          messages: [{ role: "user", content: "Say hello!" }],
        });
      });

      await waitForSpans(spans, 2);

      expect(spans.length).toBeGreaterThanOrEqual(2);
      console.log("Total spans captured:", spans.length);

      // Validate baggage propagation on all spans
      for (const span of spans) {
        console.log(`Checking baggage on span: ${span.name}`);

        expect(span.attributes[OpenTelemetryConstants.TENANT_ID_KEY]).toBe(testTenantId);
        expect(span.attributes[OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]).toBe(testAgentId);
        expect(span.attributes[OpenTelemetryConstants.USER_ID_KEY]).toBe(testUserId);
        expect(span.attributes[OpenTelemetryConstants.SESSION_ID_KEY]).toBe(testSessionId);
        expect(span.attributes[OpenTelemetryConstants.CHANNEL_NAME_KEY]).toBe(testChannelName);
        expect(span.attributes[OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY]).toBe(testConversationId);

        console.log(`Baggage validated on span: ${span.name}`);
      }

      expect(result).toBeDefined();
      console.log("Baggage propagation test passed");
    } catch (error) {
      console.error("Test error:", error);
      throw error;
    }
  });

  it("validate nested-agent caller.agent.name and error.type on tool failure", async () => {
    const azureConfig = getAzureOpenAIConfig();
    if (!azureConfig) throw new Error("Azure OpenAI configuration is required");

    const model = new AzureChatOpenAI({
      azureOpenAIApiKey: azureConfig.apiKey,
      azureOpenAIEndpoint: azureConfig.endpoint,
      azureOpenAIApiDeploymentName: azureConfig.deployment,
      azureOpenAIApiVersion: azureConfig.apiVersion,
    });

    // Nested agent: outer agent calls a tool that invokes an inner agent
    const innerAgent = createReactAgent({ llm: model, tools: [], name: "InnerAgent" });
    const delegateTool = new DynamicStructuredTool({
      name: "delegate",
      description: "Delegate the request to InnerAgent",
      schema: z.object({ query: z.string() }),
      // Pass the tool's RunnableConfig so the inner agent's run is linked as a child.
      func: async ({ query }: { query: string }, _runManager, config) => {
        const r = await innerAgent.invoke(
          { messages: [{ role: "user", content: query }] },
          config,
        );
        return JSON.stringify(r);
      },
    });
    // Error-producing tool
    const throwingTool = new DynamicStructuredTool({
      name: "will_throw",
      description: "Always fails with an error",
      schema: z.object({}),
      func: async () => { throw new Error("simulated failure"); },
    });

    const outerAgent = createReactAgent({
      llm: model,
      tools: [delegateTool, throwingTool],
      name: "OuterAgent",
    });

    try {
      await outerAgent.invoke({
        messages: [{ role: "user", content: "Call the will_throw tool and also delegate 'ping' to InnerAgent." }],
      });
    } catch {
      // Errors bubble up from the agent run; we still expect spans to be recorded.
    }

    await waitForSpans(spans, 3);

    // LangGraph renames the nested agent run after the calling tool ("delegate"),
    // so we look for any invoke_agent span that isn't the outer one and verify
    // its caller.agent.name points back to OuterAgent via the parent-run walk.
    const nestedAgentSpan = spans.find(
      (s) =>
        s.attributes[OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY] === "invoke_agent" &&
        s.attributes[OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY] !== "OuterAgent" &&
        s.attributes[OpenTelemetryConstants.GEN_AI_CALLER_AGENT_NAME_KEY] !== undefined,
    );
    expect(nestedAgentSpan).toBeDefined();
    expect(nestedAgentSpan?.attributes[OpenTelemetryConstants.GEN_AI_CALLER_AGENT_NAME_KEY]).toBe("OuterAgent");
    console.log(
      `caller.agent.name via parent walk validated (nested agent name: ${nestedAgentSpan?.attributes[OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY]})`,
    );

    const errorSpan = spans.find((s) => s.attributes[OpenTelemetryConstants.ERROR_TYPE_KEY]);
    expect(errorSpan).toBeDefined();
    const errorType = errorSpan?.attributes[OpenTelemetryConstants.ERROR_TYPE_KEY];
    expect(typeof errorType).toBe("string");
    expect((errorType as string).length).toBeGreaterThan(0);
    expect(errorSpan?.attributes[OpenTelemetryConstants.ERROR_MESSAGE_KEY]).toContain("simulated failure");
    console.log(`error.type="${errorType}", error.message validated`);
  });
});
