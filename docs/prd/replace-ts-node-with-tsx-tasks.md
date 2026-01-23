# Implementation Tasks: Replace ts-node with tsx

**PRD Source**: [replace-ts-node-with-tsx.md](replace-ts-node-with-tsx.md)
**Generated**: 2026-01-22
**Repository**: Agent365-nodejs

---

## Overview

This task list implements the migration from `ts-node` to `tsx` in the Agent365-nodejs repository. The migration affects only test sample packages and does not impact core SDK functionality.

---

## Task List

### Phase 1: Preparation

| ID | Task | Priority | Dependencies | Status |
|----|------|----------|--------------|--------|
| **T1.1** | Document baseline: Record current dev server startup times for both sample packages | P1 | None | Pending |
| **T1.2** | Run existing test suite to confirm all tests pass pre-migration | P0 | None | Pending |
| **T1.3** | Run `pnpm build` to confirm build succeeds pre-migration | P0 | None | Pending |

---

### Phase 2: Core Implementation

| ID | Task | Priority | Dependencies | Status |
|----|------|----------|--------------|--------|
| **T2.1** | Update `pnpm-workspace.yaml`: Replace `"ts-node": "^10.9.2"` with `"tsx": "^4.21.0"` in the catalog section | P0 | T1.2, T1.3 | Pending |
| **T2.2** | Update `tests-agent/basic-agent-sdk-sample/package.json`: Change `dev` script from `ts-node` to `tsx` | P0 | T2.1 | Pending |
| **T2.3** | Update `tests-agent/basic-agent-sdk-sample/package.json`: Change devDependency from `"ts-node": "^10.9.2"` to `"tsx": "catalog:"` | P0 | T2.1 | Pending |
| **T2.4** | Update `tests-agent/openai-agent-auto-instrument-sample/package.json`: Change `dev` script from `ts-node` to `tsx` | P0 | T2.1 | Pending |
| **T2.5** | Update `tests-agent/openai-agent-auto-instrument-sample/package.json`: Change `test:setup` script from `ts-node` to `tsx` | P0 | T2.1 | Pending |
| **T2.6** | Update `tests-agent/openai-agent-auto-instrument-sample/package.json`: Change devDependency from `"ts-node": "catalog:"` to `"tsx": "catalog:"` | P0 | T2.1 | Pending |

---

### Phase 3: Dependency Installation

| ID | Task | Priority | Dependencies | Status |
|----|------|----------|--------------|--------|
| **T3.1** | Run `pnpm install` to update dependencies and regenerate lockfile | P0 | T2.1-T2.6 | Pending |

---

### Phase 4: Verification

| ID | Task | Priority | Dependencies | Status |
|----|------|----------|--------------|--------|
| **T4.1** | Verify tsx installation: Run `pnpm list tsx --depth=0` and confirm tsx is listed | P0 | T3.1 | Pending |
| **T4.2** | Verify ts-node removal: Search the codebase (including `pnpm-lock.yaml`, `.json`, `.yaml`, and `.md` files) for any remaining `ts-node` references. It is acceptable for `ts-node` to appear as a transitive dependency in `pnpm-lock.yaml`, but there must be no direct devDependencies, scripts, or documentation instructions that use `ts-node`. | P0 | T3.1 | Pending |
| **T4.3** | Test basic-agent-sdk-sample dev server: Run `cd tests-agent/basic-agent-sdk-sample && pnpm dev` and verify it starts successfully | P0 | T3.1 | Pending |
| **T4.4** | Test openai-agent-auto-instrument-sample dev server: Run `cd tests-agent/openai-agent-auto-instrument-sample && pnpm dev` and verify it starts successfully | P0 | T3.1 | Pending |
| **T4.5** | Test openai-agent-auto-instrument-sample test:setup: Run `cd tests-agent/openai-agent-auto-instrument-sample && pnpm test:setup` and verify it executes | P0 | T3.1 | Pending |
| **T4.6** | Run unit tests: Execute `pnpm test` from repository root and confirm all tests pass | P0 | T3.1 | Pending |
| **T4.7** | Run integration tests: Execute `pnpm test:integration` from repository root and confirm all tests pass | P0 | T3.1 | Pending |
| **T4.8** | Run build: Execute `pnpm build` from repository root and confirm build succeeds | P0 | T3.1 | Pending |
| **T4.9** | Performance verification: Measure dev server startup times and compare to baseline (target: >50% reduction) | P1 | T4.3, T4.4 | Pending |

