// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { McpToolRegistrationService } from '../../packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService';
import {
  MockTurnContext,
  createMockMessageArray,
  createMockStateSnapshot,
  MockBaseMessage,
  MockHumanMessage,
  MockAIMessage
} from './fixtures';
import { OperationResult } from '../../packages/agents-a365-runtime/src';
import { ChatHistoryMessage, ToolOptions, McpToolServerConfigurationService } from '../../packages/agents-a365-tooling/src';

describe('McpToolRegistrationService - sendChatHistoryFromStateAsync (Level 2 API)', () => {
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

  describe('SP-02: Success path with valid StateSnapshot', () => {
    it('should extract messages from stateSnapshot.values.messages and send them', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();
      const stateSnapshot = createMockStateSnapshot(messages);

      const result = await service.sendChatHistoryFromStateAsync(
        turnContext as never,
        stateSnapshot as never
      );

      // Verify sendChatHistory was called
      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);

      // Verify messages were extracted and converted
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(4);

      // Verify result is success
      expect(result.succeeded).toBe(true);
    });

    it('should pass turnContext to the underlying sendChatHistory call', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();
      const stateSnapshot = createMockStateSnapshot(messages);

      await service.sendChatHistoryFromStateAsync(
        turnContext as never,
        stateSnapshot as never
      );

      // Verify turnContext was passed
      expect(mockSendChatHistoryFn.mock.calls[0][0]).toBe(turnContext);
    });

    it('should apply limit parameter when extracting messages', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray(); // 4 messages
      const stateSnapshot = createMockStateSnapshot(messages);
      const limit = 2;

      await service.sendChatHistoryFromStateAsync(
        turnContext as never,
        stateSnapshot as never,
        limit
      );

      // Verify only 2 messages were sent
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(2);
    });

    it('should pass toolOptions to sendChatHistoryFromMessagesAsync', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();
      const stateSnapshot = createMockStateSnapshot(messages);
      const toolOptions = { orchestratorName: 'CustomOrchestrator' };

      await service.sendChatHistoryFromStateAsync(
        turnContext as never,
        stateSnapshot as never,
        undefined,
        toolOptions
      );

      // Verify toolOptions were passed
      const passedOptions = mockSendChatHistoryFn.mock.calls[0][2] as ToolOptions;
      expect(passedOptions.orchestratorName).toBe('CustomOrchestrator');
    });

    it('should handle StateSnapshot with empty messages array', async () => {
      const turnContext = MockTurnContext.createValid();
      const stateSnapshot = createMockStateSnapshot<{ messages: MockBaseMessage[] }>([]);

      const result = await service.sendChatHistoryFromStateAsync(
        turnContext as never,
        stateSnapshot as never
      );

      // Should still call sendChatHistory with empty array (required for RTP)
      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(0);
      expect(result.succeeded).toBe(true);
    });

    it('should preserve message order from StateSnapshot', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages: MockBaseMessage[] = [
        new MockHumanMessage('First message', 'msg-1'),
        new MockAIMessage('Second message', 'msg-2'),
        new MockHumanMessage('Third message', 'msg-3')
      ];
      const stateSnapshot = createMockStateSnapshot(messages);

      await service.sendChatHistoryFromStateAsync(
        turnContext as never,
        stateSnapshot as never
      );

      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(3);
      expect(sentMessages[0].content).toBe('First message');
      expect(sentMessages[1].content).toBe('Second message');
      expect(sentMessages[2].content).toBe('Third message');
    });

    it('should handle StateSnapshot with config metadata', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();
      const stateSnapshot = {
        values: { messages },
        config: { configurable: { thread_id: 'custom-thread', checkpoint_ns: 'ns' } },
        metadata: { custom: 'metadata' },
        createdAt: new Date().toISOString()
      };

      const result = await service.sendChatHistoryFromStateAsync(
        turnContext as never,
        stateSnapshot as never
      );

      // Should work regardless of additional metadata
      expect(result.succeeded).toBe(true);
      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
    });
  });
});
