<!-- Agent: multi-llm-consultant | Task: task-6 | Session: 2026-03-04 -->

# Multi-LLM Audit Review: Enterprise Search Audit Findings

**Date:** 2026-03-04
**Task:** task-6
**Artifacts Reviewed:**
- `.claude/context/reports/backend/reflection-evolution-memory-audit-2026-03-04.md`
- `tests/lib/config/agent-search-compliance.test.cjs`
- `tests/agents/agent-frontmatter-search-skills.test.cjs`
- `.claude/context/plans/enterprise-search-audit-plan-2026-03-04.md`

**Models Consulted:**
- Gemini CLI (via `omega-gemini-cli`) — responded (full review)
- Codex CLI (via `omega-codex-cli`) — responded (late, incorporated into final synthesis)
- Claude (current session) — primary synthesizer / chairman

---

## Executive Summary

The audit report, test files, and plan are solid but contain several notable gaps that must be addressed before Phase 3 (bulk fixes) begins. The most critical findings are:

1. **A missed agent**: `ux-researcher.md` exists in `domain/` with frontmatter, is NOT in `agent-skill-matrix.json`, and is missing `code-semantic-search` and `code-structural-search` — confirmed by live test run.
2. **Dual-source config drift (Codex finding)**: TWO copies of `agent-skill-matrix.json` exist at `.claude/config/` and `.claude/context/config/` — they are out of sync, creating nondeterministic behavior.
3. **The matrix-frontmatter consistency test is missing** from both test files.
4. **Finding E-1 (evolution hook module.exports mismatch) is underrated** — it needs verification before Phase 3 can be trusted.
5. **The test for `verification-before-completion`** was specified in the plan (test 6) but never implemented in the actual test file.

---

## Section 1: Live Test Execution Evidence

Tests were run against the current codebase state during this review.

### agent-search-compliance.test.cjs Results (10 tests)

```
pass: 7/10
fail: 3/10
```

Failing tests:
- Test 2: 13 code-focused agents missing `code-semantic-search` in matrix always array
- Test 3: (same 13 agents) missing `code-structural-search`
- Test 4: (same 13 agents + `technical-program-manager`) missing `memory-search`

Passing tests: ripgrep baseline, exempt agents, orchestrators, no duplicates, registry cross-reference.

The 13 agents match exactly what the audit plan identified. Tests are correctly in Red phase.

### agent-frontmatter-search-skills.test.cjs Results (4 tests)

```
pass: 2/4
fail: 2/4
```

Failing tests:
- Test 2: `domain/ux-researcher.md` missing `code-semantic-search` in frontmatter
- Test 3: `domain/ux-researcher.md` missing `code-structural-search` in frontmatter

**CRITICAL FINDING FROM LIVE TESTING: `ux-researcher.md` is NOT in the audit plan's 19-agent fix list.** The agent has frontmatter with skills but `code-semantic-search` and `code-structural-search` are missing. Additionally, `ux-researcher` is entirely absent from `agent-skill-matrix.json` — meaning it also won't be caught by the compliance test (test 9 only checks that matrix agents are in the registry, not that registry agents are in the matrix).

---

## Section 2: Missed Gaps in the Audit Report

### Gap 0 (CRITICAL — Codex Finding): Dual agent-skill-matrix.json Files Out of Sync

Codex identified that TWO copies of `agent-skill-matrix.json` exist:
- `.claude/config/agent-skill-matrix.json` (older copy)
- `.claude/context/config/agent-skill-matrix.json` (canonical copy used by tests)

A `diff` confirms they are out of sync — the canonical file has additional `memory-search`, `code-semantic-search`, `code-structural-search` entries that the `.claude/config/` copy lacks. The audit report does not mention this at all. This creates nondeterministic routing/compliance outcomes depending on which file a given tool reads.

**Recommended fix:** Determine which file is the canonical source of truth, delete or symlink the other, add a CI test that verifies only one copy exists or that both are identical.

### Gap 1 (CRITICAL): ux-researcher Agent Not Accounted For

`ux-researcher.md` in `.claude/agents/domain/` has frontmatter skills but is missing from `agent-skill-matrix.json` entirely. The audit report focuses on agents present in the matrix and missed this agent. Fix required:
- Add `ux-researcher` to `agent-skill-matrix.json`
- Add `code-semantic-search` and `code-structural-search` to its frontmatter

### Gap 2 (HIGH): No Test for Matrix-Frontmatter Consistency

