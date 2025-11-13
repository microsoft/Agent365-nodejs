// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { 
  WpxComment, 
  WPX_COMMENT_TYPE,
  isWpxComment,
  createWpxComment
} from '@microsoft/agents-a365-notifications';
import { Entity } from '@microsoft/agents-activity';

describe('WpxComment', () => {
  describe('Interface Properties', () => {
    it('should have correct type property', () => {
      // Arrange
      const wpxComment = createWpxComment();

      // Assert
      expect(wpxComment.type).toBe('WpxComment');
      expect(wpxComment.type).toBe(WPX_COMMENT_TYPE);
    });

    it('should support all properties', () => {
      // Arrange
      const wpxComment: WpxComment = {
        type: 'WpxComment',
        odataId: 'odata-123',
        documentId: 'doc-456',
        initiatingCommentId: 'init-789',
        subjectCommentId: 'subj-012'
      };

      // Assert
      expect(wpxComment.type).toBe('WpxComment');
      expect(wpxComment.odataId).toBe('odata-123');
      expect(wpxComment.documentId).toBe('doc-456');
      expect(wpxComment.initiatingCommentId).toBe('init-789');
      expect(wpxComment.subjectCommentId).toBe('subj-012');
    });
  });

  describe('createWpxComment Function', () => {
    it('should create WpxComment with no parameters', () => {
      // Act
      const wpxComment = createWpxComment();

      // Assert
      expect(wpxComment.type).toBe('WpxComment');
      expect(wpxComment.odataId).toBeUndefined();
      expect(wpxComment.documentId).toBeUndefined();
      expect(wpxComment.initiatingCommentId).toBeUndefined();
      expect(wpxComment.subjectCommentId).toBeUndefined();
    });

    it('should create WpxComment with all parameters', () => {
      // Act
      const wpxComment = createWpxComment('odata-123', 'doc-456', 'init-789', 'subj-012');

      // Assert
      expect(wpxComment.type).toBe('WpxComment');
      expect(wpxComment.odataId).toBe('odata-123');
      expect(wpxComment.documentId).toBe('doc-456');
      expect(wpxComment.initiatingCommentId).toBe('init-789');
      expect(wpxComment.subjectCommentId).toBe('subj-012');
    });

    it('should create WpxComment with partial parameters', () => {
      // Act
      const wpxComment1 = createWpxComment('odata-only');
      const wpxComment2 = createWpxComment('odata-123', 'doc-456');
      const wpxComment3 = createWpxComment('odata-123', 'doc-456', 'init-789');

      // Assert
      expect(wpxComment1.odataId).toBe('odata-only');
      expect(wpxComment1.documentId).toBeUndefined();
      expect(wpxComment1.initiatingCommentId).toBeUndefined();
      expect(wpxComment1.subjectCommentId).toBeUndefined();

      expect(wpxComment2.odataId).toBe('odata-123');
      expect(wpxComment2.documentId).toBe('doc-456');
      expect(wpxComment2.initiatingCommentId).toBeUndefined();
      expect(wpxComment2.subjectCommentId).toBeUndefined();

      expect(wpxComment3.odataId).toBe('odata-123');
      expect(wpxComment3.documentId).toBe('doc-456');
      expect(wpxComment3.initiatingCommentId).toBe('init-789');
      expect(wpxComment3.subjectCommentId).toBeUndefined();
    });

    it('should handle empty strings', () => {
      // Act
      const wpxComment = createWpxComment('', '', '', '');

      // Assert
      expect(wpxComment.odataId).toBe('');
      expect(wpxComment.documentId).toBe('');
      expect(wpxComment.initiatingCommentId).toBe('');
      expect(wpxComment.subjectCommentId).toBe('');
    });

    it('should handle GUID-like IDs', () => {
      // Arrange
      const guidLikeOdata = '12345678-1234-5678-9abc-123456789abc';
      const guidLikeDoc = 'abcdef01-2345-6789-abcd-ef0123456789';
      const guidLikeInit = 'fedcba98-7654-3210-fedc-ba9876543210';
      const guidLikeSubj = '11111111-2222-3333-4444-555555555555';

      // Act
      const wpxComment = createWpxComment(guidLikeOdata, guidLikeDoc, guidLikeInit, guidLikeSubj);

      // Assert
      expect(wpxComment.odataId).toBe(guidLikeOdata);
      expect(wpxComment.documentId).toBe(guidLikeDoc);
      expect(wpxComment.initiatingCommentId).toBe(guidLikeInit);
      expect(wpxComment.subjectCommentId).toBe(guidLikeSubj);
    });
  });

  describe('isWpxComment Type Guard', () => {
    it('should return true for valid WpxComment', () => {
      // Arrange
      const wpxComment = createWpxComment('test-odata');

      // Act & Assert
      expect(isWpxComment(wpxComment)).toBe(true);
    });

    it('should return true for WpxComment with different casing', () => {
      // Arrange
      const wpxComment: Entity = {
        type: 'wpxcomment' as any // Test case insensitivity
      };

      // Act & Assert
      expect(isWpxComment(wpxComment)).toBe(true);
    });

    it('should return false for non-WpxComment entities', () => {
      // Arrange
      const wrongEntity: Entity = {
        type: 'emailNotification'
      };

      // Act & Assert
      expect(isWpxComment(wrongEntity)).toBe(false);
    });

    it('should return false for entities with no type', () => {
      // Arrange
      const entityWithoutType: Entity = {} as any;

      // Act & Assert
      expect(isWpxComment(entityWithoutType)).toBe(false);
    });

    it('should return false for null or undefined', () => {
      // Act & Assert
      expect(isWpxComment(null as any)).toBe(false);
      expect(isWpxComment(undefined as any)).toBe(false);
    });

    it('should return false for entities with null/undefined type', () => {
      // Arrange
      const entityWithNullType: Entity = { type: null as any };
      const entityWithUndefinedType: Entity = { type: undefined as any };

      // Act & Assert
      expect(isWpxComment(entityWithNullType)).toBe(false);
      expect(isWpxComment(entityWithUndefinedType)).toBe(false);
    });
  });

  describe('WPX_COMMENT_TYPE Constant', () => {
    it('should have correct value', () => {
      // Assert
      expect(WPX_COMMENT_TYPE).toBe('WpxComment');
    });

    it('should be immutable', () => {
      // Assert
      expect(() => {
        (WPX_COMMENT_TYPE as any) = 'modified';
      }).toThrow();
    });
  });
});