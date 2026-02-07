# clients/ - Archived 2026-02-07

**Reason:** Zero active consumers detected in lib system audit (Pipeline #15, Task #122)

**Original Purpose:** API client utility used only by dead agents/factory.cjs.

**Archival Decision:** Single module (153 LOC) consumed exclusively by the archived agents runtime. No active code references.

**Restoration:** If needed, use `git log -- .claude/lib/clients` to find original commits.

**ADR Reference:** See ADR-098 (Lib System Overhaul - Pipeline #15)

**Total:** 1 module, 153 LOC
