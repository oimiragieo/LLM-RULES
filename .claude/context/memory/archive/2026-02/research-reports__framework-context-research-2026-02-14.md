# Framework Context Research (2026-02-14)

## Scope

Research synthesis for the `framework-context` skill using current repository sources.

## Source Set

- `.claude/docs/MEMORY_SYSTEM.md`
- `.claude/CLAUDE.md`
- `.claude/agents/core/reflection-agent.md`
- `.claude/context/agent-registry.json`
- `.claude/lib/routing/routing-table.cjs`
- `.claude/hooks/reflection/reflection-queue-processor.cjs`
- `.claude/hooks/reflection/reflection-step0-guard.cjs`
- `.claude/docs/@ENTERPRISE_WORKFLOWS.md`

## Findings

### 1. Memory System (STM/MTM/LTM + observations + entity index)

- Memory tiers live under `.claude/context/memory/{stm,mtm,ltm}/`.
- Observational memory pipeline includes `observations.jsonl` and summarized memory surfaces.
- Entity index is SQLite-backed at `.claude/context/data/memory.db`.
- Reflection queue flow is reminder-driven:
  `reflection-queue-processor.cjs` -> `reflection-spawn-request.json` -> router Step 0.

### 2. Agents and Routing

- Agent registry source of truth: `.claude/context/agent-registry.json`.
- Routing rules and intent mapping: `.claude/lib/routing/routing-table.cjs`.
- Reflection-agent currently performs post-task quality evaluation with RECE and rubric scoring.

### 3. Workflows

- Core workflow inventory is centralized in `.claude/docs/@ENTERPRISE_WORKFLOWS.md`.
- Key operational workflows for this skill:
  - router-decision
  - enterprise-workflow
  - evolution-workflow
  - reflection-workflow
  - ecosystem-creation-workflow

### 4. Hooks Relevant to Reflection

- `.claude/hooks/reflection/reflection-step0-guard.cjs` enforces reflection queue handling before `TaskList`.
- `.claude/hooks/reflection/reflection-queue-processor.cjs` materializes queued reflection requests.
- `user-prompt-unified.cjs` writes reflection reminders to trigger router compliance.

### 5. Directory Layout Summary

- `.claude/agents/` = agent definitions
- `.claude/skills/` = reusable capabilities
- `.claude/workflows/` = orchestration recipes
- `.claude/hooks/` = runtime enforcement/integration logic
- `.claude/context/` = runtime state, memory, catalogs, reports
- `.claude/schemas/` = JSON schema contracts

## Design Implications for `framework-context`

- Skill output must be sectioned and path-anchored, not narrative-only.
- Scope filtering (`memory`, `agents`, `workflows`, `hooks`, `all`) keeps outputs compact.
- Reflection/planning agents should load this skill before system-level recommendations.
