## ADR-136: Runtime State Unification (2026-02-16)

**Status:** PROPOSED
**Decision:** Unify 14 runtime state JSON files into a single `runtime-state.json` with namespaced sections, managed by a `RuntimeStateManager` class that uses `proper-lockfile` for all writes.

**Context:**

- Architecture audit (2026-02-16) identified C3: 14 concurrent-writable runtime state files without unified locking.
- `proper-lockfile` is already a production dependency but used only in LanceDB initialization.
- Hook processes can execute concurrently (multiple hooks registered for same event), creating race conditions.
- Files affected: router-state.json, task-status.json, spawn-assembly-cache.json, routing-block-dedupe.json, agent-guardrails-state.json, drift-state.json, edit-counter.json, tool-governance-state.json, reflection-step0-state.json, token-slo-state.json, and 4 more.

**Decision:**

1. Create `.claude/lib/runtime/runtime-state-manager.cjs` — single class for all runtime state reads/writes
2. Uses `proper-lockfile` for write operations (lock timeout: 5s, stale: 10s)
3. Single `runtime-state.json` with namespaced sections: `{ routing: {}, tasks: {}, reflection: {}, workflow: {}, telemetry: {} }`
4. Migrate hooks incrementally (start with highest-frequency hooks: routing-guard, post-task-unified)
5. Backward-compatible: old file paths remain as shims that delegate to RuntimeStateManager during migration

**Consequences:**

**Positive:** Eliminates concurrency bugs; reduces file I/O from 14 reads to 1; enables atomic multi-property updates; single debugging point for session state.

**Negative:** Migration effort (~1 week); transient period where some hooks use old files and some use new manager.

**Related:**

- Architecture Audit 2026-02-16: Finding C3
- Architecture Audit 2026-02-16: BACKWARD_PROPAGATION (schema:runtime-state-unified)

---

## ADR-136: safeParseJSON Migration and ESLint Enforcement (2026-02-16)

**Status:** ACCEPTED
**Decision:** Migrate all `JSON.parse()` calls in hook files to `safeParseJSON()` utility and add ESLint rule to prevent future unsafe usage.

**Context:**

- Security report (2026-02-16) documented JSON parsing safety as existing control (SEC-LIB-001 standard)
- Code reviewer (Wave 1) identified 68+ JSON.parse issues in codebase
- Risk:
  - Invalid JSON in hook input crashes entire hook process
  - Prototype pollution attacks via `__proto__`, `constructor`, `prototype` keys
  - Malicious JSON: `{ "__proto__": { isAdmin: true } }` could escalate privileges
- `safeParseJSON` provides:
  - Try-catch wrapping (prevents crash)
  - Prototype pollution protection
  - Structured return `{ success, data, error }`
  - Optional fallback value

**Decision:**

1. **Immediate (included in security hardening):**
   - Audit all hook files for `JSON.parse()` calls
   - Migrate to `safeParseJSON()` from `.claude/lib/utils/safe-json.cjs`
   - Test error handling paths

2. **Short-term (1 week):**
   - Add ESLint rule: `no-restricted-syntax` to block `JSON.parse()` in hook files
   - Configure rule in `.eslintrc.cjs`:
     ```javascript
     'no-restricted-syntax': [
       'error',
       {
         selector: 'CallExpression[callee.object.name="JSON"][callee.property.name="parse"]',
         message: 'Use safeParseJSON() instead of JSON.parse() in hook files for safety'
       }
     ]
     ```

3. **Documentation:**
   - Update `.claude/rules/security.md` with safeParseJSON usage
   - Add examples to security documentation

**Implementation:**

```javascript
// BEFORE (unsafe):
const data = JSON.parse(hookInput);

// AFTER (safe):
const { safeParseJSON } = require('.claude/lib/utils/safe-json.cjs');
const { success, data, error } = safeParseJSON(hookInput, {});
if (!success) {
  console.error('Parse error:', error);
  return {};
}
```

**Consequences:**

**Positive:**

- Hook reliability improved (no crashes on malformed JSON)
- Prototype pollution attacks blocked
- Audit trail for parse errors
- ESLint enforcement prevents regressions

**Negative:**

