<!-- Agent: planner | Task: #41 | Session: 2026-02-06 -->

# Plan: Hook-Agent Alignment Deep Dive

## Executive Summary

Align the hook enforcement layer with agent awareness. Currently 39 hooks are registered and actively govern agent behavior, but agents have no visibility into which hooks constrain them. This plan adds "Enforcement Hooks" sections to agent files, archives 49 orphan hooks, creates a hook-to-agent mapping reference, and validates the result.

## Problem Statement

- **88 hook files** on disk, **39 registered** in settings.json, **49 orphans**
- Only 7 files (creator skills) document hook dependencies
- Agents operate under hook governance without knowing it
- New developers cannot understand what governs agent actions
- Hook changes could silently break agent workflows
- `router-state.cjs` is a shared module misplaced in `hooks/routing/`

## Objectives

- Every agent `.md` file has an "Enforcement Hooks" section documenting governance
- 49 orphan hooks archived to `.claude/hooks/_archive/` (validator modules preserved)
- New `@HOOK_AGENT_MAP.md` reference document created in `.claude/docs/`
- `router-state.cjs` relocated from `hooks/routing/` to `lib/routing/`
- HOOKS_REFERENCE.md updated with cross-reference to the new mapping doc
- All tests pass after changes

## Phases

### Phase 1: Add "Enforcement Hooks" Section to Agent Files

**Purpose**: Give every agent visibility into which hooks govern its behavior
**Dependencies**: None
**Parallel OK**: Yes (each agent file is independent)

#### Hook-to-Agent Mapping (Reference for Implementation)

The mapping below is derived from `settings.json` registrations. Each agent type uses specific tools, so hooks triggered by those tools apply to that agent.

**Router** (tools: Task, TaskList, TaskCreate, TaskGet, Read):
- `routing-guard.cjs` -- PreToolUse(Task, TaskCreate, Bash, Glob, Grep, WebSearch) -- enforces planner-first, security review, bash whitelist, tool blacklist
- `intent-agent-match.cjs` -- PreToolUse(Task) -- warns when spawned agent mismatches detected intent
- `spawn-prompt-assembler.cjs` -- PreToolUse(Task) -- enriches spawn prompts with context
- `pre-task-unified.cjs` -- PreToolUse(Task) -- TaskList-first enforcement, documentation routing
- `config-model-validator.cjs` -- PreToolUse(Task) -- validates model matches config.yaml
- `spawn-prompt-validator.cjs` -- PreToolUse(Task) -- validates spawn prompt structure
- `reflection-step0-guard.cjs` -- PreToolUse(TaskList) -- blocks TaskList when pending reflections exist
- `task-status-enforcement.cjs` -- PreToolUse(TaskUpdate) -- validates status transitions
- `user-prompt-unified.cjs` -- UserPromptSubmit -- router analysis, token monitoring
- `state-reset.cjs` -- UserPromptSubmit -- resets router state per prompt
- `force-step0-execution.cjs` -- UserPromptSubmit -- forces reflection check
- `tool-scope-validator.cjs` -- PreToolUse(All) -- validates tool within agent's allowed set
- `execution-limit-monitor-hook.cjs` -- PreToolUse(All) -- monitors execution limits
- `session-cleanup.cjs` -- PreToolUse(All) -- session housekeeping

**Developer** (tools: Read, Write, Edit, Glob, Grep, Bash, WebFetch, WebSearch, Task*):
- `bash-command-validator.cjs` -- PreToolUse(Bash) -- blocks dangerous shell commands
- `shell-injection-validator.cjs` -- PreToolUse(Bash) -- blocks shell injection patterns
- `windows-null-sanitizer.cjs` -- PreToolUse(Bash) -- prevents Windows reserved name issues
- `unified-creator-guard.cjs` -- PreToolUse(Write/Edit) -- blocks direct writes to creator paths
- `unified-pre-write-hook.cjs` -- PreToolUse(Write/Edit) -- 11 consolidated write checks
- `evolution-state-guard.cjs` -- PreToolUse(Write/Edit) -- protects evolution state files
- `research-enforcement.cjs` -- PreToolUse(Write/Edit) -- enforces research-before-creation
- `quality-gate-validator.cjs` -- PreToolUse(Write/Edit, TaskUpdate) -- workflow quality gates
- `conflict-detector.cjs` -- PreToolUse(Write) -- detects conflicting file writes
- `validate-skill-invocation.cjs` -- PreToolUse(Read) -- validates skill file reads
- `tool-scope-validator.cjs` -- PreToolUse(All) -- validates tool within allowed set
- `check-console-log.cjs` -- Stop -- checks for console.log in production code
- `sync-memory-index.cjs` -- PostToolUse(Edit/Write) -- syncs memory index
- `code-index-updater.cjs` -- PostToolUse(Edit/Write) -- updates code search index
- `task-status-enforcement.cjs` -- PreToolUse(TaskUpdate) -- validates status transitions
- `pre-completion-validation.cjs` -- PreToolUse(TaskUpdate) -- validates completion quality