The audit plan (Phase 2 spec) lists: "Test 4: Frontmatter skills are consistent with agent-skill-matrix.json always array" in the frontmatter test file. This test was NOT implemented. Without it, an agent could be fixed in the matrix but not in frontmatter (or vice versa), producing a partial fix invisible to either test in isolation.

**Recommended test to add to `agent-frontmatter-search-skills.test.cjs`:**
```javascript
// Test 5: Frontmatter always skills are a subset of matrix always[] (consistency check)
it('agent frontmatter skills should be consistent with matrix always array', () => {
  // For each agent in both matrix and frontmatter, verify matrix always[] are present in frontmatter skills[]
  // (Matrix is authoritative; frontmatter should include all matrix always skills)
});
```

### Gap 3 (HIGH): Test 6 (verification-before-completion) Not Implemented

The plan spec explicitly calls for:
> "Test 6: All non-exempt agents have verification-before-completion in always array"

This test is NOT in `agent-search-compliance.test.cjs`. The test file has 9 tests (1-5, 6-9 in different numbering) but no `verification-before-completion` coverage. Three agents (pm-coordinator, medical-research-triage, researcher) are noted as "also missing verification-before-completion" in the plan, but no test validates this.

### Gap 4 (MEDIUM): Evolution Hook E-1 Implementation Verification Missing

Finding E-1 notes evolution hooks may be using `module.exports` pattern but registered as CLI commands. The audit acknowledges "this needs verification" but does not provide the verification result. Before Phase 3, this needs to be confirmed:

```bash
node -e "const h = require('./.claude/hooks/evolution/research-enforcement.cjs'); console.log(typeof h)"
```

If this returns `'object'` (a module.exports pattern without `require.main === module` guard), the hook invocations are silently doing nothing. This would mean all evolution enforcement is currently broken, making Phase 3's fixes meaningless for EVOLVE scenarios.

### Gap 5 (LOW): No Audit of Non-Exempt Agent Category Classification

The `NON_CODE_AGENTS` set in both test files includes `mobile-ux-reviewer` and `ux-researcher` is entirely absent from that set. UX-related agents often need structural search to inspect frontend code (React components, accessibility attributes). The categorization of "non-code" needs explicit justification for each agent (comments in the test file).

---

## Section 3: Test Adequacy Analysis

### Strengths

1. **Test 9 (matrix-registry cross-check)** is valuable and currently passing — all matrix agents exist in registry.
2. **Test 8 (no duplicates)** catches a subtle data quality issue.
3. **Test 6/7 (exempt agent validation)** correctly validates intentional empty arrays.
4. **Test 4 (no invalid skills)** in the frontmatter test is particularly valuable — confirms skills directory actually exists.
5. The frontmatter parser in `extractFrontmatterSkills()` handles both list and inline array YAML formats, which is robust.

### Weaknesses / Missing Tests

| Missing Test | Priority | Rationale |
|---|---|---|
| Dual-matrix-file detection | CRITICAL | Two out-of-sync copies exist; no test flags this |
| Matrix-frontmatter consistency | HIGH | Neither test validates parity between the two sources of truth |
| verification-before-completion coverage | HIGH | Specified in plan, not implemented |
| Registry-to-filesystem parity (registry → agents dir) | MEDIUM | Gemini raised: are there agents in registry with no .md file? |
| ux-researcher not in matrix | MEDIUM | Currently caught only by frontmatter test; matrix test passes silently |
| Non-code agent classification justification | LOW | Static list in test file needs comments explaining each exclusion |

---

## Section 4: Priority Ordering Assessment

### Current Priorities (from audit report)

| ID | Severity | Recommended Priority |
|----|----------|---------------------|
| Dual-matrix-file drift | Not in report | P0 (nondeterminism) |
| R-1 / W-1 | MEDIUM | Upgrade to P0 (docs-vs-reality mismatch causes future maintenance errors) |
| E-1 | MEDIUM | Upgrade to P0 (if hooks are broken, evolution is completely non-functional) |
| M-1 | MEDIUM | Keep as P1 (silent failure affects reflection-agent specifically) |
| R-2 | LOW | Keep as P2 |
| R-3 | LOW | Keep as P2 |
| E-2 | LOW | Keep as P2 |
| M-2 | LOW | Keep as P1 (security-relevant sanitization issue) |
| R-4 | INFO | Keep as P3/monitor |
| E-3 | INFO | Keep as P3 |
| M-3 | INFO | Keep as P3 |

**Upgraded rationale for E-1:** Gemini's analysis is correct. If evolution hooks are silently doing nothing, the entire EVOLVE workflow is architecture-on-paper only. Verifying E-1 is a prerequisite for any Phase 3+ work that assumes enforcement is active.

