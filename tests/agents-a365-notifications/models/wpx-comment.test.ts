// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { WpxComment, isWpxComment, createWpxComment, WPX_COMMENT_TYPE } from '@microsoft/agents-a365-notifications';
import { Entity } from '@microsoft/agents-activity';

describe('WpxComment', () => {
  describe('createWpxComment', () => {
    it('should create a WpxComment with all properties', () => {
      const odataId = 'odata-test-id';
      const documentId = 'doc-123';
      const initiatingCommentId = 'init-456';
      const subjectCommentId = 'subj-789';

      const wpxComment = createWpxComment(odataId, documentId, initiatingCommentId, subjectCommentId);

      expect(wpxComment).toEqual({
        type: 'WpxComment',
        odataId,
        documentId,
        initiatingCommentId,
        subjectCommentId,
      });
    });

    it('should create a WpxComment with undefined properties', () => {
      const wpxComment = createWpxComment();

      expect(wpxComment).toEqual({
        type: 'WpxComment',
        odataId: undefined,
        documentId: undefined,
        initiatingCommentId: undefined,
        subjectCommentId: undefined,
      });
    });

    it('should create a WpxComment with partial properties', () => {
      const odataId = 'partial-odata-id';
      const documentId = 'partial-doc-id';
      const wpxComment = createWpxComment(odataId, documentId);

      expect(wpxComment).toEqual({
        type: 'WpxComment',
        odataId,
        documentId,
        initiatingCommentId: undefined,
        subjectCommentId: undefined,
      });
    });
  });

  describe('isWpxComment', () => {
    it('should return true for valid WpxComment entity', () => {
      const entity: Entity = {
        type: 'WpxComment',
      };

      expect(isWpxComment(entity)).toBe(true);
    });

    it('should return true for valid WpxComment entity case insensitive', () => {
      const entity: Entity = {
        type: 'wpxcomment',
      };

      expect(isWpxComment(entity)).toBe(true);
    });

    it('should return false for invalid entity type', () => {
      const entity: Entity = {
        type: 'emailNotification',
      };

      expect(isWpxComment(entity)).toBe(false);
    });

    it('should return false for entity with no type', () => {
      const entity: Entity = {} as Entity;

      expect(isWpxComment(entity)).toBe(false);
    });

    it('should return false for null entity', () => {
      expect(isWpxComment(null as any)).toBe(false);
    });

    it('should return false for undefined entity', () => {
      expect(isWpxComment(undefined as any)).toBe(false);
    });
  });

  describe('WPX_COMMENT_TYPE constant', () => {
    it('should have the correct value', () => {
      expect(WPX_COMMENT_TYPE).toBe('WpxComment');
    });
  });

  describe('WpxComment interface compliance', () => {
    it('should match the interface structure', () => {
      const wpxComment: WpxComment = {
        type: 'WpxComment',
        odataId: 'odata-test',
        documentId: 'doc-test',
        initiatingCommentId: 'init-test',
        subjectCommentId: 'subj-test',
      };

      expect(wpxComment.type).toBe('WpxComment');
      expect(wpxComment.odataId).toBe('odata-test');
      expect(wpxComment.documentId).toBe('doc-test');
      expect(wpxComment.initiatingCommentId).toBe('init-test');
      expect(wpxComment.subjectCommentId).toBe('subj-test');
    });
  });
});