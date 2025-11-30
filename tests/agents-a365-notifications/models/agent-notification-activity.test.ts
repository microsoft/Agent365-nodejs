// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { 
  AgentNotificationActivity,
  createAgentNotificationActivity,
  NotificationType,
  createEmailReference,
  createWpxComment
} from '@microsoft/agents-a365-notifications';
import { Activity, ConversationAccount, ChannelAccount } from '@microsoft/agents-activity';
import { AGENT_LIFECYCLE } from '@microsoft/agents-a365-notifications';

describe('AgentNotificationActivity', () => {
  describe('Interface Properties', () => {
    it('should support all required properties', () => {
      // Arrange
      const mockActivity: AgentNotificationActivity = {
        notificationType: NotificationType.EmailNotification,
        emailNotification: createEmailReference('test-email'),
        conversation: { id: 'conv-123' } as ConversationAccount,
        from: { id: 'sender-123', name: 'Sender' },
        recipient: { id: 'recipient-123', name: 'Recipient' },
        channelData: { custom: 'data' },
        text: 'Test message',
        valueType: 'test-value-type',
        value: { custom: 'value' }
      };

      // Assert
      expect(mockActivity.notificationType).toBe(NotificationType.EmailNotification);
      expect(mockActivity.emailNotification).toBeDefined();
      expect(mockActivity.wpxCommentNotification).toBeUndefined();
      expect(mockActivity.conversation?.id).toBe('conv-123');
      expect(mockActivity.from.id).toBe('sender-123');
      expect(mockActivity.recipient.id).toBe('recipient-123');
      expect(mockActivity.channelData).toEqual({ custom: 'data' });
      expect(mockActivity.text).toBe('Test message');
      expect(mockActivity.valueType).toBe('test-value-type');
      expect(mockActivity.value).toEqual({ custom: 'value' });
    });

    it('should support optional properties', () => {
      // Arrange
      const minimalActivity: AgentNotificationActivity = {
        notificationType: NotificationType.Unknown,
        from: {},
        recipient: {},
        channelData: {},
        text: '',
        valueType: '',
        value: {}
      };

      // Assert
      expect(minimalActivity.wpxCommentNotification).toBeUndefined();
      expect(minimalActivity.emailNotification).toBeUndefined();
      expect(minimalActivity.conversation).toBeUndefined();
    });
  });

  describe('createAgentNotificationActivity Function', () => {
    it('should throw error for null activity', () => {
      // Assert
      expect(() => createAgentNotificationActivity(null as any)).toThrow('Activity cannot be null or undefined');
    });

    it('should throw error for undefined activity', () => {
      // Assert
      expect(() => createAgentNotificationActivity(undefined as any)).toThrow('Activity cannot be null or undefined');
    });

    it('should create notification activity from email activity', () => {
      // Arrange
      const emailEntity = createEmailReference('email-123', 'conv-456', '<p>Test email</p>');
      const activity = {
        type: 'message',
        entities: [emailEntity],
        from: { id: 'sender-123', name: 'Email Sender' },
        recipient: { id: 'recipient-123', name: 'Email Recipient' },
        conversation: { id: 'email-conv' } as ConversationAccount,
        channelData: { source: 'email' },
        text: 'Email notification text',
        valueType: 'email-value-type',
        value: { emailData: 'test' }
      } as Activity;

      // Act
      const notificationActivity = createAgentNotificationActivity(activity);

      // Assert
      expect(notificationActivity.notificationType).toBe(NotificationType.EmailNotification);
      expect(notificationActivity.emailNotification).toEqual(emailEntity);
      expect(notificationActivity.wpxCommentNotification).toBeUndefined();
      expect(notificationActivity.from).toEqual(activity.from);
      expect(notificationActivity.recipient).toEqual(activity.recipient);
      expect(notificationActivity.conversation).toEqual(activity.conversation);
      expect(notificationActivity.channelData).toEqual(activity.channelData);
      expect(notificationActivity.text).toBe(activity.text);
      expect(notificationActivity.valueType).toBe(activity.valueType);
      expect(notificationActivity.value).toEqual(activity.value);
    });

    it('should create notification activity from wpx comment activity', () => {
      // Arrange
      const wpxEntity = createWpxComment('odata-123', 'doc-456', 'comment-789', 'subject-012');
      const activity = {
        type: 'message',
        entities: [wpxEntity],
        from: { id: 'wpx-sender' },
        recipient: { id: 'wpx-recipient' }
      } as Activity;

      // Act
      const notificationActivity = createAgentNotificationActivity(activity);

      // Assert
      expect(notificationActivity.notificationType).toBe(NotificationType.WpxComment);
      expect(notificationActivity.wpxCommentNotification).toEqual(wpxEntity);
      expect(notificationActivity.emailNotification).toBeUndefined();
    });

    it('should handle activity with multiple entities (email takes precedence)', () => {
      // Arrange
      const emailEntity = createEmailReference('email-123');
      const wpxEntity = createWpxComment('odata-123');
      const activity = {
        type: 'message',
        entities: [wpxEntity, emailEntity], // WPX first, but email should take precedence based on code
        from: { id: 'multi-sender' },
        recipient: { id: 'multi-recipient' }
      } as Activity;

      // Act
      const notificationActivity = createAgentNotificationActivity(activity);

      // Assert
      expect(notificationActivity.notificationType).toBe(NotificationType.EmailNotification);
      expect(notificationActivity.emailNotification).toEqual(emailEntity);
      expect(notificationActivity.wpxCommentNotification).toEqual(wpxEntity); // Both are preserved
    });

    it('should handle agent lifecycle notification', () => {
      // Arrange
      const activity = {
        type: 'message',
        name: AGENT_LIFECYCLE,
        from: { id: 'lifecycle-sender' },
        recipient: { id: 'lifecycle-recipient' }
      } as Activity;

      // Act
      const notificationActivity = createAgentNotificationActivity(activity);

      // Assert
      expect(notificationActivity.notificationType).toBe(NotificationType.AgentLifecycleNotification);
      expect(notificationActivity.emailNotification).toBeUndefined();
      expect(notificationActivity.wpxCommentNotification).toBeUndefined();
    });

    it('should handle agent lifecycle notification with different casing', () => {
      // Arrange
      const activity = {
        type: 'message',
        name: 'AgentLifecycle',
        from: { id: 'lifecycle-sender' },
        recipient: { id: 'lifecycle-recipient' }
      } as Activity;

      // Act
      const notificationActivity = createAgentNotificationActivity(activity);

      // Assert
      expect(notificationActivity.notificationType).toBe(NotificationType.AgentLifecycleNotification);
    });

    it('should handle activity without entities or name', () => {
      // Arrange
      const activity = {
        type: 'message',
        from: { id: 'unknown-sender' },
        recipient: { id: 'unknown-recipient' }
      } as Activity;

      // Act
      const notificationActivity = createAgentNotificationActivity(activity);

      // Assert
      expect(notificationActivity.notificationType).toBe(NotificationType.Unknown);
      expect(notificationActivity.emailNotification).toBeUndefined();
      expect(notificationActivity.wpxCommentNotification).toBeUndefined();
    });

    it('should handle activity with empty entities array', () => {
      // Arrange
      const activity = {
        type: 'message',
        entities: [],
        from: { id: 'empty-sender' },
        recipient: { id: 'empty-recipient' }
      } as unknown as Activity;

      // Act
      const notificationActivity = createAgentNotificationActivity(activity);

      // Assert
      expect(notificationActivity.notificationType).toBe(NotificationType.Unknown);
      expect(notificationActivity.emailNotification).toBeUndefined();
      expect(notificationActivity.wpxCommentNotification).toBeUndefined();
    });

    it('should provide default values for missing activity properties', () => {
      // Arrange
      const minimalActivity = {
        type: 'message'
      } as Activity;

      // Act
      const notificationActivity = createAgentNotificationActivity(minimalActivity);

      // Assert
      expect(notificationActivity.from).toEqual({});
      expect(notificationActivity.recipient).toEqual({});
      expect(notificationActivity.channelData).toEqual({});
      expect(notificationActivity.text).toBe('');
      expect(notificationActivity.valueType).toBe('');
      expect(notificationActivity.value).toEqual({});
      expect(notificationActivity.conversation).toBeUndefined();
    });

    it('should handle activity with null/undefined properties', () => {
      // Arrange
      const activity = {
        type: 'message',
        from: null as any,
        recipient: undefined as any,
        channelData: null as any,
        text: null as any,
        valueType: undefined as any,
        value: null as any
      } as Activity;

      // Act
      const notificationActivity = createAgentNotificationActivity(activity);

      // Assert
      expect(notificationActivity.from).toEqual({});
      expect(notificationActivity.recipient).toEqual({});
      expect(notificationActivity.channelData).toEqual({});
      expect(notificationActivity.text).toBe('');
      expect(notificationActivity.valueType).toBe('');
      expect(notificationActivity.value).toEqual({});
    });
  });
});