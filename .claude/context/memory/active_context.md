## NEXT ACTION (IMMEDIATE)

Continue Memory Management Pipeline — Waves 2-4. Spawn agents to implement. Do NOT implement directly.

### Wave 2: Create memory-manager agent (Task #9)

Use `Skill({ skill: 'agent-creator' })` to create `.claude/agents/specialized/memory-manager.md`:

- Capabilities: run memory-audit skill, summarize memory health, prune stale entries, detect cross-system duplicates
- Tools: Read, Write, Edit, Bash, Grep, Glob, MemoryRecord, TaskUpdate, Skill
- Model: haiku (routine checks) / sonnet (dedup/consolidation) — tiered per Gemini review
- Skills: memory-audit, context-compressor, memory-search
- Category: specialized

### Wave 3: Fix memory audit findings (Task #10)

1. Delete access-stats.json (57KB useless bulk counter) — rebuild as key→timestamp LRU or remove entirely
2. Delete soul-memory.md (empty, never written to) — OR wire general-assistant to write entries
3. Add cross-references between CC auto-memory gotchas and agent-studio gotchas.json (don't delete from either)
4. Deprecate named memory API (named/ dir) — add deprecation note, RFC in learnings.md
5. Enforce codebase_map.json 500-entry cap in memory-manager.cjs
6. Update agent-registry.json with new memory-manager agent
7. Update skill-index.json with new memory-audit skill
8. Update @SKILL_CATALOG_TABLE.md and CLAUDE.md routing table

### Wave 4: QA validation + commit (Task #11)

1. pnpm test, pnpm lint:fix, pnpm format, pnpm validate
2. pnpm agents:registry && pnpm skills:index
3. Verify memory-audit skill invokable, memory-manager agent in registry
4. git commit

## Context

### What's Done (This Session)

- Deep dive of both memory systems completed
- tweakcc analysis report read and synthesized
- Exa research on CC memory: report at .claude/context/reports/cc-memory-research-2026-03-19.md
- Multi-LLM review (Codex + Claude + Gemini): all 5 architecture questions answered
- **MEMORY.md pruned**: 227 → 51 lines (3 reference files created)
- **Memory dir cleaned**: 261 → 105 files (146 PIDs + 8 metrics + 5 .bak deleted)
- **learnings.md pruned**: 456 → 174 lines (archived to archive/)
- **memory-rotator.cjs**: structural fix — auto-cleans .bak and stale delegation PIDs
- **memory-audit skill created**: .claude/skills/memory-audit/SKILL.md
- All tests pass (rotator: 16/16, manager: pass)

### Design Decisions (Multi-LLM Consensus)

- Keep dual memory systems separate (CC auto-memory + agent-studio)
- CC = thin index/pointers, agent-studio = deep store
- Skill = sensor (structured JSON report), Agent = controller (decisions)
- Tiered model: haiku for routine health, sonnet for dedup/consolidation
- Both scheduling: post-task hook + weekly cron
- CC auto-memory writes: read-only or validated CC-safe-edit only
- access-stats.json: rebuild as LRU timestamp map or remove (Gemini: remove)
- Named memory API: deprecate (70+ modules, 0 usage)
- MCP env vars (NONBLOCKING/BATCH_SIZE): NOT official — don't add to .env.example

### Key Files

- tweakcc report: .claude/context/reports/tweakcc-analysis-2026-03-19.md
- CC memory research: .claude/context/reports/cc-memory-research-2026-03-19.md
- Memory architecture strategy: ~/.claude/projects/.../memory/project_memory_architecture_strategy.md
- Gemini feedback: referenced in active_context (tiered model, sensor/controller split, CC-safe-edit)

### Codex Corrections (IMPORTANT — update findings accordingly)

- codebase_map.json HAS pruning: `pruneCodebaseMap()` in memory-manager-core.cjs, 348/500 entries. Finding was WRONG.
- access-stats.json IS actively used by contextual-memory-context-loader.cjs for ranking. REBUILD, don't delete.
- soul-memory.md is a template/stub, not empty. Issue is non-use, not emptiness.
- memory-manager agent should ORCHESTRATE existing .claude/lib/memory/\* modules, not reimplement them.
- Need a new `cc-memory-adapter` module for safe CC auto-memory writes (frontmatter validation, line budget check, backup+diff).
- Define canonical ownership rules BEFORE implementing dedup.

### Open Tasks

- Task #9: Wave 2 — Create memory-manager agent (pending, blocked by 8 which is now complete)
- Task #10: Wave 3 — Fix findings (pending, blocked by 9)
- Task #11: Wave 4 — QA + commit (pending, blocked by 10)
