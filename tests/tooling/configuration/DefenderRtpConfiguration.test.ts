// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import {
  DEFAULT_DEFENDER_RTP_AUTHENTICATION_SCOPE,
  DEFENDER_RTP_API_APP_ID,
  ToolingConfiguration,
} from '../../../packages/agents-a365-tooling/src';
import { DEFENDER_ENVIRONMENT_VARIABLES } from '../fixtures/defender';

describe('Defender RTP tooling configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const name of DEFENDER_ENVIRONMENT_VARIABLES) delete process.env[name];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('is disabled by default, fails open, and has no endpoint', () => {
    const configuration = new ToolingConfiguration();

    expect(configuration.isDefenderRtpEnabled).toBe(false);
    expect(configuration.defenderRtpFailClosed).toBe(false);
    expect(configuration.defenderRtpEndpoint).toBe('');
  });

  it('defaults to the Defender API scope, a 10 second timeout and 20000 characters', () => {
    const configuration = new ToolingConfiguration();

    expect(DEFENDER_RTP_API_APP_ID).toBe('86a21212-634e-4553-b3d6-e477e4c9d9ec');
    expect(DEFAULT_DEFENDER_RTP_AUTHENTICATION_SCOPE).toBe('api://86a21212-634e-4553-b3d6-e477e4c9d9ec/.default');
    expect(configuration.defenderRtpAuthenticationScope).toBe(DEFAULT_DEFENDER_RTP_AUTHENTICATION_SCOPE);
    expect(configuration.defenderRtpTimeoutMilliseconds).toBe(10000);
    expect(configuration.defenderRtpMaxContentCharacters).toBe(20000);
  });

  it('reads the settings from the environment', () => {
    process.env.ENABLE_A365_DEFENDER_RTP = 'true';
    process.env.A365_DEFENDER_RTP_ENDPOINT = ' https://prevention.example.test/v1/protection/evaluate/ ';
    process.env.A365_DEFENDER_RTP_FAIL_MODE = 'CLOSED';
    process.env.A365_DEFENDER_RTP_TIMEOUT_MILLISECONDS = '1500';
    process.env.A365_DEFENDER_RTP_AUTHENTICATION_SCOPE = ' api://dev-defender-api/.default ';
    process.env.A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS = '100';

    const configuration = new ToolingConfiguration();

    expect(configuration.isDefenderRtpEnabled).toBe(true);
    expect(configuration.defenderRtpEndpoint).toBe('https://prevention.example.test/v1/protection/evaluate');
    expect(configuration.defenderRtpFailClosed).toBe(true);
    expect(configuration.defenderRtpTimeoutMilliseconds).toBe(1500);
    expect(configuration.defenderRtpAuthenticationScope).toBe('api://dev-defender-api/.default');
    expect(configuration.defenderRtpMaxContentCharacters).toBe(100);
  });

  it('prefers overrides to the environment', () => {
    process.env.ENABLE_A365_DEFENDER_RTP = 'true';
    process.env.A365_DEFENDER_RTP_FAIL_MODE = 'closed';
    process.env.A365_DEFENDER_RTP_ENDPOINT = 'https://env.example.test/v1/protection/evaluate';

    const configuration = new ToolingConfiguration({
      isDefenderRtpEnabled: () => false,
      defenderRtpFailClosed: () => false,
      defenderRtpEndpoint: () => 'https://override.example.test/v1/protection/evaluate',
      defenderRtpAuthenticationScope: () => 'api://other/.default',
      defenderRtpTimeoutMilliseconds: () => 500,
      defenderRtpMaxContentCharacters: () => 1000,
    });

    expect(configuration.isDefenderRtpEnabled).toBe(false);
    expect(configuration.defenderRtpFailClosed).toBe(false);
    expect(configuration.defenderRtpEndpoint).toBe('https://override.example.test/v1/protection/evaluate');
    expect(configuration.defenderRtpAuthenticationScope).toBe('api://other/.default');
    expect(configuration.defenderRtpTimeoutMilliseconds).toBe(500);
    expect(configuration.defenderRtpMaxContentCharacters).toBe(1000);
  });

  it('requires an endpoint when Defender RTP is enabled', () => {
    const configuration = new ToolingConfiguration({ isDefenderRtpEnabled: () => true });

    expect(() => configuration.defenderRtpEndpoint).toThrow(
      'defenderRtpEndpoint is required when Defender RTP is enabled. Set A365_DEFENDER_RTP_ENDPOINT',
    );
  });

  it('rejects non-positive values', () => {
    expect(() => new ToolingConfiguration({ defenderRtpTimeoutMilliseconds: () => 0 }).defenderRtpTimeoutMilliseconds)
      .toThrow('defenderRtpTimeoutMilliseconds must be a positive integer of at most 2147481647.');
    expect(() => new ToolingConfiguration({ defenderRtpMaxContentCharacters: () => -1 }).defenderRtpMaxContentCharacters)
      .toThrow('defenderRtpMaxContentCharacters must be a positive integer of at most 2147483647.');

    process.env.A365_DEFENDER_RTP_TIMEOUT_MILLISECONDS = '0';
    process.env.A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS = '0';
    expect(() => new ToolingConfiguration().defenderRtpTimeoutMilliseconds)
      .toThrow('defenderRtpTimeoutMilliseconds must be a positive integer of at most 2147481647.');
    expect(() => new ToolingConfiguration().defenderRtpMaxContentCharacters)
      .toThrow('defenderRtpMaxContentCharacters must be a positive integer of at most 2147483647.');
  });

  it('accepts a maximum content size of exactly 2147483647', () => {
    expect(new ToolingConfiguration({ defenderRtpMaxContentCharacters: () => 2_147_483_647 }).defenderRtpMaxContentCharacters)
      .toBe(2_147_483_647);

    process.env.A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS = '2147483647';
    expect(new ToolingConfiguration().defenderRtpMaxContentCharacters).toBe(2_147_483_647);
  });

  it.each([
    ['308 nines, which is finite but overflows the budget to Infinity', '9'.repeat(308)],
    ['309 nines, which is Infinity', '9'.repeat(309)],
    ['one above the cap', '2147483648'],
  ])('rejects a maximum content size of %s', (_name, value) => {
    process.env.A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS = value;

    expect(() => new ToolingConfiguration().defenderRtpMaxContentCharacters)
      .toThrow('defenderRtpMaxContentCharacters must be a positive integer of at most 2147483647.');
    expect(() => new ToolingConfiguration({ defenderRtpMaxContentCharacters: () => Number(value) }).defenderRtpMaxContentCharacters)
      .toThrow('defenderRtpMaxContentCharacters must be a positive integer of at most 2147483647.');
  });

  const wholeNumberSettings: Array<[string, 'defenderRtpTimeoutMilliseconds' | 'defenderRtpMaxContentCharacters', number]> = [
    ['A365_DEFENDER_RTP_TIMEOUT_MILLISECONDS', 'defenderRtpTimeoutMilliseconds', 10000],
    ['A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS', 'defenderRtpMaxContentCharacters', 20000],
  ];

  describe.each(wholeNumberSettings)('%s', (variable, property, defaultValue) => {
    it.each(['10s', '1e4', '10.5', '-5', '+5', '0x10', '1_000', 'soon'])(
      'rejects %j, which parseInt would read as a number or NaN',
      (value) => {
        process.env[variable] = value;

        expect(() => new ToolingConfiguration()[property]).toThrow(`${variable} must be a whole number.`);
      },
    );

    it.each(['', '   '])('uses the default for a blank value (%j)', (value) => {
      process.env[variable] = value;

      expect(new ToolingConfiguration()[property]).toBe(defaultValue);
    });

    it('reads a whole number, ignoring surrounding spaces', () => {
      process.env[variable] = ' 1500 ';

      expect(new ToolingConfiguration()[property]).toBe(1500);
    });

    it('prefers an override to an invalid environment value', () => {
      process.env[variable] = '10s';
      const configuration = new ToolingConfiguration({
        defenderRtpTimeoutMilliseconds: () => 1500,
        defenderRtpMaxContentCharacters: () => 1500,
      });

      expect(configuration[property]).toBe(1500);
    });
  });

  it('rejects a timeout beyond the timer range, which would fire after 1 ms', () => {
    expect(new ToolingConfiguration({ defenderRtpTimeoutMilliseconds: () => 2_147_481_647 }).defenderRtpTimeoutMilliseconds)
      .toBe(2_147_481_647);
    expect(() => new ToolingConfiguration({ defenderRtpTimeoutMilliseconds: () => 2_147_481_648 }).defenderRtpTimeoutMilliseconds)
      .toThrow('defenderRtpTimeoutMilliseconds must be a positive integer of at most 2147481647.');

    process.env.A365_DEFENDER_RTP_TIMEOUT_MILLISECONDS = '99999999999';
    expect(() => new ToolingConfiguration().defenderRtpTimeoutMilliseconds)
      .toThrow('defenderRtpTimeoutMilliseconds must be a positive integer of at most 2147481647.');
  });

  it.each([
    ['open', false],
    [' Open ', false],
    ['', false],
    ['closed', true],
    [' CLOSED ', true],
  ])('reads A365_DEFENDER_RTP_FAIL_MODE=%j', (mode, failClosed) => {
    process.env.A365_DEFENDER_RTP_FAIL_MODE = mode;

    expect(new ToolingConfiguration().defenderRtpFailClosed).toBe(failClosed);
  });

  it.each([
    ['true', true], ['1', true], ['YES', true], [' on ', true],
    ['false', false], ['0', false], ['No', false], ['off', false], ['', false],
  ])('reads ENABLE_A365_DEFENDER_RTP=%j', (value, enabled) => {
    process.env.ENABLE_A365_DEFENDER_RTP = value;

    expect(new ToolingConfiguration().isDefenderRtpEnabled).toBe(enabled);
  });

  it.each(['enabled', 'ture', '2', 'y'])('rejects ENABLE_A365_DEFENDER_RTP=%s rather than leaving protection off', (value) => {
    process.env.ENABLE_A365_DEFENDER_RTP = value;

    expect(() => new ToolingConfiguration().isDefenderRtpEnabled)
      .toThrow('ENABLE_A365_DEFENDER_RTP must be true or false (or 1/0, yes/no, on/off).');
  });

  it.each(['clsoed', 'fail-closed', 'true', 'block'])('rejects A365_DEFENDER_RTP_FAIL_MODE=%s rather than failing open', (mode) => {
    process.env.A365_DEFENDER_RTP_FAIL_MODE = mode;

    expect(() => new ToolingConfiguration().defenderRtpFailClosed).toThrow("A365_DEFENDER_RTP_FAIL_MODE must be 'open' or 'closed'.");
  });
});
