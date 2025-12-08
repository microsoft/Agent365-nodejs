# Test Plan for Agent365-nodejs SDK

> **Note:** This plan is under active development. Keep updating as testing progresses.

**Version:** 1.0  
**Date:** December 4, 2025  
**Status:** Draft

---

## Overview

### Current State
- ✅ Unit tests complete for `runtime` module
- ✅ Unit tests complete for `observability` modules
- ❌ Missing tests for `tooling` and `notifications` modules
- ✅ Coverage reporting includes all 9 packages
- ❌ No integration tests or CI/CD automation

### Goals
- Achieve **80%+ code coverage** across all modules
- Implement unit tests for tooling and notifications modules
- Implement integration tests for cross-module functionality
- Integrate testing into CI/CD pipeline with coverage enforcement

---

## Testing Strategy

**Framework:** `Jest` with `ts-jest`  
**Coverage:** `Jest Coverage`  
**Mocking:** `jest.mock`  
**Async:** Native async/await

**Test Pattern:** AAA (Arrange → Act → Assert)  
**Test File Naming:** `<filename>.test.ts` (e.g., `power-platform-api-discovery.test.ts`)
**Test Naming Convention:** `'should <expected_result> when <condition>'`  

---

## Implementation Roadmap

| Phase | Deliverables | Priority | Status |
|-------|-------------|----------|--------|
| 1.1 | Runtime unit tests | HIGH | ✅ Complete |
| 1.2 | Tooling unit tests | HIGH | ❌ Missing |
| 1.3 | Notifications unit tests | HIGH | ❌ Missing |
| 1.4 | Expand observability tests | MEDIUM | ✅ Complete |
| 1.5 | Tooling extension tests | LOW | ❌ Missing |
| 2 | Integration tests | MEDIUM | ❌ Missing |
| 3 | CI/CD automation | HIGH | ❌ Missing |

---

## Phase 1: Unit Tests

### 1.1 Runtime Module

**Priority:** HIGH

| Module | Test File | Status |
|--------|-----------|--------|
| `power-platform-api-discovery.ts` | `power-platform-api-discovery.test.ts` | ✅ Complete |
| `utility.ts` | `utility.test.ts` | ✅ Complete |
| `environment-utils.ts` | `environment-utils.test.ts` | ✅ Complete |
| `agentic-authorization-service.ts` | `agentic-authorization-service.test.ts` | ✅ Complete |

---

### 1.2 Tooling Module

**Priority:** HIGH

| Module | Test File | Status |
|--------|-----------|--------|
| `Utility.ts` | `Utility.test.ts` | ❌ Missing |
| `McpToolServerConfigurationService.ts` | `McpToolServerConfigurationService.test.ts` | ❌ Missing |

---

### 1.3 Notifications Module

**Priority:** HIGH

| Module | Test File | Status |
|--------|-----------|--------|
| `agent-notification.ts` | `agent-notification.test.ts` | ❌ Missing |
| `models/*` | Model tests | ❌ Missing |
| `extensions/*` | Extension tests | ❌ Missing |

---

### 1.4 Observability Extensions

**Priority:** MEDIUM

| Extension | Status |
|-----------|--------|
| `openai` | ✅ Expand existing |
| `tokencache` | ✅ Expand existing |

---

### 1.5 Tooling Extensions

**Priority:** LOW

| Extension | Status |
|-----------|--------|
| Claude | ❌ Missing |
| LangChain | ❌ Missing |
| OpenAI | ❌ Missing |

---

## Phase 2: Integration Tests

**Priority:** MEDIUM

| Integration | Status |
|-------------|--------|
| Runtime + Observability | ❌ Missing |
| Tooling + Runtime | ❌ Missing |
| Notifications + Runtime | ❌ Missing |
| OpenAI full flow | ✅ Complete |
| Claude full flow | ❌ Missing |
| LangChain full flow | ❌ Missing |

---

## Phase 3: CI/CD Integration

**Priority:** HIGH

| Component | Status |
|-----------|--------|
| GitHub Actions workflow | ❌ Missing |
| Node.js matrix (18.x, 20.x, 22.x) | ❌ Missing |
| Coverage enforcement (80%+) | ❌ Missing |
| Codecov integration | ❌ Missing |
| PR blocking on failures | ❌ Missing |

---

## Success Criteria

- ✅ 80%+ code coverage for all modules
- ✅ All tests pass independently
- ✅ Full suite completes in < 30 seconds (unit) / < 5 minutes (full)
- ✅ Automated test execution on all PRs
- ✅ Coverage reports visible and enforced
