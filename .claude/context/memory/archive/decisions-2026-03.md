# decisions Archive (2026-03)

## ADR-2026-03-03-110: Memory Injection Defaults Architecture (IMPLEMENTED)

**Date**: 2026-03-03
**Status**: IMPLEMENTED (commit a7ad75f4)
**Trigger**: Task 5 — memory system remediation (6 phases)

**Architecture Decisions**:

1. **Injection defaults ON** (opt-out model): `SPAWN_PROMPT_MEMORY_QUERY` and `MEMORY_INTENT_ANALYSIS` are now on by default. Agents receive memory context unless explicitly disabled.
2. **Token budget cap**: `MEMORY_INJECTION_MAX_CHARS=3600` (~900 tokens) per injection section. Prevents memory injection bloat from degrading spawn prompt quality.
3. **Session promotion hook**: `.claude/hooks/lifecycle/session-end-memory-promotion.cjs` calls `consolidateSession()` on session end. STM → MTM promotion is now automatic.
4. **Extraction trigger**: `post-completion-chain.cjs` auto-extracts from `TaskUpdate(completed)` metadata with 0.7 confidence gate. Only high-confidence signals enter memory.
5. **Spawn template**: `universal-agent-spawn.md` now includes explicit MemoryRecord usage instructions (pattern/gotcha/discovery).
6. **memory-search promoted**: From `contextual` to `always` for 9 core agents (developer, qa, architect, code-reviewer, code-simplifier, planner, devops, devops-troubleshooter, incident-responder).
7. **Named Memory API deferred**: readMemory/writeMemory still unused — defer until specific use case emerges.

**Evidence**: Multi-LLM consensus (Gemini+Codex): MemGPT/Letta pattern is gold standard; RAG injection > full dump; confidence-gate all writes.

**Validation**: Confirmed via commit a7ad75f4, +1522/-281 lines, 15 files, lint/format clean.

---

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

## ADR-2026-03-03-111: Cap-Based LTM Eviction (IMPLEMENTED)

**Date**: 2026-03-03
**Status**: IMPLEMENTED
**Decision**: Replace threshold-based LTM eviction with cap-based eviction.

**Rationale**:

- Threshold-based eviction could wipe ALL LTM entries in a single pass when many age past threshold (e.g., 180 days)
- Cap-based eviction only evicts when `files.length > LTM_MAX_FILES`, maintaining a bounded set
- Prevents mass extinction of useful learnings

**Implementation**:

- Eviction logic: `const needToEvict = files.length - LTM_MAX_FILES` (only evicts when needed)
- NaN guards on: `LTM_DECAY_FACTOR`, `LTM_EVICTION_THRESHOLD`, `LTM_MAX_FILES` (use `Number.isFinite()`)
- mtime fallback: entries missing `timestamp`/`mtime` fields default to `Date.now()`
- Eviction preview: console.error outputs entries before deletion for debugging

**Impact**: Prevents catastrophic data loss while maintaining memory size bounds.

---

## ADR-2026-03-03-112: Access Count Wiring for Utility-Based Eviction (IMPLEMENTED)

**Date**: 2026-03-03
**Status**: IMPLEMENTED
**Decision**: Wire `access_count` increment in memory search path to enable utility-based eviction prioritization.

**Rationale**:

- Previously all LTM entries had equal utility (no differentiation on access frequency)
- Access count enables prioritizing frequently-used learnings (highest utility) for retention
- Least-used entries (lowest utility) are evicted first when cap is exceeded

**Implementation**:

- Function: `incrementLTMAccessCount(entryId)` in `.claude/lib/memory/contextual-memory.cjs`
- Triggers on every LTM search hit (memory-search.cjs calls it)
- Utility calculation: combines `accessCount` with time decay for eviction priority

**Impact**: Ensures most-valuable learnings persist while space-constrained LTM can shed stale entries.

---

## ADR-2026-03-03-111: Cap-Based LTM Eviction (IMPLEMENTED)

**Date**: 2026-03-03
**Status**: IMPLEMENTED
**Decision**: Replace threshold-based LTM eviction with cap-based eviction.

**Rationale**:

