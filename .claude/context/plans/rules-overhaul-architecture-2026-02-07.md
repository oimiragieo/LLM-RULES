<!-- Agent: architect | Task: #102 | Session: 2026-02-07 -->

# Rules System Deep Dive -- Architecture Plan

**Pipeline:** Enterprise Pipeline #9 (Rules System Deep Dive)
**Date:** 2026-02-07
**Status:** Proposed (ADR-091)
**Author:** Architect Agent

---

## Executive Summary

The `.claude/rules/` directory contains 9 markdown files totaling approximately 115 lines that serve as always-loaded project instructions in Claude Code. These files are automatically injected into every conversation's system prompt -- they do NOT require explicit "wiring" via imports. However, this audit reveals that:

1. **7 of 9 rules are extremely thin** (3-7 lines each) providing minimal guidance
2. **1 critical conflict** exists between `workspace-conventions.md` and `FILE_PLACEMENT_RULES.md` on report/plan paths
3. **1 rule (`agents.md`) is severely outdated** -- lists 7 agents when 49 exist
4. **The `rule-index.json` is missing `workspace-conventions.md`** entirely (8 rules indexed, 9 exist)
5. **No rules exist** for memory protocol, skill invocation, or task tracking -- the three most important agent behaviors
6. **Hook enforcement partially covers rules** -- `check-console-log.cjs` enforces the coding-style rule about console logging, and `file-placement-guard.cjs` partially enforces workspace-conventions
7. **Significant duplication** between CLAUDE.md and rules files in security and hook guidance

**Recommendation:** UPDATE 6 files, MERGE 2 files, CREATE 2 new rules, fix path conflicts, and update rule-index.json. No archival needed -- all rules serve a purpose, but most need expansion.

---

## Phase 1: Full Inventory

### 1.1 Complete File Listing

| # | File | Lines | Size | Purpose |
|---|------|-------|------|---------|
| 1 | `agents.md` | 18 | 871B | Agent quick reference table + routing reminders |
| 2 | `coding-style.md` | 8 | 266B | Code style preferences (small files, immutability, no console.log) |
| 3 | `git-workflow.md` | 7 | 187B | Git commit/branch conventions |
| 4 | `hooks.md` | 6 | 178B | Hook authoring rules |
| 5 | `patterns.md` | 6 | 127B | Code patterns (composition, async, logging) |
| 6 | `performance.md` | 6 | 146B | Performance guidance (hot paths, caching, prompts) |
| 7 | `security.md` | 7 | 195B | Security rules (secrets, input validation, auth review) |
| 8 | `testing.md` | 8 | 243B | Testing rules (TDD, unit/integration, deterministic) |
| 9 | `workspace-conventions.md` | 62 | 2.1KB | File placement, naming, provenance, forbidden locations |

**Totals:** 9 files, ~128 lines, ~4.3KB

### 1.2 Key Directives Per File

**agents.md:**
- Table of 7 core agents (planner, architect, developer, code-reviewer, security-architect, qa, technical-writer)
- 3 routing reminders: complex -> planner, code written -> code-reviewer, security -> security-architect

**coding-style.md:**
- Small cohesive files
- Favor immutability
- Validate inputs, handle errors
- Narrow interfaces, separate by feature
- No ad-hoc console logging in production

**git-workflow.md:**
- Scoped, reviewable changes
- Small focused commits
- Tests and lint pass before commit
- Descriptive branch/commit names

**hooks.md:**
- Never break tool pipeline
- stderr for logging, stdout for structured output
- Points to HOOKS_REFERENCE.md

**patterns.md:**
- Composition over inheritance
- Explicit async boundaries
- Structured logging

**performance.md:**
- Avoid work in hot paths
- Cache expensive computations
- Keep prompts concise

**security.md:**
- Never commit secrets
- Validate input, sanitize output
- Parameterized queries
- Auth/PII changes reviewed by security-architect

**testing.md:**
- TDD for features and bug fixes
- Unit tests for utilities
- Integration tests for API boundaries
- Deterministic, isolated tests
- Record test commands/results

**workspace-conventions.md:**
- Reports -> `.claude/context/reports/{domain}/`
- Plans -> `.claude/context/plans/`
- Artifacts -> `.claude/context/artifacts/{category}/`
- Temp -> `.claude/context/tmp/`
- Naming: lowercase kebab-case with ISO date suffix
- Provenance headers required
- Forbidden: project root, user home, Windows reserved names

