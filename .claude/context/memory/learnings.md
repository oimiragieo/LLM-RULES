## Memory Management Pipeline Complete (2026-03-19) [Batch 10 reflections]

**[WORKFLOW] Memory Bloat Recovery Pipeline — Pattern and Outcomes**

- Full memory system cleanup pipeline completed in a single session with 8 active tasks
- MEMORY.md pruned 227→48 lines; 3 structured reference files extracted to separate files
- Memory directory reduced from 261 files/7.8MB to ~105 files via deletion of 146 orphaned delegation PIDs, 2 .bak artifacts, and 8 old metrics files
- learnings.md pruned 456→174 lines; STATE.md reset; metrics files pruned
- All 16/16 tests passed after changes

**[PATTERN] memory-rotator.cjs Auto-Cleanup Enhancement**

- `memory-rotator.cjs` enhanced to auto-clean `.bak` files and stale delegation PIDs during rotation
- Pattern: embed cleanup logic in the rotator rather than relying on separate manual cleanup tasks
- This prevents future accumulation of orphaned PIDs and backup artifacts
- Health check command confirms memory state: `Memory dir 7.8MB/105 files`

**[ARCHITECTURE] Multi-LLM Consensus for Memory Architecture**

- Codex + Claude + Gemini consensus reached on dual memory coexistence strategy (session 2026-03-19)
- Three LLMs independently reviewed the memory architecture and converged on the same approach
- Multi-LLM review as an architecture validation gate is highly effective — surface contradictions that single-model review misses
- Consensus artifact: `.claude/context/memory/archive/` strategy documented in decisions.md

**[SKILL] memory-audit Skill as Sensor Component**

- `memory-audit` skill created with 7-step workflow using sensor/controller pattern
- Sensor: monitors memory health metrics (file count, size, duplication rate, age of entries)
- Controller: generates actionable tasks for cleanup when thresholds exceeded
- Pattern: skills can serve as lightweight monitoring sensors without needing full agent infrastructure
- This is the canonical approach for memory health monitoring going forward

**[CURATION] Decisions for these learnings**

- Retain: memory-rotator auto-cleanup pattern (high reuse, prevents recurring bloat)
- Retain: multi-LLM consensus gate pattern (high reuse for architectural decisions)
- Retain: memory-audit sensor/controller pattern (high reuse for maintenance workflows)
- Archive: specific file count numbers (low retrieval value; specific to this session state)

---

## Session CWD in Pruned Worktree Breaks ALL Hooks (2026-03-17) [Task 5 reflection]

**[CRITICAL] Hook MODULE_NOT_FOUND: Cause and Prevention**

- When an agent session's CWD is inside a git worktree that has since been pruned/deleted, ALL hooks fail with MODULE_NOT_FOUND because `require()` paths resolve relative to the (now-deleted) CWD
- Symptoms: every hook exits with error, lint/test/format runs interrupted, task completes partially
- Prevention: before spawning agents in worktrees, verify the worktree still exists via `git worktree list`
- Recovery: re-run interrupted commands (lint/test/format) from the main repo root after confirming CWD is valid
- Related: test suite and format runs from 2026-03-17 session were interrupted by this failure; need re-run from main

---

## Research Pipeline Completion & Reflection (2026-03-18) [Batch 8 reflections]

**[WORKFLOW] Multi-Agent Research Pipeline Lifecycle**

- Full research pipeline on external frameworks (BMAD, GSD, CrewAI, +5 secondary) completed with 8 sequential research tasks
- Task 1: Repository discovery (8 repos cloned)
- Tasks 2-4: Parallel deep-dive analysis per framework (BMAD: 9 agents/34 workflows, GSD: 12 features, CrewAI: 14 features)
- Task 5: Secondary repository analysis (5 additional repos)
- Task 6: Feature consolidation (47 features across all frameworks, P0-P3 priorities)
- Task 7: External LLM review (Gemini+Codex validation), plan refinement (14 changes), DAG memory structure demoted
- Task 8: Architecture approval (30 GO features, 17 deferred, 5-phase 16-week timeline)
- Total: ~51 raw features → 47 verified features after review gates

**[PATTERN] Atomic Handshake for Reflection Batches**

- Reflection queue processed atomically: each reflection-task marked `completed` with `processedReflectionIds` array
- Enables reflection-cleanup.cjs to remove processed entries from queue without race conditions
- Required for long-running pipelines that spawn multiple background tasks with reflection requirements
- Pattern: TaskUpdate({ status: 'completed', metadata: { processedReflectionIds: [...] } })

**[INSIGHT] Research Pipeline Quality Gates**

- Multi-LLM review (Gemini + Codex) as post-synthesis gate → caught 14+ inconsistencies
- Feature count validation (51 raw → 47 verified) requires explicit de-duplication step
- Timeline overestimate risk identified: complex frameworks need +30-50% buffer
- DAG-based memory structure (tasks → subtasks → features) useful for tracking but overkill for flat feature lists; recommend file-based consolidation for future pipelines