- Threshold-based eviction could wipe ALL LTM entries in a single pass when many age past threshold (e.g., 180 days)
- Cap-based eviction only evicts when `files.length > LTM_MAX_FILES`, maintaining a bounded set
- Prevents mass extinction of useful learnings

**Implementation**:

- Eviction logic: `const needToEvict = files.length - LTM_MAX_FILES` (only evicts when needed)
- NaN guards on: `LTM_DECAY_FACTOR`, `LTM_EVICTION_THRESHOLD`, `LTM_MAX_FILES` (use `Number.isFinite()`)
- mtime fallback: entries missing `timestamp`/`mtime` fields default to `Date.now()`
- Eviction preview: console.error outputs entries before deletion for debugging

**Impact**: Prevents catastrophic data loss while maintaining memory size bounds.

---

## ADR-2026-03-03-112: Access Count Wiring for Utility-Based Eviction (IMPLEMENTED)

**Date**: 2026-03-03
**Status**: IMPLEMENTED
**Decision**: Wire `access_count` increment in memory search path to enable utility-based eviction prioritization.

**Rationale**:

- Previously all LTM entries had equal utility (no differentiation on access frequency)
- Access count enables prioritizing frequently-used learnings (highest utility) for retention
- Least-used entries (lowest utility) are evicted first when cap is exceeded

**Implementation**:

- Function: `incrementLTMAccessCount(entryId)` in `.claude/lib/memory/contextual-memory.cjs`
- Triggers on every LTM search hit (memory-search.cjs calls it)
- Utility calculation: combines `accessCount` with time decay for eviction priority

**Impact**: Ensures most-valuable learnings persist while space-constrained LTM can shed stale entries.

---

## ADR-2026-03-11A: ecosystem-auditor skill wiring fix — APPROVED (2026-03-11)

**Status:** Applied
**arXiv backing:** 2406.16739 "Agent-Driven Automatic Software Improvement" — gap detection should automatically enqueue evolution pipeline tasks (not report passively). Our fix ensures `recommend-evolution` is pre-loaded so it fires immediately on gap detection.
**Pattern established:** Any agent whose workflow body calls `Skill({ skill: 'X' })` MUST declare `X` in its `skills:` frontmatter array. Undeclared skills are not pre-loaded by spawn-prompt-assembler → silent runtime failures.
**Fixes:** ecosystem-auditor (recommend-evolution, ecosystem-integrity-scanner), reflection-agent (session-transcript-analyzer).

## ADR-2026-03-09A: Cron-Runner Subprocess Isolation — APPROVED-WITH-CONDITIONS (2026-03-09)

**Status:** Conditionally Approved (pending Phase 1 conditions)
**Context:** Cron ticks firing into the Router session cause 15K-60K tokens/hour of context pollution. Moving cron loop ownership to a persistent subprocess (via `child_process.spawn detached:true`) with a JSONL queue bridge was evaluated by a multi-LLM council (Gemini + Codex + Claude chairman).

**Decision:** APPROVE-WITH-CONDITIONS.

- Subprocess isolation pattern (sidecar) is architecturally correct for this problem.
- Phase 0 (launcher + skill creation, no behavior changes) is authorized to proceed immediately.
- Phase 1 is BLOCKED until: (C1) queue drain/ack protocol defined, (C2) CRON_SUBPROCESS_MODE=shadow flag implemented.
- Phase 2 is BLOCKED until all 3 BLOCKING conditions resolved (C1, C2, C3: credential inheritance check).

**Key Design Decisions:**

- Queue drain: atomic file rename (not in-place rewrite), line-level try/parse skip-on-error
- Shadow mode: CRON_SUBPROCESS_MODE env var controls whether router drains queue (shadow=no, active=yes)
- Credential inheritance: launcher must verify ANTHROPIC_API_KEY present in process.env before spawn
- Model selection: Haiku for simple heartbeats, allow escalation to Sonnet for distillation tasks

**Risk Record:**

- CRITICAL: Queue drain/ack protocol unspecified (could cause silent action loss or duplicate execution)
- HIGH: Phase 1 double-execution without shadow mode flag
- HIGH: Windows orphan subprocess + credential inheritance gap

**Evidence:** `.claude/context/reports/architecture/cron-runner-subprocess-council-2026-03-09.md`

---

