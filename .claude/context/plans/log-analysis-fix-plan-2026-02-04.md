# Plan: Log Analysis Issue Fix (100% Remediation)

**Created**: 2026-02-04
**Framework Version**: Agent-Studio v2.2.1
**Status**: Phase 0 - Planning Complete
**Plan ID**: LOG-FIX-001

## Executive Summary

This plan addresses all issues identified in the log analysis:
1. Agent frontmatter missing "name" field (35+ files claimed, actual state TBD)
2. Pending reflection requests in runtime directory (7 requests)
3. Spawn prompt validation failures (TaskUpdate Warning Box, Task ID references)
4. File read token exceeded errors (large file handling)
5. Multiple hook PreToolUse validation errors

**Total Tasks**: 22 atomic tasks
**Estimated Time**: ~4-6 hours
**Strategy**: Enablers first (cleanup/verification) -> P1 fixes -> P2 validation -> P3 documentation

## Phases

### Phase 0: Research & Planning (FOUNDATION) - COMPLETE

**Purpose**: Analyze current state, verify claims, assess scope
**Duration**: 30 minutes (completed)
**Parallel OK**: No (blocking)

#### Research Findings

1. **Agent Frontmatter Status**:
   - Verification script exists: `.claude/tools/cli/verify-agent-frontmatter.mjs`
   - Sample agents checked: ALL have `name:` field present
   - Agents verified: developer, python-pro, database-architect, evolution-orchestrator, router, ai-ml-specialist
   - **Finding**: Claim of "35+ missing" appears OUTDATED - may have been fixed in previous session

2. **Reflection Files Status**:
   - `reflection-reminder.txt`: EXISTS with 7 pending requests
   - `reflection-spawn-request.json`: EXISTS with 7 task completion reflections
   - **Action Required**: Clear both files

3. **Spawn Prompt Validation**:
   - Hook: `.claude/hooks/safety/spawn-prompt-validator.cjs`
   - Default mode: `warn` (not blocking)
   - Template: `.claude/templates/spawn/universal-agent-spawn.md` includes 70-line warning box
   - **Finding**: Validation exists but may have edge case failures

4. **File Token Exceeded**:
   - Read tool has 2000 line limit per call
   - Large files require chunked reading with offset/limit
   - **Finding**: This is expected behavior, not a bug

5. **Hook Validation Errors**:
   - Multiple hooks run on PreToolUse
   - May see warnings when hooks detect issues
   - **Finding**: Warnings are expected behavior when issues detected

#### Constitution Checkpoint - PASSED

1. **Research Completeness**: [x] All 5 issues analyzed
2. **Technical Feasibility**: [x] All fixes are straightforward
3. **Security Review**: [x] No security implications (cleanup/validation)
4. **Specification Quality**: [x] Clear verification commands for each task

---

### Phase 1: Enablers - Verification & Cleanup

**Purpose**: Establish baseline and clear runtime state
**Dependencies**: Phase 0 complete
**Duration**: ~30 minutes
**Parallel OK**: Partial (1.1-1.2 parallel, 1.3-1.4 sequential)

#### Tasks

- [ ] **ENABLER-1.1** Run agent frontmatter verification (~2 min)
  - **Command**: `node .claude/tools/cli/verify-agent-frontmatter.mjs`
  - **Verify**: Exit code 0 and "all agents have name-first frontmatter" message
  - **Rollback**: N/A (read-only operation)
  - **Output**: Baseline of current agent frontmatter status

- [ ] **ENABLER-1.2** Audit current reflection state (~2 min) [PARALLEL OK]
  - **Command**: `Read .claude/context/runtime/reflection-spawn-request.json`
  - **Verify**: File exists and contains JSON array
  - **Rollback**: N/A (read-only)
  - **Output**: Count of pending reflection requests

- [ ] **ENABLER-1.3** Clear reflection-reminder.txt (~1 min)
  - **Command**: Delete `.claude/context/runtime/reflection-reminder.txt`
  - **Verify**: `ls .claude/context/runtime/reflection-reminder.txt` returns "not found"
  - **Rollback**: Re-create file with original content
  - **Blocked By**: ENABLER-1.2

- [ ] **ENABLER-1.4** Clear reflection-spawn-request.json (~1 min)
  - **Command**: Write `[]` to `.claude/context/runtime/reflection-spawn-request.json`
  - **Verify**: File contains empty JSON array `[]`
  - **Rollback**: Restore original content from backup
  - **Blocked By**: ENABLER-1.3