---

## Phase 2: Consistency Audit

### 2.1 Cross-Reference with Agent Definitions

| Rule File | Agent Alignment | Issues |
|-----------|----------------|--------|
| `agents.md` | Lists 7 agents; **49 exist** in `.claude/agents/` | SEVERELY OUTDATED. Missing: pm, context-compressor, reflection-agent, router, all 20 domain agents, all 4 orchestrators, 8 specialized agents. Also missing agent categories (core/domain/specialized/orchestrators). |
| `coding-style.md` | Aligns with developer, code-reviewer agents | Console.log rule enforced by `check-console-log.cjs` hook. Good alignment. |
| `git-workflow.md` | Aligns with developer, devops agents | Accurate but thin. No mention of commit message format, Co-Authored-By convention, or pre-commit hooks. |
| `hooks.md` | Aligns with hook-creator skill and hook authoring patterns | Points to correct reference doc. Could mention the stdin/stdout JSON protocol explicitly. |
| `patterns.md` | Aligns with architect, developer agents | Very generic. Not project-specific. |
| `performance.md` | "Keep prompts concise" is project-specific and valuable | The only prompt-engineering rule. Could be expanded. |
| `security.md` | Aligns with security-architect agent, CLAUDE.md Gate 2 | "Review auth/PII changes with security-architect" matches Gate 2 behavior. Good. |
| `testing.md` | Aligns with developer (TDD), qa agents | "Record test commands and results" aligns with verification-before-completion skill. Good. |
| `workspace-conventions.md` | Referenced by 46+ agent definitions (via "Related Workflows" table) | Most-referenced rule file. Well integrated. |

### 2.2 Cross-Reference with Skill Behavior

| Rule File | Skill Alignment | Issues |
|-----------|----------------|--------|
| `agents.md` | Partially aligns with routing logic in `routing-table.cjs` | The 3 routing reminders are correct but incomplete vs CLAUDE.md gates. |
| `coding-style.md` | Aligns with `checklist-generator` IEEE 1028 Code Quality section | No conflicts. |
| `git-workflow.md` | No direct skill reference | No git-workflow skill exists. Rules are standalone. |
| `testing.md` | Aligns with `tdd` skill and `verification-before-completion` skill | Strong alignment. TDD mandate matches skill behavior. |
| `security.md` | Aligns with `security-architect` skill OWASP/STRIDE framework | Security skill covers much more depth; rule is a correct summary. |
| `workspace-conventions.md` | Referenced by all 6 creator skills (agent-creator, skill-creator, etc.) | Strong integration. Creators check placement rules. |

### 2.3 Conflicts with CLAUDE.md

| Rule File | CLAUDE.md Conflict? | Details |
|-----------|---------------------|---------|
| `agents.md` | PARTIAL CONFLICT | CLAUDE.md Section 3 references 49 agents and the full routing table. Rules file only lists 7. Not contradictory, but misleading by omission. |
| `coding-style.md` | NO CONFLICT | CLAUDE.md does not cover coding style. Rules is authoritative. |
| `git-workflow.md` | NO CONFLICT | CLAUDE.md does not cover git workflow. Rules is authoritative. |
| `hooks.md` | MINOR DUPLICATION | CLAUDE.md Section 1.3 covers enforcement hooks. Rules file adds authoring guidance (stderr/stdout protocol) which CLAUDE.md does not cover. Complementary. |
| `security.md` | DUPLICATION | CLAUDE.md Gate 2 says "include SECURITY-ARCHITECT" for auth/security. Rules says "Review auth/PII changes with security-architect." Same directive, different wording. Not harmful but redundant. |
| `testing.md` | NO CONFLICT | CLAUDE.md does not cover testing details. Rules is authoritative. |
| `workspace-conventions.md` | NO CONFLICT with CLAUDE.md | But see 2.4 below for FILE_PLACEMENT_RULES conflict. |

### 2.4 Critical Path Conflicts

**CONFLICT-1: Plan Path**
- `workspace-conventions.md`: "ALL plans go to `.claude/context/plans/`"
- `FILE_PLACEMENT_RULES.md`: "Plans go to `.claude/context/artifacts/plans/`"
- **Resolution:** workspace-conventions.md is the newer document (ADR-078) and is the canonical source. FILE_PLACEMENT_RULES.md is stale (v2.0, last updated 2026-01-31, before ADR-078).

