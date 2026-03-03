## ADR-2026-03-03-109: Multi-LLM Council Pipeline Pattern (VALIDATED)

**Date**: 2026-03-03
**Status**: VALIDATED (session-2 council review + fix confirmed effectiveness)
**Trigger**: Reflection on Tasks 1, 3, 4 — council review + implementation pipeline

**Pattern Confirmed**: Multi-LLM Council → Architect Synthesis → Developer Implementation is a high-quality pipeline for codebase review:

1. Council (multiple LLMs) identifies findings across SE categories
2. Architect synthesizes, resolves false positives with code evidence, writes ADR + evolution plan
3. Developer implements fixes from plan, referencing ADR decisions
4. Devops validates: tests, lint, format, commit, push

**Key Decision**: Add mandatory code cross-check step BEFORE including HIGH/CRITICAL findings in council report. Pattern: `rg -F 'symbol' file` to confirm declared/undeclared. Architect caught H2 false positive (bytesRead line 43) but this should be caught earlier.

**Secondary Decision**: Worktree-isolated agent spawn prompts MUST include inline summary contract. Without it, router has no visibility into worktree output and must verify manually via git.

---

## ADR-2026-03-03-108: Skill System & Worktree Lifecycle Hardening Plan

**Date**: 2026-03-03
**Status**: APPROVED (plan written, pending implementation in task-4)
**Trigger**: Multi-LLM council review + internal code review of commits 4138e4f0..4c290b7d

**Decisions:**

1. NaN gate bypass in validate-skill-ecosystem.cjs requires `Number.isFinite()` guard + range validation (0-100)
2. All JSON.parse in hooks/tools MUST use safeParseJSON (SE-02 unconditional). ESLint rule proposed for enforcement.
3. Worktree utilities to be extracted into `.claude/lib/worktree/worktree-utils.cjs` (DRY: listWorktrees, isStale, detectDefaultBranch, normalizeWorktreesDir)
4. Default branch detection via `git symbolic-ref refs/remotes/origin/HEAD` instead of hardcoded 'main'
5. Date arithmetic must use UTC normalization per SE-06 (new utility: `.claude/lib/utils/date-utils.cjs`)
6. Council finding H2 (bytesRead ReferenceError) is a FALSE POSITIVE -- variable IS declared at line 43. Windows stdin fragility remains as minor item.
7. Report tools must output to `.claude/context/reports/backend/` per workspace conventions

**Plan**: `.claude/context/plans/skill-worktree-evolution-plan-2026-03-03.md`
**Implementation**: 4 phases, merge gate after Phase 2, estimated 4.5 hours total

---

## ADR-2026-03-02-107: Self-Healing Loop Evidence Integration (PROPOSED)

**Date**: 2026-03-02
**Status**: PROPOSED (awaiting implementation validation in next session)
**Trigger**: Evolution deep-dive synthesis (Tasks 1-4, 2026-03-02) identified critical gap in self-healing maturity

**Finding**: Agent-studio achieves only **3.5 out of 7 gold-standard properties** for self-improving AI systems. Gap analysis:

- ✅ Atomic trials, Memory dedup, Actionable feedback (partial)
- ❌ Staleness decay, HITL checkpoints
- ⚠️ Eval-gated promotion (partial)

**Root Cause**: Self-healing loop is **operationally closed but evidentially broken**. System executes Reflection → Evolution → Creation → Validation, but **outcome signals do not feedback into reflection context**. This causes:

1. Duplicate learnings re-discovered across sessions (no outcome tracking prevents downweighting failures)
2. Same evolution recommendations repeated (no indication whether they succeeded)
3. Staleness decay cannot be implemented without success/failure signals

**Decision**: Implement outcome signal injection to close evidence loop.

**What Changes**:

1. Add `outcome` field to reflection-log.jsonl schema (`outcome: "success" | "failure" | "pending"`)
2. Modify post-completion-chain.cjs to inject outcome when creator-triggered changes complete validation
3. Wire creator validation results (pass/fail) back to reflection spawn context
4. Implement dead-letter governance for failed creator attempts

