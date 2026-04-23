<!-- Agent: architect | Task: #4 | Session: 2026-02-07 -->

# Architecture Review: Check 7 -- Specialist-Override Design

**Reviewer:** Architect Agent (opus)
**Date:** 2026-02-07
**Status:** Post-hoc review (code already implemented without prior architect review)
**Files Reviewed:**

- `.claude/hooks/routing/routing-guard.cjs` (lines 196-930, Check 7)
- `tests/hooks/routing-guard-specialist-override.test.cjs` (10 tests)
- `.claude/CLAUDE.md` (SPECIALIST-FIRST ROUTING LAW section)
- `.claude/workflows/core/router-decision.md` (Steps 6.5-6.6)

---

## 1. Summary

Check 7 (`checkSpecialistOverride`) adds a specialist-first routing enforcement mechanism to the unified routing-guard hook. It detects when the `developer` agent is spawned for tasks whose prompt/description contains keywords associated with specialist agents (e.g., "refactor" for code-simplifier, "deploy" for devops) and emits a warning (or block) suggesting the correct specialist.

**Overall Assessment:** The design is **architecturally sound** in intent and placement. It fills a real gap -- the misrouting table in CLAUDE.md Section 1 was purely documentary with no runtime enforcement. However, there are **four areas of concern** ranging from MEDIUM to HIGH priority that should be addressed before escalation to block-default.

**Architecture Quality Score:** 7/10 (good foundation, needs refinement before promotion to block mode)

---

## 2. Strengths

1. **Correct architectural position.** Check 7 runs last in runAllChecks(), which is exactly right. It should not interfere with security checks (Check 4), planner-first (Check 2), or memory pressure (Check 6). Those are higher-priority structural concerns. Specialist routing is a "quality improvement" concern, not a safety concern.

2. **Conservative default (warn).** Starting at warn is the correct approach for a new routing enforcement. It allows data collection on false positive rates before escalating.

3. **Developer-only scope.** Only checking developer spawns is a sensible design choice. Non-developer agents using specialist keywords in their prompts is expected behavior (a qa agent discussing "test coverage" should not be flagged).

4. **No router-state dependency.** Check 7 is self-contained -- it only reads the toolInput, not the file-based router state. This avoids the state-sync issues that have plagued other checks and makes it fully testable in isolation.

5. **Violation-tracker integration.** Recording violations enables post-hoc analysis to tune keyword precision and identify systematic misrouting patterns.

6. **Good test coverage.** 10 tests cover the main paths: warn mode, block mode, off mode, developer-only scope, prompt+description scanning, multi-keyword handling, and constant export.

---

## 3. Concerns (Prioritized)

### 3.1 HIGH: Substring Matching Produces False Positives

**The Problem:**
The current matching logic uses `combined.includes(keyword)`, which is pure substring matching. This creates several problematic scenarios:

| Prompt Text                                          | Keyword Matched | Flagged Specialist | Actually Correct?                                                  |
| ---------------------------------------------------- | --------------- | ------------------ | ------------------------------------------------------------------ |
| "deploy the fix to staging"                          | "deploy"        | devops             | **Maybe** -- could be developer deploying their own fix via script |
| "investigate why the test fails"                     | "investigate"   | researcher         | **No** -- developer debugging test failure                         |
| "document what the function does in a JSDoc comment" | "document"      | technical-writer   | **No** -- developer writing inline code comments                   |
| "clean up the error message text"                    | "clean up"      | code-simplifier    | **No** -- developer fixing a string literal                        |
| "fix the migration script"                           | "migration"     | database-architect | **No** -- developer fixing a bug in existing migration             |
| "update the coverage threshold in config"            | "coverage"      | qa                 | **No** -- developer modifying a config value                       |
| "refactor the variable name"                         | "refactor"      | code-simplifier    | **Borderline** -- single variable rename is developer work         |
| "add Docker support check to health endpoint"        | "docker"        | devops             | **No** -- developer adding a health check for Docker readiness     |

**Impact:** At warn-default, these are noise that erodes trust in the system. At block-default, they would actively prevent legitimate developer work.

**Recommendation:** Introduce phrase-level matching and/or word-boundary awareness. Two options:

