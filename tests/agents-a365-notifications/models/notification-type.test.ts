// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { NotificationType } from '@microsoft/agents-a365-notifications';

describe('NotificationType', () => {
  describe('Enum Values', () => {
    it('should have correct numeric values for all notification types', () => {
      // Assert
      expect(NotificationType.Unknown).toBe(0);
      expect(NotificationType.WpxComment).toBe(1);
      expect(NotificationType.EmailNotification).toBe(2);
      expect(NotificationType.AgentLifecycleNotification).toBe(3);
    });

    it('should have correct string representations', () => {
      // Assert
      expect(NotificationType[NotificationType.Unknown]).toBe('Unknown');
      expect(NotificationType[NotificationType.WpxComment]).toBe('WpxComment');
      expect(NotificationType[NotificationType.EmailNotification]).toBe('EmailNotification');
      expect(NotificationType[NotificationType.AgentLifecycleNotification]).toBe('AgentLifecycleNotification');
    });
  });

  describe('Enum Properties', () => {
    it('should be a proper TypeScript enum', () => {
      // Assert
      expect(typeof NotificationType).toBe('object');
      expect(NotificationType).toBeDefined();
    });

    it('should have all expected enum keys', () => {
      // Arrange
      const expectedKeys = ['Unknown', 'WpxComment', 'EmailNotification', 'AgentLifecycleNotification'];
      const actualKeys = Object.keys(NotificationType).filter(key => isNaN(Number(key)));

      // Assert
      expect(actualKeys).toEqual(expectedKeys);
      expect(actualKeys.length).toBe(4);
    });

    it('should support reverse lookup', () => {
      // Assert
      expect(NotificationType[0]).toBe('Unknown');
      expect(NotificationType[1]).toBe('WpxComment');
      expect(NotificationType[2]).toBe('EmailNotification');
      expect(NotificationType[3]).toBe('AgentLifecycleNotification');
    });
  });

  describe('Type Checking', () => {
    it('should allow assignment of valid enum values', () => {
      // Act & Assert
      expect(() => {
        const type1: NotificationType = NotificationType.Unknown;
        const type2: NotificationType = NotificationType.WpxComment;
        const type3: NotificationType = NotificationType.EmailNotification;
        const type4: NotificationType = NotificationType.AgentLifecycleNotification;
        
        // Use variables to avoid unused variable warnings
        expect(type1).toBeDefined();
        expect(type2).toBeDefined();
        expect(type3).toBeDefined();
        expect(type4).toBeDefined();
      }).not.toThrow();
    });

    it('should be comparable', () => {
      // Assert
      expect(NotificationType.Unknown < NotificationType.WpxComment).toBe(true);
      expect(NotificationType.WpxComment < NotificationType.EmailNotification).toBe(true);
      expect(NotificationType.EmailNotification < NotificationType.AgentLifecycleNotification).toBe(true);
    });
  });
});