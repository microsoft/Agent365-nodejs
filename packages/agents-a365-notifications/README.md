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
import { AgentApplication, TurnState } from '@microsoft/agents-hosting';
import '@microsoft/agents-a365-notifications'; // Import to extend AgentApplication
import {
  AgentNotificationActivity,
  NotificationType
} from '@microsoft/agents-a365-notifications';

const app = new AgentApplication<TurnState>();

// Handle all agent notifications
app.onAgentNotification('*', async (context, state, notification) => {
  if (notification.notificationType === NotificationType.EmailNotification) {
    const email = notification.emailNotification;
    console.log(`Email from: ${email?.id}`);
    console.log(`Body: ${email?.htmlBody}`);
  }
  
  if (notification.notificationType === NotificationType.WpxComment) {
    const comment = notification.wpxCommentNotification;
    console.log(`Document: ${comment?.documentId}`);
    console.log(`Comment: ${comment?.initiatingCommentId}`);
  }
});
```

### Email-Specific Notification Handler

```typescript
import { AgentApplication, TurnState } from '@microsoft/agents-hosting';
import '@microsoft/agents-a365-notifications';
import { createEmailResponse } from '@microsoft/agents-a365-notifications';

const app = new AgentApplication<TurnState>();

// Handle only email notifications
app.onAgenticEmailNotification(async (context, state, notification) => {
  const email = notification.emailNotification;
  
  if (email) {
    // Create and send email response
    const response = createEmailResponse('<p>Thank you for your message!</p>');
    await context.sendActivity({
      type: 'message',
      entities: [response]
    });
  }
});
```

## Support

For issues, questions, or feedback:

- File issues in the [GitHub Issues](https://github.com/microsoft/Agent365-nodejs/issues) section
- See the [main documentation](../../README.md) for more information

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details