**Planner** (same toolset as Developer):
- Same hooks as Developer (uses Read, Write, Edit, Glob, Grep, Bash)
- Plus: focuses on plan creation so `unified-pre-write-hook.cjs` plan-evolution-guard is relevant

**Security Architect** (tools: Read, Write, Edit, Glob, Grep, Bash, Task*):
- Same Write/Edit/Bash hooks as Developer
- `routing-guard.cjs` security review enforcement ensures this agent IS spawned for security work

**Code Reviewer** (tools: Read, Glob, Grep, Bash, Task* -- NO Write/Edit):
- `bash-command-validator.cjs` -- PreToolUse(Bash)
- `shell-injection-validator.cjs` -- PreToolUse(Bash)
- `windows-null-sanitizer.cjs` -- PreToolUse(Bash)
- `validate-skill-invocation.cjs` -- PreToolUse(Read)
- `tool-scope-validator.cjs` -- PreToolUse(All)
- Note: Write/Edit hooks do NOT apply (disallowedTools)

**QA** (same toolset as Developer):
- Same hooks as Developer

**Technical Writer** (tools: Read, Write, Edit, Glob, Grep, WebSearch, WebFetch, Task*):
- Same Write/Edit hooks as Developer (minus Bash hooks since no Bash tool)
- `routing-guard.cjs` documentation routing ensures this agent IS spawned for docs work

**Reflection Agent** (tools: Read, Write, Edit, Grep, Glob, MemoryRecord, Task*):
- Write/Edit hooks apply
- `unified-reflection-handler.cjs` -- PostToolUse(Task/TaskUpdate/Bash) -- queues reflections
- `reflection-queue-processor.cjs` -- SessionEnd -- processes queued reflections
- `sync-memory-index.cjs` -- PostToolUse(Edit/Write/MemoryRecord) -- syncs memory

**Context Compressor** (tools: Read, Write, Grep, Glob, Task*):
- `unified-pre-write-hook.cjs` -- PreToolUse(Write) -- write checks
- `unified-creator-guard.cjs` -- PreToolUse(Write) -- creator path protection
- `tool-scope-validator.cjs` -- PreToolUse(All) -- tool scope validation

**All Orchestrators** (tools: Task, TaskList, TaskCreate, TaskGet, Read):
- Same hooks as Router (they primarily use Task tools)

#### Tasks

- [ ] **1.1** Add "Enforcement Hooks" section to `core/router.md` (~10 min)
  - **Files**: `C:\dev\projects\agent-studio\.claude\agents\core\router.md`
  - **Command**: `Edit({ file_path: ".claude/agents/core/router.md", old_string: "<end-of-frontmatter-section>", new_string: "<section-with-hooks>" })`
  - **Content**: List 14 hooks that govern router behavior with env var overrides
  - **Verify**: `Grep({ pattern: "Enforcement Hooks", path: ".claude/agents/core/router.md" })`

- [ ] **1.2** Add "Enforcement Hooks" section to `core/developer.md` (~10 min)
  - **Files**: `C:\dev\projects\agent-studio\.claude\agents\core\developer.md`
  - **Content**: List 16 hooks governing developer behavior (Bash validators, Write guards, monitoring)
  - **Verify**: `Grep({ pattern: "Enforcement Hooks", path: ".claude/agents/core/developer.md" })`

