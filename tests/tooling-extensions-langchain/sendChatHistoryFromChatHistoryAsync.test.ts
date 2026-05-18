// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { McpToolRegistrationService } from '../../packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService';
import {
  MockTurnContext,
  MockBaseChatMessageHistory,
  createMockMessageArray,
  MockBaseMessage,
  MockHumanMessage,
  MockAIMessage
} from './fixtures';
import { OperationResult } from '../../packages/agents-a365-runtime/src';
import { ChatHistoryMessage, ToolOptions, McpToolServerConfigurationService } from '../../packages/agents-a365-tooling/src';

describe('McpToolRegistrationService - sendChatHistoryFromChatHistoryAsync (Level 3 API)', () => {
  let service: McpToolRegistrationService;
  let mockSendChatHistory: jest.SpiedFunction<typeof McpToolServerConfigurationService.prototype.sendChatHistory>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Spy on the prototype method
    mockSendChatHistory = jest.spyOn(McpToolServerConfigurationService.prototype, 'sendChatHistory')
      .mockResolvedValue(OperationResult.success as never);
    service = new McpToolRegistrationService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('SP-03: Success path with valid BaseChatMessageHistory', () => {
    it('should call getMessages() on chatHistory and send retrieved messages', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();
      const chatHistory = new MockBaseChatMessageHistory();
      chatHistory.setMessagesToReturn(messages);

      const result = await service.sendChatHistoryFromChatHistoryAsync(
        turnContext as never,
        chatHistory as never
      );

      // Verify getMessages was called
      expect(chatHistory.getGetMessagesCallCount()).toBe(1);

      // Verify sendChatHistory was called
      expect(mockSendChatHistory).toHaveBeenCalledTimes(1);

      // Verify messages were converted and sent
      const sentMessages = mockSendChatHistory.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(4);

      // Verify result is success
      expect(result.succeeded).toBe(true);
    });

    it('should pass turnContext to the underlying sendChatHistory call', async () => {
      const turnContext = MockTurnContext.createValid();
      const chatHistory = new MockBaseChatMessageHistory();
      chatHistory.setMessagesToReturn(createMockMessageArray());

      await service.sendChatHistoryFromChatHistoryAsync(
        turnContext as never,
        chatHistory as never
      );

      // Verify turnContext was passed
      expect(mockSendChatHistory.mock.calls[0][0]).toBe(turnContext);
    });

    it('should apply limit parameter to retrieved messages', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray(); // 4 messages
      const chatHistory = new MockBaseChatMessageHistory();
      chatHistory.setMessagesToReturn(messages);
      const limit = 2;

      await service.sendChatHistoryFromChatHistoryAsync(
        turnContext as never,
        chatHistory as never,
        limit
      );

      // Verify only 2 messages were sent
      const sentMessages = mockSendChatHistory.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(2);
    });

    it('should pass toolOptions through the delegation chain', async () => {
      const turnContext = MockTurnContext.createValid();
      const chatHistory = new MockBaseChatMessageHistory();
      chatHistory.setMessagesToReturn(createMockMessageArray());
      const toolOptions = { orchestratorName: 'CustomOrchestrator' };

      await service.sendChatHistoryFromChatHistoryAsync(
        turnContext as never,
        chatHistory as never,
        undefined,
        toolOptions
      );

      // Verify toolOptions were passed
      const passedOptions = mockSendChatHistory.mock.calls[0][2] as ToolOptions;
      expect(passedOptions.orchestratorName).toBe('CustomOrchestrator');
    });

    it('should handle chatHistory with empty messages array', async () => {
      const turnContext = MockTurnContext.createValid();
      const chatHistory = new MockBaseChatMessageHistory();
      chatHistory.setMessagesToReturn([]);

      const result = await service.sendChatHistoryFromChatHistoryAsync(
        turnContext as never,
        chatHistory as never
      );

      // Should still call sendChatHistory with empty array (required for RTP)
      expect(mockSendChatHistory).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistory.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(0);
      expect(result.succeeded).toBe(true);
    });

    it('should preserve message order from chatHistory', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages: MockBaseMessage[] = [
        new MockHumanMessage('First', 'msg-1'),
        new MockAIMessage('Second', 'msg-2'),
        new MockHumanMessage('Third', 'msg-3')
      ];
      const chatHistory = new MockBaseChatMessageHistory();
      chatHistory.setMessagesToReturn(messages);

      await service.sendChatHistoryFromChatHistoryAsync(
        turnContext as never,
        chatHistory as never
      );

      const sentMessages = mockSendChatHistory.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(3);
      expect(sentMessages[0].content).toBe('First');
      expect(sentMessages[1].content).toBe('Second');
      expect(sentMessages[2].content).toBe('Third');
    });

    it('should use default orchestratorName when toolOptions not provided', async () => {
      const turnContext = MockTurnContext.createValid();
      const chatHistory = new MockBaseChatMessageHistory();
      chatHistory.setMessagesToReturn(createMockMessageArray());

      await service.sendChatHistoryFromChatHistoryAsync(
        turnContext as never,
        chatHistory as never
      );

      // Verify default orchestratorName was used
      const passedOptions = mockSendChatHistory.mock.calls[0][2] as ToolOptions;
      expect(passedOptions.orchestratorName).toBe('LangChain');
    });

    it('should correctly delegate to sendChatHistoryFromMessagesAsync', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages: MockBaseMessage[] = [
        new MockHumanMessage('User message', 'msg-1'),
        new MockAIMessage('AI response', 'msg-2')
      ];
      const chatHistory = new MockBaseChatMessageHistory();
      chatHistory.setMessagesToReturn(messages);

      await service.sendChatHistoryFromChatHistoryAsync(
        turnContext as never,
        chatHistory as never
      );

      // Verify the conversion happened correctly
      const sentMessages = mockSendChatHistory.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages[0].role).toBe('user');
      expect(sentMessages[0].content).toBe('User message');
      expect(sentMessages[1].role).toBe('assistant');
      expect(sentMessages[1].content).toBe('AI response');
    });
  });
});
