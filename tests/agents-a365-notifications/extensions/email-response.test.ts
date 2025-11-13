// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { EmailResponse, EMAIL_RESPONSE_TYPE, createEmailResponse } from '@microsoft/agents-a365-notifications';

describe('EmailResponse', () => {
  describe('Interface Structure', () => {
    it('should have required type property', () => {
      // Arrange
      const response: EmailResponse = {
        type: 'emailResponse',
        htmlBody: '<p>Test content</p>'
      };

      // Assert
      expect(response.type).toBeDefined();
      expect(response.type).toBe('emailResponse');
    });

    it('should have optional htmlBody property', () => {
      // Arrange
      const responseWithBody: EmailResponse = {
        type: 'emailResponse',
        htmlBody: '<p>Test content</p>'
      };

      const responseWithoutBody: EmailResponse = {
        type: 'emailResponse'
      };

      // Assert
      expect(responseWithBody.htmlBody).toBeDefined();
      expect(responseWithoutBody.htmlBody).toBeUndefined();
    });

    it('should extend Entity interface', () => {
      // Arrange
      const response: EmailResponse = {
        type: 'emailResponse',
        htmlBody: '<p>Test</p>'
      };

      // Assert - Should have Entity properties
      expect(response.type).toBeDefined();
      expect(typeof response.type).toBe('string');
    });

    it('should support HTML content in htmlBody', () => {
      // Arrange
      const htmlContent = '<div><h1>Title</h1><p>Paragraph with <strong>bold</strong> text.</p></div>';
      const response: EmailResponse = {
        type: 'emailResponse',
        htmlBody: htmlContent
      };

      // Assert
      expect(response.htmlBody).toBe(htmlContent);
      expect(response.htmlBody).toContain('<h1>');
      expect(response.htmlBody).toContain('<strong>');
    });
  });

  describe('EMAIL_RESPONSE_TYPE Constant', () => {
    it('should define correct type constant', () => {
      // Assert
      expect(EMAIL_RESPONSE_TYPE).toBeDefined();
      expect(EMAIL_RESPONSE_TYPE).toBe('emailResponse');
      expect(typeof EMAIL_RESPONSE_TYPE).toBe('string');
    });

    it('should match EmailResponse type property', () => {
      // Arrange
      const response: EmailResponse = {
        type: EMAIL_RESPONSE_TYPE,
        htmlBody: '<p>Test</p>'
      };

      // Assert
      expect(response.type).toBe(EMAIL_RESPONSE_TYPE);
      expect(response.type).toBe('emailResponse');
    });
  });

  describe('createEmailResponse Factory Function', () => {
    it('should create EmailResponse with provided HTML body', () => {
      // Arrange
      const htmlBody = '<p>Hello, World!</p>';

      // Act
      const response = createEmailResponse(htmlBody);

      // Assert
      expect(response).toBeDefined();
      expect(response.type).toBe('emailResponse');
      expect(response.htmlBody).toBe(htmlBody);
    });

    it('should create EmailResponse with empty string when no body provided', () => {
      // Act
      const response = createEmailResponse();

      // Assert
      expect(response).toBeDefined();
      expect(response.type).toBe('emailResponse');
      expect(response.htmlBody).toBe('');
    });

    it('should handle undefined htmlBody parameter', () => {
      // Act
      const response = createEmailResponse(undefined);

      // Assert
      expect(response).toBeDefined();
      expect(response.type).toBe('emailResponse');
      expect(response.htmlBody).toBe('');
    });

    it('should handle null htmlBody parameter', () => {
      // Act
      const response = createEmailResponse(null as any);

      // Assert
      expect(response).toBeDefined();
      expect(response.type).toBe('emailResponse');
      expect(response.htmlBody).toBe('');
    });

    it('should create EmailResponse with complex HTML content', () => {
      // Arrange
      const complexHtml = `
        <html>
          <head><title>Email Response</title></head>
          <body>
            <div style="margin: 20px;">
              <h1>Response Title</h1>
              <p>This is a <em>formatted</em> response with <strong>bold</strong> text.</p>
              <ul>
                <li>Item 1</li>
                <li>Item 2</li>
              </ul>
            </div>
          </body>
        </html>
      `;

      // Act
      const response = createEmailResponse(complexHtml);

      // Assert
      expect(response.type).toBe('emailResponse');
      expect(response.htmlBody).toBe(complexHtml);
      expect(response.htmlBody).toContain('<html>');
      expect(response.htmlBody).toContain('<ul>');
    });

    it('should handle empty string htmlBody', () => {
      // Act
      const response = createEmailResponse('');

      // Assert
      expect(response.type).toBe('emailResponse');
      expect(response.htmlBody).toBe('');
    });

    it('should handle whitespace-only htmlBody', () => {
      // Arrange
      const whitespaceBody = '   \n\t   ';

      // Act
      const response = createEmailResponse(whitespaceBody);

      // Assert
      expect(response.type).toBe('emailResponse');
      expect(response.htmlBody).toBe(whitespaceBody);
    });
  });

  describe('Type Safety and Validation', () => {
    it('should enforce correct type property value', () => {
      // Arrange & Act
      const response: EmailResponse = {
        type: 'emailResponse',
        htmlBody: '<p>Test</p>'
      };

      // Assert - TypeScript should enforce this at compile time
      expect(response.type).toBe('emailResponse');
    });

    it('should work with Entity interface properties', () => {
      // Arrange
      const response: EmailResponse = {
        type: 'emailResponse',
        htmlBody: '<p>Test content</p>'
      };

      // Assert - Should be compatible with Entity interface
      expect(response.type).toBeDefined();
      expect(typeof response.type).toBe('string');
    });

    it('should support optional properties correctly', () => {
      // Arrange
      const minimalResponse: EmailResponse = {
        type: 'emailResponse'
      };

      const fullResponse: EmailResponse = {
        type: 'emailResponse',
        htmlBody: '<p>Full response</p>'
      };

      // Assert
      expect(minimalResponse.type).toBe('emailResponse');
      expect(minimalResponse.htmlBody).toBeUndefined();
      expect(fullResponse.htmlBody).toBeDefined();
    });
  });

  describe('Integration Scenarios', () => {
    it('should work in array of responses', () => {
      // Arrange
      const responses: EmailResponse[] = [
        createEmailResponse('<p>Response 1</p>'),
        createEmailResponse('<p>Response 2</p>'),
        createEmailResponse()
      ];

      // Assert
      expect(responses).toHaveLength(3);
      responses.forEach(response => {
        expect(response.type).toBe('emailResponse');
      });
    });

    it('should serialize and deserialize correctly', () => {
      // Arrange
      const original = createEmailResponse('<p><strong>Bold</strong> content</p>');

      // Act
      const serialized = JSON.stringify(original);
      const deserialized = JSON.parse(serialized) as EmailResponse;

      // Assert
      expect(deserialized.type).toBe(original.type);
      expect(deserialized.htmlBody).toBe(original.htmlBody);
    });

    it('should work as part of larger response objects', () => {
      // Arrange
      interface NotificationResponse {
        id: string;
        timestamp: Date;
        emailResponse: EmailResponse;
      }

      const response: NotificationResponse = {
        id: 'response-123',
        timestamp: new Date(),
        emailResponse: createEmailResponse('<p>Notification content</p>')
      };

      // Assert
      expect(response.emailResponse.type).toBe('emailResponse');
      expect(response.emailResponse.htmlBody).toContain('Notification content');
    });
  });
});