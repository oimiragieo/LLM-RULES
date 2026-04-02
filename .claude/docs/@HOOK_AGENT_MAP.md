# Hook-Agent Mapping Reference

> **BACK TO MAIN:** CLAUDE.md Section 1.3
> **Last Updated:** 2026-02-16
> **Source of Truth:** `.claude/settings.json` hook registrations

This document provides a comprehensive mapping between enforcement hooks and agent archetypes, showing which hooks govern which agents at runtime.

---

## Section 1: Hook-Agent Matrix

| Hook                                | Router | Implementer | Reviewer | Documenter | Orchestrator | Researcher |
| ----------------------------------- | ------ | ----------- | -------- | ---------- | ------------ | ---------- |
| `user-prompt-unified.cjs`           | x      |             |          |            |              |            |
| `routing-guard.cjs`                 | x      | x           | x        |            | x            | x          |
| `bash-pretool-bundle.cjs`           |        | x           | x        |            |              | x          |
| `write-pretool-bundle.cjs`          |        | x           |          | x          |              |            |
| `pre-tool-unified.cjs`              | x      | x           | x        | x          | x            | x          |
| `post-tool-metrics-unified.cjs`     | x      | x           | x        | x          | x            | x          |
| `post-task-unified.cjs`             | x      |             |          |            | x            |            |
| `unified-reflection-handler.cjs`    | x      | x           | x        | x          | x            | x          |
| `reflection-cleanup.cjs`            |        | x           | x        | x          |              | x          |
| `reflection-data-aggregator.cjs`    |        | x           | x        | x          |              | x          |
| `subagent-citation-guard.cjs`       |        | x           | x        | x          |              | x          |
| `taskupdate-contract-validator.cjs` |        | x           | x        | x          |              | x          |
| `pre-completion-validation.cjs`     |        | x           | x        | x          |              | x          |
| `creator-compliance-validator.cjs`  |        | x           |          | x          |              |            |
| `quality-gate-validator.cjs`        |        | x           |          | x          |              |            |
| `adaptive-quality-gate.cjs`         | x      | x           | x        | x          | x            | x          |
| `handover-detector.cjs`             | x      |             |          |            |              |            |
| `channel-auto-start.cjs`            | x      |             |          |            |              |            |
| `a2a-server-autostart.cjs`          | x      |             |          |            |              |            |
| `a2a-shutdown.cjs`                  | x      |             |          |            |              |            |
| `spawn-token-guard.cjs`             | x      | x           |          |            | x            |            |
| `finish-only-guard.cjs`             | x      | x           |          |            | x            |            |
| `session-end-memory-promotion.cjs`  | x      |             |          |            |              |            |
| `worktree-auto-cleanup.cjs`         | x      |             |          |            |              |            |
| `check-console-log.cjs`             | x      | x           | x        | x          | x            | x          |
| `pre-compact.cjs`                   | x      | x           | x        | x          | x            | x          |
| `startup-failopen-audit.cjs`        | x      |             |          |            |              |            |
| `session-budget-watchdog.cjs`       | x      |             |          |            |              |            |
| `heartbeat-step05-check.cjs`        | x      |             |          |            |              |            |
| `analysis-paralysis-guard.cjs`      | x      | x           | x        | x          | x            | x          |
| `context-window-monitor.cjs`        | x      |             |          |            |              |            |
| `worktree-preflight-check.cjs`      | x      |             |          |            |              |            |
| `ccusage-statusline.cjs`            | x      |             |          |            |              |            |
| `worktree-prune-on-start.cjs`       | x      |             |          |            |              |            |
| `hook-error-detector.cjs`           | x      | x           | x        | x          | x            | x          |
| `recurring-issue-detector.cjs`      | x      | x           | x        | x          | x            | x          |
| `dlp-pretool.cjs`                   |        | x           | x        | x          |              | x          |
| `flight-recorder-schema-gate.cjs`   |        | x           |          | x          |              |            |
| `post-pipeline-token-report.cjs`    | x      | x           | x        | x          | x            | x          |
| `post-pipeline-self-review.cjs`     | x      | x           | x        | x          | x            | x          |
| `pre-spawn-hook-check.cjs`          |        | x           |          |            | x            |            |
| `context-monitor.cjs`               | x      | x           | x        | x          | x            | x          |
| `permission-denied-logger.cjs`      | x      | x           | x        | x          | x            | x          |
| `post-tool-advisory-bundle.cjs`     | x      | x           | x        | x          | x            | x          |
| `session-start-watchpaths.cjs`      | x      |             |          |            |              |            |
| `subagent-start-iron-law.cjs`       | x      | x           | x        | x          | x            | x          |
| `user-prompt-advisory-bundle.cjs`   | x      |             |          |            |              |            |