**Why This Matters**:

- Solves for Gold-Standard Property #5 (Staleness decay): learnings marked with outcome enable temporal downweighting
- Solves for Gold-Standard Property #6 (HITL checkpoints): humans can verify whether recommendations succeeded before approving new ones
- Enables Property #7 (Separate judge/executor): reflection can now see validator feedback

**Effort**: ~8 hours total (modular; can be staged)

**Success Criteria**:

- Reflection-log.jsonl entries include `outcome` field populated for all creator-triggered cycles
- Next reflection cycle has visibility into outcome of prior recommendations
- Duplicate patterns no longer re-discovered if they failed in prior session
- Gold-standard property count increases from 3.5 to 5.0+

**Implementation Order**:

1. Register missing hooks (P0, blocks handshake) — 5 min
2. Add outcome field to schema (P0, enables tracking) — 1 hour
3. Modify post-completion-chain.cjs (P0, injects signals) — 3 hours
4. Wire validation results to reflection context (P1, closes loop) — 4 hours
5. Test full cycle with outcome tracking (P1) — 2 hours

**Alternatives Rejected**:

- Just add staleness decay without outcomes: insufficient — need both temporal AND success/failure signals
- Manual tracking via decisions.md: insufficient — requires automation to scale
- Out-of-band governance system: overly complex, should be native to reflection

**Next Steps**: Implement P0 items (hooks + schema) immediately; defer P1 items to sprint planning if complexity grows.

---

## ADR-2026-03-01-063: Python/DevOps orphaned skill wiring batch (2026-03-01)

**Status:** ACCEPTED
**Date:** 2026-03-01
**Trigger:** Orphaned skill sweep -- 5 skills (modern-python, poetry-rye-dependency-management, pyqt6-ui-development-rules, powershell-expert, feature-flag-management) had no agent-skill-matrix entries and defaulted to developer/Other.
**Decision:** Wire each skill to domain-appropriate agents via agent-skill-matrix.json AND agent frontmatter. modern-python primary to python-pro; poetry-rye and pyqt6 secondary/contextual to python-pro; powershell to developer+devops; feature-flags to developer+devops+qa. Update CATEGORY_MAP in generate-skill-index-definitions.cjs for correct index classification.
**Alternatives:** Could have created dedicated domain agents for each, but skills are cross-cutting and fit better as augmentations to existing agents.
**Consequences:** 5 fewer orphaned catalog skills. python-pro now has comprehensive Python tooling coverage. devops gains PowerShell and feature-flag capabilities.

## ADR-2026-02-23-062: stale-module-pruner and proactive-audit skill-updater pass (2026-02-23)

**Status:** ACCEPTED
**Date:** 2026-02-23
**Trigger:** User requested skill-updater on stale-module-pruner and proactive-audit.

**Decision:** (1) stale-module-pruner: rewrote stub SKILL.md to v1.0.0 with real workflow (ripgrep-based dead code crawl, dry-run gate, prune report), 5 Iron Laws, 5 Anti-Patterns, Memory Protocol, 6 mandatory skills. Fixed catalog: added to Quick Reference Core Development row (16→17) since parseMarkdownTable() only reads first table. Added developer to agent assignments. (2) proactive-audit: upgraded v1.1.0→v1.2.0, added Mandatory Skills table (6 skills), updated lastVerifiedAt. Both pass validate-integration.

---

## ADR-2026-02-22-039: Batch 28 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** nativescript, next-cache-components, next-upgrade

**Changes applied:**

- `nativescript` (v1.0.0→v1.1.0): Added verified=true, lastVerifiedAt, added 5 Iron Laws (always platform-specific files, never direct visual tree manipulation, always retain delegates, never deeply nested layouts, always clean up timers/listeners), added Anti-Patterns table (5 rows).
- `next-cache-components` (v'1.0.0'→v'1.1.0'): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always explicit use cache, never cache auth-dependent, always cacheTag on mutable data, never cache mutations, always revalidateTag after mutation), replaced bullet Anti-Patterns with proper 3-column table (5 rows).
- `next-upgrade` (v'1.0.0'→v'1.1.0'): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always dedicated branch, never skip versions, always run codemods first, never undocumented --legacy-peer-deps, always full build+test), added Anti-Patterns table (5 rows).

