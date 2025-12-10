// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
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
});