**CONFLICT-2: Report Path**
- `workspace-conventions.md`: "ALL reports go to `.claude/context/reports/`"
- `FILE_PLACEMENT_RULES.md`: "Reports go to `.claude/context/artifacts/reports/`"
- **Resolution:** Same as above. ADR-081 consolidated reports to `.claude/context/reports/{domain}/`. FILE_PLACEMENT_RULES.md is stale.

**CONFLICT-3: Rule-Index Missing Entry**
- `rule-index.json` lists 8 rules (`total_rules: 8`)
- 9 rule files exist (missing: `workspace-conventions.md`)
- **Impact:** Any system that uses rule-index.json for rule discovery will not find workspace-conventions.md. This is the most-referenced rule file in the entire project.

### 2.5 Post-Pipeline #5-8 Accuracy Check

| Rule | Accurate After Pipelines? | Notes |
|------|--------------------------|-------|
| `agents.md` | NO | Agent count and categories unchanged since initial creation. Does not reflect any Pipeline work. |
| `coding-style.md` | YES | Coding style rules are timeless. Console.log rule still enforced by hook. |
| `git-workflow.md` | YES | Git rules are timeless. No Pipeline changed git practices. |
| `hooks.md` | YES | Hook reference still points to correct file. |
| `patterns.md` | YES | Patterns are timeless. |
| `performance.md` | YES | Performance rules still apply. |
| `security.md` | YES | Security rules still apply. Pipeline #7 security review validated these patterns. |
| `testing.md` | YES | TDD mandate strengthened by Pipeline #7-8 (regression tests created). |
| `workspace-conventions.md` | MOSTLY | Report consolidation (ADR-081) is correctly reflected. Plan path needs verification against FILE_PLACEMENT_RULES.md. |

---

## Phase 3: Gap Analysis

### 3.1 Missing Rules

| ID | Missing Rule | Importance | Rationale |
|----|-------------|------------|-----------|
| GAP-1 | **Memory Protocol** | CRITICAL | CLAUDE.md Section 8 mandates all agents read learnings.md before starting and write to learnings/decisions/issues after completing. This is the "assume interruption" protocol. No rule enforces it. Every agent definition includes it, but a rule would inject it into every conversation automatically. |
| GAP-2 | **Task Tracking** | HIGH | CLAUDE.md Sections 5.5-5.6 mandate TaskUpdate(in_progress) at start and TaskUpdate(completed) at end. No rule reinforces this. The task-management-protocol skill covers this but rules reach ALL conversations. |

### 3.2 Stale Rules

| ID | File | Issue | Impact |
|----|------|-------|--------|
| STALE-1 | `agents.md` | Lists 7 of 49 agents | LOW -- Rules auto-load for all conversations. The 7 listed are the most commonly used. But the omission of categories (domain, specialized, orchestrators) means the rule gives an incomplete picture. |
| STALE-2 | `agents.md` | Missing routing reminders for: docs -> technical-writer, architecture -> architect, testing -> qa | LOW -- These are in CLAUDE.md but not in rules. |

### 3.3 Redundant Rules

| ID | File | Duplication | Severity |
|----|------|-------------|----------|
| RED-1 | `security.md` line 4 "Review auth/PII changes with security-architect" | Duplicates CLAUDE.md Gate 2 | LOW -- Reinforcement is acceptable for security. Not harmful. |
| RED-2 | `patterns.md` "Use structured logging" | Overlaps with `coding-style.md` "Avoid ad-hoc console logging" | LOW -- Related but not identical. Structured logging is the positive framing; no console.log is the negative framing. |

### 3.4 Conflicting Rules

| ID | Files | Conflict | Severity |
|----|-------|----------|----------|
| CONF-1 | `workspace-conventions.md` vs `FILE_PLACEMENT_RULES.md` | Plan path: `context/plans/` vs `context/artifacts/plans/` | HIGH -- Agents may write plans to wrong location. |
| CONF-2 | `workspace-conventions.md` vs `FILE_PLACEMENT_RULES.md` | Report path: `context/reports/` vs `context/artifacts/reports/` | HIGH -- Same issue. FILE_PLACEMENT_RULES.md is the stale document (pre-ADR-078, pre-ADR-081). |
| CONF-3 | `rule-index.json` vs filesystem | 8 rules indexed, 9 exist | MEDIUM -- workspace-conventions.md missing from index. |