---

## 8-Framework Analysis Pipeline Pattern (2026-03-17) [Tasks 4-7, batch reflection]

**[WORKFLOW] Multi-Framework Research → Synthesis → Multi-LLM Review → Architect GO**

- Pipeline: clone/read 8 frameworks → deep-dive researchers (parallel) → synthesizer → Codex+Gemini review → architect review → implementation plan
- This pattern extracts 51 raw features that compress to 47 verified features after multi-LLM review
- Feature count discrepancy detection: Codex found 61 vs claimed 51 — root cause was Codex counting sub-items as features. Resolution: re-count from primary source, confirm with Gemini
- Architecture contradiction detection: H1 (skill invocation via Skill() tool) conflicts with "auto-discovery" concept from frameworks; resolution: preserve mandatory Skill() invocation, deprecate auto-discovery
- Multi-LLM review gate is highly effective — both Gemini and Codex independently read actual repo files before commenting (not hallucinated), producing concrete actionable feedback
- Key Gemini+Codex consensus items from 2026-03-17 session: (1) add repo map generation, (2) use token-budget gate not file count, (3) need synthesis agent for cross-cutting concerns

**[WORKFLOW] Feature Planning: 5-Phase Over 47 Features**

- Architect GO at 47 features / 5 phases — plan at `.claude/context/plans/framework-upgrade-plan-2026-03-17.md`
- Phase buffer: timeline +30-50% vs initial estimate (multi-LLM review identified scope underestimation)
- Priority adjustments from review: D1 P0→P1, C1 P0→P1, A2 P1→P0, D8 P1→P0

---

## Closed-Loop Evolution Trigger Implementation (2026-03-17) [Task 11, commit a681c4df]

**[FRAMEWORK] reflection-agent Step 5.7: Score-Triggered Agent Evolution**

- Step 5.7 added to reflection-agent: uses `reflection-score-tracker.cjs` to check consecutive low scores (threshold: 3)
- On 3+ consecutive lows: queues agent-updater evolution request to `.claude/context/runtime/reflection-spawn-request.json`
- Circuit breaker: `isEvolutionEligible()` enforces 24h cooldown per agent (prevents thrashing)
- Protected agents (NEVER auto-evolve): router, planner, master-orchestrator, evolution-orchestrator
- Score trend reporting: declining → `[TREND-ALERT]` to learnings.md; improving/stable → no action
- Companion files: `reflection-score-tracker.cjs` + `tests/lib/reflection-score-tracker.test.cjs` (17 tests, all passing)
- Validation passed: lint + format + 17 tests green before commit

---

## Codebase Exploration Skill: 7-Phase Protocol (2026-03-17) [Task 12, 14, commits b7ec5577/3c01f782/1f5e6583]

**[CODE] codebase-exploration skill creation pipeline**

- Skill created at `.claude/skills/codebase-exploration/SKILL.md` (7-phase protocol)
- Phase progression: (1) token budget assessment, (2) repo map, (3) entry point identification, (4) dependency graph, (5) hot module identification, (6) targeted deep reads, (7) synthesis
- Key LLM-agent codebase exploration research (task 12): synthesized 12+ sources incl. SWE-bench, LocAgent, Complexity Trap, Aider, Cursor, OpenHands → 6-phase protocol with token budgets
- Post-Gemini/Codex review upgrades: repo map generation added, token-budget gate replaces file-count gate, synthesis agent for cross-cutting concerns
- Researcher + artifact-integrator agents updated to use smart exploration integration (commits 3c01f782, 1f5e6583)
- Pattern: research (task 12) → multi-LLM review (task 13) → implementation (task 14) is a proven 3-step creator flow

---

## Worktree Hook MODULE_NOT_FOUND — SYSTEMIC Pattern (2026-03-17) [Multiple tasks]

**[INFRA] Stop/Pre/PostToolUse hooks fail with MODULE_NOT_FOUND after worktree deletion**

