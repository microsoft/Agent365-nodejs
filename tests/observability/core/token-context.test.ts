// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { context, createContextKey } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  runWithExportToken,
  updateExportToken,
  getExportToken,
} from '@microsoft/agents-a365-observability/src/tracing/context/token-context';

describe('token-context', () => {
  let contextManager: AsyncLocalStorageContextManager;

  beforeAll(() => {
    contextManager = new AsyncLocalStorageContextManager();
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
  });

  afterAll(() => {
    contextManager.disable();
    context.disable();
  });

  describe('updateExportToken', () => {
    it('should return false when called outside runWithExportToken context', () => {
      expect(updateExportToken('some-token')).toBe(false);
    });

    it('should return true and mutate the token visible to getExportToken', () => {
      runWithExportToken('v1', () => {
        expect(updateExportToken('v2')).toBe(true);
        expect(getExportToken()).toBe('v2');

        // successive updates keep working
        expect(updateExportToken('v3')).toBe(true);
        expect(getExportToken()).toBe('v3');
      });
    });
  });

  describe('getExportToken - backward compatibility', () => {
    it('should handle legacy raw string values stored directly in context', () => {
      const legacyKey = createContextKey('a365_export_token');
      const ctxWithLegacyToken = context.active().setValue(legacyKey, 'legacy-string-token');

      expect(getExportToken(ctxWithLegacyToken)).toBe('legacy-string-token');
    });

    it('should return undefined for non-string, non-TokenHolder values in context', () => {
      const key = createContextKey('a365_export_token');
      const ctxWithBadValue = context.active().setValue(key, 12345);

      expect(getExportToken(ctxWithBadValue)).toBeUndefined();
    });
  });
});