### 3.5 Scope Issues

| ID | File | Issue | Recommendation |
|----|------|-------|----------------|
| SCOPE-1 | `patterns.md` | Too generic (3 bullet points, no project-specific patterns) | Expand with project-specific patterns: CommonJS (.cjs) for hooks, ESM for tools, the wrapper-shim delegation pattern. |
| SCOPE-2 | `performance.md` | "Keep prompts concise" is the only AI-specific rule | Expand with token-budget awareness, context compression triggers. |
| SCOPE-3 | `coding-style.md` + `patterns.md` | Significant conceptual overlap | Consider merging. Both cover how to write code. |
| SCOPE-4 | All thin rules (3-7 lines) | Too sparse to be actionable | Each rule should have at minimum: heading, 5+ directives, 1+ cross-reference to detailed docs/skills. |

---

## Phase 4: Ecosystem Integration Check

### 4.1 Rules and Hooks

| Rule | Enforcement Hook | Status |
|------|-----------------|--------|
| `coding-style.md` ("no console.log") | `check-console-log.cjs` (Stop event) | ENFORCED -- Hook scans for console.log in committed files. |
| `workspace-conventions.md` (file placement) | `file-placement-guard.cjs` (PreToolUse Write/Edit) | PARTIALLY ENFORCED -- Hook validates write locations. But uses stale paths from FILE_PLACEMENT_RULES.md, not workspace-conventions.md. |
| `workspace-conventions.md` (Windows reserved names) | `windows-null-sanitizer.cjs` (PreToolUse Bash) | ENFORCED -- Prevents creation of Windows reserved filenames. |
| `security.md` (auth review) | `routing-guard.cjs` (PreToolUse Task) | INDIRECTLY ENFORCED -- Gate 2 triggers security-architect spawn. |
| `agents.md` (routing reminders) | `routing-guard.cjs` (PreToolUse Task) | INDIRECTLY ENFORCED -- Planner-first and security-review gates. |
| `testing.md` (TDD) | None | NOT ENFORCED -- TDD is a convention, not hook-enforced. |
| `git-workflow.md` (tests pass before commit) | `check-console-log.cjs` + pre-commit hooks | PARTIALLY ENFORCED -- Only console.log is checked. |
| `hooks.md` (never break pipeline) | Hook error handling (exit 0 on failure) | SELF-ENFORCED -- Hooks catch their own errors. |
| `patterns.md` | None | NOT ENFORCED -- Pure convention. |
| `performance.md` | None | NOT ENFORCED -- Pure convention. |

### 4.2 Rules and Skills

| Rule | Related Skill | Integration |
|------|--------------|-------------|
| `testing.md` | `tdd` skill | STRONG -- TDD skill implements the testing rules. |
| `testing.md` | `verification-before-completion` skill | STRONG -- "Record test commands and results" aligns with verification evidence requirement. |
| `security.md` | `security-architect` skill | MODERATE -- Skill covers OWASP/STRIDE depth. Rule is a summary. |
| `coding-style.md` | `checklist-generator` skill | MODERATE -- IEEE 1028 Code Quality section covers similar items. |
| `workspace-conventions.md` | All 6 creator skills | STRONG -- Every creator skill references workspace-conventions. |
| `agents.md` | None directly | WEAK -- No skill implements routing reminders. Router behavior does. |

### 4.3 Rules and Workflows

| Rule | Related Workflow | Integration |
|------|-----------------|-------------|
| `agents.md` | `router-decision.md` | STRONG -- Router decision workflow implements the routing logic. |
| `security.md` | `security-architect-skill-workflow.md` | MODERATE -- Workflow covers full security review process. |
| `testing.md` | `feature-development-workflow.md` | MODERATE -- Feature development includes TDD phase. |
| `workspace-conventions.md` | All workflows that produce output | STRONG -- Referenced in universal spawn template. |

### 4.4 Rules in Spawn Templates

The `universal-agent-spawn.md` template includes:
```
**Full rules:** .claude/rules/workspace-conventions.md
```

This means every spawned agent receives a pointer to workspace-conventions. However, no other rule file is explicitly referenced in spawn templates. This is correct because rules auto-load for all conversations -- spawn prompts do not need to repeat them.

### 4.5 Rules and rule-index.json

