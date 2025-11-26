# Running Unit Tests for Agent365-nodejs SDK

This guide covers setting up and running tests.

---

## Prerequisites

### 1. Install Node.js

Ensure Node.js 18 or higher is installed:

```powershell
node --version  # Should be 18.x or higher
```

### 2. Install pnpm

```powershell
# Install pnpm globally
npm install -g pnpm

# Verify installation
pnpm --version
```

### 3. Install Dependencies

```powershell
# From repository root
pnpm install

# Build all packages (required before running tests)
pnpm build
```

---

## Test Structure

> **Note:** This structure will be updated as new tests are added.

```plaintext
tests/
├── runtime/                           # Runtime tests
├── observability/                     # Observability tests
├── tooling/                           # Tooling tests
└── notifications/                     # Notifications tests
```

---

## Running Tests in VS Code (Optional)

### Test Explorer

1. Install the Jest extension (Orta.vscode-jest)
2. Click the beaker icon in the Activity Bar or press `Ctrl+Shift+P` → "Test: Focus on Test Explorer View"
3. Click the play button to run tests (all/folder/file/individual)
4. Right-click → "Debug Test" to debug with breakpoints

### Command Palette

- `Test: Run All Tests`
- `Test: Run Tests in Current File`
- `Test: Debug Tests in Current File`

---

## Running Tests from Command Line

```powershell
# Run all tests (from repository root)
pnpm test

# Or run from tests directory
cd tests
pnpm test

# Run specific test file
pnpm test -- runtime/power-platform-api-discovery.test.ts

# Run tests matching pattern
pnpm test -- --testPathPattern=observability

# Run with options
pnpm test -- --verbose                  # Verbose output
pnpm test -- --bail                     # Stop on first failure
pnpm test -- --testNamePattern="should return"  # Pattern matching
pnpm test -- --onlyFailures             # Re-run only failed tests
pnpm test -- --watch                    # Watch mode
```

---

## Generating Reports

### Coverage Reports

```powershell
# Generate coverage report (from repository root)
pnpm test -- --coverage

# Or from tests directory
cd tests
pnpm test -- --coverage

# Generate HTML coverage report
pnpm test -- --coverage --coverageReporters=html

# View HTML report
start coverage\index.html

# Generate multiple report formats
pnpm test -- --coverage --coverageReporters=html --coverageReporters=text --coverageReporters=lcov
```

### CI/CD Reports

```powershell
# XML reports for CI/CD pipelines
pnpm test -- --coverage --coverageReporters=cobertura --coverageReporters=json

# View reports
start coverage\cobertura-coverage.xml
start coverage\coverage-final.json
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **Test loading failed** | Run `pnpm install` and `pnpm build`, restart VS Code |
| **Error: Cannot find module** | Run `pnpm build` from repository root |
| **'jest' is not recognized** | Run tests using `pnpm test` instead |
| **Tests not discovered in VS Code** | Check `.vscode/settings.json`, reload window |
| **TypeScript errors in tests** | Ensure all packages are built: `pnpm build` |

### Fix Steps

If tests fail to discover or import errors occur:

**1. Clean and reinstall dependencies**

```powershell
# From repository root
pnpm clean  # If available, or manually delete node_modules
pnpm install
```

**2. Build all packages**

```powershell
# From repository root
pnpm build
```

**3. Clear Jest cache**

```powershell
pnpm test -- --clearCache
```

**4. Restart VS Code**

- Close VS Code completely
- Reopen the workspace
- Run "Developer: Reload Window" command (`Ctrl+Shift+P`)
- Wait for Jest extension to reload

### VS Code Jest Configuration

If Test Explorer doesn't work, ensure `.vscode/settings.json` exists:

```json
{
  "jest.rootPath": "tests",
  "jest.jestCommandLine": "pnpm test --",
  "jest.autoRun": {
    "watch": true,
    "onStartup": ["all-tests"]
  }
}
```

**Note:** The `tests/jest.config.json` file is automatically used by Jest when you run tests from the `tests/` directory. No additional configuration is needed.
