<!-- Agent: developer | Task: #41 | Session: 2026-02-06 -->

# Hook-Agent Mapping Reference

> **BACK TO MAIN:** CLAUDE.md Section 1.3
> **Last Updated:** 2026-02-06
> **Source of Truth:** `.claude/settings.json` hook registrations

This document provides a comprehensive mapping between enforcement hooks and agent archetypes, showing which hooks govern which agents at runtime.

---

## Section 1: Hook-Agent Matrix

This table shows which hooks apply to which agent archetypes. Hooks are triggered by tool usage, so the mapping follows tool permissions.

| Hook                                                                            | Router | Implementer | Reviewer | Documenter | Orchestrator | Researcher |
| ------------------------------------------------------------------------------- | ------ | ----------- | -------- | ---------- | ------------ | ---------- |
| **Universal (PreToolUse All)**                                                  |
| `session-cleanup.cjs`                                                           | x      | x           | x        | x          | x            | x          |
| `execution-limit-monitor-hook.cjs`                                              | x      | x           | x        | x          | x            | x          |
| `tool-scope-validator.cjs`                                                      | x      | x           | x        | x          | x            | x          |
| **Router / Task Tools**                                                         |
| `routing-guard.cjs` (Task, TaskCreate, Edit, Write, NotebookEdit, Bash, Glob, Grep, WebSearch) | x      | x           | x        |            | x            | x          |
| `intent-agent-match.cjs` (PreToolUse Task)                                      | x      |             |          |            | x            |            |
| `spawn-prompt-assembler.cjs` (PreToolUse Task)                                  | x      |             |          |            | x            |            |
| `pre-task-unified.cjs` (PreToolUse Task)                                        | x      |             |          |            | x            |            |
| `config-model-validator.cjs` (PreToolUse Task)                                  | x      |             |          |            | x            |            |
| `spawn-prompt-validator.cjs` (PreToolUse Task)                                  | x      |             |          |            | x            |            |
| `reflection-step0-guard.cjs` (PreToolUse TaskList)                              | x      | x           | x        | x          | x            | x          |
| `task-status-enforcement.cjs` (PreToolUse TaskUpdate)                           | x      | x           | x        | x          | x            | x          |
| `pre-completion-validation.cjs` (PreToolUse TaskUpdate)                         |        | x           | x        | x          |              | x          |
| **Bash Tools (Implementers Only)**                                              |
| `bash-command-validator.cjs` (PreToolUse Bash)                                  |        | x           | x        |            |              | x          |
| `shell-injection-validator.cjs` (PreToolUse Bash)                               |        | x           | x        |            |              | x          |
| `windows-null-sanitizer.cjs` (PreToolUse Bash)                                  |        | x           | x        |            |              | x          |
| **Write/Edit Tools (Implementers + Documenters)**                               |
| `unified-creator-guard.cjs` (PreToolUse Write/Edit)                             |        | x           |          | x          |              |            |
| `unified-pre-write-hook.cjs` (PreToolUse Write/Edit)                            |        | x           |          | x          |              |            |
| `evolution-state-guard.cjs` (PreToolUse Write/Edit)                             |        | x           |          | x          |              |            |
| `research-enforcement.cjs` (PreToolUse Write/Edit)                              |        | x           |          | x          |              |            |
| `quality-gate-validator.cjs` (PreToolUse Write/Edit, TaskUpdate)                |        | x           |          | x          |              |            |
| `conflict-detector.cjs` (PreToolUse Write)                                      |        | x           |          | x          |              |            |
| **Read Tools (All with Read Access)**                                           |
| `validate-skill-invocation.cjs` (PreToolUse Read)                               | x      | x           | x        | x          | x            | x          |
| **PostToolUse Hooks (Monitoring)**                                              |
| `metrics-collector-hook.cjs` (PostToolUse All)                                  | x      | x           | x        | x          | x            | x          |
| `error-tracker-hook.cjs` (PostToolUse All)                                      | x      | x           | x        | x          | x            | x          |
| `anomaly-detector.cjs` (PostToolUse All)                                        | x      | x           | x        | x          | x            | x          |
| `post-task-unified.cjs` (PostToolUse Task)                                      | x      |             |          |            | x            |            |
| `task-list-tracker.cjs` (PostToolUse TaskList)                                  | x      | x           | x        | x          | x            | x          |
| `post-completion-chain.cjs` (PostToolUse TaskUpdate)                            |        | x           | x        | x          |              | x          |
| `sync-memory-index.cjs` (PostToolUse Write/Edit/MemoryRecord)                   |        | x           |          | x          |              |            |
| `code-index-updater.cjs` (PostToolUse Write/Edit)                               |        | x           |          | x          |              |            |
| **Reflection Hooks**                                                            |
| `unified-reflection-handler.cjs` (PostToolUse Task/TaskUpdate/Bash, SessionEnd) | x      | x           | x        | x          | x            | x          |
| `reflection-queue-processor.cjs` (SessionEnd)                                   | x      | x           | x        | x          | x            | x          |
| **User Prompt Hooks (Router Only)**                                             |
| `state-reset.cjs` (UserPromptSubmit)                                            | x      |             |          |            |              |            |
| `user-prompt-unified.cjs` (UserPromptSubmit)                                    | x      |             |          |            |              |            |
| `force-step0-execution.cjs` (UserPromptSubmit)                                  | x      |             |          |            |              |            |
| **Stop Hooks**                                                                  |
| `check-console-log.cjs` (Stop)                                                  | x      | x           | x        | x          | x            | x          |

