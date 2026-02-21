## 2026-02-21: SEC-ICE-002 Enforcement Verification Gap in routing-guard.cjs (P1)

**Status**: OPEN
**Severity**: MEDIUM (security control documented but implementation not confirmed)

**Issue**: ecosystem-creation-workflow.md SEC-ICE-002 (Task #25, commit 056c659d) documents that `routing-guard.cjs` reads `spawnDepth` from parent task metadata via TaskGet before allowing Task() calls, blocking spawns at depth >= 5. However, no test or code review confirmed this enforcement path exists in the hook. This is a documentation-implementation gap that could allow unbounded recursive spawning despite the documented control.

**Impact**:
- If routing-guard.cjs does NOT implement spawnDepth check, SEC-ICE-002 is a paper control only
- Unbounded recursive auto-spawning remains possible (amplification attack surface)
- Security review would pass based on documentation without verifying implementation

**Resolution**:
1. Read `.claude/hooks/routing/routing-guard.cjs` and grep for `spawnDepth` or `TaskGet`
2. If implementation missing: file developer task to add spawnDepth enforcement
3. If implementation exists: write test to verify depth >= 5 blocks Task() call
4. Add verification step to SEC-ICE-002 protocol: "Verify enforcement via routing-guard-staleness tests"

**Priority**: P1 (security control)

---

## 2026-02-21: debugging + smart-debug Skills Absent from artifact-graph.json (P2)

**Status**: OPEN
**Severity**: LOW-MEDIUM (skills are discoverable via skill-catalog.md and developer.md, but not tracked in dependency graph)

**Issue**: Neither `skill:debugging` nor `skill:smart-debug` have nodes in `.claude/context/data/artifact-graph.json`. Both skills were updated as part of Phase 1 skill wiring (Tasks 7-8, 2026-02-21).

**Impact**:

- Integration health checks (ADR-100) cannot report status for these two core skills
- artifact-integrator cannot detect missing companions or compute integration scores
- Cross-reference validation and orphan detection will miss these artifacts

**Resolution**:

1. Add `skill:debugging` node with `assignedAgents: ["developer", "devops-troubleshooter", "qa"]`, `integrationStatus: "integrated"`
2. Add `skill:smart-debug` node with `assignedAgents: ["developer", "devops-troubleshooter", "qa"]`, `integrationStatus: "integrated"`
3. Add edges from these nodes to agent nodes in artifact-graph.json
4. Verify `skill-index.json` agentPrimary arrays are correct post-update (ADR-2026-02-21-003)

**Priority**: P2 (non-blocking; discoverability exists via other indexes)

---

## 2026-02-21: Rules File Lags Behind SKILL.md (when-to-use table not in debugging.md rules) (P2)

**Status**: OPEN
**Severity**: LOW

**Issue**: The when-to-use comparison table added to `.claude/skills/debugging/SKILL.md` (debugging vs smart-debug escalation criteria) is NOT present in `.claude/rules/debugging.md`. The rules file has a condensed reference but not the full table.

**Impact**: Agents loaded with system-prompt rules injection will not see the escalation table. They only see it when `Skill({ skill: 'debugging' })` is explicitly invoked. This creates a gap for agents that apply debugging rules at the prompt level without invoking the skill.

**Resolution**: Add the when-to-use comparison table from debugging SKILL.md (lines 66-81) to `.claude/rules/debugging.md`.

**Priority**: P2

---

## Skill Index Regeneration After Tool Changes (CONFIRMED 2026-02-21)

**Status**: OPEN (workaround established, should automate)
**Severity**: MEDIUM

**Confirmation**: smart-debug v2.0 update (Task 2–3) confirmed the pattern. Frontmatter changes (Write/Edit tools added) required explicit `generate-skill-index.cjs` call; index does not auto-sync.

**Evidence**:

- Task 2 updated `.claude/skills/smart-debug/SKILL.md` frontmatter
- Task 3 ran `generate-skill-index.cjs` explicitly to pick up new tools
- Without regeneration, skill-index.json would show stale tool list

**Root Cause**: SKILL.md frontmatter is not watched; index generation is manual/explicit.

**Workaround**: Pre-completion checklist: "Regenerate skill index with `pnpm skill:index:regenerate` and verify changes appear in skill-index.json before marking complete."

**Long-term Fix**: Auto-watch `.claude/skills/*/SKILL.md` frontmatter changes; trigger `generate-skill-index.cjs` on post-write hook when frontmatter modified.

---

## 2026-02-20: Batch Reflection Failure - Tasks 38-43 Missing Metadata (P1 - RECURRING)

**Issue**: 6 task completions (38-43) marked complete with ONLY fallback summary strings. No `filesModified`, `outputArtifacts`, or meaningful work context provided.

**Pattern**: This is a RECURRING issue. Similar pattern in Task #14 (2026-02-20T09:35:33.866Z) and earlier batch reflections.

**Root Cause**: Tasks were completed without proper `TaskUpdate()` calls including:

- `metadata.summary` (non-fallback)
- `metadata.filesModified` (array of file paths)
- `metadata.outputArtifacts` (report/artifact paths)

**Impact**:

- Reflection scores WITHHELD (6/6 tasks cannot be assessed)
- Memory learnings LOST (patterns, gotchas, decisions not extracted)
- Quality audit trail BROKEN (no record of actual work)

**Solution**:

1. **Immediate**: Investigate post-completion-chain.cjs behavior; may be allowing tasks to complete without validation
2. **Enforce**: Set `COMPLETION_METADATA_ENFORCEMENT=block` (default currently: off)
3. **Retroactive**: Manually update task 38-43 metadata with actual work context, then re-run reflection

**Evidence**:

- Reflection report: `.claude/context/reports/reflections/reflection-batch-38-43-2026-02-20.md`
- Reflection log entries: 6 lines with `dataQuality: "insufficient"`
- Fallback string signature: "Task X completed without summary metadata" in all 6 summaries

**Priority**: P1 (ELEVATED - recurring pattern affects quality auditing and memory consolidation)

---

## 2026-02-13: Bash Command Allowlist Lacks Categorization (P2)

**Issue**: SAFE_COMMANDS_ALLOWLIST in registry.cjs has 80+ commands in flat list.

**Solution**: Refactor into categorized sections (shell builtins, read-only fs, dev tools, build tools, archive tools).

**Priority**: P2

## Code Quality Review Findings (2026-02-15)

### CRITICAL Issues (P0 - Fix Sprint 1)

1. **CRITICAL-001: Silent data loss in safe-json.cjs**
   - Lines 236-249: JSON.parse(JSON.stringify()) in try-catch with silent fallback
   - Impact: Data corruption goes undetected
   - Fix: Add logging, use structured clone API or deep-clone library, add tests

2. **CRITICAL-002: Race conditions in file access**
   - Files: memory-manager.cjs, code-index-updater.cjs
   - Issue: No file locking for concurrent access
   - Fix: Implement proper-lockfile per ADR-116, atomic writes

3. **CRITICAL-003: Memory leaks in error tracking**
   - Files: error-pattern-detector.cjs (Maps), safe-json.cjs (warnedSchemas Set)
   - Issue: Unbounded data structures grow indefinitely
   - Fix: Implement LRU cache (max 100 entries), TTL-based expiration

### HIGH Issues (P1 - Fix Sprint 2)

4. **HIGH-001: Empty catch blocks lose telemetry**
   - File: pre-task-unified.cjs lines 94-150
   - Issue: Event bus errors silently swallowed
   - Fix: Log all errors, circuit breaker pattern, fallback metrics

5. **HIGH-002: Shell injection regex complexity**
   - File: bash-command-validator.cjs lines 40-68
   - Issue: Complex regex difficult to verify
   - Fix: Comprehensive tests (50+ cases), document edge cases

6. **HIGH-003: Synchronous file I/O blocks event loop**
   - Files: 15+ across memory/ and hooks/
   - Impact: Latency spikes, poor scalability
   - Fix: Migrate to fs.promises, read-through cache

7. **HIGH-004: Missing hook input validation**
   - File: hook-input.cjs
   - Impact: Crashes on malformed input, fail-open risk
   - Fix: JSON schema validation, safe defaults

### Test Coverage Gaps

- Concurrent file access scenarios (race conditions)
- Error pattern detector edge cases (circular refs, OOM)
- Regex validator completeness (known-bad/good inputs)
- Hook input malformed data handling
- Memory leak scenarios (long-running processes)

---

## QA Audit 2026-02-15 — Critical Test Coverage Gaps

**Date**: 2026-02-15
**Severity**: CRITICAL
**Impact**: Core subsystems have 0% test coverage

**Critical Findings**:

1. **39 memory modules untested** (0% coverage) — Risk: data loss/corruption
   - memory-sanitizer.cjs (prototype pollution protection)
   - memory-lifecycle.cjs (STM→MTM→LTM transitions)
   - memory-extraction.cjs (entity extraction)
   - lancedb-client-impl.cjs (vector store operations)
   - memory-rotator.cjs (40KB/80KB threshold enforcement)

2. **17 routing modules untested** (0% coverage) — Risk: misrouting
   - intent-classifier.cjs (semantic intent matching)
   - fuzzy-intent-matcher.cjs (specialist-first routing)
   - routing-table.cjs (agent selection)
   - task-lifecycle-state.cjs (state transitions)
   - task-claim-ledger.cjs (concurrent ownership)

3. **No regression tests** for known bugs:
   - Context overflow (5+ parallel agents incident 2026-02-09)
   - Memory rotation threshold violations (74KB decisions.md, 62KB issues.md)
   - Windows path normalization (glob pattern backslashes)
   - Hook registration staleness (requires session restart)

4. **No security tests** (OWASP ASI):
   - Memory poisoning (prototype pollution via **proto**)
   - Prompt injection (instruction marker detection)
   - Tool misuse (blacklist bypass attempts)

5. **Test quality issues**:
   - Tests check internal state instead of behavior (ADR-103 violation)
   - Mocking overuse (false confidence)
   - Missing negative tests (error paths untested)
   - No integration boundary tests

**Test Debt**: ~150 missing test files, 4-6 weeks effort (2 devs, TDD)

**Full Report**: `.claude/context/reports/qa/qa-audit-2026-02-15.md`

---

## Phase 5-6 Minor Issues (2026-02-15)

**M18: Race Condition M18-M19 Deferred** (P2)

- Issue: memory-tiers.cjs concurrent initialization with STM/MTM/LTM could theoretically race on initial lock acquisition
- Status: DEFERRED to future sprint (low probability, file locking added as safety net per ADR-126)
- Workaround: Sequential session startup + file-based lock prevents race condition in practice
- Impact: Non-blocking, mitigation in place

**M19: memory-tiers.cjs Line Count Warning** (P3 - non-blocking)

- Issue: memory-tiers.cjs exceeds 500-line budget (502/500 lines)
- Status: Minor lint warning, not enforced at deployment
- Plan: Split to memory-tiers-core.cjs (300L) + memory-tiers-eviction.cjs (200L) in next sprint
- Impact: Code organization, no functional change required

---

## Task Metadata Governance Critical Failure (2026-02-18) — P0 BLOCKER

**CRITICAL**: 12+ task completions on 2026-02-17 without summary metadata block reflection quality assessment and pattern extraction.

**Evidence**:

- gotchas.json entry `missing-taskupdate-metadata-recurring` (lines 22-39) documents 12 confirmed failures in single session
- 4+ tasks simultaneously stuck in `in_progress` status awaiting manual router updates
- Reflection agent defaults to WARNING score (0.45) for undocumented tasks, masking actual work quality

**Root Cause**:

- 70-line TaskUpdate warning box in spawn templates insufficient; agents skip documentation for "small/fast tasks"
- Training-based enforcement has permanently failed across 12+ sessions
- No runtime validation enforces metadata requirements

**Impact**:

- Router forced to manually update task statuses after agent completions
- Reflection cannot score output quality or extract patterns without metadata
- Workflow stalls (4+ tasks stuck waiting for manual resolution on 2026-02-17 alone)

**Solution**:

- **MANDATORY**: Create/register `pre-completion-validation.cjs` hook with COMPLETION_METADATA_ENFORCEMENT enforcement
- Hook must validate TaskUpdate(completed) contains `metadata.summary` (non-empty string, min 3 words) + `filesModified` array
- Configuration: COMPLETION_METADATA_ENFORCEMENT={warn|block|off} with **default: block** (not warn)
- Must block ALL agent TaskUpdate calls lacking required metadata fields

**Required Actions**:

1. Implement hook or verify if pre-completion-validation.cjs already exists (status TBD)
2. Register hook in settings.json PreToolUse(TaskUpdate) chain
3. Update agent spawn templates with explicit requirement: "SHORT TASKS STILL NEED METADATA: { summary: 'Fixed X in Y.cjs', filesModified: ['path/file'] }"
4. Add checkbox validation to TaskUpdate warning box: "TaskUpdate called with metadata.summary and filesModified"

**Report**: `.claude/context/reports/reflections/batch-reflection-2026-02-18.md` (Section: Task Metadata Governance Failure Pattern)

---

## Ghost Task Reflection Echo Pattern (2026-02-18) — P1

**Medium Priority**: Reflection queue can re-trigger on task IDs previously identified as ghost tasks, creating duplicate reflection spawns.

**Evidence**:

- gotchas.json entry `ghost-task-reflection-echo` (lines 42-57)
- 2026-02-17 22:23 batch: Task #2 flagged as ghost task in 22:14 batch, then re-triggered in 22:23 batch
- Pure duplicate spawn with zero diagnostic value

**Root Cause**:

- reflection-cleanup.cjs processes completed reflection-agent TaskUpdate calls but may not fully clear processedReflectionIds before next reflection spawn
- Ghost task IDs persist in reflection-spawn-request.json between reflection batches
- No deduplication logic in reflection-queue-processor.cjs

**Solution**:

- Add ghost-task deduplication to reflection-queue-processor.cjs
- Before spawning, check reflection-log.jsonl for prior entries with same reflectionId
- If found with status 'ghost_task_detected', suppress spawn and log deduplication event
- Implement REFLECTION_TASK_VALIDATION enforcement mode (warn|block|off)

**Report**: `.claude/context/reports/reflections/batch-reflection-2026-02-18.md` (Section: Reflection 2)

---

## REFLECTION-AGENT INSUFFICIENT DATA GATE FAILURE (2026-02-18) — P0 CRITICAL

**Critical Blocker**: Task 15 and Task 16 completed without metadata summaries, creating the IRONIC situation where tasks designed to FIX missing-metadata bugs themselves failed to include metadata.

**Evidence**:

- Task 15: pre-completion-validation.cjs bug fixes (3 bugs) — NO METADATA
- Task 16: REFLECTION_SCORE_ENFORCEMENT check addition — NO METADATA
- Pattern: 15th+ occurrence in this session alone
- Irony: Both tasks are meant to PREVENT this exact pattern

**Root Cause**:

- pre-completion-validation.cjs enforcement mode is warn, not block (does not prevent completion)
- Agents do not respect metadata requirements for "small/quick fixes"
- No hard blocking mechanism exists for missing summaries

**Impact**:

- Reflection agent cannot compute scores (INSUFFICIENT_DATA gate triggers)
- Pattern recurrence continues unabated despite fixes in task 15
- Demonstrates that hook fixes alone are insufficient; requires runtime blocking

**Immediate Action Required**:

- Verify pre-completion-validation.cjs exists and check enforcement mode
- If in WARN mode, escalate to BLOCK mode
- If hook doesn't exist, implement immediately with hard blocking for missing metadata.summary

**Report**: This batch reflection (task 17)

---

## scan_and_quarantine Policy Gap — external-content-guard in warn mode (2026-02-20) — P1

**Issue**: The `external-content-guard` hook fires warnings (5 entries confirmed in external-fetch-audit.jsonl during supply chain test 2026-02-20T08:43) but does NOT prevent external content from being incorporated. The hook operates in warn mode, not quarantine/block mode. This means the SEC-EXT security gate warns but does not enforce quarantine on content from unverified organizations.

**Evidence**:

- Task 2 (08:43:19Z): external-content-guard fired 5x on gh api calls to gemini-cli-extensions — all warn, none blocked
- Task 1 (08:43:51Z): Root cause identified as hook mode = warn, not quarantine/block
- `EXTERNAL_CONTENT_GUARD_MODE` is not set to `block` or `quarantine` in current environment

**Impact**: External content from unverified organizations can flow through creator skills despite security gate warnings. Supply chain attack vector remains partially open.

**Action Required**:

1. Verify `external-content-guard.cjs` has block/quarantine mode implementation
2. Set `EXTERNAL_CONTENT_GUARD_MODE=block` in `.env` (requires human authorization)
3. Write automated tests: verify flagged content is rejected when mode=block
4. Document approved org domains (github.com/anthropics, github.com/VoltAgent) vs review-required domains

**Priority**: P1

**Report**: `.claude/context/reports/reflections/batch-reflection-supply-chain-test-2026-02-20.md`

---

## Security Gate Insertion Integration Verification Gap (2026-02-20) — P1

**Issue**: Supply chain security controls (SEC-EXT-001–007) were inserted into 4 creator skills (skill-creator, skill-updater, agent-creator, agent-updater) but integration verification is incomplete.

**Evidence**:

- Tasks 4–7 (2026-02-20T08:02–08:12) reported "Security Gate insertion" but provided no filesModified or line references
- external-fetch-audit.jsonl runtime file existence unconfirmed
- No automated tests for Security Gate scan effectiveness (7 checks: size, binary, tool-invocation, prompt-injection, exfiltration, privilege, provenance)
- skill-catalog.md and agent-registry.json update status unknown post-insertion

**Impact**: If Security Gate is absent or malformed in any creator skill, supply chain attack vectors remain open. The insertion work may be correct but is unverifiable without filesystem confirmation.

**Required Actions**:

1. Grep for "SEC-EXT-001" in `.claude/skills/skill-creator/SKILL.md`, `.claude/skills/skill-updater/SKILL.md`, `.claude/skills/agent-creator/SKILL.md`, `.claude/skills/agent-updater/SKILL.md`
2. Confirm `external-fetch-audit.jsonl` exists at `.claude/context/runtime/`
3. Write automated tests for each SEC-EXT-00N check in `.claude/skills/skill-updater/tests/`
4. Run artifact-integrator on the 4 updated skills

**Report**: `.claude/context/reports/reflections/batch-reflection-2026-02-20-fifth.md`