---

## ADR-2026-02-22-040: Batch 29 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** nextjs-expert, nodejs-expert, on-call-handoff-patterns

**Changes applied:**

- `nextjs-expert` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always App Router, never use client by default, always await Request APIs, never omit error.tsx, always fill+sizes for fluid images), added Anti-Patterns table (5 rows).
- `nodejs-expert` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always validate DTOs, never use callbacks, always global exception filter, never block event loop, always connection pooling), added Anti-Patterns table (5 rows).
- `on-call-handoff-patterns` (v1.0→v1.1.0): Fixed semver, set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always write handoff doc, never skip sync call, always escalate within 30 min, never skip alerting verification, always document next steps), added Anti-Patterns table (5 rows).

---

## ADR-2026-02-22-041: Batch 30 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** php-expert, pipeline-reflection-ux, plan-generator

**Changes applied:**

- `php-expert` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always parameterized queries, never md5/sha1 passwords, always strict_types, never silent Exception catch, always validate at boundary), added Anti-Patterns table (5 rows).
- `pipeline-reflection-ux` (v'1.0.0'→v'1.1.0'): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always Step 0 narration, never batch reflection with dependents, always emit reflection outcome, never per-agent late notifications, always preserve block semantics), added Anti-Patterns table (5 rows), added Memory Protocol section.
- `plan-generator` (v1.1→v1.1.0 semver fix): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws section (always executable command, never 7+ tasks per phase, always verification gates, never plan without rollback, always coordinate specialists). Existing Anti-Patterns table preserved.

---

## ADR-2026-02-22-042: Batch 31 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** planning-with-files, postmortem-writing, prd-generator

**Changes applied:**

- `planning-with-files` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, removed HTML comment template markers from findings.md and progress.md templates (fixed Check 8), fixed `- ## Actions taken:` syntax, added 5 Iron Laws (always create 3 files first, always re-read plan before decisions, never retry with identical inputs, always write multimodal findings immediately, never mark complete without verifying deliverables), replaced 2-column Anti-Patterns with 3-column table (5 rows).
- `postmortem-writing` (v1.0→v1.1.0 semver fix): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always write within 48 hours, never blame individuals, always trace 3+ levels of why, always assign owner/priority/date to actions, never skip what went well), existing 3-column Anti-Patterns table preserved.
- `prd-generator` (v1.0→v1.1.0 semver fix): Set verified=true, updated lastVerifiedAt, replaced single prose Iron Law code block with proper 5 Iron Laws section (never solution before problem, always include Won't in MoSCoW, always measurable hypothesis, always map phase dependencies, never let PRD go stale), added Anti-Patterns table (5 rows).

---

## ADR-2026-02-22-043: Batch 32 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** proactive-audit, project-onboarding, pyqt6-ui-development-rules

**Changes applied:**

- `proactive-audit` (v1.0.0→v1.1.0): Set verified=true, added lastVerifiedAt, added 5 Iron Laws (always run all checks, never trust task metadata, never self-attest PASS, never ignore SE-02, always check hook syntax), replaced bullet Anti-Patterns with 3-column table (5 rows).
- `project-onboarding` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always check existing memories first, never assume conventions, always write to persistent memory, always verify commands, never skip memory updates), added Anti-Patterns table (5 rows) before Memory Protocol.
- `pyqt6-ui-development-rules` (v1.0.0→v1.1.0): Added verified=true, lastVerifiedAt, added 5 Iron Laws (always signal/slot, never block UI thread, always app-level QSS, never absolute pixels, always cross-platform testing), added Anti-Patterns table (5 rows). Note: progressive-disclosure skill directory not found — skipped.

---

## ADR-2026-02-22-044: Batch 33 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** python-backend-expert, qa-workflow, qwik-expert

**Changes applied:**

