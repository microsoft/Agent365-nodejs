// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Mock TurnContext for testing LangChain chat history methods.
 */
export interface MockActivity {
  id?: string;
  text?: string;
  conversation?: {
    id?: string;
    name?: string;
  };
  from?: {
    id?: string;
    name?: string;
  };
  recipient?: {
    id?: string;
    name?: string;
  };
  timestamp?: Date;
}

/**
 * Mock TurnContext class that simulates @microsoft/agents-hosting TurnContext.
 */
export class MockTurnContext {
  activity: MockActivity;

  constructor(activity?: MockActivity) {
    this.activity = activity ?? {
      id: 'test-activity-id',
      text: 'Hello, this is a test message',
      conversation: {
        id: 'test-conversation-id',
        name: 'Test Conversation'
      },
      from: {
        id: 'test-user-id',
        name: 'Test User'
      },
      recipient: {
        id: 'test-bot-id',
        name: 'Test Bot'
      },
      timestamp: new Date()
    };
  }

  /**
   * Create a mock turn context with all required properties.
   */
  static createValid(): MockTurnContext {
    return new MockTurnContext({
      id: 'test-activity-id',
      text: 'Test user message',
      conversation: {
        id: 'test-conversation-id',
        name: 'Test Conversation'
      },
      from: {
        id: 'test-user-id',
        name: 'Test User'
      }
    });
  }

  /**
   * Create a mock turn context without activity id.
   */
  static createWithoutActivityId(): MockTurnContext {
    return new MockTurnContext({
      text: 'Test user message',
      conversation: {
        id: 'test-conversation-id'
      }
    });
  }

  /**
   * Create a mock turn context without conversation id.
   */
  static createWithoutConversationId(): MockTurnContext {
    return new MockTurnContext({
      id: 'test-activity-id',
      text: 'Test user message',
      conversation: {}
    });
  }

  /**
   * Create a mock turn context without user message text.
   */
  static createWithoutText(): MockTurnContext {
    return new MockTurnContext({
      id: 'test-activity-id',
      conversation: {
        id: 'test-conversation-id'
      }
    });
  }

  /**
   * Create a mock turn context with completely empty activity.
   */
  static createEmpty(): MockTurnContext {
    return new MockTurnContext({});
  }
}

/**
 * Helper function to create a valid mock turn context.
 */
export function createMockTurnContext(): MockTurnContext {
  return MockTurnContext.createValid();
}

/**
 * Helper function to create a mock turn context with custom properties.
 */
export function createMockTurnContextWithActivity(activity: MockActivity): MockTurnContext {
  return new MockTurnContext(activity);
}