**Agent Archetype Definitions:**

- **Router**: router.md (tools: Task, TaskList, TaskCreate, TaskUpdate, TaskGet, Read, AskUserQuestion)
- **Implementer**: developer, planner, qa, security-architect, architect, devops, all domain specialists (tools: Read, Write, Edit, Bash, Glob, Grep, Task\*, WebSearch)
- **Reviewer**: code-reviewer (tools: Read, Glob, Grep, Bash, Task\* - NO Write/Edit)
- **Documenter**: technical-writer, c4-_ agents (tools: Read, Write, Edit, Glob, Grep, Task_ - NO Bash for c4 agents)
- **Orchestrator**: master-orchestrator, evolution-orchestrator, party-orchestrator, swarm-coordinator (tools: Task, TaskList, TaskCreate, TaskUpdate, TaskGet, Read)
- **Researcher**: researcher, reverse-engineer (tools: Read, Grep, Glob, WebSearch, WebFetch, Task\*)

---

## Section 2: Environment Variable Overrides

These environment variables control hook enforcement modes. Set them in `.env` to override defaults.

| Variable                       | Hook                       | Default | Values         | Purpose                                                     |
| ------------------------------ | -------------------------- | ------- | -------------- | ----------------------------------------------------------- |
| `PLANNER_FIRST_ENFORCEMENT`    | routing-guard.cjs          | block   | block/warn/off | Require planner for complex tasks                           |
| `SECURITY_REVIEW_ENFORCEMENT`  | routing-guard.cjs          | block   | block/warn/off | Require security-architect for security work                |
| `CREATOR_GUARD`                | unified-creator-guard.cjs  | block   | block/warn/off | Block direct artifact writes (SKILL.md, agents/\*.md, etc.) |
| `REFLECTION_STEP0_ENFORCEMENT` | reflection-step0-guard.cjs | warn    | block/warn/off | Block TaskList when pending reflections                     |
| `SPAWN_PROMPT_VALIDATOR`       | spawn-prompt-validator.cjs | warn    | block/warn/off | Validate spawn prompt structure                             |
| `CONFIG_MODEL_VALIDATOR`       | config-model-validator.cjs | warn    | block/warn/off | Validate model matches config.yaml                          |
| `INTENT_AGENT_ENFORCEMENT`     | intent-agent-match.cjs     | block   | block/warn/off | Match intent to correct agent type                          |
| `TOOL_SCOPE_VALIDATOR`         | tool-scope-validator.cjs   | warn    | block/warn/off | Validate tool in agent's allowed set                        |
| `ROUTER_WRITE_GUARD`           | routing-guard.cjs          | block   | block/warn/off | Block Router from using Write/Edit/NotebookEdit             |
| `ROUTER_SELF_CHECK`            | routing-guard.cjs          | block   | block/warn/off | Enforce Router self-check gates                             |
| `TASKLIST_FIRST_ENFORCEMENT`   | routing-guard.cjs          | warn    | block/warn/off | Enforce TaskList() before Task()                            |
| `STATE_STALE_THRESHOLD_MS`     | routing-guard.cjs          | 600000  | number         | State staleness threshold (ms)                              |
| `RESEARCH_ENFORCEMENT`         | research-enforcement.cjs   | block   | block/warn/off | Enforce research-synthesis before creators                  |

