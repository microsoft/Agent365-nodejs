// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { McpToolRegistrationService } from '../../packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService';
import {
  MockTurnContext,
  MockCompiledStateGraph,
  MockBaseChatMessageHistory,
  createMockMessageArray,
  createMockStateSnapshot,
  MockBaseMessage,
  createMockImageOnlyMessage
} from './fixtures';
import { OperationResult, OperationError } from '../../packages/agents-a365-runtime/src';
import { ChatHistoryMessage, McpToolServerConfigurationService } from '../../packages/agents-a365-tooling/src';

describe('McpToolRegistrationService - Error Handling', () => {
  let service: McpToolRegistrationService;
  let mockSendChatHistoryFn: jest.SpiedFunction<typeof McpToolServerConfigurationService.prototype.sendChatHistory>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendChatHistoryFn = jest.spyOn(McpToolServerConfigurationService.prototype, 'sendChatHistory')
      .mockResolvedValue(OperationResult.success as never);
    service = new McpToolRegistrationService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('EH-01: HTTP request fails', () => {
    it('should return OperationResult.failed when configService returns failure', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();
      const httpError = new Error('HTTP 500: Internal Server Error');
      const failedResult = OperationResult.failed(new OperationError(httpError));
      mockSendChatHistoryFn.mockResolvedValue(failedResult as never);

      const result = await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never
      );

      expect(result.succeeded).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should propagate HTTP error details in failed result', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();
      const httpError = new Error('HTTP 401: Unauthorized');
      const failedResult = OperationResult.failed(new OperationError(httpError));
      mockSendChatHistoryFn.mockResolvedValue(failedResult as never);

      const result = await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never
      );

      expect(result.succeeded).toBe(false);
    });
  });

  describe('EH-02: Network timeout', () => {
    it('should return OperationResult.failed when timeout occurs', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();
      const timeoutError = new Error('Request timeout after 30000ms');
      const failedResult = OperationResult.failed(new OperationError(timeoutError));
      mockSendChatHistoryFn.mockResolvedValue(failedResult as never);

      const result = await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never
      );

      expect(result.succeeded).toBe(false);
    });

    it('should handle ECONNRESET error', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();
      const networkError = new Error('ECONNRESET: Connection reset by peer');
      const failedResult = OperationResult.failed(new OperationError(networkError));
      mockSendChatHistoryFn.mockResolvedValue(failedResult as never);

      const result = await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never
      );

      expect(result.succeeded).toBe(false);
    });
  });

  describe('EH-03: All messages fail conversion', () => {
    it('should send empty array to API when all messages fail conversion', async () => {
      const turnContext = MockTurnContext.createValid();
      // All messages will fail conversion (empty content or image-only)
      const messages: MockBaseMessage[] = [
        createMockImageOnlyMessage(),
        createMockImageOnlyMessage(),
        createMockImageOnlyMessage()
      ];

      await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never
      );

      // Should still call API with empty array
      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toEqual([]);
    });

    it('should return success when all messages fail conversion but API succeeds', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages: MockBaseMessage[] = [
        createMockImageOnlyMessage()
      ];

      const result = await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never
      );

      expect(result.succeeded).toBe(true);
    });
  });

  describe('EH-04: Core service throws validation error', () => {
    it('should propagate validation errors from underlying service', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();
      const validationError = new Error('Validation failed: turnContext is required');
      mockSendChatHistoryFn.mockRejectedValue(validationError);

      // The implementation wraps errors, so we expect the error to be caught
      // and either re-thrown or returned as failed result depending on error type
      await expect(
        service.sendChatHistoryFromMessagesAsync(
          turnContext as never,
          messages as never
        )
      ).rejects.toThrow();
    });
  });

  describe('EH-05: graph.getState() throws error', () => {
    it('should return OperationResult.failed when graph.getState() throws', async () => {
      const turnContext = MockTurnContext.createValid();
      const graph = new MockCompiledStateGraph<{ messages: MockBaseMessage[] }>();
      const stateError = new Error('Failed to fetch state from LangGraph');
      graph.setErrorToThrow(stateError);
      const config = { configurable: { thread_id: 'test-thread' } };

      const result = await service.sendChatHistoryAsync(
        turnContext as never,
        graph as never,
        config
      );

      expect(result.succeeded).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should not call sendChatHistory when graph.getState() fails', async () => {
      const turnContext = MockTurnContext.createValid();
      const graph = new MockCompiledStateGraph<{ messages: MockBaseMessage[] }>();
      graph.setErrorToThrow(new Error('State fetch failed'));
      const config = { configurable: { thread_id: 'test-thread' } };

      await service.sendChatHistoryAsync(
        turnContext as never,
        graph as never,
        config
      );

      expect(mockSendChatHistoryFn).not.toHaveBeenCalled();
    });

    it('should wrap graph.getState() error in OperationError', async () => {
      const turnContext = MockTurnContext.createValid();
      const graph = new MockCompiledStateGraph<{ messages: MockBaseMessage[] }>();
      const originalError = new Error('Graph state error');
      graph.setErrorToThrow(originalError);
      const config = { configurable: { thread_id: 'test-thread' } };

      const result = await service.sendChatHistoryAsync(
        turnContext as never,
        graph as never,
        config
      );

      expect(result.succeeded).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe('EH-06: chatHistory.getMessages() throws error', () => {
    it('should return OperationResult.failed when chatHistory.getMessages() throws', async () => {
      const turnContext = MockTurnContext.createValid();
      const chatHistory = new MockBaseChatMessageHistory();
      const getMessagesError = new Error('Failed to retrieve messages from chat history');
      chatHistory.setErrorToThrow(getMessagesError);

      const result = await service.sendChatHistoryFromChatHistoryAsync(
        turnContext as never,
        chatHistory as never
      );

      expect(result.succeeded).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should not call sendChatHistory when chatHistory.getMessages() fails', async () => {
      const turnContext = MockTurnContext.createValid();
      const chatHistory = new MockBaseChatMessageHistory();
      chatHistory.setErrorToThrow(new Error('GetMessages failed'));

      await service.sendChatHistoryFromChatHistoryAsync(
        turnContext as never,
        chatHistory as never
      );

      expect(mockSendChatHistoryFn).not.toHaveBeenCalled();
    });

    it('should wrap chatHistory.getMessages() error in OperationError', async () => {
      const turnContext = MockTurnContext.createValid();
      const chatHistory = new MockBaseChatMessageHistory();
      const originalError = new Error('Redis connection failed');
      chatHistory.setErrorToThrow(originalError);

      const result = await service.sendChatHistoryFromChatHistoryAsync(
        turnContext as never,
        chatHistory as never
      );

      expect(result.succeeded).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should still attempt getMessages call before failing', async () => {
      const turnContext = MockTurnContext.createValid();
      const chatHistory = new MockBaseChatMessageHistory();
      chatHistory.setErrorToThrow(new Error('Access denied'));

      await service.sendChatHistoryFromChatHistoryAsync(
        turnContext as never,
        chatHistory as never
      );

      // Verify getMessages was called before the error
      expect(chatHistory.getGetMessagesCallCount()).toBe(1);
    });
  });

  describe('Error propagation through delegation chain', () => {
    it('should propagate errors from Level 4 through Level 1 API', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();
      const graph = new MockCompiledStateGraph<{ messages: MockBaseMessage[] }>();
      graph.setStateToReturn(createMockStateSnapshot(messages));
      const config = { configurable: { thread_id: 'test-thread' } };

      const httpError = new Error('HTTP 503: Service Unavailable');
      const failedResult = OperationResult.failed(new OperationError(httpError));
      mockSendChatHistoryFn.mockResolvedValue(failedResult as never);

      const result = await service.sendChatHistoryAsync(
        turnContext as never,
        graph as never,
        config
      );

      expect(result.succeeded).toBe(false);
    });

    it('should propagate errors from Level 4 through Level 3 API', async () => {
      const turnContext = MockTurnContext.createValid();
      const chatHistory = new MockBaseChatMessageHistory();
      chatHistory.setMessagesToReturn(createMockMessageArray());

      const httpError = new Error('HTTP 429: Too Many Requests');
      const failedResult = OperationResult.failed(new OperationError(httpError));
      mockSendChatHistoryFn.mockResolvedValue(failedResult as never);

      const result = await service.sendChatHistoryFromChatHistoryAsync(
        turnContext as never,
        chatHistory as never
      );

      expect(result.succeeded).toBe(false);
    });

    it('should propagate errors from Level 4 through Level 2 API', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();
      const stateSnapshot = createMockStateSnapshot(messages);

      const httpError = new Error('HTTP 400: Bad Request');
      const failedResult = OperationResult.failed(new OperationError(httpError));
      mockSendChatHistoryFn.mockResolvedValue(failedResult as never);

      const result = await service.sendChatHistoryFromStateAsync(
        turnContext as never,
        stateSnapshot as never
      );

      expect(result.succeeded).toBe(false);
    });
  });
});
