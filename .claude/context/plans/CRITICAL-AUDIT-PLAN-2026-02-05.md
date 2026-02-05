# CRITICAL AUDIT PLAN: Agent Studio Memory System & Fundamentals

**Date**: 2026-02-05
**Version**: 1.0.0
**Purpose**: Comprehensive, no-slack audit of the entire `.claude` memory and application system
**Objective**: Independent verification - identify what is NOT wired in, won't work, or is broken with extreme scrutiny
**Previous Audit Claim**: 92/100 health (post 2026-02-05 work) - to be independently verified

---

## EXECUTIVE SUMMARY

This audit plan is designed with **forensic detail** to expose any gaps, half-implementations, dead code, or broken integrations. The audit assumes nothing works until proven otherwise.

### Audit Philosophy

1. **Trust Nothing**: Previous audit claims must be re-verified independently
2. **Trace Execution Paths**: Don't just check files exist - verify they actually run
3. **Test Integration Points**: Many components exist but aren't wired together
4. **Check Failure Modes**: What happens when things break?
5. **Verify Enforcement**: Are guards actually blocking or just logging?

### Known Open Issues (Starting Point)

| Issue ID | Severity | Description |
|----------|----------|-------------|
| LINT-001 | HIGH | ADR-076 migration lint errors |
| MIGRATION-001 | LOW | Test file count discrepancy |
| TOOL-001 | HIGH | 14 agents with invalid tool references |
| META-003 | LOW | Evolution state completion record missing |
| UPDATER-001 | LOW | Test count discrepancy |

### Pending Reflection Queue (Critical Finding)

**9 pending reflection requests** found in `reflection-spawn-request.json` - these have NOT been processed. This indicates the Step 0 reflection protocol may not be working correctly.

---

## PHASE 1: MEMORY SYSTEM DEEP DIVE

### 1.1 SQLite Database Verification

**Previous Claim**: Memory database initialized (65KB)

**Verification Tasks**:

| Task ID | Description | Files to Check | Success Criteria |
|---------|-------------|----------------|------------------|
| **1.1.1** | Database file exists and is valid SQLite | `.claude/data/memory.db` | `sqlite3 .claude/data/memory.db ".tables"` returns tables |
| **1.1.2** | Required tables exist | `memory.db` | Tables: `memories`, `entities`, `relationships`, `access_log` exist |
| **1.1.3** | Database has actual data | `memory.db` | `SELECT COUNT(*) FROM memories` returns > 0 |
| **1.1.4** | Entity sync is working | `.claude/lib/memory/memory-entity-links.cjs` | Function `insertEntity()` can write to DB |
| **1.1.5** | Database path resolution | `.claude/lib/memory/memory-manager.cjs` | Check `getDbPath()` returns correct path |

**Commands to Execute**:
```bash
# Check database exists and size
ls -la .claude/data/memory.db

# Verify SQLite integrity
sqlite3 .claude/data/memory.db ".tables"
sqlite3 .claude/data/memory.db "SELECT COUNT(*) FROM memories"
sqlite3 .claude/data/memory.db "PRAGMA integrity_check"

# Check for recent writes
sqlite3 .claude/data/memory.db "SELECT * FROM memories ORDER BY created_at DESC LIMIT 5"
```

**Risk Level**: HIGH - if DB doesn't work, entire memory system is broken

---

### 1.2 Cold Storage Scheduler Verification

**Previous Claim**: Scheduler is operational, runs daily/weekly tasks

**Verification Tasks**:

| Task ID | Description | Files to Check | Success Criteria |
|---------|-------------|----------------|------------------|
| **1.2.1** | Scheduler module loads without error | `.claude/lib/memory/memory-scheduler.cjs` | `node -e "require('./.claude/lib/memory/memory-scheduler.cjs')"` succeeds |
| **1.2.2** | Status file updated recently | `.claude/context/memory/maintenance-status.json` | `lastDaily` within 24 hours, `lastWeekly` within 7 days |
| **1.2.3** | History shows actual task execution | `maintenance-status.json` | History entries have `success: true` |
| **1.2.4** | Scheduler is triggered by something | (Find trigger mechanism) | Hook/cron/manual - what invokes it? |
| **1.2.5** | Individual tasks actually run | Each task in CONFIG.TASKS | Trace `runTask()` function for each task type |
| **1.2.6** | Cold archive destination exists | `.claude/context/memory/archive/` | Archive files exist with recent dates |