- Slightly more verbose code (~3 lines vs 1)
- Existing code requires migration (68+ sites)

**Related:**

- Security Report 2026-02-16: JSON Parsing Safety (existing control validated)
- Code Review Wave 1: 68+ JSON.parse findings
- `.claude/lib/utils/safe-json.cjs`: Implementation
- `.claude/rules/security.md`: JSON Parsing Safety section

---

## ADR-132: Sequential Remediation for Convergent Audit Findings (2026-02-16 REFLECTION DECISION)

**Status:** ACCEPTED (Phase 0 Reflection, Task #5)
**Decision:** When multiple independent audits converge on the same issue, remediate sequentially (not parallel) to avoid merge conflicts in shared files.

**Rationale:**

- Evidence: Dead hooks (P0.1) blocks other work; must clean settings.json registry before adding tests
- Parallel work causes merge conflicts in central config files (settings.json, agent-registry.json)
- Sequential ordering enables dependency resolution (e.g., clean hooks → add hook tests → validate)
- Trade-off: Slower timeline but lower risk of rework

**Implementation:**

- Week 1: Clean dead hooks from settings.json (1 hour)
- Week 2: Add integration tests for routing/state/cycle (3.5 days)
- Week 3: Harden security (memory validation + JSON.parse migration, 3 weeks)

**Pattern:** Convergent audit findings signal systemic issues → prioritize P0 cleanup before adding tests/features.

**Evidence:** 4-wave analysis (architect, security, qa, qa) identified 17 findings with 3-way convergence on dead hooks, JSON.parse, and routing gaps.

---

## ADR-133: Integration Tests Before Feature Work (2026-02-16 REFLECTION DECISION)

**Status:** ACCEPTED (Phase 0 Reflection, Task #5)
**Decision:** Block all feature work until 6 P0 integration test gaps are closed (routing Check 7, task state machine, cycle detection).

**Rationale:**

- Evidence: 100% test pass rate (211/211) masks critical coverage gaps in routing logic, state machine, cycle detection
- Impact: Gaps could corrupt workflows under load (tasks stuck, infinite loops, specialist misrouting)
- "Test later" approach failed (memory shows 3 late-discovered bugs in previous pipeline)
- Deployment blockers take precedence over feature velocity

**Implementation:**

- Block all feature PRs until P0 tests pass
- QA must validate routing-guard Check 7 (20 tests), task-lifecycle-state (15 tests), cycle-detector (10 tests)
- Timeline: 3.5 days to close all P0 gaps

**Pattern:** High test pass rate ≠ comprehensive coverage → use audit findings as coverage proxy, not just pass rate.

---

## ADR-137: Enterprise Bundle Generation Multi-Gate Approval (2026-02-19 REFLECTION DECISION)

**Status:** PROPOSED (Task #12 reflection analysis)

**Decision:** Enterprise bundle generation (Plan Phase 2 execution) requires three sequential approval gates before proceeding past Phase 0.

**Context:**

- Task #12 plan proposes generating domain-specific bundle files for ~177 skills
- Phase 2 execution (150+ skills × 8 files = 1,200+ file writes, 3-4M tokens, ~$240+ cost)
- Multiple risk vectors identified during plan review:
  1. Token cost unvalidated against budget
  2. Stub detection false negatives (legitimate stub-like files may be incorrectly flagged for replacement)
  3. LLM generation prompts unspecified (hallucination risk for domain specificity)
  4. Protected skills governance at wrong layer (protection in QA phase, not generation phase)

**Decision:**

**Gate 1: Inventory Approval (BLOCKING Phase 1)**

- Phase 0 completes stub inventory enumeration
- Output: `.claude/context/artifacts/analysis/skill-bundle-inventory-2026-02-19.json` with all detected stubs and tier classification
- **Manual review required:** Router/Planner reviews inventory, approves scope, documents approval in commit message
- Approval form: "Reviewed {N} stub files for replacement. Approved {M} for replacement. Deferred {K} for manual review."

**Gate 2: Cost and LLM Specification Validation (BLOCKING Phase 2)**

- Phase 1 research completes
- Phase 2 LLM generation prompts written for each file type (input schema, output schema, hooks, commands, templates, scripts)
- Prompts validated on 3-5 test skills (language experts: rust-expert, go-expert, typescript-expert)
- **Validation criteria:** Generated files are domain-specific (not generic stubs with domain-sounding language), pass JSON validation, pass node --check for .cjs files
- Cost re-estimated based on Phase 0 + Phase 1 actual usage
- **Approval required:** Developer reports test results + cost estimate. Proceeds only if test quality meets gold standard (TDD example).

**Gate 3: Protected Skills Enforcement (BLOCKING Phase 2)**

- Hardcode protected skills list (ai-ml-expert, android-expert, rust-expert, accessibility, + any others identified in Phase 0)
- Generation script fails-closed on attempts to write protected non-stub files
- **Validation:** QA verifies script enforcement via code review + test case (attempt to replace protected file → script rejects with error)

**Gate 4: Wave Quality Threshold (WITHIN Phase 2)**

- After each wave completes validation: if >10% of generation targets fail specificity/syntax checks, pause pipeline
- Report findings to planner; requires decision to (a) revise LLM prompts and retry, (b) defer problematic skills to manual review, or (c) proceed with documented exceptions

**Rationale:**

- Phase 0 approval prevents executing against incorrect inventory
- Cost + LLM validation prevent expensive mistakes (token overspend, hallucination)
- Protected skills enforcement prevents data loss
- Wave quality thresholds enable early course correction

**Consequences:**

**Positive:**

- Reduces risk of 1,200+ file writes on incorrect/speculative inventory
- Forces LLM prompt specification before generation (quality assurance)
- Cost visibility enables budget discussion upfront
- Protected skills governance is fail-closed

**Negative:**

- Adds 3-4 days to Phase 2 timeline for approval/validation cycles
- Requires manual review touchpoints (not fully automated)

**Acceptance Criteria:**

- [ ] Phase 0 inventory JSON complete
- [ ] Manual approval documented for stub replacement scope
- [ ] Cost estimated and logged
- [ ] LLM generation prompts written for all 8 file types
- [ ] Test generation validated on 3+ test skills (gold standard quality confirmed)
- [ ] Protected skills hardcoded in generation script
- [ ] QA verifies protection enforcement via code review
- [ ] All gates satisfied before Phase 1 begins

**Related:**

- Task #12 Reflection Analysis (2026-02-19)
- Enterprise Bundle Generation Plan (`.claude/context/plans/enterprise-bundle-gen-plan-2026-02-19.md`)
- Issues.md: Enterprise Bundle Generation Plan Risks (2026-02-19)

**Evidence:** QA report documented 6 critical gaps despite 100% test pass rate; architect and security independently flagged routing-guard untested.

---

## ADR-140: Supply Chain Security Gate for Creator Skills (2026-02-20 REFLECTION DECISION)

**Status:** ACCEPTED (security-architect Task #2, 2026-02-20)

**Decision:** All 4 creator/updater skills (skill-creator, skill-updater, agent-creator, agent-updater) that fetch external content MUST execute a mandatory 7-check Security Gate (SEC-EXT-001–007) before incorporating any fetched content.

**Context:**

- STRIDE threat model identified 16 threats against creator lifecycle, including adversarial skill injection via VoltAgent community benchmarks
- External content fetch step (introduced in skill-updater + agent-updater for VoltAgent prior-art check) creates supply chain attack surface
- 35 red flag patterns documented across 9 security gaps

**Security Gate Checks (SEC-EXT-001–007)**:

1. **SEC-EXT-001 SIZE CHECK**: Reject content > 50KB (DoS risk)
2. **SEC-EXT-002 BINARY CHECK**: Reject content with non-UTF-8 bytes
3. **SEC-EXT-003 TOOL INVOCATION SCAN**: Search for `Bash(`, `Task(`, `Write(`, `Edit(`, `WebFetch(`, `Skill(` outside code examples — FAIL if found in prose
4. **SEC-EXT-004 PROMPT INJECTION SCAN**: Search for "ignore previous", "you are now", "act as", "disregard instructions", hidden HTML comments — FAIL if found
5. **SEC-EXT-005 EXFILTRATION SCAN**: Search for curl/wget/fetch to non-github.com domains, `process.env` access + outbound HTTP — FAIL if found
6. **SEC-EXT-006 PRIVILEGE SCAN**: Search for `CREATOR_GUARD=off`, `settings.json` writes, `CLAUDE.md` modifications — FAIL if found
7. **SEC-EXT-007 PROVENANCE LOG**: Record `{ source_url, fetch_time, scan_result }` to `.claude/context/runtime/external-fetch-audit.jsonl`

**Policy**: On ANY FAIL — do NOT incorporate content. Log failure reason. Invoke `security-architect` for manual review.

**Enforcement**: Gate content IDENTICAL across all 4 skills. Named control IDs enable audit cross-reference.

**Related:**

- Batch reflection report: `.claude/context/reports/reflections/batch-reflection-2026-02-20-fifth.md`
- Issues.md: Security Gate Insertion Integration Verification Gap (2026-02-20)
- `.claude/context/runtime/external-fetch-audit.jsonl` (runtime audit file)

---

## ADR-137: Structured Repository Reconnaissance Pattern (2026-02-17)

**Status:** ACCEPTED
**Decision:** Mandate a tiered reconnaissance pattern (`Map -> Identify -> Fetch`) for all repository ingestion and onboarding tasks, implemented via the `github-ops` skill.

**Context:**

- Repository onboarding tasks often enter "failure loops" where agents guess file paths or attempt to fetch large files blindly.
- Log analysis (session `d8c6d343`) showed 60+ tool uses wasted on "File does not exist" errors and streaming stalls due to blind fetching.
- Agents frequently use Linux-style paths (`/c/dev/...`) on Windows, triggering security blocks or tool crashes.
- High token waste: fetching a 26KB `CHANGELOG.md` when only the version string was needed.

**Decision:**

1. **Mandatory Reconnaissance Phase:** Agents MUST list directory contents using `gh api` before reading specific files.
2. **Tiered Ingestion:**
   - Tier 1: List root and core directories (metadata only).
   - Tier 2: Identify and read entrypoints (`README.md`, `package.json`, `gemini-extension.json`).
   - Tier 3: Targeted deep dive into logic files based on Tier 2 findings.
3. **Filtering**: Use `--jq` to filter API responses to minimize context bloat.
4. **Platform Safety**: Enforce native Windows paths and block Linux-specific constructs in `gh` commands via `github-ops` hooks.

**Consequences:**

**Positive:**

- Eliminates "failure loops" from incorrect file path guesses.
- Significantly reduces token usage during discovery phase.
- Improves stability on Windows by enforcing native path patterns.
- Higher success rate for `artifact-integrator` agent.

**Negative:**

- Requires one extra tool call (`gh api`) before reading files.
- Agents must be trained/prompted to use the new `github-ops` skill.

**Related:**

- `github-ops` skill bundle
- `artifact-integrator` specialized agent
- `user-prompt-unified` Platform Awareness Rule

---

## ADR-139: Task Metadata Enforcement via Pre-Completion Hook (2026-02-18)

**Status:** ACCEPTED — CRITICAL P0, MANDATORY IMPLEMENTATION

**Decision:** Implement `pre-completion-validation.cjs` hook to enforce TaskUpdate metadata requirements. Training-based enforcement failed 12+ times on 2026-02-17 alone. Runtime hook-based validation is non-negotiable.

**Context:**

- 12+ task completions on 2026-02-17 without TaskUpdate summary metadata blocked reflection quality assessment
- 70-line TaskUpdate warning box in spawn templates failed to prevent metadata omissions
- Agents skip documentation for "small/fast tasks" despite template guidance
- Router forced to manually update 4+ stuck tasks, stalling enterprise pipeline
- Reflection agent unable to score outputs or extract patterns without metadata
- Prior learning (gotchas.json `missing-taskupdate-metadata-recurring`) noted "training-based approaches have failed across 12+ confirmed sessions"

**Decision:**

1. **Create `pre-completion-validation.cjs` hook** (if missing; status TBD)
   - Validates ALL TaskUpdate(completed) calls contain non-empty metadata.summary
   - Validates metadata.filesModified is array with ≥1 entry
   - Blocks completion if metadata missing (exit code 2, fail-closed)
   - Minimum metadata: `{ summary: "Fixed X in Y.cjs", filesModified: ["path/file"] }`

2. **Register in settings.json PreToolUse(TaskUpdate) chain**
   - Hook must run BEFORE any other PreToolUse hooks
   - Must be fail-fast: first non-zero exit halts chain
   - Configuration: `COMPLETION_METADATA_ENFORCEMENT={warn|block|off}` with **default: block**

3. **Update agent spawn templates**
   - Add explicit line: "ALWAYS call TaskUpdate(completed) with metadata, even for small tasks"
   - Change 70-line warning box to include checkbox: "☑️ TaskUpdate called with summary and filesModified"
   - Example: `{ summary: "Fixed race condition in memory-tiers.cjs", filesModified: [".claude/lib/memory/memory-tiers.cjs"] }`

4. **Prevent silent defaults**
   - No auto-generated summaries (forces agents to be explicit)
   - No auto-populated filesModified (requires actual git diff awareness)
   - If metadata missing, TaskUpdate MUST be retried with explicit fields

**Consequences:**

**Positive:**

- Reflection agent can score ALL task outputs (100% metadata coverage)
- Router no longer needs manual task status updates
- Enterprise pipeline never stalls on metadata gaps
- Pattern extraction enabled for all work
- Enforcement automatic (no training burden)

**Negative:**

- Agents may initially fail completion attempts when metadata missing
- Requires hook implementation + settings.json registration
- May cause brief adoption friction (agents learn new requirement)

**Rationale:**

Training-based enforcement is exhausted (12+ failures on 2026-02-17). Hook enforcement is:

- Deterministic (always enforced)
- Automated (no training required)
- Fail-closed (defaults to safety)
- Reversible (COMPLETION_METADATA_ENFORCEMENT can be set to warn/off if needed)

**Related Artifacts:**

- gotchas.json: `missing-taskupdate-metadata-recurring` (root cause analysis)
- issues.md: Task Metadata Governance Critical Failure (2026-02-18)
- Report: `.claude/context/reports/reflections/batch-reflection-2026-02-18.md`

---

## ADR-138: Ghost-Task Deduplication in Reflection Queue (2026-02-18)

**Status:** PROPOSED — P1 MEDIUM PRIORITY

**Decision:** Implement ghost-task deduplication in reflection-queue-processor.cjs to prevent duplicate reflection spawns on previously-identified ghost tasks.

**Context:**

- Reflection queue can re-trigger on task IDs previously identified as ghost tasks (gotcha: `ghost-task-reflection-echo`)
- 2026-02-17 22:23 batch: Task #2 flagged as ghost task in 22:14 batch, then re-triggered in 22:23 batch
- Pure duplicate spawn with zero diagnostic value; wastes spawn budget and context

**Decision:**

1. **Add deduplication check** in reflection-queue-processor.cjs (or reflection-step0-guard.cjs)
   - Before spawning reflection-agent for each taskId, check reflection-log.jsonl
   - If prior entry found with same reflectionId AND status 'ghost_task_detected', suppress spawn
   - Log deduplication event (informational, not error)

2. **Configuration:** REFLECTION_TASK_VALIDATION={warn|block|off}
   - warn (default): Log deduplication, allow batch to continue
   - block: Stop batch processing if duplicate detected
   - off: No deduplication check

3. **Ghost-Task Definition** (from reflection logs):
   - TaskId exists but has no meaningful completion context
   - Task metadata.summary is empty or generic placeholder
   - No files modified (orphaned task ID)

**Prevention (Future):**

- Add TaskGet validation at queue processing time (reject ghost tasks BEFORE entering spawn queue)
- Implement REFLECTION_TASK_VALIDATION enforcement mode in queue processor
- Document ghost-task detection heuristics in `.claude/workflows/core/reflection-workflow.md`

**Related Artifacts:**

- gotchas.json: `ghost-task-reflection-echo` (pattern description)
- Report: `.claude/context/reports/reflections/batch-reflection-2026-02-18.md`

---

## ADR-131: Enforce TaskUpdate via Hook Rather Than Developer Training (2026-02-16 REFLECTION DECISION)
