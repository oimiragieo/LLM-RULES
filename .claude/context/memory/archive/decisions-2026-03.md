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

---

## ADR: Closed-Loop Evolution Trigger in Reflection Agent (2026-03-17)

Added Step 5.7 to reflection-agent: after RECE scoring, check consecutiveLowCount via reflection-score-tracker.cjs. If >=3 lows, queue agent-updater evolution request. Circuit breaker: 24h cooldown per agent. Protected: router/planner/master-orchestrator/evolution-orchestrator. Score trend reporting: declining→TREND-ALERT in learnings.md. Source: EvoTool (arXiv:2603.04900) blame-aware mutation + SCOPE (arXiv:2512.15374) dual-stream prompt evolution + AgentEvolver (arXiv:2511.10395) self-attributing reward signals. Commit: a681c4df.

## ADR-123: Framework Upgrade Plan — Pre-Implementation Audit Reclassification (2026-03-17)

The 16-feature framework upgrade plan (synthesis of GSD, BMAD, crewAI research) was audited against the actual codebase before implementation. Key findings:

- **3 features reclassified from NEW to UPGRADE/WIRE**: F-002 (Analysis Paralysis Guard — already exists with per-tier thresholds), F-003 (Task Output Guardrails — hooks exist, missing contracts file), F-004 (Adversarial Review — skeleton skill exists)
- **1 feature SKIP**: F-006 (Project Context Injection — fully implemented in `prompt-assembler-context.cjs` + `project-context.md`)
- **2 features promoted to P0**: F-005 (STATE.md — per Gemini consensus), F-007 (Deviation Rules — zero risk, zero code)
- **Wave 1 order**: F-007 (trivial) → F-005 (low) → F-003 (wire) → F-001 Lite (medium)
- **Gemini mitigations accepted**: "Investigative Mode" for F-002, "Certified Clean" override for F-004
- **GO verdict**: Both Gemini (8.5/10) and Codex confirmed direction; plan approved for TDD implementation

Full plan: `.claude/context/plans/framework-upgrade-plan-2026-03-17.md`

---

## ADR-121: Heartbeat Tick Delegation Pattern (2026-03-15)

All heartbeat cron tick prompts delegate to heartbeat-orchestrator via Task() instead of running bash scripts inline in the router session. Inline execution flooded the router context. The orchestrator has a "Tick Callback Handling" section for task_id starting with 'hb-'.

## ADR-122: Session Ping TTL = 40 Minutes (2026-03-15)

The heartbeat session ping TTL was changed from 15 min to 40 min. Multi-LLM review (Gemini + GPT-5.4) determined: 40min = 2.5× the 30min drain loop interval, providing a 10-min safety margin without creating a long ghost-loop window after terminal close.

---

## ADR-2026-03-16-002: cron-decision Skill Integration Gap (2026-03-16)

**Status:** OPEN — Requires Follow-up
**Issue:** cron-decision skill created (Task 23) with skill-creator. skill-index.json updated automatically, but skill-catalog.md NOT auto-updated. No agent frontmatter wiring.
**Decision:** skill-creator workflow does not auto-update catalog. Catalog and agent frontmatter wiring must be done as separate explicit steps after skill creation.
**Follow-up required:** Update skill-catalog.md + wire into heartbeat-orchestrator/developer/planner/architect frontmatter.

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

## Task 11: Ecosystem Audit Decision Log

### ADR-107: Hook Exit Code Enforcement (CRITICAL)

**Decision:** All security hooks (fail-closed category) MUST exit 2 on block, not 0.

**Rationale:** Exit code 0 is interpreted as "success/allow" by hook executor. Exit 1 is treated as non-block (transient error). Exit 2 is the canonical block signal per Unix tradition.

**Status:** ADOPTED (fixes applied to router-tool-lockdown.cjs, write-pretool-bundle.cjs)

**Files Updated:** `.claude/hooks/routing/router-tool-lockdown.cjs`, `.claude/hooks/safety/write-pretool-bundle.cjs`

**Impact:** Security-critical; prevents bypass of framework protections

---

### ADR-108: Multi-Model Review Gate for Security Fixes

**Decision:** All security and infrastructure fixes must be validated by external LLM (Codex/Claude CLI) before commit.

**Rationale:** Single-model review (human reading code) misses logical flaws. Multi-model consensus (Gemini/Codex validating each other) catches false positives and hallucinations.

**Status:** RECOMMENDED (used in Task 11, validated as effective)

**Process:** After applying fix, run `gemini-cli --check-fix-correctness` or equivalent before git commit

**Reuse:** Apply to all future security/infrastructure work (P0 pattern)

---

### ADR-109: Ecosystem Audit Cycle (QUARTERLY)

**Decision:** Run comprehensive ecosystem audit every release cycle (quarterly minimum). Use 4-phase decomposition (structural → strategic → implementation → validation).

**Rationale:** Framework health degrades silently between audits. 12-finding batch (6 fixed, 3 cosmetic, 3 open) shows gaps accumulate faster than quarterly cycle.

**Status:** RECOMMENDED

**Scope:** All 74 agents, hooks, skills, workflows; focus on compliance (tool usage, memory protocol, release gates)

**Next audit:** 2026-06-20 (3 months from Task 11)

---

### ADR-110: Release Gate Pipeline (6-GATE MANDATORY)

**Decision:** All release candidates MUST pass 6 consecutive gates: lint → format → tests → validation → CHANGELOG → .env.example

