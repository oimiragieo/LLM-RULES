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

| Event              | When It Fires             | Common Uses                                                         |
| ------------------ | ------------------------- | ------------------------------------------------------------------- |
| `UserPromptSubmit` | User sends message        | Router analysis, memory reminder, session context reset             |
| `PreToolUse`       | Before tool executes      | Command validation, routing enforcement, blocking unsafe operations |
| `PostToolUse`      | After tool executes       | Memory/index sync, telemetry, task/reflection recording             |
| `SessionEnd`       | Session ends              | Persist session insights, create session files                      |
| `SessionStart`     | Session starts            | Register watch paths, initialize session-scoped state               |
| `SubagentStart`    | Subagent is spawned       | Validate spawn compliance, enforce iron-law tool restrictions       |
| `PermissionDenied` | Tool permission is denied | Log denial events, routing feedback analysis                        |

## Active Hook Inventory

### UserPromptSubmit

- `worktree-prune-on-start.cjs`: Cleans up orphaned worktrees before session initialization.
- `reflection-queue-processor.cjs`: Processes pending reflections (headless-safe).
- `force-step0-execution.cjs`: Ensures Step 0 is performed when needed.
- `sanitize-debug-log.cjs`: Removes sensitive data from logs.
- `state-reset.cjs`: Resets session state.
- `drift-detector.cjs`: Detects state drift.
- `user-prompt-unified.cjs`: Consolidated router analysis, memory reminders, and health checks.
- `user-prompt-orchestrator.cjs`: Orchestrates multi-agent workflows.
- `handover-detector.cjs`: Detects shift-change handovers on fresh session start. Reads `shift-change-log.json`, claims the handover, and injects a structured resume message (pre-flight steps 0–0.5 + pending actions) into the first prompt. Fail-open (advisory).
- `startup-failopen-audit.cjs`: Audits startup fail-open state.
- `session-budget-watchdog.cjs`: Monitors session token budget and limits.
- `ccusage-statusline.cjs`: Displays real-time token usage and cost from ccusage CLI on each prompt. Fail-open (advisory).
- `channel-auto-start.cjs`: Starts configured channel infrastructure on prompt submit when needed.
- `a2a-server-autostart.cjs`: Launches the A2A Express server as a detached background subprocess on session start. Uses lockfile cooldown to prevent duplicate spawns. Records PID in terminal-pids.json.
- `user-prompt-advisory-bundle.cjs`: Consolidated advisory bundle that runs 6 sub-checks per prompt (ccusage statusline, fail-open audit, worktree prune, session budget watchdog, drift detector, stale task detector). Fail-open (async).

### PreToolUse

- `pre-tool-unified.cjs`: Global tool usage policy and execution limits.
- `bash-pretool-bundle.cjs`: Bundle for Bash validation (includes command validator, injection validator, null sanitizer).
- `dlp-pretool.cjs`: Applies DLP screening to Bash, Write/Edit, WebFetch, and WebSearch payloads before execution.
- `hybrid-search-enforcer.cjs`: Enforces hybrid search rules for Grep.
- `routing-guard.cjs`: Core router enforcement (Planner-first, specialist-first).
- `write-pretool-bundle.cjs`: Consolidated bundle for Write/Edit tools (includes creator guard, contract validator, etc.).
- `flight-recorder-schema-gate.cjs`: Validates write/edit payloads against the flight-recorder schema gate before mutation.
- `conflict-detector.cjs`: Detects Write conflicts.
- `evolution-state-guard.cjs`: Enforces valid EVOLVE workflow state machine transitions (blocks invalid Write transitions to evolution-state.json).
- `research-enforcement.cjs`: Enforces research phase completion before artifact creation (Write/Edit to agent/skill/workflow paths blocked without 3+ research entries).
- `validate-skill-invocation.cjs`: Validates Skill usage.
- `reflection-step0-guard.cjs`: Blocks TaskList if reflections are pending.
- `heartbeat-step05-check.cjs`: Enforces TaskList check after Step 0.5 heartbeat check.
- `spawn-prompt-validator.cjs`: Validates Task spawn prompts.
- `pre-spawn-hook-check.cjs`: Verifies Agent-tool hook files remain loadable before agent execution.
- `taskupdate-contract-validator.cjs`: Validates TaskUpdate inputs.
- `pre-completion-validation.cjs`: Validates task completion quality, required outputs, creator-ecosystem alignment, and router-aware TaskUpdate completion rules before completion claims land.
- `creator-compliance-validator.cjs`: Validates post-creation compliance.
- `quality-gate-validator.cjs`: Enforces workflow quality gates.
- `adaptive-quality-gate.cjs`: Non-blocking edit counter; suggests quality checkpoints at adaptive thresholds based on correction rate.
- `spawn-token-guard.cjs`: Estimates spawn prompt token count on every `Task` call. Writes `compression-reminder.txt` and warns at 80K tokens; blocks the spawn at 120K tokens to prevent "Prompt is too long" failures. Fail-open (advisory).
- `finish-only-guard.cjs`: Blocks `TaskCreate` and `Task` calls when the session is in drain mode (finishing state). Prevents new work from being started while existing tasks are being completed. Fail-open (advisory).
- `context-monitor.cjs`: Monitors agent context window usage before each tool call and injects advisory warnings at 70% (WARNING) and 85% (CRITICAL) thresholds. Reads token budget from `budget-tracker.json`. Fail-open (advisory).
- `mcp-agent-allowlist-guard.cjs`: Enforces per-agent MCP server access policies for `mcp__*` tool calls. Resolves agent identity from hook input or `CLAUDE_AGENT_ID` and consults the allowlist checker; unknown agents default to permissive. Mode controlled by `MCP_AGENT_ALLOWLIST_ENFORCEMENT` (warn|block|off, default warn). Fail-open (advisory).

