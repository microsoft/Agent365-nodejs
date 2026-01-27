// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { TurnContext } from '@microsoft/agents-hosting';
import { OperationResult } from '../../packages/agents-a365-runtime/src/operation-result';
import { McpToolRegistrationService } from '../../packages/agents-a365-tooling-extensions-openai/src/McpToolRegistrationService';
import { AgentInputItem } from '@openai/agents';
import {
  createMixedMessages,
  createUserMessage,
  createMessageWithEmptyContent,
  createMessageWithNullContent,
} from './fixtures/mockOpenAITypes';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('McpToolRegistrationService - sendChatHistoryMessagesAsync', () => {
  let service: McpToolRegistrationService;
  let mockTurnContext: jest.Mocked<TurnContext>;

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

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('input validation', () => {
    it('UV-03: should throw when turnContext is null', async () => {
      const messages = createMixedMessages();
      await expect(
        service.sendChatHistoryMessagesAsync(null as unknown as TurnContext, messages)
      ).rejects.toThrow('turnContext is required');
    });

    it('UV-03: should throw when turnContext is undefined', async () => {
      const messages = createMixedMessages();
      await expect(
        service.sendChatHistoryMessagesAsync(undefined as unknown as TurnContext, messages)
      ).rejects.toThrow('turnContext is required');
    });

    it('UV-04: should throw when messages is null', async () => {
      await expect(
        service.sendChatHistoryMessagesAsync(mockTurnContext, null as unknown as AgentInputItem[])
      ).rejects.toThrow('messages is required');
    });

    it('UV-04: should throw when messages is undefined', async () => {
      await expect(
        service.sendChatHistoryMessagesAsync(mockTurnContext, undefined as unknown as AgentInputItem[])
      ).rejects.toThrow('messages is required');
    });

    it('UV-05: should make MCP platform call even with empty array', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const result = await service.sendChatHistoryMessagesAsync(mockTurnContext, []);

      expect(result.succeeded).toBe(true);
      expect(result).toBe(OperationResult.success);
      // Verify that HTTP call was made even with empty messages
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          conversationId: 'conv-123',
          messageId: 'msg-456',
          userMessage: 'Current user message',
          chatHistory: [], // Empty chat history
        }),
        expect.any(Object)
      );
    });
  });

  describe('successful scenarios', () => {
    it('SP-03: should return success on successful send', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const messages = createMixedMessages();

      const result = await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(result).toBeDefined();
      expect(result.succeeded).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('SP-04: should use default orchestrator name "OpenAI"', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const messages = createMixedMessages();

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('OpenAI'),
          }),
        })
      );
    });

    it('SP-05: should use custom ToolOptions when provided', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const messages = createMixedMessages();
      const toolOptions = { orchestratorName: 'CustomOrchestrator' };

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages, toolOptions);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('CustomOrchestrator'),
          }),
        })
      );
    });

    it('should send correct request payload', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const messages = [
        createUserMessage('Hello', 'msg-1'),
        createUserMessage('World', 'msg-2'),
      ];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/agents/real-time-threat-protection/chat-message'),
        {
          conversationId: 'conv-123',
          messageId: 'msg-456',
          userMessage: 'Current user message',
          chatHistory: expect.arrayContaining([
            expect.objectContaining({
              id: 'msg-1',
              role: 'user',
              content: 'Hello',
              timestamp: expect.any(Date),
            }),
            expect.objectContaining({
              id: 'msg-2',
              role: 'user',
              content: 'World',
              timestamp: expect.any(Date),
            }),
          ]),
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          timeout: 10000,
        })
      );
    });
  });

  describe('error handling', () => {
    it('EH-03: should filter out messages that fail conversion', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const messages = [
        createUserMessage('Valid message', 'msg-1'),
        createMessageWithEmptyContent('user', 'msg-2'), // Will fail conversion
        createUserMessage('Another valid message', 'msg-3'),
      ];

      const result = await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(result.succeeded).toBe(true);
      // Should only have 2 messages in the request (the invalid one filtered out)
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: expect.arrayContaining([
            expect.objectContaining({ id: 'msg-1' }),
            expect.objectContaining({ id: 'msg-3' }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('should handle all messages failing conversion gracefully', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const messages = [
        createMessageWithEmptyContent('user', 'msg-1'),
        createMessageWithNullContent('assistant', 'msg-2'),
      ];

      const result = await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      // Should still succeed but with empty chat history
      expect(result.succeeded).toBe(true);
    });

    it('should return failed on HTTP error', async () => {
      const httpError = new Error('Network error');
      mockedAxios.post.mockRejectedValue(httpError);
      mockedAxios.isAxiosError.mockReturnValue(false);
      const messages = createMixedMessages();

      const result = await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(result.succeeded).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Network error');
    });

    it('should return failed on timeout', async () => {
      const timeoutError = Object.assign(new Error('Connection timed out'), { code: 'ETIMEDOUT' });
      mockedAxios.post.mockRejectedValue(timeoutError);
      mockedAxios.isAxiosError.mockReturnValue(true);
      const messages = createMixedMessages();

      const result = await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(result.succeeded).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it('should re-throw validation errors from core service', async () => {
      const messages = createMixedMessages();
      // Remove conversation ID to trigger validation error
      mockTurnContext.activity.conversation = undefined as unknown as { id: string };

      await expect(
        service.sendChatHistoryMessagesAsync(mockTurnContext, messages)
      ).rejects.toThrow('Conversation ID is required');
    });

    it('should re-throw validation error when message ID is missing', async () => {
      const messages = createMixedMessages();
      mockTurnContext.activity.id = undefined;

      await expect(
        service.sendChatHistoryMessagesAsync(mockTurnContext, messages)
      ).rejects.toThrow('Message ID is required');
    });

    it('should re-throw validation error when user message is missing', async () => {
      const messages = createMixedMessages();
      mockTurnContext.activity.text = undefined;

      await expect(
        service.sendChatHistoryMessagesAsync(mockTurnContext, messages)
      ).rejects.toThrow('User message is required');
    });
  });

  describe('OperationResult behavior', () => {
    it('should return OperationResult.success on successful request', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const messages = createMixedMessages();

      const result = await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(result).toBe(OperationResult.success);
      expect(result.toString()).toBe('Succeeded');
    });

    it('should return new failed OperationResult on error', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Server error'));
      mockedAxios.isAxiosError.mockReturnValue(false);
      const messages = createMixedMessages();

      const result = await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(result).not.toBe(OperationResult.success);
      expect(result.succeeded).toBe(false);
      expect(result.toString()).toContain('Failed');
    });
  });
});
