// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { McpToolRegistrationService } from '../../packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService';
import {
  MockTurnContext,
  MockHumanMessage,
  MockAIMessage,
  MockSystemMessage,
  MockToolMessage,
  MockFunctionMessage,
  MockChatMessage,
  MockUnknownMessage,
  createMockMultimodalMessage,
  createMockImageOnlyMessage,
  MockBaseMessage
} from './fixtures';
import { OperationResult } from '../../packages/agents-a365-runtime/src';
import { ChatHistoryMessage, McpToolServerConfigurationService } from '../../packages/agents-a365-tooling/src';

describe('McpToolRegistrationService - Message Conversion', () => {
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

  describe('Role Mapping (CV-01 to CV-06)', () => {
    it('CV-01: should map HumanMessage to "user" role', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = [new MockHumanMessage('Hello', 'msg-1')];

      await service.sendChatHistoryFromMessagesAsync(turnContext as never, messages as never);

      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].role).toBe('user');
    });

    it('CV-02: should map AIMessage to "assistant" role', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = [new MockAIMessage('I can help with that', 'msg-1')];

      await service.sendChatHistoryFromMessagesAsync(turnContext as never, messages as never);

      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].role).toBe('assistant');
    });

    it('CV-03: should map SystemMessage to "system" role', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = [new MockSystemMessage('You are a helpful assistant', 'msg-1')];

      await service.sendChatHistoryFromMessagesAsync(turnContext as never, messages as never);

      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].role).toBe('system');
    });

    it('CV-04: should map ToolMessage to "tool" role', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = [new MockToolMessage('Tool result data', 'tool-call-1', 'msg-1')];

      await service.sendChatHistoryFromMessagesAsync(turnContext as never, messages as never);

      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].role).toBe('tool');
    });

    it('CV-05: should map FunctionMessage to "function" role', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = [new MockFunctionMessage('Function output', 'msg-1')];

      await service.sendChatHistoryFromMessagesAsync(turnContext as never, messages as never);

      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].role).toBe('function');
    });

    it('CV-06: should use custom role from ChatMessage', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = [new MockChatMessage('Custom role message', 'moderator', 'msg-1')];

      await service.sendChatHistoryFromMessagesAsync(turnContext as never, messages as never);

      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].role).toBe('moderator');
    });

    it('should default unknown message types to "user" role', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = [new MockUnknownMessage('Unknown type message', 'msg-1')];

      await service.sendChatHistoryFromMessagesAsync(turnContext as never, messages as never);

      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].role).toBe('user');
    });
  });

  describe('Content Extraction (CV-07 to CV-11)', () => {
    it('CV-07: should concatenate text parts from ContentPart array', async () => {
      const turnContext = MockTurnContext.createValid();
      const multimodalMessage = createMockMultimodalMessage();
      const messages = [multimodalMessage];

      await service.sendChatHistoryFromMessagesAsync(turnContext as never, messages as never);

      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(1);
      // Text accessor should concatenate "Here is an image:" and "What do you see?"
      expect(sentMessages[0].content).toContain('Here is an image:');
      expect(sentMessages[0].content).toContain('What do you see?');
    });

    it('CV-08: should preserve existing message ID', async () => {
      const turnContext = MockTurnContext.createValid();
      const existingId = 'existing-message-id-12345';
      const messages = [new MockHumanMessage('Message with ID', existingId)];

      await service.sendChatHistoryFromMessagesAsync(turnContext as never, messages as never);

      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].id).toBe(existingId);
    });

    it('CV-09: should generate UUID for message without ID', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = [new MockHumanMessage('Message without ID')];

      await service.sendChatHistoryFromMessagesAsync(turnContext as never, messages as never);

      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(1);
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(sentMessages[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('CV-10: should skip message with empty string content', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = [
        new MockHumanMessage('Valid message', 'msg-1'),
        new MockAIMessage('', 'msg-2'), // Empty content
        new MockHumanMessage('Another valid message', 'msg-3')
      ];

      await service.sendChatHistoryFromMessagesAsync(turnContext as never, messages as never);

      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(2);
      expect(sentMessages[0].id).toBe('msg-1');
      expect(sentMessages[1].id).toBe('msg-3');
    });

    it('CV-10: should skip message with whitespace-only content', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = [
        new MockHumanMessage('Valid message', 'msg-1'),
        new MockAIMessage('   \n\t  ', 'msg-2'), // Whitespace only
        new MockHumanMessage('Another valid message', 'msg-3')
      ];

      await service.sendChatHistoryFromMessagesAsync(turnContext as never, messages as never);

      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(2);
      expect(sentMessages[0].id).toBe('msg-1');
      expect(sentMessages[1].id).toBe('msg-3');
    });

    it('CV-11: should skip image-only ContentPart message (no text)', async () => {
      const turnContext = MockTurnContext.createValid();
      const imageOnlyMessage = createMockImageOnlyMessage();
      const messages = [
        new MockHumanMessage('Valid message', 'msg-1'),
        imageOnlyMessage, // Image only, no text
        new MockHumanMessage('Another valid message', 'msg-3')
      ];

      await service.sendChatHistoryFromMessagesAsync(turnContext as never, messages as never);

      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(2);
      expect(sentMessages[0].id).toBe('msg-1');
      expect(sentMessages[1].id).toBe('msg-3');
    });

    it('should include timestamp in converted messages', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = [new MockHumanMessage('Test message', 'msg-1')];

      const beforeTime = new Date();
      await service.sendChatHistoryFromMessagesAsync(turnContext as never, messages as never);
      const afterTime = new Date();

      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].timestamp).toBeInstanceOf(Date);
      expect(sentMessages[0].timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(sentMessages[0].timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should extract plain string content correctly', async () => {
      const turnContext = MockTurnContext.createValid();
      const content = 'This is a simple text message';
      const messages = [new MockHumanMessage(content, 'msg-1')];

      await service.sendChatHistoryFromMessagesAsync(turnContext as never, messages as never);

      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].content).toBe(content);
    });
  });

  describe('Mixed Message Conversion', () => {
    it('should convert array with all message types correctly', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages: MockBaseMessage[] = [
        new MockHumanMessage('User question', 'msg-1'),
        new MockAIMessage('Assistant response', 'msg-2'),
        new MockSystemMessage('System instruction', 'msg-3'),
        new MockToolMessage('Tool result', 'tool-call-1', 'msg-4'),
        new MockFunctionMessage('Function output', 'msg-5'),
        new MockChatMessage('Custom message', 'custom-role', 'msg-6')
      ];

      await service.sendChatHistoryFromMessagesAsync(turnContext as never, messages as never);

      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(6);
      expect(sentMessages[0].role).toBe('user');
      expect(sentMessages[1].role).toBe('assistant');
      expect(sentMessages[2].role).toBe('system');
      expect(sentMessages[3].role).toBe('tool');
      expect(sentMessages[4].role).toBe('function');
      expect(sentMessages[5].role).toBe('custom-role');
    });

    it('should filter out invalid messages while keeping valid ones', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages: MockBaseMessage[] = [
        new MockHumanMessage('Valid 1', 'msg-1'),
        new MockAIMessage('', 'msg-2'), // Invalid - empty
        new MockHumanMessage('Valid 2', 'msg-3'),
        createMockImageOnlyMessage(), // Invalid - image only
        new MockAIMessage('Valid 3', 'msg-5')
      ];

      await service.sendChatHistoryFromMessagesAsync(turnContext as never, messages as never);

      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(3);
      expect(sentMessages[0].content).toBe('Valid 1');
      expect(sentMessages[1].content).toBe('Valid 2');
      expect(sentMessages[2].content).toBe('Valid 3');
    });
  });
});
