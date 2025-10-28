# GitHub Copilot Instructions for Agent365-nodejs

## Code Review Rules

### Rule 1: Check for "Kairo" Keyword
- **Description**: Scan code for any occurrence of the keyword "Kairo"
- **Action**: If "Kairo" is found in any code file:
  - Flag it for review
  - Suggest removal or replacement with appropriate terminology
  - Check if it's a legacy reference that needs to be updated
- **Files to check**: All `.js`, `.ts`, `.jsx`, `.tsx` files in the repository

### Rule 2: Verify Copyright Headers
- **Description**: Ensure all JavaScript and TypeScript files have proper Microsoft copyright headers
- **Action**: If a source file is missing a copyright header:
  - Add the Microsoft copyright header at the top of the file
  - The header should be placed before any imports or code
  - Maintain proper formatting and spacing

#### Required Copyright Header Format
```javascript
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
```

Or for multi-line format:
```javascript
/**
 * Copyright (c) Microsoft Corporation.
 * Licensed under the MIT License.
 */
```

### Implementation Guidelines

#### When Reviewing Code:
1. **Kairo Check**:
   - Search for case-insensitive matches of "Kairo"
   - Review context to determine if it's:
     - A variable name
     - A comment reference
     - An import statement
     - A string literal
     - A type definition
   - Suggest appropriate alternatives based on the context

2. **Header Check**:
   - Verify the first non-empty, non-shebang lines of source files
   - If missing, prepend the copyright header
   - Ensure there's a blank line after the header before other content
   - Do not add headers to:
     - `index.js` or `index.ts` files that are intentionally empty barrel exports
     - Generated files (if marked as such)
     - Declaration files (`.d.ts`) that are auto-generated

#### Example of Proper File Structure (JavaScript/TypeScript):
```typescript
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Something } from './something';
import * as fs from 'fs';

/**
 * Class documentation
 */
export class MyClass {
  // Rest of the code...
}
```

#### Example with JSDoc:
```javascript
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * @fileoverview Module description
 * @module MyModule
 */

const express = require('express');

// Rest of the code...
```

### Auto-fix Behavior
When Copilot detects violations:
- **Kairo keyword**: Suggest inline replacement or flag for manual review
- **Missing header**: Automatically suggest adding the copyright header

### Exclusions
- Test files in `tests/`, `test/`, `__tests__/`, or `*.test.ts`, `*.spec.ts` files may have relaxed header requirements (but headers are still recommended)
- Third-party code or vendored dependencies should not be modified
- Configuration files (`.json`, `.yaml`, `.yml`, `.md`) do not require copyright headers
- Build output or `dist/` directories
- `node_modules/` directory
