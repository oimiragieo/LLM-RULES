## ADR-2026-03-04-064: Framework-Path Worktree Isolation Override (2026-03-04)

**Status:** Accepted
**Context:** Developer agents with `isolation: worktree` silently lost all work when targeting `.claude/` framework paths. Worktree clones are cleaned up after task completion, discarding all framework file modifications. 43% lifetime failure rate confirmed across 5+ incidents (Tasks 3, 4, 4-wave2-dev in 2026-03-04 session; Task 36 in 2026-03-03 session; code-reviewer in 2026-03-03 session).

**Decision:** Add path-aware isolation override in `spawn-prompt-assembler.task-tools.cjs`. When a developer task prompt contains `.claude/` framework paths (hooks, skills, agents, tools, workflows, templates, schemas, lib), override worktree isolation to `none` so the agent works directly on main. Cross-platform stdin reading also fixed in `worktree-auto-cleanup.cjs` by replacing `/dev/stdin` with `fs.readFileSync(0, 'utf8')` (fd 0).

**Alternatives Considered:**

- (A) Remove `isolation: worktree` from developer.md entirely — loses worktree benefits for source code tasks
- (B) Route all framework tasks to devops/nodejs-pro — workaround, does not fix root cause for future agents
- (C) Path-aware override — preserves worktree for src/ tasks, prevents data loss for .claude/ tasks

**Consequences:** Developer agents now correctly modify framework files. Source code tasks continue to benefit from worktree isolation. Added `shouldOverrideWorktreeIsolation()` function with 26 tests.

**Evidence:** Commit 775ccf1f. Tests: `tests/hooks/spawn-prompt-assembler-worktree-override.test.cjs` (26 tests).

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
