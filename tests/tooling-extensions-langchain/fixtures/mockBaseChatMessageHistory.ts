// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { MockBaseMessage } from './mockLangChainTypes';

/**
 * Mock BaseChatMessageHistory class for testing.
 * Simulates the behavior of @langchain/core/chat_history's BaseChatMessageHistory.
 */
export class MockBaseChatMessageHistory {
  private messagesToReturn: MockBaseMessage[] = [];
  private errorToThrow: Error | null = null;
  private getMessagesCalls: number = 0;
  private addMessageCalls: MockBaseMessage[] = [];

  /**
   * Configure the mock to return specific messages.
   */
  setMessagesToReturn(messages: MockBaseMessage[]): void {
    this.messagesToReturn = messages;
    this.errorToThrow = null;
  }

  /**
   * Configure the mock to throw an error when getMessages is called.
   */
  setErrorToThrow(error: Error): void {
    this.errorToThrow = error;
  }

  /**
   * Get the count of getMessages calls for verification.
   */
  getGetMessagesCallCount(): number {
    return this.getMessagesCalls;
  }

  /**
   * Get the recorded addMessage calls for verification.
   */
  getAddMessageCalls(): MockBaseMessage[] {
    return this.addMessageCalls;
  }

  /**
   * Reset the mock state.
   */
  reset(): void {
    this.messagesToReturn = [];
    this.errorToThrow = null;
    this.getMessagesCalls = 0;
    this.addMessageCalls = [];
  }

  /**
   * Mock implementation of getMessages method.
   */
  async getMessages(): Promise<MockBaseMessage[]> {
    this.getMessagesCalls++;

    if (this.errorToThrow) {
      throw this.errorToThrow;
    }

    return this.messagesToReturn;
  }

  /**
   * Mock implementation of addMessage method.
   */
  async addMessage(message: MockBaseMessage): Promise<void> {
    this.addMessageCalls.push(message);
    this.messagesToReturn.push(message);
  }

  /**
   * Mock implementation of addMessages method.
   */
  async addMessages(messages: MockBaseMessage[]): Promise<void> {
    for (const message of messages) {
      await this.addMessage(message);
    }
  }

  /**
   * Mock implementation of clear method.
   */
  async clear(): Promise<void> {
    this.messagesToReturn = [];
  }
}

/**
 * Helper to create a pre-configured mock chat history with messages.
 */
export function createMockChatHistoryWithMessages(messages: MockBaseMessage[]): MockBaseChatMessageHistory {
  const history = new MockBaseChatMessageHistory();
  history.setMessagesToReturn(messages);
  return history;
}

/**
 * Helper to create a mock chat history that throws an error.
 */
export function createMockChatHistoryWithError(error: Error): MockBaseChatMessageHistory {
  const history = new MockBaseChatMessageHistory();
  history.setErrorToThrow(error);
  return history;
}
