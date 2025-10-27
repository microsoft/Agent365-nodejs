import { Entity } from '@microsoft/agents-activity';

/**
 * Represents an email notification entity.
 */
export interface EmailReference extends Entity {
  /**
   * The type of the entity. Always 'emailNotification'.
   */
  type: 'emailNotification';

  /**
   * The ID of the email.
   */
  id?: string;

  /**
   * The conversation ID associated with the email.
   */
  conversationId?: string;

  /**
   * The HTML body content of the email.
   */
  htmlBody?: string;
}

/**
 * The entity type name for email notifications.
 */
export const EMAIL_NOTIFICATION_TYPE = 'emailNotification';

/**
 * Type guard to check if an entity is an EmailReference.
 */
export function isEmailReference(entity: Entity): entity is EmailReference {
  return entity?.type?.toLowerCase() === EMAIL_NOTIFICATION_TYPE.toLowerCase();
}

/**
 * Factory function to create an EmailReference entity.
 */
export function createEmailReference(
  id?: string,
  conversationId?: string,
  htmlBody?: string
): EmailReference {
  return {
    type: 'emailNotification',
    id,
    conversationId,
    htmlBody,
  };
}
