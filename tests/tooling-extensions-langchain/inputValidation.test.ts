// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach } from '@jest/globals';
import { McpToolRegistrationService } from '../../packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService';
import {
  MockTurnContext,
  MockCompiledStateGraph,
  MockBaseChatMessageHistory,
  createMockMessageArray,
  createMockStateSnapshot,
  MockBaseMessage
} from './fixtures';

describe('McpToolRegistrationService - Input Validation', () => {
  let service: McpToolRegistrationService;

  beforeEach(() => {
    service = new McpToolRegistrationService();
  });

  describe('sendChatHistoryAsync validation (UV-01 to UV-03)', () => {
    it('UV-01: should throw when turnContext is null', async () => {
      const graph = new MockCompiledStateGraph<{ messages: MockBaseMessage[] }>();
      graph.setStateToReturn(createMockStateSnapshot(createMockMessageArray()));
      const config = { configurable: { thread_id: '1' } };

      await expect(
        service.sendChatHistoryAsync(null as never, graph as never, config)
      ).rejects.toThrow('turnContext is required');
    });

    it('UV-01: should throw when turnContext is undefined', async () => {
      const graph = new MockCompiledStateGraph<{ messages: MockBaseMessage[] }>();
      graph.setStateToReturn(createMockStateSnapshot(createMockMessageArray()));
      const config = { configurable: { thread_id: '1' } };

      await expect(
        service.sendChatHistoryAsync(undefined as never, graph as never, config)
      ).rejects.toThrow('turnContext is required');
    });

    it('UV-02: should throw when graph is null', async () => {
      const turnContext = MockTurnContext.createValid();
      const config = { configurable: { thread_id: '1' } };

      await expect(
        service.sendChatHistoryAsync(turnContext as never, null as never, config)
      ).rejects.toThrow('graph is required');
    });

    it('UV-02: should throw when graph is undefined', async () => {
      const turnContext = MockTurnContext.createValid();
      const config = { configurable: { thread_id: '1' } };

      await expect(
        service.sendChatHistoryAsync(turnContext as never, undefined as never, config)
      ).rejects.toThrow('graph is required');
    });

    it('UV-03: should throw when config is null', async () => {
      const turnContext = MockTurnContext.createValid();
      const graph = new MockCompiledStateGraph<{ messages: MockBaseMessage[] }>();

      await expect(
        service.sendChatHistoryAsync(turnContext as never, graph as never, null as never)
      ).rejects.toThrow('config is required');
    });

    it('UV-03: should throw when config is undefined', async () => {
      const turnContext = MockTurnContext.createValid();
      const graph = new MockCompiledStateGraph<{ messages: MockBaseMessage[] }>();

      await expect(
        service.sendChatHistoryAsync(turnContext as never, graph as never, undefined as never)
      ).rejects.toThrow('config is required');
    });
  });

  describe('sendChatHistoryFromStateAsync validation (UV-04 to UV-06)', () => {
    it('UV-04: should throw when turnContext is null', async () => {
      const stateSnapshot = createMockStateSnapshot(createMockMessageArray());

      await expect(
        service.sendChatHistoryFromStateAsync(null as never, stateSnapshot as never)
      ).rejects.toThrow('turnContext is required');
    });

    it('UV-04: should throw when turnContext is undefined', async () => {
      const stateSnapshot = createMockStateSnapshot(createMockMessageArray());

      await expect(
        service.sendChatHistoryFromStateAsync(undefined as never, stateSnapshot as never)
      ).rejects.toThrow('turnContext is required');
    });

    it('UV-05: should throw when stateSnapshot is null', async () => {
      const turnContext = MockTurnContext.createValid();

      await expect(
        service.sendChatHistoryFromStateAsync(turnContext as never, null as never)
      ).rejects.toThrow('stateSnapshot is required');
    });

    it('UV-05: should throw when stateSnapshot is undefined', async () => {
      const turnContext = MockTurnContext.createValid();

      await expect(
        service.sendChatHistoryFromStateAsync(turnContext as never, undefined as never)
      ).rejects.toThrow('stateSnapshot is required');
    });

    it('UV-06: should throw when stateSnapshot.values.messages is missing', async () => {
      const turnContext = MockTurnContext.createValid();
      const stateSnapshot = { values: {}, next: [] };

      await expect(
        service.sendChatHistoryFromStateAsync(turnContext as never, stateSnapshot as never)
      ).rejects.toThrow('stateSnapshot must contain messages array in values');
    });

    it('UV-06: should throw when stateSnapshot.values.messages is not an array', async () => {
      const turnContext = MockTurnContext.createValid();
      const stateSnapshot = { values: { messages: 'not an array' }, next: [] };

      await expect(
        service.sendChatHistoryFromStateAsync(turnContext as never, stateSnapshot as never)
      ).rejects.toThrow('stateSnapshot must contain messages array in values');
    });
  });

  describe('sendChatHistoryFromChatHistoryAsync validation (UV-07 to UV-08)', () => {
    it('UV-07: should throw when turnContext is null', async () => {
      const chatHistory = new MockBaseChatMessageHistory();
      chatHistory.setMessagesToReturn(createMockMessageArray());

      await expect(
        service.sendChatHistoryFromChatHistoryAsync(null as never, chatHistory as never)
      ).rejects.toThrow('turnContext is required');
    });

    it('UV-07: should throw when turnContext is undefined', async () => {
      const chatHistory = new MockBaseChatMessageHistory();
      chatHistory.setMessagesToReturn(createMockMessageArray());

      await expect(
        service.sendChatHistoryFromChatHistoryAsync(undefined as never, chatHistory as never)
      ).rejects.toThrow('turnContext is required');
    });

    it('UV-08: should throw when chatHistory is null', async () => {
      const turnContext = MockTurnContext.createValid();

      await expect(
        service.sendChatHistoryFromChatHistoryAsync(turnContext as never, null as never)
      ).rejects.toThrow('chatHistory is required');
    });

    it('UV-08: should throw when chatHistory is undefined', async () => {
      const turnContext = MockTurnContext.createValid();

      await expect(
        service.sendChatHistoryFromChatHistoryAsync(turnContext as never, undefined as never)
      ).rejects.toThrow('chatHistory is required');
    });
  });

  describe('sendChatHistoryFromMessagesAsync validation (UV-09 to UV-10)', () => {
    it('UV-09: should throw when turnContext is null', async () => {
      const messages = createMockMessageArray();

      await expect(
        service.sendChatHistoryFromMessagesAsync(null as never, messages as never)
      ).rejects.toThrow('turnContext is required');
    });

    it('UV-09: should throw when turnContext is undefined', async () => {
      const messages = createMockMessageArray();

      await expect(
        service.sendChatHistoryFromMessagesAsync(undefined as never, messages as never)
      ).rejects.toThrow('turnContext is required');
    });

    it('UV-10: should throw when messages is null', async () => {
      const turnContext = MockTurnContext.createValid();

      await expect(
        service.sendChatHistoryFromMessagesAsync(turnContext as never, null as never)
      ).rejects.toThrow('messages is required');
    });

    it('UV-10: should throw when messages is undefined', async () => {
      const turnContext = MockTurnContext.createValid();

      await expect(
        service.sendChatHistoryFromMessagesAsync(turnContext as never, undefined as never)
      ).rejects.toThrow('messages is required');
    });
  });
});
