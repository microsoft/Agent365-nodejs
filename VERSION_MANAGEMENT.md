# Version Management - Local vs CI Builds

## Overview

The `setVersion.js` script supports two modes of operation to handle versioning appropriately for different build contexts.

## Build Modes

### 🏠 Local Development (Dry-Run Mode)

**When to use:** Building and testing locally

**Command:**
```bash
node setVersion.js --dry-run
# OR
node setVersion.js --local
# OR
npm run version:check
```

**What happens:**
- ✅ Calculates semantic version from git history
- ✅ Shows what version would be set
- ❌ Does NOT write to package.json files
- ❌ Does NOT modify any files on disk

**Why?**
- Prevents package.json changes from appearing in `git status`
- Keeps your working directory clean
- No accidental commits of auto-generated versions
- You can still see what version would be used

### 🏗️ CI/CD Builds (Write Mode)

**When to use:** During CI/CD pipeline for packaging and publishing

**Command:**
```bash
node setVersion.js
# OR
npm run version
```

**What happens:**
- ✅ Calculates semantic version from git history
- ✅ Updates root package.json
- ✅ Updates all packages/*/package.json files
- ✅ Synchronizes internal dependencies
- ✅ Files are written to disk for packaging

**Why?**
- Needed for `npm pack` to create packages with correct versions
- Required for publishing to npm registry
- Versions are in build artifacts, not source control

## Usage Examples

### Example 1: Local Build and Test

```bash
# Build packages
npm run build

# Check what version would be used (no file changes)
npm run version:check

# Run tests
npm test

# Your git status is still clean!
git status
# On branch feature/my-feature
# nothing to commit, working tree clean
```

### Example 2: Create Local Package for Testing

```bash
# Build packages
npm run build

# Set versions for packaging (will modify files)
npm run version

# Create tarballs
npm pack --workspaces

# Now you have versioned packages to test!
# But remember to reset before committing:
node resetVersion.js
```

### Example 3: CI Pipeline

```yaml
# .github/workflows/ci.yml
- name: Build
  run: npm run build

- name: Set Version
  run: node setVersion.js  # No --dry-run flag!

- name: Test
  run: npm test

- name: Package
  run: npm pack --workspaces
```

## Understanding Version Sources

### In Source Control (Git)

**Root package.json:**
```json
{
  "version": "0.1.0-preview.0"
}
```

**Package package.json:**
```json
{
  "name": "@microsoft/agents-a365-runtime",
  "version": "0.1.0-preview.0",
  "dependencies": {
    "@microsoft/agents-a365-notifications": "0.1.0-preview.0"
  }
}
```

**version.json:**
```json
{
  "version": "0.1.0-preview.{height}"
}
```

These are **static placeholders** that match the base version in `version.json`.

### During CI Build (After setVersion.js)

**Root package.json:**
```json
{
  "version": "0.1.0-preview.127"
}
```

**Package package.json:**
```json
{
  "name": "@microsoft/agents-a365-runtime",
  "version": "0.1.0-preview.127",
  "dependencies": {
    "@microsoft/agents-a365-notifications": "0.1.0-preview.127"
  }
}
```

These are **calculated versions** based on git commit height.

## Command Reference

| Command | Mode | Modifies Files | Use Case |
|---------|------|----------------|----------|
| `node setVersion.js` | Write | ✅ Yes | CI/CD builds |
| `node setVersion.js --dry-run` | Dry-run | ❌ No | Local development |
| `node setVersion.js --local` | Dry-run | ❌ No | Local builds |
| `npm run version` | Write | ✅ Yes | CI/CD pipeline |
| `npm run version:check` | Dry-run | ❌ No | Check version locally |
| `npm run version:local` | Dry-run | ❌ No | Local builds |
| `node setVersion.js --help` | Help | ❌ No | Show documentation |

## Flags

- `--dry-run` / `-d` - Calculate versions without writing to disk
- `--local` / `-l` - Alias for --dry-run (for local development)
- `--help` / `-h` - Show help message

## Resetting Versions

If you accidentally ran `setVersion.js` without `--dry-run` and need to clean up:

```bash
# Reset all package.json files to base version
node resetVersion.js

# Check that versions are back to placeholder
git diff
```

## Best Practices

### ✅ Do's

- ✅ **Always use `--dry-run` for local builds**
- ✅ **Only run without flags in CI/CD**
- ✅ **Keep placeholder versions in source control**
- ✅ **Use `npm run version:check` to see calculated version**
- ✅ **Add `node setVersion.js` to CI after build**

### ❌ Don'ts

- ❌ **Don't commit auto-generated versions**
- ❌ **Don't run `setVersion.js` without flags locally**
- ❌ **Don't manually edit version in package.json**
- ❌ **Don't add package.json to .gitignore**

## Troubleshooting

### Problem: Modified package.json files in git status

```bash
# You ran: node setVersion.js
# Now git shows modified package.json files

# Solution: Reset versions
node resetVersion.js

# Or: Discard changes
git checkout -- package.json packages/*/package.json
```

### Problem: Can't tell what version will be used in CI

```bash
# Solution: Use dry-run mode
node setVersion.js --dry-run

# Output shows calculated version without modifying files
# 📦 Calculated version: 0.1.0-preview.127
```

### Problem: Need to create a local package with version

```bash
# Build first
npm run build

# Set version (will modify files temporarily)
node setVersion.js

# Create package
cd packages/agents-a365-runtime
npm pack

# Reset versions before committing
cd ../..
node resetVersion.js
```

## Integration with CI/CD

### GitHub Actions

```yaml
- name: Checkout with full history
  uses: actions/checkout@v4
  with:
    fetch-depth: 0  # Required for git versioning

- name: Install dependencies
  run: npm ci

- name: Build
  run: npm run build

- name: Set versions (CI mode)
  run: node setVersion.js  # No flags = write mode

- name: Test
  run: npm test

- name: Package
  run: npm pack --workspaces
```

### Azure DevOps

```yaml
- script: |
    npm ci
    npm run build
    node setVersion.js  # No flags for CI
    npm test
    npm pack --workspaces
  displayName: 'Build and Package'
```

## Summary

| Aspect | Local Development | CI/CD Build |
|--------|-------------------|-------------|
| **Command** | `--dry-run` / `--local` | No flags |
| **File Changes** | None | Yes |
| **Git Status** | Clean | Modified (build artifacts only) |
| **Purpose** | Development/Testing | Packaging/Publishing |
| **Version Committed** | Never | Never (only in artifacts) |

---

**Key Takeaway:** Use `--dry-run` locally to keep your git working directory clean, and let CI handle the actual version writing for packages.
