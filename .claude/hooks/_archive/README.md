# Archived Hooks

These hooks have been superseded by consolidated versions and are no longer registered in settings.json. They are kept for reference.

**Archived**: 2026-02-06
**Reason**: Hook consolidation reduced 88 hooks to 39 active. These 45 hooks were superseded by:

- `unified-pre-write-hook.cjs` (replaced 11 write hooks)
- `routing-guard.cjs` (replaced 5 routing guards)
- `user-prompt-unified.cjs` (replaced 5 prompt hooks)
- Other consolidations

## Archived Hooks by Category

### audit/ (1)
- `git-notes-audit.cjs` - Git notes auditing (superseded by audit system consolidation)

### cost-tracking/ (1)
- `llm-usage-tracker.cjs` - LLM token usage tracking (superseded by metrics-collector-hook)

### evolution/ (2)
- `evolution-audit.cjs` - Evolution workflow auditing (superseded by quality-gate-validator)
- `unified-evolution-guard.cjs` - Evolution guards (superseded by evolution-state-guard)

### git/ (1)
- `regenerate-registries.cjs` - Registry regeneration (superseded by post-commit CI)

### memory/ (2)
- `format-memory.cjs` - Memory formatting (superseded by memory-manager)
- `planning-progress-tracker.cjs` - Planning progress tracking (superseded by workflow-state-manager)

### monitoring/ (3)
- `error-tracker.cjs` - Error tracking (superseded by error-tracker-hook.cjs)
- `execution-limit-monitor.cjs` - Execution limits (superseded by execution-limit-monitor-hook.cjs)
- `metrics-collector.cjs` - Metrics collection (superseded by metrics-collector-hook.cjs)

### post-tool-use/ (1)
- `incremental-indexer.cjs` - Incremental code indexing (superseded by code-index-updater)

### reflection/ (1)
- `error-summary-extractor.cjs` - Error summarization (superseded by unified-reflection-handler)

### routing/ (13)
- `agent-context-tracker.cjs` - Agent context tracking (superseded by post-task-unified)
- `agent-health-hook.cjs` - Agent health monitoring (superseded by anomaly-detector)
- `context-mode-tool-guard.cjs` - Context mode validation (superseded by tool-scope-validator)
- `documentation-routing-guard.cjs` - Documentation routing (superseded by intent-agent-match)
- `post-spawn-task-updater.cjs` - Post-spawn task updates (superseded by post-task-unified)
- `pre-spawn-task-validator.cjs` - Pre-spawn task validation (superseded by pre-task-unified)
- `pre-spawn-tool-validator.cjs` - Pre-spawn tool validation (superseded by spawn-prompt-validator)
- `skill-invocation-tracker.cjs` - Skill invocation tracking (superseded by validate-skill-invocation)
- `structural-context-hook.cjs` - Structural context (superseded by spawn-prompt-assembler)
- `task-auto-route.cjs` - Automatic task routing (superseded by intent-agent-match)
- `task-completion-guard.cjs` - Task completion guard (superseded by pre-completion-validation)
- `task-update-tracker.cjs` - Task update tracking (superseded by unified-reflection-handler)
- `tool-availability-validator.cjs` - Tool availability checks (superseded by tool-scope-validator)

### safety/ (10)
- `bash-cwd-validator.cjs` - Bash CWD validation (superseded by bash-command-validator)
- `command-allowlist-validator.cjs` - Command allowlist (superseded by bash-command-validator)
- `enforce-claude-md-update.cjs` - CLAUDE.md enforcement (superseded by unified-pre-write-hook)
- `error-capture-post-tool.cjs` - Error capture (superseded by error-tracker-hook)
- `file-path-guard.cjs` - File path validation (superseded by unified-pre-write-hook)
- `security-trigger.cjs` - Security triggers (superseded by routing-guard)
- `shellcheck-validator.cjs` - Shellcheck validation (superseded by bash-command-validator)
- `spawn-size-validator.cjs` - Spawn size limits (superseded by spawn-prompt-validator)
- `variable-quoting-validator.cjs` - Variable quoting (superseded by bash-command-validator)
- `write-content-scanner.cjs` - Write content scanning (superseded by unified-pre-write-hook)

### self-healing/ (1)
- `auto-rerouter.cjs` - Automatic rerouting (superseded by anomaly-detector)

### session/ (1)
- `post-creation-reminder.cjs` - Post-creation reminders (superseded by state-reset)

### skills/ (4)
- `duplicate-detector.cjs` - Duplicate skill detection (functionality removed)
- `metadata-validator.cjs` - Skill metadata validation (functionality removed)
- `rule-structure-validator.cjs` - Skill rule structure validation (functionality removed)
- `rule-validator.cjs` - Skill rule validation (functionality removed)

### validation/ (3)
- `agent-tools-validator.cjs` - Agent tool validation (superseded by tool-scope-validator)
- `plan-evolution-guard.cjs` - Plan evolution guard (superseded by quality-gate-validator)
- `track-analytics-validator.cjs` - Analytics tracking (superseded by metrics-collector-hook)

### Root Level (1)
- `statusline.cjs` - Status line display (functionality removed)

## Total: 45 Archived Hooks

## How to Restore

If you need to restore an archived hook:

1. Move file back to original location:
   ```bash
   git mv .claude/hooks/_archive/{category}/{file} .claude/hooks/{category}/{file}
   ```

2. Re-register in `.claude/settings.json`:
   - Add hook to appropriate matcher section
   - Ensure correct event type (PreToolUse, PostToolUse, etc.)

3. Update router-state.cjs path if needed:
   - Archived routing hooks still use `./router-state.cjs`
   - Active hooks use `../../lib/routing/router-state.cjs`

## Related Documentation

- Hook Alignment Plan: `.claude/context/plans/hook-alignment-plan-2026-02-06.md`
- Hooks Audit Report: `.claude/context/reports/hooks-audit-2026-02-06.md`
- Hook Consolidation Workflow: `.claude/workflows/operations/hook-consolidation.md`
