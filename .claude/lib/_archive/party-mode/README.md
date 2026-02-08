# party-mode/ - Archived 2026-02-07

**Reason:** Zero active consumers detected in lib system audit (Pipeline #15, Task #122)

**Original Purpose:** Multi-agent "party mode" protocol with consensus, orchestration, message routing, agent identity, and session management for parallel multi-agent execution.

**Archival Decision:** The feature was fully designed (10 modules, ~2,500 LOC) but never integrated into the active system. The only consumer is `.claude/agents/orchestrators/party-orchestrator.md` (a documentation reference, not runtime code). The actual multi-agent system uses the Task tool + spawn templates, not the party-mode protocol classes.

**Restoration:** If needed, use `git log -- .claude/lib/party-mode` to find original commits and implementation history.

**ADR Reference:** See ADR-098 (Lib System Overhaul - Pipeline #15)

**Modules Archived:**

- consensus/response-aggregator.cjs (341 lines)
- orchestration/lifecycle-manager.cjs (~300 lines)
- orchestration/round-manager.cjs (~250 lines)
- orchestration/team-loader.cjs (~200 lines)
- protocol/context-isolator.cjs (175 lines)
- protocol/message-router.cjs (189 lines)
- protocol/sidecar-manager.cjs (~250 lines)
- security/agent-identity.cjs (133 lines)
- security/response-integrity.cjs (165 lines)
- security/session-audit.cjs (~200 lines)

**Total:** 10 modules, ~2,500 LOC