**Commands to Execute**:
```bash
# Check scheduler loads
node -e "const s = require('./.claude/lib/memory/memory-scheduler.cjs'); console.log(Object.keys(s))"

# Check status file
cat .claude/context/memory/maintenance-status.json | jq '.lastDaily, .lastWeekly'

# List archive files
ls -la .claude/context/memory/archive/

# Check scheduler status command
node .claude/lib/memory/memory-scheduler.cjs status
```

**CRITICAL QUESTION**: How is the scheduler invoked? Is it:
- A cron job? (Unlikely - no evidence)
- A hook? (Check settings.json for scheduler triggers)
- Manual only? (Defeats the purpose of "scheduler")
- Never? (Could be dead code)

**Risk Level**: HIGH - if scheduler doesn't run automatically, maintenance doesn't happen

---

### 1.3 Entity Links System Verification

**Previous Claim**: Entity links module exists and is used by scheduler

**Verification Tasks**:

| Task ID | Description | Files to Check | Success Criteria |
|---------|-------------|----------------|------------------|
| **1.3.1** | Module loads without error | `.claude/lib/memory/memory-entity-links.cjs` | No require() errors |
| **1.3.2** | Functions are exported | `memory-entity-links.cjs` | `insertEntity`, `insertRelationship`, `getRelatedEntities` exist |
| **1.3.3** | Functions are called from somewhere | (grep for usage) | At least one caller in codebase |
| **1.3.4** | Database operations succeed | Test with actual data | Write/read cycle works |
| **1.3.5** | Links persist across sessions | Check DB directly | `relationships` table has data |

**Commands to Execute**:
```bash
# Check module loads
node -e "const e = require('./.claude/lib/memory/memory-entity-links.cjs'); console.log(Object.keys(e))"

# Find callers
grep -r "memory-entity-links" .claude/ --include="*.cjs" --include="*.mjs"
grep -r "insertEntity\|insertRelationship\|getRelatedEntities" .claude/lib/ --include="*.cjs"

# Check relationships in DB
sqlite3 .claude/data/memory.db "SELECT COUNT(*) FROM relationships"
```

**Risk Level**: MEDIUM - entity links enhance memory but aren't critical path

---

### 1.4 Archive Rotation Verification

**Previous Claim**: Archive tool works and gets used

**Verification Tasks**:

| Task ID | Description | Files to Check | Success Criteria |
|---------|-------------|----------------|------------------|
| **1.4.1** | Archive tool exists | `.claude/tools/cli/archive-memory.mjs` | File exists and parses |
| **1.4.2** | Archive directory structure correct | `.claude/context/memory/archive/` | Index files + content files exist |
| **1.4.3** | Archives contain actual data | Archive files | Line count > 10 (not just headers) |
| **1.4.4** | Source files are trimmed after archive | `learnings.md`, `decisions.md`, `issues.md` | Size reduced vs original |
| **1.4.5** | Archive is discoverable | Index files | Links to weekly/monthly archives work |
| **1.4.6** | Rotation is triggered | Find caller | Hook/scheduled/manual |

**Commands to Execute**:
```bash
# List archive files with sizes
ls -la .claude/context/memory/archive/

# Check archive content (not just headers)
wc -l .claude/context/memory/archive/*.md

# Check for recent archival (modified dates)
find .claude/context/memory/archive -name "*.md" -mtime -7

# Verify index file exists
cat .claude/context/memory/archive/learnings-2026-01-index.md | head -20
```

**CRITICAL ISSUE FOUND**: Previous data loss incident (2026-02-05) where issues.md was truncated but archive was empty. Verify this is fixed.

**Risk Level**: HIGH - data loss risk if archival is broken

---

### 1.5 Compression System Verification

**Previous Claim**: Compression trigger protocol exists

**Verification Tasks**:

