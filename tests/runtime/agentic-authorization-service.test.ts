// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { TurnContext, Authorization } from '@microsoft/agents-hosting';
import { AgenticAuthenticationService } from '@microsoft/agents-a365-runtime';

describe('AgenticAuthenticationService', () => {
  let mockAuthorization: jest.Mocked<Authorization>;
  let mockTurnContext: jest.Mocked<TurnContext>;
  const mockAuthHandlerName = 'test-auth-handler';
  const testScopes = ['test-scope/.default'];

  beforeEach(() => {
    mockAuthorization = {
      exchangeToken: jest.fn(),
    } as unknown as jest.Mocked<Authorization>;

    mockTurnContext = {} as unknown as jest.Mocked<TurnContext>;
  });

  describe('GetAgenticUserToken', () => {
    it('should return token from authorization exchange', async () => {
      mockAuthorization.exchangeToken.mockResolvedValue({ token: 'exchanged-token-123' } as unknown as Awaited<ReturnType<Authorization['exchangeToken']>>);

      const result = await AgenticAuthenticationService.GetAgenticUserToken(
        mockAuthorization,
        mockAuthHandlerName,
        mockTurnContext,
        testScopes
      );

      expect(result).toEqual('exchanged-token-123');
      expect(mockAuthorization.exchangeToken).toHaveBeenCalledWith(
        mockTurnContext,
        mockAuthHandlerName,
        { scopes: testScopes }
      );
    });

    it('should return empty string when token is null', async () => {
      mockAuthorization.exchangeToken.mockResolvedValue({ token: null } as unknown as Awaited<ReturnType<Authorization['exchangeToken']>>);

      const result = await AgenticAuthenticationService.GetAgenticUserToken(
        mockAuthorization,
        mockAuthHandlerName,
        mockTurnContext,
        testScopes
      );

      expect(result).toEqual('');
    });

    it('should return empty string when token is undefined', async () => {
      mockAuthorization.exchangeToken.mockResolvedValue({} as unknown as Awaited<ReturnType<Authorization['exchangeToken']>>);

      const result = await AgenticAuthenticationService.GetAgenticUserToken(
        mockAuthorization,
        mockAuthHandlerName,
        mockTurnContext,
        testScopes
      );

      expect(result).toEqual('');
    });

    it('should pass the provided scopes to exchangeToken', async () => {
      mockAuthorization.exchangeToken.mockResolvedValue({ token: 'test-token' } as unknown as Awaited<ReturnType<Authorization['exchangeToken']>>);
      const customScopes = ['custom-scope-1/.default', 'custom-scope-2/.default'];

      await AgenticAuthenticationService.GetAgenticUserToken(
        mockAuthorization,
        mockAuthHandlerName,
        mockTurnContext,
        customScopes
      );

      expect(mockAuthorization.exchangeToken).toHaveBeenCalledWith(
        mockTurnContext,
        mockAuthHandlerName,
        { scopes: customScopes }
      );
    });

    it('should pass correct auth handler name', async () => {
      mockAuthorization.exchangeToken.mockResolvedValue({ token: 'test-token' } as unknown as Awaited<ReturnType<Authorization['exchangeToken']>>);
      const customAuthHandler = 'custom-handler-name';

      await AgenticAuthenticationService.GetAgenticUserToken(
        mockAuthorization,
        customAuthHandler,
        mockTurnContext,
        testScopes
      );

      expect(mockAuthorization.exchangeToken).toHaveBeenCalledWith(
        mockTurnContext,
        customAuthHandler,
        { scopes: testScopes }
      );
    });

    it('should use default MCP platform scope when called without scopes (deprecated overload)', async () => {
      mockAuthorization.exchangeToken.mockResolvedValue({ token: 'test-token' } as unknown as Awaited<ReturnType<Authorization['exchangeToken']>>);

      // Call the deprecated 3-parameter overload (no scopes)
      await AgenticAuthenticationService.GetAgenticUserToken(
        mockAuthorization,
        mockAuthHandlerName,
        mockTurnContext
      );

      // Verify it uses the default MCP platform authentication scope
      expect(mockAuthorization.exchangeToken).toHaveBeenCalledWith(
        mockTurnContext,
        mockAuthHandlerName,
        { scopes: ['ea9ffc3e-8a23-4a7d-836d-234d7c7565c1/.default'] }
      );
    });
  });
});
