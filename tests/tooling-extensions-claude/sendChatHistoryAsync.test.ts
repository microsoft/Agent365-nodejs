// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { TurnContext } from '@microsoft/agents-hosting';
import { OperationResult } from '../../packages/agents-a365-runtime/src/operation-result';
import { McpToolRegistrationService } from '../../packages/agents-a365-tooling-extensions-claude/src/McpToolRegistrationService';
import type { SessionMessage } from '@anthropic-ai/claude-agent-sdk';
import {
  createMixedMessages,
  createUserMessage,
} from './fixtures/mockClaudeTypes';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock getSessionMessages from Claude SDK
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  getSessionMessages: jest.fn(),
}));

import { getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
const mockedGetSessionMessages = getSessionMessages as jest.MockedFunction<typeof getSessionMessages>;

describe('McpToolRegistrationService - sendChatHistoryAsync', () => {
  let service: McpToolRegistrationService;
  let mockTurnContext: jest.Mocked<TurnContext>;

  beforeEach(() => {
    service = new McpToolRegistrationService();

    mockTurnContext = {
      activity: {
        conversation: { id: 'conv-123' },
        id: 'msg-456',
        text: 'Current user message',
        channelId: 'test-channel',
      },
    } as unknown as jest.Mocked<TurnContext>;

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('input validation', () => {
    it('should throw when turnContext is null', async () => {
      await expect(
        service.sendChatHistoryAsync(null as unknown as TurnContext, 'session-123')
      ).rejects.toThrow('turnContext is required');
    });

    it('should throw when turnContext is undefined', async () => {
      await expect(
        service.sendChatHistoryAsync(undefined as unknown as TurnContext, 'session-123')
      ).rejects.toThrow('turnContext is required');
    });

    it('should throw when sessionId is null', async () => {
      await expect(
        service.sendChatHistoryAsync(mockTurnContext, null as unknown as string)
      ).rejects.toThrow('sessionId is required');
    });

    it('should throw when sessionId is undefined', async () => {
      await expect(
        service.sendChatHistoryAsync(mockTurnContext, undefined as unknown as string)
      ).rejects.toThrow('sessionId is required');
    });

    it('should throw when sessionId is empty string', async () => {
      await expect(
        service.sendChatHistoryAsync(mockTurnContext, '')
      ).rejects.toThrow('sessionId is required');
    });

    it('should throw when sessionId is whitespace only', async () => {
      await expect(
        service.sendChatHistoryAsync(mockTurnContext, '   ')
      ).rejects.toThrow('sessionId is required');
    });
  });

  describe('successful scenarios', () => {
    it('should retrieve and send session messages successfully', async () => {
      const messages = createMixedMessages();
      mockedGetSessionMessages.mockResolvedValue(messages);
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await service.sendChatHistoryAsync(mockTurnContext, 'session-123');

      expect(result).toBeDefined();
      expect(result.succeeded).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(mockedGetSessionMessages).toHaveBeenCalledWith('session-123', {});
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should pass limit to getSessionMessages options', async () => {
      const messages = createMixedMessages();
      mockedGetSessionMessages.mockResolvedValue(messages);
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      await service.sendChatHistoryAsync(mockTurnContext, 'session-123', 2);

      expect(mockedGetSessionMessages).toHaveBeenCalledWith('session-123', { limit: 2 });
    });

    it('should return success for empty session', async () => {
      mockedGetSessionMessages.mockResolvedValue([]);
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await service.sendChatHistoryAsync(mockTurnContext, 'session-123');

      expect(result.succeeded).toBe(true);
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
      const messages = createMixedMessages();
      mockedGetSessionMessages.mockResolvedValue(messages);
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const toolOptions = { orchestratorName: 'CustomBot' };

      await service.sendChatHistoryAsync(mockTurnContext, 'session-123', undefined, toolOptions);

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
    it('should return failed on HTTP error', async () => {
      const messages = createMixedMessages();
      mockedGetSessionMessages.mockResolvedValue(messages);
      const httpError = new Error('Network error');
      mockedAxios.post.mockRejectedValue(httpError);
      mockedAxios.isAxiosError.mockReturnValue(false);

      const result = await service.sendChatHistoryAsync(mockTurnContext, 'session-123');

      expect(result.succeeded).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Network error');
    });

    it('should return failed when getSessionMessages throws', async () => {
      const sdkError = new Error('Session not found');
      mockedGetSessionMessages.mockRejectedValue(sdkError);

      const result = await service.sendChatHistoryAsync(mockTurnContext, 'session-123');

      expect(result.succeeded).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Session not found');
    });

    it('should re-throw validation errors from nested call', async () => {
      const messages = createMixedMessages();
      mockedGetSessionMessages.mockResolvedValue(messages);
      mockTurnContext.activity.conversation = undefined as unknown as { id: string };

      await expect(
        service.sendChatHistoryAsync(mockTurnContext, 'session-123')
      ).rejects.toThrow('Conversation ID is required');
    });
  });

  describe('OperationResult behavior', () => {
    it('should return OperationResult.success on successful request', async () => {
      const messages = createMixedMessages();
      mockedGetSessionMessages.mockResolvedValue(messages);
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await service.sendChatHistoryAsync(mockTurnContext, 'session-123');

      expect(result).toBe(OperationResult.success);
      expect(result.toString()).toBe('Succeeded');
    });

    it('should return new failed OperationResult on error', async () => {
      mockedGetSessionMessages.mockRejectedValue(new Error('Test error'));

      const result = await service.sendChatHistoryAsync(mockTurnContext, 'session-123');

      expect(result).not.toBe(OperationResult.success);
      expect(result.toString()).toContain('Failed');
      expect(result.toString()).toContain('Test error');
    });
  });

  describe('integration with sendChatHistoryMessagesAsync', () => {
    it('should correctly delegate to sendChatHistoryMessagesAsync', async () => {
      const messages = [
        createUserMessage('Test message 1', 'id-1'),
        createUserMessage('Test message 2', 'id-2'),
      ];
      mockedGetSessionMessages.mockResolvedValue(messages);
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await service.sendChatHistoryAsync(mockTurnContext, 'session-123');

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
