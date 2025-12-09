// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { isAgent365TelemetryEnabled } from '../../../packages/agents-a365-observability/src/tracing/util';

describe('isAgent365TelemetryEnabled', () => {
  const ENV = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ENV };
    delete process.env.ENABLE_OBSERVABILITY;
    delete process.env.ENABLE_A365_OBSERVABILITY;
  });
  afterEach(() => {
    process.env = ENV;
  });

  it('returns true when both env vars are undefined (default)', () => {
    expect(isAgent365TelemetryEnabled()).toBe(true);
  });

  it('returns false when ENABLE_OBSERVABILITY is "false"', () => {
    process.env.ENABLE_OBSERVABILITY = 'false';
    expect(isAgent365TelemetryEnabled()).toBe(false);
  });

  it('returns false when ENABLE_OBSERVABILITY is "0"', () => {
    process.env.ENABLE_OBSERVABILITY = '0';
    expect(isAgent365TelemetryEnabled()).toBe(false);
  });

  it('returns false when ENABLE_A365_OBSERVABILITY is "false"', () => {
    process.env.ENABLE_A365_OBSERVABILITY = 'false';
    expect(isAgent365TelemetryEnabled()).toBe(false);
  });

  it('returns false when ENABLE_A365_OBSERVABILITY is "0"', () => {
    process.env.ENABLE_A365_OBSERVABILITY = '0';
    expect(isAgent365TelemetryEnabled()).toBe(false);
  });

  it('returns true when ENABLE_OBSERVABILITY is "true"', () => {
    process.env.ENABLE_OBSERVABILITY = 'true';
    expect(isAgent365TelemetryEnabled()).toBe(true);
  });

  it('returns true when ENABLE_A365_OBSERVABILITY is "1"', () => {
    process.env.ENABLE_A365_OBSERVABILITY = '1';
    expect(isAgent365TelemetryEnabled()).toBe(true);
  });

  it('returns true for other values ("yes", "enabled")', () => {
    process.env.ENABLE_OBSERVABILITY = 'yes';
    expect(isAgent365TelemetryEnabled()).toBe(true);
    process.env.ENABLE_A365_OBSERVABILITY = 'enabled';
    expect(isAgent365TelemetryEnabled()).toBe(true);
  });
});
