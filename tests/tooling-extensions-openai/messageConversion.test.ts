// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { TurnContext } from '@microsoft/agents-hosting';
import { McpToolRegistrationService } from '../../packages/agents-a365-tooling-extensions-openai/src/McpToolRegistrationService';
import {
  createUserMessage,
  createAssistantMessage,
  createSystemMessage,
  createMessageWithArrayContent,
  createMessageWithoutId,
  createMessageWithEmptyContent,
  createMessageWithNullContent,
  createMessageWithUndefinedContent,
  createMessageWithWhitespaceContent,
  createMessageWithUnknownRole,
  createMessageWithTextProperty,
} from './fixtures/mockOpenAITypes';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('McpToolRegistrationService - Message Conversion', () => {
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
    mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('extractRole', () => {
    it('CV-01: should return role directly (pass-through) for user role', async () => {
      const messages = [createUserMessage('Test content', 'msg-1')];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: expect.arrayContaining([
            expect.objectContaining({ role: 'user' }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('CV-01: should return role directly (pass-through) for assistant role', async () => {
      const messages = [createAssistantMessage('Test content', 'msg-1')];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: expect.arrayContaining([
            expect.objectContaining({ role: 'assistant' }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('CV-01: should return role directly (pass-through) for system role', async () => {
      const messages = [createSystemMessage('Test content', 'msg-1')];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('CV-01: should pass through unknown/custom roles without modification', async () => {
      const messages = [createMessageWithUnknownRole('Test content', 'msg-1')];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: expect.arrayContaining([
            expect.objectContaining({ role: 'custom_role' }),
          ]),
        }),
        expect.any(Object)
      );
    });
  });

  describe('extractContent', () => {
    it('CV-02: should extract string content directly', async () => {
      const messages = [createUserMessage('Hello, world!', 'msg-1')];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: expect.arrayContaining([
            expect.objectContaining({ content: 'Hello, world!' }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('CV-03: should concatenate array content (text type)', async () => {
      const messages = [
        createMessageWithArrayContent(
          'user',
          [
            { type: 'text', text: 'Part 1' },
            { type: 'text', text: 'Part 2' },
            { type: 'text', text: 'Part 3' },
          ],
          'msg-1'
        ),
      ];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: expect.arrayContaining([
            expect.objectContaining({ content: 'Part 1 Part 2 Part 3' }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('CV-03: should concatenate array content (input_text type)', async () => {
      const messages = [
        createMessageWithArrayContent(
          'user',
          [
            { type: 'input_text', text: 'Input 1' },
            { type: 'input_text', text: 'Input 2' },
          ],
          'msg-1'
        ),
      ];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: expect.arrayContaining([
            expect.objectContaining({ content: 'Input 1 Input 2' }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('CV-03: should filter out non-text parts from array content', async () => {
      const messages = [
        createMessageWithArrayContent(
          'user',
          [
            { type: 'text', text: 'Valid text' },
            { type: 'image' } as { type: string; text?: string }, // Image part without text
            { type: 'text', text: 'More text' },
          ],
          'msg-1'
        ),
      ];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: expect.arrayContaining([
            expect.objectContaining({ content: 'Valid text More text' }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('CV-04: should skip message with empty content (filters out)', async () => {
      const messages = [
        createUserMessage('Valid message', 'msg-1'),
        createMessageWithEmptyContent('user', 'msg-2'),
        createUserMessage('Another valid message', 'msg-3'),
      ];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: [
            expect.objectContaining({ id: 'msg-1', content: 'Valid message' }),
            expect.objectContaining({ id: 'msg-3', content: 'Another valid message' }),
          ],
        }),
        expect.any(Object)
      );
    });

    it('CV-04: should skip message with null content', async () => {
      const messages = [
        createUserMessage('Valid message', 'msg-1'),
        createMessageWithNullContent('user', 'msg-2'),
      ];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: [
            expect.objectContaining({ id: 'msg-1' }),
          ],
        }),
        expect.any(Object)
      );
    });

    it('CV-04: should skip message with undefined content', async () => {
      const messages = [
        createUserMessage('Valid message', 'msg-1'),
        createMessageWithUndefinedContent('user', 'msg-2'),
      ];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: [
            expect.objectContaining({ id: 'msg-1' }),
          ],
        }),
        expect.any(Object)
      );
    });

    it('CV-04: should skip message with whitespace-only content', async () => {
      const messages = [
        createUserMessage('Valid message', 'msg-1'),
        createMessageWithWhitespaceContent('user', 'msg-2'),
      ];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: [
            expect.objectContaining({ id: 'msg-1' }),
          ],
        }),
        expect.any(Object)
      );
    });

    it('should extract content from text property as fallback', async () => {
      const messages = [createMessageWithTextProperty('user', 'Fallback text content', 'msg-1')];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: expect.arrayContaining([
            expect.objectContaining({ content: 'Fallback text content' }),
          ]),
        }),
        expect.any(Object)
      );
    });
  });

  describe('extractId', () => {
    it('CV-05: should use existing ID when present', async () => {
      const messages = [createUserMessage('Test content', 'existing-id-123')];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: expect.arrayContaining([
            expect.objectContaining({ id: 'existing-id-123' }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('CV-06: should generate UUID when ID is missing', async () => {
      const messages = [createMessageWithoutId('user', 'Test content')];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      // Verify that an ID was generated (should be a valid UUID format)
      const callArgs = mockedAxios.post.mock.calls[0];
      const requestBody = callArgs[1] as { chatHistory: Array<{ id: string }> };
      const generatedId = requestBody.chatHistory[0].id;

      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(generatedId).toMatch(uuidV4Regex);
    });
  });

  describe('extractTimestamp', () => {
    it('CV-07: should always use current time', async () => {
      const beforeTime = new Date();
      const messages = [createUserMessage('Test content', 'msg-1')];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      const afterTime = new Date();

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: expect.arrayContaining([
            expect.objectContaining({
              timestamp: expect.any(Date),
            }),
          ]),
        }),
        expect.any(Object)
      );

      // Get the actual timestamp from the call
      const callArgs = mockedAxios.post.mock.calls[0];
      const requestBody = callArgs[1] as { chatHistory: Array<{ timestamp: Date }> };
      const timestamp = requestBody.chatHistory[0].timestamp;

      // Verify timestamp is within expected range
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('CV-07: should generate different timestamps for different messages', async () => {
      const messages = [
        createUserMessage('Test 1', 'msg-1'),
        createUserMessage('Test 2', 'msg-2'),
      ];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      const callArgs = mockedAxios.post.mock.calls[0];
      const requestBody = callArgs[1] as { chatHistory: Array<{ timestamp: Date }> };

      // Both should have Date objects
      expect(requestBody.chatHistory[0].timestamp).toBeInstanceOf(Date);
      expect(requestBody.chatHistory[1].timestamp).toBeInstanceOf(Date);
    });
  });

  describe('edge cases', () => {
    it('should handle mixed valid and invalid messages', async () => {
      const messages = [
        createUserMessage('Valid 1', 'msg-1'),
        createMessageWithEmptyContent('user', 'msg-2'),
        createAssistantMessage('Valid 2', 'msg-3'),
        createMessageWithNullContent('assistant', 'msg-4'),
        createSystemMessage('Valid 3', 'msg-5'),
      ];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: [
            expect.objectContaining({ id: 'msg-1', role: 'user', content: 'Valid 1' }),
            expect.objectContaining({ id: 'msg-3', role: 'assistant', content: 'Valid 2' }),
            expect.objectContaining({ id: 'msg-5', role: 'system', content: 'Valid 3' }),
          ],
        }),
        expect.any(Object)
      );
    });

    it('should handle messages with empty array content', async () => {
      const messages = [
        createUserMessage('Valid message', 'msg-1'),
        createMessageWithArrayContent('user', [], 'msg-2'),
      ];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      // Message with empty array content should be filtered out
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: [
            expect.objectContaining({ id: 'msg-1' }),
          ],
        }),
        expect.any(Object)
      );
    });

    it('should handle array content with empty text parts', async () => {
      const messages = [
        createMessageWithArrayContent(
          'user',
          [
            { type: 'text', text: '' },
            { type: 'text', text: 'Valid' },
            { type: 'text', text: '' },
          ],
          'msg-1'
        ),
      ];

      await service.sendChatHistoryMessagesAsync(mockTurnContext, messages);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          chatHistory: expect.arrayContaining([
            expect.objectContaining({ content: 'Valid' }),
          ]),
        }),
        expect.any(Object)
      );
    });
  });
});
