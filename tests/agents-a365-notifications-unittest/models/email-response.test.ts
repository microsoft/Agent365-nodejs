// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { EmailResponse, createEmailResponse, EMAIL_RESPONSE_TYPE } from '../../../packages/agents-a365-notifications/src/models/email-response';

describe('EmailResponse', () => {
  describe('createEmailResponse', () => {
    it('should create an EmailResponse with HTML body', () => {
      const htmlBody = '<p>Test response content</p>';
      const emailResponse = createEmailResponse(htmlBody);

      expect(emailResponse).toEqual({
        type: 'emailResponse',
        htmlBody,
      });
    });

    it('should create an EmailResponse with undefined body (default empty string)', () => {
      const emailResponse = createEmailResponse();

      expect(emailResponse).toEqual({
        type: 'emailResponse',
        htmlBody: '',
      });
    });

    it('should create an EmailResponse with empty string body', () => {
      const emailResponse = createEmailResponse('');

      expect(emailResponse).toEqual({
        type: 'emailResponse',
        htmlBody: '',
      });
    });

    it('should create an EmailResponse with complex HTML', () => {
      const htmlBody = '<div><h1>Title</h1><p>Paragraph</p><ul><li>Item 1</li><li>Item 2</li></ul></div>';
      const emailResponse = createEmailResponse(htmlBody);

      expect(emailResponse).toEqual({
        type: 'emailResponse',
        htmlBody,
      });
    });
  });

  describe('EMAIL_RESPONSE_TYPE constant', () => {
    it('should have the correct value', () => {
      expect(EMAIL_RESPONSE_TYPE).toBe('emailResponse');
    });
  });

  describe('EmailResponse interface compliance', () => {
    it('should match the interface structure', () => {
      const emailResponse: EmailResponse = {
        type: 'emailResponse',
        htmlBody: '<div>Test HTML</div>',
      };

      expect(emailResponse.type).toBe('emailResponse');
      expect(emailResponse.htmlBody).toBe('<div>Test HTML</div>');
    });

    it('should allow optional htmlBody', () => {
      const emailResponse: EmailResponse = {
        type: 'emailResponse',
      };

      expect(emailResponse.type).toBe('emailResponse');
      expect(emailResponse.htmlBody).toBeUndefined();
    });
  });
});