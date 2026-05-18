// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { getAzureOpenAIConfig, validateEnvironment } from "./conftest";
import { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { SpanKind } from "@opentelemetry/api";
import { ObservabilityManager, Builder, OpenTelemetryConstants } from "@microsoft/agents-a365-observability";
import { OpenAIAgentsTraceInstrumentor } from "@microsoft/agents-a365-observability-extensions-openai";
import { Agent, run, tool } from "@openai/agents";
import { OpenAIChatCompletionsModel } from "@openai/agents-openai";
import { ObservabilityBuilder } from "@microsoft/agents-a365-observability/dist/esm/ObservabilityBuilder";
import { AzureOpenAI } from "openai";
import { BaggageBuilder } from "@microsoft/agents-a365-observability";
import {
  validateInstrumentationScope,
  validateSpanProperties,
  validateMessageSchema,
  validateInputMessageContent,
  validateOutputMessageContent,
  validateParentChildRelationship,
  waitForSpans,
} from "./helpers/span-validators";

// Test instrumentation constants
const TEST_INSTRUMENTATION_NAME = "openai-agent-test-instrumentation";
const TEST_INSTRUMENTATION_VERSION = "1.0.0";

describe("OpenAI Trace Processor Integration Tests", () => {
  let openAIAgentsTraceInstrumentor: OpenAIAgentsTraceInstrumentor;
  let a365Observability: ObservabilityBuilder;
  let consoleDirSpy: jest.SpyInstance;
  let spans: ReadableSpan[] = [];

  beforeAll(async () => {
    validateEnvironment();
    console.log("Setting up OpenAI Trace Processor test suite...");

    // Also spy on console.dir which ConsoleSpanExporter uses
    consoleDirSpy = jest
      .spyOn(console, "dir")
      .mockImplementation((obj: any) => {
        spans.push(obj as ReadableSpan);
      });

    // Configure observability following the sample pattern
    a365Observability = ObservabilityManager.configure((builder: Builder) =>
      builder.withService("OpenAI Agent Instrumentation Sample", "1.0.0"),
    );

    // Initialize OpenAI Agents instrumentation
    openAIAgentsTraceInstrumentor = new OpenAIAgentsTraceInstrumentor({
      enabled: true,
      tracerName: TEST_INSTRUMENTATION_NAME,
      tracerVersion: TEST_INSTRUMENTATION_VERSION,
    });

    // Start observability
    a365Observability.start();
  });

  afterAll(async () => {
    console.log("🧹 Tearing down OpenAI Trace Processor test suite...");

    if (consoleDirSpy) {
      consoleDirSpy.mockRestore();
    }

    if (openAIAgentsTraceInstrumentor) {
      openAIAgentsTraceInstrumentor.disable();
    }

    if (a365Observability) {
      await a365Observability.shutdown();
    }

    console.log("✅ OpenAI Trace Processor test suite teardown complete");
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
      let agent: Agent;

      const azureClient = new AzureOpenAI({
        endpoint: azureConfig.endpoint,
        deployment: azureConfig.deployment,
        apiKey: azureConfig.apiKey,
        apiVersion: azureConfig.apiVersion,
      });

      agent = new Agent({
        name: "Test Agent",
        model: new OpenAIChatCompletionsModel(
          azureClient as any,
          azureConfig.deployment,
        ),
        instructions: "You are a helpful assistant.",
      });

      // Run agent with a simple prompt
      const prompt = "Say hello!";
      const result = await run(agent, prompt);

      // Wait for spans with timeout
      await waitForSpans(spans, 2);

      // Verify we captured spans
      expect(spans.length).toBeGreaterThanOrEqual(2);
      console.log("Total spans captured:", spans.length);

      // Output all the spans
      spans.forEach((span, idx) => {
        console.log(`\n--- Span ${idx + 1} of ${spans.length} ---`);
        console.log(JSON.stringify(span, null, 2));
      });

      // Find and validate the chat span
      const inferenceSpan = spans.find(
        (span) =>
          span.attributes[
            OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY
          ] === "chat",
      );
      expect(inferenceSpan).toBeDefined();
      expect(inferenceSpan?.name?.toLowerCase()).toContain("chat");
      console.log("Validate inference span");
      if (inferenceSpan) {
        validateInstrumentationScope(inferenceSpan, TEST_INSTRUMENTATION_NAME, TEST_INSTRUMENTATION_VERSION);
        validateSpanProperties(inferenceSpan);
        expect(inferenceSpan.kind).toBe(SpanKind.CLIENT);
        expect(inferenceSpan.name.toLowerCase()).toContain("chat");

        // Validate gen_ai attributes
        expect(
          inferenceSpan.attributes[
            OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY
          ],
        ).toBe("chat");
        expect(
          inferenceSpan.attributes[OpenTelemetryConstants.GEN_AI_PROVIDER_NAME_KEY],
        ).toBe("openai");
        expect(
          inferenceSpan.attributes[
            OpenTelemetryConstants.GEN_AI_REQUEST_MODEL_KEY
          ],
        ).toBe(azureConfig.deployment);
        expect(
          inferenceSpan.attributes[
            OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY
          ],
        ).toBeDefined();
        expect(
          inferenceSpan.attributes[
            OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY
          ],
        ).toContain(prompt);
        expect(
          inferenceSpan.attributes[
            OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY
          ],
        ).toBeDefined();
        expect(
          inferenceSpan.attributes[
            OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY
          ],
        ).toContain("chat.completion");

        // Validate A365 message schema
        validateMessageSchema(inferenceSpan);
        validateInputMessageContent(inferenceSpan, {
          hasRole: "user",
          hasPartType: "text",
          containsText: prompt,
        });
        validateOutputMessageContent(inferenceSpan, {
          hasRole: "assistant",
          hasPartType: "text",
        });

        // Detailed envelope + parts checks
        const parsedInput = JSON.parse(
          inferenceSpan.attributes[OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY] as string,
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
          inferenceSpan.attributes[OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY] as string,
        );
        expect(parsedOutput.version).toBe("0.1.0");
        const assistantMsg = parsedOutput.messages.find((m: any) => m.role === "assistant");
        expect(assistantMsg).toBeDefined();
        expect(Array.isArray(assistantMsg.parts)).toBe(true);
        expect(assistantMsg.parts[0].type).toBe("text");
        expect(typeof assistantMsg.parts[0].content).toBe("string");
        expect((assistantMsg.parts[0].content as string).length).toBeGreaterThan(0);

        // Token usage — our processor maps both Responses API (input_tokens/output_tokens)
        // and Chat Completions (prompt_tokens/completion_tokens) into schema-defined attrs.
        const inputTokens = inferenceSpan.attributes[OpenTelemetryConstants.GEN_AI_USAGE_INPUT_TOKENS_KEY];
        const outputTokens = inferenceSpan.attributes[OpenTelemetryConstants.GEN_AI_USAGE_OUTPUT_TOKENS_KEY];
        expect(typeof inputTokens).toBe("number");
        expect(typeof outputTokens).toBe("number");
        expect(inputTokens as number).toBeGreaterThan(0);
        expect(outputTokens as number).toBeGreaterThan(0);

        // Validate status
        expect(inferenceSpan.status).toBeDefined();
        expect(inferenceSpan.status.code).toBe(1);

        console.log("✅ Inference span validation passed");
      }

      // Verify the response
      expect(result.finalOutput).toBeDefined();
      console.log("✅ Agent response received");
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
      const azureClient = new AzureOpenAI({
        endpoint: azureConfig.endpoint,
        deployment: azureConfig.deployment,
        apiKey: azureConfig.apiKey,
        apiVersion: azureConfig.apiVersion,
      });

      const agentName = "Agent Span Test Agent";
      const agent = new Agent({
        name: agentName,
        model: new OpenAIChatCompletionsModel(
          azureClient as any,
          azureConfig.deployment,
        ),
        instructions: "You are a helpful assistant.",
      });

      const result = await run(agent, "Say hello!");
      await waitForSpans(spans, 2);

      // Find and validate the agent span only
      const agentSpan = spans.find(
        (span) => span.name === `invoke_agent ${agentName}`,
      );
      const generationSpan = spans.find(
        (span) => span.attributes[OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY] === "chat",
      );
      expect(agentSpan).toBeDefined();
      expect(generationSpan).toBeDefined();
      console.log("Validate agent span");

      validateInstrumentationScope(agentSpan!, TEST_INSTRUMENTATION_NAME, TEST_INSTRUMENTATION_VERSION);
      validateSpanProperties(agentSpan!);
      expect(agentSpan!.kind).toBe(SpanKind.SERVER);
      expect(agentSpan!.name).toBe(`invoke_agent ${agentName}`);
      expect(
        agentSpan!.attributes[OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY],
      ).toBe("invoke_agent");
      expect(
        agentSpan!.attributes[OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY],
      ).toBe(agentName);
      expect(
        agentSpan!.attributes[OpenTelemetryConstants.GEN_AI_PROVIDER_NAME_KEY],
      ).toBe("openai");
      // Top-level agent: no inbound caller
      expect(
        agentSpan!.attributes[OpenTelemetryConstants.GEN_AI_CALLER_AGENT_NAME_KEY],
      ).toBeUndefined();
      expect(
        agentSpan!.attributes[OpenTelemetryConstants.CUSTOM_PARENT_SPAN_ID_KEY],
      ).toBeUndefined();
      expect(agentSpan!.status).toBeDefined();
      expect(agentSpan!.status.code).toBe(1);

      // Validate parent-child relationship: generation span should reference agent span as custom parent
      validateParentChildRelationship(generationSpan!, agentSpan!);

      console.log("✅ Agent span validation passed");

      expect(result.finalOutput).toBeDefined();
      console.log("✅ Agent response received");
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
      const azureClient = new AzureOpenAI({
        endpoint: azureConfig.endpoint,
        deployment: azureConfig.deployment,
        apiKey: azureConfig.apiKey,
        apiVersion: azureConfig.apiVersion,
      });

      const addTool: any = tool({
        name: "add_numbers",
        description: "Add two numbers together",
        parameters: {
          type: "object",
          properties: {
            a: {
              type: "number",
              description: "The first number"
            },
            b: {
              type: "number",
              description: "The second number"
            }
          },
          required: ["a", "b"],
          additionalProperties: false
        } as any,
        execute: async ({ a, b }: { a: number; b: number }) => {
          const result = a + b;
          return `The sum of ${a} and ${b} is ${result}`;
        },
      });
      
      const agentName = "Math Agent";
      const agent = new Agent({
        name: "Math Agent",
        model: new OpenAIChatCompletionsModel(
          azureClient as any,
          process.env.AZURE_OPENAI_DEPLOYMENT!,
        ),
        instructions:
          "You are a helpful math assistant. When asked to add numbers, use the 'add_numbers' tool.",
        tools: [addTool],
      });
      const prompt = "What is 15 plus 27?";
      const result = await run(agent, prompt);

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
      const agentSpanForTool = spans.find(
        (span) => span.name === "invoke_agent Math Agent",
      );
      expect(toolSpan).toBeDefined();
      expect(agentSpanForTool).toBeDefined();
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
          toolSpan.attributes[OpenTelemetryConstants.GEN_AI_PROVIDER_NAME_KEY],
        ).toBe("openai");
        expect(
          toolSpan.attributes[OpenTelemetryConstants.GEN_AI_TOOL_NAME_KEY],
        ).toBe("add_numbers");
        expect(
          toolSpan.attributes[OpenTelemetryConstants.GEN_AI_TOOL_TYPE_KEY],
        ).toBe("function");
        expect(
          toolSpan.attributes[OpenTelemetryConstants.GEN_AI_TOOL_ARGS_KEY],
        ).toBe('{"a":15,"b":27}');
        expect(
          toolSpan.attributes[OpenTelemetryConstants.GEN_AI_TOOL_CALL_RESULT_KEY],
        ).toBe('{"result":"The sum of 15 and 27 is 42"}');

        // Validate status
        expect(toolSpan.status).toBeDefined();
        expect(toolSpan.status.code).toBe(1);

        // Validate parent-child relationship: tool span should reference agent span as custom parent
        validateParentChildRelationship(toolSpan, agentSpanForTool!);

        console.log("✅ Tool execution span validated");
      }

      // Verify the response
      expect(result.finalOutput).toBeDefined();
      console.log("✅ Agent response received");
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
      const azureClient = new AzureOpenAI({
        endpoint: azureConfig.endpoint,
        deployment: azureConfig.deployment,
        apiKey: azureConfig.apiKey,
        apiVersion: azureConfig.apiVersion,
      });

      const agentName = "Baggage Test Agent";
      const agent = new Agent({
        name: agentName,
        model: new OpenAIChatCompletionsModel(
          azureClient as any,
          azureConfig.deployment,
        ),
        instructions: "You are a helpful assistant.",
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
        return await run(agent, "Say hello!");
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

        console.log(`✅ Baggage validated on span: ${span.name}`);
      }

      expect(result.finalOutput).toBeDefined();
      console.log("✅ Baggage propagation test passed");
    } catch (error) {
      console.error("Test error:", error);
      throw error;
    }
  });

  it("validate handoff emits CLIENT InvokeAgent with caller + SERVER InvokeAgent for target", async () => {
    const azureConfig = getAzureOpenAIConfig();

    if (!azureConfig) {
      throw new Error("Azure OpenAI configuration is required");
    }

    try {
      const azureClient = new AzureOpenAI({
        endpoint: azureConfig.endpoint,
        deployment: azureConfig.deployment,
        apiKey: azureConfig.apiKey,
        apiVersion: azureConfig.apiVersion,
      });

      const billingAgent = new Agent({
        name: "BillingAgent",
        model: new OpenAIChatCompletionsModel(azureClient as any, azureConfig.deployment),
        instructions: "You handle billing-related questions. Respond briefly.",
      });

      const triageAgent = new Agent({
        name: "TriageAgent",
        model: new OpenAIChatCompletionsModel(azureClient as any, azureConfig.deployment),
        instructions:
          "For any question about billing, invoices, refunds, or payments, immediately hand off to BillingAgent. Do not answer directly.",
        handoffs: [billingAgent],
      });

      const prompt = "I was double-charged on my invoice last month — can I get a refund?";
      const result = await run(triageAgent, prompt);

      await waitForSpans(spans, 3);
      expect(spans.length).toBeGreaterThanOrEqual(3);

      spans.forEach((span, idx) => {
        console.log(`\n--- Span ${idx + 1} of ${spans.length} ---`);
        console.log(JSON.stringify({ name: span.name, kind: span.kind, attributes: span.attributes }, null, 2));
      });

      // CLIENT-kind InvokeAgent span emitted for the handoff itself
      const handoffSpan = spans.find(
        (s) =>
          s.kind === SpanKind.CLIENT &&
          s.attributes[OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY] === "invoke_agent" &&
          s.attributes[OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY] === "BillingAgent"
      );
      expect(handoffSpan).toBeDefined();
      if (handoffSpan) {
        expect(handoffSpan.attributes[OpenTelemetryConstants.GEN_AI_CALLER_AGENT_NAME_KEY]).toBe("TriageAgent");
        expect(handoffSpan.name).toBe("invoke_agent BillingAgent");
        console.log("✅ CLIENT-kind handoff InvokeAgent span validated");
      }

      // SERVER-kind InvokeAgent span emitted for BillingAgent's actual work
      const billingAgentSpan = spans.find(
        (s) =>
          s.kind === SpanKind.SERVER &&
          s.attributes[OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY] === "BillingAgent"
      );
      expect(billingAgentSpan).toBeDefined();
      if (billingAgentSpan) {
        expect(billingAgentSpan.attributes[OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY]).toBe("invoke_agent");
        expect(billingAgentSpan.attributes[OpenTelemetryConstants.GEN_AI_CALLER_AGENT_NAME_KEY]).toBe("TriageAgent");
        console.log("✅ SERVER-kind BillingAgent InvokeAgent span validated");
      }

      expect(result.finalOutput).toBeDefined();
      console.log("✅ Handoff span validation passed");
    } catch (error) {
      console.error("Test error:", error);
      throw error;
    }
  });

  it("validate error.type on failing tool", async () => {
    const azureConfig = getAzureOpenAIConfig();
    if (!azureConfig) throw new Error("Azure OpenAI configuration is required");

    const azureClient = new AzureOpenAI({
      endpoint: azureConfig.endpoint,
      deployment: azureConfig.deployment,
      apiKey: azureConfig.apiKey,
      apiVersion: azureConfig.apiVersion,
    });

    const throwingTool: any = tool({
      name: "will_throw",
      description: "Always fails",
      parameters: { type: "object", properties: {}, additionalProperties: false } as any,
      execute: async () => { throw new Error("simulated failure"); },
    });

    const agent = new Agent({
      name: "ErrorAgent",
      model: new OpenAIChatCompletionsModel(azureClient as any, azureConfig.deployment),
      instructions: "Call the will_throw tool exactly once.",
      tools: [throwingTool],
    });

    try {
      await run(agent, "Please call the will_throw tool.");
    } catch {
      // run may surface the tool failure; spans should still be emitted
    }

    await waitForSpans(spans, 2);

    // The failing tool should produce an execute_tool span with ERROR status + error.type attribute
    const errorSpan = spans.find(
      (s) => s.name === "execute_tool will_throw" && s.attributes[OpenTelemetryConstants.ERROR_TYPE_KEY],
    );
    expect(errorSpan).toBeDefined();
    const errorTypeValue = errorSpan?.attributes[OpenTelemetryConstants.ERROR_TYPE_KEY];
    expect(typeof errorTypeValue).toBe("string");
    expect((errorTypeValue as string).length).toBeGreaterThan(0);
    // The Agents SDK wraps tool failures — status code is ERROR, message describes tool failure
    expect(errorSpan?.status.code).toBe(2); // SpanStatusCode.ERROR
    expect(errorSpan?.status.message).toContain("tool");
    console.log(`✅ error.type validated: type="${errorTypeValue}", message="${errorSpan?.status.message}"`);
  });
});
