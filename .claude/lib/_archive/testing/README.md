# testing/ - Archived 2026-02-07

**Reason:** Zero active consumers detected in lib system audit (Pipeline #15, Task #122)

**Original Purpose:** Testing framework modules for chaos engineering, failure scenarios, load testing, resilience validation, mock factories, test data management, contract validation, and snapshot testing.

**Archival Decision:** The testing subsystem (8 modules, ~2,800 LOC) was designed as a comprehensive testing utility framework but was never integrated into the CI pipeline or any active test runner. All references are either self-references (testing modules requiring each other) or a single documentation reference in `DEVELOPER_ONBOARDING.md`. The project uses Jest/Vitest for actual testing, not these custom utilities.

**Restoration:** If needed, use `git log -- .claude/lib/testing` to find original commits and implementation history.

**ADR Reference:** See ADR-098 (Lib System Overhaul - Pipeline #15)

**Modules Archived:**
- chaos-engineer.cjs
- failure-scenarios.cjs
- load-test-framework.cjs
- resilience-validator.cjs
- mock-factory.cjs
- test-data-manager.cjs
- contract-validator.cjs
- snapshot-compare.cjs

**Total:** 8 modules, ~2,800 LOC
