# How to Build Agent365 Node.js SDK

This guide provides instructions for building and developing the Agent365 Node.js SDK packages.

## Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **npm**: Latest version recommended
- **TypeScript**: Installed globally or via workspace dependencies

## Project Structure

The Agent365 Node.js SDK is organized as a monorepo with the following structure:

```
nodejs/
├── packages/                                         # Main SDK packages
│   ├── agents-a365-runtime/                          # @microsoft/agents-a365-runtime
│   ├── agents-a365-notifications/                    # @microsoft/agents-a365-notifications
│   ├── agents-a365-observability/                    # @microsoft/agents-a365-observability
│   ├── agents-a365-tooling/                          # @microsoft/agents-a365-tooling
│   ├── agents-a365-tooling-extensions-claude/        # @microsoft/agents-a365-tooling-extensions-claude
│   ├── agents-a365-tooling-extensions-langchain/     # @microsoft/agents-a365-tooling-extensions-langchain
│   └── agents-a365-tooling-extensions-openai/        # @microsoft/agents-a365-tooling-extensions-openai
├── samples/                                          # Sample applications
├── tests/                                            # Test suites
└── *.tgz                                             # Built package files (generated)
```

## Getting Started

### 1. Install Dependencies

Navigate to the `nodejs` directory and install all workspace dependencies:

```bash
cd nodejs
npm install
```

This command will:
- Install dependencies for all workspace packages
- Generate or update `package-lock.json` files
- Set up workspace linking between packages

**Alternative - Production Install:**
```bash
npm ci
```
Use `npm ci` for faster, deterministic installs in CI/CD environments or when you want to install exactly what's in the lock file.

### 2. Build All Packages

To build all SDK packages:

```bash
npm run build
```

To generate distributable `.tgz` files:

```bash
cd packages
npm run pack
```

This workflow will:
- First command: Compile TypeScript source code for all packages and generate JavaScript output in `dist/` folders
- Second command: Create `.tgz` package files in the `nodejs/` directory
- Make packages ready for distribution and installation in samples

**Generated Package Files:**
After building and packing, you'll find these `.tgz` files in the `nodejs/` directory:
- `microsoft-agents-a365-runtime-{version}.tgz`
- `microsoft-agents-a365-notifications-{version}.tgz`
- `microsoft-agents-a365-observability-{version}.tgz`
- `microsoft-agents-a365-tooling-{version}.tgz`
- `microsoft-agents-a365-tooling-extensions-claude-{version}.tgz`
- `microsoft-agents-a365-tooling-extensions-langchain-{version}.tgz`
- `microsoft-agents-a365-tooling-extensions-openai-{version}.tgz`

### 3. Clean Build Artifacts

To remove build artifacts and start fresh:

```bash
npm run clean
```

This command will:
- Remove all `dist/` folders from workspace packages

## Development Workflow

### Building Individual Packages

To build a specific package, navigate to its directory and run:

```bash
cd packages/agents-a365-observability
npm run build
```

### Watch Mode Development

For active development with automatic rebuilding:

```bash
cd packages/agents-a365-observability
npm run build:watch
```

### Installing Local Packages in Samples

After building and packing packages with `npm run build` and `npm pack --workspaces`, you can install them in sample applications:

```bash
cd samples/claude-code-sdk
npm install
```

The sample `package.json` files reference the local `.tgz` files from the `packages/` directory, so they'll use your locally built versions.

## Testing

### Run All Tests

```bash
cd tests
npm install
npm test
```

### Run Tests in Watch Mode

```bash
cd tests
npm run test:watch
```

## Linting and Code Quality

### Lint All Packages

```bash
npm run lint
```

### Fix Linting Issues

```bash
npm run lint:fix
```

## Common Build Scripts

The following npm scripts are available at the workspace root (`nodejs/`):

| Script | Description |
|--------|-------------|
| `npm run build` | Build all workspace packages |
| `npm run build:watch` | Build all packages in watch mode |
| `npm run clean` | Remove all build artifacts from packages |
| `npm run test` | Run tests for all packages |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint on all packages |
| `npm run lint:fix` | Fix ESLint issues in all packages |
| `npm run ci` | Run clean install on all packages |

## Troubleshooting

### Build Failures

If you encounter build errors:

1. **Clean and reinstall:**
   ```bash
   npm install
   npm run clean
   npm run build
   ```

2. **Check Node.js version:**
   ```bash
   node --version  # Should be 18.0.0 or higher
   ```

3. **Clear npm cache:**
   ```bash
   npm cache clean --force
   ```

### Package Resolution Issues

If samples can't find local packages:

1. Ensure packages are built: `npm run build`
2. Generate package files: `cd packages && npm pack --workspaces`
3. Check that `.tgz` files exist in `packages/` directory
4. Verify sample `package.json` references correct package versions

### TypeScript Compilation Errors

- Ensure all workspace dependencies are installed
- Check that TypeScript configuration is consistent across packages
- Verify that cross-package imports use correct module names

## Publishing (For Maintainers)

When ready to publish packages:

1. Update version numbers in all `package.json` files
2. Run full build and test suite: `npm run build && npm test`
3. Generate packages: `cd packages && npm pack --workspaces`
4. Publish individual packages to npm registry

## Additional Resources

- [Agent365 Documentation](../../README.md)
- [Sample Applications](../samples/)
- [Contributing Guidelines](../../CONTRIBUTING.md)
- [Security Policy](../../SECURITY.md)