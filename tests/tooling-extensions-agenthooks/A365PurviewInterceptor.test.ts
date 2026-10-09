// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { AgentContext, AgentContextBuilder, Interceptor, JsonValue, proceeds } from '@responsibleai/agent-hooks';
import { DefaultConfigurationProvider } from '@microsoft/agents-a365-runtime';
import {
  DefenderRtpClient,
  PurviewDlpAgentContext,
  PurviewDlpClient,
  PurviewDlpEvaluationResult,
  PurviewDlpTokenResolver,
  ToolingConfiguration,
  ToolingConfigurationOptions,
} from '@microsoft/agents-a365-tooling';
import {
  A365DefenderInterceptor,
  A365PurviewCall,
  A365PurviewInterceptor,
  addA365Defender,
  addA365Purview,
  createProtectionEmitter,
} from '../../packages/agents-a365-tooling-extensions-agenthooks/src';
import {
  AGENTIC_USER_ID,
  AGENT_ID,
  BLOCK_ACTION,
  BLUEPRINT_ID,
  GRAPH_BASE_URL,
  PURVIEW_ENVIRONMENT_VARIABLES,
  TENANT_ID,
  createGraphToken,
  fakeGraph,
  json,
  processed,
  sentText,
  waitForAbort,
} from '../tooling/fixtures/purview';
import { DEFENDER_ENVIRONMENT_VARIABLES, ENDPOINT, createToken, fakeEndpoint } from '../tooling/fixtures/defender';

/* eslint-disable @typescript-eslint/no-explicit-any */

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  for (const name of [...PURVIEW_ENVIRONMENT_VARIABLES, ...DEFENDER_ENVIRONMENT_VARIABLES]) delete process.env[name];
});

afterEach(() => {
  process.env = originalEnv;
});

const CARD = 'Please charge my card 4111 1111 1111 1111 for the hotel.';
const BLOCKED_REQUEST = 'The request was blocked by a Microsoft Purview data loss prevention policy.';
const BLOCKED_RESPONSE = 'The response was blocked by a Microsoft Purview data loss prevention policy.';
const FAIL_CLOSED_REASON = 'Data loss prevention validation is unavailable and this agent is configured to fail closed.';
const AGENT: PurviewDlpAgentContext = { agentId: AGENT_ID, tenantId: TENANT_ID, agenticUserId: AGENTIC_USER_ID, blueprintId: BLUEPRINT_ID };
const tokenResolver: PurviewDlpTokenResolver = async () => ({ accessToken: createGraphToken() });

interface HarnessOptions {
  configuration?: ToolingConfigurationOptions;
  resolveCall?: (context: AgentContext) => A365PurviewCall | null | undefined | Promise<A365PurviewCall | null | undefined>;
  onEvaluated?: (result: PurviewDlpEvaluationResult) => void;
}

/** The Purview interceptor under the real agent-hooks emitter, against a fake Microsoft Graph. */
function harness(
  respond: (body: Record<string, any>, init: RequestInit) => Response | Promise<Response>,
  options: HarnessOptions = {},
) {
  const graph = fakeGraph(respond);
  const configProvider = new DefaultConfigurationProvider(() => new ToolingConfiguration({
    isPurviewDlpEnabled: () => true,
    purviewDlpGraphBaseUrl: () => GRAPH_BASE_URL,
    ...options.configuration,
  }));
  const client = new PurviewDlpClient({ configProvider, fetchImplementation: graph.fetch });
  const evaluations: PurviewDlpEvaluationResult[] = [];
  let resolved = 0;
  const emitter = addA365Purview(
    createProtectionEmitter({ configProvider }),
    new A365PurviewInterceptor(
      client,
      options.resolveCall ?? (() => {
        resolved += 1;
        return { agent: AGENT, tokenResolver };
      }),
      options.onEvaluated ?? ((result) => evaluations.push(result)),
    ),
  );
  return { emitter, calls: graph.calls, evaluations, resolvedCount: () => resolved };
}

const builder = (sessionId: string, agentName?: string): AgentContextBuilder =>
  new AgentContextBuilder({ agentId: AGENT_ID, framework: 'agent-framework', sessionId, agentName });

