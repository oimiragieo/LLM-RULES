# Archived Tests

This directory contains tests for functionality that has been archived or removed from the codebase.

## Status

**Tests in this directory are NOT executed** - they have been renamed to `*.test.cjs.archived` to prevent them from being picked up by test runners.

## Archived Test Files

- `error-pattern-detector-memory.test.cjs.archived` - Tests for archived error pattern detector
- `spec-017-advanced-patterns.test.cjs.archived` - Tests for archived workflow advanced patterns
- `spec-018-composition.test.cjs.archived` - Tests for archived workflow composition
- `spec-019-hybrid-execution.test.cjs.archived` - Tests for archived hybrid execution (task-router)
- `spec-020-versioning.test.cjs.archived` - Tests for archived workflow versioning
- `spec-021-legacy-integration.test.cjs.archived` - Tests for archived legacy integration
- `spec-022-performance-optimization.test.cjs.archived` - Tests for archived performance optimization
- `workflow-state-transactions.test.cjs.archived` - Tests for archived workflow state transactions

## Why Archived?

These tests reference modules that have been:

- Moved to `.claude/lib/_archive/`
- Removed from the codebase during cleanup
- Deprecated and replaced with newer implementations

## Restoration

If you need to restore any of these tests:

1. Restore the corresponding archived code from `.claude/lib/_archive/` or `.claude/tools/_archive/`
2. Rename the test file back to `*.test.cjs`
3. Update import paths to match restored code location
4. Run the test to verify it works with restored code