**Upgraded rationale for R-1/W-1:** An unregistered 224-line file that CLAUDE.md refers to as active is a documentation debt that will confuse every future developer and AI agent working on the codebase. This is also a minor supply-chain risk (as Gemini noted: the file can be modified without triggering any config validation).

---

## Section 5: Security Concerns

### SC-1: Broad Sanitization Pattern (M-2)

The `/override/i` pattern in `spawn-prompt-assembler.memory.cjs` strips legitimate content. However, the security concern is bidirectional:
- **False positive risk:** Strips valid content like env var names containing "override"
- **False negative risk (Gemini raised):** A sophisticated prompt injection using Unicode homoglyphs (`ov\u0065rride`) would bypass this pattern entirely

**Recommendation:** Replace pattern-based blocking with a structured allow-list approach for memory injection fields.

### SC-2: Ghost Script Supply-Chain Risk (W-1/R-1)

`force-step0-execution.cjs` is a 224-line production-quality script that is not in `settings.json` but is referenced in `CLAUDE.md`. If a developer or AI agent modifies it thinking it's active, the change has no effect but wastes development effort. More critically, if a malicious actor knows the file exists but is not validated by the hook system, it could be modified as a staging area.

**Recommendation:** Either delete the file or register it. Never leave production-quality hook files in a "ghost" state.

### SC-3: Fail-Open on Guard Crash (R-2)

`reflection-step0-guard.cjs` exits 0 on crash, bypassing the Step 0 reflection requirement. While this prevents deadlock, it means a bug in the guard silently disables a security/quality control. Gemini raised the correct point: in production, a "fail-safe-to-human" mode (pause and request human intervention) would be preferable to silent bypass.

### SC-4: Dual Config File Nondeterminism (Codex Finding)

Two out-of-sync copies of `agent-skill-matrix.json` mean compliance outcomes vary depending on which file a caller uses. This is both a correctness risk (wrong skills assigned) and a security risk (a tool reading the stale copy would see less enforcement). Neither test currently validates that only one canonical copy exists.

---

## Section 6: Gemini's Perspective (Key Points)

Gemini reviewed the artifacts as a "Co-Founder & CTO" persona and provided the following key critical feedback:

**Missed gaps Gemini identified:**
- "Registry Ghost" problem: Are there agents in the `agents/` directory that are NOT in `agent-registry.json`? A ghost agent file is more dangerous than a ghost script. (Note: this is exactly what we found with `ux-researcher`)
- Missing concurrency analysis: Does the SQLite memory DB have a locking mechanism for simultaneous agent writes?
- Missing "Guardrail Loop" analysis: Who reflects on the reflection-agent if it fails?

**Test gaps Gemini identified:**
- Tests verify manifests but not that the LLM agent prompt template actually instructs on how to use the skill
- Missing runtime smoke tests (e.g., verify Python 3.10+ is available if token-saver is assigned)
- Missing test for fail-open behavior in security guards

**Priority changes Gemini recommended:**
- M-1 (silent failure) should be P0 (financial risk from token loops)
- E-1 (implementation mismatch) should be P0 (EVOLVE lifecycle is broken if hooks silently fail)

**Plan feedback from Gemini:**
- Needs a "Phase 2.5" script convergence phase to delete ghost files and unify reflection scripts BEFORE Phase 3 bulk fixes
- "Do not proceed to Phase 3 until R-1 and E-1 are resolved"

**19-agent list concerns from Gemini:**
- Over-inclusion risk: Does `prompt-engineer` really need `ripgrep`? Tool overload increases hallucinated tool calls
- Under-inclusion: Any doc-healing agent must have `ripgrep` and structural search

---

## Section 7: Codex's Perspective (Key Points)

Codex did a live analysis of the actual files and provided the following:

**Finding 1 (High): Dual-source config drift**
> "The canonical matrix was edited, but the synced copy was not, creating immediate behavior/test inconsistency depending on which file a caller reads. The repo explicitly has code/tests that read either path. Impact: nondeterministic routing/compliance outcomes across tools and CI jobs."

This was confirmed by running `diff` — the two files are out of sync on at least 8 lines covering agent skill assignments.

**Finding 2 (High): New compliance test policy-inconsistent**
> "New test classifies c4-* and researcher as code-focused (not exempt), but current policy/test baseline treats them as non-code-focused for semantic/structural requirements. Evidence: Existing baseline policy: agent-search-tool-compliance.test.cjs line 84."

This raises the question: is there an existing test `tests/agents/agent-search-tool-compliance.test.cjs` that predates the new tests? If so, the new tests may conflict with the established baseline. This needs cross-referencing.

