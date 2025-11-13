// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { 
  EmailReference, 
  EMAIL_NOTIFICATION_TYPE,
  isEmailReference,
  createEmailReference
} from '@microsoft/agents-a365-notifications';
import { Entity } from '@microsoft/agents-activity';

describe('EmailReference', () => {
  describe('Interface Properties', () => {
    it('should have correct type property', () => {
      // Arrange
      const emailRef = createEmailReference();

      // Assert
      expect(emailRef.type).toBe('emailNotification');
      expect(emailRef.type).toBe(EMAIL_NOTIFICATION_TYPE);
    });

    it('should support all properties', () => {
      // Arrange
      const emailRef: EmailReference = {
        type: 'emailNotification',
        id: 'email-123',
        conversationId: 'conv-456',
        htmlBody: '<p>Test email content</p>'
      };

      // Assert
      expect(emailRef.type).toBe('emailNotification');
      expect(emailRef.id).toBe('email-123');
      expect(emailRef.conversationId).toBe('conv-456');
      expect(emailRef.htmlBody).toBe('<p>Test email content</p>');
    });
  });

  describe('createEmailReference Function', () => {
    it('should create EmailReference with no parameters', () => {
      // Act
      const emailRef = createEmailReference();

      // Assert
      expect(emailRef.type).toBe('emailNotification');
      expect(emailRef.id).toBeUndefined();
      expect(emailRef.conversationId).toBeUndefined();
      expect(emailRef.htmlBody).toBeUndefined();
    });

    it('should create EmailReference with all parameters', () => {
      // Act
      const emailRef = createEmailReference('email-123', 'conv-456', '<h1>Test HTML</h1>');

      // Assert
      expect(emailRef.type).toBe('emailNotification');
      expect(emailRef.id).toBe('email-123');
      expect(emailRef.conversationId).toBe('conv-456');
      expect(emailRef.htmlBody).toBe('<h1>Test HTML</h1>');
    });

    it('should create EmailReference with partial parameters', () => {
      // Act
      const emailRef1 = createEmailReference('email-only');
      const emailRef2 = createEmailReference('email-123', 'conv-456');

      // Assert
      expect(emailRef1.id).toBe('email-only');
      expect(emailRef1.conversationId).toBeUndefined();
      expect(emailRef1.htmlBody).toBeUndefined();

      expect(emailRef2.id).toBe('email-123');
      expect(emailRef2.conversationId).toBe('conv-456');
      expect(emailRef2.htmlBody).toBeUndefined();
    });

    it('should handle empty strings', () => {
      // Act
      const emailRef = createEmailReference('', '', '');

      // Assert
      expect(emailRef.id).toBe('');
      expect(emailRef.conversationId).toBe('');
      expect(emailRef.htmlBody).toBe('');
    });

    it('should handle complex HTML content', () => {
      // Arrange
      const complexHtml = `
        <html>
          <body>
            <h1>Email Subject</h1>
            <p>Email body with <strong>formatting</strong></p>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
          </body>
        </html>
      `;

      // Act
      const emailRef = createEmailReference('complex-email', 'complex-conv', complexHtml);

      // Assert
      expect(emailRef.htmlBody).toBe(complexHtml);
    });
  });

  describe('isEmailReference Type Guard', () => {
    it('should return true for valid EmailReference', () => {
      // Arrange
      const emailRef = createEmailReference('test-email');

      // Act & Assert
      expect(isEmailReference(emailRef)).toBe(true);
    });

    it('should return true for EmailReference with different casing', () => {
      // Arrange
      const emailRef: Entity = {
        type: 'EmailNotification' as any // Test case insensitivity
      };

      // Act & Assert
      expect(isEmailReference(emailRef)).toBe(true);
    });

    it('should return false for non-EmailReference entities', () => {
      // Arrange
      const wrongEntity: Entity = {
        type: 'WpxComment'
      };

      // Act & Assert
      expect(isEmailReference(wrongEntity)).toBe(false);
    });

    it('should return false for entities with no type', () => {
      // Arrange
      const entityWithoutType: Entity = {} as any;

      // Act & Assert
      expect(isEmailReference(entityWithoutType)).toBe(false);
    });

    it('should return false for null or undefined', () => {
      // Act & Assert
      expect(isEmailReference(null as any)).toBe(false);
      expect(isEmailReference(undefined as any)).toBe(false);
    });

    it('should return false for entities with null/undefined type', () => {
      // Arrange
      const entityWithNullType: Entity = { type: null as any };
      const entityWithUndefinedType: Entity = { type: undefined as any };

      // Act & Assert
      expect(isEmailReference(entityWithNullType)).toBe(false);
      expect(isEmailReference(entityWithUndefinedType)).toBe(false);
    });
  });

  describe('EMAIL_NOTIFICATION_TYPE Constant', () => {
    it('should have correct value', () => {
      // Assert
      expect(EMAIL_NOTIFICATION_TYPE).toBe('emailNotification');
    });

    it('should be immutable', () => {
      // Assert
      expect(() => {
        (EMAIL_NOTIFICATION_TYPE as any) = 'modified';
      }).toThrow();
    });
  });
});