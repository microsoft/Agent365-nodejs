// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { TurnContext } from '@microsoft/agents-hosting';
import { OperationResult } from '../../packages/agents-a365-runtime/src/operation-result';
import { McpToolServerConfigurationService } from '../../packages/agents-a365-tooling/src/McpToolServerConfigurationService';
import { ChatHistoryMessage } from '../../packages/agents-a365-tooling/src/models/index';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('McpToolServerConfigurationService - sendChatHistory', () => {
  let service: McpToolServerConfigurationService;
  let mockTurnContext: jest.Mocked<TurnContext>;
  let chatHistoryMessages: ChatHistoryMessage[];

  beforeEach(() => {
    service = new McpToolServerConfigurationService();
    
    // Create mock turn context with all required properties
    mockTurnContext = {
      activity: {
        conversation: { id: 'conv-123' },
        id: 'msg-456',
        text: 'Current user message',
        channelId: 'test-channel',
      },
    } as unknown as jest.Mocked<TurnContext>;

    // Create sample chat history
    chatHistoryMessages = [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Hello',
        timestamp: new Date('2024-01-01T10:00:00Z'),
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'Hi there!',
        timestamp: new Date('2024-01-01T10:00:01Z'),
      },
    ];

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('successful scenarios', () => {
    it('should successfully send chat history', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await service.sendChatHistory(mockTurnContext, chatHistoryMessages);

      expect(result).toBeDefined();
      expect(result.succeeded).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should send correct request payload', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      await service.sendChatHistory(mockTurnContext, chatHistoryMessages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/agents/real-time-threat-protection/chat-message'),
        {
          conversationId: 'conv-123',
          messageId: 'msg-456',
          userMessage: 'Current user message',
          chatHistory: chatHistoryMessages,
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          timeout: 10000,
        })
      );
    });

    it('should send chat history with ToolOptions', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const options = { orchestratorName: 'TestBot' };
      const result = await service.sendChatHistory(mockTurnContext, chatHistoryMessages, options);

      expect(result.succeeded).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should NOT include x-ms-agentid header in sendChatHistory requests', async () => {
      // Per PRD: sendChatHistory() passes undefined for authToken,
      // so x-ms-agentid header should NOT be included
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      await service.sendChatHistory(mockTurnContext, chatHistoryMessages);

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      const callArgs = mockedAxios.post.mock.calls[0];
      const requestConfig = callArgs[2] as { headers: Record<string, string> };

      // Verify x-ms-agentid is NOT in the headers
      expect(requestConfig.headers['x-ms-agentid']).toBeUndefined();
      // But other headers like x-ms-channel-id should still be present
      expect(requestConfig.headers['x-ms-channel-id']).toBe('test-channel');
    });

    it('should send empty chat history', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await service.sendChatHistory(mockTurnContext, []);

      expect(result.succeeded).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: [],
        }),
        expect.any(Object)
      );
    });
  });

  describe('validation errors', () => {
    it('should throw error when turnContext is null', async () => {
      await expect(
        service.sendChatHistory(null as unknown as TurnContext, chatHistoryMessages)
      ).rejects.toThrow('turnContext is required');
    });

    it('should throw error when turnContext is undefined', async () => {
      await expect(
        service.sendChatHistory(undefined as unknown as TurnContext, chatHistoryMessages)
      ).rejects.toThrow('turnContext is required');
    });

    it('should throw error when chatHistoryMessages is null', async () => {
      await expect(
        service.sendChatHistory(mockTurnContext, null as unknown as ChatHistoryMessage[])
      ).rejects.toThrow('chatHistoryMessages is required');
    });

    it('should throw error when chatHistoryMessages is undefined', async () => {
      await expect(
        service.sendChatHistory(mockTurnContext, undefined as unknown as ChatHistoryMessage[])
      ).rejects.toThrow('chatHistoryMessages is required');
    });

    it('should throw error when conversation ID is missing', async () => {
      mockTurnContext.activity.conversation = undefined as any;

      await expect(
        service.sendChatHistory(mockTurnContext, chatHistoryMessages)
      ).rejects.toThrow('Conversation ID is required but not found in turn context');
    });

    it('should throw error when message ID is missing', async () => {
      mockTurnContext.activity.id = undefined;

      await expect(
        service.sendChatHistory(mockTurnContext, chatHistoryMessages)
      ).rejects.toThrow('Message ID is required but not found in turn context');
    });

    it('should throw error when user message is missing', async () => {
      mockTurnContext.activity.text = undefined;

      await expect(
        service.sendChatHistory(mockTurnContext, chatHistoryMessages)
      ).rejects.toThrow('User message is required but not found in turn context');
    });
  });

  describe('error handling', () => {
    it('should return failed result on HTTP error', async () => {
      const httpError = new Error('Network error');
      mockedAxios.post.mockRejectedValue(httpError);
      mockedAxios.isAxiosError.mockReturnValue(false);

      const result = await service.sendChatHistory(mockTurnContext, chatHistoryMessages);

      expect(result.succeeded).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Network error');
    });

    it('should return failed result on timeout error', async () => {
      const timeoutError = Object.assign(new Error('Timeout'), { code: 'ETIMEDOUT' });
      mockedAxios.post.mockRejectedValue(timeoutError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      const result = await service.sendChatHistory(mockTurnContext, chatHistoryMessages);

      expect(result.succeeded).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Timeout');
    });

    it('should return failed result on connection aborted error', async () => {
      const abortError = Object.assign(new Error('Connection aborted'), { code: 'ECONNABORTED' });
      mockedAxios.post.mockRejectedValue(abortError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      const result = await service.sendChatHistory(mockTurnContext, chatHistoryMessages);

      expect(result.succeeded).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Connection aborted');
    });

    it('should return failed result on axios error', async () => {
      const axiosError = Object.assign(new Error('Request failed with status code 500'), {
        code: 'ERR_BAD_RESPONSE',
      });
      mockedAxios.post.mockRejectedValue(axiosError);
      mockedAxios.isAxiosError.mockReturnValue(true);

      const result = await service.sendChatHistory(mockTurnContext, chatHistoryMessages);

      expect(result.succeeded).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Request failed');
    });

    it('should not throw exception on HTTP error', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Server error'));
      mockedAxios.isAxiosError.mockReturnValue(false);

      // Should not throw, but return failed result
      const result = await service.sendChatHistory(mockTurnContext, chatHistoryMessages);

      expect(result.succeeded).toBe(false);
      expect(() => result.toString()).not.toThrow();
    });
  });

  describe('OperationResult behavior', () => {
    it('should return OperationResult.success on successful request', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await service.sendChatHistory(mockTurnContext, chatHistoryMessages);

      expect(result).toBe(OperationResult.success);
      expect(result.toString()).toBe('Succeeded');
    });

    it('should return new failed OperationResult on error', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Test error'));
      mockedAxios.isAxiosError.mockReturnValue(false);

      const result = await service.sendChatHistory(mockTurnContext, chatHistoryMessages);

      expect(result).not.toBe(OperationResult.success);
      expect(result.toString()).toContain('Failed');
      expect(result.toString()).toContain('Test error');
    });
  });

  describe('endpoint configuration', () => {
    it('should use production endpoint by default', async () => {
      delete process.env.MCP_PLATFORM_ENDPOINT;
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      await service.sendChatHistory(mockTurnContext, chatHistoryMessages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('https://agent365.svc.cloud.microsoft'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should use custom endpoint when MCP_PLATFORM_ENDPOINT is set', async () => {
      const originalEnv = process.env.MCP_PLATFORM_ENDPOINT;
      process.env.MCP_PLATFORM_ENDPOINT = 'https://custom-mcp.example.com';
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      await service.sendChatHistory(mockTurnContext, chatHistoryMessages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('https://custom-mcp.example.com'),
        expect.any(Object),
        expect.any(Object)
      );

      // Restore original value
      if (originalEnv) {
        process.env.MCP_PLATFORM_ENDPOINT = originalEnv;
      } else {
        delete process.env.MCP_PLATFORM_ENDPOINT;
      }
    });
  });
});
