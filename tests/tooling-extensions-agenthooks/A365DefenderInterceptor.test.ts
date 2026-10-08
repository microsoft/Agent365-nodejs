// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { AgentContextBuilder, Interceptor, proceeds } from '@responsibleai/agent-hooks';
import { DefaultConfigurationProvider } from '@microsoft/agents-a365-runtime';
import {
  DefenderRtpClient,
  DefenderRtpEvaluationResult,
  ToolingConfiguration,
  ToolingConfigurationOptions,
} from '@microsoft/agents-a365-tooling';
import {
  A365DefenderInterceptor,
  addA365Defender,
  createProtectionEmitter,
} from '../../packages/agents-a365-tooling-extensions-agenthooks/src';
import {
  AGENT_ID,
  DEFENDER_ENVIRONMENT_VARIABLES,
  ENDPOINT,
  TENANT_ID,
  contractErrors,
  createToken,
  fakeEndpoint,
  json,
  waitForAbort,
} from '../tooling/fixtures/defender';

/* eslint-disable @typescript-eslint/no-explicit-any */

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  for (const name of DEFENDER_ENVIRONMENT_VARIABLES) delete process.env[name];
});

afterEach(() => {
  process.env = originalEnv;
});

interface HarnessOptions {
  failClosed?: boolean;
  agentId?: string;
  resolveNothing?: boolean;
  configuration?: ToolingConfigurationOptions;
  resolveCall?: () => never;
  onEvaluated?: (result: DefenderRtpEvaluationResult) => void;
}

/** The Defender interceptor under the real agent-hooks emitter, against a fake prevention endpoint. */
function harness(
  respond: (body: Record<string, any>, init: RequestInit) => Response | Promise<Response>,
  options: HarnessOptions = {},
) {
  const endpoint = fakeEndpoint(respond);
  const configProvider = new DefaultConfigurationProvider(() => new ToolingConfiguration({
    isDefenderRtpEnabled: () => true,
    defenderRtpEndpoint: () => ENDPOINT,
    defenderRtpFailClosed: () => options.failClosed ?? false,
    ...options.configuration,
  }));
  const client = new DefenderRtpClient({ configProvider, fetchImplementation: endpoint.fetch });
  const agent = { agentId: options.agentId ?? AGENT_ID, tenantId: TENANT_ID, userId: 'user-object-id' };
  const evaluations: DefenderRtpEvaluationResult[] = [];
  let resolved = 0;
  const emitter = addA365Defender(
    createProtectionEmitter({ configProvider }),
    new A365DefenderInterceptor(
      client,
      options.resolveCall ?? (() => {
        resolved += 1;
        return options.resolveNothing ? null : { agent, tokenResolver: async () => createToken() };
      }),
      options.onEvaluated ?? ((result) => evaluations.push(result)),
    ),
  );
  return { emitter, calls: endpoint.calls, evaluations, resolvedCount: () => resolved };
}

const builder = (sessionId: string, agentName?: string): AgentContextBuilder =>
  new AgentContextBuilder({ agentId: AGENT_ID, framework: 'agent-framework', sessionId, agentName });