**Enforcement Modes:**

- **block** (default for most): Hook prevents tool execution and returns error
- **warn**: Hook allows execution but emits warning message
- **off**: Hook is disabled (dangerous - not recommended)

**Recommended Production Settings:**

```bash
# .env
PLANNER_FIRST_ENFORCEMENT=block
SECURITY_REVIEW_ENFORCEMENT=block
CREATOR_GUARD=block
REFLECTION_STEP0_ENFORCEMENT=warn
SPAWN_PROMPT_VALIDATOR=warn
CONFIG_MODEL_VALIDATOR=warn
INTENT_AGENT_ENFORCEMENT=block
TOOL_SCOPE_VALIDATOR=warn
```

---

## Section 3: Hook Categories

Hooks are organized into 10 categories based on their primary function:

### Routing Hooks (11)

- `routing-guard.cjs` - Planner-first, security review, Router tool blacklist
- `intent-agent-match.cjs` - Warns when spawned agent mismatches detected intent
- `spawn-prompt-assembler.cjs` - Enriches spawn prompts with context
- `pre-task-unified.cjs` - TaskList-first enforcement, documentation routing
- `config-model-validator.cjs` - Validates model matches config.yaml
- `tool-scope-validator.cjs` - Validates tool within agent's allowed set
- `task-status-enforcement.cjs` - Validates TaskUpdate status transitions
- `post-task-unified.cjs` - Post-Task coordination
- `task-list-tracker.cjs` - Tracks TaskList calls
- `code-index-updater.cjs` - Updates code search index after edits
- `unified-creator-guard.cjs` - Blocks direct writes to creator output paths

### Safety Hooks (5)

- `bash-command-validator.cjs` - Blocks dangerous shell commands
- `shell-injection-validator.cjs` - Blocks shell injection patterns
- `windows-null-sanitizer.cjs` - Prevents Windows reserved name issues
- `validate-skill-invocation.cjs` - Validates skill file reads
- `spawn-prompt-validator.cjs` - Validates spawn prompt structure

### Evolution Hooks (5)

- `evolution-state-guard.cjs` - Protects evolution state files
- `research-enforcement.cjs` - Enforces research-before-creation
- `quality-gate-validator.cjs` - Workflow quality gates
- `conflict-detector.cjs` - Detects conflicting file writes
- `unified-pre-write-hook.cjs` - 11 consolidated write checks

### Reflection Hooks (3)

- `reflection-step0-guard.cjs` - Blocks TaskList when pending reflections
- `unified-reflection-handler.cjs` - Queues reflections
- `reflection-queue-processor.cjs` - Processes queued reflections

### Memory Hooks (1)

- `sync-memory-index.cjs` - Syncs memory index after writes

### Monitoring Hooks (3)

- `execution-limit-monitor-hook.cjs` - Monitors execution limits
- `metrics-collector-hook.cjs` - Collects performance metrics
- `error-tracker-hook.cjs` - Tracks errors

### Workflow Hooks (1)

- `post-completion-chain.cjs` - Auto-advances workflow phases

### Session Hooks (2)

- `state-reset.cjs` - Resets router state per prompt
- `session-cleanup.cjs` - Session housekeeping

### Validation Hooks (2)

- `pre-completion-validation.cjs` - Validates completion quality
- `check-console-log.cjs` - Checks for console.log in production code

### Self-Healing Hooks (1)

- `anomaly-detector.cjs` - Detects anomalies

### User Prompt Hooks (2)

- `user-prompt-unified.cjs` - Router analysis, token monitoring
- `force-step0-execution.cjs` - Forces reflection check

---

## Section 4: Hook Execution Order Per Event

Hooks execute in registration order within each event. Understanding execution order helps debug hook conflicts.

### UserPromptSubmit (Router only)