| Task ID | Description | Files to Check | Success Criteria |
|---------|-------------|----------------|------------------|
| **1.5.1** | Compression reminder file mechanism | `.claude/context/runtime/compression-reminder.txt` | File creation/detection works |
| **1.5.2** | Auto-compression trigger hook | `.claude/hooks/safety/auto-compression-trigger.cjs` | Hook is registered in settings.json |
| **1.5.3** | Context-compressor skill exists | `.claude/skills/context-compressor/SKILL.md` | Skill file exists and is valid |
| **1.5.4** | Compression is invoked when triggered | (Trace execution) | Skill() call happens |
| **1.5.5** | Compression actually reduces context | (Measure before/after) | Token count decreases |

**Commands to Execute**:
```bash
# Check hook exists
ls -la .claude/hooks/safety/auto-compression-trigger.cjs

# Check if hook is registered
grep "auto-compression-trigger" .claude/settings.json

# Check skill exists
ls -la .claude/skills/context-compressor/SKILL.md

# Check for compression reminder file
ls -la .claude/context/runtime/compression-reminder.txt 2>/dev/null || echo "No reminder file"
```

**Risk Level**: MEDIUM - affects long sessions but not core functionality

---

## PHASE 2: ROUTER PROTOCOL VERIFICATION

### 2.1 Step 0 Reflection Check

**Previous Claim**: PreToolUse(TaskList) guard blocks when pending reflections exist

**CRITICAL FINDING**: 9 pending reflection requests in queue - WHY weren't they processed?

**Verification Tasks**:

| Task ID | Description | Files to Check | Success Criteria |
|---------|-------------|----------------|------------------|
| **2.1.1** | Guard hook is registered | `.claude/settings.json` | `reflection-step0-guard.cjs` in PreToolUse(TaskList) |
| **2.1.2** | Guard actually runs | Hook output | Stderr shows `hook_start` when TaskList called |
| **2.1.3** | Guard detects pending reflections | `hasPendingReflections()` | Returns true when spawn-request.json has entries |
| **2.1.4** | Guard blocks TaskList in block mode | Exit code | Returns exit code 2 with formatResult('block') |
| **2.1.5** | Enforcement mode is correct | `REFLECTION_STEP0_ENFORCEMENT` env var | Default is 'block' |
| **2.1.6** | Reminder file triggers guard | `reflection-reminder.txt` | If file exists, guard activates |

**Commands to Execute**:
```bash
# Check hook registration
grep -A5 "TaskList" .claude/settings.json | grep "reflection-step0-guard"

# Check pending reflections
cat .claude/context/runtime/reflection-spawn-request.json | jq 'length'

# Check reminder file
ls -la .claude/context/runtime/reflection-reminder.txt 2>/dev/null || echo "No reminder"

# Test guard function
node -e "const g = require('./.claude/hooks/reflection/reflection-step0-guard.cjs'); console.log('hasPending:', g.hasPendingReflections())"
```

**CRITICAL QUESTION**: If the guard is working, why are there 9 unprocessed reflections?
- Is the guard in 'warn' mode instead of 'block'?
- Is REFLECTION_ENABLED=false?
- Is the queue being populated but never consumed?

**Risk Level**: HIGH - routing protocol depends on this

---

### 2.2 TaskList Functionality

**Verification Tasks**:

| Task ID | Description | Files to Check | Success Criteria |
|---------|-------------|----------------|------------------|
| **2.2.1** | TaskList is called first by router | CLAUDE.md, router-decision.md | Documentation requires TaskList() first |
| **2.2.2** | TaskList returns correct state | TaskList() output | Returns tasks with correct status |
| **2.2.3** | TaskList triggers post-tool hooks | `task-list-tracker.cjs` | Hook fires after TaskList |
| **2.2.4** | TaskList respects reflection guard | Guard interaction | Only runs if guard allows |

**Risk Level**: HIGH - core routing depends on this

---

### 2.3 Task Spawning with task_id

**Previous Claim**: task_id is REQUIRED for spawn traceability

**Verification Tasks**:

| Task ID | Description | Files to Check | Success Criteria |
|---------|-------------|----------------|------------------|
| **2.3.1** | Task() calls include task_id | spawn-log.jsonl | All entries have non-null task_id |
| **2.3.2** | task_id is logged correctly | `post-task-unified.cjs` | Hook writes task_id to spawn-log |
| **2.3.3** | No null task_id entries | spawn-log.jsonl | `grep "task_id\":null" returns 0 |
| **2.3.4** | task_id format is consistent | spawn-log.jsonl | Pattern: `spawn-{timestamp}-{agent}-{session}` |
| **2.3.5** | Spawn templates include task_id | `universal-agent-spawn.md` | Template has task_id placeholder |

**Commands to Execute**:
```bash
# Check for null task_ids
grep '"task_id":null' .claude/context/metrics/spawn-log.jsonl | wc -l

# Check task_id format
head -5 .claude/context/metrics/spawn-log.jsonl | jq '.task_id'

# Verify spawn template
grep -n "task_id" .claude/templates/spawn/universal-agent-spawn.md
```

**Risk Level**: HIGH - traceability depends on this

---

### 2.4 Tool Whitelist/Blacklist Enforcement

**Previous Claim**: Router may only use whitelisted tools

**Verification Tasks**:

| Task ID | Description | Files to Check | Success Criteria |
|---------|-------------|----------------|------------------|
| **2.4.1** | routing-guard.cjs is registered | settings.json | Hook registered for Bash/Edit/Write/Glob/Grep |
| **2.4.2** | Guard detects router context | `isRouterContext()` function | Returns true for router, false for agents |
| **2.4.3** | Blacklisted tools blocked for router | routing-guard.cjs | Returns 'block' for blacklisted tools |
| **2.4.4** | Whitelisted tools allowed | routing-guard.cjs | Task/TaskList/Read allowed |
| **2.4.5** | tool-scope-validator works | tool-scope-validator.cjs | Validates tool scope per agent |

**Commands to Execute**:
```bash
# Check routing-guard registration
grep -B5 -A5 "routing-guard" .claude/settings.json

# Check tool-scope-validator
grep -B5 -A5 "tool-scope-validator" .claude/settings.json

