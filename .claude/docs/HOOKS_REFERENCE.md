# Hooks and Safety Reference

> **See also:** @HOOK_AGENT_MAP.md for hook-agent mapping matrix

Event handlers that validate, transform, or record actions at specific execution points in the Claude Code framework. Hooks provide defense-in-depth security, enforce routing protocols, and persist memory.

## What Are Hooks?

Hooks are event handlers registered in `.claude/settings.json` that execute at specific points in the Claude Code lifecycle:

- **Validation**: Block dangerous commands before execution
- **Transformation**: Modify inputs before processing
- **Recording**: Extract and persist insights after operations
- **Enforcement**: Ensure agents follow architectural rules

All hooks are Node.js scripts (`.cjs`) that receive JSON input via stdin and return exit codes:

- `0`: Allow operation
- `2`: Block operation

## Hook Events

| Event              | When It Fires        | Common Uses                                                         |
| ------------------ | -------------------- | ------------------------------------------------------------------- |
| `UserPromptSubmit` | User sends message   | Router analysis, memory reminder, session context reset             |
| `PreToolUse`       | Before tool executes | Command validation, routing enforcement, blocking unsafe operations |
| `PostToolUse`      | After tool executes  | Memory/index sync, telemetry, task/reflection recording             |
| `SessionEnd`       | Session ends         | Persist session insights, create session files                      |

## Active Hook Inventory

### UserPromptSubmit

- `reflection-queue-processor.cjs`: Processes pending reflections (headless-safe).
- `force-step0-execution.cjs`: Ensures Step 0 is performed when needed.
- `sanitize-debug-log.cjs`: Removes sensitive data from logs.
- `state-reset.cjs`: Resets session state.
- `drift-detector.cjs`: Detects state drift.
- `user-prompt-unified.cjs`: Consolidated router analysis, memory reminders, and health checks.
- `user-prompt-orchestrator.cjs`: Orchestrates multi-agent workflows.

### PreToolUse

- `pre-tool-unified.cjs`: Global tool usage policy and execution limits.
- `bash-pretool-bundle.cjs`: Bundle for Bash validation (includes command validator, injection validator, null sanitizer).
- `hybrid-search-enforcer.cjs`: Enforces hybrid search rules for Grep.
- `routing-guard.cjs`: Core router enforcement (Planner-first, specialist-first).
- `write-pretool-bundle.cjs`: Consolidated bundle for Write/Edit tools (includes creator guard, contract validator, etc.).
- `conflict-detector.cjs`: Detects Write conflicts.
- `evolution-state-guard.cjs`: Enforces valid EVOLVE workflow state machine transitions (blocks invalid Write transitions to evolution-state.json).
- `research-enforcement.cjs`: Enforces research phase completion before artifact creation (Write/Edit to agent/skill/workflow paths blocked without 3+ research entries).
- `validate-skill-invocation.cjs`: Validates Skill usage.
- `reflection-step0-guard.cjs`: Blocks TaskList if reflections are pending.
- `spawn-prompt-validator.cjs`: Validates Task spawn prompts.
- `taskupdate-contract-validator.cjs`: Validates TaskUpdate inputs.
- `pre-completion-validation.cjs`: Validates task completion quality.
- `creator-compliance-validator.cjs`: Validates post-creation compliance.
- `quality-gate-validator.cjs`: Enforces workflow quality gates.
- `adaptive-quality-gate.cjs`: Non-blocking edit counter; suggests quality checkpoints at adaptive thresholds based on correction rate.

### PostToolUse

- `post-tool-metrics-unified.cjs`: Collects metrics, tracks errors, detects anomalies.
- `post-task-unified.cjs`: Task completion tracking, learning extraction, trend snapshots.
- `post-completion-chain.cjs`: Runs after task completion.
- `reflection-cleanup.cjs`: Performs cleanup after reflections.
- `artifact-scoring-ledger-hook.cjs`: Updates artifact scores.
- `post-creation-integration.cjs`: Validates post-creation integration.
- `subagent-citation-guard.cjs`: Validates subagent citations in task outputs.
- `sync-memory-index.cjs`: Syncs memory indices after edits.
- `agent-registry-auto-refresh.cjs`: Refreshes registry when agents are modified.
- `code-index-updater.cjs`: Updates code index after writes.
- `post-edit-scanner.cjs`: Scans files after editing.
- `unified-reflection-handler.cjs`: Handles reflection logic.
- `audit-skill-recency.cjs`: Audits skill usage recency.
- `bypass-audit-hook.cjs`: Manages bypass audit.
- `external-content-guard.cjs`: Guards against unsafe external content.
- `router-tool-lockdown.cjs`: Locks down router tools.
- `stale-task-detector.cjs`: Detects stale tasks.
- `task-pretool-orchestrator.cjs`: Orchestrates pretool tasks.
- `workflow-watchdog-hook.cjs`: Watchdog for workflows.

### SessionEnd

- `unified-reflection-handler.cjs`: Consolidated session insights and memory extraction.
- `reflection-queue-processor.cjs`: Final processing of queued reflections.
- `sanitize-debug-log.cjs`: In-place sanitization of debug logs.
- `session-end-memory-promotion.cjs`: Promotes short-term contextual memory to long-term index.
- `worktree-auto-cleanup.cjs`: Cleans up residual worktrees left over by subagents.

### Stop

- `check-console-log.cjs`: Scans for console.log statements in production code.
- `pre-compact.cjs`: Snapshots state before session compaction.
- `sanitize-debug-log.cjs`: Final log cleanup.

## Key Safety Hooks

### shell-injection-validator.cjs (via bash-pretool-bundle)

**Purpose**: Blocks Bash commands with shell injection patterns (chained commands, substitutions, dangerous targets).
**Verification**: 100% test coverage in `tests/hooks/shell-injection-validator.test.cjs`.

### routing-guard.cjs

**Purpose**: Enforces "Iron Law" of routing.

- **Planner-First**: Requires PLANNER spawn for HIGH/EPIC complexity.
- **Specialist-First**: Prevents "developer collapse" by routing to specialists (technical-writer, qa, etc.).
- **Security-First**: Enforces SECURITY-ARCHITECT review for implementation tasks.

### unified-creator-guard.cjs (via write-pretool-bundle)

**Purpose**: Blocks direct writes to framework artifacts (agents, skills, hooks) without using the correct creator workflow.

### subagent-citation-guard.cjs

**Purpose**: Ensures subagents are correctly cited in task outputs to maintain traceability.

## Performance Requirements

- **Target Latency**: All hook chains must execute in **<100ms**.
- **Optimization**: Use bundles (`bash-pretool-bundle.cjs`, `write-pretool-bundle.cjs`) to reduce Node.js process spawning overhead.

## Security Fixes (2026-02)

- **JSON Safety**: All hooks now use `safeParseJSON()` to prevent prototype pollution and handle malformed input.
- **Fail-Closed**: Security-critical hooks fail CLOSED (exit 2) if validation fails or errors occur.
