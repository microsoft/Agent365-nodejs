// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { TurnContext, Authorization } from '@microsoft/agents-hosting';
import { AgenticAuthenticationService, PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE } from '@microsoft/agents-a365-runtime';

describe('AgenticAuthenticationService', () => {
  let mockAuthorization: jest.Mocked<Authorization>;
  let mockTurnContext: jest.Mocked<TurnContext>;
  const mockAuthHandlerName = 'test-auth-handler';
  const expectedScope = process.env.MCP_PLATFORM_AUTHENTICATION_SCOPE || PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE;

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
        mockTurnContext
      );

      expect(result).toEqual('exchanged-token-123');
      expect(mockAuthorization.exchangeToken).toHaveBeenCalledWith(
        mockTurnContext,
        mockAuthHandlerName,
        { scopes: [expectedScope] }
      );
    });

    it('should return empty string when token is null', async () => {
      mockAuthorization.exchangeToken.mockResolvedValue({ token: null } as unknown as Awaited<ReturnType<Authorization['exchangeToken']>>);

      const result = await AgenticAuthenticationService.GetAgenticUserToken(
        mockAuthorization,
        mockAuthHandlerName,
        mockTurnContext
      );

      expect(result).toEqual('');
    });

    it('should return empty string when token is undefined', async () => {
      mockAuthorization.exchangeToken.mockResolvedValue({} as unknown as Awaited<ReturnType<Authorization['exchangeToken']>>);

      const result = await AgenticAuthenticationService.GetAgenticUserToken(
        mockAuthorization,
        mockAuthHandlerName,
        mockTurnContext
      );

      expect(result).toEqual('');
    });

    it('should use default MCP platform authentication scope', async () => {
      mockAuthorization.exchangeToken.mockResolvedValue({ token: 'test-token' } as unknown as Awaited<ReturnType<Authorization['exchangeToken']>>);

      await AgenticAuthenticationService.GetAgenticUserToken(
        mockAuthorization,
        mockAuthHandlerName,
        mockTurnContext
      );

      // Verify the scope used is from getMcpPlatformAuthenticationScope (env var or default)
      expect(mockAuthorization.exchangeToken).toHaveBeenCalledWith(
        mockTurnContext,
        mockAuthHandlerName,
        { scopes: [expectedScope] }
      );
    });

    it('should pass correct auth handler name', async () => {
      mockAuthorization.exchangeToken.mockResolvedValue({ token: 'test-token' } as unknown as Awaited<ReturnType<Authorization['exchangeToken']>>);
      const customAuthHandler = 'custom-handler-name';

      await AgenticAuthenticationService.GetAgenticUserToken(
        mockAuthorization,
        customAuthHandler,
        mockTurnContext
      );

      expect(mockAuthorization.exchangeToken).toHaveBeenCalledWith(
        mockTurnContext,
        customAuthHandler,
        { scopes: [expectedScope] }
      );
    });
  });
});