/** Waits until the evaluation listener, which runs after the verdict is returned, has run. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** Waits until `count` evaluations have reached the listener. */
async function evaluated(evaluations: PurviewDlpEvaluationResult[], count = 1): Promise<void> {
  for (let attempt = 0; attempt < 200 && evaluations.length < count; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const blockCard = (body: Record<string, any>): Response => sentText({ body } as never).includes('4111')
  ? processed([BLOCK_ACTION])
  : processed();

describe('A365PurviewInterceptor under the agent-hooks emitter', () => {
  it('evaluates the user\'s message as uploadText and allows it', async () => {
    const { emitter, calls, evaluations } = harness(blockCard);

    const record = await emitter.emitUnchecked(builder('conversation-1', 'SampleAgent').input('Find flights to Paris'));
    await settle();

    expect(proceeds(record)).toBe(true);
    expect(record.verdict).toEqual({ decision: 'allow' });
    expect(record.composition.profile).toBe('parallel/strictest');
    expect(record.verdicts?.[0]?.name).toBe('purview');
    expect(calls).toHaveLength(1);
    const request = calls[0].body.contentToProcess;
    const entry = request.contentEntries[0];
    expect(sentText(calls[0])).toBe('Find flights to Paris');
    expect(request.activityMetadata).toEqual({ activity: 'uploadText' });
    expect(entry.correlationId).toBe('conversation-1');
    expect(entry.sequenceNumber).toBe(record.sequence);
    expect(entry.name).toBe('SampleAgent uploadText');
    expect(entry.agents[0]).toMatchObject({ identifier: AGENT_ID, blueprintId: BLUEPRINT_ID, name: 'SampleAgent' });
    expect(request.protectedAppMetadata.applicationLocation.value).toBe(BLUEPRINT_ID);
    expect(evaluations).toHaveLength(1);
    expect(evaluations[0]).toMatchObject({ activity: 'uploadText', allowed: true, evaluated: true, correlationId: calls[0].clientRequestId });
  });

  it('blocks a message a Purview DLP policy restricts', async () => {
    const { emitter, calls } = harness(blockCard);

    const record = await emitter.emitUnchecked(builder('conversation-2').input(CARD));

    expect(proceeds(record)).toBe(false);
    expect(record.verdict).toEqual({
      decision: 'deny',
      reason: 'purview:block',
      message: BLOCKED_REQUEST,
      evidence: {
        artefact: 'purview-verdict',
        verification_pointers: { correlation: `urn:a365:purview:${calls[0].clientRequestId}` },
      },
    });
    expect(record.decided_by).toBe(0);
  });

  it('takes the session id and sequence from the context, and the agent name from the call first', async () => {
    const { emitter, calls } = harness(blockCard, {
      resolveCall: () => ({ agent: { ...AGENT, agentName: 'CallAgent', sessionId: 'ignored', sequence: 99 }, tokenResolver }),
    });
    const turn = builder('conversation-3', 'ContextAgent');

    await emitter.emitUnchecked(turn.agentStartup(['SearchFlights']));
    const record = await emitter.emitUnchecked(turn.input('hello'));

    const entry = calls[0].body.contentToProcess.contentEntries[0];
    expect(entry).toMatchObject({ correlationId: 'conversation-3', sequenceNumber: record.sequence, name: 'CallAgent uploadText' });
    expect(record.sequence).toBeGreaterThan(0);
  });

  describe('replies in the default audit mode', () => {
    it('allows the reply at once and audits it in the background', async () => {
      let respond: (response: Response) => void = () => undefined;
      const { emitter, calls, evaluations } = harness(() => new Promise<Response>((resolve) => {
        respond = resolve;
      }));

      const started = Date.now();
      const record = await emitter.emitUnchecked(builder('conversation-4', 'SampleAgent').output(`Booked with ${CARD}`));
      const elapsed = Date.now() - started;

      expect(proceeds(record)).toBe(true);
      expect(record.verdict).toEqual({ decision: 'allow' });
      expect(elapsed).toBeLessThan(500);
      expect(evaluations).toHaveLength(0);
      for (let attempt = 0; attempt < 100 && calls.length === 0; attempt += 1) await settle();
      expect(calls).toHaveLength(1);
      expect(calls[0].body.contentToProcess.activityMetadata).toEqual({ activity: 'downloadText' });
      expect(calls[0].body.contentToProcess.contentEntries[0].sequenceNumber).toBe(record.sequence);
      respond(processed([BLOCK_ACTION]));
      await evaluated(evaluations);
      expect(evaluations[0]).toMatchObject({ activity: 'downloadText', evaluated: true, allowed: false, decision: { blockAction: true } });
    });

    it('never blocks the reply, even when failing closed and Purview is unavailable', async () => {
      const { emitter, evaluations } = harness(() => json({}, 403), { configuration: { purviewDlpFailClosed: () => true } });

      const record = await emitter.emitUnchecked(builder('conversation-5').output('Here are three flights.'));
      await evaluated(evaluations);

      expect(proceeds(record)).toBe(true);
      expect(evaluations[0]).toMatchObject({ activity: 'downloadText', evaluated: false, allowed: false, error: 'http 403' });
    });

    it('bounds the background evaluation by the client timeout', async () => {
      const { emitter, evaluations } = harness((_body, init) => waitForAbort(init), {
        configuration: { purviewDlpTimeoutMilliseconds: () => 100 },
      });

      const record = await emitter.emitUnchecked(builder('conversation-6').output('Here are three flights.'));
      await evaluated(evaluations);

      expect(proceeds(record)).toBe(true);
      expect(evaluations[0]).toMatchObject({ evaluated: false, error: 'request timeout' });
    });

    it('contains every failure of the background evaluation', async () => {
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown): void => {
        unhandled.push(reason);
      };
      process.on('unhandledRejection', onUnhandled);
      try {
        const throwing = harness(processed, {
          resolveCall: () => {
            throw new Error('no turn state for token secret-value');
          },
        });
        const nothing = harness(processed, { resolveCall: () => null });
        const brokenListener = harness(processed, {
          onEvaluated: () => {
            throw new Error('logger failed');
          },
        });
        const rejectingListener = harness(processed, {
          onEvaluated: () => runInNewContext('Promise.reject(new Error("logger failed"))'),
        });

        const records = [
          await throwing.emitter.emitUnchecked(builder('c-7').output('reply')),
          await nothing.emitter.emitUnchecked(builder('c-7').output('reply')),
          await brokenListener.emitter.emitUnchecked(builder('c-7').output('reply')),
          await rejectingListener.emitter.emitUnchecked(builder('c-7').output('reply')),
        ];
        await evaluated(throwing.evaluations);
        await evaluated(nothing.evaluations);
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(records.every(proceeds)).toBe(true);
        expect(throwing.evaluations[0]).toMatchObject({ evaluated: false, error: 'no agent identity was resolved: Error' });
        expect(nothing.evaluations[0]).toMatchObject({ evaluated: false, error: 'no agent identity was resolved' });
        expect(throwing.calls).toHaveLength(0);
        expect(brokenListener.calls).toHaveLength(1);
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }

      expect(unhandled).toEqual([]);
    });
  });

  describe('replies in enforce mode', () => {
    it('waits for Purview and blocks a reply it restricts', async () => {
      const { emitter, calls } = harness(blockCard, { configuration: { purviewDlpResponseMode: () => 'enforce' } });
      const turn = builder('conversation-8');

      const allowed = await emitter.emitUnchecked(turn.output('Here are three flights.'));
      const denied = await emitter.emitUnchecked(turn.output(`Charged ${CARD}`));

      expect(proceeds(allowed)).toBe(true);
      expect(proceeds(denied)).toBe(false);
      expect(denied.verdict).toMatchObject({ decision: 'deny', reason: 'purview:block', message: BLOCKED_RESPONSE });
      expect(calls.map((call) => call.body.contentToProcess.activityMetadata.activity)).toEqual(['downloadText', 'downloadText']);
    });

    it('follows the fail mode when no verdict is obtained', async () => {
      const { emitter } = harness(() => json({}, 503), {
        configuration: { purviewDlpResponseMode: () => 'enforce', purviewDlpFailClosed: () => true },
      });

      const record = await emitter.emitUnchecked(builder('conversation-9').output('Here are three flights.'));

      expect(proceeds(record)).toBe(false);
      expect(record.verdict.reason).toBe('runtime_error:purview_unverified');
    });
  });

  it('allows with a warning when fail-open Purview is unavailable', async () => {
    const { emitter } = harness(() => json({ error: { message: `echo ${CARD}` } }, 503));

    const record = await emitter.emitUnchecked(builder('conversation-10').input(CARD));

    expect(proceeds(record)).toBe(true);
    expect(record.verdict.warnings).toEqual([{ reason: 'purview:unverified', message: 'http 503' }]);
  });

  it('blocks as unverified, not as a detection, when fail-closed Purview is unavailable', async () => {
    const { emitter } = harness(() => json({ policyActions: [], processingErrors: [{ code: 'BadRequest' }] }), {
      configuration: { purviewDlpFailClosed: () => true },
    });

    const record = await emitter.emitUnchecked(builder('conversation-11').input('hello'));

    expect(proceeds(record)).toBe(false);
    expect(record.verdict).toEqual({
      decision: 'deny',
      reason: 'runtime_error:purview_unverified',
      message: FAIL_CLOSED_REASON,
      warnings: [{ reason: 'purview:unverified', message: 'processing errors: 1' }],
    });
  });

  it('applies the client timeout and fail mode before the emitter times out', async () => {
    const { emitter } = harness((_body, init) => waitForAbort(init), { configuration: { purviewDlpTimeoutMilliseconds: () => 100 } });

    const record = await emitter.emitUnchecked(builder('conversation-12').input('hello'));

    expect(proceeds(record)).toBe(true);
    expect(record.verdict.warnings).toEqual([{ reason: 'purview:unverified', message: 'request timeout' }]);
  });

  it('follows the fail mode without a call when no identity is resolved', async () => {
    const open = harness(processed, { resolveCall: () => undefined });
    const closed = harness(processed, { resolveCall: () => null, configuration: { purviewDlpFailClosed: () => true } });

    const allowed = await open.emitter.emitUnchecked(builder('conversation-13').input('hello'));
    const denied = await closed.emitter.emitUnchecked(builder('conversation-13').input('hello'));
    await settle();

    expect(proceeds(allowed)).toBe(true);
    expect(allowed.verdict.warnings).toEqual([{ reason: 'purview:unverified', message: 'no agent identity was resolved' }]);
    expect(proceeds(denied)).toBe(false);
    expect(denied.verdict).toMatchObject({ reason: 'runtime_error:purview_unverified', message: FAIL_CLOSED_REASON });
    expect(open.calls).toHaveLength(0);
    expect(closed.calls).toHaveLength(0);
    expect(open.evaluations).toEqual([expect.objectContaining({ activity: 'uploadText', allowed: true, evaluated: false })]);
  });

  it('follows the fail mode when resolving the call fails, reporting only the error type', async () => {
    const resolveCall = (): never => {
      throw new Error('token secret-value');
    };
    const open = harness(processed, { resolveCall });
    const closed = harness(processed, { resolveCall, configuration: { purviewDlpFailClosed: () => true } });

    const allowed = await open.emitter.emitUnchecked(builder('conversation-14').input('hello'));
    const denied = await closed.emitter.emitUnchecked(builder('conversation-14').input('hello'));

    expect(allowed.verdict.warnings).toEqual([{ reason: 'purview:unverified', message: 'no agent identity was resolved: Error' }]);
    expect(proceeds(denied)).toBe(false);
    expect(denied.verdict.reason).toBe('runtime_error:purview_unverified');
  });

  it('follows the fail mode when the identity is invalid', async () => {
    const { emitter, calls } = harness(processed, {
      resolveCall: () => ({ agent: { agentId: ' ' }, tokenResolver }),
      configuration: { purviewDlpFailClosed: () => true },
    });
    const wrongShape = harness(processed, { resolveCall: () => ({ agent: 'agent' as never, tokenResolver }) });

    const record = await emitter.emitUnchecked(builder('conversation-15').input('hello'));
    const other = await wrongShape.emitter.emitUnchecked(builder('conversation-15').input('hello'));

    expect(proceeds(record)).toBe(false);
    expect(record.verdict.warnings).toEqual([{ reason: 'purview:unverified', message: 'TypeError: agent.agentId is required.' }]);
    expect(other.verdict.warnings).toEqual([{ reason: 'purview:unverified', message: 'TypeError: agent is required.' }]);
    expect(calls).toHaveLength(0);
  });

  it('follows the fail mode for a context without a session id', async () => {
    const graph = fakeGraph(processed);
    const interceptor = new A365PurviewInterceptor(
      new PurviewDlpClient({
        configProvider: new DefaultConfigurationProvider(() => new ToolingConfiguration({
          isPurviewDlpEnabled: () => true,
          purviewDlpGraphBaseUrl: () => GRAPH_BASE_URL,
          purviewDlpFailClosed: () => true,
        })),
        fetchImplementation: graph.fetch,
      }),
      () => ({ agent: AGENT, tokenResolver }),
    );
    const context = { ...builder('conversation-16').input('hello'), session: 'conversation-16' } as unknown as AgentContext;

    const verdict = await interceptor.intercept(context);

    expect(verdict).toMatchObject({
      decision: 'deny',
      reason: 'runtime_error:purview_unverified',
      warnings: [{ reason: 'purview:unverified', message: 'TypeError: agent.sessionId is required.' }],
    });
    expect(graph.calls).toHaveLength(0);
  });

  it('does not call Purview, or resolve the call, for other points', async () => {
    const { emitter, calls, resolvedCount } = harness(() => processed([BLOCK_ACTION]));
    const turn = builder('conversation-17');

    const records = [
      await emitter.emitUnchecked(turn.agentStartup(['SearchFlights'])),
      await emitter.emitUnchecked(turn.preModelCall('gpt-4o', [{ role: 'user', content: CARD }])),
      await emitter.emitUnchecked(turn.postModelCall('gpt-4o', CARD, [], 'stop')),
      await emitter.emitUnchecked(turn.preToolCall('call-1', 'Pay', { card: CARD })),
      await emitter.emitUnchecked(turn.postToolCall('call-1', 'Pay', { card: CARD }, CARD)),
      await emitter.emitUnchecked(turn.agentShutdown('completed')),
    ];

    expect(records.every(proceeds)).toBe(true);
    expect(calls).toHaveLength(0);
    expect(resolvedCount()).toBe(0);
  });

  it('allows without a call while Purview DLP is disabled', async () => {
    const { emitter, calls, resolvedCount } = harness(() => processed([BLOCK_ACTION]), {
      configuration: { isPurviewDlpEnabled: () => false },
    });

    const records = [
      await emitter.emitUnchecked(builder('conversation-18').input(CARD)),
      await emitter.emitUnchecked(builder('conversation-18').output(CARD)),
    ];

    expect(records.every(proceeds)).toBe(true);
    expect(calls).toHaveLength(0);
    expect(resolvedCount()).toBe(0);
  });

  it.each([
    ['an empty message', ''],
    ['whitespace', '  \n '],
    ['null content', null],
    ['content without text', [{ flag: true, empty: '' }, null, []]],
  ])('allows %s without resolving the call', async (_case, content) => {
    const { emitter, calls, resolvedCount } = harness(() => processed([BLOCK_ACTION]), {
      configuration: { purviewDlpFailClosed: () => true },
    });

    const record = await emitter.emitUnchecked(builder('conversation-19').input(content as JsonValue));

    expect(proceeds(record)).toBe(true);
    expect(calls).toHaveLength(0);
    expect(resolvedCount()).toBe(0);
  });

  it('evaluates the text of structured content, in order', async () => {
    const { emitter, calls } = harness(blockCard);

    const record = await emitter.emitUnchecked(builder('conversation-20').input([
      { type: 'text', text: 'Charge my card' },
      { type: 'card', details: { number: 4111111111111111, holder: 'Sample User' } },
    ]));

    expect(proceeds(record)).toBe(false);
    expect(sentText(calls[0])).toBe(['text', 'Charge my card', 'card', '4111111111111111', 'Sample User'].join('\n'));
  });

  it('reads structured content only as far as the limit, and follows the fail mode for the rest', async () => {
    const { emitter, calls } = harness(blockCard, {
      configuration: { purviewDlpMaxContentCharacters: () => 20, purviewDlpFailClosed: () => true },
    });
    const parts = Array.from({ length: 1000 }, (_value, index) => ({ type: 'text', text: `part ${index}` }));

    const record = await emitter.emitUnchecked(builder('conversation-21').input([...parts, { text: CARD }]));

    expect(proceeds(record)).toBe(false);
    expect(record.verdict).toMatchObject({
      reason: 'runtime_error:purview_unverified',
      message: 'The content is too long to be fully validated by Microsoft Purview, and this agent is configured to fail closed.',
    });
    expect(sentText(calls[0])).toHaveLength(20);
    expect(calls[0].body.contentToProcess.contentEntries[0].isTruncated).toBe(true);
  });

  it('keeps reading structured content whose text ends exactly at the limit, so what follows is not left out unseen', async () => {
    const { emitter, calls } = harness((body) => sentText({ body } as never).includes('BLOCK') ? processed([BLOCK_ACTION]) : processed(), {
      configuration: { purviewDlpMaxContentCharacters: () => 10, purviewDlpFailClosed: () => true },
    });

    const exact = await emitter.emitUnchecked(builder('conversation-26').input(['abcde', 'fghi']));
    const longer = await emitter.emitUnchecked(builder('conversation-26').input(['abcde', 'fghi', { padding: '' }, 'BLOCK']));

    expect(proceeds(exact)).toBe(true);
    expect(sentText(calls[0])).toBe('abcde\nfghi');
    expect(proceeds(longer)).toBe(false);
    expect(longer.verdict.reason).toBe('runtime_error:purview_unverified');
    expect(sentText(calls[1])).toBe('abcde\nfghi');
    expect(calls[1].body.contentToProcess.contentEntries[0].isTruncated).toBe(true);
  });

  it.each([false, true])(
    'follows the fail mode for structured content that is blank up to the limit and goes on (fail closed: %s)',
    async (failClosed) => {
      const { emitter, calls, resolvedCount } = harness(() => processed([BLOCK_ACTION]), {
        configuration: { purviewDlpMaxContentCharacters: () => 10, purviewDlpFailClosed: () => failClosed },
      });
      const unverified = {
        reason: 'purview:unverified',
        message: 'content exceeded A365_PURVIEW_DLP_MAX_CONTENT_CHARACTERS (10) before any text; Purview was not called',
      };

      const records = [
        await emitter.emitUnchecked(builder('conversation-27').input([' '.repeat(11), CARD])),
        await emitter.emitUnchecked(builder('conversation-27').input([{ text: '\n'.repeat(11), type: 'text' }, { text: CARD, type: 'text' }])),
      ];

      for (const record of records) {
        expect(proceeds(record)).toBe(!failClosed);
        expect(record.verdict.warnings).toEqual([unverified]);
      }
      expect(calls).toHaveLength(0);
      expect(resolvedCount()).toBe(0);
    },
  );

  it('evaluates a message that is blank up to the limit and goes on, as truncated', async () => {
    const { emitter, calls } = harness(blockCard, {
      configuration: { purviewDlpMaxContentCharacters: () => 10, purviewDlpFailClosed: () => true },
    });

    const record = await emitter.emitUnchecked(builder('conversation-28').input(`${' '.repeat(11)}${CARD}`));

    expect(proceeds(record)).toBe(false);
    expect(record.verdict.reason).toBe('runtime_error:purview_unverified');
    expect(calls[0].body.contentToProcess.contentEntries[0].isTruncated).toBe(true);
  });

  it('keeps Purview\'s block of a message longer than the limit', async () => {
    const { emitter, calls } = harness(blockCard, { configuration: { purviewDlpMaxContentCharacters: () => 60 } });

    const record = await emitter.emitUnchecked(builder('conversation-22').input(`${CARD} ${'a'.repeat(1000)}`));

    expect(proceeds(record)).toBe(false);
    expect(record.verdict.reason).toBe('purview:block');
    expect(calls[0].body.contentToProcess.contentEntries[0].isTruncated).toBe(true);
  });

  it('reads content that refers to itself once', async () => {
    const graph = fakeGraph(blockCard);
    const content: Record<string, unknown> = { text: CARD };
    content['self'] = content;
    const context = { ...builder('conversation-23').input('placeholder'), input: { content, role: 'user' } } as unknown as AgentContext;
    const interceptor = new A365PurviewInterceptor(
      new PurviewDlpClient({
        configProvider: new DefaultConfigurationProvider(() => new ToolingConfiguration({
          isPurviewDlpEnabled: () => true,
          purviewDlpGraphBaseUrl: () => GRAPH_BASE_URL,
        })),
        fetchImplementation: graph.fetch,
      }),
      () => ({ agent: AGENT, tokenResolver }),
    );

    const verdict = await interceptor.intercept(context);

    expect(verdict.decision).toBe('deny');
    expect(sentText(graph.calls[0])).toBe(CARD);
  });

  it('returns the verdict before the evaluation listener runs, so a slow listener cannot delay it', async () => {
    const order: string[] = [];
    const { emitter } = harness(processed, {
      onEvaluated: () => {
        order.push('listener');
        const until = Date.now() + 500;
        while (Date.now() < until) {
          // A slow, synchronous logger.
        }
      },
    });

    const started = Date.now();
    const record = await emitter.emitUnchecked(builder('conversation-24').input('hello'));
    const elapsed = Date.now() - started;
    order.push('verdict');
    await settle();

    expect(proceeds(record)).toBe(true);
    expect(elapsed).toBeLessThan(500);
    expect(order).toEqual(['verdict', 'listener']);
  });

  it('follows the fail mode when the configuration cannot be read', async () => {
    let failClosed = true;
    let maximum = 100;
    const { emitter } = harness(processed, {
      configuration: {
        purviewDlpFailClosed: () => failClosed,
        purviewDlpMaxContentCharacters: () => maximum,
      },
    });
    maximum = 0;

    const denied = await emitter.emitUnchecked(builder('conversation-25').input('hello'));
    failClosed = false;
    const allowed = await emitter.emitUnchecked(builder('conversation-25').input('hello'));

    expect(proceeds(denied)).toBe(false);
    expect(denied.verdict.warnings).toEqual([
      { reason: 'purview:unverified', message: 'Error: purviewDlpMaxContentCharacters must be a positive integer.' },
    ]);
    expect(proceeds(allowed)).toBe(true);
  });
});

describe('Defender and Purview on one emitter', () => {
  function protection(
    defenderRespond: (body: Record<string, any>) => Response,
    purviewRespond: (body: Record<string, any>) => Response,
  ) {
    const defenderEndpoint = fakeEndpoint(defenderRespond);
    const graph = fakeGraph(purviewRespond);
    const configProvider = new DefaultConfigurationProvider(() => new ToolingConfiguration({
      isDefenderRtpEnabled: () => true,
      defenderRtpEndpoint: () => ENDPOINT,
      isPurviewDlpEnabled: () => true,
      purviewDlpGraphBaseUrl: () => GRAPH_BASE_URL,
    }));
    const emitter = createProtectionEmitter({ configProvider });
    addA365Defender(emitter, new A365DefenderInterceptor(
      new DefenderRtpClient({ configProvider, fetchImplementation: defenderEndpoint.fetch }),
      () => ({ agent: { agentId: AGENT_ID, tenantId: TENANT_ID }, tokenResolver: async () => createToken() }),
    ));
    addA365Purview(emitter, new A365PurviewInterceptor(
      new PurviewDlpClient({ configProvider, fetchImplementation: graph.fetch }),
      () => ({ agent: AGENT, tokenResolver }),
    ));
    return { emitter, defenderCalls: defenderEndpoint.calls, purviewCalls: graph.calls };
  }

  const defenderBlocksUrls = (body: Record<string, any>): Response => JSON.stringify(body).includes('malicious.example.test')
    ? json({ decision: 'deny', reason: 'prevention_blocked', message: 'Known malicious URL.' })
    : json({ decision: 'allow' });

  it('allows a clean turn that both allow', async () => {
    const { emitter, defenderCalls, purviewCalls } = protection(defenderBlocksUrls, blockCard);
    const turn = builder('conversation-30');

    const records = [
      await emitter.emitUnchecked(turn.input('Find flights to Paris')),
      await emitter.emitUnchecked(turn.preToolCall('call-1', 'SearchFlights', { destination: 'CDG' })),
      await emitter.emitUnchecked(turn.output('Here are three flights.')),
    ];

    expect(records.every(proceeds)).toBe(true);
    expect(records[0].verdicts?.map((verdict) => `${verdict.name}:${verdict.decision}`)).toEqual(['defender:allow', 'purview:allow']);
    expect(defenderCalls.map((call) => call.body.interception_point)).toEqual(['input', 'pre_tool_call', 'output']);
    for (let attempt = 0; attempt < 100 && purviewCalls.length < 2; attempt += 1) await settle();
    expect(purviewCalls.map((call) => call.body.contentToProcess.activityMetadata.activity)).toEqual(['uploadText', 'downloadText']);
  });

  it('denies a prompt Purview blocks, and a tool call Defender blocks', async () => {
    const { emitter } = protection(defenderBlocksUrls, blockCard);
    const turn = builder('conversation-31');

    const prompt = await emitter.emitUnchecked(turn.input(CARD));
    const toolCall = await emitter.emitUnchecked(turn.preToolCall('call-2', 'FetchPage', { url: 'https://malicious.example.test' }));

    expect(proceeds(prompt)).toBe(false);
    expect(prompt.verdict.reason).toBe('purview:block');
    expect(prompt.verdicts?.map((verdict) => `${verdict.name}:${verdict.decision}`)).toEqual(['defender:allow', 'purview:deny']);
    expect(proceeds(toolCall)).toBe(false);
    expect(toolCall.verdict.reason).toBe('defender:block:prevention_blocked');
    expect(toolCall.verdicts?.map((verdict) => `${verdict.name}:${verdict.decision}`)).toEqual(['defender:deny', 'purview:allow']);
  });
});

describe('A365PurviewInterceptor.toVerdict', () => {
  const base = {
    activity: 'uploadText' as const,
    correlationId: 'request id/1',
    latencyMilliseconds: 5,
    decision: { blockAction: false, actionCount: 0 },
  };

  it('maps an evaluated allow and block', () => {
    expect(A365PurviewInterceptor.toVerdict({ ...base, allowed: true, evaluated: true, truncated: false })).toEqual({ decision: 'allow' });
    expect(A365PurviewInterceptor.toVerdict({
      ...base,
      allowed: false,
      evaluated: true,
      truncated: false,
      decision: { blockAction: true, restrictionAction: 'block', actionCount: 1 },
      blockReason: 'Blocked.',
    })).toEqual({
      decision: 'deny',
      reason: 'purview:block',
      message: 'Blocked.',
      evidence: { artefact: 'purview-verdict', verification_pointers: { correlation: 'urn:a365:purview:request%20id%2F1' } },
    });
  });

  it('keeps a block of truncated text and uses the default message for the activity', () => {
    expect(A365PurviewInterceptor.toVerdict({
      ...base,
      activity: 'downloadText',
      allowed: false,
      evaluated: true,
      truncated: true,
      decision: { blockAction: true, actionCount: 1 },
    })).toMatchObject({ decision: 'deny', reason: 'purview:block', message: BLOCKED_RESPONSE });
  });

  it('maps an allow of truncated text, or no verdict, by the fail mode', () => {
    expect(A365PurviewInterceptor.toVerdict({ ...base, allowed: true, evaluated: true, truncated: true, error: 'too long' }))
      .toEqual({ decision: 'allow', warnings: [{ reason: 'purview:unverified', message: 'too long' }] });
    expect(A365PurviewInterceptor.toVerdict({ ...base, allowed: false, evaluated: true, truncated: true, error: 'too long', blockReason: 'Long.' }))
      .toEqual({
        decision: 'deny',
        reason: 'runtime_error:purview_unverified',
        message: 'Long.',
        warnings: [{ reason: 'purview:unverified', message: 'too long' }],
      });
    expect(A365PurviewInterceptor.toVerdict({ ...base, allowed: false, evaluated: false, truncated: false }))
      .toEqual({
        decision: 'deny',
        reason: 'runtime_error:purview_unverified',
        warnings: [{ reason: 'purview:unverified', message: 'no verdict was returned' }],
      });
  });

  it('requires a result', () => {
    expect(() => A365PurviewInterceptor.toVerdict(undefined as never)).toThrow('result is required.');
  });

  it('maps the interception points Purview evaluates', () => {
    expect(['input', 'output', 'pre_tool_call', 'agent_startup', undefined].map(A365PurviewInterceptor.activityOf))
      .toEqual(['uploadText', 'downloadText', undefined, undefined, undefined]);
  });
});

describe('createProtectionEmitter with Purview', () => {
  const timeoutOf = (emitter: unknown): number => (emitter as { timeoutMs: number }).timeoutMs;
  const configuration = (options: ToolingConfigurationOptions) => new DefaultConfigurationProvider(() => new ToolingConfiguration({
    defenderRtpTimeoutMilliseconds: () => 1000,
    ...options,
  }));

  it('times interceptors out after the longer client timeout plus two seconds', () => {
    expect(timeoutOf(createProtectionEmitter({ configProvider: configuration({}) }))).toBe(3000);
    expect(timeoutOf(createProtectionEmitter({
      configProvider: configuration({ isPurviewDlpEnabled: () => true, purviewDlpTimeoutMilliseconds: () => 4000 }),
    }))).toBe(6000);
    expect(timeoutOf(createProtectionEmitter({
      configProvider: configuration({ isPurviewDlpEnabled: () => true, purviewDlpTimeoutMilliseconds: () => 500 }),
    }))).toBe(3000);
  });

  it('ignores the Purview timeout while Purview DLP is disabled', () => {
    const provider = configuration({ isPurviewDlpEnabled: () => false, purviewDlpTimeoutMilliseconds: () => 4000 });

    expect(timeoutOf(createProtectionEmitter({ configProvider: provider }))).toBe(3000);
    expect(() => createProtectionEmitter({ configProvider: provider, interceptorTimeoutMilliseconds: 2000 })).not.toThrow();
  });

  it('reads the Purview timeout from its own configuration when given', () => {
    const purviewConfigProvider = configuration({ isPurviewDlpEnabled: () => true, purviewDlpTimeoutMilliseconds: () => 5000 });

    expect(timeoutOf(createProtectionEmitter({ configProvider: configuration({}), purviewConfigProvider }))).toBe(7000);
  });

  it('requires the interceptor timeout to exceed the Purview timeout when Purview DLP is enabled', () => {
    const provider = configuration({ isPurviewDlpEnabled: () => true, purviewDlpTimeoutMilliseconds: () => 4000 });

    expect(() => createProtectionEmitter({ configProvider: provider, interceptorTimeoutMilliseconds: 4000 }))
      .toThrow('interceptorTimeoutMilliseconds (4000) must exceed the Purview timeout (4000 ms)');
    expect(() => createProtectionEmitter({ configProvider: provider, interceptorTimeoutMilliseconds: 4001 })).not.toThrow();
  });

  it('fails a slow interceptor closed', async () => {
    const slow: Interceptor = { intercept: () => new Promise((resolve) => setTimeout(() => resolve({ decision: 'allow' }), 500)) };
    const emitter = createProtectionEmitter({
      interceptorTimeoutMilliseconds: 50,
      configProvider: configuration({ defenderRtpTimeoutMilliseconds: () => 10, isPurviewDlpEnabled: () => true, purviewDlpTimeoutMilliseconds: () => 20 }),
    }).register(slow, 'slow');

    const record = await emitter.emitUnchecked(builder('conversation-40').input('hello'));

    expect(proceeds(record)).toBe(false);
    expect(record.verdict.reason).toBe('host_error:interceptor_timeout');
  });

  it('requires an emitter and an interceptor', () => {
    const client = new PurviewDlpClient();
    expect(() => addA365Purview(undefined as never, new A365PurviewInterceptor(client, () => null))).toThrow('emitter is required.');
    expect(() => addA365Purview(createProtectionEmitter(), undefined as never)).toThrow('interceptor is required.');
    expect(() => new A365PurviewInterceptor(client, undefined as never)).toThrow('resolveCall is required.');
    expect(() => new A365PurviewInterceptor(undefined as never, () => null)).toThrow('client is required.');
  });
});
