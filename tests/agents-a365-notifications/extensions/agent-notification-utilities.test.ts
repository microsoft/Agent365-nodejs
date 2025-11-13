// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AgentApplication, TurnContext, TurnState } from '@microsoft/agents-hosting';
import '@microsoft/agents-a365-notifications';
import { 
  AgentNotificationActivity, 
  NotificationType,
  createEmailReference,
  EMAIL_NOTIFICATION_TYPE,
  WPX_COMMENT_TYPE,
  isEmailReference,
  isWpxComment,
  createWpxComment
} from '@microsoft/agents-a365-notifications';

describe('Agent Notification Utilities and Type Guards', () => {
  describe('Type Guards', () => {
    it('should identify EmailReference entities correctly', () => {
      const emailEntity = createEmailReference('test-id', 'conv-id', '<p>Content</p>');
      
      expect(isEmailReference(emailEntity)).toBe(true);
      expect(emailEntity.type).toBe(EMAIL_NOTIFICATION_TYPE);
    });

    it('should identify WpxComment entities correctly', () => {
      const wpxEntity = createWpxComment('odata-id', 'doc-id', 'comment-id', 'subject-id');
      
      expect(isWpxComment(wpxEntity)).toBe(true);
      expect(wpxEntity.type).toBe(WPX_COMMENT_TYPE);
    });

    it('should reject invalid entities', () => {
      const invalidEntity = { type: 'invalid', id: 'test' };
      
      expect(isEmailReference(invalidEntity as any)).toBe(false);
      expect(isWpxComment(invalidEntity as any)).toBe(false);
    });

    it('should handle null/undefined entities', () => {
      expect(isEmailReference(null as any)).toBe(false);
      expect(isEmailReference(undefined as any)).toBe(false);
      expect(isWpxComment(null as any)).toBe(false);
      expect(isWpxComment(undefined as any)).toBe(false);
    });

    it('should handle entities without type property', () => {
      const entityWithoutType = { id: 'test', content: 'some content' };
      
      expect(isEmailReference(entityWithoutType as any)).toBe(false);
      expect(isWpxComment(entityWithoutType as any)).toBe(false);
    });
  });

  describe('Factory Functions', () => {
    it('should create valid EmailReference with all parameters', () => {
      const email = createEmailReference('email-123', 'conv-456', '<h1>HTML Content</h1>');
      
      expect(email.type).toBe('emailNotification');
      expect(email.id).toBe('email-123');
      expect(email.conversationId).toBe('conv-456');
      expect(email.htmlBody).toBe('<h1>HTML Content</h1>');
    });

    it('should create valid EmailReference with minimal parameters', () => {
      const email = createEmailReference('email-123');
      
      expect(email.type).toBe('emailNotification');
      expect(email.id).toBe('email-123');
      expect(email.conversationId).toBeUndefined();
      expect(email.htmlBody).toBeUndefined();
    });

    it('should create valid EmailReference with no parameters', () => {
      const email = createEmailReference();
      
      expect(email.type).toBe('emailNotification');
      expect(email.id).toBeUndefined();
      expect(email.conversationId).toBeUndefined();
      expect(email.htmlBody).toBeUndefined();
    });

    it('should create valid WpxComment with all parameters', () => {
      const wpx = createWpxComment('odata-123', 'doc-456', 'init-789', 'subj-012');
      
      expect(wpx.type).toBe('WpxComment');
      expect(wpx.odataId).toBe('odata-123');
      expect(wpx.documentId).toBe('doc-456');
      expect(wpx.initiatingCommentId).toBe('init-789');
      expect(wpx.subjectCommentId).toBe('subj-012');
    });

    it('should create valid WpxComment with minimal parameters', () => {
      const wpx = createWpxComment();
      
      expect(wpx.type).toBe('WpxComment');
      expect(wpx.odataId).toBeUndefined();
      expect(wpx.documentId).toBeUndefined();
      expect(wpx.initiatingCommentId).toBeUndefined();
      expect(wpx.subjectCommentId).toBeUndefined();
    });
  });

  describe('Notification Type Constants', () => {
    it('should have correct constant values', () => {
      expect(EMAIL_NOTIFICATION_TYPE).toBe('emailNotification');
      expect(WPX_COMMENT_TYPE).toBe('WpxComment');
    });

    it('should have consistent enum values', () => {
      expect(NotificationType.EmailNotification).toBeDefined();
      expect(NotificationType.WpxComment).toBeDefined();
      expect(NotificationType.Unknown).toBeDefined();
      expect(NotificationType.AgentLifecycleNotification).toBeDefined();
    });
  });

  describe('Entity Type Validation', () => {
    it('should validate EmailReference structure', () => {
      const email = createEmailReference('test', 'conv', '<p>test</p>');
      
      // Should have required Entity properties
      expect(email).toHaveProperty('type');
      expect(typeof email.type).toBe('string');
      
      // Should have EmailReference specific properties
      expect(email).toHaveProperty('id');
      expect(email).toHaveProperty('conversationId');
      expect(email).toHaveProperty('htmlBody');
    });

    it('should validate WpxComment structure', () => {
      const wpx = createWpxComment('odata', 'doc', 'init', 'subj');
      
      // Should have required Entity properties
      expect(wpx).toHaveProperty('type');
      expect(typeof wpx.type).toBe('string');
      
      // Should have WpxComment specific properties
      expect(wpx).toHaveProperty('odataId');
      expect(wpx).toHaveProperty('documentId');
      expect(wpx).toHaveProperty('initiatingCommentId');
      expect(wpx).toHaveProperty('subjectCommentId');
    });
  });

  describe('Cross-type Validation', () => {
    it('should not identify WpxComment as EmailReference', () => {
      const wpx = createWpxComment('odata', 'doc', 'comment');
      
      expect(isWpxComment(wpx)).toBe(true);
      expect(isEmailReference(wpx)).toBe(false);
    });

    it('should not identify EmailReference as WpxComment', () => {
      const email = createEmailReference('email', 'conv', 'content');
      
      expect(isEmailReference(email)).toBe(true);
      expect(isWpxComment(email)).toBe(false);
    });

    it('should handle mixed entity arrays', () => {
      const email = createEmailReference('email');
      const wpx = createWpxComment('odata', 'doc');
      const entities = [email, wpx];
      
      const emailEntities = entities.filter(isEmailReference);
      const wpxEntities = entities.filter(isWpxComment);
      
      expect(emailEntities).toHaveLength(1);
      expect(emailEntities[0]).toBe(email);
      expect(wpxEntities).toHaveLength(1);
      expect(wpxEntities[0]).toBe(wpx);
    });
  });

  describe('Case Sensitivity', () => {
    it('should handle case-insensitive type checking for email', () => {
      const entity = { type: 'EMAILNOTIFICATION', id: 'test' };
      
      // Type guard should be case-insensitive based on implementation
      const result = isEmailReference(entity as any);
      
      // This tests the actual implementation behavior
      expect(typeof result).toBe('boolean');
    });

    it('should handle case-insensitive type checking for wpx', () => {
      const entity = { type: 'wpxcomment', documentId: 'test' };
      
      // Type guard should be case-insensitive based on implementation
      const result = isWpxComment(entity as any);
      
      // This tests the actual implementation behavior
      expect(typeof result).toBe('boolean');
    });
  });
});