## ADR-2026-03-08A: MEGA EPIC Audit — Security Enforcement Hardening

**Status:** Accepted
**Context:** 100% framework audit (2026-03-08) found 5 security/enforcement hooks configured fail-open or warn-only. This creates bypass vectors (SEC-008 pattern).

**Decision:** All security hooks MUST default to `block` (fail-closed). Upgraded in this session:

- `spawn-prompt-validator.cjs` — fail-open → fail-closed (exit 2 on errors)
- `external-content-guard.cjs` — warn → block default
- `TASKLIST_FIRST_ENFORCEMENT` — missing default → explicit `'block'`
- `TASK_SINGLE_PURPOSE_ENFORCEMENT` — warn → block

**Rationale:** Advisory hooks (metrics, bypass-audit) may fail-open — they do not control access. Security hooks that fail-open on unexpected errors create bypass vectors because an attacker can craft input to trigger the error path and bypass the check entirely.

**Consequence:** Any future hook created for security enforcement must use `process.exit(2)` in its catch block, not `process.exit(0)`. See `.claude/rules/hooks.md` fail-open vs fail-closed policy table.

**Commits:** 616be685

---

## ADR-2026-03-08B: O_EXCL Atomic Lock for State Guard Files

**Status:** Accepted
**Context:** evolution-state-guard.cjs used non-atomic `fs.writeFileSync` to create a lock file. Under concurrent access (two evolution processes racing), both could see the file absent and proceed simultaneously — a TOCTOU race.

**Decision:** State guard files that prevent concurrent execution MUST use `fs.openSync(path, 'wx')` (O_EXCL flag). The 'wx' flag is an atomic "create-exclusive" operation at the OS level: it fails with EEXIST if the file already exists, with no race window between check and create.

**Alternatives Considered:**

- (A) `proper-lockfile` — full lock library, overkill for simple guard files
- (B) `fs.existsSync` + `fs.writeFileSync` — classic TOCTOU race, not safe
- (C) `fs.openSync('wx')` — minimal, atomic, OS-guaranteed

**Consequence:** Any future "guard file" pattern for preventing concurrent execution must use O_EXCL. Error handling: catch EEXIST specifically (`err.code === 'EEXIST'`) and treat as "already locked."

**Commits:** 616be685

---

## ADR-2026-03-07B: agent-registry.json Structure Contract

- **Decision**: agent-registry.json `agents` field is an OBJECT keyed by agent ID string (not array)
- **Correct access**: `registry.agents[agentId]` for lookup; `Object.values(registry.agents)` for iteration; `Object.keys(registry.agents).length` for count
- **Wrong**: `registry.agents.length` (returns undefined), `Array.isArray(registry.agents)` (returns false), `registry.agents.forEach(...)` (TypeError)
- **Fixed in**: creator-commons.cjs, commit 39c6e7d2
- **Regression test**: tests/lib/creators/creator-commons.test.cjs

---

## ADR-2026-03-05-065: Graduated Eval Rollout Pattern for Creator Skills (2026-03-05)

**Status:** Accepted
**Context:** Adding LLM-as-judge evaluation patterns to 8 creator/updater SKILL.md files. Risk varies significantly across skill types. Applying identical eval depth to all would create unnecessary complexity in low-risk skills.

**Decision:** Use three complexity tiers for eval rollout across creator skills:

- **FULL** (structured eval sections with grader assertions): agent-creator, agent-updater, workflow-creator, workflow-updater — high-impact, high-risk creators
- **LIGHT** (brief eval guidance, simpler assertions): hook-creator, template-creator, tool-creator — medium-risk creators
- **NOTE** (single paragraph): schema-creator — low-risk, highly constrained output

Execute as canary rollout: schema-creator first (lowest risk), validate pattern, then expand.

**Implementation:** Commit e1a7f9be. 8 SKILL.md files + skill-index.json updated. Lint/format clean. Multi-LLM review (Gemini+Claude) validated plan before implementation.

**Consequences:** All 8 creator/updater skills now have proportional eval guidance. Codex limitation documented: fails plan-review tasks consistently (confirmed in task 8). Pre-edit snapshot capability identified as follow-up improvement. Shared eval agent location deferred as next deliverable.

---

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