**Agent Archetype Definitions:**

- **Router**: CLAUDE.md
- **Implementer**: developer, planner, qa, architect, devops, all domain specialists
- **Reviewer**: code-reviewer
- **Documenter**: technical-writer, c4-\* agents
- **Orchestrator**: master-orchestrator, evolution-orchestrator, party-orchestrator, swarm-coordinator
- **Researcher**: researcher, reverse-engineer

---

## Section 2: Hook Execution Order (Canonical)

### SessionStart (all agents)

1. `session-start-watchpaths.cjs` — registers watch paths for runtime-critical files (sync)

### SubagentStart (all agents)

1. `subagent-start-iron-law.cjs` — warns when router-banned tools appear in spawn prompts (async)

### PermissionDenied (all agents)

1. `permission-denied-logger.cjs` — appends denial event to denial-log.json (async)

### UserPromptSubmit (Router only)

1. `step0-reflection-enforcer.cjs`
2. `reflection-queue-processor.cjs`
3. `sanitize-debug-log.cjs`
4. `state-reset.cjs`
5. `drift-detector.cjs`
6. `user-prompt-unified.cjs`
7. `user-prompt-orchestrator.cjs`
8. `handover-detector.cjs` (matcher: all prompts — fires on fresh session start)
9. `startup-failopen-audit.cjs`
10. `session-budget-watchdog.cjs`
11. `user-prompt-advisory-bundle.cjs` (async — consolidated: ccusage statusline, fail-open audit, worktree prune, budget watchdog, drift detector, stale task detector)

### PreToolUse (all tools)

1. `context-monitor.cjs` — injects advisory warnings at 70%/85% context budget (async)

### PreToolUse (Bash)

1. `pre-tool-unified.cjs`
2. `bash-pretool-bundle.cjs` (Consolidates: command validator, injection validator, null sanitizer)

### PreToolUse (Write/Edit/NotebookEdit)

1. `pre-tool-unified.cjs`
2. `write-pretool-bundle.cjs` (Consolidates: creator guard, contract validator, etc.)
3. `research-enforcement.cjs` (Write/Edit/NotebookEdit — enforces research phase before artifact creation)
4. `conflict-detector.cjs` (Write only)
5. `evolution-state-guard.cjs` (Write only — enforces EVOLVE state machine transitions)

### PreToolUse (Task)

1. `spawn-prompt-assembler.cjs`
2. `pre-task-unified.cjs`
3. `routing-guard.cjs`
4. `spawn-prompt-validator.cjs`
5. `spawn-token-guard.cjs` (matcher: Task — warns at 80K tokens, blocks at 120K)
6. `finish-only-guard.cjs` (matcher: TaskCreate|Task — blocks when session is draining)
7. `heartbeat-step05-check.cjs`

### PreToolUse (TaskUpdate)

1. `taskupdate-contract-validator.cjs`
2. `pre-completion-validation.cjs`
3. `creator-compliance-validator.cjs`
4. `quality-gate-validator.cjs`

### PostToolUse (all tools)

1. `post-tool-advisory-bundle.cjs` — consolidated: metrics, context window, hook error detection, recurring issue detection (async)

### PostToolUse (TaskUpdate)

1. `post-task-unified.cjs`
2. `post-completion-chain.cjs`
3. `reflection-cleanup.cjs`
4. `artifact-scoring-ledger-hook.cjs`
5. `post-creation-integration.cjs`
6. `analysis-paralysis-guard.cjs`

---

## Section 3: Environment Variable Overrides

| Variable                         | Hook                         | Default | Values         |
| -------------------------------- | ---------------------------- | ------- | -------------- |
| `PLANNER_FIRST_ENFORCEMENT`      | routing-guard.cjs            | block   | block/warn/off |
| `SECURITY_REVIEW_ENFORCEMENT`    | routing-guard.cjs            | block   | block/warn/off |
| `CREATOR_GUARD`                  | unified-creator-guard.cjs    | block   | block/warn/off |
| `REFLECTION_STEP0_ENFORCEMENT`   | reflection-step0-guard.cjs   | block   | block/warn/off |
| `TASKLIST_FIRST_ENFORCEMENT`     | routing-guard.cjs            | block   | block/warn/off |
| `WORKTREE_PREFLIGHT_ENFORCEMENT` | worktree-preflight-check.cjs | block   | block/warn/off |

Recommended defaults:

- `REFLECTION_STEP0_ENFORCEMENT=block`
- `TASKLIST_FIRST_ENFORCEMENT=block`

---

**Provenance:** Created by developer agent for Task #1 (Phase 2 Ecosystem Hardening)
