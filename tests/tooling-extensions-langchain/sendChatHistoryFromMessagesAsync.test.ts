// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { McpToolRegistrationService } from '../../packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService';
import {
  MockTurnContext,
  createMockMessageArray,
  MockBaseMessage,
  MockHumanMessage,
  MockAIMessage,
  createMockImageOnlyMessage
} from './fixtures';
import { OperationResult } from '../../packages/agents-a365-runtime/src';
import { ChatHistoryMessage, ToolOptions, McpToolServerConfigurationService } from '../../packages/agents-a365-tooling/src';

describe('McpToolRegistrationService - sendChatHistoryFromMessagesAsync (Level 4 API)', () => {
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

  describe('SP-04: Valid BaseMessage array', () => {
    it('should convert messages and send them to the API', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();

      const result = await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never
      );

      // Verify sendChatHistory was called
      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);

      // Verify messages were converted
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(4);

      // Verify result is success
      expect(result.succeeded).toBe(true);
    });

    it('should pass turnContext to configService.sendChatHistory', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();

      await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never
      );

      expect(mockSendChatHistoryFn.mock.calls[0][0]).toBe(turnContext);
    });

    it('should return OperationResult from configService', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();

      const result = await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never
      );

      expect(result).toBe(OperationResult.success);
    });
  });

  describe('SP-05: Messages with limit parameter', () => {
    it('should only send first N messages when limit is specified', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray(); // 4 messages
      const limit = 2;

      await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never,
        limit
      );

      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(2);
    });

    it('should respect limit=0 and send empty array', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray(); // 4 messages
      const limit = 0;

      await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never,
        limit
      );

      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(0);
    });

    it('should send all messages when limit exceeds array length', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray(); // 4 messages
      const limit = 100;

      await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never,
        limit
      );

      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(4);
    });

    it('should send all messages when limit is undefined', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray(); // 4 messages

      await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never
      );

      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(4);
    });

    it('should apply limit before conversion (limit affects source messages)', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages: MockBaseMessage[] = [
        new MockHumanMessage('First', 'msg-1'),
        new MockAIMessage('Second', 'msg-2'),
        new MockHumanMessage('Third', 'msg-3'),
        new MockAIMessage('Fourth', 'msg-4')
      ];
      const limit = 2;

      await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never,
        limit
      );

      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(2);
      expect(sentMessages[0].content).toBe('First');
      expect(sentMessages[1].content).toBe('Second');
    });
  });

  describe('SP-06: Mixed valid/invalid messages', () => {
    it('should send valid messages and skip invalid ones', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages: MockBaseMessage[] = [
        new MockHumanMessage('Valid 1', 'msg-1'),
        new MockAIMessage('', 'msg-2'), // Invalid - empty
        new MockHumanMessage('Valid 2', 'msg-3'),
        createMockImageOnlyMessage(), // Invalid - no text
        new MockAIMessage('Valid 3', 'msg-5')
      ];

      await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never
      );

      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(3);
      expect(sentMessages[0].content).toBe('Valid 1');
      expect(sentMessages[1].content).toBe('Valid 2');
      expect(sentMessages[2].content).toBe('Valid 3');
    });

    it('should handle array where all messages are invalid', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages: MockBaseMessage[] = [
        new MockAIMessage('', 'msg-1'),
        new MockHumanMessage('   ', 'msg-2'),
        createMockImageOnlyMessage()
      ];

      await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never
      );

      // Should still call API with empty array
      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(0);
    });
  });

  describe('SP-07: Custom toolOptions', () => {
    it('should pass custom orchestratorName to configService', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();
      const toolOptions = { orchestratorName: 'CustomOrchestrator' };

      await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never,
        undefined,
        toolOptions
      );

      const passedOptions = mockSendChatHistoryFn.mock.calls[0][2];
      expect(passedOptions!.orchestratorName).toBe('CustomOrchestrator');
    });

    it('should use default orchestratorName "LangChain" when not specified', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();

      await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never
      );

      const passedOptions = mockSendChatHistoryFn.mock.calls[0][2];
      expect(passedOptions!.orchestratorName).toBe('LangChain');
    });

    it('should use default orchestratorName when toolOptions is empty object', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();
      const toolOptions = {};

      await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never,
        undefined,
        toolOptions
      );

      const passedOptions = mockSendChatHistoryFn.mock.calls[0][2];
      expect(passedOptions!.orchestratorName).toBe('LangChain');
    });
  });

  describe('SP-08: Empty messages array - Critical for RTP', () => {
    it('should send empty array to API (not no-op)', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages: MockBaseMessage[] = [];

      const result = await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never
      );

      // CRITICAL: Empty array must be sent to register user message with RTP
      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toEqual([]);
      expect(result.succeeded).toBe(true);
    });

    it('should not skip API call when messages array is empty', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages: MockBaseMessage[] = [];

      await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never
      );

      // Verify API was called exactly once
      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
    });

    it('should pass correct options even with empty messages', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages: MockBaseMessage[] = [];
      const toolOptions = { orchestratorName: 'TestOrchestrator' };

      await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never,
        undefined,
        toolOptions
      );

      expect(mockSendChatHistoryFn.mock.calls[0][0]).toBe(turnContext);
      expect(mockSendChatHistoryFn.mock.calls[0][1]).toEqual([]);
      expect(mockSendChatHistoryFn.mock.calls[0][2]!.orchestratorName).toBe('TestOrchestrator');
    });
  });

  describe('Message preservation and ordering', () => {
    it('should preserve message order in output', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages: MockBaseMessage[] = [
        new MockHumanMessage('First', 'msg-1'),
        new MockAIMessage('Second', 'msg-2'),
        new MockHumanMessage('Third', 'msg-3'),
        new MockAIMessage('Fourth', 'msg-4')
      ];

      await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never
      );

      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages[0].content).toBe('First');
      expect(sentMessages[1].content).toBe('Second');
      expect(sentMessages[2].content).toBe('Third');
      expect(sentMessages[3].content).toBe('Fourth');
    });

    it('should preserve message IDs in output', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages: MockBaseMessage[] = [
        new MockHumanMessage('Test 1', 'custom-id-1'),
        new MockAIMessage('Test 2', 'custom-id-2')
      ];

      await service.sendChatHistoryFromMessagesAsync(
        turnContext as never,
        messages as never
      );

      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages[0].id).toBe('custom-id-1');
      expect(sentMessages[1].id).toBe('custom-id-2');
    });
  });
});
