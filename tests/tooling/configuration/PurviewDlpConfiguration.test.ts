// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { ToolingConfiguration } from '../../../packages/agents-a365-tooling/src';

describe('Purview DLP tooling configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ENABLE_A365_PURVIEW_DLP;
    delete process.env.A365_PURVIEW_DLP_GRAPH_BASE_URL;
    delete process.env.A365_PURVIEW_DLP_AUTHENTICATION_SCOPE;
    delete process.env.A365_PURVIEW_DLP_TIMEOUT_MILLISECONDS;
    delete process.env.A365_PURVIEW_DLP_FAIL_MODE;
    delete process.env.A365_PURVIEW_DLP_MAX_CONTENT_CHARACTERS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('is disabled by default', () => {
    expect(new ToolingConfiguration().isPurviewDlpEnabled).toBe(false);
  });

  it('enables via env and override', () => {
    process.env.ENABLE_A365_PURVIEW_DLP = 'true';
    expect(new ToolingConfiguration().isPurviewDlpEnabled).toBe(true);

    expect(new ToolingConfiguration({
      isPurviewDlpEnabled: () => false,
    }).isPurviewDlpEnabled).toBe(false);
  });

  it('defaults the Graph base URL and resource scope', () => {
    const configuration = new ToolingConfiguration();

    expect(configuration.purviewDlpGraphBaseUrl).toBe('https://graph.microsoft.com/beta');
    expect(configuration.purviewDlpAuthenticationScope)
      .toBe('https://graph.microsoft.com/.default');
  });

  it('normalizes a Graph base URL override and env value', () => {
    expect(new ToolingConfiguration({
      purviewDlpGraphBaseUrl: () => ' https://graph.example.test/v1/ ',
    }).purviewDlpGraphBaseUrl).toBe('https://graph.example.test/v1');

    process.env.A365_PURVIEW_DLP_GRAPH_BASE_URL = 'https://graph.example.test/beta/';
    expect(new ToolingConfiguration().purviewDlpGraphBaseUrl)
      .toBe('https://graph.example.test/beta');
  });

  it('reads the authentication scope from env and override', () => {
    process.env.A365_PURVIEW_DLP_AUTHENTICATION_SCOPE = 'api://custom/.default';
    expect(new ToolingConfiguration().purviewDlpAuthenticationScope)
      .toBe('api://custom/.default');

    expect(new ToolingConfiguration({
      purviewDlpAuthenticationScope: () => 'api://override/.default',
    }).purviewDlpAuthenticationScope).toBe('api://override/.default');
  });

  it('defaults to fail open and supports fail-closed configuration', () => {
    expect(new ToolingConfiguration().purviewDlpFailClosed).toBe(false);

    process.env.A365_PURVIEW_DLP_FAIL_MODE = 'closed';
    expect(new ToolingConfiguration().purviewDlpFailClosed).toBe(true);

    expect(new ToolingConfiguration({
      purviewDlpFailClosed: () => false,
    }).purviewDlpFailClosed).toBe(false);
  });

  it('uses timeout/content defaults and supports overrides', () => {
    const configuration = new ToolingConfiguration();
    expect(configuration.purviewDlpTimeoutMilliseconds).toBe(10000);
    expect(configuration.purviewDlpMaxContentCharacters).toBe(100000);

    expect(new ToolingConfiguration({
      purviewDlpTimeoutMilliseconds: () => 500,
    }).purviewDlpTimeoutMilliseconds).toBe(500);
    expect(new ToolingConfiguration({
      purviewDlpMaxContentCharacters: () => 1000,
    }).purviewDlpMaxContentCharacters).toBe(1000);
  });

  it('rejects invalid numeric overrides', () => {
    expect(() => new ToolingConfiguration({
      purviewDlpTimeoutMilliseconds: () => 0,
    }).purviewDlpTimeoutMilliseconds).toThrow(
      'purviewDlpTimeoutMilliseconds must be a positive integer.',
    );
    expect(() => new ToolingConfiguration({
      purviewDlpMaxContentCharacters: () => -5,
    }).purviewDlpMaxContentCharacters).toThrow(
      'purviewDlpMaxContentCharacters must be a positive integer.',
    );
  });
});
