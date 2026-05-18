// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as jwt from 'jsonwebtoken';

// Mock jsonwebtoken module
jest.mock('jsonwebtoken');

import { Utility } from '@microsoft/agents-a365-runtime';
import { TurnContext } from '@microsoft/agents-hosting';

describe('Utility', () => {
  describe('GetAppIdFromToken', () => {
    it('should return default GUID for empty token', () => {
      expect(Utility.GetAppIdFromToken('')).toEqual('00000000-0000-0000-0000-000000000000');
    });

    it('should return default GUID for whitespace token', () => {
      expect(Utility.GetAppIdFromToken('   ')).toEqual('00000000-0000-0000-0000-000000000000');
    });

    it('should return appid claim when present', () => {
      const mockDecoded = { appid: 'test-app-id-123' };
      (jwt.decode as jest.Mock).mockReturnValue(mockDecoded);

      expect(Utility.GetAppIdFromToken('valid-token')).toEqual('test-app-id-123');
    });

    it('should return azp claim when appid is not present', () => {
      const mockDecoded = { azp: 'test-azp-id-456' };
      (jwt.decode as jest.Mock).mockReturnValue(mockDecoded);

      expect(Utility.GetAppIdFromToken('valid-token')).toEqual('test-azp-id-456');
    });

    it('should prefer appid over azp when both present', () => {
      const mockDecoded = { appid: 'test-app-id', azp: 'test-azp-id' };
      (jwt.decode as jest.Mock).mockReturnValue(mockDecoded);

      expect(Utility.GetAppIdFromToken('valid-token')).toEqual('test-app-id');
    });

    it('should return empty string when decoded token is null', () => {
      (jwt.decode as jest.Mock).mockReturnValue(null);

      expect(Utility.GetAppIdFromToken('invalid-token')).toEqual('');
    });

    it('should return empty string when no appid or azp claim', () => {
      const mockDecoded = { sub: 'some-subject' };
      (jwt.decode as jest.Mock).mockReturnValue(mockDecoded);

      expect(Utility.GetAppIdFromToken('valid-token')).toEqual('');
    });

    it('should return empty string when decode throws error', () => {
      (jwt.decode as jest.Mock).mockImplementation(() => {
        throw new Error('Decode failed');
      });

      expect(Utility.GetAppIdFromToken('malformed-token')).toEqual('');
    });
  });

  describe('getAgentIdFromToken', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return empty string for empty token', () => {
      expect(Utility.getAgentIdFromToken('')).toEqual('');
    });

    it('should return empty string for whitespace token', () => {
      expect(Utility.getAgentIdFromToken('   ')).toEqual('');
    });

    it('should return xms_par_app_azp claim when present (highest priority)', () => {
      const mockDecoded = {
        xms_par_app_azp: 'blueprint-id-123',
        appid: 'app-id-456',
        azp: 'azp-id-789'
      };
      (jwt.decode as jest.Mock).mockReturnValue(mockDecoded);

      expect(Utility.getAgentIdFromToken('valid-token')).toEqual('blueprint-id-123');
    });

    it('should return appid claim when xms_par_app_azp is not present', () => {
      const mockDecoded = {
        appid: 'app-id-456',
        azp: 'azp-id-789'
      };
      (jwt.decode as jest.Mock).mockReturnValue(mockDecoded);

      expect(Utility.getAgentIdFromToken('valid-token')).toEqual('app-id-456');
    });

    it('should return azp claim when xms_par_app_azp and appid are not present', () => {
      const mockDecoded = {
        azp: 'azp-id-789'
      };
      (jwt.decode as jest.Mock).mockReturnValue(mockDecoded);

      expect(Utility.getAgentIdFromToken('valid-token')).toEqual('azp-id-789');
    });

    it('should return empty string when no relevant claims are present', () => {
      const mockDecoded = { sub: 'some-subject', iss: 'some-issuer' };
      (jwt.decode as jest.Mock).mockReturnValue(mockDecoded);

      expect(Utility.getAgentIdFromToken('valid-token')).toEqual('');
    });

    it('should return empty string when decoded token is null', () => {
      (jwt.decode as jest.Mock).mockReturnValue(null);

      expect(Utility.getAgentIdFromToken('invalid-token')).toEqual('');
    });

    it('should return empty string when decode throws error', () => {
      (jwt.decode as jest.Mock).mockImplementation(() => {
        throw new Error('Decode failed');
      });

      expect(Utility.getAgentIdFromToken('malformed-token')).toEqual('');
    });

    it('should prefer xms_par_app_azp over appid even when appid comes first in object', () => {
      const mockDecoded = {
        appid: 'app-id-first',
        xms_par_app_azp: 'blueprint-id-second'
      };
      (jwt.decode as jest.Mock).mockReturnValue(mockDecoded);

      expect(Utility.getAgentIdFromToken('valid-token')).toEqual('blueprint-id-second');
    });

    it('should fall back to appid when xms_par_app_azp is empty string', () => {
      const mockDecoded = {
        xms_par_app_azp: '',
        appid: 'app-id-456'
      };
      (jwt.decode as jest.Mock).mockReturnValue(mockDecoded);

      expect(Utility.getAgentIdFromToken('valid-token')).toEqual('app-id-456');
    });

    it('should fall back to azp when both xms_par_app_azp and appid are empty strings', () => {
      const mockDecoded = {
        xms_par_app_azp: '',
        appid: '',
        azp: 'azp-id-789'
      };
      (jwt.decode as jest.Mock).mockReturnValue(mockDecoded);

      expect(Utility.getAgentIdFromToken('valid-token')).toEqual('azp-id-789');
    });
  });

  describe('ResolveAgentIdentity', () => {
    let mockContext: jest.Mocked<TurnContext>;

    beforeEach(() => {
      jest.clearAllMocks();
      mockContext = {
        activity: {
          isAgenticRequest: jest.fn(),
          getAgenticInstanceId: jest.fn(),
        },
      } as unknown as jest.Mocked<TurnContext>;
    });

    it('should return agentic instance ID when request is agentic', () => {
      mockContext.activity.isAgenticRequest.mockReturnValue(true);
      mockContext.activity.getAgenticInstanceId.mockReturnValue('agentic-id-123');

      expect(Utility.ResolveAgentIdentity(mockContext, 'auth-token')).toEqual('agentic-id-123');
    });

    it('should return empty string when agentic request but no instance ID', () => {
      mockContext.activity.isAgenticRequest.mockReturnValue(true);
      mockContext.activity.getAgenticInstanceId.mockReturnValue(undefined);

      expect(Utility.ResolveAgentIdentity(mockContext, 'auth-token')).toEqual('');
    });

    it('should extract app ID from token when not agentic request', () => {
      mockContext.activity.isAgenticRequest.mockReturnValue(false);
      const mockDecoded = { appid: 'token-app-id-789' };
      (jwt.decode as jest.Mock).mockReturnValue(mockDecoded);

      expect(Utility.ResolveAgentIdentity(mockContext, 'auth-token')).toEqual('token-app-id-789');
    });

    it('should return default GUID when not agentic and no token', () => {
      mockContext.activity.isAgenticRequest.mockReturnValue(false);

      expect(Utility.ResolveAgentIdentity(mockContext, '')).toEqual('00000000-0000-0000-0000-000000000000');
    });
  });

  describe('GetUserAgentHeader', () => {
    it('returns string containing version, OS, and orchestrator', () => {
      // Arrange
      const orchestrator = 'orch';

      // Act
      const header = Utility.GetUserAgentHeader(orchestrator);

      // Assert
      expect(header).toMatch(
        /^Agent365SDK\/.+ \(.+; Node\.js v\d+(\.\d+)*; orch\)$/
      );
    });

    it('works without orchestrator passed', () => {
      // Arrange

      // Act
      const header = Utility.GetUserAgentHeader();

      // Assert
      expect(header).toMatch(
        /^Agent365SDK\/.+ \(.+; Node\.js v\d+(\.\d+)*\)$/
      );
    });
  });

  describe('getApplicationName', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      // Reset cache before each test
      Utility.resetApplicationNameCache();
      // Clone environment
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      // Restore original environment
      process.env = originalEnv;
    });

    it('should return npm_package_name when set', () => {
      process.env.npm_package_name = 'my-test-app';

      const result = Utility.getApplicationName();

      expect(result).toBe('my-test-app');
    });

    it('should prefer npm_package_name over package.json', () => {
      process.env.npm_package_name = 'env-app-name';
      // Even if package.json has a different name, npm_package_name should be preferred

      const result = Utility.getApplicationName();

      expect(result).toBe('env-app-name');
    });

    it('should read from package.json when npm_package_name is not set', () => {
      delete process.env.npm_package_name;
      // The test is running from the monorepo, so it should find the root package.json

      const result = Utility.getApplicationName();

      // Should return the name from the tests package.json or root package.json
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should cache the package.json read result', () => {
      delete process.env.npm_package_name;

      // First call
      const result1 = Utility.getApplicationName();
      // Second call (should use cache)
      const result2 = Utility.getApplicationName();

      expect(result1).toBe(result2);
    });

    it('should return undefined when npm_package_name not set and package.json not found', () => {
      delete process.env.npm_package_name;

      // Mock fs.readFileSync to simulate package.json not found
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      const originalReadFileSync = fs.readFileSync;
      fs.readFileSync = jest.fn().mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      try {
        // Reset cache to trigger re-read with mocked fs
        Utility.resetApplicationNameCache();

        const result = Utility.getApplicationName();

        expect(result).toBeUndefined();
      } finally {
        // Restore original fs.readFileSync
        fs.readFileSync = originalReadFileSync;
        // Reset cache again to restore normal behavior for other tests
        Utility.resetApplicationNameCache();
      }
    });
  });
});
