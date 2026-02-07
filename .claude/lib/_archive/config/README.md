# config/ - Archived 2026-02-07

**Reason:** Zero active consumers detected in lib system audit (Pipeline #15, Task #122)

**Original Purpose:** Config loading utilities (context-mode-loader.cjs, config-resolver.cjs, defaults.cjs).

**Archival Decision:** Config subsystem (3 modules, ~300 LOC) had zero active consumers. Active config loading uses `lib/utils/config-loader.cjs` instead.

**Security Note:** context-mode-loader.cjs had unsafe yaml.load (SEC-LIB-003) - archived before fix to avoid wasted effort.

**Restoration:** If needed, use `git log -- .claude/lib/config` to find original commits.

**ADR Reference:** See ADR-098 (Lib System Overhaul - Pipeline #15)

**Total:** 3 modules, ~300 LOC
