# Archived Workflow Tests

This directory contains tests for workflow functionality that has been archived.

## Status

**Tests in this directory are NOT executed** - they have been renamed to `*.test.cjs.archived` to prevent them from being picked up by test runners.

## Archived Test Files

- `state-machine-advanced.test.cjs.archived` - Tests for archived WorkflowComposer advanced state machine patterns

## Why Archived?

These tests reference modules that have been archived:

- `.claude/lib/workflow/workflow-composer.cjs` → archived

These workflow features were part of an earlier state machine implementation that has since been replaced or deprecated.

## Restoration

If you need to restore any of these tests:

1. Restore the corresponding archived code from `.claude/lib/_archive/workflow/`
2. Rename the test file back to `*.test.cjs`
3. Update import paths to match restored code location
4. Run the test to verify it works with restored code