The `rule-index.json` at `.claude/context/config/rule-index.json` indexes 8 rules for programmatic discovery. It is missing `workspace-conventions.md`. All 8 indexed rules have empty `description`, `globs`, and `priority` fields. Only `testing.md` has a technology mapping (`api`). The index is underutilized.

---

## Phase 5: Disposition Matrix

### 5.1 Per-File Dispositions

| File | Disposition | Action Required |
|------|------------|-----------------|
| `agents.md` | **UPDATE** | Expand from 7 to full agent taxonomy. Add categories (core/domain/specialized/orchestrators). Add 5+ routing reminders. Keep as quick reference, not exhaustive list. |
| `coding-style.md` | **MERGE** | Merge with `patterns.md` into a single `code-standards.md`. Both cover "how to write code" and are too thin individually. Combined file should have 15+ directives. |
| `git-workflow.md` | **UPDATE** | Add commit message conventions (Co-Authored-By for AI), pre-commit hook awareness, branch naming patterns. Expand from 4 to 8+ directives. |
| `hooks.md` | **UPDATE** | Add stdin JSON protocol detail, exit code semantics (0=allow, 2=block), common patterns (graceful degradation, try/catch wrapping). Expand from 3 to 8+ directives. |
| `patterns.md` | **MERGE** | Merge into `coding-style.md` to create `code-standards.md`. See above. |
| `performance.md` | **UPDATE** | Add token budget awareness, context compression triggers, prompt size guidelines. Expand from 3 to 6+ directives. |
| `security.md` | **UPDATE** | Add spawnSync pattern (shell:false, array args), path traversal prevention, no eval/new Function. Reference security-architect skill. Expand from 4 to 8+ directives. |
| `testing.md` | **UPDATE** | Add regression test pattern (red-green-refactor verification), test file placement rule (tests/ not .claude/), pnpm test commands. Expand from 5 to 8+ directives. |
| `workspace-conventions.md` | **KEEP** | Accurate and well-integrated. Only fix: verify plan path matches actual practice. |

### 5.2 New Rules to Create

| New File | Content | Rationale |
|----------|---------|-----------|
| `memory-protocol.md` | Memory read/write requirements: read learnings.md before starting, write to learnings/decisions/issues after completing, assume interruption, use active_context.md as scratchpad. | CRITICAL gap. This is the #1 agent behavioral requirement per CLAUDE.md Section 8. Auto-loading it via rules ensures every conversation (not just spawned agents) follows the protocol. |
| `task-tracking.md` | TaskUpdate requirements: in_progress at start, completed at end with summary metadata, TaskList after completion, never mark complete without evidence. | HIGH gap. This is the #2 agent behavioral requirement per CLAUDE.md Sections 5.5-5.6. |

### 5.3 Additional Fixes Required

| ID | Fix | File | Priority |
|----|-----|------|----------|
| FIX-1 | Add `workspace-conventions.md` to `rule-index.json` | `.claude/context/config/rule-index.json` | HIGH |
| FIX-2 | Update `FILE_PLACEMENT_RULES.md` plan path from `context/artifacts/plans/` to `context/plans/` | `.claude/docs/FILE_PLACEMENT_RULES.md` | HIGH |
| FIX-3 | Update `FILE_PLACEMENT_RULES.md` report path from `context/artifacts/reports/` to `context/reports/{domain}/` | `.claude/docs/FILE_PLACEMENT_RULES.md` | HIGH |
| FIX-4 | Update `rule-index.json` to populate empty `description` fields | `.claude/context/config/rule-index.json` | LOW |
| FIX-5 | Update `rule-index-cache.json` to include workspace-conventions | `.claude/context/config/rule-index-cache.json` | LOW |

---

## Proposed ADR-091

See `decisions.md` for the full ADR. Summary:

**Decision:** Overhaul 9 rules files per the disposition matrix above -- UPDATE 6, MERGE 2 into 1, CREATE 2 new, fix 3 path conflicts. Net result: 10 rules files (from 9), all with 6+ actionable directives.

---

## Implementation Sequence

### Phase A: Critical Fixes (Priority 1 -- No Content Changes)

1. Fix FILE_PLACEMENT_RULES.md plan and report path conflicts (FIX-2, FIX-3)
2. Add workspace-conventions.md to rule-index.json (FIX-1)
3. Update rule-index-cache.json (FIX-5)

**Risk:** LOW -- documentation fixes only, no behavioral changes.
**Estimated effort:** 30 minutes (developer agent).

