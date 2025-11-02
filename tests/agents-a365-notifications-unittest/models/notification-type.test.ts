// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { NotificationType } from '../../../packages/agents-a365-notifications/src/models/notification-type';

describe('NotificationType', () => {
  describe('enum values', () => {
    it('should have Unknown = 0', () => {
      expect(NotificationType.Unknown).toBe(0);
    });

    it('should have WpxComment = 1', () => {
      expect(NotificationType.WpxComment).toBe(1);
    });

    it('should have EmailNotification = 2', () => {
      expect(NotificationType.EmailNotification).toBe(2);
    });

    it('should have AgentLifecycleNotification = 3', () => {
      expect(NotificationType.AgentLifecycleNotification).toBe(3);
    });
  });

  describe('enum behavior', () => {
    it('should be able to convert from number to enum', () => {
      expect(NotificationType[0]).toBe('Unknown');
      expect(NotificationType[1]).toBe('WpxComment');
      expect(NotificationType[2]).toBe('EmailNotification');
      expect(NotificationType[3]).toBe('AgentLifecycleNotification');
    });

    it('should be able to use in switch statements', () => {
      const testFunction = (type: NotificationType): string => {
        switch (type) {
          case 0: // NotificationType.Unknown
            return 'unknown';
          case 1: // NotificationType.WpxComment
            return 'comment';
          case 2: // NotificationType.EmailNotification
            return 'email';
          case 3: // NotificationType.AgentLifecycleNotification
            return 'lifecycle';
          default:
            return 'unknown';
        }
      };

      expect(testFunction(NotificationType.EmailNotification)).toBe('email');
      expect(testFunction(NotificationType.Unknown)).toBe('unknown');
      expect(testFunction(NotificationType.WpxComment)).toBe('comment');
      expect(testFunction(NotificationType.AgentLifecycleNotification)).toBe('lifecycle');
    });

    it('should support comparison operations', () => {
      expect(NotificationType.Unknown < NotificationType.WpxComment).toBe(true);
      expect(NotificationType.WpxComment < NotificationType.EmailNotification).toBe(true);
      expect(NotificationType.EmailNotification < NotificationType.AgentLifecycleNotification).toBe(true);
    });
  });

  describe('type safety', () => {
    it('should enforce type checking at compile time', () => {
      const testFunction = (notType: NotificationType): string => {
        return `Type: ${notType}`;
      };

      expect(testFunction(NotificationType.Unknown)).toBe('Type: 0');
      expect(testFunction(NotificationType.WpxComment)).toBe('Type: 1');
      expect(testFunction(NotificationType.EmailNotification)).toBe('Type: 2');
      expect(testFunction(NotificationType.AgentLifecycleNotification)).toBe('Type: 3');
    });
  });
});