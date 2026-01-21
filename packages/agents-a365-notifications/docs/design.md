# Notifications - Design Document

This document describes the architecture and design of the `@microsoft/agents-a365-notifications` package.

## Overview

The notifications package provides agent notification and lifecycle event handling for Microsoft 365 workloads. It extends the `AgentApplication` class with methods to handle notifications from Email, Word, Excel, PowerPoint, and agent lifecycle events.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   @microsoft/agents-hosting                      │
│                      AgentApplication                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                    (extends via prototype)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               Notification Extension Methods                     │
│                                                                  │
│  onAgentNotification()     onAgenticEmailNotification()         │
│  onAgenticWordNotification()  onAgenticExcelNotification()      │
│  onAgenticPowerPointNotification()  onLifecycleNotification()   │
│  onAgenticUserCreatedNotification()  ...                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 AgentNotificationHandler                         │
│    (turnContext, turnState, agentNotificationActivity) => void  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### Extension Methods ([agent-notification.ts](../src/agent-notification.ts))

The package extends `AgentApplication` with notification handlers:

```typescript
import '@microsoft/agents-a365-notifications';
import { AgentApplication } from '@microsoft/agents-hosting';

const app = new AgentApplication();

// Handle all agent notifications
app.onAgentNotification('agents:email', async (turnContext, turnState, notification) => {
  console.log('Received notification:', notification.notificationType);
});

// Handle email notifications specifically
app.onAgenticEmailNotification(async (turnContext, turnState, notification) => {
  const emailRef = notification.emailReference;
  console.log(`Email from: ${emailRef?.from}`);
  console.log(`Subject: ${emailRef?.subject}`);
});

// Handle Word document notifications
app.onAgenticWordNotification(async (turnContext, turnState, notification) => {
  const comment = notification.wpxComment;
  console.log(`Comment: ${comment?.comment}`);
});

// Handle Excel notifications
app.onAgenticExcelNotification(async (turnContext, turnState, notification) => {
  // Handle Excel-specific notification
});

// Handle PowerPoint notifications
app.onAgenticPowerPointNotification(async (turnContext, turnState, notification) => {
  // Handle PowerPoint-specific notification
});

// Handle all lifecycle events
app.onLifecycleNotification(async (turnContext, turnState, notification) => {
  console.log('Lifecycle event:', notification.notificationType);
});

// Handle specific lifecycle events
app.onAgenticUserCreatedNotification(async (turnContext, turnState, notification) => {
  console.log('User identity created');
});

app.onAgenticUserWorkloadOnboardingNotification(async (turnContext, turnState, notification) => {
  console.log('User workload onboarding updated');
});

app.onAgenticUserDeletedNotification(async (turnContext, turnState, notification) => {
  console.log('User deleted');
});
```

### AgentNotificationHandler Type ([agent-notification-handler.ts](../src/extensions/agent-notification-handler.ts))

```typescript
type AgentNotificationHandler<TState extends TurnState = TurnState> = (
  turnContext: TurnContext,
  turnState: TState,
  agentNotificationActivity: AgentNotificationActivity
) => Promise<void>;
```

### Constants ([constants.ts](../src/constants.ts))

**Channel Constants:**

| Constant | Value | Purpose |
|----------|-------|---------|
| `AGENTS_CHANNEL` | `agents` | Base channel prefix |
| `AGENTS_EMAIL_SUBCHANNEL` | `agents:email` | Email notifications |
| `AGENTS_EXCEL_SUBCHANNEL` | `agents:excel` | Excel notifications |
| `AGENTS_WORD_SUBCHANNEL` | `agents:word` | Word notifications |
| `AGENTS_POWERPOINT_SUBCHANNEL` | `agents:powerpoint` | PowerPoint notifications |

**Lifecycle Constants:**

| Constant | Value | Purpose |
|----------|-------|---------|
| `AGENT_LIFECYCLE` | `agentlifecycle` | Lifecycle event activity name |
| `USER_CREATED_LIFECYCLE_EVENT` | `agenticuseridentitycreated` | User creation event |
| `USER_WORKLOAD_ONBOARDING_LIFECYCLE_EVENT` | `agenticuserworkloadonboardingupdated` | User onboarding event |
| `USER_DELETED_LIFECYCLE_EVENT` | `agenticuserdeleted` | User deletion event |

## Data Models

### AgentNotificationActivity

Wrapper for notification activity with typed notification data:

