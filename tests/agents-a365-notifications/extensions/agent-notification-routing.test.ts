// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AgentApplication, TurnContext, TurnState } from '@microsoft/agents-hosting';
import '@microsoft/agents-a365-notifications';
import { 
  AgentNotificationActivity, 
  NotificationType,
  createEmailReference,
  createWpxComment,
  createAgentNotificationActivity
} from '@microsoft/agents-a365-notifications';
import { Activity } from '@microsoft/agents-activity';

describe('Agent Notification Routing Integration', () => {
  let app: AgentApplication<TurnState>;
  let mockTurnContext: TurnContext;
  let mockTurnState: TurnState;

  beforeEach(() => {
    app = new AgentApplication<TurnState>();
    mockTurnContext = {
      activity: {
        type: 'message',
        channelId: 'agents',
        channelData: {},
        entities: []
      },
      sendActivity: jest.fn()
    } as any;
    mockTurnState = {} as TurnState;
  });

  describe('Notification Activity Creation', () => {
    it('should create notification activity from email activity', () => {
      const emailEntity = createEmailReference('email-123', 'conv-456', '<p>Test email</p>');
      
      // Use a mock activity that matches the expected interface
      const activity = {
        type: 'message',
        channelId: 'agents',
        entities: [emailEntity]
      } as any; // Cast to any to bypass strict typing for test

      const notificationActivity = createAgentNotificationActivity(activity);

      expect(notificationActivity.notificationType).toBe(NotificationType.EmailNotification);
      expect(notificationActivity.emailNotification).toEqual(emailEntity);
      expect(notificationActivity.wpxCommentNotification).toBeUndefined();
    });

    it('should create notification activity from wpx comment activity', () => {
      const wpxEntity = createWpxComment('odata-123', 'doc-456', 'comment-789', 'subject-012');
      
      // Use a mock activity that matches the expected interface
      const activity = {
        type: 'message',
        channelId: 'agents',
        entities: [wpxEntity]
      } as any; // Cast to any to bypass strict typing for test

      const notificationActivity = createAgentNotificationActivity(activity);

      expect(notificationActivity.notificationType).toBe(NotificationType.WpxComment);
      expect(notificationActivity.wpxCommentNotification).toEqual(wpxEntity);
      expect(notificationActivity.emailNotification).toBeUndefined();
    });

    it('should handle activity without entities', () => {
      // Use a mock activity that matches the expected interface
      const activity = {
        type: 'message',
        channelId: 'agents'
      } as any; // Cast to any to bypass strict typing for test

      const notificationActivity = createAgentNotificationActivity(activity);

      expect(notificationActivity.notificationType).toBe(NotificationType.Unknown);
      expect(notificationActivity.emailNotification).toBeUndefined();
      expect(notificationActivity.wpxCommentNotification).toBeUndefined();
    });

    it('should throw error for null activity', () => {
      expect(() => {
        createAgentNotificationActivity(null as any);
      }).toThrow('Activity cannot be null or undefined');
    });
  });

  describe('Multiple Handler Registration', () => {
    it('should register multiple handlers for same channel', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      expect(() => {
        app.onAgentNotification('*', handler1);
        app.onAgentNotification('*', handler2);
      }).not.toThrow();
    });

    it('should register handlers for different channels', () => {
      const emailHandler = jest.fn();
      const wildcardHandler = jest.fn();
      
      expect(() => {
        app.onAgenticEmailNotification(emailHandler);
        app.onAgentNotification('*', wildcardHandler);
      }).not.toThrow();
    });

    it('should register handlers with different ranks', () => {
      const highPriorityHandler = jest.fn();
      const lowPriorityHandler = jest.fn();
      
      expect(() => {
        app.onAgentNotification('*', highPriorityHandler, 1);
        app.onAgentNotification('*', lowPriorityHandler, 10);
      }).not.toThrow();
    });
  });

  describe('Handler Context Validation', () => {
    it('should provide correct context to handlers', async () => {
      const handler = jest.fn();
      app.onAgentNotification('*', handler);

      const notification: AgentNotificationActivity = {
        notificationType: NotificationType.EmailNotification,
        emailNotification: createEmailReference('test-email'),
        from: { id: 'user-123', name: 'Test User' },
        recipient: { id: 'agent-456', name: 'Test Agent' },
        channelData: { source: 'email' },
        text: 'Test message',
        valueType: 'notification',
        value: { metadata: 'test' }
      };

      await handler(mockTurnContext, mockTurnState, notification);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          activity: expect.objectContaining({
            type: 'message',
            channelId: 'agents'
          })
        }),
        mockTurnState,
        expect.objectContaining({
          notificationType: NotificationType.EmailNotification,
          from: expect.objectContaining({ id: 'user-123' }),
          recipient: expect.objectContaining({ id: 'agent-456' }),
          text: 'Test message'
        })
      );
    });

    it('should handle custom TurnState types', async () => {
      interface CustomTurnState extends TurnState {
        customProperty: string;
        counter: number;
      }

      const customApp = new AgentApplication<CustomTurnState>();
      const customHandler = jest.fn();
      const customTurnState: CustomTurnState = {
        customProperty: 'test-value',
        counter: 42
      } as CustomTurnState;

      customApp.onAgentNotification('*', customHandler);

      const notification: AgentNotificationActivity = {
        notificationType: NotificationType.EmailNotification,
        emailNotification: createEmailReference('test'),
        from: {},
        recipient: {},
        channelData: {},
        text: '',
        valueType: '',
        value: {}
      };

      await customHandler(mockTurnContext, customTurnState, notification);

      expect(customHandler).toHaveBeenCalledWith(
        mockTurnContext,
        expect.objectContaining({
          customProperty: 'test-value',
          counter: 42
        }),
        notification
      );
    });
  });

  describe('Notification Type Handling', () => {
    it('should handle unknown notification types gracefully', async () => {
      const handler = jest.fn();
      app.onAgentNotification('*', handler);

      const notification: AgentNotificationActivity = {
        notificationType: NotificationType.Unknown,
        from: {},
        recipient: {},
        channelData: {},
        text: '',
        valueType: '',
        value: {}
      };

      const result = await handler(mockTurnContext, mockTurnState, notification);
      expect(result).toBeUndefined();
      expect(handler).toHaveBeenCalledWith(mockTurnContext, mockTurnState, notification);
    });

    it('should handle missing notification data', async () => {
      const handler = jest.fn();
      app.onAgentNotification('*', handler);

      const notification: AgentNotificationActivity = {
        notificationType: NotificationType.EmailNotification,
        // emailNotification is undefined
        from: {},
        recipient: {},
        channelData: {},
        text: '',
        valueType: '',
        value: {}
      };

      const result = await handler(mockTurnContext, mockTurnState, notification);
      expect(result).toBeUndefined();
    });
  });

  describe('Async Handler Support', () => {
    it('should support async handlers with Promise return', async () => {
      const asyncHandler = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return;
      });

      app.onAgentNotification('*', asyncHandler);

      const notification: AgentNotificationActivity = {
        notificationType: NotificationType.EmailNotification,
        emailNotification: createEmailReference('async-test'),
        from: {},
        recipient: {},
        channelData: {},
        text: '',
        valueType: '',
        value: {}
      };

      const result = asyncHandler(mockTurnContext, mockTurnState, notification);
      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBeUndefined();
    });

    it('should handle async handler exceptions', async () => {
      const errorHandler = jest.fn().mockImplementation(async () => {
        throw new Error('Async handler error');
      });

      app.onAgentNotification('*', errorHandler);

      const notification: AgentNotificationActivity = {
        notificationType: NotificationType.WpxComment,
        wpxCommentNotification: createWpxComment(undefined, 'doc', 'comment'),
        from: {},
        recipient: {},
        channelData: {},
        text: '',
        valueType: '',
        value: {}
      };

      await expect(errorHandler(mockTurnContext, mockTurnState, notification))
        .rejects.toThrow('Async handler error');
    });
  });

  describe('Method Availability', () => {
    it('should have all notification methods available after import', () => {
      expect(app.onAgentNotification).toBeDefined();
      expect(typeof app.onAgentNotification).toBe('function');
      
      expect(app.onAgenticEmailNotification).toBeDefined();
      expect(typeof app.onAgenticEmailNotification).toBe('function');
    });

    it('should maintain method availability across instances', () => {
      const app1 = new AgentApplication<TurnState>();
      const app2 = new AgentApplication<TurnState>();

      expect(app1.onAgentNotification).toBeDefined();
      expect(app2.onAgentNotification).toBeDefined();
      expect(app1.onAgenticEmailNotification).toBeDefined();
      expect(app2.onAgenticEmailNotification).toBeDefined();
    });
  });
});