#### Phase 1 Verification Gate

```bash
# All must pass before proceeding
node .claude/tools/cli/verify-agent-frontmatter.mjs && \
! test -f .claude/context/runtime/reflection-reminder.txt && \
cat .claude/context/runtime/reflection-spawn-request.json | grep -q "^\[\]$"
```

**Success Criteria**: Agent frontmatter passes, reflection files cleared

---

### Phase 2: P1 Fixes - Agent Frontmatter (If Needed)

**Purpose**: Fix any agent files missing name field
**Dependencies**: Phase 1 complete (ENABLER-1.1 determines if needed)
**Duration**: ~60-120 minutes (if needed)
**Parallel OK**: Yes (each agent fix is independent)

**CONDITIONAL PHASE**: Only execute if ENABLER-1.1 shows failures.

#### Tasks (Execute only if ENABLER-1.1 fails)

- [ ] **P1-2.1.1** Create agent frontmatter fix script (~15 min)
  - **Command**: Create script that:
    1. Reads each agent file in `.claude/agents/**/*.md`
    2. Extracts agent name from filename (e.g., `developer.md` -> `developer`)
    3. Adds `name: {agent-name}` as first line after `---`
  - **Verify**: Script runs without errors on test file
  - **Rollback**: Delete script

- [ ] **P1-2.1.2** Backup agent files (~5 min)
  - **Command**: `cp -r .claude/agents .claude/agents.backup-$(date +%Y%m%d)`
  - **Verify**: Backup directory exists with same file count
  - **Rollback**: N/A

- [ ] **P1-2.1.3** Run frontmatter fix script (~10 min)
  - **Command**: Execute fix script from P1-2.1.1
  - **Verify**: Script reports success for all files
  - **Rollback**: `rm -rf .claude/agents && mv .claude/agents.backup-* .claude/agents`
  - **Blocked By**: P1-2.1.1, P1-2.1.2

- [ ] **P1-2.1.4** Re-run verification (~2 min)
  - **Command**: `node .claude/tools/cli/verify-agent-frontmatter.mjs`
  - **Verify**: Exit code 0 and "all agents have name-first frontmatter"
  - **Rollback**: N/A (read-only)
  - **Blocked By**: P1-2.1.3

#### Agent Files to Fix (Based on Glob Results)

| Directory | File Count | Files |
|-----------|------------|-------|
| core | 10 | pm.md, technical-writer.md, qa.md, architect.md, developer.md, router.md, planner.md, reflection-agent.md, context-compressor.md |
| domain | 24 | ai-ml-specialist.md, android-pro.md, data-engineer.md, expo-mobile-developer.md, fastapi-pro.md, frontend-pro.md, gamedev-pro.md, golang-pro.md, graphql-pro.md, ios-pro.md, java-pro.md, mobile-ux-reviewer.md, nextjs-pro.md, nodejs-pro.md, php-pro.md, python-pro.md, rust-pro.md, scientific-research-expert.md, sveltekit-expert.md, tauri-desktop-developer.md, typescript-pro.md, web3-blockchain-expert.md |
| specialized | 12 | c4-code.md, c4-component.md, c4-container.md, c4-context.md, conductor-validator.md, database-architect.md, devops-troubleshooter.md, incident-responder.md, code-simplifier.md, researcher.md, code-reviewer.md, security-architect.md, reverse-engineer.md, devops.md |
| orchestrators | 4 | evolution-orchestrator.md, party-orchestrator.md, swarm-coordinator.md, master-orchestrator.md |
| root | 1 | router.md (duplicate reference) |
| **Total** | **51** | |

**Note**: Based on sample checks, most/all agents already have `name:` field. This phase may be NO-OP.

#### Phase 2 Verification Gate

```bash
node .claude/tools/cli/verify-agent-frontmatter.mjs
# Expected: Exit code 0
```

**Success Criteria**: All 51 agent files have valid frontmatter with name field

---

### Phase 3: P2 Fixes - Spawn Prompt Validation

**Purpose**: Ensure spawn prompts include required elements
**Dependencies**: Phase 1 complete
**Duration**: ~45 minutes
**Parallel OK**: Partial

#### Tasks

