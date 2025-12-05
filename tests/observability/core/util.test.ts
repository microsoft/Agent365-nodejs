// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { isAgent365TelemetryEnabled, isAgent365ExporterEnabled } from '@microsoft/agents-a365-observability/src/tracing/util';
import { OpenTelemetryConstants } from '@microsoft/agents-a365-observability/src/tracing/constants';

describe('Observability Utility Functions', () => {
  describe('isAgent365TelemetryEnabled', () => {
    beforeEach(() => {
      // Clear all relevant environment variables before each test
      delete process.env[OpenTelemetryConstants.ENABLE_OBSERVABILITY];
      delete process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY];
    });

    it('should return true by default when no environment variables are set', () => {
      expect(isAgent365TelemetryEnabled()).toBe(true);
    });

    it('should return false when ENABLE_OBSERVABILITY is explicitly set to false', () => {
      process.env[OpenTelemetryConstants.ENABLE_OBSERVABILITY] = 'false';
      expect(isAgent365TelemetryEnabled()).toBe(false);
    });

    it('should return false when ENABLE_OBSERVABILITY is set to 0', () => {
      process.env[OpenTelemetryConstants.ENABLE_OBSERVABILITY] = '0';
      expect(isAgent365TelemetryEnabled()).toBe(false);
    });

    it('should return false when ENABLE_OBSERVABILITY is set to no', () => {
      process.env[OpenTelemetryConstants.ENABLE_OBSERVABILITY] = 'no';
      expect(isAgent365TelemetryEnabled()).toBe(false);
    });

    it('should return false when ENABLE_OBSERVABILITY is set to off', () => {
      process.env[OpenTelemetryConstants.ENABLE_OBSERVABILITY] = 'off';
      expect(isAgent365TelemetryEnabled()).toBe(false);
    });

    it('should return true when ENABLE_OBSERVABILITY is set to true', () => {
      process.env[OpenTelemetryConstants.ENABLE_OBSERVABILITY] = 'true';
      expect(isAgent365TelemetryEnabled()).toBe(true);
    });

    it('should return true when ENABLE_OBSERVABILITY is set to 1', () => {
      process.env[OpenTelemetryConstants.ENABLE_OBSERVABILITY] = '1';
      expect(isAgent365TelemetryEnabled()).toBe(true);
    });

    it('should return false when ENABLE_A365_OBSERVABILITY is explicitly set to false', () => {
      process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY] = 'false';
      expect(isAgent365TelemetryEnabled()).toBe(false);
    });

    it('should return true when ENABLE_A365_OBSERVABILITY is set to true', () => {
      process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY] = 'true';
      expect(isAgent365TelemetryEnabled()).toBe(true);
    });

    it('should return false when both are explicitly disabled', () => {
      process.env[OpenTelemetryConstants.ENABLE_OBSERVABILITY] = 'false';
      process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY] = 'false';
      expect(isAgent365TelemetryEnabled()).toBe(false);
    });

    it('should return true when ENABLE_OBSERVABILITY is enabled and ENABLE_A365_OBSERVABILITY is not set', () => {
      process.env[OpenTelemetryConstants.ENABLE_OBSERVABILITY] = 'true';
      expect(isAgent365TelemetryEnabled()).toBe(true);
    });

    it('should return true when ENABLE_A365_OBSERVABILITY is enabled and ENABLE_OBSERVABILITY is not set', () => {
      process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY] = 'true';
      expect(isAgent365TelemetryEnabled()).toBe(true);
    });
  });

  describe('isAgent365ExporterEnabled', () => {
    beforeEach(() => {
      // Clear environment variable before each test
      delete process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY_EXPORTER];
    });

    it('should return true by default when environment variable is not set', () => {
      expect(isAgent365ExporterEnabled()).toBe(true);
    });

    it('should return false when explicitly set to false', () => {
      process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY_EXPORTER] = 'false';
      expect(isAgent365ExporterEnabled()).toBe(false);
    });

    it('should return false when set to 0', () => {
      process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY_EXPORTER] = '0';
      expect(isAgent365ExporterEnabled()).toBe(false);
    });

    it('should return false when set to no', () => {
      process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY_EXPORTER] = 'no';
      expect(isAgent365ExporterEnabled()).toBe(false);
    });

    it('should return false when set to off', () => {
      process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY_EXPORTER] = 'off';
      expect(isAgent365ExporterEnabled()).toBe(false);
    });

    it('should return true when set to true', () => {
      process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY_EXPORTER] = 'true';
      expect(isAgent365ExporterEnabled()).toBe(true);
    });

    it('should return true when set to 1', () => {
      process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY_EXPORTER] = '1';
      expect(isAgent365ExporterEnabled()).toBe(true);
    });

    it('should return true when set to any other value', () => {
      process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY_EXPORTER] = 'yes';
      expect(isAgent365ExporterEnabled()).toBe(true);
    });
  });
});