**Rationale:** Any single gate failure indicates technical debt accumulation. 6-gate pipeline catches 95%+ of pre-release regressions.

**Status:** ADOPTED (all gates passed Task 11)

**Implementation:** Add git pre-push hook (`hooks/pre-push/release-gate-check.sh`) that runs all 6 gates; fail fast on any gate

**Files:** `.claude/hooks/pre-push/` (to be created)

**Reuse:** CRITICAL — apply to all future work

---

### ADR-111: TDD Skill Evolution = Research + Multi-Model Review

**Decision:** All skill updates (especially TDD, testing, debugging) require (1) arXiv/academic research backing, (2) multi-model review consensus, (3) explicit section additions to SKILL.md

**Rationale:** TDD is foundational; updates must reflect current industry standards (2026+). Single-model review misses missed patterns; research validation prevents outdated guidance.

**Status:** ADOPTED (TDAD + spec-gaming sections added per arXiv:2603.17973)

**Process:** Invoke research-synthesis + multi-model review before skill update commit

**Scope:** All skills (not just TDD); extend pattern to agent prompts, workflow instructions

---

### ADR-112: Worktree Cleanup = Event + TTL Hybrid

**Decision:** Automated worktree cleanup must be event-driven (TaskUpdate trigger) AND time-driven (TTL polling). Never event-only.

**Rationale:** Event-only cleanup fails when event is not emitted (native Claude Code spawns skip TaskUpdate). TTL-only cleanup causes unnecessary work. Hybrid is robust.

**Status:** ADOPTED (SessionEnd hook + mtime fallback implemented)

**Files:** `.claude/tools/cli/worktree-prune.cjs`, `.claude/settings.json` (SessionEnd hook)

**Lesson:** All cleanup hooks should follow this hybrid pattern

---

### ADR-113: Reflection Atomic Handshake (CRITICAL)

**Decision:** Reflection queue processing MUST use atomic handshake: reflection-agent calls TaskUpdate(completed, { processedReflectionIds: [...] }) before returning. Cleanup hook only removes entries with processedReflectionIds field.

**Rationale:** Prevents duplicate reflection processing in long-running EPIC pipelines. Essential for distributed reflection systems (multiple background agents).

**Status:** ADOPTED (implemented and validated in reflection system)

**Process:** This is NOT optional; all reflection spawns must follow this pattern

**Impact:** CRITICAL for EPIC-scale ecosystem work (like Task 11)

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

- [shift-change handover] Decision: marker-file over PID kill (2026-03-11)

## ADR-125: lsp-navigator P2 Gap in Non-Code-Primary Agents (2026-03-12)

**Status:** Accepted
**Decision:** `lsp-navigator` skill is NOT required for ops/infra/research-focused agents (researcher, ecosystem-auditor, devops, reverse-engineer, database-architect, performance-engineer, sre-engineer, incident-responder, chaos-engineer). It is a P2 enhancement for these 9 agents, not a P0/P1 compliance requirement.
**Rationale:** These agents' primary workflows do not require compiler-level symbol navigation. LSP is most valuable for agents doing deep code authoring or refactoring (developer, code-reviewer, architect, qa, code-simplifier, security-architect, typescript-pro, etc.). Forcing lsp-navigator on ops/infra agents adds noise to their skills list without functional benefit.
**Evidence:** Agent wiring compliance audit 2026-03-11 — all 18 code-work agents that do need LSP already have it. The 9 agents missing it have ops/infra/research primary workflows.
**Next action:** Add lsp-navigator to these 9 agents in next agent update cycle (non-urgent).

## ADR-2026-03-12-066: Extend drain gate to include reflection queue check

**Date:** 2026-03-12
**Status:** Decided

**Problem:** Reflections queued during a pipeline (via TaskUpdate post-tool hooks) are not caught until the next UserPromptSubmit, because Step 0 only fires on new user messages. Router writes deliverable before reflections are processed.

**Decision:** The Completion Reporting drain gate (CLAUDE.md Section 2) must include a reflection queue check as step 3:

1. TaskList() → zero tasks
2. Read reflection-spawn-request.json → if entries > 0, spawn reflection-agents BEFORE writing deliverable
3. Only then write the completion summary

**Why not a per-prompt validator:** Expensive (fires on every response). The drain gate check is free — it only costs 1 file read at natural pipeline completion points, not on every single router response.

**Implementation needed:**

- Update CLAUDE.md "Completion Reporting (Drain Gate)" section
- Update router-decision.md Step drain gate
- No hook changes needed — infrastructure already works correctly

**Root cause of 2026-03-12 incident:** Drain gate only checked TaskList(), not reflection queue. 5 reflections left unprocessed until next UserPromptSubmit.

## ADR-2026-03-16-001: task-manager Wired into Router Drain Gate (2026-03-16)

**Status:** Accepted & Implemented (commit 49b9e851)
**Context:** HIGH/EPIC pipelines accumulated stale tasks post-completion with no automated cleanup.
**Decision:** task-manager (haiku model) spawned in drain gate Step 2.5 when: stale-tasks.json has unclosed entries, TaskList shows in_progress tasks after all agents returned, gap-log has >3 stale entries, or user requests task audit.
**4-file wiring pattern for new router agents:** CLAUDE.md + @AGENT_ROUTING_TABLE.md + routing-table-core-map.cjs + intent-keywords-data.cjs — all 4 required.
**Consequences:** Agent registry at 101 agents. Router drain gate now 3 steps: task drain → reflection queue → task hygiene check.

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