# Find isRouterContext function
grep -n "isRouterContext" .claude/hooks/routing/*.cjs
```

**Risk Level**: HIGH - security depends on this

---

### 2.5 Model Resolution from config.yaml

**Previous Claim**: config-model-validator.cjs validates spawn model matches config

**Verification Tasks**:

| Task ID | Description | Files to Check | Success Criteria |
|---------|-------------|----------------|------------------|
| **2.5.1** | config.yaml exists and is valid | `.claude/config/config.yaml` | YAML parses without error |
| **2.5.2** | Agent models defined in config | config.yaml | `agents.{type}.model` keys exist |
| **2.5.3** | agent-config-reader.cjs works | `.claude/lib/utils/agent-config-reader.cjs` | `resolveAgentModel()` returns expected values |
| **2.5.4** | Validator hook is registered | settings.json | `config-model-validator.cjs` in PreToolUse(Task) |
| **2.5.5** | Validator warns on mismatch | Test with wrong model | Warning logged |
| **2.5.6** | Model precedence is correct | ADR-075 | Task override > frontmatter > config.yaml > default |

**Commands to Execute**:
```bash
# Check config.yaml
cat .claude/config/config.yaml | grep -A10 "agents:"

# Check agent-config-reader
node -e "const r = require('./.claude/lib/utils/agent-config-reader.cjs'); console.log(r.resolveAgentModel('planner', process.cwd()))"

# Check validator registration
grep "config-model-validator" .claude/settings.json
```

**Risk Level**: MEDIUM - affects cost/performance but not functionality

---

## PHASE 3: SPAWNING INFRASTRUCTURE

### 3.1 Universal Spawn Templates

**Verification Tasks**:

| Task ID | Description | Files to Check | Success Criteria |
|---------|-------------|----------------|------------------|
| **3.1.1** | Template file exists and is valid | `.claude/templates/spawn/universal-agent-spawn.md` | File parses as markdown |
| **3.1.2** | Template has required placeholders | Template file | `<ROLE>`, `<TASK>`, `<ID>`, `PROJECT_ROOT` present |
| **3.1.3** | 70-line TaskUpdate warning box exists | Template file | Warning box about TaskUpdate is present |
| **3.1.4** | Template includes memory protocol | Template file | "Read learnings.md" instruction present |
| **3.1.5** | spawn-prompt-assembler.cjs uses template | spawn-prompt-assembler.cjs | Reads and substitutes template |
| **3.1.6** | Fallback if template load fails | CLAUDE.md Section 2 | Inline fallback documented |

**Commands to Execute**:
```bash
# Check template exists
ls -la .claude/templates/spawn/universal-agent-spawn.md

# Check for TaskUpdate warning
grep -c "TaskUpdate" .claude/templates/spawn/universal-agent-spawn.md

# Check for placeholders
grep -E "<ROLE>|<TASK>|<ID>|PROJECT_ROOT" .claude/templates/spawn/universal-agent-spawn.md

# Check spawn-prompt-assembler
grep "universal-agent-spawn" .claude/hooks/routing/spawn-prompt-assembler.cjs
```

**Risk Level**: HIGH - all agents depend on spawn templates

---

### 3.2 Task Tracking (TaskUpdate)

**Previous Claim**: TaskUpdate is MANDATORY

**Verification Tasks**:

| Task ID | Description | Files to Check | Success Criteria |
|---------|-------------|----------------|------------------|
| **3.2.1** | TaskUpdate enforcement hook exists | `.claude/hooks/routing/task-status-enforcement.cjs` | File exists and loads |
| **3.2.2** | Hook is registered | settings.json | In PreToolUse(TaskUpdate) |
| **3.2.3** | Hook validates status transitions | Hook code | in_progress -> completed valid, other transitions checked |
| **3.2.4** | task-completion-guard.cjs warns on missing | task-completion-guard.cjs | Warns if agent exits without TaskUpdate |
| **3.2.5** | Spawn log shows task tracking | spawn-log.jsonl | start/end events paired |

**Commands to Execute**:
```bash
# Check enforcement hook
grep "task-status-enforcement" .claude/settings.json

# Check completion guard
grep "task-completion-guard" .claude/settings.json

# Check spawn log for paired events
grep "spawn_start" .claude/context/metrics/spawn-log.jsonl | wc -l
grep "spawn_end" .claude/context/metrics/spawn-log.jsonl | wc -l
```

**Risk Level**: HIGH - task tracking depends on this

---

### 3.3 Agent Registry Synchronization

**Verification Tasks**:

| Task ID | Description | Files to Check | Success Criteria |
|---------|-------------|----------------|------------------|
| **3.3.1** | Registry file exists | `.claude/context/agent-registry.json` | Valid JSON |
| **3.3.2** | Agent count matches filesystem | Registry vs `.claude/agents/**/*.md` | Counts match |
| **3.3.3** | All agents have health status | Registry | `health.status` present for all |
| **3.3.4** | Registry generation tool works | `.claude/tools/cli/generate-agent-registry.cjs` | Tool runs without error |
| **3.3.5** | Registry is fresh | `generatedAt` field | Within last 7 days |

**Commands to Execute**:
```bash
# Check registry metadata
cat .claude/context/agent-registry.json | jq '.metadata'

# Count agents in registry vs filesystem
cat .claude/context/agent-registry.json | jq '.metadata.totalAgents'
find .claude/agents -name "*.md" | wc -l

# Check generation tool
node .claude/tools/cli/generate-agent-registry.cjs --dry-run
```

**Risk Level**: MEDIUM - affects agent discovery

---

### 3.4 Skill Catalog System

**Verification Tasks**:

| Task ID | Description | Files to Check | Success Criteria |
|---------|-------------|----------------|------------------|
| **3.4.1** | Skill catalog exists | `.claude/context/artifacts/skill-catalog.md` | File exists |
| **3.4.2** | Skill index exists | `.claude/context/artifacts/skill-index.json` | Valid JSON |
| **3.4.3** | Skills match filesystem | Index vs `.claude/skills/**/SKILL.md` | Counts match |
| **3.4.4** | Skill() tool works | (Test invocation) | Skill loads when invoked |
| **3.4.5** | validate-skill-invocation.cjs works | Hook file | Warns when skill not invoked via Skill() |

**Commands to Execute**:
```bash
# Count skills
find .claude/skills -name "SKILL.md" | wc -l

# Check skill index
cat .claude/context/artifacts/skill-index.json | jq 'length'

