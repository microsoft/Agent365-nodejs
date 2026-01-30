// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

# Custom Logger Guide

Simple guide for configuring and using custom loggers in Agent 365 Observability SDK.

## ✅ Existing Code Still Works (100% Backward Compatible)

Your existing code requires **zero changes**:

```typescript
import { logger } from '@microsoft/agents-a365-observability';

logger.info('message');    // ✅ Works exactly as before
logger.warn('warning');    // ✅ Works exactly as before
logger.error('error');     // ✅ Works exactly as before
```

Environment variable still works:
```bash
export A365_OBSERVABILITY_LOG_LEVEL=info|warn|error  # Works as before
```

## Quick Start: Use Custom Logger

### Option 1: Console Logger (Simplest)

```typescript
import { Builder } from '@microsoft/agents-a365-observability';
import { ConsoleLogger } from 'agents-a365-observability/dist/utils/logging';

// Enable all console output
new Builder()
  .withService('my-agent', '1.0.0')
  .withCustomLogger(new ConsoleLogger('[MyApp]', true, true, true))
  .build();
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
import { Builder } from '@microsoft/agents-a365-observability';
import { ConsoleLogger } from 'agents-a365-observability/dist/utils/logging';

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
import { ConsoleLogger } from 'agents-a365-observability/dist/utils/logging';

// Production: verbose logging
if (process.env.NODE_ENV === 'production') {
  setLogger(new ConsoleLogger('[Prod]', true, true, true));
}

// Development: selective logging (warn and error only)
if (process.env.NODE_ENV === 'development') {
  setLogger(new ConsoleLogger('[Dev]', false, true, true));
}
```

## What Gets Logged

**Info:** Token resolution, export success, trace lifecycle  
**Warn:** Dropped spans, max spans exceeded, buffer issues  
**Error:** Export failures, auth failures, configuration errors

### Monitor These Messages

For production tracking:
- ✅ `"Successfully exported spans"` - Track export rate
- ❌ `"Failed to export spans"` - Track failures
- ✅ `"Token resolved successfully"` - Track auth success
- ❌ `"No token resolved"` - Track auth failures

## API Reference

```typescript
// Interface
export interface ILogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
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

## Import Notes

- `ILogger` interface is **not exported** from main package (keep custom loggers internal)
- `ConsoleLogger` and utility functions are **internal** to the observability package
- Import from: `'agents-a365-observability/dist/utils/logging'` for these internal utilities
- Only `logger` and `formatError` are part of the public API

## Summary

| Use Case | Solution |
|----------|----------|
| **Console logging with control** | `new ConsoleLogger('[AppName]', true, true, true)` |
| **Route to existing logger** | Custom object with 3 methods |
| **Warn only** | `new ConsoleLogger('[A365]', false, true, false)` |
| **Production monitoring** | Route to Application Insights/Winston/custom service |
| **Change at runtime** | `setLogger(...)` anywhere in code |
