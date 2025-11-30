// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TurnContext, TurnState } from '@microsoft/agents-hosting';
import { AgentNotificationHandler } from '@microsoft/agents-a365-notifications';
import { AgentNotificationActivity } from '@microsoft/agents-a365-notifications';

// Mock the dependencies
jest.mock('@microsoft/agents-hosting');
jest.mock('@microsoft/agents-a365-notifications');

describe('AgentNotificationHandler', () => {
  let mockTurnContext: jest.Mocked<TurnContext>;
  let mockTurnState: jest.Mocked<TurnState>;
  let mockAgentNotificationActivity: jest.Mocked<AgentNotificationActivity>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock objects
    mockTurnContext = {
      activity: {
        type: 'message',
        id: 'test-activity-id'
      }
    } as any;

    mockTurnState = {
      conversation: {},
      user: {},
      temp: {}
    } as any;

    mockAgentNotificationActivity = {
      type: 'email',
      notificationType: 'email',
      from: { id: 'sender' },
      recipient: { id: 'recipient' },
      channelData: {},
      timestamp: new Date()
    } as any;
  });

  describe('Type Definition', () => {
    it('should define a function type that accepts correct parameters', () => {
      // Arrange
      const mockHandler: AgentNotificationHandler = (context, state, activity) => Promise.resolve();

      // Act & Assert
      expect(typeof mockHandler).toBe('function');
      expect(mockHandler.length).toBe(3); // turnContext, turnState, agentNotificationActivity
    });

    it('should return a Promise<void>', async () => {
      // Arrange
      const mockHandler: AgentNotificationHandler = jest.fn().mockResolvedValue(undefined);

      // Act
      const result = mockHandler(mockTurnContext, mockTurnState, mockAgentNotificationActivity);

      // Assert
      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBeUndefined();
    });

    it('should support generic TurnState type parameter', () => {
      // Arrange
      interface CustomTurnState extends TurnState {
        customProperty: string;
      }

      const mockCustomTurnState: any = {
        conversation: {},
        user: {},
        temp: {},
        customProperty: 'test-value'
      };

      const customHandler: AgentNotificationHandler<CustomTurnState> = jest.fn();

      // Act & Assert
      expect(() => {
        customHandler(mockTurnContext, mockCustomTurnState, mockAgentNotificationActivity);
      }).not.toThrow();
    });
  });

  describe('Handler Implementation', () => {
    it('should handle agent notification with email type', async () => {
      // Arrange
      const emailNotificationActivity: any = {
        type: 'email',
        notificationType: 'email',
        from: { id: 'sender' },
        recipient: { id: 'recipient' },
        channelData: { subject: 'Test Subject', body: 'Test Body' },
        timestamp: new Date()
      };

      const handler: AgentNotificationHandler = jest.fn();

      // Act
      await handler(mockTurnContext, mockTurnState, emailNotificationActivity);

      // Assert
      expect(handler).toHaveBeenCalledWith(
        mockTurnContext,
        mockTurnState,
        emailNotificationActivity
      );
    });

    it('should handle different notification types', async () => {
      // Arrange
      const notificationTypes = ['email', 'teams', 'webhook'];
      const handler: AgentNotificationHandler = jest.fn();

      // Act
      for (const type of notificationTypes) {
        const activity: any = {
          type,
          notificationType: type,
          from: { id: 'sender' },
          recipient: { id: 'recipient' },
          channelData: {},
          timestamp: new Date()
        };
        
        await handler(mockTurnContext, mockTurnState, activity);
      }

      // Assert
      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      const handler: AgentNotificationHandler = jest.fn().mockRejectedValue(new Error('Handler error'));

      // Act & Assert
      await expect(
        handler(mockTurnContext, mockTurnState, mockAgentNotificationActivity)
      ).rejects.toThrow('Handler error');
    });

    it('should support async operations', async () => {
      // Arrange
      let handlerExecuted = false;
      const handler: AgentNotificationHandler = async (context, state, activity) => {
        await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async work
        handlerExecuted = true;
      };

      // Act
      await handler(mockTurnContext, mockTurnState, mockAgentNotificationActivity);

      // Assert
      expect(handlerExecuted).toBe(true);
    });
  });

  describe('Parameter Validation', () => {
    it('should accept valid TurnContext objects', async () => {
      // Arrange
      const handler: AgentNotificationHandler = jest.fn();
      const validTurnContext = {
        activity: { type: 'message' },
        sendActivity: jest.fn()
      } as any;

      // Act & Assert
      expect(() => {
        handler(validTurnContext, mockTurnState, mockAgentNotificationActivity);
      }).not.toThrow();
    });

    it('should accept valid TurnState objects', async () => {
      // Arrange
      const handler: AgentNotificationHandler = jest.fn();
      const validTurnState: any = {
        conversation: { id: 'conv-123' },
        user: { id: 'user-456' },
        temp: {}
      };

      // Act & Assert
      expect(() => {
        handler(mockTurnContext, validTurnState, mockAgentNotificationActivity);
      }).not.toThrow();
    });

    it('should accept valid AgentNotificationActivity objects', async () => {
      // Arrange
      const handler: AgentNotificationHandler = jest.fn();
      const validNotificationActivity: any = {
        type: 'email',
        notificationType: 'email',
        from: { id: 'sender' },
        recipient: { id: 'recipient' },
        channelData: { subject: 'Valid notification', body: 'Valid content' },
        timestamp: new Date()
      };

      // Act & Assert
      expect(() => {
        handler(mockTurnContext, mockTurnState, validNotificationActivity);
      }).not.toThrow();
    });
  });

  describe('Integration Scenarios', () => {
    it('should work with multiple handlers', async () => {
      // Arrange
      const handler1: AgentNotificationHandler = jest.fn();
      const handler2: AgentNotificationHandler = jest.fn();
      const handlers = [handler1, handler2];

      // Act
      await Promise.all(
        handlers.map(handler => 
          handler(mockTurnContext, mockTurnState, mockAgentNotificationActivity)
        )
      );

      // Assert
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should support handler chaining', async () => {
      // Arrange
      let executionOrder: string[] = [];

      const handler1: AgentNotificationHandler = async (context, state, activity) => {
        executionOrder.push('handler1');
      };

      const handler2: AgentNotificationHandler = async (context, state, activity) => {
        executionOrder.push('handler2');
      };

      // Act
      await handler1(mockTurnContext, mockTurnState, mockAgentNotificationActivity);
      await handler2(mockTurnContext, mockTurnState, mockAgentNotificationActivity);

      // Assert
      expect(executionOrder).toEqual(['handler1', 'handler2']);
    });
  });
});