- [ ] **1.3** Add "Enforcement Hooks" section to `core/planner.md` (~8 min)
  - **Files**: `C:\dev\projects\agent-studio\.claude\agents\core\planner.md`
  - **Content**: Same as developer plus plan-evolution-guard emphasis
  - **Verify**: `Grep({ pattern: "Enforcement Hooks", path: ".claude/agents/core/planner.md" })`

- [ ] **1.4** Add "Enforcement Hooks" section to `specialized/security-architect.md` (~8 min)
  - **Files**: `C:\dev\projects\agent-studio\.claude\agents\specialized\security-architect.md`
  - **Content**: Same Write/Edit/Bash hooks + note about being the target of security-review enforcement
  - **Verify**: `Grep({ pattern: "Enforcement Hooks", path: ".claude/agents/specialized/security-architect.md" })`

- [ ] **1.5** Add "Enforcement Hooks" section to `specialized/code-reviewer.md` (~8 min)
  - **Files**: `C:\dev\projects\agent-studio\.claude\agents\specialized\code-reviewer.md`
  - **Content**: Bash validators + Read validator + tool scope. Note: NO Write/Edit hooks (read-only agent)
  - **Verify**: `Grep({ pattern: "Enforcement Hooks", path: ".claude/agents/specialized/code-reviewer.md" })`

- [ ] **1.6** Add "Enforcement Hooks" section to `core/qa.md` (~8 min)
  - **Files**: `C:\dev\projects\agent-studio\.claude\agents\core\qa.md`
  - **Content**: Same as developer
  - **Verify**: `Grep({ pattern: "Enforcement Hooks", path: ".claude/agents/core/qa.md" })`

- [ ] **1.7** Add "Enforcement Hooks" section to `core/technical-writer.md` (~8 min)
  - **Files**: `C:\dev\projects\agent-studio\.claude\agents\core\technical-writer.md`
  - **Content**: Write/Edit hooks (no Bash hooks). Note documentation routing enforcement
  - **Verify**: `Grep({ pattern: "Enforcement Hooks", path: ".claude/agents/core/technical-writer.md" })`

- [ ] **1.8** Add "Enforcement Hooks" section to `core/reflection-agent.md` (~8 min)
  - **Files**: `C:\dev\projects\agent-studio\.claude\agents\core\reflection-agent.md`
  - **Content**: Write/Edit hooks + reflection-specific hooks + MemoryRecord sync
  - **Verify**: `Grep({ pattern: "Enforcement Hooks", path: ".claude/agents/core/reflection-agent.md" })`

- [ ] **1.9** Add "Enforcement Hooks" section to `core/context-compressor.md` (~5 min)
  - **Files**: `C:\dev\projects\agent-studio\.claude\agents\core\context-compressor.md`
  - **Content**: Write hooks + tool scope (minimal toolset)
  - **Verify**: `Grep({ pattern: "Enforcement Hooks", path: ".claude/agents/core/context-compressor.md" })`

- [ ] **1.10** Add "Enforcement Hooks" section to `core/architect.md` (~8 min)
  - **Files**: `C:\dev\projects\agent-studio\.claude\agents\core\architect.md`
  - **Content**: Same as developer (full toolset)
  - **Verify**: `Grep({ pattern: "Enforcement Hooks", path: ".claude/agents/core/architect.md" })`

- [ ] **1.11** Add "Enforcement Hooks" section to `core/pm.md` (~5 min)
  - **Files**: `C:\dev\projects\agent-studio\.claude\agents\core\pm.md`
  - **Content**: Based on PM's tool list
  - **Verify**: `Grep({ pattern: "Enforcement Hooks", path: ".claude/agents/core/pm.md" })`

