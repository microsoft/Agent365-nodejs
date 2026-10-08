// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Composition, EnforcementMode, InterceptionEmitter } from '@responsibleai/agent-hooks';
import { IConfigurationProvider } from '@microsoft/agents-a365-runtime';
import { ToolingConfiguration, defaultToolingConfigurationProvider } from '@microsoft/agents-a365-tooling';
import { A365DefenderInterceptor } from './A365DefenderInterceptor';

/** Extra time the emitter gives an interceptor beyond the Defender timeout. */
const INTERCEPTOR_TIMEOUT_MARGIN_MILLISECONDS = 2000;

/** Node's largest timer delay: a longer one fires after 1 ms. */
const MAX_TIMER_MILLISECONDS = 2_147_483_647;

/** Records the emitter keeps in memory (oldest dropped first). */
const MAX_RECORDS = 1000;

/** Options for {@link createProtectionEmitter}. */
export interface A365ProtectionEmitterOptions {
  /**
   * Per-interceptor timeout in milliseconds; it must exceed the Defender timeout. Defaults to the
   * Defender timeout plus two seconds, so the client's own timeout and fail mode apply first. It is
   * fixed when the emitter is created: if the Defender timeout can change per request, set it above
   * the largest value, or create the emitter for each turn.
   */
  interceptorTimeoutMilliseconds?: number;
  /**
   * The configuration whose Defender timeout sets the default; defaults to
   * `defaultToolingConfigurationProvider`. Use the provider the `DefenderRtpClient` uses.
   */
  configProvider?: IConfigurationProvider<ToolingConfiguration>;
}

/**
 * Creates an agent-hooks emitter for Agent 365 protection: `enforce` mode and the
 * `parallel/strictest` profile, so an action proceeds only when every interceptor allows it.
 * The emitter keeps the last 1000 interception records in memory; drain them with `takeRecords()`
 * or forward them with `setRecordSink()`.
 *
 * The interceptor timeout is read once, when the emitter is created. If the configuration's Defender
 * timeout can change per request (override functions), create the emitter for each turn from that
 * turn's configuration, or pass an `interceptorTimeoutMilliseconds` above the largest Defender
 * timeout; otherwise a slow call can end as a timeout deny instead of following the fail mode.
 *
 * @param options The interceptor timeout, or the configuration that sets it.
 * @returns The emitter; register the Defender interceptor with {@link addA365Defender}.
 * @throws When `interceptorTimeoutMilliseconds` does not exceed the Defender timeout (the client must
 * apply its fail mode before the emitter times the interceptor out, which always denies), or is not an
 * integer within Node's timer range (at most 2147483647 ms).
 */
export function createProtectionEmitter(options: A365ProtectionEmitterOptions = {}): InterceptionEmitter {
  const defenderTimeout = (options.configProvider ?? defaultToolingConfigurationProvider)
    .getConfiguration().defenderRtpTimeoutMilliseconds;
  const timeout = options.interceptorTimeoutMilliseconds ?? defenderTimeout + INTERCEPTOR_TIMEOUT_MARGIN_MILLISECONDS;
  if (!Number.isInteger(timeout) || timeout > MAX_TIMER_MILLISECONDS) {
    throw new RangeError(
      `interceptorTimeoutMilliseconds (${timeout}) must be an integer of at most ${MAX_TIMER_MILLISECONDS} ms, `
      + 'Node\'s largest timer delay.',
    );
  }

  if (!(timeout > defenderTimeout)) {
    throw new RangeError(
      `interceptorTimeoutMilliseconds (${timeout}) must exceed the Defender timeout (${defenderTimeout} ms), `
      + 'so the fail mode applies before the emitter times out.',
    );
  }

  return new InterceptionEmitter(EnforcementMode.Enforce, null, timeout)
    .setComposition(Composition.strictest('deny'))
    .setMaxRecords(MAX_RECORDS);
}

/**
 * Registers the Defender interceptor under the name `defender`.
 *
 * @param emitter The emitter, for example from {@link createProtectionEmitter}.
 * @param interceptor The Defender interceptor.
 * @returns The emitter.
 */
export function addA365Defender(emitter: InterceptionEmitter, interceptor: A365DefenderInterceptor): InterceptionEmitter {
  if (!emitter) {
    throw new TypeError('emitter is required.');
  }

  if (!interceptor) {
    throw new TypeError('interceptor is required.');
  }

  return emitter.register(interceptor, A365DefenderInterceptor.NAME);
}
