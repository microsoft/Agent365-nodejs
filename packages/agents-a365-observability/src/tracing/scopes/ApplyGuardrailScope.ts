// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { SpanKind } from '@opentelemetry/api';
import { OpenTelemetryScope } from './OpenTelemetryScope';
import { OpenTelemetryConstants } from '../constants';
import {
  GuardrailDetails,
  GuardrailDecisionType,
  GuardrailFinding,
  AgentDetails,
  UserDetails,
  Request,
  SpanDetails,
} from '../contracts';

/**
 * Provides OpenTelemetry tracing scope for security guardrail evaluation operations.
 *
 * Describes a security guardian evaluation. Multiple guardian spans MAY exist under a single
 * operation span if multiple guardians are chained.
 *
 * Guardian spans SHOULD be children of the operation span they are protecting
 * (e.g., inference or execute_tool spans).
 */
export class ApplyGuardrailScope extends OpenTelemetryScope {
  /**
   * Creates and starts a new scope for guardrail evaluation tracing.
   *
   * @param details Details of the guardrail evaluation (target, decision, guardian info, policy).
   * @param agentDetails Information about the agent being guarded.
   * @param request Optional request details for conversation context.
   * @param userDetails Optional human user details.
   * @param spanDetails Optional span configuration (parent context, timing, kind, span links).
   * @returns A new ApplyGuardrailScope instance.
   */
  public static start(
    details: GuardrailDetails,
    agentDetails: AgentDetails,
    request?: Request,
    userDetails?: UserDetails,
    spanDetails?: SpanDetails,
  ): ApplyGuardrailScope {
    return new ApplyGuardrailScope(details, agentDetails, request, userDetails, spanDetails);
  }

  private constructor(
    details: GuardrailDetails,
    agentDetails: AgentDetails,
    request?: Request,
    userDetails?: UserDetails,
    spanDetails?: SpanDetails,
  ) {
    // Validate tenantId is present (required for telemetry)
    if (!agentDetails.tenantId) {
      throw new Error('ApplyGuardrailScope: tenantId is required on agentDetails');
    }

    // Default to INTERNAL; allow caller override via spanDetails
    const resolvedSpanDetails: SpanDetails = { spanKind: SpanKind.INTERNAL, ...spanDetails };

    const spanName = details.guardianName
      ? `${OpenTelemetryConstants.APPLY_GUARDRAIL_OPERATION_NAME} ${details.guardianName} ${details.targetType}`
      : `${OpenTelemetryConstants.APPLY_GUARDRAIL_OPERATION_NAME} ${details.targetType}`;

    super(
      OpenTelemetryConstants.APPLY_GUARDRAIL_OPERATION_NAME,
      spanName,
      agentDetails,
      resolvedSpanDetails,
      userDetails,
    );

    // Required attributes
    this.setTagMaybe(OpenTelemetryConstants.SECURITY_DECISION_TYPE_KEY, details.decisionType);
    this.setTagMaybe(OpenTelemetryConstants.SECURITY_TARGET_TYPE_KEY, details.targetType);

    // Guardian attributes
    this.setTagMaybe(OpenTelemetryConstants.GUARDIAN_ID_KEY, details.guardianId);
    this.setTagMaybe(OpenTelemetryConstants.GUARDIAN_NAME_KEY, details.guardianName);
    this.setTagMaybe(OpenTelemetryConstants.GUARDIAN_PROVIDER_NAME_KEY, details.guardianProviderName);
    this.setTagMaybe(OpenTelemetryConstants.GUARDIAN_VERSION_KEY, details.guardianVersion);

    // Target attributes
    this.setTagMaybe(OpenTelemetryConstants.SECURITY_TARGET_ID_KEY, details.targetId);

    // Decision attributes
    this.setTagMaybe(OpenTelemetryConstants.SECURITY_DECISION_REASON_KEY, details.decisionReason);
    this.setTagMaybe(OpenTelemetryConstants.SECURITY_DECISION_CODE_KEY, details.decisionCode);

    // Policy attributes
    this.setTagMaybe(OpenTelemetryConstants.SECURITY_POLICY_ID_KEY, details.policyId);
    this.setTagMaybe(OpenTelemetryConstants.SECURITY_POLICY_NAME_KEY, details.policyName);
    this.setTagMaybe(OpenTelemetryConstants.SECURITY_POLICY_VERSION_KEY, details.policyVersion);

    // Content attributes
    this.setTagMaybe(OpenTelemetryConstants.SECURITY_CONTENT_INPUT_HASH_KEY, details.contentInputHash);
    if (details.contentModified != null) {
      this.setTagMaybe(OpenTelemetryConstants.SECURITY_CONTENT_MODIFIED_KEY, details.contentModified);
    }

    // Correlation attributes
    this.setTagMaybe(OpenTelemetryConstants.SECURITY_EXTERNAL_EVENT_ID_KEY, details.externalEventId);

    // Request context
    if (request) {
      if (typeof request.content === 'string') {
        this.setTagMaybe(OpenTelemetryConstants.SECURITY_CONTENT_INPUT_VALUE_KEY, request.content);
      }
      this.setTagMaybe(OpenTelemetryConstants.GEN_AI_CONVERSATION_ID_KEY, request.conversationId);
      if (request.channel) {
        this.setTagMaybe(OpenTelemetryConstants.CHANNEL_NAME_KEY, request.channel.name);
        this.setTagMaybe(OpenTelemetryConstants.CHANNEL_LINK_KEY, request.channel.description);
      }
    }
  }