# Check validation hook
grep "validate-skill-invocation" .claude/settings.json
```

**Risk Level**: MEDIUM - skill discovery depends on this

---

## PHASE 4: HOOK SYSTEM VERIFICATION

### 4.1 Reflection Guard Hook

**Verification Tasks**:

| Task ID | Description | Files to Check | Success Criteria |
|---------|-------------|----------------|------------------|
| **4.1.1** | Hook file exists | `.claude/hooks/reflection/reflection-step0-guard.cjs` | File exists and parses |
| **4.1.2** | Hook is registered | settings.json | In PreToolUse(TaskList) matcher |
| **4.1.3** | hasPendingReflections() works | Test function | Returns true when queue has items |
| **4.1.4** | Enforcement mode is 'block' | Environment/default | Not set to 'warn' or 'off' |
| **4.1.5** | Hook outputs correct format | formatResult() | Returns JSON with 'block' decision |
| **4.1.6** | Exit code is 2 on block | Hook behavior | Exits with code 2 |

**CRITICAL TEST**: With 9 pending reflections, run hook and verify it blocks.

```bash
# Test hook directly
echo '{"tool_name":"TaskList","tool_input":{}}' | node .claude/hooks/reflection/reflection-step0-guard.cjs
echo "Exit code: $?"
```

**Risk Level**: HIGH - routing protocol integrity

---

### 4.2 Creator Guard Hook

**Verification Tasks**:

| Task ID | Description | Files to Check | Success Criteria |
|---------|-------------|----------------|------------------|
| **4.2.1** | Hook file exists | `.claude/hooks/routing/unified-creator-guard.cjs` | File exists |
| **4.2.2** | Hook is registered | settings.json | In PreToolUse(Edit\|Write) |
| **4.2.3** | Protected paths defined | Hook code | Skills, agents, hooks, workflows, templates, schemas |
| **4.2.4** | Block mode is default | CREATOR_GUARD env | Not 'warn' or 'off' |
| **4.2.5** | Blocks direct writes to protected paths | Test | Writing to .claude/skills/*/SKILL.md blocked |

**Risk Level**: HIGH - prevents "invisible artifacts"

---

### 4.3 Memory Health Checks

**Verification Tasks**:

| Task ID | Description | Files to Check | Success Criteria |
|---------|-------------|----------------|------------------|
| **4.3.1** | Hook file exists | `.claude/hooks/memory/memory-health-check.cjs` | File exists |
| **4.3.2** | Hook is registered | settings.json | In UserPromptSubmit |
| **4.3.3** | Health check runs on prompt | Hook output | Stderr shows health check ran |
| **4.3.4** | Health metrics are logged | hook-metrics.jsonl | Entries for memory-health-check |

**Commands to Execute**:
```bash
# Check registration
grep "memory-health-check" .claude/settings.json

# Check hook-metrics for memory entries
grep "memory-health" .claude/context/metrics/hook-metrics.jsonl
```

**Risk Level**: MEDIUM - monitoring depends on this

---

### 4.4 Spawn Log Validation

**Verification Tasks**:

| Task ID | Description | Files to Check | Success Criteria |
|---------|-------------|----------------|------------------|
| **4.4.1** | Spawn log file exists | `.claude/context/metrics/spawn-log.jsonl` | File exists |
| **4.4.2** | Entries are valid JSON | Each line | `jq` parses each line |
| **4.4.3** | No null task_ids | Spawn log | Zero entries with task_id:null |
| **4.4.4** | start/end events paired | Spawn log | Equal counts |
| **4.4.5** | post-task-unified.cjs writes correctly | Hook code | Writes spawn_start/spawn_end |
| **4.4.6** | Errors are captured | spawn_end events | error field populated on failures |

**Commands to Execute**:
```bash
# Validate JSON
cat .claude/context/metrics/spawn-log.jsonl | jq -c '.' > /dev/null && echo "Valid JSON"

# Check for null task_ids
grep '"task_id":null' .claude/context/metrics/spawn-log.jsonl | wc -l

