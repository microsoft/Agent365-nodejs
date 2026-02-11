# Logger Configuration Guide

Complete guide for understanding and configuring logging in Agent 365 Observability SDK, including the default logger and custom logger options.



## Default Logger:

The SDK includes a **default logger** that is automatically active. Here's what it does:

### 1. Reads Environment Variable
On startup, it reads `A365_OBSERVABILITY_LOG_LEVEL` to determine which message levels to log:
- `none` - No logging (default)
- `info` - Log info messages only
- `warn` - Log warning messages only  
- `error` - Log error messages only
- `info|warn|error` - Log all levels (use pipe `|` to combine)

### 2. Filters Messages
Based on the environment variable, it decides which messages to output:

| Env Var | Info | Warn | Error |
|---------|------|------|-------|
| `none` | ❌ | ❌ | ❌ |
| `info` | ✅ | ❌ | ❌ |
| `warn\|error` | ❌ | ✅ | ✅ |
| `info\|warn\|error` | ✅ | ✅ | ✅ |

### 3. Outputs to Console
Filtered messages are sent to the appropriate console method:
- Info → `console.log('[INFO]', message)`
- Warn → `console.warn('[WARN]', message)`
- Error → `console.error('[ERROR]', message)`
- Event → `console.log('[EVENT]: eventType status in durationMs ms [message] [details]')`

### 4. Works Automatically
```typescript
import { logger } from '@microsoft/agents-a365-observability';

// Uses the default logger automatically - no setup needed
logger.info('message');   // Logged if A365_OBSERVABILITY_LOG_LEVEL includes 'info'
logger.warn('warning');   // Logged if A365_OBSERVABILITY_LOG_LEVEL includes 'warn'
logger.error('error');    // Logged if A365_OBSERVABILITY_LOG_LEVEL includes 'error'
logger.event(ExporterEventNames.EXPORT, true, 150, 'Operation completed', { correlationId: 'abc123' }); // Log event with enum type, success, duration, message, and details
```

## Default Logger Configuration

To control what the default logger outputs:

```bash
# No logging (default)
export A365_OBSERVABILITY_LOG_LEVEL=none

# Log all messages
export A365_OBSERVABILITY_LOG_LEVEL=info|warn|error

# Log only warnings and errors
export A365_OBSERVABILITY_LOG_LEVEL=warn|error

# Log only errors
export A365_OBSERVABILITY_LOG_LEVEL=error
```

**No code changes needed** - the default logger automatically reads the environment variable on startup.

## Quick Start: Use Custom Logger

### Your Custom Logger Implementation

```typescript
import { Builder, ExporterEventNames } from '@microsoft/agents-a365-observability';
import type { ILogger } from '@microsoft/agents-a365-observability';

// Create your custom logger
const myLogger: ILogger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  event: (eventType, success, duration, message, details) => {
    const status = success ? 'succeeded' : 'failed';
    const detailsStr = details ? JSON.stringify(details) : '';
    console.log(`[EVENT] ${eventType} ${status} in ${duration}ms ${message || ''} ${detailsStr}`);
  }
};

new Builder()
  .withService('my-agent', '1.0.0')
  .withCustomLogger(myLogger)
  .build();
```

### Event Logging

The logger supports event logging with the `ExporterEventNames` enum for type-safe event types:

```typescript
import { logger, ExporterEventNames } from '@microsoft/agents-a365-observability';

// Log event with success and duration
logger.event(ExporterEventNames.EXPORT, true, 1250);  // Outputs: "[EVENT]: agent365-export succeeded in 1250ms"
logger.event(ExporterEventNames.EXPORT, false, 1250); // Outputs: "[EVENT]: agent365-export failed in 1250ms"

// Log event with message
logger.event(ExporterEventNames.EXPORT, true, 1250, 'All spans exported');
// Outputs: "[EVENT]: agent365-export succeeded in 1250ms - All spans exported"

// Log event with details (e.g., correlationId, tenantId, agentId)
logger.event(ExporterEventNames.EXPORT_GROUP, true, 1250, 'Exported successfully', {
  correlationId: 'abc-123',
  tenantId: 'tenant-1',
  agentId: 'agent-1'
});
// Outputs: "[EVENT]: export-group succeeded in 1250ms - Exported successfully {"correlationId":"abc-123","tenantId":"tenant-1","agentId":"agent-1"}"
```