### Phase B: New Rules (Priority 2 -- Add Missing Coverage)

4. Create `memory-protocol.md` (GAP-1)
5. Create `task-tracking.md` (GAP-2)

**Risk:** LOW -- additive only, new files.
**Estimated effort:** 30 minutes (developer agent).

### Phase C: Merge (Priority 3 -- Consolidation)

6. Merge `coding-style.md` + `patterns.md` into `code-standards.md`
7. Delete `coding-style.md` and `patterns.md`
8. Update rule-index.json accordingly

**Risk:** MEDIUM -- rename/merge changes references. However, since rules auto-load by filename, the only external references are in rule-index.json and rule-index-cache.json. Also need to verify `check-console-log.cjs` does not reference `coding-style.md` by name.
**Estimated effort:** 45 minutes (developer agent).

### Phase D: Updates (Priority 4 -- Content Enrichment)

9. Update `agents.md` (STALE-1, STALE-2)
10. Update `git-workflow.md` (add commit conventions)
11. Update `hooks.md` (add protocol details)
12. Update `performance.md` (add token/prompt guidance)
13. Update `security.md` (add SafeExpressionParser pattern, spawnSync pattern)
14. Update `testing.md` (add regression test pattern, file placement)

**Risk:** LOW -- content enrichment, no structural changes.
**Estimated effort:** 1.5 hours (developer agent).

### Phase E: Validation

15. Run `pnpm validate:full` to verify no references are broken
16. Verify all 10 rules appear in rule-index.json
17. Verify FILE_PLACEMENT_RULES.md paths match workspace-conventions.md
18. Create TDD regression test: `tests/rules/rule-index-completeness.test.cjs`

**Risk:** LOW -- validation only.
**Estimated effort:** 30 minutes (qa agent).

---

## Token Budget Impact

Rules are loaded into every conversation's system prompt. Current total: ~4.3KB (~1,100 tokens). After overhaul:

| Change | Token Impact |
|--------|-------------|
| Merge coding-style + patterns | -50 tokens (net: merge removes duplication) |
| Expand 6 existing files | +600 tokens (each gains ~100 tokens) |
| Create memory-protocol.md | +200 tokens |
| Create task-tracking.md | +200 tokens |
| **Net change** | **+950 tokens** (~2,050 total) |

This is within acceptable bounds. The performance.md rule itself says "keep prompts concise" -- each rule should be tightly written with no prose filler. Target: 6-12 bullet points per rule, no paragraphs.

---

## Summary of All Findings

### By Severity

**CRITICAL (1):**
- GAP-1: No memory protocol rule (most important agent behavior has no rule)

**HIGH (5):**
- STALE-1: agents.md lists 7 of 49 agents
- CONF-1: Plan path conflict (workspace-conventions vs FILE_PLACEMENT_RULES)
- CONF-2: Report path conflict (same)
- CONF-3: rule-index.json missing workspace-conventions.md
- GAP-2: No task tracking rule

**MEDIUM (3):**
- SCOPE-1: patterns.md too generic
- SCOPE-3: coding-style.md + patterns.md overlap
- SCOPE-4: Most rules too sparse (3-7 lines)

**LOW (4):**
- RED-1: security.md duplicates CLAUDE.md Gate 2 (acceptable)
- RED-2: patterns.md overlaps coding-style.md (addressed by merge)
- STALE-2: agents.md missing routing reminders
- FIX-4: rule-index.json descriptions empty

### Final File State After Overhaul

| # | File | Status | Lines (est.) |
|---|------|--------|-------------|
| 1 | `agents.md` | UPDATED | ~35 |
| 2 | `code-standards.md` | NEW (merged) | ~25 |
| 3 | `git-workflow.md` | UPDATED | ~15 |
| 4 | `hooks.md` | UPDATED | ~15 |
| 5 | `memory-protocol.md` | NEW | ~15 |
| 6 | `performance.md` | UPDATED | ~12 |
| 7 | `security.md` | UPDATED | ~15 |
| 8 | `task-tracking.md` | NEW | ~15 |
| 9 | `testing.md` | UPDATED | ~15 |
| 10 | `workspace-conventions.md` | KEPT | ~62 |
| -- | `coding-style.md` | DELETED (merged) | -- |
| -- | `patterns.md` | DELETED (merged) | -- |

**Net:** 10 files, ~224 lines, ~7KB (~1,800 tokens)
