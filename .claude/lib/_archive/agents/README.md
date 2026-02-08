# agents/ (runtime) - Archived 2026-02-07

**Reason:** Zero active consumers detected in lib system audit (Pipeline #15, Task #122)

**Original Purpose:** Alternative agent runtime with factory, base classes, and concrete agent implementations (developer, architect, qa, orchestrator, code-reviewer, planner).

**Archival Decision:** The agents runtime subsystem (8 modules, ~750 LOC) was an alternative agent execution model that was never integrated. The actual agent system uses markdown agent files (`.claude/agents/`) + spawn templates + the Task tool, not these CJS classes. The only consumer is `.claude/tools/_archive/swarm-simulator.cjs` (already archived).

**Restoration:** If needed, use `git log -- .claude/lib/agents` to find original commits and implementation history.

**ADR Reference:** See ADR-098 (Lib System Overhaul - Pipeline #15)

**Modules Archived:**

- factory.cjs
- base-agent.cjs
- developer.cjs
- architect.cjs
- qa.cjs
- orchestrator.cjs
- code-reviewer.cjs
- agent-parser.cjs

**Total:** 8 modules, ~750 LOC
