import { NotificationType } from './notification-type';
import { EmailReference, isEmailReference } from './email-reference';
import { WpxComment, isWpxComment } from './wpx-comment';
import { Activity, ConversationAccount, ChannelAccount } from '@microsoft/agents-activity';

import {
  AGENT_LIFECYCLE
} from '../constants';


/**
 * Represents a parsed agent notification activity with strongly-typed notification data.
 */
export interface AgentNotificationActivity {
  /**
   * WPX comment notification if present.
   */
  wpxCommentNotification?: WpxComment;

  /**
   * Email notification if present.
   */
  emailNotification?: EmailReference;

  /**
   * The type of notification detected.
   */
  notificationType: NotificationType;

  /**
   * The conversation account.
   */
  conversation?: ConversationAccount;

  /**
   * The sender of the activity.
   */
  from: ChannelAccount;

  /**
   * The recipient of the activity.
   */
  recipient: ChannelAccount;

  /**
   * Channel-specific data.
   */
  channelData: any;

  /**
   * The text content of the activity.
   */
  text: string;

  /**
   * The value type of the activity.
   */
  valueType: string;

  /**
   * The value payload of the activity.
   */
  value: unknown;
}

/**
 * Creates a wrapper for an agent notification activity.
 * @param activity - The activity
 * @returns An agent notification activity
 */
export function createAgentNotificationActivity(
  activity: Activity
): AgentNotificationActivity {
  if (!activity) {
    throw new Error('Activity cannot be null or undefined');
  }

  let notificationType = NotificationType.Unknown;
  let wpxCommentNotification: WpxComment | undefined;
  let emailNotification: EmailReference | undefined;

  // Parse entities to extract notification types
  if (activity.entities && Array.isArray(activity.entities)) {
    for (const entity of activity.entities) {
      if (isWpxComment(entity)) {
        wpxCommentNotification = entity;
        notificationType = NotificationType.WpxComment;
      } else if (isEmailReference(entity)) {
        emailNotification = entity;
        notificationType = NotificationType.EmailNotification;
      }
    }
  }
  else {
    if (activity.name && activity.name.toLowerCase() === AGENT_LIFECYCLE){
      notificationType = NotificationType.AgentLifecycleNotification;
    }
  }

  return {
    wpxCommentNotification,
    emailNotification,
    notificationType,
    conversation: activity.conversation,
    from: activity.from ?? {},
    recipient: activity.recipient ?? {},
    channelData: activity.channelData ?? {},
    text: activity.text ?? '',
    valueType: activity.valueType ?? '',
    value: activity.value ?? {}
  };
}