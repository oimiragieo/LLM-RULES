## 2026-02-20: Reflection Spawn Deduplication Gap (P1)

**Issue**: The same three reflection IDs (task_completion:2026-02-20T03:21:47.545Z:1, :2, :3) were processed in THREE separate reflection batches (approx 05:00, 05:30, and a third pass). The reflection-cleanup.cjs atomic handshake should prevent reprocessing, but the IDs are reappearing in reflection-spawn-request.json across sessions.

**Root Cause**: Likely a race condition in reflection-cleanup.cjs where the spawn-request.json is not fully cleared before the next session starts, or the cleanup hook is not running when reflection-agent marks its task completed.

**Action Needed**:

1. Verify reflection-cleanup.cjs is registered in settings.json PostToolUse(TaskUpdate)
2. Add deduplication check in reflection-step0-guard.cjs: before spawning, grep reflection-log.jsonl for processedReflectionIds that match pending IDs
3. Consider implementing REFLECTION_TASK_VALIDATION=warn|block|off mode (ADR-138)

**Priority**: P1 — wastes reflection-agent spawn budget on zero-value re-reflections

---

## 2026-02-20: pre-completion-validation.cjs Warn Mode Escalation Needed (P1)

**Issue**: Task 2 (2026-02-20) completed without TaskUpdate summary metadata — the 15th+ confirmed occurrence. ADR-139 mandates BLOCK mode for `COMPLETION_METADATA_ENFORCEMENT`. The pre-completion-validation.cjs hook appears to be in warn mode or not registering fully.

**Action Needed**: Check `.claude/hooks/` for `pre-completion-validation.cjs`, verify enforcement mode, escalate to `COMPLETION_METADATA_ENFORCEMENT=block` if currently in warn mode.

**Priority**: P1 — prevents reflection scoring, stalls pipeline

---

## 2026-02-20: wave-executor skill-index.json Entry Still Stale (P1)

**Issue**: Despite Task 2 (2026-02-20) updating SKILL.md frontmatter and Task 3 adding skill-creator guidance to prevent recurrence, the `wave-executor` entry in `skill-index.json` still shows `agentPrimary: ["developer"]`, `category: "Other"`. This is an outstanding stale entry that needs direct remediation.

**Action Needed**: Run `node .claude/tools/cli/generate-skill-index.cjs` and verify wave-executor entry, OR update `agent-skill-matrix.json` lookup table to include wave-executor under router/master-orchestrator/planner.

**Priority**: P1 — affects skill routing accuracy

---

## 2026-02-20: skill-index.json Silent Stale After Regeneration (P1)

**Issue**: `skill-index.json` can appear freshly generated (generatedAt timestamp advances) while retaining stale agentPrimary/category/domain values for a specific skill entry. The regeneration ran but the skill entry was not updated — silent failure.

**Evidence**: wave-executor task (2026-02-20). SKILL.md frontmatter updated (`agents: [router, master-orchestrator, planner]`), skill-catalog.md correct, but skill-index.json still showed `agentPrimary: ["developer"]`, `category: "Other"` after regeneration at 04:26:33Z.

**Impact**: Downstream agents using skill-index.json for routing/discovery still receive wrong agentPrimary. Router may misroute skill invocations.

**Investigation Needed**:

- Check `generate-skill-index.cjs` catalog row parsing for wave-executor row format
- Verify whether agentPrimary is sourced from skill-catalog.md table OR SKILL.md frontmatter `agents:` field
- Add post-generation spot-check validation against catalog

**Priority**: P1 — affects skill routing accuracy

---

## 2026-02-18: REFLECTION-BLIND-001 -- Reflection Agent Score Fabrication on Missing Metadata (P1)

**Issue**: When artifact-integrator omits TaskUpdate metadata (recurring, 14+ occurrences), reflection-agent receives only the fallback string "Task X completed without summary metadata" and awards a passing score (0.79/1.0 observed) without independent verification. Integration health check (ADR-100 Phase 5.5) is silently bypassed because artifact ID is unavailable.

**Root Causes** (4 layers):

1. No data sufficiency gate in reflection agent before scoring
2. No enforcement hook on TaskUpdate(completed) for metadata.summary
3. Reflection does not independently verify artifacts in catalogs/registries
4. Reflection queue entry is too sparse (no filesModified, outputArtifacts, agent)

**Proposed Fixes**:

- Fix A (P0): Add warn/block hook in pre-completion-validation.cjs for missing metadata.summary
- Fix B (P1): Add INSUFFICIENT_DATA gate in reflection-agent.md prompt
- Fix C (P1): Add independent artifact verification for creation tasks in Phase 5.5
- Fix D (P2): Enrich reflection queue entries with task metadata at capture time

**Report**: `.claude/context/reports/architecture/reflection-blindness-bug-2026-02-18.md`

---

## 2026-02-19: Enterprise Bundle Generation Plan Risks (P1-P2)

**Source**: Task #12 reflection analysis

**Critical Planning Gaps** (identified during plan review):

