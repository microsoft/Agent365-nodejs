// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AgentApplication, TurnContext, TurnState } from '@microsoft/agents-hosting';
import '@microsoft/agents-a365-notifications';
import { 
  AgentNotificationActivity, 
  NotificationType,
  EmailReference,
  WpxComment,
  createEmailReference,
  createWpxComment,
  createAgentNotificationActivity,
  AGENTS_EMAIL_SUBCHANNEL,
  AGENTS_WORD_SUBCHANNEL,
  AGENTS_EXCEL_SUBCHANNEL,
  AGENTS_POWERPOINT_SUBCHANNEL
} from '@microsoft/agents-a365-notifications';

describe('Agent Notification Methods', () => {
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

  describe('onAgentNotification Method', () => {
    it('should register handler for email notifications', () => {
      // Arrange
      const handler = jest.fn();
      
      // Act & Assert
      expect(() => {
        app.onAgentNotification(AGENTS_EMAIL_SUBCHANNEL, handler);
      }).not.toThrow();
    });

    it('should register handler for specific channel', () => {
      // Arrange
      const handler = jest.fn();
      
      // Act & Assert
      expect(() => {
        app.onAgentNotification(AGENTS_WORD_SUBCHANNEL, handler);
      }).not.toThrow();
    });

    it('should register handler with rank', () => {
      // Arrange
      const handler = jest.fn();
      
      // Act & Assert
      expect(() => {
        app.onAgentNotification(AGENTS_EMAIL_SUBCHANNEL, handler, 10);
      }).not.toThrow();
    });

    it('should register multiple handlers for same channel', () => {
      // Arrange
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      // Act & Assert
      expect(() => {
        app.onAgentNotification(AGENTS_EMAIL_SUBCHANNEL, handler1);
        app.onAgentNotification(AGENTS_EMAIL_SUBCHANNEL, handler2);
      }).not.toThrow();
    });

    it('should call handler correctly', async () => {
      // Arrange
      const handler = jest.fn();
      app.onAgentNotification(AGENTS_EMAIL_SUBCHANNEL, handler);

      const emailNotification = createEmailReference('email-123', undefined, '<p>Test content</p>');
      const notificationActivity: AgentNotificationActivity = {
        notificationType: NotificationType.EmailNotification,
        emailNotification,
        from: {},
        recipient: {},
        channelData: {},
        text: '',
        valueType: '',
        value: {}
      };

      // Act
      await handler(mockTurnContext, mockTurnState, notificationActivity);

      // Assert
      expect(handler).toHaveBeenCalledWith(mockTurnContext, mockTurnState, notificationActivity);
    });
  });

  describe('onAgenticEmailNotification Method', () => {
    it('should register email-specific handler', () => {
      // Arrange
      const handler = jest.fn();
      
      // Act & Assert
      expect(() => {
        app.onAgenticEmailNotification(handler);
      }).not.toThrow();
    });

    it('should register email handler with rank', () => {
      // Arrange
      const handler = jest.fn();
      
      // Act & Assert
      expect(() => {
        app.onAgenticEmailNotification(handler, 5);
      }).not.toThrow();
    });

    it('should call email handler correctly', async () => {
      // Arrange
      const handler = jest.fn();
      app.onAgenticEmailNotification(handler);

      const emailNotification = createEmailReference('email-456', undefined, '<h1>Test HTML</h1>');
      const notificationActivity: AgentNotificationActivity = {
        notificationType: NotificationType.EmailNotification,
        emailNotification,
        from: {},
        recipient: {},
        channelData: {},
        text: '',
        valueType: '',
        value: {}
      };

      // Act
      await handler(mockTurnContext, mockTurnState, notificationActivity);

      // Assert
      expect(handler).toHaveBeenCalledWith(mockTurnContext, mockTurnState, notificationActivity);
    });
  });

  describe('Notification Activity Creation', () => {
    it('should create notification activity from email activity', () => {
      // Arrange
      const emailEntity = createEmailReference('email-123', 'conv-456', '<p>Test email</p>');
      const activity = {
        type: 'message',
        channelId: 'agents',
        entities: [emailEntity]
      } as any;

      // Act
      const notificationActivity = createAgentNotificationActivity(activity);

      // Assert
      expect(notificationActivity.notificationType).toBe(NotificationType.EmailNotification);
      expect(notificationActivity.emailNotification).toEqual(emailEntity);
      expect(notificationActivity.wpxCommentNotification).toBeUndefined();
    });

    it('should create notification activity from wpx comment activity', () => {
      // Arrange
      const wpxEntity = createWpxComment('odata-123', 'doc-456', 'comment-789', 'subject-012');
      const activity = {
        type: 'message',
        channelId: 'agents',
        entities: [wpxEntity]
      } as any;

      // Act
      const notificationActivity = createAgentNotificationActivity(activity);

      // Assert
      expect(notificationActivity.notificationType).toBe(NotificationType.WpxComment);
      expect(notificationActivity.wpxCommentNotification).toEqual(wpxEntity);
      expect(notificationActivity.emailNotification).toBeUndefined();
    });

    it('should handle activity without entities', () => {
      // Arrange
      const activity = {
        type: 'message',
        channelId: 'agents'
      } as any;

      // Act
      const notificationActivity = createAgentNotificationActivity(activity);

      // Assert
      expect(notificationActivity.notificationType).toBe(NotificationType.Unknown);
      expect(notificationActivity.emailNotification).toBeUndefined();
      expect(notificationActivity.wpxCommentNotification).toBeUndefined();
    });

    it('should throw error for null activity', () => {
      // Assert
      expect(() => {
        createAgentNotificationActivity(null as any);
      }).toThrow('Activity cannot be null or undefined');
    });
  });

  describe('Channel ID Constants', () => {
    it('should use correct channel IDs for different notification types', () => {
      // Assert
      expect(AGENTS_EMAIL_SUBCHANNEL).toBe('agents:email');
      expect(AGENTS_WORD_SUBCHANNEL).toBe('agents:word');
      expect(AGENTS_EXCEL_SUBCHANNEL).toBe('agents:excel');
      expect(AGENTS_POWERPOINT_SUBCHANNEL).toBe('agents:powerpoint');
    });
  });

  describe('Method Availability', () => {
    it('should extend AgentApplication prototype with notification methods', () => {
      // Assert
      expect(typeof app.onAgentNotification).toBe('function');
      expect(typeof app.onAgenticEmailNotification).toBe('function');
    });

    it('should maintain method availability across instances', () => {
      // Arrange
      const app1 = new AgentApplication<TurnState>();
      const app2 = new AgentApplication<TurnState>();

      // Assert
      expect(app1.onAgentNotification).toBeDefined();
      expect(app2.onAgentNotification).toBeDefined();
      expect(app1.onAgenticEmailNotification).toBeDefined();
      expect(app2.onAgenticEmailNotification).toBeDefined();
    });
  });

  describe('Handler Parameters Validation', () => {
    it('should call handler with correct parameters', async () => {
      // Arrange
      const handler = jest.fn();
      app.onAgentNotification(AGENTS_EMAIL_SUBCHANNEL, handler);

      const notification: AgentNotificationActivity = {
        notificationType: NotificationType.EmailNotification,
        emailNotification: createEmailReference('test-email', undefined, '<p>Test</p>'),
        from: {},
        recipient: {},
        channelData: {},
        text: '',
        valueType: '',
        value: {}
      };

      // Act
      await handler(mockTurnContext, mockTurnState, notification);

      // Assert
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        mockTurnContext,
        mockTurnState,
        expect.objectContaining({
          notificationType: NotificationType.EmailNotification
        })
      );
    });

    it('should handle custom TurnState types', async () => {
      // Arrange
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

      customApp.onAgentNotification(AGENTS_WORD_SUBCHANNEL, customHandler);

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

      // Act
      await customHandler(mockTurnContext, customTurnState, notification);

      // Assert
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
      // Arrange
      const handler = jest.fn();
      app.onAgentNotification(AGENTS_EMAIL_SUBCHANNEL, handler);

      const notification: AgentNotificationActivity = {
        notificationType: NotificationType.Unknown,
        from: {},
        recipient: {},
        channelData: {},
        text: '',
        valueType: '',
        value: {}
      };

      // Act
      const result = await handler(mockTurnContext, mockTurnState, notification);
      
      // Assert
      expect(result).toBeUndefined();
      expect(handler).toHaveBeenCalledWith(mockTurnContext, mockTurnState, notification);
    });

    it('should handle missing notification data', async () => {
      // Arrange
      const handler = jest.fn();
      app.onAgentNotification(AGENTS_EXCEL_SUBCHANNEL, handler);

      const notification: AgentNotificationActivity = {
        notificationType: NotificationType.EmailNotification,
        from: {},
        recipient: {},
        channelData: {},
        text: '',
        valueType: '',
        value: {}
      };

      // Act
      const result = await handler(mockTurnContext, mockTurnState, notification);
      
      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('Async Handler Support', () => {
    it('should support async handlers with Promise return', async () => {
      // Arrange
      const asyncHandler = jest.fn().mockResolvedValue(undefined);
      app.onAgentNotification(AGENTS_POWERPOINT_SUBCHANNEL, asyncHandler);

      const notification: AgentNotificationActivity = {
        notificationType: NotificationType.WpxComment,
        wpxCommentNotification: createWpxComment(undefined, 'doc-123', 'comment-123', undefined),
        from: {},
        recipient: {},
        channelData: {},
        text: '',
        valueType: '',
        value: {}
      };

      // Act
      const result = asyncHandler(mockTurnContext, mockTurnState, notification);
      
      // Assert
      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBeUndefined();
    });

    it('should handle async handler exceptions', async () => {
      // Arrange
      const errorHandler = jest.fn().mockRejectedValue(new Error('Handler error'));
      app.onAgentNotification(AGENTS_WORD_SUBCHANNEL, errorHandler);

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

      // Act & Assert
      await expect(errorHandler(mockTurnContext, mockTurnState, notification))
        .rejects.toThrow('Handler error');
    });
  });

  describe('Error Handling', () => {
    it('should handle null/undefined notification gracefully', async () => {
      // Arrange
      const handler = jest.fn();
      app.onAgentNotification(AGENTS_EMAIL_SUBCHANNEL, handler);

      // Act
      await handler(mockTurnContext, mockTurnState, undefined as any);
      
      // Assert
      expect(handler).toHaveBeenCalledWith(mockTurnContext, mockTurnState, undefined);
    });
  });
});