- **Option A (Regex word-boundary matching):** Convert keywords to regex patterns with `\b` word boundaries: `new RegExp('\\b' + keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b')`. This catches "deploy the app" but not "deployment-config".

- **Option B (Contextual phrase matching):** Replace single-word keywords with multi-word phrases that have higher precision. Instead of `"deploy"`, use `"deploy to production"`, `"deploy to staging"`, `"set up deployment"`. Instead of `"document"`, use `"write documentation"`, `"update docs"`, `"update README"`.

**My recommendation is Option B (contextual phrases) for the highest-risk keywords** (document, deploy, migration, coverage, investigate, clean up) **combined with Option A (word boundaries) as a baseline improvement for all keywords.** This is a layered approach: word boundaries eliminate substring matches, and contextual phrases reduce ambiguity.

### 3.2 MEDIUM: First-Match Wins Creates Non-Deterministic Specialist Selection

**The Problem:**
The loop iterates over `Object.entries(SPECIALIST_KEYWORD_MAP)`, and the first keyword match from the first specialist entry wins. In JavaScript, `Object.entries()` preserves insertion order, so the current order is:

1. technical-writer
2. code-simplifier
3. code-reviewer
4. qa
5. devops
6. database-architect
7. researcher
8. devops-troubleshooter

For a prompt like "refactor the test suite and update docs", this will always suggest `technical-writer` (because "document"/"docs" appears in the first specialist's keywords). But the most relevant specialist depends on which keyword is the _primary intent_, not which specialist appears first in the map.

**Impact:** The suggested specialist may not be the best match. However, since the check is advisory (warn mode), the Router still makes the final decision.

**Recommendation:**

- **Short-term (acceptable):** Document this behavior as a known limitation. The Router should evaluate all warnings and pick the best specialist. The first-match is just a hint.

- **Medium-term (recommended):** Implement a scoring system where keywords in the **description** carry more weight than keywords in the prompt boilerplate. Also, keywords that appear in the **task subject** (if available from TaskGet metadata) should carry the highest weight. The specialist with the highest aggregate score wins.

### 3.3 MEDIUM: No Distinction Between Task-Defining Keywords and Incidental Keywords

**The Problem:**
Consider these two prompts:

- **A:** "You are developer. Write comprehensive test coverage for the auth module." (Intent: testing. Correct specialist: qa)
- **B:** "You are developer. Fix the bug in the auth module. Run tests to verify the fix." (Intent: bug fix with verification. Correct agent: developer)

Both contain "test" keywords. Prompt A is correctly flagged. Prompt B is a false positive -- "run tests" is a verification step within developer work, not a testing task.

The current implementation treats all keyword occurrences equally, regardless of whether the keyword appears as the _primary task_ or as a _secondary action_ within a developer task.

**Impact:** Moderate. At warn-default, the developer/Router can ignore the warning. At block-default, this would prevent developers from mentioning testing in their verification steps.

**Recommendation:**

- **Weight keywords by position.** Keywords in the first sentence of the description (the "what") carry more weight than keywords later (the "how"). This is a heuristic, not perfect, but significantly reduces false positives from verification/cleanup steps.

- **Exclusion patterns.** Add a "developer-safe context" list of phrases that, when present alongside specialist keywords, suppress the warning. For example: "verify the fix", "confirm it works", "test to validate" should suppress qa flagging. "Document what was changed" in a commit context should suppress technical-writer flagging.

### 3.4 LOW: Hardcoded Keyword Map -- Externalization Trade-off

**The Problem:**
SPECIALIST_KEYWORD_MAP is hardcoded at lines 196-233 of routing-guard.cjs. The task description asks whether this should be externalized to a config file.

**Analysis:**

| Factor          | Hardcoded                                 | Externalized (JSON)                                                   |
| --------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| Discoverability | In the hook code                          | Requires knowing the config file path                                 |
| Edit friction   | Requires code change + test run           | Just edit JSON (but still needs test run)                             |
| Type safety     | JavaScript constant, IDE completion       | JSON file, no type checking                                           |
| Hot-reload      | Requires process restart                  | Could support hot-reload, but the hook is invoked per-tool-use anyway |
| Version control | Changes tracked in hook file              | Changes tracked in config file (same git flow)                        |
| Coupling        | Map is co-located with the matching logic | Map separated from matching logic (potential drift)                   |

**Recommendation:** Keep hardcoded for now. The keyword map is tightly coupled to the matching logic (substring vs regex vs phrase matching). Externalizing the data without externalizing the matching strategy creates a leaky abstraction. When the matching strategy stabilizes (after addressing 3.1), reconsider externalization.

---

## 4. Check Ordering Analysis

**Current order:** 0. Router Bash check

1. Router Self-Check (blacklisted tools)
2. Planner-First Guard
3. TaskCreate Guard
4. Security Review Guard
5. Router Write Guard
6. Memory Pressure Check
7. Specialist Override **(NEW)**

**Assessment: Correct position.** The ordering follows a clear priority hierarchy:

- **Checks 0-1 (safety):** Prevent Router from violating its own protocol. Must run first.
- **Checks 2-3 (structural):** Ensure planning happens before implementation. Must run before any agent selection.
- **Check 4 (security):** Enforce security review requirements. Critical for risk management.
- **Check 5 (authorization):** Prevent unauthorized writes. Must run before any file operations.
- **Check 6 (resource):** Prevent resource exhaustion. Should gate spawning.
- **Check 7 (quality):** Suggest better routing. Advisory, non-blocking by default.

Check 7 is correctly placed as the last check. It is a quality-improvement concern, not a safety or structural concern. It should never override a security block (Check 4) or planner-first requirement (Check 2). Running it last means it only fires when all other checks pass, which is the right behavior.

**One note:** If Check 7 were ever promoted to block-default, it should still remain last. Blocking a developer spawn for specialist routing is a lower priority than blocking for security review or planner-first violations.

---

## 5. Planner Interaction Analysis

**Step 6.6 in router-decision.md** states: "When spawning an agent for an existing task (from TaskGet), check the task description for `Target Agent:` annotation."

**Current behavior:** Check 7 does not inspect planner annotations. It only matches keywords in the spawn prompt and description.

**Analysis:** This is actually the correct approach. Here is why:

1. **Planner annotations flow through the Router's decision logic (Step 6.6), not through the hook.** The Router reads `Target Agent:` from the task and should use that to select the correct agent _before_ spawning. Check 7 is a safety net for when the Router _ignores_ the planner's recommendation.

2. **If the Router follows Step 6.6 and uses the planner's recommended specialist,** then Check 7 never fires (because the spawn is not a developer spawn).

3. **If the Router ignores Step 6.6 and spawns developer anyway,** Check 7 catches this as a warning. This is the correct behavior -- Check 7 and Step 6.6 are complementary enforcement layers.

**Recommendation:** No change needed. Check 7 and Step 6.6 work together as defense-in-depth. However, the warning message could be enhanced to mention: "If this task was planned, check the planner's Target Agent annotation."

---

## 6. Escalation Criteria -- When to Promote to Block-Default

The task asks what criteria should trigger escalation from warn-default to block-default.

**Proposed escalation criteria (all must be met):**

1. **Data-driven:** At least 30 days of violation-tracker data collected in warn mode, showing:
   - Specialist-override warnings fire on >20% of developer spawns
   - False positive rate is below 10% (measured by Router actually using the suggested specialist)
   - No critical workflows are disrupted by the warnings

2. **Keyword refinement complete:** Concerns 3.1 (substring matching) and 3.3 (incidental keywords) are resolved. Without these fixes, block-default would produce too many false blocks.

3. **Router adaptation verified:** The Router has been observed correctly routing to specialists >80% of the time when a warning fires. This indicates the Router understands and respects the warnings, making block-default safe.

4. **Escape hatch documented:** The `SPECIALIST_ROUTING_ENFORCEMENT=off` override is documented in the environment config reference and tested in CI.

**Recommended escalation timeline:**

- **Now:** warn-default (current)
- **After keyword refinement (3.1 addressed):** warn-default, begin tracking false positive rate
- **After 30-day data collection:** Evaluate metrics against criteria above
- **If criteria met:** Promote to block-default with announcement

---

## 7. Test Coverage Assessment

The 10 existing tests cover the core paths well. Missing test scenarios:

| Scenario                 | Priority | Description                                                                          |
| ------------------------ | -------- | ------------------------------------------------------------------------------------ |
| Substring false positive | HIGH     | Test that "document" in "JSDoc document comment" fires (demonstrates the 3.1 issue)  |
| Multi-specialist scoring | MEDIUM   | Test that the first-match-wins behavior is deterministic                             |
| Empty prompt/description | LOW      | Test with undefined/null/empty prompt and description                                |
| Very long prompt         | LOW      | Test with a 10K+ character prompt (performance)                                      |
| Keyword case sensitivity | LOW      | Test that keywords are matched case-insensitively (already implied by toLowerCase()) |

---

## 8. Architecture Checklist (IEEE 1028 + Context-Specific)

### IEEE 1028 Architecture Items

- [x] Single Responsibility: checkSpecialistOverride has one concern (keyword matching)
- [x] Separation of Concerns: keyword map is separate from matching logic
- [x] Loose coupling: no dependency on router-state (self-contained)
- [x] Extensibility: new specialists added by appending to SPECIALIST_KEYWORD_MAP
- [x] Failure modes: graceful degradation (returns pass:true on errors)
- [x] Testability: fully testable in isolation (10 tests)

### Context-Specific Items

- [x] [AI-GENERATED] Hook follows stdin/stdout JSON protocol
- [x] [AI-GENERATED] Enforcement mode tri-state (block/warn/off) consistent with other checks
- [x] [AI-GENERATED] Violation-tracker integration for metrics
- [ ] [AI-GENERATED] False positive analysis not yet performed (NEEDS WORK)
- [ ] [AI-GENERATED] Keyword precision validated against real routing data (NEEDS DATA)

---

## 9. Recommendations Summary

| #   | Priority | Finding                                            | Action                                                                                             |
| --- | -------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| R1  | HIGH     | Substring matching false positives                 | Implement word-boundary matching (Option A) + contextual phrases for high-risk keywords (Option B) |
| R2  | MEDIUM   | First-match-wins non-determinism                   | Document as known limitation; implement scoring system in next iteration                           |
| R3  | MEDIUM   | No distinction between primary/incidental keywords | Add position-weighted scoring or exclusion patterns for verification contexts                      |
| R4  | LOW      | Hardcoded keyword map                              | Keep hardcoded until matching strategy stabilizes                                                  |
| R5  | LOW      | Missing edge-case tests                            | Add tests for substring false positives and empty inputs                                           |
| R6  | INFO     | Warning message improvement                        | Add "check planner Target Agent annotation" hint to warning message                                |

---

## 10. Decision Record

**ADR: Check 7 Specialist-Override Architecture Review**

**Date:** 2026-02-07
**Status:** Reviewed (post-hoc)
**Context:** Check 7 was implemented via TDD without prior architect review. This review is a remediation.

**Decision:** The design is approved with the following conditions:

1. Check 7 MUST remain at warn-default until R1 (keyword precision) is addressed.
2. Escalation to block-default requires meeting the 4 criteria in Section 6.
3. R1 (word-boundary + contextual phrases) is a prerequisite for block-mode consideration.

**Consequences:**

- Positive: Runtime enforcement of specialist-first routing (previously documentary only)
- Positive: Violation tracking enables data-driven escalation decisions
- Negative: Warn-mode does not prevent misrouting; it only logs it
- Risk: Substring false positives may cause "alert fatigue" and reduce trust in the hook system

---

### BACKWARD_PROPAGATION

**Pattern:** Keyword-based intent classification used for routing enforcement, but similar pattern could apply to other areas (complexity classification keywords, security-sensitive keywords in Check 4, creator detection keywords)
**Proposed Artifact:** schema:routing-keyword-schema
**Affected Components:** [routing-guard.cjs Check 7, router-decision.md Step 6.5, complexity-classifier.cjs, CLAUDE.md misrouting table]
**Architectural Rationale:** Standardizing keyword-to-agent mapping as a schema would allow shared validation between the documentary misrouting table (CLAUDE.md) and the runtime enforcement (Check 7), ensuring they stay in sync.
**Impact Radius:** 4 components + future keyword-based checks
**Priority:** P2