**Type Safety:** The `eventType` parameter uses the `ExporterEventNames` enum, providing compile-time type checking and ensuring only valid, low-cardinality event names are used. Available values:
- `ExporterEventNames.EXPORT` - Overall export batch operation
- `ExporterEventNames.EXPORT_GROUP` - Individual tenant/agent group export
- `ExporterEventNames.EXPORT_PARTITION_SPAN_MISSING_IDENTITY` - Spans skipped due to missing identity

### Option 2: Your Existing Logger

```typescript
import { Builder, ExporterEventNames } from '@microsoft/agents-a365-observability';
import { myExistingLogger } from './logging';

new Builder()
  .withService('my-agent', '1.0.0')
  .withCustomLogger({
    info: (msg, ...args) => myExistingLogger.info(msg, ...args),
    warn: (msg, ...args) => myExistingLogger.warn(msg, ...args),
    error: (msg, ...args) => myExistingLogger.error(msg, ...args),
    event: (eventType, success, duration, message, details) =>
      myExistingLogger.event(eventType, success, duration, message, details)
  })
  .build();
```

### Custom Logic (Filter by Content)

```typescript
import { ExporterEventNames } from '@microsoft/agents-a365-observability';

new Builder()
  .withService('my-agent', '1.0.0')
  .withCustomLogger({
    info: () => {},
    warn: (msg, ...args) => {
      // Only log specific warnings
      if (msg.includes('dropped') || msg.includes('overflow')) {
        console.warn(msg, ...args);
      }
    },
    error: (msg, ...args) => console.error(msg, ...args),
    event: (eventType, success, duration, message, details) => {
      if (!success) {
        const detailsStr = details ? JSON.stringify(details) : '';
        console.error(`[Event] ${eventType} failed in ${duration}ms ${message || ''} ${detailsStr}`);
      }
    }
  })
  .build();
```

## Production Setup: Route to Logging Service

### Application Insights

```typescript
import { Builder, ExporterEventNames } from '@microsoft/agents-a365-observability';
import { appInsights } from './monitoring';

new Builder()
  .withService('my-agent', '1.0.0')
  .withCustomLogger({
    info: (msg, ...args) => appInsights.trackTrace(msg, 1, { args }),
    warn: (msg, ...args) => appInsights.trackTrace(msg, 2, { args }),
    error: (msg, ...args) => appInsights.trackTrace(msg, 3, { args }),
    event: (eventType, success, duration, message, details) => {
      appInsights.trackEvent('agent-event', {
        eventType,
        success: String(success),
        duration,
        message: message || '',
        ...details
      });
    }
  })
  .build();
```

### Winston Logger

```typescript
import * as winston from 'winston';
import { Builder, ExporterEventNames } from '@microsoft/agents-a365-observability';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

new Builder()
  .withService('my-agent', '1.0.0')
  .withCustomLogger({
    info: (msg, ...args) => logger.info(msg, ...args),
    warn: (msg, ...args) => logger.warn(msg, ...args),
    error: (msg, ...args) => logger.error(msg, ...args),
    event: (eventType, success, duration, message, details) => {
      const status = success ? 'succeeded' : 'failed';
      logger.info(`Event: ${eventType} ${status} in ${duration}ms`, { message, ...details });
    }
  })
  .build();
```

### Custom Service

