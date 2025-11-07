import { Entity } from '@microsoft/agents-activity';

/**
 * Represents a Word (WPX) comment notification entity.
 * 
 * IMPORTANT: For observability and tracking purposes, always use the conversation ID
 * from the activity (activity.conversation.id) rather than attempting to generate a
 * custom conversation ID by combining documentId and initiatingCommentId. The
 * conversation ID from the activity is guaranteed to be unique among threads in the
 * same document.
 */
export interface WpxComment extends Entity {
  /**
   * The type of the entity. Always 'WpxComment'.
   */
  type: 'WpxComment';

  /**
   * The OData ID of the comment.
   */
  odataId?: string;

  /**
   * The ID of the document.
   * Note: This is for reference only. Do not use to generate custom conversation IDs.
   */
  documentId?: string;

  /**
   * The ID of the initiating comment.
   * Note: This is for reference only. Do not use to generate custom conversation IDs.
   */
  initiatingCommentId?: string;

  /**
   * The ID of the subject comment.
   * Note: This is for reference only. Do not use to generate custom conversation IDs.
   */
  subjectCommentId?: string;
}

/**
 * The entity type name for WPX comments.
 */
export const WPX_COMMENT_TYPE = 'WpxComment';

/**
 * Type guard to check if an entity is a WpxComment.
 */
export function isWpxComment(entity: Entity): entity is WpxComment {
  return entity?.type?.toLowerCase() === WPX_COMMENT_TYPE.toLowerCase();
}

/**
 * Factory function to create a WpxComment entity.
 */
export function createWpxComment(
  odataId?: string,
  documentId?: string,
  initiatingCommentId?: string,
  subjectCommentId?: string
): WpxComment {
  return {
    type: 'WpxComment',
    odataId,
    documentId,
    initiatingCommentId,
    subjectCommentId,
  };
}
