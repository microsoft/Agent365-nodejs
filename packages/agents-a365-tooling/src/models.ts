// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Represents a single message in the chat history.
 */
export interface ChatHistoryMessage {
  /**
   * The unique identifier for the chat message.
   */
  id: string;

  /**
   * The role of the message sender (e.g., "user", "assistant", "system").
   */
  role: string;

  /**
   * The content of the chat message.
   */
  content: string;

  /**
   * The timestamp of when the message was sent.
   */
  timestamp: Date;
}

/**
 * Represents the request payload for a real-time threat protection check on a chat message.
 */
export interface ChatMessageRequest {
  /**
   * The unique identifier for the conversation.
   */
  conversationId: string;

  /**
   * The unique identifier for the message within the conversation.
   */
  messageId: string;

  /**
   * The content of the user's message.
   */
  userMessage: string;

  /**
   * The chat history messages.
   */
  chatHistory: ChatHistoryMessage[];
}
