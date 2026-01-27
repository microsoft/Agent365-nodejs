// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { TurnContext } from '@microsoft/agents-hosting';
import { OperationResult } from '../../packages/agents-a365-runtime/src/operation-result';
import { McpToolRegistrationService } from '../../packages/agents-a365-tooling-extensions-openai/src/McpToolRegistrationService';
import { OpenAIConversationsSession } from '@openai/agents-openai';
import {
  createMixedMessages,
  MockOpenAIConversationsSession,
  createUserMessage,
} from './fixtures/mockOpenAITypes';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('McpToolRegistrationService - sendChatHistoryAsync', () => {
  let service: McpToolRegistrationService;
  let mockTurnContext: jest.Mocked<TurnContext>;
  let mockSession: MockOpenAIConversationsSession;

  beforeEach(() => {
    service = new McpToolRegistrationService();

    // Create mock turn context with all required properties
    mockTurnContext = {
      activity: {
        conversation: { id: 'conv-123' },
        id: 'msg-456',
        text: 'Current user message',
        channelId: 'test-channel',
      },
    } as unknown as jest.Mocked<TurnContext>;

    // Create mock session with sample messages
    mockSession = new MockOpenAIConversationsSession(createMixedMessages(), 'session-123');

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('input validation', () => {
    it('UV-01: should throw when turnContext is null', async () => {
      await expect(
        service.sendChatHistoryAsync(null as unknown as TurnContext, mockSession as unknown as OpenAIConversationsSession)
      ).rejects.toThrow('turnContext is required');
    });

    it('UV-01: should throw when turnContext is undefined', async () => {
      await expect(
        service.sendChatHistoryAsync(undefined as unknown as TurnContext, mockSession as unknown as OpenAIConversationsSession)
      ).rejects.toThrow('turnContext is required');
    });

    it('UV-02: should throw when session is null', async () => {
      await expect(
        service.sendChatHistoryAsync(mockTurnContext, null as unknown as OpenAIConversationsSession)
      ).rejects.toThrow('session is required');
    });

    it('UV-02: should throw when session is undefined', async () => {
      await expect(
        service.sendChatHistoryAsync(mockTurnContext, undefined as unknown as OpenAIConversationsSession)
      ).rejects.toThrow('session is required');
    });
  });

  describe('successful scenarios', () => {
    it('SP-01: should extract and send session items successfully', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await service.sendChatHistoryAsync(mockTurnContext, mockSession as unknown as OpenAIConversationsSession);

      expect(result).toBeDefined();
      expect(result.succeeded).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('SP-02: should respect limit parameter', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const messages = createMixedMessages();
      mockSession.setItems(messages);

      // Call with limit of 2
      await service.sendChatHistoryAsync(mockTurnContext, mockSession as unknown as OpenAIConversationsSession, 2);

      // Verify the request was made with only 2 messages
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: expect.arrayContaining([
            expect.objectContaining({ role: 'user' }),
            expect.objectContaining({ role: 'assistant' }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('should return success for empty session', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      mockSession.setItems([]);

      const result = await service.sendChatHistoryAsync(mockTurnContext, mockSession as unknown as OpenAIConversationsSession);

      expect(result.succeeded).toBe(true);
      // Even with empty array, API call should be made to MCP platform
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const callArgs = mockedAxios.post.mock.calls[0];
      expect(callArgs[1]).toEqual({
        conversationId: 'conv-123',
        messageId: 'msg-456',
        userMessage: 'Current user message',
        chatHistory: []
      });
    });

    it('should pass toolOptions to the underlying service', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const toolOptions = { orchestratorName: 'CustomBot' };

      await service.sendChatHistoryAsync(mockTurnContext, mockSession as unknown as OpenAIConversationsSession, undefined, toolOptions);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('CustomBot'),
          }),
        })
      );
    });
  });

  describe('error handling', () => {
    it('EH-01: should return failed on HTTP error', async () => {
      const httpError = new Error('Network error');
      mockedAxios.post.mockRejectedValue(httpError);
      mockedAxios.isAxiosError.mockReturnValue(false);

      const result = await service.sendChatHistoryAsync(mockTurnContext, mockSession as unknown as OpenAIConversationsSession);

      expect(result.succeeded).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Network error');
    });

    it('EH-02: should return failed on timeout', async () => {
      const timeoutError = Object.assign(new Error('Timeout'), { code: 'ETIMEDOUT' });
      mockedAxios.post.mockRejectedValue(timeoutError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      const result = await service.sendChatHistoryAsync(mockTurnContext, mockSession as unknown as OpenAIConversationsSession);

      expect(result.succeeded).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Timeout');
    });

    it('EH-04: should return failed on session.getItems error', async () => {
      const sessionError = new Error('Session error');
      mockSession.setThrowOnGetItems(sessionError);

      const result = await service.sendChatHistoryAsync(mockTurnContext, mockSession as unknown as OpenAIConversationsSession);

      expect(result.succeeded).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Session error');
    });

    it('should re-throw validation errors from nested call', async () => {
      // Create a session that returns messages but triggers validation error
      // by having missing conversation ID
      mockTurnContext.activity.conversation = undefined as unknown as { id: string };

      await expect(
        service.sendChatHistoryAsync(mockTurnContext, mockSession as unknown as OpenAIConversationsSession)
      ).rejects.toThrow('Conversation ID is required');
    });
  });

  describe('OperationResult behavior', () => {
    it('should return OperationResult.success on successful request', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await service.sendChatHistoryAsync(mockTurnContext, mockSession as unknown as OpenAIConversationsSession);

      expect(result).toBe(OperationResult.success);
      expect(result.toString()).toBe('Succeeded');
    });

    it('should return new failed OperationResult on error', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Test error'));
      mockedAxios.isAxiosError.mockReturnValue(false);

      const result = await service.sendChatHistoryAsync(mockTurnContext, mockSession as unknown as OpenAIConversationsSession);

      expect(result).not.toBe(OperationResult.success);
      expect(result.toString()).toContain('Failed');
      expect(result.toString()).toContain('Test error');
    });
  });

  describe('integration with sendChatHistoryMessagesAsync', () => {
    it('should correctly delegate to sendChatHistoryMessagesAsync', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const messages = [
        createUserMessage('Test message 1', 'id-1'),
        createUserMessage('Test message 2', 'id-2'),
      ];
      mockSession.setItems(messages);

      const result = await service.sendChatHistoryAsync(mockTurnContext, mockSession as unknown as OpenAIConversationsSession);

      expect(result.succeeded).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          conversationId: 'conv-123',
          messageId: 'msg-456',
          userMessage: 'Current user message',
          chatHistory: expect.arrayContaining([
            expect.objectContaining({
              id: 'id-1',
              role: 'user',
              content: 'Test message 1',
            }),
            expect.objectContaining({
              id: 'id-2',
              role: 'user',
              content: 'Test message 2',
            }),
          ]),
        }),
        expect.any(Object)
      );
    });
  });
});