  /**
   * Records an updated decision on the guardrail span.
   * Use this when the guardrail decision is determined after span creation.
   * @param decisionType The decision type made by the guardian.
   * @param reason Optional human-readable explanation for the decision.
   */
  public recordDecision(decisionType: GuardrailDecisionType, reason?: string): void {
    this.setTagMaybe(OpenTelemetryConstants.SECURITY_DECISION_TYPE_KEY, decisionType);
    this.setTagMaybe(OpenTelemetryConstants.SECURITY_DECISION_REASON_KEY, reason);
  }

  /**
   * Records the output content value for the guardrail evaluation (opt-in).
   * @param outputValue The output content after guardrail processing.
   */
  public recordContentOutput(outputValue: string): void {
    this.setTagMaybe(OpenTelemetryConstants.SECURITY_CONTENT_OUTPUT_VALUE_KEY, outputValue);
  }

  /**
   * Records a security finding event on the current span.
   * Multiple findings may be recorded per guardrail evaluation.
   * @param finding The security finding to record.
   */
  public recordFinding(finding: GuardrailFinding): void {
    if (!finding) {
      throw new Error('ApplyGuardrailScope.recordFinding: finding is required');
    }

    const attributes: Record<string, string | number | string[]> = {
      [OpenTelemetryConstants.SECURITY_RISK_CATEGORY_KEY]: finding.riskCategory,
      [OpenTelemetryConstants.SECURITY_RISK_SEVERITY_KEY]: finding.riskSeverity,
    };

    if (finding.policyDecisionType != null) {
      attributes[OpenTelemetryConstants.SECURITY_POLICY_DECISION_TYPE_KEY] = finding.policyDecisionType;
    }
    if (finding.policyId != null) {
      attributes[OpenTelemetryConstants.SECURITY_POLICY_ID_KEY] = finding.policyId;
    }
    if (finding.policyName != null) {
      attributes[OpenTelemetryConstants.SECURITY_POLICY_NAME_KEY] = finding.policyName;
    }
    if (finding.policyVersion != null) {
      attributes[OpenTelemetryConstants.SECURITY_POLICY_VERSION_KEY] = finding.policyVersion;
    }
    if (finding.riskScore != null) {
      attributes[OpenTelemetryConstants.SECURITY_RISK_SCORE_KEY] = finding.riskScore;
    }
    if (finding.riskMetadata != null) {
      attributes[OpenTelemetryConstants.SECURITY_RISK_METADATA_KEY] = finding.riskMetadata;
    }

    this.addEvent(OpenTelemetryConstants.SECURITY_FINDING_EVENT_NAME, attributes);
  }
}
