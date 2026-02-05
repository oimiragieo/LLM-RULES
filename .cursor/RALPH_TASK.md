---
task: Deep-dive audit of .claude memory system and core fundamentals - 100% audit, critical review
test_command: 'npm test && pnpm lint'
---

# Ralph Loop: Memory System & Core Fundamentals – 100% Audit

## Objective

Perform a **100% audit** of the `.claude` memory system and core application fundamentals. Be **critical and thorough**: list every item that is **not wired in**, **will not work as documented**, or is **broken or inconsistent**. No slack. Provide detailed writeups: **what is wrong** and **why it matters**.

## Success Criteria

1. [ ] Memory system fully traced: hooks, STM/MTM/LTM, entity index, ContextualMemory, sync paths, SessionEnd behavior
2. [ ] Core fundamentals fully traced: routing, agent registry, config.yaml usage, Task/spawn flow, reflection, event bus
3. [ ] Every unwired hook or component explicitly listed with reason and impact
4. [ ] Every “won’t work” or “broken” behavior documented with what is wrong and why
5. [ ] Audit document written: detailed, critical, no slack; actionable findings with severity
6. [ ] Tests and lint passing after any corrective edits

## Audit Scope

### 1. Memory System (.claude memory)

- **Hook wiring**: Cross-check `settings.json` vs MEMORY_SYSTEM.md and HOOKS_REFERENCE.md. List any hook that is documented but not registered, or registered but not documented.
- **STM/MTM/LTM**: Who writes STM (UserPromptSubmit path)? Who consolidates on SessionEnd? What happens if SessionEnd never fires (headless)?
- **Entity index (SQLite)**: Who populates it (sync-memory-index)? What files are synced (decisions, issues, patterns, gotchas)? Is learnings.md synced? Who reads (ContextualMemory, spawn-prompt-assembler)?
- **ContextualMemory**: Single read path (loadMemoryForContext / loadContext)? Who calls it? Entity graph in spawn prompt (SPAWN_PROMPT_ENTITY_GRAPH)?
- **Reflection**: reflection-queue-processor on SessionEnd only? What if SessionEnd is not emitted? Step 0 guard wired and blocking?
- **Maintenance**: Weekly/daily run on SessionEnd or UserPromptSubmit fallback? Cold storage, LTM retention, archival.
- **Embeddings / LanceDB**: When are embeddings built? MEMORY_EMBED_ON_EDIT? Reindex path.
- **Legacy / deprecated**: saveSession, session-end-recorder, SyncLayer, BackgroundSyncWorker. Any code still depending on them?

### 2. Core Fundamentals

- **Routing**: user-prompt-unified, routing-guard, routing-table, router-enforcer. Is router-enforcer registered? Who uses routing-table?
- **Agent discovery**: agent-registry.json vs filesystem fallback. Consistency checks (REGISTRY_CONSISTENCY_GATE)?
- **Config (config.yaml)**: Does any hook or assembler **set** the spawn model from config (resolveAgentModel), or only validate (config-model-validator)? CONFIG-001 impact.
- **Task/spawn flow**: PreToolUse(Task) chain (config-model-validator, spawn-prompt-assembler, spawn-prompt-validator, pre-spawn-tool-validator, tool-availability-validator, documentation-routing-guard, pre-task-unified). PostToolUse(Task): post-task-unified, agent-health-hook, auto-rerouter. agent-context-tracker and post-spawn-task-updater: wired or not?
- **Reflection**: reflection-step0-guard (PreToolUse TaskList), unified-reflection-handler (PostToolUse + SessionEnd), reflection-queue-processor (SessionEnd). Reminder file and spawn-request file flow.
- **Event bus**: Which hooks emit TOOL_BLOCKED, TOOL_FAILED, memory health, etc.?
- **Execution limits**: execution-limit-monitor-hook.cjs. Cost enforcement or best-effort?
- **Shell safety**: Which validators are in settings.json (Bash matcher)? bash-cwd, shell-injection, variable-quoting, shellcheck, command-allowlist?

### 3. Documentation vs Reality

- HOOKS_REFERENCE.md: Does the listed hook tree match settings.json? Any hook listed as “not registered”?
- MEMORY_SYSTEM.md: Does “Hook Wiring” match settings.json? SessionEnd behavior and caveats accurate?
- ROUTER_ENFORCEMENT.md / ROUTER_PROTOCOL: Matches actual wiring and behavior?

## Deliverables

1. **Audit report** (single markdown): `.claude/audit/MEMORY_AND_CORE_100_PERCENT_AUDIT_2026-02-04.md`
   - Executive summary (critical assessment, % functional if applicable)
   - Section per area (Memory, Core, Docs)
   - For each finding: **what is wrong**, **why it matters**, **severity** (Critical / High / Medium / Low), **recommendation**
   - Explicit lists: “Unwired components”, “Won’t work / broken”, “Documentation gaps”
2. **RALPH_TASK.md** (this file) updated so success criteria reflect completion when the audit is done and any follow-up fixes are applied.

**Audit report path:** `.claude/audit/MEMORY_AND_CORE_100_PERCENT_AUDIT_2026-02-04.md` (created 2026-02-04).

## Guardrails

- **Be critical.** Do not give slack. If something is optional or best-effort, say so; if it is broken or unwired, say so.
- **Be thorough.** Trace code paths; confirm registration in settings.json; confirm docs match reality.
- **Detail.** For each finding: what is wrong, why it matters, where (file/line or hook name), and what would fix it.
- **No assumptions.** If a hook is not in settings.json, it is unwired unless another mechanism invokes it (e.g. required by another hook).

## Completion

The loop is complete when:

1. The full audit document is written and saved.
2. Every unwired or broken item identified in scope is documented with severity and recommendation.
3. Success criteria 1–5 are checked off; tests and lint pass (criterion 6).
