# scheduler/ - Archived 2026-02-07

**Reason:** Zero active consumers detected in lib system audit (Pipeline #15, Task #122)

**Original Purpose:** Task scheduler with cron support and store management.

**Archival Decision:** Scheduler subsystem (2 modules, ~180 LOC) only consumed by `.claude/tools/_archive/schedule-task.cjs` (already archived). No active runtime usage.

**Security Note:** SEC-LIB-002 fixed before archival (command allowlist + shell: false).

**Restoration:** If needed, use `git log -- .claude/lib/scheduler` to find original commits.

**ADR Reference:** See ADR-098 (Lib System Overhaul - Pipeline #15)

**Total:** 2 modules, ~180 LOC