1. `state-reset.cjs` - Reset router state
2. `user-prompt-unified.cjs` - Analyze prompt, monitor tokens
3. `force-step0-execution.cjs` - Force reflection check

### PreToolUse (All Tools)

1. `session-cleanup.cjs` - Session housekeeping
2. `execution-limit-monitor-hook.cjs` - Check execution limits
3. `tool-scope-validator.cjs` - Validate tool in agent's allowed set

### PreToolUse (Bash)

1. `bash-command-validator.cjs` - Block dangerous commands
2. `shell-injection-validator.cjs` - Block injection patterns
3. `windows-null-sanitizer.cjs` - Prevent reserved names
4. `routing-guard.cjs` - Router bash whitelist

### PreToolUse (Write/Edit/NotebookEdit)

1. `routing-guard.cjs` - Block Router writes (except allowed paths)
2. `unified-creator-guard.cjs` - Block creator path writes
3. `unified-pre-write-hook.cjs` - 11 consolidated checks
4. `evolution-state-guard.cjs` - Protect evolution state
5. `research-enforcement.cjs` - Enforce research
6. `quality-gate-validator.cjs` - Workflow gates
7. `conflict-detector.cjs` (Write only) - Detect conflicts

### PreToolUse (Task)

1. `intent-agent-match.cjs` - Check intent-agent match
2. `spawn-prompt-assembler.cjs` - Enrich spawn prompt
3. `pre-task-unified.cjs` - TaskList-first enforcement
4. `config-model-validator.cjs` - Validate model
5. `spawn-prompt-validator.cjs` - Validate prompt structure

### PreToolUse (TaskUpdate)

1. `task-status-enforcement.cjs` - Validate status transition
2. `pre-completion-validation.cjs` - Validate completion quality
3. `quality-gate-validator.cjs` - Workflow gates

### PostToolUse (All Tools)

1. `metrics-collector-hook.cjs` - Collect metrics
2. `error-tracker-hook.cjs` - Track errors
3. `anomaly-detector.cjs` - Detect anomalies

### PostToolUse (Write/Edit/MemoryRecord)

1. `sync-memory-index.cjs` - Sync memory index
2. `code-index-updater.cjs` (Write/Edit only) - Update code index

### PostToolUse (Task/TaskUpdate/Bash)

1. `unified-reflection-handler.cjs` - Queue reflections

### SessionEnd

1. `unified-reflection-handler.cjs` - Queue pending reflections
2. `reflection-queue-processor.cjs` - Process queued reflections

### Stop

1. `check-console-log.cjs` - Check for console.log

---

## Section 5: Orphan Hooks (Archived)

These 45 hooks have been archived to `.claude/hooks/_archive/` as they are no longer registered in `settings.json`. They are preserved for reference but not actively used.

**Archive Directory:** `.claude/hooks/_archive/`

See `.claude/hooks/_archive/README.md` for the complete list and archival reasons.

**Why Archived:**

- Superseded by consolidated hooks (e.g., `execution-limit-monitor.cjs` → `execution-limit-monitor-hook.cjs`)
- Consolidated into unified hooks (e.g., routing guards → `routing-guard.cjs`)
- Functionality moved to library modules (e.g., `router-state.cjs` → `.claude/lib/routing/router-state.cjs`)

**Note:** The archive preserves Git history via `git mv` for future reference or restoration if needed.

---

## Section 6: Cross-References

**Related Documentation:**

- **@ENFORCEMENT_HOOKS.md** - Detailed hook enforcement logic (Section 1.3)
- **HOOKS_REFERENCE.md** - Complete hook catalog with implementation details
- **CLAUDE.md Section 1.3** - Hook enforcement overview in main routing doc
- **@TASK_TRACKING_GUIDE.md** - TaskUpdate protocol enforced by task-status-enforcement.cjs

**Related Files:**

- `.claude/settings.json` - Hook registration (source of truth)
- `.env.example` - Environment variable examples
- `.claude/lib/routing/router-state.cjs` - Shared state module used by hooks
- `.claude/hooks/safety/validators/registry.cjs` - Validator modules used by bash-command-validator.cjs

---

**Provenance:** Created by developer agent for Task #41 (Hook-Agent Alignment Deep Dive)
