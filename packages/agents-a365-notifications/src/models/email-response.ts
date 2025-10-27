import { Entity } from '@microsoft/agents-activity';

/**
 * Represents an email response entity to be sent back.
 */
export interface EmailResponse extends Entity {
  /**
   * The type of the entity. Always 'emailResponse'.
   */
  type: 'emailResponse';

  /**
   * The HTML body content of the email response.
   */
  htmlBody?: string;
}

/**
 * The entity type name for email responses.
 */
export const EMAIL_RESPONSE_TYPE = 'emailResponse';

/**
 * Factory function to create an EmailResponse entity.
 */
export function createEmailResponse(htmlBody?: string): EmailResponse {
  return {
    type: 'emailResponse',
    htmlBody: htmlBody ?? '',
  };
}
