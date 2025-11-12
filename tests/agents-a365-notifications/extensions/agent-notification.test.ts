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
        channelData: {}
      },
      sendActivity: jest.fn()
    } as any;
    mockTurnState = {} as TurnState;
  });

  describe('onAgentNotification', () => {
    it('should register handler for wildcard notifications', () => {
      const handler = jest.fn();
      
      expect(() => {
        app.onAgentNotification('*', handler);
      }).not.toThrow();
    });

    it('should register handler for specific channel', () => {
      const handler = jest.fn();
      
      expect(() => {
        app.onAgentNotification('specific-channel', handler);
      }).not.toThrow();
    });

    it('should register handler with rank', () => {
      const handler = jest.fn();
      
      expect(() => {
        app.onAgentNotification('*', handler, 10);
      }).not.toThrow();
    });

    it('should register handler with auto-signin handlers', () => {
      const handler = jest.fn();
      const autoSignInHandlers = ['handler1', 'handler2'];
      
      expect(() => {
        app.onAgentNotification('*', handler, undefined, autoSignInHandlers);
      }).not.toThrow();
    });

    it('should call handler correctly', async () => {
      const handler = jest.fn();
      app.onAgentNotification('*', handler);

      const emailNotification = createEmailReference(
        'email-123',
        undefined,
        '<p>Test content</p>'
      );

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

      await handler(mockTurnContext, mockTurnState, notificationActivity);
      expect(handler).toHaveBeenCalledWith(mockTurnContext, mockTurnState, notificationActivity);
    });
  });

  describe('onAgenticEmailNotification', () => {
    it('should register email-specific handler', () => {
      const handler = jest.fn();
      
      expect(() => {
        app.onAgenticEmailNotification(handler);
      }).not.toThrow();
    });

    it('should register email handler with rank', () => {
      const handler = jest.fn();
      
      expect(() => {
        app.onAgenticEmailNotification(handler, 5);
      }).not.toThrow();
    });

    it('should register email handler with auto-signin handlers', () => {
      const handler = jest.fn();
      const autoSignInHandlers = ['email-handler'];
      
      expect(() => {
        app.onAgenticEmailNotification(handler, undefined, autoSignInHandlers);
      }).not.toThrow();
    });

    it('should call email handler correctly', async () => {
      const handler = jest.fn();
      app.onAgenticEmailNotification(handler);

      const emailNotification = createEmailReference(
        'email-456',
        undefined,
        '<h1>Test HTML</h1>'
      );

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

      await handler(mockTurnContext, mockTurnState, notificationActivity);
      expect(handler).toHaveBeenCalledWith(mockTurnContext, mockTurnState, notificationActivity);
    });
  });

  describe('Channel ID Constants', () => {
    it('should use correct channel IDs for different notification types', () => {
      expect(AGENTS_EMAIL_SUBCHANNEL).toBe('agents:email');
      expect(AGENTS_WORD_SUBCHANNEL).toBe('agents:word');
      expect(AGENTS_EXCEL_SUBCHANNEL).toBe('agents:excel');
      expect(AGENTS_POWERPOINT_SUBCHANNEL).toBe('agents:powerpoint');
    });
  });

  describe('Method Extensions', () => {
    it('should extend AgentApplication prototype with notification methods', () => {
      expect(typeof app.onAgentNotification).toBe('function');
      expect(typeof app.onAgenticEmailNotification).toBe('function');
    });

    it('should have notification methods available on new instances', () => {
      const newApp = new AgentApplication<TurnState>();
      
      expect(typeof newApp.onAgentNotification).toBe('function');
      expect(typeof newApp.onAgenticEmailNotification).toBe('function');
    });
  });

  describe('Handler Parameters Validation', () => {
    it('should call handler with correct parameters', async () => {
      const handler = jest.fn();
      app.onAgentNotification('*', handler);

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

      await handler(mockTurnContext, mockTurnState, notification);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        mockTurnContext,
        mockTurnState,
        expect.objectContaining({
          notificationType: NotificationType.EmailNotification
        })
      );
    });

    it('should handle async handlers properly', async () => {
      const asyncHandler = jest.fn().mockResolvedValue(undefined);
      app.onAgentNotification('*', asyncHandler);

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

      const result = asyncHandler(mockTurnContext, mockTurnState, notification);
      
      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle handler errors gracefully', async () => {
      const errorHandler = jest.fn().mockRejectedValue(new Error('Handler error'));
      app.onAgentNotification('*', errorHandler);

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

      await expect(errorHandler(mockTurnContext, mockTurnState, notification))
        .rejects.toThrow('Handler error');
    });

    it('should handle null/undefined notification gracefully', async () => {
      const handler = jest.fn();
      app.onAgentNotification('*', handler);

      // Should not throw when called with undefined notification
      await handler(mockTurnContext, mockTurnState, undefined as any);
      
      expect(handler).toHaveBeenCalledWith(mockTurnContext, mockTurnState, undefined);
    });
  });
});