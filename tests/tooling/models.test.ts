// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ChatHistoryMessage, ChatMessageRequest } from '../../packages/agents-a365-tooling/src/models/index';

describe('Chat History Models', () => {
  describe('ChatHistoryMessage', () => {
    it('should create a valid chat history message', () => {
      const timestamp = new Date();
      const message: ChatHistoryMessage = {
        id: 'msg-123',
        role: 'user',
        content: 'Hello, world!',
        timestamp
      };

      expect(message).toBeDefined();
      expect(message.id).toBe('msg-123');
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello, world!');
      expect(message.timestamp).toBe(timestamp);
    });

    it('should support assistant role', () => {
      const message: ChatHistoryMessage = {
        id: 'msg-456',
        role: 'assistant',
        content: 'How can I help you?',
        timestamp: new Date()
      };

      expect(message.role).toBe('assistant');
    });

    it('should support system role', () => {
      const message: ChatHistoryMessage = {
        id: 'sys-001',
        role: 'system',
        content: 'You are a helpful assistant.',
        timestamp: new Date()
      };

      expect(message.role).toBe('system');
    });
  });

  describe('ChatMessageRequest', () => {
    it('should create a valid chat message request', () => {
      const timestamp = new Date();
      const chatHistory: ChatHistoryMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'First message',
          timestamp
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Response',
          timestamp
        }
      ];

      const request: ChatMessageRequest = {
        conversationId: 'conv-123',
        messageId: 'msg-current',
        userMessage: 'Current user message',
        chatHistory
      };

      expect(request).toBeDefined();
      expect(request.conversationId).toBe('conv-123');
      expect(request.messageId).toBe('msg-current');
      expect(request.userMessage).toBe('Current user message');
      expect(request.chatHistory).toEqual(chatHistory);
      expect(request.chatHistory).toHaveLength(2);
    });

    it('should support empty chat history', () => {
      const request: ChatMessageRequest = {
        conversationId: 'conv-456',
        messageId: 'msg-789',
        userMessage: 'First message in conversation',
        chatHistory: []
      };

      expect(request.chatHistory).toEqual([]);
      expect(request.chatHistory).toHaveLength(0);
    });

    it('should preserve all properties', () => {
      const chatHistory: ChatHistoryMessage[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Test content',
          timestamp: new Date('2024-01-01T10:00:00Z')
        }
      ];

      const request: ChatMessageRequest = {
        conversationId: 'test-conv',
        messageId: 'test-msg',
        userMessage: 'Test user message',
        chatHistory
      };

      // Verify all properties are accessible
      expect(request.conversationId).toBe('test-conv');
      expect(request.messageId).toBe('test-msg');
      expect(request.userMessage).toBe('Test user message');
      expect(request.chatHistory[0].id).toBe('msg-1');
      expect(request.chatHistory[0].role).toBe('user');
      expect(request.chatHistory[0].content).toBe('Test content');
    });
  });
});