# Check paired events
echo "start: $(grep spawn_start .claude/context/metrics/spawn-log.jsonl | wc -l)"
echo "end: $(grep spawn_end .claude/context/metrics/spawn-log.jsonl | wc -l)"
```

**Risk Level**: HIGH - traceability depends on this

---

### 4.5 Shell Validator

**Verification Tasks**:

| Task ID | Description | Files to Check | Success Criteria |
|---------|-------------|----------------|------------------|
| **4.5.1** | shellcheck-validator.cjs exists | `.claude/hooks/safety/shellcheck-validator.cjs` | File exists |
| **4.5.2** | Hook is registered | settings.json | In PreToolUse(Bash) |
| **4.5.3** | Detects dangerous commands | Test with `rm -rf /` | Blocked |
| **4.5.4** | shell-injection-validator.cjs works | Hook file | Blocks injection patterns |
| **4.5.5** | bash-cwd-validator.cjs works | Hook file | Validates CWD for background tasks |
| **4.5.6** | command-allowlist-validator.cjs works | Hook file | Blocks non-allowlisted commands |

**Commands to Execute**:
```bash
# Check all shell validators registered
grep -E "shellcheck-validator|shell-injection-validator|bash-cwd-validator|command-allowlist" .claude/settings.json
```

**Risk Level**: HIGH - security critical

---

## PHASE 5: CRITICAL GAPS ANALYSIS

### 5.1 Documentation vs. Implementation Mismatches

**Tasks**:

| Task ID | Description | Verification Method |
|---------|-------------|---------------------|
| **5.1.1** | CLAUDE.md claims vs actual hooks | Compare Section 1.3 with settings.json |
| **5.1.2** | Tool availability vs agent frontmatter | Cross-reference TOOL-001 findings |
| **5.1.3** | Environment variables documented | Compare @ENVIRONMENT_CONFIG.md with .env.example |
| **5.1.4** | Workflow files vs actual behavior | Test workflow execution paths |

---

### 5.2 Promised Features Not Implemented

**Tasks**:

| Task ID | Description | Where to Check |
|---------|-------------|----------------|
| **5.2.1** | URL allowlist hook | settings.json, .claude/hooks/safety/ |
| **5.2.2** | Hook metrics logging | hook-metrics.jsonl (only 2 entries found) |
| **5.2.3** | Agent health isolation | agent-registry.json health field usage |
| **5.2.4** | Evolution state completion | evolution-state.json recent entries |

---

### 5.3 Broken References or Dead Code

**Tasks**:

| Task ID | Description | How to Find |
|---------|-------------|-------------|
| **5.3.1** | Hooks registered but file missing | Compare settings.json with filesystem |
| **5.3.2** | Skills referenced but not existing | Grep skill invocations vs skill-index.json |
| **5.3.3** | Agents referenced but not in registry | Check spawn log agent types vs registry |
| **5.3.4** | Deprecated files still in use | Find .deprecated files, check for require() |

**Commands to Execute**:
```bash
# Find all hooks in settings.json
grep -oP 'node \.claude/hooks/[^"]+' .claude/settings.json | sort -u > /tmp/registered-hooks.txt

