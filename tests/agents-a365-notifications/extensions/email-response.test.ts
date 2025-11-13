// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { 
  createEmailResponse,
  EmailResponse,
  EMAIL_RESPONSE_TYPE
} from '@microsoft/agents-a365-notifications';

describe('Email Response Creation', () => {
  describe('createEmailResponse function', () => {
    it('should create email response with HTML content', () => {
      const htmlContent = '<p>Thank you for your message!</p>';
      const response = createEmailResponse(htmlContent);

      expect(response.type).toBe(EMAIL_RESPONSE_TYPE);
      expect(response.htmlBody).toBe(htmlContent);
    });

    it('should create email response with complex HTML', () => {
      const complexHtml = `
        <div>
          <h1>Response Title</h1>
          <p>This is a <strong>formatted</strong> response.</p>
          <ul>
            <li>Item 1</li>
            <li>Item 2</li>
          </ul>
        </div>
      `;
      
      const response = createEmailResponse(complexHtml);

      expect(response.type).toBe('emailResponse');
      expect(response.htmlBody).toBe(complexHtml);
    });

    it('should create email response with empty string', () => {
      const response = createEmailResponse('');

      expect(response.type).toBe('emailResponse');
      expect(response.htmlBody).toBe('');
    });

    it('should create email response with whitespace content', () => {
      const whitespaceContent = '   \n\t   ';
      const response = createEmailResponse(whitespaceContent);

      expect(response.type).toBe('emailResponse');
      expect(response.htmlBody).toBe(whitespaceContent);
    });

    it('should handle special characters in HTML', () => {
      const specialCharsHtml = '<p>Special chars: &amp; &lt; &gt; &quot; &#39;</p>';
      const response = createEmailResponse(specialCharsHtml);

      expect(response.type).toBe('emailResponse');
      expect(response.htmlBody).toBe(specialCharsHtml);
    });
  });

  describe('EmailResponse type validation', () => {
    it('should have correct type structure', () => {
      const response = createEmailResponse('<p>Test</p>');

      expect(response).toHaveProperty('type');
      expect(response).toHaveProperty('htmlBody');
      expect(typeof response.type).toBe('string');
      expect(typeof response.htmlBody).toBe('string');
    });

    it('should create objects that match EmailResponse interface', () => {
      const response: EmailResponse = createEmailResponse('<div>Interface test</div>');

      expect(response.type).toBe('emailResponse');
      expect(response.htmlBody).toBe('<div>Interface test</div>');
    });
  });

  describe('EMAIL_RESPONSE_TYPE constant', () => {
    it('should have correct constant value', () => {
      expect(EMAIL_RESPONSE_TYPE).toBe('emailResponse');
    });

    it('should match the type in created responses', () => {
      const response = createEmailResponse('<p>Constant test</p>');
      
      expect(response.type).toBe(EMAIL_RESPONSE_TYPE);
    });
  });

  describe('Response content handling', () => {
    it('should preserve line breaks and formatting', () => {
      const formattedHtml = `<p>Line 1</p>
<p>Line 2</p>
<p>Line 3</p>`;
      
      const response = createEmailResponse(formattedHtml);
      
      expect(response.htmlBody).toBe(formattedHtml);
      expect(response.htmlBody).toContain('\n');
    });

    it('should handle very long HTML content', () => {
      const longContent = '<p>' + 'Very long content '.repeat(100) + '</p>';
      const response = createEmailResponse(longContent);

      expect(response.type).toBe('emailResponse');
      expect(response.htmlBody).toBe(longContent);
      expect(response.htmlBody!.length).toBeGreaterThan(1000);
    });

    it('should handle HTML with nested tags', () => {
      const nestedHtml = `
        <div class="container">
          <header>
            <h1>Title</h1>
            <nav>
              <ul>
                <li><a href="#section1">Section 1</a></li>
                <li><a href="#section2">Section 2</a></li>
              </ul>
            </nav>
          </header>
          <main>
            <section id="section1">
              <p>Content for <em>section 1</em>.</p>
            </section>
            <section id="section2">
              <p>Content for <strong>section 2</strong>.</p>
            </section>
          </main>
        </div>
      `;
      
      const response = createEmailResponse(nestedHtml);
      
      expect(response.htmlBody).toBe(nestedHtml);
      expect(response.htmlBody).toContain('<div class="container">');
      expect(response.htmlBody).toContain('<em>section 1</em>');
    });
  });

  describe('Integration with notification system', () => {
    it('should create responses compatible with activity entities', () => {
      const response = createEmailResponse('<p>Integration test</p>');
      
      // Response should be usable as an entity in an activity
      const activity = {
        type: 'message',
        entities: [response]
      };
      
      expect(activity.entities).toHaveLength(1);
      expect(activity.entities[0]).toBe(response);
      expect(activity.entities[0].type).toBe('emailResponse');
    });

    it('should work with multiple responses in an activity', () => {
      const response1 = createEmailResponse('<p>First response</p>');
      const response2 = createEmailResponse('<p>Second response</p>');
      
      const activity = {
        type: 'message',
        entities: [response1, response2]
      };
      
      expect(activity.entities).toHaveLength(2);
      expect(activity.entities[0].htmlBody).toBe('<p>First response</p>');
      expect(activity.entities[1].htmlBody).toBe('<p>Second response</p>');
    });
  });
});