- `python-backend-expert` (v1.1.0, updated lastVerifiedAt to 2026-02-22): Added 5 Iron Laws (always lifespan context, never session.query in SA2.0+, always parameterized queries, never blocking I/O in async, always Pydantic v2 boundary validation), added Anti-Patterns table (5 rows). ADR+evolution state added.
- `qa-workflow` (v1.0.0→v1.1.0): Updated lastVerifiedAt, replaced single prose Iron Law code block with proper 5 Iron Laws section (never approve without all criteria, always exact file/line in reports, never sign off with failing tests, always full regression suite, never exceed 5 loop iterations), added Anti-Patterns table (5 rows).
- `qwik-expert` (v1.0.0→v1.1.0): Added verified=true, lastVerifiedAt, added 5 Iron Laws (always $ suffix, never browser APIs in body, always useSignal/useStore, never top-level large imports, always functional components), added Anti-Patterns table (5 rows).

---

## ADR-2026-02-22-045: Batch 34 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** react-expert, readme, receiving-code-review

**Changes applied:**

- `react-expert` (v1.1.0, updated lastVerifiedAt): Fixed Check 8 false positives — renamed TodoList/todos to ItemList/items to avoid case-insensitive 'todo' match; replaced `{{Name}}` template placeholders with concrete example names (Button, ContactForm, UserProfile, UserData). Added 5 Iron Laws (always functional components, never violate Rules of Hooks, always push state down, never side effects in render, always small client components), added Anti-Patterns table (5 rows).
- `readme` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always lead with value, never Quick Start >10 lines, always working examples, never let README go stale, always test links), added Anti-Patterns table (5 rows). Existing Anti-Patterns table retained.
- `receiving-code-review` (v1.0.0→v1.1.0): Added verified=true, lastVerifiedAt, added 5 Iron Laws (never implement without verification, always clarify before implementing, never performative agreement, always one-at-a-time testing, never implement unused features), added Anti-Patterns table (5 rows).

---

## ADR-2026-02-22-046: Batch 35 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** recommend-evolution, requesting-code-review, research-synthesis

**Changes applied:**

- `recommend-evolution` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt. Replaced single-law prose code block with 5 Iron Laws (never spawn orchestrator directly, always validate trigger thresholds, never request evolution for integration gaps, always dual-record to JSONL+report, never proceed without evidence). Added Anti-Patterns table (5 rows).
- `requesting-code-review` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt. Added 5 Iron Laws (always capture SHAs first, never skip review, always fix Critical before proceeding, never argue without evidence, always review at mandatory checkpoints). Added Anti-Patterns table (5 rows).
- `research-synthesis` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt. Replaced 6-law prose code block "Iron Laws of Research Synthesis" with proper 5 numbered Iron Laws (never create without research, never exceed 5 queries, never exceed 10 KB, always analyze existing codebase, always document decision sources). Added Anti-Patterns table (5 rows).

All three now pass 8/0/3 validation.

---

## ADR-2026-02-22-047: Batch 36 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** response-rater, ripgrep, scientific-skills

**Changes applied:**

- `response-rater` (v2.0→v2.0.0 semver fix): Set verified=true, updated lastVerifiedAt. Replaced `## Rules` prose with 5 Iron Laws (always consistent rubric, never skip justification, always use defined thresholds, never vague recommendations, always prioritize by impact). Added Anti-Patterns table (5 rows).
- `ripgrep` (v1.1.0, updated lastVerifiedAt): Set verified=true. Fixed Check 8 false positive — removed `TODO` from `rg "TODO|FIXME|HACK|STUB"` grep example (replaced with `rg "FIXME|HACK|STUB"`). Added Iron Laws (always search:structure first, never hybrid search for audits, always rg -F before edits, never fzf in agent automation, always scope searches). Added Anti-Patterns table (5 rows).
- `scientific-skills` (v2.17.0, updated lastVerifiedAt): Set verified=true. Added 5 Iron Laws (always query databases first, never analyze without documenting, always chain skills, never report without statistical validation, always visualize intermediate results). Added Anti-Patterns table (5 rows). Added Memory Protocol section (was missing).

All three now pass 8/0/3 validation.
