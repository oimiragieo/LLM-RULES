# coordination/ - Archived 2026-02-07

**Reason:** Zero active consumers detected in lib system audit (Pipeline #15, Task #122)

**Original Purpose:** Swarm coordination CLI wrapper for multi-agent orchestration.

**Archival Decision:** Single module (~300 LOC) was a standalone CLI tool never integrated into active workflows. The actual multi-agent coordination uses the Task tool + spawn templates.

**Restoration:** If needed, use `git log -- .claude/lib/coordination` to find original commits.

**ADR Reference:** See ADR-098 (Lib System Overhaul - Pipeline #15)

**Total:** 1 module, ~300 LOC
