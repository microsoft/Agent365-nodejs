// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Utility } from '@microsoft/agents-a365-runtime';
import * as jwt from 'jsonwebtoken';

describe('Utility', () => {
  describe('GetAppIdFromToken', () => {
    it('returns default GUID for empty token', () => {
      // Arrange
      const emptyToken = '';
      const undefinedToken = undefined as any;

      // Act
      const result1 = Utility.GetAppIdFromToken(emptyToken);
      const result2 = Utility.GetAppIdFromToken(undefinedToken);

      // Assert
      expect(result1).toBe('00000000-0000-0000-0000-000000000000');
      expect(result2).toBe('00000000-0000-0000-0000-000000000000');
    });

    it('returns empty string for invalid token', () => {
      // Arrange
      const invalidToken = 'not-a-jwt';

      // Act
      const result = Utility.GetAppIdFromToken(invalidToken);

      // Assert
      expect(result).toBe('');
    });

    it('returns appid claim if present', () => {
      // Arrange
      const payload = { appid: 'test-appid' };
      const token = jwt.sign(payload, 'secret');

      // Act
      const result = Utility.GetAppIdFromToken(token);

      // Assert
      expect(result).toBe('test-appid');
    });

    it('returns azp claim if appid is missing', () => {
      // Arrange
      const payload = { azp: 'test-azp' };
      const token = jwt.sign(payload, 'secret');

      // Act
      const result = Utility.GetAppIdFromToken(token);

      // Assert
      expect(result).toBe('test-azp');
    });

    it('returns empty string if neither appid nor azp', () => {
      // Arrange
      const payload = { foo: 'bar' };
      const token = jwt.sign(payload, 'secret');

      // Act
      const result = Utility.GetAppIdFromToken(token);

      // Assert
      expect(result).toBe('');
    });
  });

  describe('ResolveAgentIdentity', () => {
    const createMockContext = (isAgentic: boolean, agenticId?: string) => ({
      activity: {
        isAgenticRequest: () => isAgentic,
        getAgenticInstanceId: () => agenticId,
      },
    }) as any;

    it('returns agentic instance ID if isAgenticRequest is true', () => {
      // Arrange
      const ctx = createMockContext(true, 'agentic-id-123');
      const token = 'token';

      // Act
      const result = Utility.ResolveAgentIdentity(ctx, token);

      // Assert
      expect(result).toBe('agentic-id-123');
    });

    it('returns empty string if isAgenticRequest is true but no agenticId', () => {
      // Arrange
      const ctx = createMockContext(true, undefined);
      const token = 'token';

      // Act
      const result = Utility.ResolveAgentIdentity(ctx, token);

      // Assert
      expect(result).toBe('');
    });

    it('falls back to GetAppIdFromToken if not agentic', () => {
      // Arrange
      const ctx = createMockContext(false);
      const token = 'token';
      const spy = jest.spyOn(Utility, 'GetAppIdFromToken').mockReturnValue('fallback-id');

      // Act
      const result = Utility.ResolveAgentIdentity(ctx, token);

      // Assert
      expect(result).toBe('fallback-id');
      spy.mockRestore();
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
