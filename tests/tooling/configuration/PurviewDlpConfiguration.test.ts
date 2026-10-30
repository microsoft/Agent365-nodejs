// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import {
  DEFAULT_PURVIEW_DLP_AUTHENTICATION_SCOPE,
  DEFAULT_PURVIEW_DLP_GRAPH_BASE_URL,
  PurviewDlpResponseMode,
  ToolingConfiguration,
} from '../../../packages/agents-a365-tooling/src';
import { PURVIEW_ENVIRONMENT_VARIABLES } from '../fixtures/purview';

describe('Purview DLP tooling configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const name of PURVIEW_ENVIRONMENT_VARIABLES) delete process.env[name];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('is disabled by default, fails open and audits replies', () => {
    const configuration = new ToolingConfiguration();

    expect(configuration.isPurviewDlpEnabled).toBe(false);
    expect(configuration.purviewDlpFailClosed).toBe(false);
    expect(configuration.purviewDlpResponseMode).toBe('audit');
  });

  it('defaults to Microsoft Graph v1.0, the Graph scope, a 10 second timeout and 100000 characters', () => {
    const configuration = new ToolingConfiguration();

    expect(DEFAULT_PURVIEW_DLP_GRAPH_BASE_URL).toBe('https://graph.microsoft.com/v1.0');
    expect(DEFAULT_PURVIEW_DLP_AUTHENTICATION_SCOPE).toBe('https://graph.microsoft.com/.default');
    expect(configuration.purviewDlpGraphBaseUrl).toBe(DEFAULT_PURVIEW_DLP_GRAPH_BASE_URL);
    expect(configuration.purviewDlpAuthenticationScope).toBe(DEFAULT_PURVIEW_DLP_AUTHENTICATION_SCOPE);
    expect(configuration.purviewDlpTimeoutMilliseconds).toBe(10000);
    expect(configuration.purviewDlpMaxContentCharacters).toBe(100000);
  });

  it('reads the settings from the environment', () => {
    process.env.ENABLE_A365_PURVIEW_DLP = 'true';
    process.env.A365_PURVIEW_DLP_GRAPH_BASE_URL = ' https://graph.example.test/beta/ ';
    process.env.A365_PURVIEW_DLP_AUTHENTICATION_SCOPE = ' https://graph.example.test/.default ';
    process.env.A365_PURVIEW_DLP_FAIL_MODE = 'CLOSED';
    process.env.A365_PURVIEW_DLP_TIMEOUT_MILLISECONDS = '1500';
    process.env.A365_PURVIEW_DLP_MAX_CONTENT_CHARACTERS = '100';
    process.env.A365_PURVIEW_DLP_RESPONSE_MODE = ' Enforce ';

    const configuration = new ToolingConfiguration();

    expect(configuration.isPurviewDlpEnabled).toBe(true);
    expect(configuration.purviewDlpGraphBaseUrl).toBe('https://graph.example.test/beta');
    expect(configuration.purviewDlpAuthenticationScope).toBe('https://graph.example.test/.default');
    expect(configuration.purviewDlpFailClosed).toBe(true);
    expect(configuration.purviewDlpTimeoutMilliseconds).toBe(1500);
    expect(configuration.purviewDlpMaxContentCharacters).toBe(100);
    expect(configuration.purviewDlpResponseMode).toBe('enforce');
  });

  it('prefers overrides to the environment', () => {
    process.env.ENABLE_A365_PURVIEW_DLP = 'true';
    process.env.A365_PURVIEW_DLP_FAIL_MODE = 'closed';
    process.env.A365_PURVIEW_DLP_RESPONSE_MODE = 'enforce';
    process.env.A365_PURVIEW_DLP_GRAPH_BASE_URL = 'https://env.example.test/v1.0';

    const configuration = new ToolingConfiguration({
      isPurviewDlpEnabled: () => false,
      purviewDlpFailClosed: () => false,
      purviewDlpGraphBaseUrl: () => 'https://override.example.test/v1.0/',
      purviewDlpAuthenticationScope: () => 'https://override.example.test/.default',
      purviewDlpTimeoutMilliseconds: () => 500,
      purviewDlpMaxContentCharacters: () => 1000,
      purviewDlpResponseMode: () => 'audit',
    });

    expect(configuration.isPurviewDlpEnabled).toBe(false);
    expect(configuration.purviewDlpFailClosed).toBe(false);
    expect(configuration.purviewDlpGraphBaseUrl).toBe('https://override.example.test/v1.0');
    expect(configuration.purviewDlpAuthenticationScope).toBe('https://override.example.test/.default');
    expect(configuration.purviewDlpTimeoutMilliseconds).toBe(500);
    expect(configuration.purviewDlpMaxContentCharacters).toBe(1000);
    expect(configuration.purviewDlpResponseMode).toBe('audit');
  });

  it('falls back to the defaults for blank values, and rejects non-positive ones', () => {
    process.env.A365_PURVIEW_DLP_TIMEOUT_MILLISECONDS = ' ';
    process.env.A365_PURVIEW_DLP_MAX_CONTENT_CHARACTERS = '';
    const configuration = new ToolingConfiguration({
      purviewDlpGraphBaseUrl: () => ' ',
      purviewDlpAuthenticationScope: () => ' ',
    });

    expect(configuration.purviewDlpTimeoutMilliseconds).toBe(10000);
    expect(configuration.purviewDlpMaxContentCharacters).toBe(100000);
    expect(configuration.purviewDlpGraphBaseUrl).toBe(DEFAULT_PURVIEW_DLP_GRAPH_BASE_URL);
    expect(configuration.purviewDlpAuthenticationScope).toBe(DEFAULT_PURVIEW_DLP_AUTHENTICATION_SCOPE);
    expect(() => new ToolingConfiguration({ purviewDlpTimeoutMilliseconds: () => 0 }).purviewDlpTimeoutMilliseconds)
      .toThrow('purviewDlpTimeoutMilliseconds must be a positive integer of at most 2147481647.');
    expect(() => new ToolingConfiguration({ purviewDlpMaxContentCharacters: () => -1 }).purviewDlpMaxContentCharacters)
      .toThrow('purviewDlpMaxContentCharacters must be a positive integer of at most 2147483647.');
    expect(() => new ToolingConfiguration({ purviewDlpMaxContentCharacters: () => 1.5 }).purviewDlpMaxContentCharacters)
      .toThrow('purviewDlpMaxContentCharacters must be a positive integer of at most 2147483647.');

    process.env.A365_PURVIEW_DLP_TIMEOUT_MILLISECONDS = '0';
    process.env.A365_PURVIEW_DLP_MAX_CONTENT_CHARACTERS = '0';
    expect(() => new ToolingConfiguration().purviewDlpTimeoutMilliseconds)
      .toThrow('purviewDlpTimeoutMilliseconds must be a positive integer of at most 2147481647.');
    expect(() => new ToolingConfiguration().purviewDlpMaxContentCharacters)
      .toThrow('purviewDlpMaxContentCharacters must be a positive integer of at most 2147483647.');
  });

  it('accepts a maximum content size of exactly 2147483647', () => {
    expect(new ToolingConfiguration({ purviewDlpMaxContentCharacters: () => 2_147_483_647 }).purviewDlpMaxContentCharacters)
      .toBe(2_147_483_647);

    process.env.A365_PURVIEW_DLP_MAX_CONTENT_CHARACTERS = '2147483647';
    expect(new ToolingConfiguration().purviewDlpMaxContentCharacters).toBe(2_147_483_647);
  });

  it.each([
    ['308 nines, which is finite but overflows the reading budget to Infinity', '9'.repeat(308)],
    ['309 nines, which is Infinity', '9'.repeat(309)],
    ['one above the cap', '2147483648'],
  ])('rejects a maximum content size of %s', (_name, value) => {
    process.env.A365_PURVIEW_DLP_MAX_CONTENT_CHARACTERS = value;

    expect(() => new ToolingConfiguration().purviewDlpMaxContentCharacters)
      .toThrow('purviewDlpMaxContentCharacters must be a positive integer of at most 2147483647.');
    expect(() => new ToolingConfiguration({ purviewDlpMaxContentCharacters: () => Number(value) }).purviewDlpMaxContentCharacters)
      .toThrow('purviewDlpMaxContentCharacters must be a positive integer of at most 2147483647.');
  });

  it.each(['soon', '10s', '10seconds', '1.5', '-5', '1e3', '+5', '0x10'])(
    'rejects a number setting that is not a whole number (%s), rather than reading its leading digits',
    (value) => {
      process.env.A365_PURVIEW_DLP_TIMEOUT_MILLISECONDS = value;
      process.env.A365_PURVIEW_DLP_MAX_CONTENT_CHARACTERS = value;
      const configuration = new ToolingConfiguration();

      expect(() => configuration.purviewDlpTimeoutMilliseconds).toThrow('A365_PURVIEW_DLP_TIMEOUT_MILLISECONDS must be a whole number.');
      expect(() => configuration.purviewDlpMaxContentCharacters).toThrow('A365_PURVIEW_DLP_MAX_CONTENT_CHARACTERS must be a whole number.');
    },
  );

  it('reads whole numbers with surrounding spaces or leading zeros', () => {
    process.env.A365_PURVIEW_DLP_TIMEOUT_MILLISECONDS = ' 2500 ';
    process.env.A365_PURVIEW_DLP_MAX_CONTENT_CHARACTERS = '0100';

    expect(new ToolingConfiguration().purviewDlpTimeoutMilliseconds).toBe(2500);
    expect(new ToolingConfiguration().purviewDlpMaxContentCharacters).toBe(100);
  });

  it('rejects a timeout beyond the timer range, which would fire after 1 ms', () => {
    expect(new ToolingConfiguration({ purviewDlpTimeoutMilliseconds: () => 2_147_481_647 }).purviewDlpTimeoutMilliseconds)
      .toBe(2_147_481_647);
    expect(() => new ToolingConfiguration({ purviewDlpTimeoutMilliseconds: () => 2_147_481_648 }).purviewDlpTimeoutMilliseconds)
      .toThrow('purviewDlpTimeoutMilliseconds must be a positive integer of at most 2147481647.');

    process.env.A365_PURVIEW_DLP_TIMEOUT_MILLISECONDS = '99999999999';
    expect(() => new ToolingConfiguration().purviewDlpTimeoutMilliseconds)
      .toThrow('purviewDlpTimeoutMilliseconds must be a positive integer of at most 2147481647.');
  });

  it.each([
    ['true', true], ['1', true], ['YES', true], [' on ', true],
    ['false', false], ['0', false], ['No', false], ['off', false], ['', false],
  ])('reads ENABLE_A365_PURVIEW_DLP=%j', (value, enabled) => {
    process.env.ENABLE_A365_PURVIEW_DLP = value;

    expect(new ToolingConfiguration().isPurviewDlpEnabled).toBe(enabled);
  });

  it.each(['enabled', 'ture', '2', 'y'])('rejects ENABLE_A365_PURVIEW_DLP=%s rather than leaving protection off', (value) => {
    process.env.ENABLE_A365_PURVIEW_DLP = value;

    expect(() => new ToolingConfiguration().isPurviewDlpEnabled)
      .toThrow('ENABLE_A365_PURVIEW_DLP must be true or false (or 1/0, yes/no, on/off).');
  });

  it.each([
    ['open', false],
    [' Open ', false],
    ['', false],
    ['closed', true],
    [' CLOSED ', true],
  ])('reads A365_PURVIEW_DLP_FAIL_MODE=%j', (mode, failClosed) => {
    process.env.A365_PURVIEW_DLP_FAIL_MODE = mode;

    expect(new ToolingConfiguration().purviewDlpFailClosed).toBe(failClosed);
  });

  it.each(['clsoed', 'fail-closed', 'true', 'block'])('rejects A365_PURVIEW_DLP_FAIL_MODE=%s rather than failing open', (mode) => {
    process.env.A365_PURVIEW_DLP_FAIL_MODE = mode;

    expect(() => new ToolingConfiguration().purviewDlpFailClosed).toThrow("A365_PURVIEW_DLP_FAIL_MODE must be 'open' or 'closed'.");
  });

  it.each([
    ['audit', 'audit'],
    [' AUDIT ', 'audit'],
    ['', 'audit'],
    ['enforce', 'enforce'],
    ['Enforce', 'enforce'],
  ])('reads A365_PURVIEW_DLP_RESPONSE_MODE=%j', (value, mode) => {
    process.env.A365_PURVIEW_DLP_RESPONSE_MODE = value;

    expect(new ToolingConfiguration().purviewDlpResponseMode).toBe(mode);
  });

  it.each(['block', 'enforced', 'true', 'audit-only'])('rejects A365_PURVIEW_DLP_RESPONSE_MODE=%s', (value) => {
    process.env.A365_PURVIEW_DLP_RESPONSE_MODE = value;

    expect(() => new ToolingConfiguration().purviewDlpResponseMode)
      .toThrow("A365_PURVIEW_DLP_RESPONSE_MODE must be 'audit' or 'enforce'.");
  });

  it('rejects a response mode override that is not audit or enforce', () => {
    const configuration = new ToolingConfiguration({ purviewDlpResponseMode: () => 'Enforce' as PurviewDlpResponseMode });

    expect(() => configuration.purviewDlpResponseMode).toThrow("A365_PURVIEW_DLP_RESPONSE_MODE must be 'audit' or 'enforce'.");
  });
});
