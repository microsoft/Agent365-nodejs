import { Activity, Entity } from '@microsoft/agents-activity';

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

/**
 * Creates an activity with an EmailResponse entity
 * @param emailResponseHtmlBody - The HTML body content for the email response
 * @returns A message activity containing the EmailResponse entity
 */
export function createEmailResponseActivity(emailResponseHtmlBody: string): Activity {
  const workingActivity = Activity.fromObject({
    type: 'message',
    entities: []
  });

  workingActivity.entities = workingActivity.entities || [];
  workingActivity.entities.push(createEmailResponse(emailResponseHtmlBody));

  return workingActivity;
}
