// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { ToolingConfiguration } from '../../../packages/agents-a365-tooling/src';

describe('Defender RTP tooling configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ENABLE_A365_DEFENDER_RTP;
    delete process.env.A365_DEFENDER_RTP_ENDPOINT;
    delete process.env.A365_DEFENDER_RTP_AUTHENTICATION_SCOPE;
    delete process.env.A365_DEFENDER_RTP_TIMEOUT_MILLISECONDS;
    delete process.env.A365_DEFENDER_RTP_FAIL_MODE;
    delete process.env.A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('is disabled by default', () => {
    expect(new ToolingConfiguration().isDefenderRtpEnabled).toBe(false);
  });

  it('does not configure an endpoint or customer audience by default', () => {
    const configuration = new ToolingConfiguration();

    expect(configuration.defenderRtpEndpoint).toBe('');
    expect(configuration.defenderRtpAuthenticationScope).toBe('');
  });

  it('requires an endpoint when Defender RTP is enabled', () => {
    const configuration = new ToolingConfiguration({
      isDefenderRtpEnabled: () => true,
    });

    expect(() => configuration.defenderRtpEndpoint).toThrow(
      'defenderRtpEndpoint is required when Defender RTP is enabled.',
    );
  });

  it('does not derive the token scope from an endpoint override', () => {
    const configuration = new ToolingConfiguration({
      defenderRtpEndpoint: () => ' https://defender.example.test/v1/analyze ',
    });

    expect(configuration.defenderRtpEndpoint)
      .toBe('https://defender.example.test/v1/analyze');
    expect(configuration.defenderRtpAuthenticationScope).toBe('');
  });

  it('defaults to fail open and supports fail-closed configuration', () => {
    expect(new ToolingConfiguration().defenderRtpFailClosed).toBe(false);

    process.env.A365_DEFENDER_RTP_FAIL_MODE = 'closed';
    expect(new ToolingConfiguration().defenderRtpFailClosed).toBe(true);

    expect(new ToolingConfiguration({
      defenderRtpFailClosed: () => false,
    }).defenderRtpFailClosed).toBe(false);
  });

  it('uses draft timeout/content defaults and supports overrides', () => {
    const configuration = new ToolingConfiguration();
    expect(configuration.defenderRtpTimeoutMilliseconds).toBe(10000);
    expect(configuration.defenderRtpMaxContentCharacters).toBe(20000);

    expect(new ToolingConfiguration({
      defenderRtpTimeoutMilliseconds: () => 500,
      defenderRtpMaxContentCharacters: () => 1000,
    }).defenderRtpTimeoutMilliseconds).toBe(500);
    expect(new ToolingConfiguration({
      defenderRtpMaxContentCharacters: () => 1000,
    }).defenderRtpMaxContentCharacters).toBe(1000);
  });

  it('rejects invalid numeric overrides', () => {
    expect(() => new ToolingConfiguration({
      defenderRtpTimeoutMilliseconds: () => 0,
    }).defenderRtpTimeoutMilliseconds).toThrow(
      'defenderRtpTimeoutMilliseconds must be a positive integer.',
    );
    expect(() => new ToolingConfiguration({
      defenderRtpMaxContentCharacters: () => 0,
    }).defenderRtpMaxContentCharacters).toThrow(
      'defenderRtpMaxContentCharacters must be a positive integer.',
    );
  });
});
