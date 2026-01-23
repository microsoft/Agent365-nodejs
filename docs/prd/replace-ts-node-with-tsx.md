# Product Requirements Document: Replace ts-node with tsx

## Document Information

| Field | Value |
|-------|-------|
| **Document Title** | Replace ts-node with tsx in Agent365-nodejs |
| **Author** | Engineering Team |
| **Created** | 2026-01-22 |
| **Status** | Draft |
| **Repository** | Agent365-nodejs |

---

## 1. Overview

This PRD outlines the replacement of the `ts-node` package with `tsx` in the Microsoft Agent 365 SDK Node.js repository. The change affects only test sample packages and does not impact the core SDK functionality. This migration addresses security concerns, improves developer experience through faster startup times, and aligns the repository with modern TypeScript execution tooling.

---

## 2. Problem Statement

### 2.1 Security Concerns

The `ts-node` package is no longer actively maintained and contains security vulnerabilities due to outdated dependencies. Continuing to use unmaintained packages in the repository, even in test samples, poses risks:

- **Transitive vulnerabilities**: Outdated dependencies may contain known CVEs
- **Supply chain risk**: Unmaintained packages are more susceptible to supply chain attacks
- **Compliance issues**: Security audits may flag the dependency as a concern

### 2.2 Developer Experience Issues

The current `ts-node` setup has several drawbacks:

- **Slow startup**: ts-node compiles TypeScript on every execution, adding latency to development workflows
- **Complex configuration**: Requires careful tsconfig.json coordination and sometimes additional flags
- **ESM compatibility issues**: ts-node has historically struggled with ESM module resolution

### 2.3 Current Usage Scope

The `ts-node` package is used in a limited, well-defined scope:

