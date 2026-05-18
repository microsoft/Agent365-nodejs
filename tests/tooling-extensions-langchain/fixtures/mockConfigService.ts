// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { OperationResult, OperationError } from '../../../packages/agents-a365-runtime/src';
import { ChatHistoryMessage, ToolOptions } from '../../../packages/agents-a365-tooling/src';

/**
 * Type for tracking sendChatHistory calls.
 */
export interface SendChatHistoryCall {
  turnContext: unknown;
  chatHistoryMessages: ChatHistoryMessage[];
  options?: ToolOptions;
}

/**
 * Mock McpToolServerConfigurationService for testing.
 * Allows control over sendChatHistory behavior and tracks calls.
 */
export class MockMcpToolServerConfigurationService {
  private resultToReturn: OperationResult = OperationResult.success;
  private errorToThrow: Error | null = null;
  private sendChatHistoryCalls: SendChatHistoryCall[] = [];

  /**
   * Configure the mock to return a specific OperationResult.
   */
  setResultToReturn(result: OperationResult): void {
    this.resultToReturn = result;
    this.errorToThrow = null;
  }

  /**
   * Configure the mock to return success.
   */
  setSuccessResult(): void {
    this.resultToReturn = OperationResult.success;
    this.errorToThrow = null;
  }

  /**
   * Configure the mock to return a failed result with an error.
   */
  setFailedResult(error: Error): void {
    this.resultToReturn = OperationResult.failed(new OperationError(error));
    this.errorToThrow = null;
  }

  /**
   * Configure the mock to throw an error when sendChatHistory is called.
   */
  setErrorToThrow(error: Error): void {
    this.errorToThrow = error;
  }

  /**
   * Get all recorded sendChatHistory calls for verification.
   */
  getSendChatHistoryCalls(): SendChatHistoryCall[] {
    return this.sendChatHistoryCalls;
  }

  /**
   * Get the most recent sendChatHistory call.
   */
  getLastSendChatHistoryCall(): SendChatHistoryCall | undefined {
    return this.sendChatHistoryCalls[this.sendChatHistoryCalls.length - 1];
  }

  /**
   * Get the count of sendChatHistory calls.
   */
  getSendChatHistoryCallCount(): number {
    return this.sendChatHistoryCalls.length;
  }

  /**
   * Reset the mock state.
   */
  reset(): void {
    this.resultToReturn = OperationResult.success;
    this.errorToThrow = null;
    this.sendChatHistoryCalls = [];
  }

  /**
   * Mock implementation of sendChatHistory method.
   */
  async sendChatHistory(
    turnContext: unknown,
    chatHistoryMessages: ChatHistoryMessage[],
    options?: ToolOptions
  ): Promise<OperationResult> {
    // Record the call
    this.sendChatHistoryCalls.push({
      turnContext,
      chatHistoryMessages,
      options
    });

    // Throw if configured to do so
    if (this.errorToThrow) {
      throw this.errorToThrow;
    }

    // Return the configured result
    return this.resultToReturn;
  }

  /**
   * Mock implementation of listToolServers method (for completeness).
   */
  async listToolServers(_agenticAppId: string, _authToken: string, _options?: ToolOptions): Promise<unknown[]> {
    return [];
  }

  /**
   * Mock implementation of getMcpClientTools method (for completeness).
   */
  async getMcpClientTools(_mcpServerName: string, _mcpServerConfig: unknown): Promise<unknown[]> {
    return [];
  }
}

/**
 * Helper to create a pre-configured mock config service that returns success.
 */
export function createMockConfigServiceSuccess(): MockMcpToolServerConfigurationService {
  const service = new MockMcpToolServerConfigurationService();
  service.setSuccessResult();
  return service;
}

/**
 * Helper to create a pre-configured mock config service that returns failure.
 */
export function createMockConfigServiceFailure(error: Error): MockMcpToolServerConfigurationService {
  const service = new MockMcpToolServerConfigurationService();
  service.setFailedResult(error);
  return service;
}

/**
 * Helper to create a mock config service that throws an error.
 */
export function createMockConfigServiceThrows(error: Error): MockMcpToolServerConfigurationService {
  const service = new MockMcpToolServerConfigurationService();
  service.setErrorToThrow(error);
  return service;
}