**Finding 3 (Medium): Frontmatter exemption drift**
> "NON_CODE_AGENT_FILES omits roles currently behaving as non-code in practice (ux-researcher, pm-coordinator, multi-llm-consultant), producing immediate failures."

This is a valid observation that the NON_CODE_AGENT_FILES exemption list may need expansion if some agents are intentionally non-code but were not included.

**Finding 4 (Low): Temporal inconsistency**
> "A new learning is tagged 2026-03-05 while current context is 2026-03-04."

Minor but worth noting for audit chronology integrity.

**Codex's open questions:**
1. Are the new tests intentionally "Red phase only" and not meant for merge yet? (Yes — this is the TDD Red phase)
2. Is `.claude/context/config/agent-skill-matrix.json` the canonical copy? (Needs clarification)

---

## Section 8: Is the 5-Phase Plan Sound?

### Phase Assessment

| Phase | Assessment | Gap |
|-------|-----------|-----|
| Phase 0 (Research) | Complete and solid | None |
| Phase 1 (Investigation) | Complete | Did not catch ux-researcher; did not flag dual-matrix-file issue |
| Phase 2 (TDD) | Mostly complete | Missing 2 specified tests; ux-researcher gap |
| Phase 3 (Fixes) | Plan is sound | Should be blocked until E-1 verified and dual-matrix resolved |
| Phase 4 (Multi-LLM) | Complete | This review fulfills Phase 4 |
| Phase 5 (Finalization) | Plan is sound | Should include ghost file cleanup; fix `git add -A` |

### Recommended Plan Amendments

1. **Add Phase 2.5: Ghost File + Dual-Matrix Cleanup** — resolve R-1/W-1 (delete or register `force-step0-execution.cjs`) and determine canonical matrix file, deleting the duplicate. Update CLAUDE.md to reference the correct hook.

2. **Add Task 2.3: Missing Consistency Test** — implement the matrix-frontmatter consistency test that was specified but not written.

3. **Add Task 2.4: verification-before-completion Test** — implement the missing test 6 from the plan spec.

4. **Add Task 2.5: ux-researcher Fix** — add to matrix and add missing skills to frontmatter. Total is 20 agents, not 19.

5. **Add E-1 Verification Step** — before Phase 3, verify evolution hooks actually execute when invoked as CLI commands. One-line verification: `node -e "const h = require('./.claude/hooks/evolution/research-enforcement.cjs'); console.log(typeof h)"`.

6. **Fix Phase 5 commit command** — `git add -A` in Task 5.1 violates the workspace convention of not staging unintended files. Replace with explicit file paths.

7. **Add cross-reference check to existing test** — Codex flagged `tests/agents/agent-search-tool-compliance.test.cjs` as a preexisting test. Verify the new tests do not create conflicting policies with this existing test before merging.

---

## Section 9: Final Verdict

### Overall Assessment: B+ (Solid with Actionable Gaps)

The audit is thorough at the systems level. The test files are well-structured and use appropriate TDD Red/Green philosophy. The 5-phase plan is logical and well-ordered.

**Critical issues before proceeding to Phase 3:**
1. Resolve dual-matrix-file nondeterminism (`.claude/config/` vs `.claude/context/config/`)
2. Add `ux-researcher` to the fix list (20th agent, not 19th)
3. Implement the missing matrix-frontmatter consistency test
4. Implement the missing `verification-before-completion` test
5. Verify E-1 (evolution hooks) — confirm whether they execute or silently fail
6. Resolve ghost file R-1/W-1 before Phase 3
7. Cross-reference with existing `agent-search-tool-compliance.test.cjs` (if it exists)

**Non-blocking issues (can be addressed in parallel or after):**
- M-2 sanitization pattern breadth (allow-list instead of regex)
- Runtime smoke tests for Python dependency (M-3)
- Concurrency analysis for SQLite memory DB (Gemini)
- Guardrail loop analysis for reflection-agent failures (Gemini)

---

## Appendix: Test Run Commands

```bash
# Compliance test (matrix-based) — run from agent-studio/
node --test tests/lib/config/agent-search-compliance.test.cjs
# Result: 7/10 pass, 3 fail (Red phase — expected)

# Frontmatter test (agent .md files) — run from agent-studio/
node --test tests/agents/agent-frontmatter-search-skills.test.cjs
# Result: 2/4 pass, 2 fail (ux-researcher found missing skills)

# Verify dual-matrix drift
diff .claude/config/agent-skill-matrix.json .claude/context/config/agent-skill-matrix.json
# Expected: non-empty output (files differ)
```