| Location | Usage |
|----------|-------|
| [pnpm-workspace.yaml:66](../../pnpm-workspace.yaml#L66) | Catalog entry: `"ts-node": "^10.9.2"` |
| [basic-agent-sdk-sample/package.json:9](../../tests-agent/basic-agent-sdk-sample/package.json#L9) | Dev script |
| [basic-agent-sdk-sample/package.json:34](../../tests-agent/basic-agent-sdk-sample/package.json#L34) | devDependency |
| [openai-agent-auto-instrument-sample/package.json:9](../../tests-agent/openai-agent-auto-instrument-sample/package.json#L9) | Dev script |
| [openai-agent-auto-instrument-sample/package.json:13](../../tests-agent/openai-agent-auto-instrument-sample/package.json#L13) | test:setup script |
| [openai-agent-auto-instrument-sample/package.json:54](../../tests-agent/openai-agent-auto-instrument-sample/package.json#L54) | devDependency |

**Important**: The Jest test framework uses `ts-jest`, which is a separate, actively maintained package and is **not affected** by this migration.

---

## 3. Goals

### 3.1 Primary Goals

1. **Eliminate security vulnerabilities** by removing the unmaintained `ts-node` package
2. **Improve developer experience** with faster TypeScript execution during development
3. **Maintain backward compatibility** ensuring all existing workflows continue to function
4. **Simplify configuration** by leveraging tsx's automatic tsconfig.json detection

### 3.2 Success Metrics

| Metric | Target |
|--------|--------|
| Direct ts-node usage in scripts/deps | 0 (excluding auto-generated lockfiles and historical documentation) |
| Sample package dev servers functional | 100% |
| Test suite pass rate | 100% (no regressions) |
| Dev server startup time improvement | >50% reduction |

---

## 4. Non-Goals

The following items are explicitly out of scope for this migration:

1. **Replacing ts-jest**: The Jest testing framework integration remains unchanged
2. **Modifying core SDK packages**: Only test sample packages are affected
3. **Changing build tooling**: The existing TypeScript build process (tsc) is unaffected
4. **Updating other development dependencies**: This PRD focuses solely on ts-node replacement
5. **Adding tsx to core SDK packages**: tsx is only needed for development-time TypeScript execution in samples

---

## 5. Requirements

### 5.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Remove all references to ts-node from the repository | P0 |
| FR-2 | Add tsx to the pnpm workspace catalog | P0 |
| FR-3 | Update basic-agent-sdk-sample to use tsx for development | P0 |
| FR-4 | Update openai-agent-auto-instrument-sample to use tsx for development | P0 |
| FR-5 | Update openai-agent-auto-instrument-sample test:setup script to use tsx | P0 |
| FR-6 | Ensure nodemon integration continues to work with tsx | P0 |

### 5.2 Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-1 | No changes to developer workflow (same npm scripts) | P0 |
| NFR-2 | Faster or equivalent dev server startup time | P1 |
| NFR-3 | Automatic tsconfig.json detection (no additional flags required) | P1 |
| NFR-4 | Full ESM compatibility maintained | P0 |

### 5.3 Compatibility Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| CR-1 | Compatible with Node.js >= 18.0.0 (existing requirement) | P0 |
| CR-2 | Compatible with pnpm 10.20.0+ workspace protocol | P0 |
| CR-3 | Compatible with existing nodemon configuration | P0 |

---

## 6. Technical Specification

### 6.1 Package Selection: tsx

**Package**: `tsx` (TypeScript Execute)
**Version**: `^4.21.0`
**npm**: https://www.npmjs.com/package/tsx
**GitHub**: https://github.com/privatenumber/tsx

#### 6.1.1 Why tsx?

| Criteria | tsx | ts-node |
|----------|-----|---------|
| Maintenance Status | Active (v4.21.0, November 2025) | Inactive |
| Weekly Downloads | 10.65M+ | Declining |
| GitHub Stars | 11.7k+ | Legacy |
| Startup Performance | Significantly faster startup (esbuild-based) | Slower (tsc) |
| ESM Support | Native, seamless | Requires configuration |
| Configuration | Zero-config (reads tsconfig.json) | Complex |
| Nodemon Compatibility | Drop-in replacement | Native |

#### 6.1.2 Industry Adoption

tsx is used by major organizations including:
- Microsoft
- Vercel
- Google
- OpenAI
- Anthropic

### 6.2 Migration Mapping

#### 6.2.1 Command Translation

| ts-node Command | tsx Equivalent |
|-----------------|----------------|
| `ts-node src/index.ts` | `tsx src/index.ts` |
| `ts-node --esm src/index.ts` | `tsx src/index.ts` |
| `nodemon --exec ts-node src/index.ts` | `nodemon --exec tsx src/index.ts` |

#### 6.2.2 File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `pnpm-workspace.yaml` | Modify | Replace ts-node catalog entry with tsx |
| `tests-agent/basic-agent-sdk-sample/package.json` | Modify | Update scripts and devDependencies |
| `tests-agent/openai-agent-auto-instrument-sample/package.json` | Modify | Update scripts and devDependencies |

---

## 7. Implementation Details

### 7.1 Step 1: Update pnpm Workspace Catalog

**File**: `pnpm-workspace.yaml`

**Before**:
```yaml
catalog:
  # ... other entries
  "ts-node": "^10.9.2"
```

**After**:
```yaml
catalog:
  # ... other entries
  "tsx": "^4.21.0"
```

### 7.2 Step 2: Update basic-agent-sdk-sample

**File**: `tests-agent/basic-agent-sdk-sample/package.json`

**Script Change**:
```json
// Before
"dev": "nodemon --watch src/*.ts --exec ts-node src/index.ts"

// After
"dev": "nodemon --watch src/*.ts --exec tsx src/index.ts"
```

**Dependency Change**:
```json
// Before (devDependencies)
"ts-node": "^10.9.2"

// After (devDependencies)
"tsx": "catalog:"
```

### 7.3 Step 3: Update openai-agent-auto-instrument-sample

**File**: `tests-agent/openai-agent-auto-instrument-sample/package.json`

**Script Changes**:
```json
// Before
"dev": "nodemon --watch src/*.ts --exec ts-node src/index.ts"
"test:setup": "ts-node ../../tests/integration/setup.ts"

// After
"dev": "nodemon --watch src/*.ts --exec tsx src/index.ts"
"test:setup": "tsx ../../tests/integration/setup.ts"
```

**Dependency Change**:
```json
// Before (devDependencies)
"ts-node": "catalog:"

// After (devDependencies)
"tsx": "catalog:"
```

### 7.4 Step 4: Install Dependencies

```bash
pnpm install
```

This will:
- Remove ts-node from node_modules
- Install tsx in the affected sample packages
- Update the pnpm-lock.yaml file

---

## 8. Verification Plan

### 8.1 Pre-Migration Checklist

- [ ] Document current behavior of sample dev servers
- [ ] Record baseline startup times for comparison
- [ ] Ensure all tests pass before migration

### 8.2 Post-Migration Verification

#### 8.2.1 Dependency Verification

```bash
# Verify tsx is installed
pnpm list tsx --depth=0

# Verify ts-node is completely removed
grep -r "ts-node" --include="*.json" --include="*.yaml" --include="*.yml" .
# Expected: No results
```

#### 8.2.2 Functional Verification

| Test | Command | Expected Result |
|------|---------|-----------------|
| basic-agent-sdk-sample dev server | `cd tests-agent/basic-agent-sdk-sample && pnpm dev` | Server starts successfully |
| openai-agent-auto-instrument-sample dev server | `cd tests-agent/openai-agent-auto-instrument-sample && pnpm dev` | Server starts successfully |
| openai-agent-auto-instrument-sample test setup | `cd tests-agent/openai-agent-auto-instrument-sample && pnpm test:setup` | Script executes successfully |

#### 8.2.3 Test Suite Verification

```bash
# Run unit tests
pnpm test

# Run integration tests
pnpm test:integration

# Run build
pnpm build
```

All tests must pass with no regressions.

### 8.3 Rollback Plan

If issues are discovered post-migration:

1. Revert changes to `pnpm-workspace.yaml`
2. Revert changes to both sample package.json files
3. Run `pnpm install` to restore ts-node
4. Document issues encountered for future resolution

---

## 9. Risk Assessment

### 9.1 Identified Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| tsx behavior differs from ts-node | Low | Medium | tsx is designed as drop-in replacement; test thoroughly |
| Nodemon integration issues | Low | Low | Well-documented compatibility; test dev workflow |
| tsconfig.json interpretation differences | Low | Medium | tsx reads tsconfig.json natively; verify compilation behavior |
| Breaking changes in tsx v4.x | Low | Medium | Pin to specific minor version; test before upgrading |

### 9.2 Impact Analysis

| Component | Impact Level | Notes |
|-----------|--------------|-------|
| Core SDK packages | None | No changes |
| Test framework (Jest/ts-jest) | None | Unaffected |
| CI/CD pipelines | Minimal | May need cache invalidation |
| Developer workflows | Positive | Faster startup, simpler config |
| Sample applications | Positive | Better performance, maintained tooling |

---

## 10. Success Criteria

The migration is considered successful when:

1. **Complete Removal**: No direct usage of `ts-node` exists in any `package.json` scripts or dependencies (excluding lockfiles and documentation)
2. **Functional Parity**: All sample dev servers start and operate correctly
3. **Test Integrity**: All unit and integration tests pass without modification
4. **Build Success**: `pnpm build` completes without errors
5. **Performance**: Dev server startup time is equal to or faster than before
6. **Documentation**: Any necessary documentation updates are complete

---

## 11. Timeline

| Phase | Activities |
|-------|------------|
| Implementation | Make file changes, run pnpm install |
| Verification | Execute verification plan, document results |
| Code Review | PR review and approval |
| Merge | Merge to main branch |

---

## 12. Dependencies

### 12.1 External Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| tsx | ^4.21.0 | TypeScript execution |
| pnpm | 10.20.0+ | Package management (existing) |
| Node.js | >= 18.0.0 | Runtime (existing requirement) |
| nodemon | existing | File watching (no change) |

### 12.2 Internal Dependencies

- No changes to internal package dependencies
- No changes to the dependency flow between SDK packages

---

## 13. Appendix

### A. Files Modified (Complete List)

1. `pnpm-workspace.yaml` - Line 66: Catalog entry update
2. `tests-agent/basic-agent-sdk-sample/package.json` - Lines 9, 34: Script and dependency update
3. `tests-agent/openai-agent-auto-instrument-sample/package.json` - Lines 9, 13, 54: Scripts and dependency update
4. `docs/prd/replace-ts-node-with-tsx.md` - New PRD document added
5. `pnpm-lock.yaml` - Lockfile updated to reflect dependency changes

### B. Reference Links

- tsx npm package: https://www.npmjs.com/package/tsx
- tsx GitHub repository: https://github.com/privatenumber/tsx
- esbuild (tsx underlying engine): https://esbuild.github.io/

### C. Related Documentation

- CLAUDE.md - Repository development guidelines
- docs/design.md - SDK architecture documentation

---

*Document Version: 1.0*
*Last Updated: 2026-01-22*