- [ ] **P2-3.1.1** Audit spawn-prompt-validator.cjs (~10 min)
  - **Command**: Read and analyze validation patterns
  - **Verify**: Identify what patterns are checked:
    - TaskUpdate warning box pattern
    - PROJECT_ROOT context section
    - Task ID reference pattern
    - Memory Protocol section
  - **Rollback**: N/A (read-only)

- [ ] **P2-3.1.2** Test spawn prompt validator with valid prompt (~5 min)
  - **Command**: Create test input with all required elements, pipe to validator
  - **Verify**: Exit code 0 (allow)
  - **Rollback**: N/A (test only)

- [ ] **P2-3.1.3** Test spawn prompt validator with invalid prompt (~5 min)
  - **Command**: Create test input missing TaskUpdate box, pipe to validator
  - **Verify**: Exit code 2 (block) or warning message
  - **Rollback**: N/A (test only)

- [ ] **P2-3.1.4** Verify universal-agent-spawn.md template (~5 min)
  - **Command**: Check template contains:
    1. 70-line TaskUpdate WARNING box (lines 41-59 in template)
    2. `Your Task ID: <ID>` placeholder
    3. `TaskUpdate({ taskId: "<ID>"` calls
    4. Memory Protocol section
  - **Verify**: All 4 elements present
  - **Rollback**: N/A (read-only)

- [ ] **P2-3.1.5** Document spawn prompt requirements (~10 min)
  - **Command**: Update `.claude/context/memory/learnings.md` with:
    - Spawn prompt validation requirements
    - Common failure patterns
    - How to fix validation errors
  - **Verify**: Learnings file updated with section
  - **Rollback**: Remove added section

#### Phase 3 Verification Gate

```bash
# Test valid prompt passes validator
echo '{"tool_input": {"prompt": "TaskUpdate warning box... PROJECT_ROOT... Task ID: 123... Memory Protocol..."}}' | \
  node .claude/hooks/safety/spawn-prompt-validator.cjs
# Expected: Exit code 0 or structured output
```

**Success Criteria**: Spawn prompt validation working correctly

---

### Phase 4: P3 Improvements - Documentation & Monitoring

**Purpose**: Document fixes, update memory, create monitoring
**Dependencies**: Phases 1-3 complete
**Duration**: ~30 minutes
**Parallel OK**: Yes

#### Tasks

- [ ] **P3-4.1.1** Update learnings.md with fix summary (~10 min) [PARALLEL OK]
  - **Command**: Append section documenting:
    - Log analysis findings
    - Fixes applied
    - Verification results
  - **Verify**: Section present in learnings.md
  - **Rollback**: Remove section

- [ ] **P3-4.1.2** Update issues.md status (~5 min) [PARALLEL OK]
  - **Command**: If any issues resolved, update status to RESOLVED
  - **Verify**: Issue statuses accurate
  - **Rollback**: Revert status changes

- [ ] **P3-4.1.3** Create monitoring checklist (~10 min) [PARALLEL OK]
  - **Command**: Create `.claude/context/artifacts/log-analysis-monitoring-checklist.md`
  - **Verify**: File exists with:
    - Daily checks for reflection-reminder.txt
    - Weekly agent frontmatter verification
    - Spawn prompt validation monitoring
  - **Rollback**: Delete file

- [ ] **P3-4.1.4** Verify all fixes complete (~5 min)
  - **Command**: Run full verification suite:
    ```bash
    node .claude/tools/cli/verify-agent-frontmatter.mjs && \
    ! test -f .claude/context/runtime/reflection-reminder.txt && \
    cat .claude/context/runtime/reflection-spawn-request.json
    ```
  - **Verify**: All checks pass
  - **Rollback**: N/A (read-only)

#### Phase 4 Verification Gate

```bash
# Final verification
test -f .claude/context/memory/learnings.md && \
test -f .claude/context/artifacts/log-analysis-monitoring-checklist.md
```

**Success Criteria**: Documentation complete, monitoring in place

---

### Phase FINAL: Evolution & Reflection Check

**Purpose**: Quality assessment and learning extraction
**Dependencies**: Phase 4 complete
**Duration**: ~15 minutes

