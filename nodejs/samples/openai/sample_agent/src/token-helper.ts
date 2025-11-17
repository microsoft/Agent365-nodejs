// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Authorization, TurnContext } from '@microsoft/agents-hosting';
import { AgenticAuthenticationService } from '@microsoft/agents-a365-runtime';

/**
 * TokenHelper provides authentication utilities for the agent.
 * It manages access tokens for Graph API and other Microsoft 365 services.
 */
export class TokenHelper {
  private authorization: Authorization | undefined;
  private authHandlerName: string;
  private turnContext: TurnContext | undefined;

  constructor(authHandlerName: string = 'agentic') {
    this.authHandlerName = authHandlerName;
  }

  /**
   * Initializes the token helper with agent authorization and context.
   * @param authorization - The authorization object from the agent context
   * @param turnContext - The current turn context
   */
  async initialize(authorization: Authorization | undefined, turnContext: TurnContext): Promise<void> {
    if (!authorization) {
      console.warn('Authorization not available, token helper will not be initialized');
      return;
    }

    try {
      this.authorization = authorization;
      this.turnContext = turnContext;
      console.log('Token helper initialized successfully');
    } catch (error) {
      console.error('Failed to initialize token helper:', error);
      throw error;
    }
  }

  /**
   * Gets an access token for agentic authentication.
   * @returns The access token, or null if not available
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.authorization || !this.turnContext) {
      console.warn('Token helper not initialized or authorization not available');
      return null;
    }

    try {
      const token = await AgenticAuthenticationService.GetAgenticUserToken(
        this.authorization,
        this.authHandlerName,
        this.turnContext
      );
      return token;
    } catch (error) {
      console.error('Failed to get access token:', error);
      return null;
    }
  }

  /**
   * Checks if the token helper is initialized and ready to use.
   */
  isInitialized(): boolean {
    return this.authorization !== undefined && this.turnContext !== undefined;
  }
}