- [ ] **1.12** Add "Enforcement Hooks" section to remaining domain/specialized agents (~30 min) [parallel OK]
  - **Files**: All 38 remaining agent files (domain/*.md, specialized/*.md, orchestrators/*.md)
  - **Pattern**: Determine toolset from frontmatter, apply matching hook set
  - **Verify**: `Grep({ pattern: "Enforcement Hooks", path: ".claude/agents/", glob: "**/*.md" })` -- count should equal total agent count

#### Section Template (for all agents)

```markdown
## Enforcement Hooks

The following registered hooks govern this agent's behavior:

| Hook | Event | Purpose | Override |
|------|-------|---------|----------|
| `tool-scope-validator.cjs` | PreToolUse(All) | Validates tool is in agent's allowed set | -- |
| `execution-limit-monitor-hook.cjs` | PreToolUse(All) | Monitors execution limits | -- |
| ... | ... | ... | ... |

See `@HOOK_AGENT_MAP.md` for the complete hook-agent mapping.
```

#### Phase 1 Error Handling

If any agent file edit fails:
1. Check file exists at expected path
2. Verify frontmatter structure has not changed
3. Document error in `.claude/context/memory/issues.md`
4. Continue with remaining agents (non-blocking)

#### Phase 1 Verification Gate

```bash
# Count agents with "Enforcement Hooks" section
grep -rl "## Enforcement Hooks" .claude/agents/ | wc -l
# Must equal total agent count (49 agents)
```

**Success Criteria**: All agent .md files contain an "Enforcement Hooks" section with accurate hook listings

---

### Phase 2: Archive Orphan Hooks and Relocate router-state.cjs

**Purpose**: Clean up 49 orphan hooks that are not registered in settings.json and create confusion
**Dependencies**: Phase 1 complete (so agent docs reference correct paths before moves)
**Parallel OK**: Partial (archive and relocate can happen in parallel)

#### Identifying Orphans

**Registered hooks** (39 unique files from settings.json):
1. `hooks/session/state-reset.cjs`
2. `hooks/routing/user-prompt-unified.cjs`
3. `hooks/reflection/force-step0-execution.cjs`
4. `hooks/session/session-cleanup.cjs`
5. `hooks/monitoring/execution-limit-monitor-hook.cjs`
6. `hooks/routing/tool-scope-validator.cjs`
7. `hooks/safety/bash-command-validator.cjs`
8. `hooks/safety/shell-injection-validator.cjs`
9. `hooks/safety/windows-null-sanitizer.cjs`
10. `hooks/routing/routing-guard.cjs`
11. `hooks/routing/unified-creator-guard.cjs`
12. `hooks/unified-pre-write-hook.cjs`
13. `hooks/evolution/evolution-state-guard.cjs`
14. `hooks/evolution/research-enforcement.cjs`
15. `hooks/evolution/quality-gate-validator.cjs`
16. `hooks/evolution/conflict-detector.cjs`
17. `hooks/safety/validate-skill-invocation.cjs`
18. `hooks/reflection/reflection-step0-guard.cjs`
19. `hooks/routing/intent-agent-match.cjs`
20. `hooks/routing/spawn-prompt-assembler.cjs`
21. `hooks/routing/pre-task-unified.cjs`
22. `hooks/routing/config-model-validator.cjs`
23. `hooks/safety/spawn-prompt-validator.cjs`
24. `hooks/routing/task-status-enforcement.cjs`
25. `hooks/validation/pre-completion-validation.cjs`
26. `hooks/monitoring/metrics-collector-hook.cjs`
27. `hooks/monitoring/error-tracker-hook.cjs`
28. `hooks/self-healing/anomaly-detector.cjs`
29. `hooks/routing/post-task-unified.cjs`
30. `hooks/routing/task-list-tracker.cjs`
31. `hooks/workflow/post-completion-chain.cjs`
32. `hooks/memory/sync-memory-index.cjs`
33. `hooks/routing/code-index-updater.cjs`
34. `hooks/reflection/unified-reflection-handler.cjs`
35. `hooks/reflection/reflection-queue-processor.cjs`
36. `hooks/validation/check-console-log.cjs`

**NOT hooks but used by active hooks (DO NOT archive)**:
- `hooks/safety/validators/registry.cjs` -- used by bash-command-validator.cjs
- `hooks/safety/validators/network-validators.cjs` -- used by registry.cjs
- `hooks/safety/validators/shell-validators.cjs` -- used by registry.cjs
- `hooks/safety/validators/database-validators.cjs` -- used by registry.cjs
- `hooks/safety/validators/filesystem-validators.cjs` -- used by registry.cjs
- `hooks/safety/validators/git-validators.cjs` -- used by registry.cjs
- `hooks/safety/validators/process-validators.cjs` -- used by registry.cjs
- `hooks/routing/router-state.cjs` -- shared state module (relocate, don't archive)

**Orphan hooks to archive** (files on disk NOT in settings.json AND not validator modules):
- `hooks/audit/git-notes-audit.cjs`
- `hooks/cost-tracking/llm-usage-tracker.cjs`
- `hooks/evolution/evolution-audit.cjs`
- `hooks/evolution/unified-evolution-guard.cjs`
- `hooks/git/regenerate-registries.cjs`
- `hooks/memory/format-memory.cjs`
- `hooks/memory/planning-progress-tracker.cjs`
- `hooks/monitoring/error-tracker.cjs` (superseded by error-tracker-hook.cjs)
- `hooks/monitoring/execution-limit-monitor.cjs` (superseded by execution-limit-monitor-hook.cjs)
- `hooks/monitoring/metrics-collector.cjs` (superseded by metrics-collector-hook.cjs)
- `hooks/post-tool-use/incremental-indexer.cjs`
- `hooks/reflection/error-summary-extractor.cjs`
- `hooks/routing/agent-context-tracker.cjs`
- `hooks/routing/agent-health-hook.cjs`
- `hooks/routing/context-mode-tool-guard.cjs`
- `hooks/routing/documentation-routing-guard.cjs`
- `hooks/routing/post-spawn-task-updater.cjs`
- `hooks/routing/pre-spawn-task-validator.cjs`
- `hooks/routing/pre-spawn-tool-validator.cjs`
- `hooks/routing/skill-invocation-tracker.cjs`
- `hooks/routing/structural-context-hook.cjs`
- `hooks/routing/task-auto-route.cjs`
- `hooks/routing/task-completion-guard.cjs`
- `hooks/routing/task-update-tracker.cjs`
- `hooks/routing/tool-availability-validator.cjs`
- `hooks/safety/bash-cwd-validator.cjs`
- `hooks/safety/command-allowlist-validator.cjs`
- `hooks/safety/enforce-claude-md-update.cjs`
- `hooks/safety/error-capture-post-tool.cjs`
- `hooks/safety/file-path-guard.cjs`
- `hooks/safety/security-trigger.cjs`
- `hooks/safety/shellcheck-validator.cjs`
- `hooks/safety/spawn-size-validator.cjs`
- `hooks/safety/variable-quoting-validator.cjs`
- `hooks/safety/write-content-scanner.cjs`
- `hooks/self-healing/auto-rerouter.cjs`
- `hooks/session/post-creation-reminder.cjs`
- `hooks/skills/duplicate-detector.cjs`
- `hooks/skills/metadata-validator.cjs`
- `hooks/skills/rule-structure-validator.cjs`
- `hooks/skills/rule-validator.cjs`
- `hooks/statusline.cjs`
- `hooks/validation/agent-tools-validator.cjs`
- `hooks/validation/plan-evolution-guard.cjs`
- `hooks/validation/track-analytics-validator.cjs`

#### Tasks

- [ ] **2.1** Create archive directory structure (~2 min)
  - **Command**: `mkdir -p .claude/hooks/_archive/{audit,cost-tracking,evolution,git,memory,monitoring,post-tool-use,reflection,routing,safety,self-healing,session,skills,validation}`
  - **Verify**: `ls .claude/hooks/_archive/ | wc -l` (should be 14 subdirectories)

- [ ] **2.2** Move orphan hooks to archive (~15 min)
  - **Command**: For each orphan, `git mv .claude/hooks/{category}/{file} .claude/hooks/_archive/{category}/{file}`
  - **Verify**: `ls .claude/hooks/_archive/**/*.cjs | wc -l` (should be ~45 files)
  - **Rollback**: `git checkout HEAD -- .claude/hooks/` (restores all moves)

- [ ] **2.3** Move `statusline.cjs` to archive (~1 min)
  - **Command**: `git mv .claude/hooks/statusline.cjs .claude/hooks/_archive/statusline.cjs`
  - **Verify**: File no longer at original path

- [ ] **2.4** Relocate `router-state.cjs` from hooks to lib (~5 min)
  - **Command**: `git mv .claude/hooks/routing/router-state.cjs .claude/lib/routing/router-state.cjs`
  - **Verify**: `ls .claude/lib/routing/router-state.cjs`
  - **Rollback**: `git mv .claude/lib/routing/router-state.cjs .claude/hooks/routing/router-state.cjs`

- [ ] **2.5** Update all `require('./router-state')` references (~10 min)
  - **Files**: Any hook that imports router-state.cjs (search with Grep)
  - **Command**: `Grep({ pattern: "router-state", path: ".claude/hooks/", output_mode: "content" })`
  - **Action**: Update require paths from `./router-state` or `../routing/router-state` to `../../lib/routing/router-state`
  - **Verify**: `node -e "require('./.claude/lib/routing/router-state.cjs')"` (no error)

- [ ] **2.6** Update HOOKS_REFERENCE.md to remove orphan references (~10 min)
  - **Files**: `C:\dev\projects\agent-studio\.claude\docs\HOOKS_REFERENCE.md`
  - **Action**: Mark archived hooks as archived, update directory tree
  - **Verify**: No references to archived hook paths in active documentation

- [ ] **2.7** Add `_archive/` explanation README (~3 min)
  - **File**: `.claude/hooks/_archive/README.md`
  - **Content**: Explain these are superseded hooks kept for reference, with date and reason
  - **Verify**: `ls .claude/hooks/_archive/README.md`

#### Phase 2 Error Handling

If any `git mv` fails:
1. Check if file was already moved or deleted
2. Use `git status` to verify state
3. Document in `.claude/context/memory/issues.md`
4. Do NOT proceed to Phase 2.5 (reference updates) until moves are complete

#### Phase 2 Verification Gate

```bash
# All registered hooks still exist at expected paths
node -e "
const settings = require('./.claude/settings.json');
const fs = require('fs');
let missing = 0;
for (const [event, matchers] of Object.entries(settings.hooks)) {
  for (const matcher of matchers) {
    for (const hook of matcher.hooks) {
      const path = hook.command.replace('node ', '');
      if (!fs.existsSync(path)) { console.log('MISSING:', path); missing++; }
    }
  }
}
console.log(missing === 0 ? 'ALL REGISTERED HOOKS PRESENT' : missing + ' HOOKS MISSING');
"

# Validator modules still accessible
node -e "require('./.claude/hooks/safety/validators/registry.cjs'); console.log('Validators OK')"

# router-state.cjs accessible at new location
node -e "require('./.claude/lib/routing/router-state.cjs'); console.log('router-state OK')"
```

**Success Criteria**: All registered hooks accessible, validator modules intact, router-state.cjs at new location, orphans archived

---

### Phase 3: Create Hook-Agent Mapping Documentation

**Purpose**: Create authoritative reference showing hook-agent relationships
**Dependencies**: Phase 1 (agent docs reference this), Phase 2 (paths are final)
**Parallel OK**: No (depends on Phase 2 path finalization)

#### Tasks

- [ ] **3.1** Create `@HOOK_AGENT_MAP.md` in `.claude/docs/` (~30 min)
  - **File**: `C:\dev\projects\agent-studio\.claude\docs\@HOOK_AGENT_MAP.md`
  - **Content**:
    - Section 1: Hook-to-Agent matrix table (hooks as rows, agents as columns, checkmarks)
    - Section 2: Agent-to-Hook listing (for each agent, which hooks apply)
    - Section 3: Environment variable override reference (all env vars with defaults)
    - Section 4: Hook execution order per event type
    - Section 5: Cross-reference to `@ENFORCEMENT_HOOKS.md` and `HOOKS_REFERENCE.md`
  - **Verify**: File exists, contains all 39 registered hooks, references all agent types

- [ ] **3.2** Update `@ENFORCEMENT_HOOKS.md` with cross-reference (~5 min)
  - **File**: `C:\dev\projects\agent-studio\.claude\docs\@ENFORCEMENT_HOOKS.md`
  - **Action**: Add "See also: @HOOK_AGENT_MAP.md for complete hook-agent mapping" at top
  - **Verify**: Cross-reference present

- [ ] **3.3** Update `HOOKS_REFERENCE.md` with cross-reference (~5 min)
  - **File**: `C:\dev\projects\agent-studio\.claude\docs\HOOKS_REFERENCE.md`
  - **Action**: Add "See also: @HOOK_AGENT_MAP.md" and update directory tree to show _archive/
  - **Verify**: Cross-reference present, directory tree updated

- [ ] **3.4** Update CLAUDE.md Reference Index (~5 min)
  - **File**: `C:\dev\projects\agent-studio\.claude\CLAUDE.md`
  - **Action**: Add `@HOOK_AGENT_MAP.md` to the Reference Index table in Section "REFERENCE INDEX"
  - **Verify**: `Grep({ pattern: "HOOK_AGENT_MAP", path: ".claude/CLAUDE.md" })`

#### @HOOK_AGENT_MAP.md Structure

```markdown
# Hook-Agent Mapping Reference

> Source: CLAUDE.md Section 1.3
> Last Updated: 2026-02-06

## Hook-Agent Matrix

| Hook | Router | Developer | Planner | Security | Code-Reviewer | QA | Tech-Writer | Reflection | Compressor | Orchestrators |
|------|--------|-----------|---------|----------|---------------|----|-----------  |------------|------------|---------------|
| tool-scope-validator | x | x | x | x | x | x | x | x | x | x |
| execution-limit-monitor | x | x | x | x | x | x | x | x | x | x |
| bash-command-validator | | x | x | x | x | x | | | | |
| ... | ... |

## Environment Variable Overrides

| Variable | Hook | Default | Values |
|----------|------|---------|--------|
| PLANNER_FIRST_ENFORCEMENT | routing-guard.cjs | block | block/warn/off |
| SECURITY_REVIEW_ENFORCEMENT | routing-guard.cjs | block | block/warn/off |
| CREATOR_GUARD | unified-creator-guard.cjs | block | block/warn/off |
| REFLECTION_STEP0_ENFORCEMENT | reflection-step0-guard.cjs | block | block/warn/off |
| SPAWN_PROMPT_VALIDATOR | spawn-prompt-validator.cjs | warn | block/warn/off |
| ROUTER_WRITE_GUARD | routing-guard.cjs | block | block/warn/off |
| ROUTER_SELF_CHECK | routing-guard.cjs | block | block/warn/off |
| TASKLIST_FIRST_ENFORCEMENT | pre-task-unified.cjs | block | block/warn/off |
```

#### Phase 3 Error Handling

If doc creation fails:
1. Verify `.claude/docs/` directory exists
2. Check for file permission issues
3. Ensure no conflicting file exists
4. Document in `.claude/context/memory/issues.md`

#### Phase 3 Verification Gate

```bash
# New reference doc exists
ls .claude/docs/@HOOK_AGENT_MAP.md

# Cross-references present
grep "HOOK_AGENT_MAP" .claude/docs/@ENFORCEMENT_HOOKS.md
grep "HOOK_AGENT_MAP" .claude/docs/HOOKS_REFERENCE.md
grep "HOOK_AGENT_MAP" .claude/CLAUDE.md
```

**Success Criteria**: `@HOOK_AGENT_MAP.md` exists with complete matrix, all cross-references in place

---

### Phase 4: Validate and Commit

**Purpose**: Ensure all changes are correct and tests pass
**Dependencies**: Phases 1-3 complete
**Parallel OK**: Partial

#### Tasks

- [ ] **4.1** Run full framework test suite (~3 min)
  - **Command**: `pnpm test:framework`
  - **Verify**: All tests pass (0 failures)
  - **Rollback**: If tests fail, identify broken import paths from Phase 2 moves

- [ ] **4.2** Verify all registered hooks are resolvable (~2 min)
  - **Command**: Node script to iterate settings.json hooks and check file existence (see Phase 2 gate)
  - **Verify**: "ALL REGISTERED HOOKS PRESENT" output

- [ ] **4.3** Verify no broken require() paths (~2 min)
  - **Command**: `node -e "require('./.claude/hooks/safety/bash-command-validator.cjs')"` (and other hooks that import router-state)
  - **Verify**: No MODULE_NOT_FOUND errors

- [ ] **4.4** Verify agent files are well-formed (~2 min)
  - **Command**: Spot-check frontmatter parsing on 3-4 agent files
  - **Verify**: YAML frontmatter still valid after edits

- [ ] **4.5** Commit checkpoint: all hook alignment changes (~2 min)
  - **Command**: `git add .claude/agents/ .claude/hooks/ .claude/docs/ .claude/lib/routing/router-state.cjs .claude/CLAUDE.md && git commit -m "feat: align hooks with agents - add enforcement sections, archive orphans, create mapping"`
  - **Verify**: `git log --oneline -1` shows the commit

- [ ] **4.6** Record learnings in memory (~3 min)
  - **File**: `.claude/context/memory/learnings.md`
  - **Content**: Document hook alignment pattern, orphan count, mapping approach
  - **File**: `.claude/context/memory/decisions.md`
  - **Content**: ADR for hook-agent alignment approach

#### Phase 4 Error Handling

If tests fail:
1. Check if failure is from moved `router-state.cjs` (most likely cause)
2. Search for broken require paths: `grep -r "router-state" .claude/hooks/ .claude/lib/`
3. Fix paths and re-run tests
4. Do NOT commit until tests pass

#### Phase 4 Verification Gate

```bash
# Tests pass
pnpm test:framework

# Commit exists
git log --oneline -1 | grep "hook"
```

**Success Criteria**: All tests pass, commit created, learnings recorded

---

### Phase FINAL: Evolution and Reflection Check

**Purpose**: Quality assessment and learning extraction
**Dependencies**: Phase 4 complete

#### Tasks

- [ ] **F.1** Spawn reflection-agent to analyze completed work
  - **Command**: `Task({ subagent_type: "reflection-agent", prompt: "Analyze the hook alignment work from Task #41. Extract learnings about hook-agent governance patterns, orphan cleanup, and documentation alignment." })`

- [ ] **F.2** Extract learnings and update memory files
  - **Output**: `.claude/context/memory/learnings.md` updated with hook alignment patterns

- [ ] **F.3** Check for evolution opportunities
  - **Question**: Should a `hook-auditor` agent or skill be created for ongoing hook health monitoring?
  - **Question**: Should a hook-agent sync check be added to CI?

**Success Criteria**: Reflection completed, learnings extracted, evolution opportunities logged

---

## Risks

| Risk | Impact | Mitigation | Rollback |
|------|--------|------------|----------|
| Broken require paths after router-state.cjs move | High | Grep all imports before moving, update in same commit | `git checkout HEAD -- .claude/hooks/routing/router-state.cjs` |
| Agent frontmatter corruption from edits | Medium | Edit after frontmatter closing `---`, validate YAML | `git checkout HEAD -- .claude/agents/` |
| Missing orphan (archiving active hook) | High | Cross-reference settings.json registration before any move | `git checkout HEAD -- .claude/hooks/{file}` |
| Tests fail due to hook path changes | High | Run tests after Phase 2, before Phase 3 | Fix paths, re-run |
| HOOKS_REFERENCE.md has stale references | Low | Update in Phase 3 | Manual correction |

## Timeline Summary

| Phase | Tasks | Est. Time | Parallel? |
|-------|-------|-----------|-----------|
| 1 | 12 | ~120 min | Yes (agent files are independent) |
| 2 | 7 | ~45 min | Partial |
| 3 | 4 | ~45 min | No |
| 4 | 6 | ~15 min | Partial |
| FINAL | 3 | ~15 min | No |
| **Total** | **32** | **~240 min** | |

## Files Modified Summary

**Phase 1** (~49 files):
- All `.claude/agents/**/*.md` files (add Enforcement Hooks section)

**Phase 2** (~50 files):
- ~45 orphan hooks moved to `.claude/hooks/_archive/`
- `router-state.cjs` moved to `.claude/lib/routing/`
- Hooks importing router-state.cjs (require path updates)
- `.claude/hooks/_archive/README.md` (new)

**Phase 3** (~4 files):
- `.claude/docs/@HOOK_AGENT_MAP.md` (new)
- `.claude/docs/@ENFORCEMENT_HOOKS.md` (updated)
- `.claude/docs/HOOKS_REFERENCE.md` (updated)
- `.claude/CLAUDE.md` (Reference Index updated)

**Phase 4** (~2 files):
- `.claude/context/memory/learnings.md`
- `.claude/context/memory/decisions.md`

**Total: ~105 files modified/moved/created**

Note: Since this modifies 100+ files, a **commit checkpoint** is recommended after Phase 2 (before documentation in Phase 3) to create a recovery point:
```bash
git add . && git commit -m "checkpoint: hook alignment Phase 1-2 complete (agent docs + orphan archive)"
```