describe('A365DefenderInterceptor under the agent-hooks emitter', () => {
  it('forwards the emitted context and allows', async () => {
    const { emitter, calls, evaluations } = harness(() => json({ decision: 'allow' }));

    const record = await emitter.emitUnchecked(builder('conversation:activity', 'SampleAgent').input('Find flights to Paris'));

    expect(proceeds(record)).toBe(true);
    expect(record.verdict.decision).toBe('allow');
    expect(record.composition.profile).toBe('parallel/strictest');
    expect(record.mode).toBe('enforce');
    expect(record.verdicts?.[0]?.name).toBe('defender');
    expect(calls).toHaveLength(1);
    const body = calls[0].body;
    expect(contractErrors(body)).toEqual([]);
    expect(body.spec).toBe('agent-hooks/0.1');
    expect(body.interception_point).toBe('input');
    expect(body.agent).toEqual({ id: AGENT_ID, framework: 'agent-framework', name: 'SampleAgent' });
    expect(body.session).toEqual({ id: 'conversation:activity' });
    expect(body.tenant).toEqual({ id: TENANT_ID });
    expect(body.actor).toEqual({ id: 'user-object-id', kind: 'human' });
    expect(body.sequence).toBe(record.sequence);
    expect(body.target).toEqual(body.input);
    expect(evaluations).toHaveLength(1);
    expect(evaluations[0].correlationId).toBe(calls[0].correlationId);
  });

  it('blocks a tool call Defender denies', async () => {
    const { emitter, calls } = harness((body) => body.interception_point === 'pre_tool_call'
      ? json({ decision: 'deny', reason: 'prevention_blocked', message: 'Known malicious URL.', result_labels: ['MaliciousUrl'] })
      : json({ decision: 'allow' }));

    const record = await emitter.emitUnchecked(
      builder('s-1').preToolCall('call-1', 'FetchTravelAdvisory', { url: 'https://malicious.example.test' }),
    );

    expect(proceeds(record)).toBe(false);
    expect(record.verdict.decision).toBe('deny');
    expect(record.verdict.reason).toBe('defender:block:prevention_blocked');
    expect(record.verdict.message).toBe('Known malicious URL.');
    expect(record.decided_by).toBe(0);
    const body = calls[0].body;
    expect(contractErrors(body)).toEqual([]);
    expect(body.tool_call).toEqual({ id: 'call-1', name: 'FetchTravelAdvisory', args: { url: 'https://malicious.example.test' } });
    expect(body.target).toEqual(body.tool_call.args);
  });

  it('keeps Defender\'s warnings and labels on an allowed action', async () => {
    const { emitter } = harness(() => json({
      decision: 'allow',
      warnings: [{ reason: 'prevention_annotated', message: 'Potential threat detected.' }],
      result_labels: ['MaliciousContentPropagation'],
    }));

    const record = await emitter.emitUnchecked(
      builder('s-1').preToolCall('call-1', 'FetchTravelAdvisory', { url: 'https://malicious.example.test' }),
    );

    expect(proceeds(record)).toBe(true);
    expect(record.verdict.warnings).toEqual([{ reason: 'prevention_annotated', message: 'Potential threat detected.' }]);
    expect(record.verdict.result_labels).toEqual(['MaliciousContentPropagation']);
  });

  it('sends the tool result and the reply', async () => {
    const { emitter, calls } = harness(() => json({ decision: 'allow' }));
    const turn = builder('s-1');

    const toolResult = await emitter.emitUnchecked(turn.postToolCall('call-2', 'SearchFlights', { origin: 'SEA' }, 'SO8492 nonstop $423'));
    const reply = await emitter.emitUnchecked(turn.output('Southwest SO8492 is nonstop for $423.'));

    expect(proceeds(toolResult) && proceeds(reply)).toBe(true);
    expect(calls.map((call) => call.body.interception_point)).toEqual(['post_tool_call', 'output']);
    for (const call of calls) expect(contractErrors(call.body)).toEqual([]);
    expect(calls[0].body.tool_result).toEqual({ value: 'SO8492 nonstop $423', is_error: false });
    expect(calls[1].body.target).toEqual({ content: 'Southwest SO8492 is nonstop for $423.' });
  });

  it('allows with a warning when fail-open Defender is unavailable', async () => {
    const { emitter } = harness(() => json({
      title: 'Forbidden',
      detail: 'The calling application is not allowed to use the third-party prevention endpoint.',
    }, 403));

    const record = await emitter.emitUnchecked(builder('s-2').output('Here are three flights.'));

    expect(proceeds(record)).toBe(true);
    expect(record.verdict.warnings).toEqual([{
      reason: 'defender:unverified',
      message: 'http 403: The calling application is not allowed to use the third-party prevention endpoint.',
    }]);
  });

  it('blocks as unverified, not as a detection, when fail-closed Defender is unavailable', async () => {
    const { emitter } = harness(() => json({ title: 'Service Unavailable' }, 503), { failClosed: true });

    const record = await emitter.emitUnchecked(builder('s-3').input('hello'));

    expect(proceeds(record)).toBe(false);
    expect(record.verdict.reason).toBe('runtime_error:defender_unverified');
    expect(record.verdict.message).toBe('Security validation is unavailable and this agent is configured to fail closed.');
  });

  it('applies the client timeout and fail mode before the emitter times out', async () => {
    const { emitter } = harness((_body, init) => waitForAbort(init), { configuration: { defenderRtpTimeoutMilliseconds: () => 100 } });

    const record = await emitter.emitUnchecked(builder('s-3').input('hello'));

    expect(proceeds(record)).toBe(true);
    expect(record.verdict.warnings).toEqual([{ reason: 'defender:unverified', message: 'request timeout' }]);
  });

  it('follows the fail mode when the identity is invalid', async () => {
    const { emitter, calls } = harness(() => json({ decision: 'allow' }), { failClosed: true, agentId: ' ' });

    const record = await emitter.emitUnchecked(builder('s-4').input('hello'));

    expect(proceeds(record)).toBe(false);
    expect(record.verdict.reason).toBe('runtime_error:defender_unverified');
    expect(record.verdict.warnings?.[0]?.message).toBe('TypeError: agent.agentId is required.');
    expect(calls).toHaveLength(0);
  });

  it('follows the fail mode when resolving the call fails', async () => {
    const resolveCall = (): never => {
      throw new Error('no turn state');
    };
    const open = harness(() => json({ decision: 'allow' }), { resolveCall });
    const closed = harness(() => json({ decision: 'allow' }), { resolveCall, failClosed: true });

    const allowed = await open.emitter.emitUnchecked(builder('s-5').input('hello'));
    const denied = await closed.emitter.emitUnchecked(builder('s-5').input('hello'));

    expect(proceeds(allowed)).toBe(true);
    expect(allowed.verdict.warnings).toEqual([{ reason: 'defender:unverified', message: 'Error: no turn state' }]);
    expect(proceeds(denied)).toBe(false);
    expect(denied.verdict.reason).toBe('runtime_error:defender_unverified');
  });

  it('does not call Defender for points it does not evaluate', async () => {
    const { emitter, calls, resolvedCount } = harness(() => json({ decision: 'deny' }));
    const turn = builder('s-6');

    const startup = await emitter.emitUnchecked(turn.agentStartup(['SearchFlights']));
    const modelCall = await emitter.emitUnchecked(turn.preModelCall('gpt-4o', [{ role: 'user', content: 'hi' }]));
    const modelResponse = await emitter.emitUnchecked(turn.postModelCall('gpt-4o', 'hello', [], 'stop'));
    const shutdown = await emitter.emitUnchecked(turn.agentShutdown('completed'));

    expect([startup, modelCall, modelResponse, shutdown].every(proceeds)).toBe(true);
    expect(calls).toHaveLength(0);
    expect(resolvedCount()).toBe(0);
  });

  it('follows the fail mode without a call when no identity is resolved', async () => {
    const open = harness(() => json({ decision: 'allow' }), { resolveNothing: true });
    const closed = harness(() => json({ decision: 'allow' }), { resolveNothing: true, failClosed: true });

    const allowed = await open.emitter.emitUnchecked(builder('s-7').input('hello'));
    const denied = await closed.emitter.emitUnchecked(builder('s-7').input('hello'));

    expect(proceeds(allowed)).toBe(true);
    expect(allowed.verdict.warnings).toEqual([{ reason: 'defender:unverified', message: 'no agent identity was resolved' }]);
    expect(proceeds(denied)).toBe(false);
    expect(denied.verdict.reason).toBe('runtime_error:defender_unverified');
    expect(open.calls).toHaveLength(0);
    expect(closed.calls).toHaveLength(0);
    expect(open.evaluations).toEqual([expect.objectContaining({
      allowed: true,
      evaluated: false,
      interceptionPoint: 'input',
      sessionId: 's-7',
      error: 'no agent identity was resolved',
    })]);
  });

  it('allows without a call while Defender RTP is disabled', async () => {
    const { emitter, calls, resolvedCount } = harness(() => json({ decision: 'deny' }), {
      configuration: { isDefenderRtpEnabled: () => false },
    });

    const record = await emitter.emitUnchecked(builder('s-8').input('hello'));

    expect(proceeds(record)).toBe(true);
    expect(calls).toHaveLength(0);
    expect(resolvedCount()).toBe(0);
  });

  it('ignores errors from the evaluation listener', async () => {
    const { emitter } = harness(() => json({ decision: 'allow' }), {
      onEvaluated: () => {
        throw new Error('logger failed');
      },
    });

    const record = await emitter.emitUnchecked(builder('s-9').input('hello'));

    expect(proceeds(record)).toBe(true);
    expect(record.verdict.reason).toBeUndefined();
  });
});

