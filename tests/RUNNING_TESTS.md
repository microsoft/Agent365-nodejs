# Running Unit Tests for Agent365-nodejs SDK

---

## Prerequisites

1. **Node.js 18+**: `node --version`
2. **pnpm**: `npm install -g pnpm`
3. **Dependencies**: `pnpm install` (from repository root)
4. **Build packages**: `pnpm build` (required before running tests)

---

## Test Structure

```plaintext
tests/
├── runtime/           # Runtime tests
├── observability/     # Observability tests
├── tooling/          # Tooling tests
└── notifications/    # Notifications tests
```

---

## Running Tests

### Command Line

```powershell
# From repository root
pnpm test

# From tests directory
cd tests
pnpm test                              # All tests
pnpm test:verbose                      # Verbose output
pnpm test:watch                        # Watch mode
pnpm test:runtime                      # Runtime tests only
pnpm test:observability                # Observability tests only

# Run specific test file
pnpm test -- runtime/power-platform-api-discovery.test.ts

# Additional options
pnpm test -- --testPathPattern=observability
pnpm test -- --testNamePattern="should return"
pnpm test -- --bail                    # Stop on first failure
pnpm test -- --onlyFailures            # Re-run failed tests only
```

### VS Code Test Explorer (Optional)

1. Install Jest extension (Orta.vscode-jest)
2. Click beaker icon or `Ctrl+Shift+P` → "Test: Focus on Test Explorer View"
3. Click play button to run tests or right-click → "Debug Test"

---

## Coverage Reports

```powershell
cd tests

# Generate coverage reports
pnpm test:coverage                     # All formats
pnpm test:coverage:html                # HTML only
pnpm test:ci                           # CI mode

# View HTML report
start coverage\index.html              # Windows
open coverage/index.html               # Mac/Linux
```

**Report Formats**: HTML (`coverage/index.html`), LCOV (`lcov.info`), Cobertura (`cobertura-coverage.xml`)

---

## Troubleshooting

### Quick Fixes

| Issue | Solution |
|-------|----------|
| Test loading failed | `pnpm install && pnpm build`, restart VS Code |
| Cannot find module | `pnpm build` from repository root |
| Tests not discovered | Check `.vscode/settings.json`, reload window |

### Complete Reset

```powershell
# From repository root
pnpm install
pnpm build
pnpm test -- --clearCache

# Restart VS Code: Ctrl+Shift+P → "Developer: Reload Window"
```

### VS Code Configuration

Create `.vscode/settings.json` if Test Explorer doesn't work:

```json
{
  "jest.rootPath": "tests",
  "jest.jestCommandLine": "pnpm test",
  "jest.autoRun": "off"
}
```
