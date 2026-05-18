// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { McpToolRegistrationService } from '../../packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService';
import {
  MockTurnContext,
  MockCompiledStateGraph,
  createMockMessageArray,
  createMockStateSnapshot,
  MockBaseMessage
} from './fixtures';
import { OperationResult } from '../../packages/agents-a365-runtime/src';
import { ChatHistoryMessage, ToolOptions, McpToolServerConfigurationService } from '../../packages/agents-a365-tooling/src';

describe('McpToolRegistrationService - sendChatHistoryAsync (Level 1 API)', () => {
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

  describe('SP-01: Success path with valid graph and config', () => {
    it('should fetch state from graph, convert messages, and send to API', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();
      const graph = new MockCompiledStateGraph<{ messages: MockBaseMessage[] }>();
      graph.setStateToReturn(createMockStateSnapshot(messages));
      const config = { configurable: { thread_id: 'test-thread-1' } };

      const result = await service.sendChatHistoryAsync(
        turnContext as never,
        graph as never,
        config
      );

      // Verify graph.getState was called with the config
      expect(graph.getGetStateCalls()).toHaveLength(1);
      expect(graph.getGetStateCalls()[0]).toEqual(config);

      // Verify sendChatHistory was called
      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);

      // Verify messages were converted correctly
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(4); // createMockMessageArray returns 4 messages

      // Verify result is success
      expect(result.succeeded).toBe(true);
    });

    it('should return the OperationResult from configService', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();
      const graph = new MockCompiledStateGraph<{ messages: MockBaseMessage[] }>();
      graph.setStateToReturn(createMockStateSnapshot(messages));
      const config = { configurable: { thread_id: 'test-thread-1' } };

      const result = await service.sendChatHistoryAsync(
        turnContext as never,
        graph as never,
        config
      );

      expect(result).toBe(OperationResult.success);
    });

    it('should pass limit parameter through the delegation chain', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray(); // 4 messages
      const graph = new MockCompiledStateGraph<{ messages: MockBaseMessage[] }>();
      graph.setStateToReturn(createMockStateSnapshot(messages));
      const config = { configurable: { thread_id: 'test-thread-1' } };
      const limit = 2;

      await service.sendChatHistoryAsync(
        turnContext as never,
        graph as never,
        config,
        limit
      );

      // Verify only 2 messages were sent due to limit
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(2);
    });

    it('should pass toolOptions through the delegation chain', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();
      const graph = new MockCompiledStateGraph<{ messages: MockBaseMessage[] }>();
      graph.setStateToReturn(createMockStateSnapshot(messages));
      const config = { configurable: { thread_id: 'test-thread-1' } };
      const toolOptions = { orchestratorName: 'CustomOrchestrator' };

      await service.sendChatHistoryAsync(
        turnContext as never,
        graph as never,
        config,
        undefined,
        toolOptions
      );

      // Verify toolOptions were passed
      const passedOptions = mockSendChatHistoryFn.mock.calls[0][2] as ToolOptions;
      expect(passedOptions.orchestratorName).toBe('CustomOrchestrator');
    });

    it('should use default orchestratorName when toolOptions not provided', async () => {
      const turnContext = MockTurnContext.createValid();
      const messages = createMockMessageArray();
      const graph = new MockCompiledStateGraph<{ messages: MockBaseMessage[] }>();
      graph.setStateToReturn(createMockStateSnapshot(messages));
      const config = { configurable: { thread_id: 'test-thread-1' } };

      await service.sendChatHistoryAsync(
        turnContext as never,
        graph as never,
        config
      );

      // Verify default orchestratorName was used
      const passedOptions = mockSendChatHistoryFn.mock.calls[0][2] as ToolOptions;
      expect(passedOptions.orchestratorName).toBe('LangChain');
    });

    it('should handle graph with empty messages array', async () => {
      const turnContext = MockTurnContext.createValid();
      const graph = new MockCompiledStateGraph<{ messages: MockBaseMessage[] }>();
      graph.setStateToReturn(createMockStateSnapshot([])); // Empty messages
      const config = { configurable: { thread_id: 'test-thread-1' } };

      const result = await service.sendChatHistoryAsync(
        turnContext as never,
        graph as never,
        config
      );

      // Should still call sendChatHistory with empty array (important for RTP)
      expect(mockSendChatHistoryFn).toHaveBeenCalledTimes(1);
      const sentMessages = mockSendChatHistoryFn.mock.calls[0][1] as ChatHistoryMessage[];
      expect(sentMessages).toHaveLength(0);
      expect(result.succeeded).toBe(true);
    });
  });
});