describe('A365DefenderInterceptor with content longer than the limit', () => {
  const PADDED = `${'a'.repeat(20000)}BLOCK_ME`;
  const TRUNCATED_ERROR = 'content exceeded A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS (20000); Defender evaluated a truncated copy';
  const denyBlockMe = (body: Record<string, any>): Response => JSON.stringify(body).includes('BLOCK_ME')
    ? json({ decision: 'deny', reason: 'prevention_blocked', message: 'Blocked content.' })
    : json({ decision: 'allow' });

  it('denies padded content as unverified when failing closed', async () => {
    const { emitter, calls } = harness(denyBlockMe, { failClosed: true });
    const turn = builder('s-long');

    const input = await emitter.emitUnchecked(turn.input(PADDED));
    const toolCall = await emitter.emitUnchecked(turn.preToolCall('call-1', 'SendMail', { body: PADDED }));

    for (const record of [input, toolCall]) {
      expect(proceeds(record)).toBe(false);
      expect(record.verdict.reason).toBe('runtime_error:defender_unverified');
      expect(record.verdict.message)
        .toBe('The content is too long to be fully validated by Microsoft Defender for AI, and this agent is configured to fail closed.');
      expect(record.verdict.warnings).toEqual([{ reason: 'defender:unverified', message: TRUNCATED_ERROR }]);
    }
    expect(calls.map((call) => JSON.stringify(call.body).includes('BLOCK_ME'))).toEqual([false, false]);
  });

  it('allows padded content with the unverified warning when failing open', async () => {
    const { emitter, evaluations } = harness(denyBlockMe);

    const record = await emitter.emitUnchecked(builder('s-long').input(PADDED));

    expect(proceeds(record)).toBe(true);
    expect(record.verdict.warnings).toEqual([{ reason: 'defender:unverified', message: TRUNCATED_ERROR }]);
    expect(evaluations[0]).toMatchObject({ allowed: true, evaluated: true, truncated: true });
  });

  it('keeps a Defender deny of truncated content', async () => {
    const { emitter } = harness(denyBlockMe);

    const record = await emitter.emitUnchecked(builder('s-long').input(`BLOCK_ME${'a'.repeat(20000)}`));

    expect(proceeds(record)).toBe(false);
    expect(record.verdict.reason).toBe('defender:block:prevention_blocked');
    expect(record.verdict.message).toBe('Blocked content.');
  });

  it('allows content under the limit normally', async () => {
    const { emitter } = harness(denyBlockMe, { failClosed: true });

    const record = await emitter.emitUnchecked(builder('s-long').input('a'.repeat(20000)));

    expect(proceeds(record)).toBe(true);
    expect(record.verdict.warnings).toBeUndefined();
  });
});

