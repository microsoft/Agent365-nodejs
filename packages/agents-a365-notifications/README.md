# @microsoft/agents-a365-notifications

[![npm](https://img.shields.io/npm/v/@microsoft/agents-a365-notifications?label=npm&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-notifications)
[![npm Downloads](https://img.shields.io/npm/dm/@microsoft/agents-a365-notifications?label=Downloads&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-notifications)

Agent notification services and models for handling user notifications in Microsoft Agents A365 applications. This package provides type-safe notification handling for email, Word comments, and other collaboration scenarios.

## Installation

```bash
npm install @microsoft/agents-a365-notifications
```

## Usage

### Basic Notification Handling

```typescript
import {
  AgentNotificationActivity,
  NotificationType
} from '@microsoft/agents-a365-notifications';

// Handle agent notifications
app.messageExtension('agentNotifications', async (context, activity) => {
  const notificationActivity = activity as AgentNotificationActivity;
  
  if (notificationActivity.notificationType === NotificationType.EmailNotification) {
    const email = notificationActivity.emailNotification;
    console.log(`Email from: ${email?.id}`);
    console.log(`Body: ${email?.htmlBody}`);
  }
  
  if (notificationActivity.notificationType === NotificationType.WpxComment) {
    const comment = notificationActivity.wpxCommentNotification;
    console.log(`Document: ${comment?.documentId}`);
    console.log(`Comment: ${comment?.initiatingCommentId}`);
  }
});
```

### Email Response

```typescript
import { EmailResponse } from '@microsoft/agents-a365-notifications';

// Send email response
const response: EmailResponse = {
  type: 'emailResponse',
  htmlBody: '<p>Thank you for your message!</p>'
};

await context.sendActivity({ type: 'message', value: response });
```

## Support

For issues, questions, or feedback:

- File issues in the [GitHub Issues](https://github.com/microsoft/Agent365-nodejs/issues) section
- See the [main documentation](../../README.md) for more information

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details.

const app = new AgentApplication<TurnState>();

app.onAgentNotification('*', async (context, state, notification) => {
  switch (notification.notificationType) {
    case NotificationType.EmailNotification:
      console.log('Email notification:', notification.emailNotification);
      break;
    case NotificationType.WpxComment:
      console.log('Word comment:', notification.wpxCommentNotification);
      break;
  }
});
```

### Email-Specific Notifications

Handle only email notifications:

```typescript
import { createEmailResponse } from '@microsoft/agents-a365-notifications';

app.onAgenticEmailNotification(async (context, state, notification) => {
  const email = notification.emailNotification;

  if (!email) {
    await context.sendActivity('No email found');
    return;
  }

  // Process the email
  console.log('Email ID:', email.id);
  console.log('Conversation ID:', email.conversationId);

  // Send a response
  const response = createEmailResponse('<p>Thank you for your email!</p>');
  await context.sendActivity({
    type: 'message',
    entities: [response],
  });
});
```

### Word Document Notifications

Handle Word document comment notifications:

```typescript
import '@microsoft/agents-a365-notifications';

app.onAgenticWordNotification(async (context, state, notification) => {
  const comment = notification.wpxCommentNotification;

  if (!comment) {
    await context.sendActivity('No comment found');
    return;
  }

  console.log('Document ID:', comment.documentId);
  console.log('Comment ID:', comment.initiatingCommentId);

  // Respond to the comment
  await context.sendActivity({
    type: 'message',
    text: 'Thank you for your comment!',
  });
});
```

### Excel and PowerPoint Notifications

```typescript
import '@microsoft/agents-a365-notifications';

app.onAgenticExcelNotification(async (context, state, notification) => {
  // Handle Excel notifications
  console.log('Excel notification received');
});

app.onAgenticPowerPointNotification(async (context, state, notification) => {
  // Handle PowerPoint notifications
  console.log('PowerPoint notification received');
});
```

### Advanced: Custom Options

All notification handlers support custom options:

```typescript
import '@microsoft/agents-a365-notifications';

app.onAgentNotification(
  '*'
  async (context, state, notification) => {
    // Handler logic
  },
  {
    subChannelId: 'email', // or '*' for all
    rank: 100, // Route priority (lower = higher priority)
    autoSignInHandlers: ['agentic'], // Auto sign-in configuration
  }
);
```

## Type Guards and Factory Functions

### Type Guards

```typescript
import { isEmailReference, isWpxComment } from '@microsoft/agents-a365-notifications';

if (isEmailReference(entity)) {
  // TypeScript knows this is EmailReference
  console.log(entity.id);
}

if (isWpxComment(entity)) {
  // TypeScript knows this is WpxComment
  console.log(entity.documentId);
}
```

### Factory Functions

```typescript
import {
  createEmailReference,
  createEmailResponse,
  createWpxComment
} from '@microsoft/agents-a365-notifications';

// Create entities
const email = createEmailReference('email-id', 'conv-id', '<p>Body</p>');
const response = createEmailResponse('<p>Response body</p>');
const comment = createWpxComment('odata-id', 'doc-id', 'comment-id');
```

## Complete Example

```typescript
import { AgentApplication, TurnState } from '@microsoft/agents-hosting';
import {
  NotificationType,
  createEmailResponse,
} from '@microsoft/agents-a365-notifications';

const app = new AgentApplication<TurnState>();

app.onAgentNotification(
  '*',
  async (context, state, notification) => {
    const { notificationType, emailNotification, wpxCommentNotification } = notification;

    switch (notificationType) {
      case NotificationType.EmailNotification:
        if (!emailNotification) break;

        // Process email
        const emailResponse = await processEmail(emailNotification);

        // Send response
        const response = createEmailResponse(emailResponse);
        await context.sendActivity({
          type: 'message',
          entities: [response],
        });
        break;

      case NotificationType.WpxComment:
        if (!wpxCommentNotification) break;

        // Process Word comment
        const commentResponse = await processComment(wpxCommentNotification);

        // Send response
        await context.sendActivity({
          type: 'message',
          text: commentResponse,
        });
        break;

      default:
        await context.sendActivity('Unknown notification type');
    }
  },
  {
    rank: 100,
    autoSignInHandlers: ['agentic'],
  }
);

async function processEmail(email: EmailReference): Promise<string> {
  // Your email processing logic
  return `<p>Processed email ${email.id}</p>`;
}

async function processComment(comment: WpxComment): Promise<string> {
  // Your comment processing logic
  return `Processed comment on document ${comment.documentId}`;
}
```

## Migration from Legacy API

If you're using the legacy `AddRoute` and `OnAgentNotification` functions, they are still available but deprecated:

```typescript
// Legacy (deprecated)
import { AddRoute, OnAgentNotification } from '@microsoft/agents-a365-notifications';

OnAgentNotification(app, '*', async (context, state) => {
  // Handler logic
});

// New approach (recommended)
import '@microsoft/agents-a365-notifications';

app.onAgentNotification('*', async (context, state, notification) => {
  // Handler with typed notification
});
```

## Constants

```typescript
export const AGENTS_CHANNEL = 'agents';
export const AGENTS_EMAIL_SUBCHANNEL = 'email';
export const AGENTS_EXCEL_SUBCHANNEL = 'excel';
export const AGENTS_WORD_SUBCHANNEL = 'word';
export const AGENTS_POWERPOINT_SUBCHANNEL = 'powerpoint';
```

## License

See the main repository license file.

## Contributing

Contributions are welcome! Please see the main repository for contribution guidelines.