```typescript
import { ExporterEventNames } from '@microsoft/agents-a365-observability';

new Builder()
  .withService('my-agent', '1.0.0')
  .withCustomLogger({
    info: (msg, ...args) => myLoggingService.send('info', msg, args),
    warn: (msg, ...args) => myLoggingService.send('warn', msg, args),
    error: (msg, ...args) => {
      myLoggingService.send('error', msg, args);
      alertingService.notify(msg);  // Alert on errors
    },
    event: (eventType, success, duration, message, details) => {
      const eventData = { eventType, duration, message, ...details };
      myLoggingService.send(success ? 'event-success' : 'event-failure', JSON.stringify(eventData), []);
    }
  })
  .build();
```

## Runtime Configuration

Change logger at any point in your application:

```typescript
import { setLogger, ExporterEventNames } from '@microsoft/agents-a365-observability';

// Production: verbose logging
if (process.env.NODE_ENV === 'production') {
  setLogger({
    info: (msg, ...args) => console.log(`[Prod-INFO] ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[Prod-WARN] ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[Prod-ERROR] ${msg}`, ...args),
    event: (eventType, success, duration, message, details) => {
      const status = success ? 'succeeded' : 'failed';
      const detailsStr = details ? JSON.stringify(details) : '';
      console.log(`[Prod-EVENT] ${eventType} ${status} in ${duration}ms ${message || ''} ${detailsStr}`);
    }
  });
}

// Development: selective logging (warn and error only)
if (process.env.NODE_ENV === 'development') {
  setLogger({
    info: () => {},
    warn: (msg, ...args) => console.warn(`[Dev-WARN] ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[Dev-ERROR] ${msg}`, ...args),
    event: (eventType, success, duration, message, details) => {
      if (!success) {
        const detailsStr = details ? JSON.stringify(details) : '';
        console.warn(`[Dev-EVENT] ${eventType} failed in ${duration}ms ${message || ''} ${detailsStr}`);
      }
    }
  });
}
```

You can also reset to the default logger:

```typescript
import { resetLogger } from '@microsoft/agents-a365-observability';

// Reset to default logger (respects A365_OBSERVABILITY_LOG_LEVEL env var)
resetLogger();
```

## What Gets Logged

**Info:** Token resolution, export success, trace lifecycle
**Warn:** Dropped spans, max spans exceeded, buffer issues
**Error:** Export failures, auth failures, configuration errors
**Event:** Export operations (with success/failure status, duration, message, and contextual details)

### Event Logging in Agent365Exporter

The `Agent365Exporter` logs events using the `ExporterEventNames` enum for type-safe, low-cardinality event names:

```typescript
export enum ExporterEventNames {
  EXPORT = 'agent365-export',                               // Overall export batch operation
  EXPORT_GROUP = 'export-group',                            // Individual tenant/agent group export
  EXPORT_PARTITION_SPAN_MISSING_IDENTITY = 'export-partition-span-missing-identity'  // Spans skipped
}
```

Example usage:
```typescript
import { logger, ExporterEventNames } from '@microsoft/agents-a365-observability';

logger.event(
  ExporterEventNames.EXPORT_GROUP,
  true,
  1250,
  'Spans exported successfully',
  { tenantId: 'tenant-123', agentId: 'agent-456', correlationId: 'abc-xyz' }
);
```

The enum ensures compile-time type safety and prevents typos or invalid event names.

## API Reference

```typescript
// Enum for event types
export enum ExporterEventNames {
  EXPORT = 'agent365-export',
  EXPORT_GROUP = 'export-group',
  EXPORT_PARTITION_SPAN_MISSING_IDENTITY = 'export-partition-span-missing-identity'
}

// Interface
export interface ILogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  event(
    eventType: ExporterEventNames,
    isSuccess: boolean,
    durationMs: number,
    message?: string,
    details?: Record<string, string>
  ): void;
}

// Functions
export function setLogger(customLogger: ILogger): void;
export function getLogger(): ILogger;
export function resetLogger(): void;

// Builder method
builder.withCustomLogger(customLogger: ILogger): Builder;
```