```typescript
interface AgentNotificationActivity {
  activity: Activity;
  notificationType: NotificationType;
  emailReference?: EmailReference;
  emailResponse?: EmailResponse;
  wpxComment?: WPXComment;
}
```

### NotificationType ([notification-type.ts](../src/models/notification-type.ts))

```typescript
enum NotificationType {
  Email = 'Email',
  Word = 'Word',
  Excel = 'Excel',
  PowerPoint = 'PowerPoint',
  Lifecycle = 'Lifecycle',
  Unknown = 'Unknown'
}
```

### EmailReference ([email-reference.ts](../src/models/email-reference.ts))

```typescript
interface EmailReference {
  messageId?: string;
  from?: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  receivedDateTime?: string;
  bodyPreview?: string;
  webLink?: string;
}
```

### WPXComment ([wpx-comment.ts](../src/models/wpx-comment.ts))

Used for Word, PowerPoint, and Excel comment notifications:

```typescript
interface WPXComment {
  comment?: string;
  documentId?: string;
  documentName?: string;
  webLink?: string;
  author?: string;
  createdDateTime?: string;
}
```

## Design Patterns

### Extension Methods Pattern

The package uses TypeScript declaration merging to extend `AgentApplication`:

```typescript
// Declare the interface extension
declare module '@microsoft/agents-hosting' {
  interface AgentApplication<TState extends TurnState> {
    onAgenticEmailNotification(
      routeHandler: AgentNotificationHandler<TState>,
      rank?: number,
      autoSignInHandlers?: string[]
    ): void;
  }
}

// Implement via prototype
AgentApplication.prototype.onAgenticEmailNotification = function(...) { ... };
```

### Route Selector Pattern

Each notification handler uses a selector function to filter activities:

```typescript
const routeSelector: Selector = async (turnContext) => {
  const activity = turnContext.activity;

  // Check for agentic channel
  if (!activity.channelId?.toLowerCase().startsWith('agents')) {
    return false;
  }

  // Check for specific subchannel
  if (activity.channelId.toLowerCase() !== channelId.toLowerCase()) {
    return false;
  }

  return true;
};
```

### Agentic Request Filtering

All notification handlers verify the request is from an agentic source:

```typescript
function isAgenticRequest(turnContext: TurnContext): boolean {
  const role = turnContext.activity?.recipient?.role;
  return role === 'agenticAppInstance' || role === 'agenticUser';
}
```

## File Structure

```
src/
├── index.ts                              # Public API exports
├── agent-notification.ts                 # Extension methods implementation
├── constants.ts                          # Channel and lifecycle constants
├── extensions/
│   ├── index.ts                          # Extension exports
│   └── agent-notification-handler.ts     # Handler type definition
└── models/
    ├── index.ts                          # Model exports
    ├── notification-type.ts              # NotificationType enum
    ├── agent-notification-activity.ts    # Activity wrapper
    ├── email-reference.ts                # Email notification model
    ├── email-response.ts                 # Email response model
    └── wpx-comment.ts                    # Word/PowerPoint/Excel comment model
```

## Usage Examples

### Email Notification Handler

```typescript
app.onAgenticEmailNotification(async (turnContext, turnState, notification) => {
  const email = notification.emailReference;

  if (email) {
    console.log(`New email from: ${email.from}`);
    console.log(`Subject: ${email.subject}`);
    console.log(`Preview: ${email.bodyPreview}`);

    // Process the email
    await processEmail(email);

    // Send response
    await turnContext.sendActivity(`Processed email: ${email.subject}`);
  }
});
```

### Lifecycle Event Handler

```typescript
app.onAgenticUserCreatedNotification(async (turnContext, turnState, notification) => {
  // User identity was created - initialize user state
  const activity = notification.activity;
  const userId = activity.from?.id;

  await initializeUserState(userId);
  console.log(`Initialized state for user: ${userId}`);
});
```

### Generic Channel Handler

```typescript
// Handle all notifications from a specific channel
app.onAgentNotification('agents:email', async (turnContext, turnState, notification) => {
  switch (notification.notificationType) {
    case NotificationType.Email:
      // Handle email
      break;
    default:
      console.log('Unknown notification type');
  }
});

// Handle all agentic notifications with wildcard
app.onAgentNotification('agents:*', async (turnContext, turnState, notification) => {
  console.log(`Received ${notification.notificationType} notification`);
});
```

## Dependencies

- `@microsoft/agents-hosting` - AgentApplication, TurnContext, TurnState
- `@microsoft/agents-a365-runtime` - Runtime utilities (internal)
- `@microsoft/agents-activity` - Activity types
