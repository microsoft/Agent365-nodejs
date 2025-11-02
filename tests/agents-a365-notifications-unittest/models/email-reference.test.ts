// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { EmailReference, isEmailReference, createEmailReference, EMAIL_NOTIFICATION_TYPE } from '../../../packages/agents-a365-notifications/src/models/email-reference';
import { Entity } from '@microsoft/agents-activity';

describe('EmailReference', () => {
  describe('createEmailReference', () => {
    it('should create an EmailReference with all properties', () => {
      const id = 'test-email-id';
      const conversationId = 'test-conversation-id';
      const htmlBody = '<p>Test email content</p>';

      const emailRef = createEmailReference(id, conversationId, htmlBody);

      expect(emailRef).toEqual({
        type: 'emailNotification',
        id,
        conversationId,
        htmlBody,
      });
    });

    it('should create an EmailReference with undefined properties', () => {
      const emailRef = createEmailReference();

      expect(emailRef).toEqual({
        type: 'emailNotification',
        id: undefined,
        conversationId: undefined,
        htmlBody: undefined,
      });
    });

    it('should create an EmailReference with partial properties', () => {
      const id = 'test-id';
      const emailRef = createEmailReference(id);

      expect(emailRef).toEqual({
        type: 'emailNotification',
        id,
        conversationId: undefined,
        htmlBody: undefined,
      });
    });
  });

  describe('isEmailReference', () => {
    it('should return true for valid EmailReference entity', () => {
      const entity: Entity = {
        type: 'emailNotification',
      };

      expect(isEmailReference(entity)).toBe(true);
    });

    it('should return true for valid EmailReference entity case insensitive', () => {
      const entity: Entity = {
        type: 'EMAILNOTIFICATION',
      };

      expect(isEmailReference(entity)).toBe(true);
    });

    it('should return false for invalid entity type', () => {
      const entity: Entity = {
        type: 'WpxComment',
      };

      expect(isEmailReference(entity)).toBe(false);
    });

    it('should return false for entity with no type', () => {
      const entity: Entity = {} as Entity;

      expect(isEmailReference(entity)).toBe(false);
    });

    it('should return false for null entity', () => {
      expect(isEmailReference(null as any)).toBe(false);
    });

    it('should return false for undefined entity', () => {
      expect(isEmailReference(undefined as any)).toBe(false);
    });
  });

  describe('EMAIL_NOTIFICATION_TYPE constant', () => {
    it('should have the correct value', () => {
      expect(EMAIL_NOTIFICATION_TYPE).toBe('emailNotification');
    });
  });

  describe('EmailReference interface compliance', () => {
    it('should match the interface structure', () => {
      const emailRef: EmailReference = {
        type: 'emailNotification',
        id: 'test-id',
        conversationId: 'conv-123',
        htmlBody: '<div>Test</div>',
      };

      expect(emailRef.type).toBe('emailNotification');
      expect(emailRef.id).toBe('test-id');
      expect(emailRef.conversationId).toBe('conv-123');
      expect(emailRef.htmlBody).toBe('<div>Test</div>');
    });
  });
});