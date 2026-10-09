// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Composition, EnforcementMode, InterceptionEmitter } from '@responsibleai/agent-hooks';
import { IConfigurationProvider } from '@microsoft/agents-a365-runtime';
import { ToolingConfiguration, defaultToolingConfigurationProvider } from '@microsoft/agents-a365-tooling';
import { A365DefenderInterceptor } from './A365DefenderInterceptor';
import { A365PurviewInterceptor } from './A365PurviewInterceptor';

/** Extra time the emitter gives an interceptor beyond the client timeout. */
const INTERCEPTOR_TIMEOUT_MARGIN_MILLISECONDS = 2000;

/** Node's largest timer delay: a longer one fires after 1 ms. */
const MAX_TIMER_MILLISECONDS = 2_147_483_647;

/** Records the emitter keeps in memory (oldest dropped first). */
const MAX_RECORDS = 1000;

/** Options for {@link createProtectionEmitter}. */
export interface A365ProtectionEmitterOptions {
  /**
   * Per-interceptor timeout in milliseconds; it must exceed the Defender timeout and, when Purview DLP is
   * enabled, the Purview timeout. Defaults to the longer of the two plus two seconds, so each client's own
   * timeout and fail mode apply first. It is fixed when the emitter is created: if a timeout can change per
   * request, set it above the largest value, or create the emitter for each turn.
   */
  interceptorTimeoutMilliseconds?: number;
  /**
   * The configuration whose Defender timeout sets the default; defaults to
   * `defaultToolingConfigurationProvider`. Use the provider the `DefenderRtpClient` uses. It also sets the
   * Purview timeout, unless `purviewConfigProvider` is given.
   */
  configProvider?: IConfigurationProvider<ToolingConfiguration>;
  /**
   * The configuration whose Purview timeout, when Purview DLP is enabled in it, also sets the default;
   * defaults to `configProvider`. Use the provider the `PurviewDlpClient` uses.
   */
  purviewConfigProvider?: IConfigurationProvider<ToolingConfiguration>;
}

/**
 * Creates an agent-hooks emitter for Agent 365 protection: `enforce` mode and the
 * `parallel/strictest` profile, so an action proceeds only when every interceptor allows it.
 * Defender and Purview interceptors compose on one emitter, and a deny from either wins.
 * The emitter keeps the last 1000 interception records in memory; drain them with `takeRecords()`
 * or forward them with `setRecordSink()`.
 *
 * The interceptor timeout is read once, when the emitter is created. If the configuration's Defender or
 * Purview timeout can change per request (override functions), create the emitter for each turn from that
 * turn's configuration, or pass an `interceptorTimeoutMilliseconds` above the largest client timeout;
 * otherwise a slow call can end as a timeout deny instead of following the fail mode.
 *
 * @param options The interceptor timeout, or the configuration that sets it.
 * @returns The emitter; register the interceptors with {@link addA365Defender} and {@link addA365Purview}.
 * @throws When `interceptorTimeoutMilliseconds` does not exceed the Defender timeout or, when Purview DLP is
 * enabled, the Purview timeout (the clients must apply their fail mode before the emitter times the
 * interceptor out, which always denies), or is not an integer within Node's timer range (at most
 * 2147483647 ms).
 */
export function createProtectionEmitter(options: A365ProtectionEmitterOptions = {}): InterceptionEmitter {
  const configProvider = options.configProvider ?? defaultToolingConfigurationProvider;
  const defenderTimeout = configProvider.getConfiguration().defenderRtpTimeoutMilliseconds;
  const purviewConfiguration = (options.purviewConfigProvider ?? configProvider).getConfiguration();
  // A disabled Purview client makes no calls, so its timeout does not bound the interceptor.
  const purviewTimeout = purviewConfiguration.isPurviewDlpEnabled ? purviewConfiguration.purviewDlpTimeoutMilliseconds : 0;
  const clientTimeout = Math.max(defenderTimeout, purviewTimeout);
  const timeout = options.interceptorTimeoutMilliseconds ?? clientTimeout + INTERCEPTOR_TIMEOUT_MARGIN_MILLISECONDS;
  if (!Number.isInteger(timeout) || timeout > MAX_TIMER_MILLISECONDS) {
    throw new RangeError(
      `interceptorTimeoutMilliseconds (${timeout}) must be an integer of at most ${MAX_TIMER_MILLISECONDS} ms, `
      + 'Node\'s largest timer delay.',
    );
  }

  if (!(timeout > clientTimeout)) {
    const client = purviewTimeout > defenderTimeout ? 'Purview' : 'Defender';
    throw new RangeError(
      `interceptorTimeoutMilliseconds (${timeout}) must exceed the ${client} timeout (${clientTimeout} ms), `
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

/**
 * Registers the Purview interceptor under the name `purview`.
 *
 * @param emitter The emitter, for example from {@link createProtectionEmitter}.
 * @param interceptor The Purview interceptor.
 * @returns The emitter.
 */
export function addA365Purview(emitter: InterceptionEmitter, interceptor: A365PurviewInterceptor): InterceptionEmitter {
  if (!emitter) {
    throw new TypeError('emitter is required.');
  }

  if (!interceptor) {
    throw new TypeError('interceptor is required.');
  }

  return emitter.register(interceptor, A365PurviewInterceptor.NAME);
}
