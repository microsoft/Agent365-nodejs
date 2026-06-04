// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { TurnContext } from '@microsoft/agents-hosting';
import { McpToolRegistrationService } from '../../packages/agents-a365-tooling-extensions-claude/src/McpToolRegistrationService';
import {
  createUserMessage,
  createAssistantMessage,
  createMessageWithContentBlocks,
  createToolUseMessage,
  createToolResultMessage,
  createMessageWithEmptyContent,
  createMessageWithoutUuid,
  createMessagesWithVariousContentTypes,
} from './fixtures/mockClaudeTypes';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock getSessionMessages
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  getSessionMessages: jest.fn(),
}));

describe('McpToolRegistrationService - message conversion', () => {
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

  describe('role normalization', () => {
    it('should map "user" type to "user" role', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const messages = [createUserMessage('Hello', 'msg-1')];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      const callArgs = mockedAxios.post.mock.calls[0];
      const payload = callArgs[1] as { chatHistory: Array<{ role: string }> };
      expect(payload.chatHistory[0].role).toBe('user');
    });

    it('should map "assistant" type to "assistant" role', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const messages = [createAssistantMessage('Hi there', 'msg-1')];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      const callArgs = mockedAxios.post.mock.calls[0];
      const payload = callArgs[1] as { chatHistory: Array<{ role: string }> };
      expect(payload.chatHistory[0].role).toBe('assistant');
    });
  });

  describe('content extraction', () => {
    it('should extract string content from message payload', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const messages = [createUserMessage('Hello world', 'msg-1')];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      const callArgs = mockedAxios.post.mock.calls[0];
      const payload = callArgs[1] as { chatHistory: Array<{ content: string }> };
      expect(payload.chatHistory[0].content).toBe('Hello world');
    });

    it('should extract text from content blocks', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const messages = [createMessageWithContentBlocks('assistant', [
        { type: 'text', text: 'Part one.' },
        { type: 'text', text: 'Part two.' },
      ], 'msg-1')];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      const callArgs = mockedAxios.post.mock.calls[0];
      const payload = callArgs[1] as { chatHistory: Array<{ content: string }> };
      expect(payload.chatHistory[0].content).toBe('Part one. Part two.');
    });

    it('should only extract text blocks from tool_use messages', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const messages = [createToolUseMessage('search', { query: 'test' }, 'msg-1')];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      const callArgs = mockedAxios.post.mock.calls[0];
      const payload = callArgs[1] as { chatHistory: Array<{ content: string }> };
      expect(payload.chatHistory[0].content).toBe("I'll use the search tool.");
    });

    it('should skip tool_result messages with no text blocks', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const messages = [createToolResultMessage('Search results here', 'msg-1')];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      const callArgs = mockedAxios.post.mock.calls[0];
      const payload = callArgs[1] as { chatHistory: Array<{ content: string }> };
      expect(payload.chatHistory).toHaveLength(0);
    });

    it('should skip messages with empty content', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const messages = [
        createUserMessage('Valid message', 'msg-1'),
        createMessageWithEmptyContent('user', 'msg-2'),
        createAssistantMessage('Also valid', 'msg-3'),
      ];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      const callArgs = mockedAxios.post.mock.calls[0];
      const payload = callArgs[1] as { chatHistory: Array<{ id: string }> };
      expect(payload.chatHistory).toHaveLength(2);
      expect(payload.chatHistory[0].id).toBe('msg-1');
      expect(payload.chatHistory[1].id).toBe('msg-3');
    });
  });

  describe('ID extraction', () => {
    it('should use message uuid when present', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const messages = [createUserMessage('Hello', 'specific-uuid-123')];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      const callArgs = mockedAxios.post.mock.calls[0];
      const payload = callArgs[1] as { chatHistory: Array<{ id: string }> };
      expect(payload.chatHistory[0].id).toBe('specific-uuid-123');
    });

    it('should generate UUID when message uuid is empty', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const messages = [createMessageWithoutUuid('user', 'Hello')];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      const callArgs = mockedAxios.post.mock.calls[0];
      const payload = callArgs[1] as { chatHistory: Array<{ id: string }> };
      expect(payload.chatHistory[0].id).toBeTruthy();
      expect(payload.chatHistory[0].id.length).toBeGreaterThan(0);
    });
  });

  describe('mixed content handling', () => {
    it('should handle various content types in a single batch', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      const messages = createMessagesWithVariousContentTypes();

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      const callArgs = mockedAxios.post.mock.calls[0];
      const payload = callArgs[1] as { chatHistory: Array<{ id: string; role: string; content: string }> };
      // msg-4 (tool_result with no text blocks) and msg-5 (empty content) are filtered out
      expect(payload.chatHistory).toHaveLength(3);
      expect(payload.chatHistory[0].content).toBe('Simple text message');
      expect(payload.chatHistory[1].content).toBe('Here is my response. With multiple blocks.');
      expect(payload.chatHistory[2].content).toBe("I'll use the search tool.");
    });
  });
});
