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

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details
