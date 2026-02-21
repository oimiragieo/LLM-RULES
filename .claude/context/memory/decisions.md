## ADR: smart-debug scope — domain developer agents (2026-02-21)

Decision: Add smart-debug to core developer.md only. Domain developer agents (python-pro, nodejs-pro, etc.) deferred to Phase 2 architect review to determine if they need it.
Rationale: Domain agents inherit from core developer patterns; architect should evaluate if the debugging upgrade is universal or role-specific.
Status: PENDING Phase 2 review

## ADR-2026-02-21-003: Skill-Index agentPrimary Must Be Verified After SKILL.md Frontmatter Updates (2026-02-21 REFLECTION DECISION)

**Status:** ACCEPTED
**Date:** 2026-02-21
**Trigger:** smart-debug audit reflection (Task #4)

**Decision:** When updating SKILL.md frontmatter `agents:` field (or skill-catalog.md primary agents), the skill-index.json MUST be regenerated AND verified. Frontmatter updates alone are insufficient because `generate-skill-index.cjs` sources `agentPrimary` from `agent-skill-matrix.json` lookup tables, not directly from SKILL.md frontmatter.

**Root Cause Observed:**

- smart-debug SKILL.md frontmatter: `agents: [developer, devops-troubleshooter, qa]`
- skill-catalog.md: `developer, devops-troubleshooter, qa`
- skill-index.json agentPrimary: `["developer"]` — only one agent, missing two

**Resolution Chain:**

1. Update SKILL.md frontmatter agents field
2. Update `agent-skill-matrix.json` to add explicit agent → skill mappings
3. Run `node .claude/tools/cli/generate-skill-index.cjs`
4. Verify with: `node -e "const idx=require('./.claude/config/skill-index.json'); console.log(idx.skills['smart-debug'].agentPrimary)"`

**Applicability:** All skills with multi-agent assignments. Especially critical for skills that should be invoked by non-developer agents (devops-troubleshooter, qa, architect, security-architect) as the index mismatch makes them invisible to those agents' skill discovery.

**Related:**

- Reflection report: `.claude/context/reports/reflections/reflection-smart-debug-lint-2026-02-21.md`
- Issues.md: smart-debug CLAUDE.md Reference Gap (2026-02-21)

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

## ADR-2026-02-20-001: Enterprise Pipeline Two-Commit & APPROVED_WITH_NOTES Pattern (REFLECTION DECISION)

**Status:** ACCEPTED
**Date:** 2026-02-20
**Trigger:** Enterprise supply chain security pipeline completion (Tasks 4, 10, 11, 12)

**Decision:** Adopt two-commit deployment strategy and APPROVED_WITH_NOTES security review outcome as enterprise SOP for high-stakes deployments.

**Evidence:**

- Task 4 (Pipeline Parent): 12 tasks executed without rework, 100% gap resolution (4/4), aggregate score 0.90 (EXCELLENT)
- Task 11 (Security Review): APPROVED_WITH_NOTES with 0 critical/high, 3 LOW findings, 30/30 checklist pass
- Task 12 (Deploy & Commit): Two clean commits (c4022e7d security, c5c8e3938 churn), 7130 files validated, zero unexpected modifications

**Implementation:**

1. **Two-Commit Model**: Separate git commits for (a) security fixes + environment configuration, (b) catalog/memory/skill updates
2. **Whitespace Exclusion**: Document whitespace-only diffs in commit messages; validate with `git diff --check`
3. **APPROVED_WITH_NOTES**: Formal security review outcome for mixed-severity findings (0 critical/high, N LOW)
4. **30/30 Checklist Standard**: Security reviews must pass complete checklist items

**Consequences:**

- **Positive**: Audit trail clarity, zero false positives in compliance scanning, deployment-safe approvals, reduced rework
- **Negative**: Requires commit discipline, increases total commit count, team training needed

**Applicability:** HIGH/EPIC deployments with security gates, compliance reviews, or governance changes. Consider for MEDIUM+ in regulated environments.

**Related:** Enterprise pipeline architecture, security review protocol, git workflow governance

---

## ADR-2026-02-21-001: Opt-in HITL Pattern for Debugging Skills (2026-02-21 REFLECTION DECISION)

**Status:** ACCEPTED
**Date:** 2026-02-21
**Trigger:** smart-debug v2.0 update (Tasks 4-5)

**Decision:** Debugging skills that include a human-in-the-loop reproduction gate MUST default to auto-reproduction (HITL=false) and provide HITL as opt-in via environment variable. Pattern: `SMART_DEBUG_HITL=false` (or unset) = auto-reproduce; `SMART_DEBUG_HITL=true` = pause for human reproduction.

**Rationale:**

- AI debugging agents can auto-reproduce most bugs (~80%) via existing tests/scripts
- Mandatory HITL blocks every debugging session waiting for human, even when unnecessary
- Opt-in HITL preserves escape hatch for UI-dependent bugs, hardware-specific conditions, race conditions requiring specific user timing
- Consistent with framework convention: features default to autonomous, humans opt-in

**Implementation:**

- SKILL.md frontmatter: document SMART_DEBUG_HITL env var in Configuration table
- .env: `SMART_DEBUG_HITL=false` in Section 2 (Feature Flags) with descriptive comment
- .env.example: same — ensures operators can discover and override

**Auto-reproduction fallback behavior:**

1. Run existing tests covering affected code path
2. Execute reproduction scripts if present
3. Trigger code path directly via CLI/API/unit invocation
4. If auto-reproduction succeeds: proceed to log analysis (no human pause)
5. If auto-reproduction fails: fall back to HITL — ask user to reproduce

**Applicability:** Any skill/agent that includes a human-gated step that could be automated. Default to autonomous; human-gate is opt-in.

**Related:**

- smart-debug SKILL.md v2.0: `.claude/skills/smart-debug/SKILL.md`
- Reflection report: `.claude/context/reports/reflections/reflection-smart-debug-v2-2026-02-21.md`

---

## ADR-2026-02-21-002: Hypothesis-Ranking Gate as Mandatory Debugging Pre-condition (2026-02-21 REFLECTION DECISION)

**Status:** ACCEPTED
**Date:** 2026-02-21
**Trigger:** smart-debug v2.0 Cursor Debug Mode implementation

**Decision:** Debugging skills MUST enforce a hypothesis-ranking gate before any code instrumentation. The gate is an Iron Law, not a guideline.

**Required hypothesis format:**

- Probability % (estimated likelihood)
- Supporting evidence (already observed)
- Falsification criteria (what would disprove it)
- Testing approach (how instrumentation confirms/denies)
- Expected symptoms (observable behavior if true)

**Minimum**: 3 hypotheses. Maximum: 5. Forces prioritization.

**Rationale:**

- Broad "exploratory logging" generates noise rather than signal
- Hypothesis-first constrains each log line to test a specific theory
- Probability ranking prevents spending instrumentation budget on low-probability causes first
- Falsification criteria enable definitive root cause confirmation (not just confirmation bias)

**Implementation (smart-debug v2.0 Iron Law):**

```
NO INSTRUMENTATION BEFORE RANKED HYPOTHESES.
NO FIX BEFORE LOG-CONFIRMED ROOT CAUSE.
NO COMPLETION BEFORE INSTRUMENTATION CLEANUP.
```

**Session-scoped instrumentation pattern:**

- Each log line must reference a hypothesis ID (H1, H2, etc.)
- Log to `debug-{sessionId}.log` in `.claude/context/tmp/`
- Cleanup: grep for session ID in source files, delete log file

**Applicability:** All debugging workflows where the root cause is not immediately obvious from static analysis.

**Related:**

- smart-debug SKILL.md v2.0: `.claude/skills/smart-debug/SKILL.md`
- Reflection report: `.claude/context/reports/reflections/reflection-smart-debug-v2-2026-02-21.md`

---

## ADR-131: Enforce TaskUpdate via Hook Rather Than Developer Training (2026-02-16 REFLECTION DECISION)

---

## ADR: Post-Session Skill Validation Harness (2026-02-21)

Status: Implemented
Decision: Dual-component validation approach — CLI tool for CI (validate-skill-agent-consistency.mjs) + reflection-agent Step 4.7 for runtime detection.
Rationale: Smart-debug audit revealed catalog/index/agent-file can drift silently. CLI tool catches drift in CI; reflection-agent catches it post-creation.
Impact: .claude/tools/cli/validate-skill-agent-consistency.mjs, .claude/agents/core/reflection-agent.md