describe('A365DefenderInterceptor.toVerdict', () => {
  const base = { interceptionPoint: 'input', correlationId: 'cid-1', latencyMilliseconds: 5 };

  it('maps a Defender deny to an agent-hooks verdict with evidence and labels', () => {
    const verdict = A365DefenderInterceptor.toVerdict({
      ...base,
      allowed: false,
      evaluated: true,
      blockReason: 'Prompt injection detected.',
      verdict: { decision: 'deny', reason: 'prevention blocked/1', warnings: [], resultLabels: ['PromptInjection'] },
    });

    expect(verdict).toEqual({
      decision: 'deny',
      reason: 'defender:block:prevention_blocked_1',
      message: 'Prompt injection detected.',
      evidence: { artefact: 'defender-verdict', verification_pointers: { correlation: 'urn:a365:defender:cid-1' } },
      result_labels: ['PromptInjection'],
    });
  });

  it('maps a deny without a reason and a warning without a reason', () => {
    expect(A365DefenderInterceptor.toVerdict({
      ...base, allowed: false, evaluated: true, blockReason: 'Blocked.',
      verdict: { decision: 'transform', warnings: [], resultLabels: [] },
    }).reason).toBe('defender:block');
    expect(A365DefenderInterceptor.toVerdict({
      ...base, allowed: true, evaluated: true,
      verdict: { decision: 'allow', warnings: [{ message: 'note' }], resultLabels: [] },
    })).toEqual({ decision: 'allow', warnings: [{ reason: 'defender:warning', message: 'note' }] });
  });

  it('maps a not-evaluated result by the fail mode', () => {
    expect(A365DefenderInterceptor.toVerdict({ ...base, allowed: true, evaluated: false, error: 'request timeout' }))
      .toEqual({ decision: 'allow', warnings: [{ reason: 'defender:unverified', message: 'request timeout' }] });
    expect(A365DefenderInterceptor.toVerdict({ ...base, allowed: false, evaluated: false }))
      .toEqual({
        decision: 'deny',
        reason: 'runtime_error:defender_unverified',
        message: 'Security validation is unavailable and this agent is configured to fail closed.',
        warnings: [{ reason: 'defender:unverified', message: 'no verdict was returned' }],
      });
  });

  it('maps an allow of a truncated copy as unverified, keeping what Defender noted', () => {
    const truncatedAllow = {
      ...base,
      evaluated: true,
      truncated: true,
      error: 'content exceeded the limit',
      verdict: {
        decision: 'allow' as const,
        warnings: [{ reason: 'prevention_annotated', message: 'Suspicious.' }],
        resultLabels: ['MaliciousContentPropagation'],
      },
    };

    expect(A365DefenderInterceptor.toVerdict({ ...truncatedAllow, allowed: true })).toEqual({
      decision: 'allow',
      warnings: [
        { reason: 'defender:unverified', message: 'content exceeded the limit' },
        { reason: 'prevention_annotated', message: 'Suspicious.' },
      ],
      result_labels: ['MaliciousContentPropagation'],
    });
    expect(A365DefenderInterceptor.toVerdict({ ...truncatedAllow, allowed: false, blockReason: 'Too long.' })).toEqual({
      decision: 'deny',
      reason: 'runtime_error:defender_unverified',
      message: 'Too long.',
      warnings: [{ reason: 'defender:unverified', message: 'content exceeded the limit' }],
    });
  });
});