1. **Token Cost Unvalidated** (P1-BUDGET): Phase 2 estimate of 3-4M tokens lacks verification. At current rates (~$0.08/1M input tokens), generation phase alone costs $240+. Plan does not lock cost guardrail before proceeding. Recommendation: Run Phase 0 inventory first, calculate actual cost, obtain approval before generation.

2. **Stub Detection False Negatives** (P1-CORRECTNESS): Stub detection algorithm may incorrectly flag legitimate skill files as stubs. Example: a skill with intentional `action`/`target` schema would match stub signature but should not be replaced. Recommendation: Phase 0 logs all detected stubs for manual review; developers must approve each replacement target before Phase 2 begins.

3. **LLM Generation Prompts Unspecified** (P1-QUALITY): Phase 2 assigns "developer agent" to generate domain-specific bundle files, but exact LLM prompts are not written. Risk: generated files may be generic stubs with domain-sounding language (hallucination). Recommendation: Write explicit generation prompt templates for each file type (input schema, output schema, pre-execute hook, etc.) before Phase 2 Wave 1.

4. **Protected Skills Governance at Wrong Layer** (P2-SAFETY): Plan lists 5-10 protected skills (ai-ml-expert, android-expert, rust-expert, accessibility) with instruction "skip non-stub files," but protection is in Phase 3 QA (post-write). Risk: developers might miss protection during Phase 2 generation. Recommendation: enforce protection in generation script itself (fail-closed on attempts to write protected skill non-stub files).

5. **Wave Stopping Condition Undefined** (P2-PROCESS): Plan allows parallelizing waves but has no defined gate: "if Wave 1 fails >10% targets, pause before Wave 2." Workflow is unclear on escalation path if early waves produce poor results. Recommendation: add explicit stopping criteria to Phase 3 QA report.

6. **Reflection Agent Model Mismatch** (P2-DOCUMENTATION): Plan Phase FINAL specifies reflection-agent with "haiku" model, but reflection-agent.md frontmatter declares model: sonnet. Recommendation: verify and update plan or agent definition.

**Mitigation Strategy**:

- Phase 0 must complete with manual approval of stub inventory before any writes
- Create explicit LLM generation prompts for Phase 2 before execution
- Add cost validation gate (Phase 0 → Phase 1 approval checkpoint)
- Hardcode protected skills in generation script (not in QA validation)
- Define wave quality thresholds and stopping conditions

---

## 2026-02-13: VUL-BYPASS-001 -- Code Block Exemption Bypass (P1)

**Issue**: Triple-backtick code blocks fully exempt from scanning. Wrapping malicious payload in backticks bypasses all detection.

**Priority**: P1

---

## 2026-02-13: VUL-BYPASS-003 -- Only 1 of 5+ Memory Write Paths Sanitized (P1)

**Issue**: Sanitizer only protects writeMemory(). Four other paths bypass sanitization.

**Priority**: P1

---

## 2026-02-11: Test Failures in Comprehensive Suites (P2)

**Issue**: 3 test failures in new comprehensive test suites. 98/101 tests pass (97%).

**Details**: routing-guard-comprehensive (2 failures), unified-creator-guard-comprehensive (1 failure).

**Priority**: P2 (non-blocking)

---

## 2026-02-11: Memory Sanitizer Not Yet Implemented (P1)

**Issue**: HIGH-004 (Memory poisoning) identified in security audit but deferred from Wave 2b.

**Priority**: P1

---

## 2026-02-09: Remaining Ecosystem Gaps (61 gaps)

**Distribution**: 0 CRITICAL, 13 HIGH, 48 MEDIUM.

**Key Patterns**: Extended Thinking (13 agents), ROUTING_TABLE Gaps (10 agents), Skill Assignments (several), Model Mismatches (8 agents).

**Priority Actions**: Enable extended_thinking for 7 analysis agents, add ROUTING_TABLE entries for pm/reflection-agent, quarterly audit cadence.

---

## 2026-02-11: CRITICAL SECURITY FINDINGS - Wave 2 Hooks (11 vulnerabilities)

**Report**: `.claude/context/reports/security/security-audit-wave2-2026-02-11.md`

**P0 (Fix Immediately)**:

- VUL-TAM-001: Loop-State TOCTOU Race Condition (2h)
- VUL-DOS-001: Whitespace Bomb DoS (1h)
- VUL-ELEV-001: Router Mode Bypass via Env Override (1h)

**P1 (Fix This Week)**:

- VUL-TAM-002: Unicode Normalization Bypass
- VUL-DOS-002: Regex Backtracking Loop
- VUL-ELEV-002: Creator Intent Guard Bypass
- ASI01-SPOOF-001: Session ID Environment Override

---

## 2026-02-13: RESOLVED - Security Fixes (Commits 1-4)

✅ CRITICAL-002 (shell injection): shell: false adopted
✅ CRITICAL-001 (JSON.parse safety): safeParseJSON adopted
✅ HIGH-002 (DB race): File-based locking added
✅ P0 (nul file): Windows reserved filename deleted

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
