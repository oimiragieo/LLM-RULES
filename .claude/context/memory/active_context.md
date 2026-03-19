## NEXT ACTION (IMMEDIATE)

Execute the Full Ecosystem Audit & Remediation EPIC. Plan at `.claude/context/plans/ecosystem-audit-epic-2026-03-19.md`. Spawn specialist agents for each wave. Do NOT implement directly — always spawn agents.

Start with Wave 1 (3 agents in parallel, max 2 heavy at a time):
1. Spawn `architect` with `lsp-navigator` + `ripgrep` skills for structural audit (broken imports, dead exports, conflicting workflows)
2. Spawn `security-architect` to audit all hooks in `.claude/hooks/` (fail-closed policy, exit codes, MCP bypass coverage)
3. Spawn `memory-manager` with `memory-audit` skill for full memory health check

After Wave 1 completes, proceed to Wave 2 (reflection agent, evolution system, router compliance), then Waves 3-8 sequentially per plan.

## Context

### Previous Session Work (2026-03-19)
- Deep dive of both memory systems (CC auto-memory + agent-studio)
- MEMORY.md pruned 227→51 lines, memory dir cleaned 261→105 files
- memory-audit skill created, memory-manager agent created
- Session handoff regex bug FIXED (spawn-new-session.cjs line 225)
- All committed and pushed to main at 9f5a3eef
- 63 stale worktree-agent branches deleted
- Lint/format clean, 315 skills, 102 agents in registry

### Key Design Decisions
- Dual memory systems kept separate (CC auto-memory = behavioral, agent-studio = operational)
- memory-audit skill = read-only sensor, memory-manager agent = controller
- access-stats.json reset to empty LRU (was corrupted bulk counter)
- Named memory API deprecated (70+ modules, 0 usage)
- MCP env vars (NONBLOCKING) are NOT official Anthropic vars — don't use

### Reports Available
- tweakcc analysis: .claude/context/reports/tweakcc-analysis-2026-03-19.md
- CC memory research: .claude/context/reports/cc-memory-research-2026-03-19.md
- Memory architecture strategy: ~/.claude/projects/.../memory/project_memory_architecture_strategy.md

### EPIC Plan
`.claude/context/plans/ecosystem-audit-epic-2026-03-19.md` — 3 phases, 8 waves, 12+ agents
