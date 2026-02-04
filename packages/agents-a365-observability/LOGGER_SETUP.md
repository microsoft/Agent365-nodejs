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

### 4. Works Automatically
```typescript
import { logger } from '@microsoft/agents-a365-observability';

// Uses the default logger automatically - no setup needed
logger.info('message');   // Logged if A365_OBSERVABILITY_LOG_LEVEL includes 'info'
logger.warn('warning');   // Logged if A365_OBSERVABILITY_LOG_LEVEL includes 'warn'
logger.error('error');    // Logged if A365_OBSERVABILITY_LOG_LEVEL includes 'error'
logger.event('my-event', true, 150); // Log event with name, success status, and duration (ms)
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
import { Builder } from '@microsoft/agents-a365-observability';
import type { ILogger } from '@microsoft/agents-a365-observability';

// Create your custom logger
const myLogger: ILogger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  event: (name, success, duration) => {
    const status = success ? 'succeeded' : 'failed';
    console.log(`[EVENT] ${name} ${status} in ${duration}ms`);
  }
};

new Builder()
  .withService('my-agent', '1.0.0')
  .withCustomLogger(myLogger)
  .build();
```

### Event Logging

The logger also supports event logging with success status and duration:

```typescript
// Log event with success and duration
logger.event('export-operation', true, 1250);  // Outputs: "Event: export-operation succeeded in 1250ms"
logger.event('export-operation', false, 1250); // Outputs: "Event: export-operation failed in 1250ms"
```

### Option 2: Your Existing Logger

```typescript
import { Builder } from '@microsoft/agents-a365-observability';
import { myExistingLogger } from './logging';

new Builder()
  .withService('my-agent', '1.0.0')
  .withCustomLogger({
    info: (msg, ...args) => myExistingLogger.info(msg, ...args),
    warn: (msg, ...args) => myExistingLogger.warn(msg, ...args),
    error: (msg, ...args) => myExistingLogger.error(msg, ...args)
  })
  .build();
```

## Selective Logging (Log Only Specific Levels)

### Warn Only

```typescript
import { Builder, ConsoleLogger } from '@microsoft/agents-a365-observability';

new Builder()
  .withService('my-agent', '1.0.0')
  .withCustomLogger(new ConsoleLogger('[A365]', false, true, false))
  .build();

// Constructor: ConsoleLogger(prefix, enableInfo, enableWarn, enableError)
```

### Error Only

```typescript
new ConsoleLogger('[A365]', false, false, true)
```

### Info Only

```typescript
new ConsoleLogger('[A365]', true, false, false)
```

### Custom Logic (Filter by Content)

```typescript
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
    error: (msg, ...args) => console.error(msg, ...args)
  })
  .build();
```

## Production Setup: Route to Logging Service

### Application Insights

```typescript
import { Builder } from '@microsoft/agents-a365-observability';
import { appInsights } from './monitoring';

new Builder()
  .withService('my-agent', '1.0.0')
  .withCustomLogger({
    info: (msg, ...args) => appInsights.trackTrace(msg, 1, { args }),
    warn: (msg, ...args) => appInsights.trackTrace(msg, 2, { args }),
    error: (msg, ...args) => appInsights.trackTrace(msg, 3, { args })
  })
  .build();
```

### Winston Logger

```typescript
import * as winston from 'winston';
import { Builder } from '@microsoft/agents-a365-observability';

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
    error: (msg, ...args) => logger.error(msg, ...args)
  })
  .build();
```

### Custom Service

```typescript
new Builder()
  .withService('my-agent', '1.0.0')
  .withCustomLogger({
    info: (msg, ...args) => myLoggingService.send('info', msg, args),
    warn: (msg, ...args) => myLoggingService.send('warn', msg, args),
    error: (msg, ...args) => {
      myLoggingService.send('error', msg, args);
      alertingService.notify(msg);  // Alert on errors
    }
  })
  .build();
```

## Runtime Configuration

Change logger at any point in your application:

```typescript
import { setLogger } from '@microsoft/agents-a365-observability';

// Production: verbose logging
if (process.env.NODE_ENV === 'production') {
  setLogger({
    info: (msg, ...args) => console.log(`[Prod-INFO] ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[Prod-WARN] ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[Prod-ERROR] ${msg}`, ...args)
  });
}

// Development: selective logging (warn and error only)
if (process.env.NODE_ENV === 'development') {
  setLogger({
    info: () => {},
    warn: (msg, ...args) => console.warn(`[Dev-WARN] ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[Dev-ERROR] ${msg}`, ...args)
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
**Event:** Export operations (with success/failure status and duration)

### Event Logging in Agent365Exporter

The `Agent365Exporter` logs events at multiple levels using standardized event names from `ExporterEventNames`:

1. **Overall Export Event** (`EXPORT`) - for the entire batch export operation:
   ```
   Event: agent365-export succeeded in 2500ms
   Event: agent365-export failed in 2500ms
   ```

2. **Group Export Events** (`EXPORT_GROUP`) - for each tenant/agent group:
   ```
   Event: export-group-tenant-123-agent-456 succeeded in 1200ms
   Event: export-group-tenant-123-agent-456 failed in 1200ms
   ```

3. **Skip Span Events** (`SKIP_SPAN_MISSING_IDENTITY`) - when spans are skipped during partitioning:
   ```
   Event: export-partition-span-by-identity failed in 0ms
   ```

### ExporterEventNames Constants

The exporter uses standardized event name constants for consistency:

```typescript
import { ExporterEventNames } from '@microsoft/agents-a365-observability';

// Available event names:
ExporterEventNames.EXPORT                    // 'agent365-export'
ExporterEventNames.EXPORT_GROUP              // 'export-group' (use with tenant/agent ID)
ExporterEventNames.SKIP_SPAN_MISSING_IDENTITY // 'export-partition-span-by-identity'
```

## API Reference

```typescript
// Interface
export interface ILogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  event(name: string, success: boolean, duration: number): void;
}

// Classes
export class ConsoleLogger implements ILogger {
  constructor(
    prefix?: string,
    useConsoleLog?: boolean,
    useConsoleWarn?: boolean,
    useConsoleError?: boolean
  )
}

// Functions (internal use)
export function setLogger(customLogger: ILogger): void;
export function getLogger(): ILogger;
export function resetLogger(): void;

// Builder method
builder.withCustomLogger(customLogger: ILogger): Builder;
```