describe('createProtectionEmitter and addA365Defender', () => {
  const withDefenderTimeout = (milliseconds: number) => new DefaultConfigurationProvider(() => new ToolingConfiguration({
    defenderRtpTimeoutMilliseconds: () => milliseconds,
  }));

  it('fails an interceptor that exceeds the interceptor timeout closed', async () => {
    const slow: Interceptor = { intercept: () => new Promise((resolve) => setTimeout(() => resolve({ decision: 'allow' }), 500)) };
    const emitter = createProtectionEmitter({ interceptorTimeoutMilliseconds: 50, configProvider: withDefenderTimeout(10) })
      .register(slow, 'slow');

    const record = await emitter.emitUnchecked(builder('s-10').input('hello'));

    expect(proceeds(record)).toBe(false);
    expect(record.verdict.reason).toBe('host_error:interceptor_timeout');
  });

  it('requires the interceptor timeout to exceed the Defender timeout', () => {
    expect(() => createProtectionEmitter({ interceptorTimeoutMilliseconds: 10000 }))
      .toThrow('interceptorTimeoutMilliseconds (10000) must exceed the Defender timeout (10000 ms)');
    expect(() => createProtectionEmitter({ interceptorTimeoutMilliseconds: 500, configProvider: withDefenderTimeout(1000) }))
      .toThrow(RangeError);
    expect(() => createProtectionEmitter({ configProvider: withDefenderTimeout(1000) })).not.toThrow();
  });

  it('requires an emitter and an interceptor', () => {
    const client = new DefenderRtpClient();
    expect(() => addA365Defender(undefined as never, new A365DefenderInterceptor(client, () => null))).toThrow('emitter is required.');
    expect(() => addA365Defender(createProtectionEmitter(), undefined as never)).toThrow('interceptor is required.');
    expect(() => new A365DefenderInterceptor(client, undefined as never)).toThrow('resolveCall is required.');
  });
});