- Root cause: Claude Code caches CWD at session start; worktree deletion breaks relative path resolution
- Pattern: appears in EVERY task reflection in 2026-03-17 session (tasks 11, 12, 13, 14) — confirmed systemic
- Non-blocking (hooks error, don't crash the session) but noisy
- Fix: start fresh session after worktree cleanup; do not rely on hook registration in worktree-aware sessions
- Source agent: router (agent-a3ba653c worktree cleanup context)

---

## Telegram UX EPIC Waves 1-2 (2026-03-16) [Task #13, commits 4529e28a + 4752d04a]

**Agent:** nodejs-pro | **Status:** Waves 1-2 complete, Waves 3-5 in fresh session

### [CODE] Async Telegram Outbox Pattern

- `invokeClaude()` (spawnSync) → `invokeClaudeAsync()` (spawn + SIGTERM guard) is a clean 1-file refactor in `.claude/tools/cli/telegram-claude-bridge.cjs`
- Pattern: async spawn writes result atomically to `telegram-outbox.json`; `processOutbox()` delivers on next poll tick
- Keep sync version for backward-compat and `resolveClaude` use; only the `handleAsk` path goes async
- Fire-and-forget + immediate "Processing…" ACK keeps polling loop unblocked
- Apply when any CLI tool needs to background Claude invocations

### [CODE] InlineKeyboardMarkup Without grammy

- Telegram `reply_markup` JSON works via raw HTTPS `sendMessage` with `JSON.stringify({ inline_keyboard: [...] })`
- No grammy dependency needed for cron-polled scripts; saves runtime overhead
- `callback_data` format: `cmd_{command}_{args}` (max 64 bytes — enforce byte-length in builder, not just string length)
- `answerCallbackQuery(callbackQueryId)` is required by Telegram API (acknowledgment within 10s or warning shown to user)
- Benchmarked against OpenClaw's `TelegramInlineButtons` pattern in `.claude.archive/.tmp/openclaw-main/src/telegram/`
- Reference: `.claude/tools/cli/telegram-poll.cjs` (commit 4752d04a)

### [WORKFLOW] Module Consolidation vs Plan — Pragmatic Deviation

- Plan specified 3 new modules: `telegram-async-worker.cjs`, `telegram-keyboards.cjs`, `telegram-callback-handler.cjs`
- Implementation consolidated into existing files: `telegram-claude-bridge.cjs` (async) and `telegram-poll.cjs` (keyboards + callbacks)
- This is acceptable for a cron script with 621 LOC — separate modules add overhead without benefit at this scale
- For Waves 3-5: voice handler and file handler SHOULD be separate modules (different concerns, testable independently)
- Pattern: Planner creates modular designs; implementer consolidates when the total is under ~800 LOC. Document deviation in commit message.

### [WORKFLOW] Plan File Staleness — Recurring Pattern

- Executing agent committed Waves 1-2 but left ALL plan tasks marked `- [ ]` in `.claude/context/plans/telegram-ux-epic-plan-2026-03-16.md`
- This is the 3rd recurrence across sessions (matches reflection rubric staleness check)
- Root cause: agent marks TaskUpdate(completed) BEFORE updating plan file markers
- Fix: plan file update (`[ ] → [x]`) must happen BEFORE `TaskUpdate(completed)` — see `.claude/rules/plan-file-update.md`
- Systemic issue logged to issues.md

---

## Batch Reflection: 2026-03-16 Session Tasks 2,7,9,10,11,13,14 (commits aa60d32e, 23f678a2)

- `evolution-check.cjs QUEUED_ACTIONS: 1` appeared in ALL 8 reflections — this is a persistent background signal, not a per-task incident; treat as informational unless it reaches >= 3 consecutive sessions
- Plan file staleness (markers staying `[ ]` after task completion) recurred for the 3rd time — systemic; root cause is `TaskUpdate(completed)` called before plan file Edit; enforce order: plan Edit first, then TaskUpdate
- External CLI review gate (task 7): when CLIs prompt for input, architect approval is a sufficient substitute review gate
- Context Window Monitor hook delivered via TDD with 5/5 tests — TDD pattern confirmed effective for hooks

## Mission Mode Governance Repair (2026-03-16) [Task #23]

**Agent:** developer | **Status:** Completed

### Mission Orchestrator Implementation

The Mission Orchestrator components have been scaffolded and the baseline test runner verification system is active.

Key governance actions taken:

- Added `start-mission` workflow to `CLAUDE.md`, `WORKFLOW_CATALOG.md`, `workflow-registry.json`, and `@WORKFLOW_AGENT_MAP.md`.
- Added `system-health-check` skill to `@SKILL_CATALOG_TABLE.md` and registered it to the `master-orchestrator.md`.
- Added `mission/` templates to `templates/README.md` and `template-catalog.md` (`CONTINUATION_PLAN.md`, `INVARIANTS.md`, `ANTI_GOALS.md`).
- Established mapping between `start-mission` workflow and `master-orchestrator`.

---

## Model Selection Context Window Guidance (2026-03-16) [Task #21]**Pattern: Large-context routing threshold for opus model selection**

- Opus (1M context) is appropriate when executing agent may need >150K tokens in working context
- Concrete use cases: analysis of very large codebases (>150K source tokens), long document processing, ingestion-before-synthesis tasks
- Planner agents should explicitly recommend `model: 'opus'` in plan output when decomposing such tasks
- Router should set `model: 'opus'` explicitly in Task() call — do not rely on defaults for large-context loads
- Cross-reference: CLAUDE.md Section 8 memory budget thresholds (80K/120K/150K tokens) align with this guidance

**Issue to watch**: @MODEL_SELECTION.md now has two sets of model IDs — 4-6 IDs in Context Window table vs 4-5 IDs in Agent Config Examples. Verify `normalizeModel()` in agent-config-reader.cjs handles both.

---

- Created new agent: memory-manager (2026-03-19)