---

### Phase 5: Finalization

| ID | Task | Priority | Dependencies | Status |
|----|------|----------|--------------|--------|
| **T5.1** | Run linter: Execute `pnpm lint` to verify no linting errors introduced | P1 | T4.6-T4.8 | Pending |
| **T5.2** | Create commit with descriptive message summarizing the ts-node to tsx migration | P0 | T4.1-T4.8 | Pending |
| **T5.3** | Create pull request with summary of changes and verification results | P0 | T5.2 | Pending |

---

## Detailed Task Specifications

### T2.1: Update pnpm-workspace.yaml

**File**: `pnpm-workspace.yaml`
**Line**: 66

**Current**:
```yaml
  "ts-node": "^10.9.2"
```

**Updated**:
```yaml
  "tsx": "^4.21.0"
```

---

### T2.2 & T2.3: Update basic-agent-sdk-sample/package.json

**File**: `tests-agent/basic-agent-sdk-sample/package.json`

**Script Change (line 9)**:
- Current: `"dev": "nodemon --watch src/*.ts --exec ts-node src/index.ts"`
- Updated: `"dev": "nodemon --watch src/*.ts --exec tsx src/index.ts"`

**Dependency Change (line 34)**:
- Current: `"ts-node": "^10.9.2"`
- Updated: `"tsx": "catalog:"`

---

### T2.4, T2.5 & T2.6: Update openai-agent-auto-instrument-sample/package.json

**File**: `tests-agent/openai-agent-auto-instrument-sample/package.json`

**Script Changes**:
- Line 9 - Current: `"dev": "nodemon --watch src/*.ts --exec ts-node src/index.ts"`
- Line 9 - Updated: `"dev": "nodemon --watch src/*.ts --exec tsx src/index.ts"`
- Line 13 - Current: `"test:setup": "ts-node ../../tests/observability/integration/setup.ts"`
- Line 13 - Updated: `"test:setup": "tsx ../../tests/observability/integration/setup.ts"`

**Dependency Change (line 54)**:
- Current: `"ts-node": "catalog:"`
- Updated: `"tsx": "catalog:"`

---

## Verification Commands Reference

```bash
# Dependency verification
pnpm list tsx --depth=0

# Search for remaining ts-node references (should return no results)
# Use grep to search .json and .yaml files for "ts-node"

# Functional testing
cd tests-agent/basic-agent-sdk-sample && pnpm dev
cd tests-agent/openai-agent-auto-instrument-sample && pnpm dev
cd tests-agent/openai-agent-auto-instrument-sample && pnpm test:setup

# Test suite
pnpm test
pnpm test:integration
pnpm build
pnpm lint
```

---

## Rollback Plan

If issues are discovered post-migration:

1. Revert `pnpm-workspace.yaml` - change `"tsx": "^4.21.0"` back to `"ts-node": "^10.9.2"`
2. Revert `tests-agent/basic-agent-sdk-sample/package.json` - restore ts-node script and dependency
3. Revert `tests-agent/openai-agent-auto-instrument-sample/package.json` - restore ts-node scripts and dependency
4. Run `pnpm install` to restore ts-node
5. Document issues encountered for future resolution

---

## Success Criteria

- [ ] Zero references to `ts-node` exist in the repository (excluding documentation)
- [ ] All sample dev servers start and operate correctly with tsx
- [ ] All unit and integration tests pass without modification
- [ ] `pnpm build` completes without errors
- [ ] Dev server startup time is equal to or faster than before
- [ ] PR is created and ready for review

---

## Files Modified Summary

| File | Type of Change |
|------|----------------|
| `pnpm-workspace.yaml` | Catalog entry update (ts-node -> tsx) |
| `tests-agent/basic-agent-sdk-sample/package.json` | Script update + devDependency update |
| `tests-agent/openai-agent-auto-instrument-sample/package.json` | Script updates (2) + devDependency update |

**Total files modified (excluding lockfiles and documentation)**: 3
