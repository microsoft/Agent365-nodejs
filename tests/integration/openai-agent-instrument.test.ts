// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import { getAzureOpenAIConfig, shouldSkipIntegrationTests, getSkipReason } from "./conftest";
import { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { z } from "zod";
import { ObservabilityManager, Builder, OpenTelemetryConstants } from "@microsoft/agents-a365-observability";
import { OpenAIAgentsTraceInstrumentor } from "@microsoft/agents-a365-observability-extensions-openai";
import { Agent, run, tool } from "@openai/agents";
import { OpenAIChatCompletionsModel } from "@openai/agents-openai";
import { ObservabilityBuilder } from "@microsoft/agents-a365-observability/dist/esm/ObservabilityBuilder";
import { AzureOpenAI } from "openai";

// Skip if environment not configured
const skipTests = shouldSkipIntegrationTests();

// Test instrumentation constants
const TEST_INSTRUMENTATION_NAME = "openai-agent-test-instrumentation";
const TEST_INSTRUMENTATION_VERSION = "1.0.0";

describe("OpenAI Trace Processor Integration Tests", () => {
  let openAIAgentsTraceInstrumentor: OpenAIAgentsTraceInstrumentor;
  let a365Observability: ObservabilityBuilder;
  let consoleDirSpy: jest.SpyInstance;
  let spans: ReadableSpan[] = [];

  beforeAll(async () => {
    if (skipTests) {
      console.warn(
        `⚠️  Skipping OpenAI Trace Processor tests: ${getSkipReason()}`,
      );
      return;
    }

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

    // Enable instrumentation
    openAIAgentsTraceInstrumentor.enable();
  });

  afterAll(async () => {
    if (skipTests) return;
    console.log("🧹 Tearing down OpenAI Trace Processor test suite...");

    // Restore console.log
    if (consoleDirSpy) {
      consoleDirSpy.mockRestore();
    }

    // Disable instrumentation
    if (openAIAgentsTraceInstrumentor) {
      openAIAgentsTraceInstrumentor.disable();
    }

    // Shutdown observability
    if (a365Observability) {
      await a365Observability.shutdown();
    }

    console.log("✅ OpenAI Trace Processor test suite teardown complete");
  });

  beforeEach(() => {
    if (skipTests) return;

    // Clear spans for each test
    spans = [];
  });

  it("validate agent span and generation span", async () => {
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

      const agentName = "Test Agent";
      agent = new Agent({
        name: agentName,
        model: new OpenAIChatCompletionsModel(
          azureClient,
          azureConfig.deployment,
        ),
        instructions: "You are a helpful assistant.",
      });

      // Run agent with a simple prompt
      const prompt = "Say hello!";
      const result = await run(agent, prompt);

      // Wait for spans with timeout (poll until length >= 2 or timeout after 5s)
      const startTime = Date.now();
      const timeout = 5000;
      while (spans.length < 2 && Date.now() - startTime < timeout) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Verify we captured spans
      expect(spans.length).toBeGreaterThanOrEqual(2);
      console.log("Total spans captured:", spans.length);

      // Output all the spans
      spans.forEach((span, idx) => {
        console.log(`\n--- Span ${idx + 1} of ${spans.length} ---`);
        console.log(JSON.stringify(span, null, 2));
      });

      // Find the generation span
      const generationSpan = spans.find((span) => span.name === "generation");
      expect(generationSpan).toBeDefined();
      console.log("Validate generation span");
      if (generationSpan) {
        validateInstrumentationScope(generationSpan);
        validateSpanProperties(generationSpan);

        // Validate gen_ai attributes
        expect(
          generationSpan.attributes[
            OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY
          ],
        ).toBe("chat");
        expect(
          generationSpan.attributes[OpenTelemetryConstants.GEN_AI_SYSTEM_KEY],
        ).toBe("openai");
        expect(
          generationSpan.attributes[
            OpenTelemetryConstants.GEN_AI_PROVIDER_NAME_KEY
          ],
        ).toBe("openai");
        expect(
          generationSpan.attributes[
            OpenTelemetryConstants.GEN_AI_REQUEST_MODEL_KEY
          ],
        ).toBe(azureConfig.deployment);
        expect(
          generationSpan.attributes[
            OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY
          ],
        ).toBeDefined();
        expect(
          generationSpan.attributes[
            OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY
          ],
        ).toContain(prompt);
        expect(
          generationSpan.attributes[
            OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY
          ],
        ).toBeDefined();
        expect(
          generationSpan.attributes[
            OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY
          ],
        ).toContain("chat.completion");

        // Validate status
        expect(generationSpan.status).toBeDefined();
        expect(generationSpan.status.code).toBe(1);

        console.log("✅ Generation span validation passed");
      }

      // Find and validate the agent span
      const agentSpan = spans.find(
        (span) => span.name === `invoke_agent ${agentName}`,
      );
      expect(agentSpan).toBeDefined();
      console.log("Validate agent span");

      if (agentSpan) {
        validateInstrumentationScope(agentSpan);
        validateSpanProperties(agentSpan);

        // Validate agent-specific attributes
        expect(
          agentSpan.attributes[
            OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY
          ],
        ).toBe("invoke_agent");
        expect(
          agentSpan.attributes[OpenTelemetryConstants.GEN_AI_SYSTEM_KEY],
        ).toBe("openai");
        expect(
          agentSpan?.attributes[
            OpenTelemetryConstants.CUSTOM_PARENT_SPAN_ID_KEY
          ],
        ).toBeUndefined();

        validateParentChildRelationship(generationSpan!, agentSpan);

        // Validate status
        expect(agentSpan.status).toBeDefined();
        expect(agentSpan.status.code).toBe(1);

        console.log("✅ Agent span validation passed");
      }

      console.log("✅ All span structure validation passed");

      // Verify the response
      expect(result.finalOutput).toBeDefined();
      console.log("✅ Agent response received");
    } catch (error) {
      console.error("Test error:", error);
      throw error;
    }
  });

  it("Validate execution spans", async () => {
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

      const addTool = tool({
        name: "add_numbers",
        description: "Add two numbers together",
        parameters: z.object({
          a: z.number().describe("The first number"),
          b: z.number().describe("The second number"),
        }),
        execute: async ({ a, b }) => {
          const result = a + b;
          return `The sum of ${a} and ${b} is ${result}`;
        },
      });

      const agentName = "Math Agent";
      const agent = new Agent({
        name: "Math Agent",
        model: new OpenAIChatCompletionsModel(
          azureClient,
          process.env.AZURE_OPENAI_DEPLOYMENT!,
        ),
        instructions:
          "You are a helpful math assistant. When asked to add numbers, use the 'add_numbers' tool.",
        tools: [addTool],
      });
      const prompt = "What is 15 plus 27?";
      const result = await run(agent, prompt);

      const startTime = Date.now();
      const timeout = 5000;
      while (spans.length < 3 && Date.now() - startTime < timeout) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Verify we captured spans
      expect(spans.length).toBeGreaterThanOrEqual(3);
      console.log("Total spans captured:", spans.length);

      // Output all the spans
      spans.forEach((span, idx) => {
        console.log(`\n--- Span ${idx + 1} of ${spans.length} ---`);
        console.log(JSON.stringify(span, null, 2));
      });

      // Find and validate the agent span
      const agentSpan = spans.find(
        (span) => span.name === `invoke_agent ${agentName}`,
      );
      expect(agentSpan).toBeDefined();

      if (agentSpan) {
        validateInstrumentationScope(agentSpan);
        expect(
          agentSpan.attributes[
            OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY
          ],
        ).toBe("invoke_agent");
        expect(
          agentSpan.attributes[OpenTelemetryConstants.GEN_AI_SYSTEM_KEY],
        ).toBe("openai");
        console.log("✅ Agent span validated");
      }

      // Find and validate the generation span
      const generationSpan = spans.find((span) => span.name === "generation");
      expect(generationSpan).toBeDefined();

      // Find and validate the tool execution span
      const toolSpan = spans.find(
        (span) => span.name === "execute_tool add_numbers",
      );
      expect(toolSpan).toBeDefined();
      console.log("Validate tool execution span");

      if (toolSpan) {
        validateInstrumentationScope(toolSpan);
        validateSpanProperties(toolSpan);

        // Validate tool-specific attributes
        expect(
          toolSpan.attributes[OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY],
        ).toBe("execute_tool");
        expect(
          toolSpan.attributes[OpenTelemetryConstants.GEN_AI_SYSTEM_KEY],
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
          toolSpan.attributes[OpenTelemetryConstants.GEN_AI_EVENT_CONTENT],
        ).toBe("The sum of 15 and 27 is 42");

        validateParentChildRelationship(toolSpan, agentSpan!);

        // Validate status
        expect(toolSpan.status).toBeDefined();
        expect(toolSpan.status.code).toBe(1);

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

  /**
   * Validate instrumentation scope for a span
   */
  function validateInstrumentationScope(span: ReadableSpan): void {
    expect(span.instrumentationScope).toBeDefined();
    expect(span.instrumentationScope.name).toBe(TEST_INSTRUMENTATION_NAME);
    expect(span.instrumentationScope.version).toBe(
      TEST_INSTRUMENTATION_VERSION,
    );
  }

  /**
   * Validate basic span properties (traceId, id, timestamp)
   */
  function validateSpanProperties(span: ReadableSpan): void {
    expect((span as any).traceId).toBeDefined();
    expect((span as any).id).toBeDefined();
    expect((span as any).timestamp).toBeDefined();
  }

  /**
   * Validate parent-child span relationship
   */
  function validateParentChildRelationship(
    childSpan: ReadableSpan,
    parentSpan: ReadableSpan,
  ): void {
    expect(
      childSpan.attributes[OpenTelemetryConstants.CUSTOM_PARENT_SPAN_ID_KEY],
    ).toBe(`0x${(parentSpan as any).id}`);
  }
});