# Check each exists
while read hook; do
  ls ${hook#node } 2>/dev/null || echo "MISSING: $hook"
done < /tmp/registered-hooks.txt
```

---

### 5.4 Missing Integration Points

**Tasks**:

| Task ID | Description | What to Check |
|---------|-------------|---------------|
| **5.4.1** | Memory scheduler trigger mechanism | How is it actually invoked? |
| **5.4.2** | Reflection queue consumer | What processes pending reflections? |
| **5.4.3** | Hook metrics collector invocation | Why only 2 entries in hook-metrics.jsonl? |
| **5.4.4** | Agent health degradation triggers | What causes agent isolation? |

---

### 5.5 Deprecated Code Still in Use

**Tasks**:

| Task ID | Description | Files to Check |
|---------|-------------|----------------|
| **5.5.1** | .deprecated files | `find .claude -name "*.deprecated"` |
| **5.5.2** | Legacy MCP references | 14 agents with Search/SequentialThinking |
| **5.5.3** | Old config formats | thinkingDefault in agent-config.json |
| **5.5.4** | Unused library functions | Dead code in .claude/lib/ |

---

## VERIFICATION METHODS

### M1: Static Analysis

- Read implementation files (not just docs)
- Check hook registration in settings.json
- Verify file paths and dependencies
- Cross-reference imports with exports

### M2: Runtime Testing

- Execute hooks directly with test input
- Run scheduler status commands
- Test database operations
- Invoke functions with test data

### M3: Log Analysis

- Check spawn-log.jsonl for patterns
- Analyze hook-metrics.jsonl
- Review maintenance-status.json history
- Examine error logs

### M4: Integration Testing

- Test end-to-end workflows
- Verify guard blocking behavior
- Check task tracking cycle
- Validate memory persistence

---

## SUCCESS CRITERIA (Pass/Fail)

### Phase 1: Memory System

| Criteria | Pass | Fail |
|----------|------|------|
| SQLite DB has data | `COUNT(*) > 0` | `COUNT(*) = 0` |
| Scheduler ran recently | lastDaily < 24h | lastDaily > 48h |
| Entity links have data | relationships > 0 | relationships = 0 |
| Archives contain content | lines > 50 | lines < 10 (headers only) |
| No data loss incidents | Archive complete | Truncated without archive |

### Phase 2: Router Protocol

| Criteria | Pass | Fail |
|----------|------|------|
| Reflection guard blocks | Exit code 2 | Exit code 0 with pending |
| TaskList works | Returns valid state | Error or empty |
| task_id populated | 100% entries | Any null task_id |
| Tool blacklist enforced | Block on violation | Allow blacklisted |
| Model resolution works | Returns config value | Returns fallback |

### Phase 3: Spawning Infrastructure

| Criteria | Pass | Fail |
|----------|------|------|
| Templates load | Substitution works | Missing placeholders |
| TaskUpdate enforced | Warning on skip | Silent pass |
| Registry accurate | Count matches fs | Discrepancy > 5% |
| Skills discoverable | Index complete | Missing skills |

### Phase 4: Hook System

| Criteria | Pass | Fail |
|----------|------|------|
| All hooks registered | 100% in settings.json | Any missing |
| Hooks execute | Stderr output | Silent failure |
| Guards block | Exit code 2 | Exit code 0 on violation |
| Logs populated | Entries exist | Empty/missing |

### Phase 5: Gaps Analysis

| Criteria | Pass | Fail |
|----------|------|------|
| Docs match implementation | < 5% drift | > 10% drift |
| No dead code | All files referenced | Orphaned files |
| No broken references | All paths resolve | Missing files |
| Integration complete | End-to-end works | Broken chains |

---

## AUDIT EXECUTION ORDER

1. **Phase 1.1-1.5**: Memory System (parallel tasks)
2. **Phase 2.1**: Reflection Guard (CRITICAL - why 9 pending?)
3. **Phase 2.2-2.5**: Router Protocol
4. **Phase 3.1-3.4**: Spawning Infrastructure
5. **Phase 4.1-4.5**: Hook System
6. **Phase 5.1-5.5**: Gaps Analysis
7. **Final**: Consolidate findings, update health score

---

## OUTPUT ARTIFACTS

1. **Audit Report**: `.claude/audit/CRITICAL-AUDIT-REPORT-2026-02-05.md`
2. **Issue Log**: Updates to `.claude/context/memory/issues.md`
3. **Fix Plan**: `.claude/context/plans/CRITICAL-AUDIT-FIX-PLAN.md` (if issues found)
4. **Health Score**: Recalculated based on findings

---

## ESTIMATED EFFORT

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Phase 1 | 25 | 2-3 hours |
| Phase 2 | 21 | 2-3 hours |
| Phase 3 | 18 | 1-2 hours |
| Phase 4 | 21 | 1-2 hours |
| Phase 5 | 14 | 1-2 hours |
| **Total** | **99 tasks** | **7-12 hours** |

---

## IMMEDIATE INVESTIGATION PRIORITY

**TOP PRIORITY**: Why are 9 reflection requests pending?

This indicates one of:
1. Step 0 guard not running (check registration)
2. Guard in warn mode (check REFLECTION_STEP0_ENFORCEMENT)
3. REFLECTION_ENABLED=false (check environment)
4. Queue populated but consumer broken (check reflection-queue-processor.cjs)
5. Router ignoring guard (check routing behavior)

**START HERE**: Task 2.1.1 - Verify reflection guard registration and mode.

---

*Plan created: 2026-02-05*
*Status: READY FOR EXECUTION*
*Author: Planner Agent*