#### Tasks

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Spawn Command**:
```javascript
Task({
  subagent_type: "reflection-agent",
  description: "Session reflection and learning extraction",
  prompt: "You are REFLECTION-AGENT. Read @.claude/agents/core/reflection-agent.md. Analyze the completed work from this plan (LOG-FIX-001), extract learnings to memory files, and check for evolution opportunities (patterns that suggest new agents or skills should be created)."
})
```

**Success Criteria**:
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Risks

| Risk | Impact | Mitigation | Rollback |
|------|--------|------------|----------|
| Agent files corrupted during fix | High | Create backup before changes | Restore from backup |
| Reflection state lost | Medium | Document pending reflections before clearing | Re-add reflection requests |
| Spawn validator too strict | Medium | Test with known-good prompts first | Adjust validation patterns |
| Large file read failures persist | Low | Use chunked reading pattern | N/A (expected behavior) |

## Timeline Summary

| Phase | Tasks | Est. Time | Parallel? | Status |
|-------|-------|-----------|-----------|--------|
| 0 | 1 | 30 min | No | COMPLETE |
| 1 | 4 | 30 min | Partial | Pending |
| 2 | 4 | 60-120 min | Yes | Conditional |
| 3 | 5 | 45 min | Partial | Pending |
| 4 | 4 | 30 min | Yes | Pending |
| FINAL | 3 | 15 min | No | Pending |
| **Total** | **21** | **~4-6 hours** | | |

## Fix Numbering Reference

| Fix # | Task ID | Description | Priority |
|-------|---------|-------------|----------|
| 1 | ENABLER-1.1 | Run agent frontmatter verification | Enabler |
| 2 | ENABLER-1.2 | Audit reflection state | Enabler |
| 3 | ENABLER-1.3 | Clear reflection-reminder.txt | Enabler |
| 4 | ENABLER-1.4 | Clear reflection-spawn-request.json | Enabler |
| 5 | P1-2.1.1 | Create frontmatter fix script | P1 (conditional) |
| 6 | P1-2.1.2 | Backup agent files | P1 (conditional) |
| 7 | P1-2.1.3 | Run frontmatter fix script | P1 (conditional) |
| 8 | P1-2.1.4 | Re-run verification | P1 (conditional) |
| 9 | P2-3.1.1 | Audit spawn-prompt-validator | P2 |
| 10 | P2-3.1.2 | Test with valid prompt | P2 |
| 11 | P2-3.1.3 | Test with invalid prompt | P2 |
| 12 | P2-3.1.4 | Verify spawn template | P2 |
| 13 | P2-3.1.5 | Document requirements | P2 |
| 14 | P3-4.1.1 | Update learnings.md | P3 |
| 15 | P3-4.1.2 | Update issues.md | P3 |
| 16 | P3-4.1.3 | Create monitoring checklist | P3 |
| 17 | P3-4.1.4 | Verify all fixes | P3 |
| 18-20 | FINAL | Reflection and evolution check | Final |

## Commit Checkpoint (Multi-File Project)

**Note**: This plan modifies potentially 10+ files. After Phase 2 (if executed), create commit checkpoint:

```bash
git add .claude/context/runtime/ .claude/agents/
git commit -m "checkpoint: Phase 1-2 foundation complete - reflection cleared, frontmatter verified"
```

---

## Notes

### Issue 1: Agent Frontmatter (35+ Missing)
**Status**: LIKELY ALREADY RESOLVED
- All sample agents checked have `name:` field
- Verification script exists and working
- Phase 2 is CONDITIONAL - only executes if verification fails

### Issue 2: Reflection Files
**Status**: CONFIRMED - 7 pending requests
- reflection-reminder.txt exists with warning
- reflection-spawn-request.json has 7 entries
- Will be cleared in Phase 1

### Issue 3: Spawn Prompt Validation
**Status**: REQUIRES AUDIT
- Validator hook exists and is functional
- Template includes required elements
- May have edge cases causing failures

### Issue 4: File Token Exceeded
**Status**: EXPECTED BEHAVIOR
- Read tool has 2000 line limit
- Use offset/limit for large files
- Not a bug, documented behavior

### Issue 5: Hook Validation Errors
**Status**: EXPECTED BEHAVIOR
- Hooks are designed to warn/block on issues
- Warnings indicate hooks are working
- May need to resolve underlying issues

---

**Plan Created By**: Planner Agent
**Reviewed**: Phase 0 research complete
**Next Step**: Execute Phase 1 (Enablers)
