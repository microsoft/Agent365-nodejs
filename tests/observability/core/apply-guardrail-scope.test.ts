// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import { trace, SpanKind } from '@opentelemetry/api';

import {
  ApplyGuardrailScope,
  AgentDetails,
  OpenTelemetryConstants,
  GuardrailDecisionType,
  GuardrailDetails,
  GuardrailRiskSeverity,
  GuardrailTargetType,
} from '@microsoft/agents-a365-observability';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace-base';

let sharedExporter: InMemorySpanExporter;

const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
beforeAll(() => {
  sharedExporter = new InMemorySpanExporter();
  const processor = new SimpleSpanProcessor(sharedExporter);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globalProvider: any = trace.getTracerProvider();
  if (globalProvider && typeof globalProvider.addSpanProcessor === 'function') {
    globalProvider.addSpanProcessor(processor);
  } else {
    const provider = new BasicTracerProvider({
      spanProcessors: [processor],
    });
    trace.setGlobalTracerProvider(provider);
  }

  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});

describe('ApplyGuardrailScope', () => {
  const testAgentDetails: AgentDetails = {
    agentId: 'guardrail-agent',
    agentName: 'Guardrail Agent',
    agentDescription: 'Agent for guardrail testing',
    tenantId: 'test-tenant-456',
  };

  afterEach(() => {
    sharedExporter.reset();
  });

  const getFinishedSpan = (): ReadableSpan => {
    const spans = sharedExporter.getFinishedSpans();
    expect(spans.length).toBeGreaterThanOrEqual(1);
    return spans[spans.length - 1];
  };

  it('should use SpanKind.INTERNAL and build span name with guardian name', () => {
    const scope = ApplyGuardrailScope.start(
      { targetType: GuardrailTargetType.LlmInput, decisionType: GuardrailDecisionType.Allow, guardianName: 'Content Safety' },
      testAgentDetails,
    );
    scope.dispose();

    const span = getFinishedSpan();
    expect(span.kind).toBe(SpanKind.INTERNAL);
    expect(span.name).toBe('apply_guardrail Content Safety llm_input');
  });

  it('should omit guardian name from span name when not provided', () => {
    const scope = ApplyGuardrailScope.start(
      { targetType: GuardrailTargetType.LlmOutput, decisionType: GuardrailDecisionType.Deny },
      testAgentDetails,
    );
    scope.dispose();

    expect(getFinishedSpan().name).toBe('apply_guardrail llm_output');
  });

  it('should allow spanKind override via spanDetails', () => {
    const scope = ApplyGuardrailScope.start(
      { targetType: GuardrailTargetType.LlmInput, decisionType: GuardrailDecisionType.Allow },
      testAgentDetails,
      undefined,
      undefined,
      { spanKind: SpanKind.CLIENT },
    );
    scope.dispose();

    expect(getFinishedSpan().kind).toBe(SpanKind.CLIENT);
  });

  it('should throw when agentDetails.tenantId is missing', () => {
    expect(() => ApplyGuardrailScope.start(
      { targetType: GuardrailTargetType.LlmInput, decisionType: GuardrailDecisionType.Allow },
      { agentId: 'a' } as any,
    )).toThrow('ApplyGuardrailScope: tenantId is required on agentDetails');
  });

  it('should accept custom targetType strings', () => {
    const scope = ApplyGuardrailScope.start(
      { targetType: 'custom_target', decisionType: GuardrailDecisionType.Allow },
      testAgentDetails,
    );
    scope.dispose();

    expect(getFinishedSpan().attributes[OpenTelemetryConstants.SECURITY_TARGET_TYPE_KEY]).toBe('custom_target');
  });

  it('should record contentModified=false without being swallowed by null-check', () => {
    const scope = ApplyGuardrailScope.start(
      { targetType: GuardrailTargetType.LlmInput, decisionType: GuardrailDecisionType.Deny, contentModified: false },
      testAgentDetails,
    );
    scope.dispose();

    expect(getFinishedSpan().attributes[OpenTelemetryConstants.SECURITY_CONTENT_MODIFIED_KEY]).toBe(false);
  });

  it('recordDecision should overwrite decision type and set reason', () => {
    const scope = ApplyGuardrailScope.start(
      { targetType: GuardrailTargetType.LlmInput, decisionType: GuardrailDecisionType.Allow },
      testAgentDetails,
    );
    scope.recordDecision(GuardrailDecisionType.Deny, 'Prompt injection detected');
    scope.dispose();

    const attrs = getFinishedSpan().attributes;
    expect(attrs[OpenTelemetryConstants.SECURITY_DECISION_TYPE_KEY]).toBe('deny');
    expect(attrs[OpenTelemetryConstants.SECURITY_DECISION_REASON_KEY]).toBe('Prompt injection detected');
  });

  it('recordContentOutput should set output value attribute', () => {
    const scope = ApplyGuardrailScope.start(
      { targetType: GuardrailTargetType.LlmOutput, decisionType: GuardrailDecisionType.Modify },
      testAgentDetails,
    );
    scope.recordContentOutput('Redacted content');
    scope.dispose();

    expect(getFinishedSpan().attributes[OpenTelemetryConstants.SECURITY_CONTENT_OUTPUT_VALUE_KEY]).toBe('Redacted content');
  });

  it('recordFinding should emit event with all finding attributes', () => {
    const scope = ApplyGuardrailScope.start(
      { targetType: GuardrailTargetType.LlmInput, decisionType: GuardrailDecisionType.Deny },
      testAgentDetails,
    );
    scope.recordFinding({
      riskCategory: 'sensitive_info_disclosure',
      riskSeverity: GuardrailRiskSeverity.High,
      policyDecisionType: 'deny',
      policyId: 'policy_pii_v2',
      policyName: 'PII Policy',
      policyVersion: '2.0',
      riskScore: 0.92,
      riskMetadata: ['pattern:ssn', 'count:2'],
    });
    scope.dispose();

    const span = getFinishedSpan();
    expect(span.events).toHaveLength(1);
    const evt = span.events[0];
    expect(evt.name).toBe(OpenTelemetryConstants.SECURITY_FINDING_EVENT_NAME);
    expect(evt.attributes?.[OpenTelemetryConstants.SECURITY_RISK_CATEGORY_KEY]).toBe('sensitive_info_disclosure');
    expect(evt.attributes?.[OpenTelemetryConstants.SECURITY_RISK_SEVERITY_KEY]).toBe('high');
    expect(evt.attributes?.[OpenTelemetryConstants.SECURITY_POLICY_DECISION_TYPE_KEY]).toBe('deny');
    expect(evt.attributes?.[OpenTelemetryConstants.SECURITY_POLICY_ID_KEY]).toBe('policy_pii_v2');
    expect(evt.attributes?.[OpenTelemetryConstants.SECURITY_POLICY_NAME_KEY]).toBe('PII Policy');
    expect(evt.attributes?.[OpenTelemetryConstants.SECURITY_POLICY_VERSION_KEY]).toBe('2.0');
    expect(evt.attributes?.[OpenTelemetryConstants.SECURITY_RISK_SCORE_KEY]).toBe(0.92);
    expect(evt.attributes?.[OpenTelemetryConstants.SECURITY_RISK_METADATA_KEY]).toEqual(['pattern:ssn', 'count:2']);
  });

  it('recordFinding should support multiple events per span', () => {
    const scope = ApplyGuardrailScope.start(
      { targetType: GuardrailTargetType.LlmOutput, decisionType: GuardrailDecisionType.Modify },
      testAgentDetails,
    );
    scope.recordFinding({ riskCategory: 'pii', riskSeverity: GuardrailRiskSeverity.Medium });
    scope.recordFinding({ riskCategory: 'toxicity', riskSeverity: GuardrailRiskSeverity.Low });
    scope.dispose();

    expect(getFinishedSpan().events).toHaveLength(2);
  });

  it('recordFinding should throw when finding is null', () => {
    const scope = ApplyGuardrailScope.start(
      { targetType: GuardrailTargetType.LlmInput, decisionType: GuardrailDecisionType.Allow },
      testAgentDetails,
    );
    expect(() => scope.recordFinding(null as any)).toThrow('finding is required');
    scope.dispose();
  });

  it('recordError should set error status on the span', () => {
    const scope = ApplyGuardrailScope.start(
      { targetType: GuardrailTargetType.LlmInput, decisionType: GuardrailDecisionType.Allow },
      testAgentDetails,
    );
    scope.recordError(new Error('Guardian service unavailable'));
    scope.dispose();

    const span = getFinishedSpan();
    expect(span.status.code).toBe(2); // SpanStatusCode.ERROR
    expect(span.status.message).toBe('Guardian service unavailable');
  });

  it('should record all guardrail, agent, user, channel, and finding data in a single span', () => {
    const guardrailDetails: GuardrailDetails = {
      targetType: GuardrailTargetType.LlmInput,
      decisionType: GuardrailDecisionType.Deny,
      guardianId: 'azure-content-safety-001',
      guardianName: 'Azure Content Safety',
      guardianProviderName: 'Azure',
      guardianVersion: '2.0.0',
      targetId: 'msg-12345',
      decisionReason: 'Content violates hate speech policy',
      decisionCode: 'HATE_SPEECH_001',
      policyId: 'policy-abc',
      policyName: 'Content Safety Policy',
      policyVersion: '1.2.0',
      contentInputHash: 'sha256:abc123def456',
      contentModified: false,
      externalEventId: 'ext-event-789',
    };

    const scope = ApplyGuardrailScope.start(
      guardrailDetails,
      testAgentDetails,
      { conversationId: 'conv-1', channel: { name: 'msteams', description: 'https://channel.link' } },
      { userId: 'user-1', userName: 'User One', userEmail: 'u1@test.com', callerClientIp: '10.0.0.1' },
    );
    scope.recordContentOutput('sanitized-output');
    scope.recordFinding({
      riskCategory: 'hate_speech',
      riskSeverity: GuardrailRiskSeverity.High,
      policyDecisionType: 'deny',
      policyId: 'policy-abc',
      riskScore: 0.95,
    });
    scope.dispose();

    const span = getFinishedSpan();
    const a = span.attributes;

    // Span metadata
    expect(span.name).toBe('apply_guardrail Azure Content Safety llm_input');
    expect(a[OpenTelemetryConstants.GEN_AI_OPERATION_NAME_KEY]).toBe('apply_guardrail');

    // Agent
    expect(a[OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]).toBe('guardrail-agent');
    expect(a[OpenTelemetryConstants.GEN_AI_AGENT_NAME_KEY]).toBe('Guardrail Agent');
    expect(a[OpenTelemetryConstants.TENANT_ID_KEY]).toBe('test-tenant-456');

    // Guardian
    expect(a[OpenTelemetryConstants.GUARDIAN_ID_KEY]).toBe('azure-content-safety-001');
    expect(a[OpenTelemetryConstants.GUARDIAN_NAME_KEY]).toBe('Azure Content Safety');
    expect(a[OpenTelemetryConstants.GUARDIAN_PROVIDER_NAME_KEY]).toBe('Azure');
    expect(a[OpenTelemetryConstants.GUARDIAN_VERSION_KEY]).toBe('2.0.0');

    // Decision
    expect(a[OpenTelemetryConstants.SECURITY_DECISION_TYPE_KEY]).toBe('deny');
    expect(a[OpenTelemetryConstants.SECURITY_TARGET_TYPE_KEY]).toBe('llm_input');
    expect(a[OpenTelemetryConstants.SECURITY_TARGET_ID_KEY]).toBe('msg-12345');
    expect(a[OpenTelemetryConstants.SECURITY_DECISION_REASON_KEY]).toBe('Content violates hate speech policy');
    expect(a[OpenTelemetryConstants.SECURITY_DECISION_CODE_KEY]).toBe('HATE_SPEECH_001');

    // Policy
    expect(a[OpenTelemetryConstants.SECURITY_POLICY_ID_KEY]).toBe('policy-abc');
    expect(a[OpenTelemetryConstants.SECURITY_POLICY_NAME_KEY]).toBe('Content Safety Policy');
    expect(a[OpenTelemetryConstants.SECURITY_POLICY_VERSION_KEY]).toBe('1.2.0');

    // Content
    expect(a[OpenTelemetryConstants.SECURITY_CONTENT_INPUT_HASH_KEY]).toBe('sha256:abc123def456');
    expect(a[OpenTelemetryConstants.SECURITY_CONTENT_MODIFIED_KEY]).toBe(false);
    expect(a[OpenTelemetryConstants.SECURITY_CONTENT_OUTPUT_VALUE_KEY]).toBe('sanitized-output');
    expect(a[OpenTelemetryConstants.SECURITY_EXTERNAL_EVENT_ID_KEY]).toBe('ext-event-789');

    // User
    expect(a[OpenTelemetryConstants.USER_ID_KEY]).toBe('user-1');
    expect(a[OpenTelemetryConstants.USER_NAME_KEY]).toBe('User One');
    expect(a[OpenTelemetryConstants.USER_EMAIL_KEY]).toBe('u1@test.com');
    expect(a[OpenTelemetryConstants.GEN_AI_CALLER_CLIENT_IP_KEY]).toBe('10.0.0.1');

    // Channel / conversation
    expect(a[OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY]).toBe('conv-1');
    expect(a[OpenTelemetryConstants.CHANNEL_NAME_KEY]).toBe('msteams');
    expect(a[OpenTelemetryConstants.CHANNEL_LINK_KEY]).toBe('https://channel.link');

    // Finding event
    expect(span.events).toHaveLength(1);
    const evt = span.events[0];
    expect(evt.name).toBe('microsoft.security.finding');
    expect(evt.attributes?.[OpenTelemetryConstants.SECURITY_RISK_CATEGORY_KEY]).toBe('hate_speech');
    expect(evt.attributes?.[OpenTelemetryConstants.SECURITY_RISK_SEVERITY_KEY]).toBe('high');
    expect(evt.attributes?.[OpenTelemetryConstants.SECURITY_RISK_SCORE_KEY]).toBe(0.95);
  });
});