### PostToolUse

- `hook-error-detector.cjs`: Detects hook validation and execution errors.
- `post-tool-metrics-unified.cjs`: Collects metrics, tracks errors, detects anomalies.
- `recurring-issue-detector.cjs`: Correlates repeated hook and tool failures to surface recurring operational issues.
- `post-task-unified.cjs`: Task completion tracking, learning extraction, trend snapshots, and worktree garbage collection.
- `post-completion-chain.cjs`: Runs after task completion.
- `reflection-cleanup.cjs`: Performs cleanup after reflections.
- `artifact-scoring-ledger-hook.cjs`: Updates artifact scores.
- `post-creation-integration.cjs`: Validates post-creation integration.
- `reflection-data-aggregator.cjs`: Aggregates tool-call metrics and error data for reflection-agent consumption.
- `post-pipeline-token-report.cjs`: Emits a token usage report when a pipeline-final TaskUpdate drains the session.
- `post-pipeline-self-review.cjs`: Queues milestone self-review reflections when a pipeline-final TaskUpdate completes.
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
- `analysis-paralysis-guard.cjs`: Prevents infinite looping on reads.
- `post-tool-advisory-bundle.cjs`: Consolidated advisory bundle that runs 4 PostToolUse sub-checks per tool call (metrics/error tracking, context window monitoring, stale worktree hook detection, recurring issue detection). Fail-open (async).
- `slo-alert-gate.cjs`: SLO enforcement gate. Reads hook latency and recorder failure rate metrics from the SLO metrics file and blocks if p95 hook latency exceeds `HOOK_P95_MAX_MS` (default 5ms) or recorder failure rate exceeds `RECORDER_FAILURE_RATE_MAX` (default 1%). Fail-open when metrics file is absent.
- `trajectory-logger.cjs`: Logs each tool call as a structured ATIF-compatible JSONL record to `.claude/context/logs/trajectory-YYYY-MM-DD.jsonl`. Fires on every PostToolUse event and captures tool name, sanitized input/output summaries, session ID, agent type, and task ID. Fail-open (always exits 0).
- `skill-usage-recorder.cjs`: Records Skill tool invocations to `skill-usage.jsonl` via `SkillUsageTracker`. Matcher: `Skill`. Off by default; enable with `AGENT_EVOLUTION_ENABLED=1`. Overhead target <5ms per invocation. Fail-open (never blocks tool calls).

### SessionEnd

- `unified-reflection-handler.cjs`: Consolidated session insights and memory extraction.
- `reflection-queue-processor.cjs`: Final processing of queued reflections.
- `sanitize-debug-log.cjs`: In-place sanitization of debug logs.
- `session-end-memory-promotion.cjs`: Promotes short-term contextual memory to long-term index.
- `worktree-auto-cleanup.cjs`: Cleans up residual worktrees left over by subagents.
- `a2a-shutdown.cjs`: Gracefully shuts down the A2A server when the session ends. Kills the A2A server PID recorded in terminal-pids.json and updates status to 'stopped'.

### Stop

- `check-console-log.cjs`: Scans for console.log statements in production code.
- `pre-compact.cjs`: Snapshots state before session compaction.
- `sanitize-debug-log.cjs`: Final log cleanup.
- `memory-autocommit.cjs`: Auto-commits session learnings in `.claude/context/memory/**/*.{md,json}` when the Stop event fires. Path-allowlisted (only the memory tree is staged); branch-guarded (refuses commits on `main`/`master`); idempotent when nothing is dirty. Uses `spawnSync` with `shell:false`. Fail-open (always exits 0). Added in Phase 0.6.

### SessionStart

- `session-start-watchpaths.cjs`: Returns a `watchPaths` array of runtime-critical files for Claude Code to monitor (agent registry, settings.json, runtime state directory). Paths are validated for existence before inclusion. Fail-open (sync).
- `telegram-start.cjs`: Launches the channel daemon (`scripts/channels/daemon/index.cjs`) as a hidden background process on session start. Loads `.env`, checks for an already-running daemon via PID file + HTTP health check on port 3101, then spawns if needed. Async; 10s timeout. Fail-open (advisory).

### SubagentStart

- `subagent-start-iron-law.cjs`: Validates that subagent spawn prompts from router sessions do not reference router-banned tools (Bash, Edit, Write, Glob, Grep, WebSearch). Emits a stderr warning on violation but never blocks. Fail-open (async).

### PermissionDenied

- `permission-denied-logger.cjs`: Appends a structured JSON entry (tool, reason, timestamp, session_id) to `denial-log.json` when a tool permission is denied. Bounded at 500 entries with FIFO eviction on overflow. Fail-open (async).

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
