## Ecosystem Audit Remediation (2026-03-20) [Task 8 Reflection]

**[PATTERN] Fail-Open vs Fail-Closed Hook Exit Codes**

When a hook makes a security decision (allow vs block), exit code choice is critical:

- `exit(0)`: Allow or warn — safe to fail open on unexpected errors
- `exit(2)`: Block or deny — must fail CLOSED on unexpected errors

Example: evolution-state-guard.cjs checks evolution lock. If lock-held condition returns `exit(0)`, concurrent evolutions proceed (bypass). Must use `exit(2)` to block concurrency violation.

Found in: ecosystem-audit-task-8 (commit 108819dc). Violations fixed on lines 314, 347.
Severity: CRITICAL (SEC-008 compliance)
Reuse: HIGH — applies to all future hooks implementing security/concurrency controls

---

**[GOTCHA] Context Bloat: Rules Files Kill Agent Working Context**

Claude Code auto-injects all `.claude/rules/*.md` files into every agent spawn. This codebase had 141 rules files (857KB = ~200K tokens), leaving agents near-zero working context.

Symptoms: agents fail with "Prompt is too long" at 0 tool uses; architect/code-reviewer agents exhaust context after 40-50 tool calls; only lightweight agents (explore, researcher) complete successfully.

Root cause: Domain-specific rules (database-architect.md 11KB, ripgrep.md 14KB, plugin-development.md 11KB) should be skills (loaded on-demand), not always-on rules.

Mitigation: Keep ~15 universal rules (~50KB), convert 126 domain rules to skills (~806KB loaded on-demand).
Expected impact: agent spawn context 200K→30K tokens, working context nearly-zero→170K+ tokens.

Found in: critical-rules-bloat-finding.md (ecosystem-audit-task-8)
Priority: P0 (affects agent completion rates)

---

**[GOTCHA] Debounce Counters Ineffective in Ephemeral Hooks**

Attempted to rate-limit hook warnings in context-monitor.cjs via counter: `toolUsesSinceLastWarning++` with `if (counter >= 5) warn`.

The counter is declared at module level but hooks exit immediately after one invocation. State is never persisted, so counter always resets to 0 on next hook call.

Result: debounce never triggers; counter serves no purpose.
Solution: Remove the counter. Accept that all warnings fire (acceptable for context monitoring).

Lesson: Hooks are ephemeral (live for one tool use). Don't use in-process state for persistence. Use external state (files, env) or accept stateless behavior.

Found in: ecosystem-audit-task-8 (context-monitor.cjs debounce logic removed)

---

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

## Ecosystem Audit Remediation Fixes (2026-03-20) [Task 10 & 1 reflections]

**[PATTERN] safeParseJSON API Contract & Implementation**

The `safeParseJSON()` utility from `.claude/lib/utils/safe-json.cjs` has a specific parameter order that differs from intuitive expectations:

- **Signature**: `safeParseJSON(jsonString, schemaName, validationFn?, fallbackDefaults)`
- **Return**: Parsed value directly (NOT `{ success, data, error }`)
- **Second param**: schemaName is for logging/diagnostics, not validation
- **Fourth param**: fallbackDefaults are returned on parse failure
- **Handles**: Malformed JSON (returns fallback), prototype pollution (strips **proto**), circular references

Violations found: 3x raw `JSON.parse()` in `lancedb-client-impl.cjs` (Task 10)
Fix: Replaced with `safeParseJSON(json, "lancedb-config", null, {})`
Pattern reuse: HIGH — all hook input parsing, memory I/O, config loading must use safeParseJSON
Priority: CRITICAL (SEC-005 compliance)

---

**[GOTCHA] Model ID Staleness in Test Fixtures**

Test fixtures hardcode model IDs without update automation. Over time, model IDs deprecate but tests continue using old IDs, causing:

- Type mismatches with actual API responses
- Test-specific model-routing inconsistencies
- Silent failures when fixture models diverge from production

Examples:

- `claude-opus-4` (old) → `claude-opus-4-6` (current)
- `claude-3-sonnet` (old) → `claude-3-5-sonnet-20241022` (current)

Found in: `config-model-validator.test.cjs` (Task 10)
Mitigation: Use environment variable lookup in tests: `process.env.DEFAULT_MODEL || 'claude-opus-4-6'`
Pattern reuse: MEDIUM — apply to all agent/config tests that validate model selection logic

---

**[GOTCHA] Worktree Agent Context Pressure with Large CLAUDE.md**

Worktree agents receive full CLAUDE.md as system context. For heavyweight agents (architect, planner, security-architect), this can cause:

- "prompt is too long" rejection at spawn time (before first tool use)
- Context already exhausted before agent can work
- Workaround tasks stuck indefinitely, visible to Router as "orphaned"

Root cause: CLAUDE.md is comprehensive (~280KB = 70K+ tokens) to support all agents/orchestrators.
Workaround: Use non-worktree agents for large prompt jobs, OR use lighter agent types (haiku) when worktree is necessary.

Found in: Task 10 ecosystem audit (worktree agent context exceeded)
Pattern reuse: MEDIUM — document in spawn templates, recommend non-worktree for complex tasks

---

## Session Handoff Regex Patterns & Resume Prompt Instrumentation (2026-03-19) [Task 10 reflection]

**[PATTERN] NEXT ACTION Header Detection in Session Handoff**

- `spawn-new-session.cjs` had regex that only matched `**bold:** format` for NEXT ACTION extraction
- This caused handoff parser to fall back to generic "continue previous work" prompt, missing specific pending work
- Fix: regex now matches `## H2` headers via `^\s*##\s+NEXT\s+ACTION` pattern
- Key learning: session handoff prompts must be robust to multiple formatting styles (markdown headers are more stable than inline bold)
- Pattern: structured markdown headers (## NEXT ACTION) are more reliable than prose markers (**bold:**) in multi-agent pipelines

**[PATTERN] Resume Prompt Explicit Instrumentation**

- `session-handoff.cjs` resumePrompt now explicitly says "execute ALL pending tasks in the queue"
- Previous version: vague language ("continue" / "resume") led to agents pausing work prematurely
- Fix: explicit instruction "Execute ALL tasks" removes ambiguity
- Pattern: session handoff prompts must use imperative language, not suggestive language, when work is pending
- Instruction clarity directly impacts whether spawned agents complete the full pipeline vs stopping early

**[CURATION] Decisions**

- Retain: regex pattern for H2 header matching (reusable across other handoff implementations)
- Retain: explicit instrumentation pattern (applicable to all session handoff contexts)
- Archive: specific session-handoff.cjs line numbers (implementation detail, not reusable guidance)

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

## 2026-03-19 — Router Compliance Audit (wave-2c-router-compliance)

**Gates 0-5: Enforced.** Gates 0 (reflection), 1 (planner-first), 2 (security), 3 (tool lockdown), 4 (creator guard), 5 (architect-first) all have mechanical hook enforcement.

**Gate 6 (Proactive Audit): NOT enforced by hooks.** Relies entirely on router instruction-following. No PostToolUse hook detects framework path changes and triggers QA spawn.

**MCP tool lockdown gap:** settings.json lockdown matcher only lists 5 specific MCP filesystem tools. Any MCP tool from a future MCP server (browser, github, exa) would bypass router-tool-lockdown.cjs. Currently no risk because mcpServers is empty, but fragile.

**NotebookEdit missing from lockdown matcher:** unified-creator-guard.cjs covers NotebookEdit but router-tool-lockdown.cjs does not.

**Specialist keyword map incomplete:** master-orchestrator, advanced-debugging, heartbeat-orchestrator, task-manager, memory-manager have no keyword entries in SPECIALIST_KEYWORD_MAP — routing for those agent types is not mechanically enforced against "developer" misrouting.

**Report:** `.claude/context/reports/router-compliance-2026-03-19.md`

## LSP Best Practices vs lsp-navigator Gap Analysis (2026-03-19) [Task wave-4b-lsp-research]

**Source**: `.claude/context/reports/lsp-research-2026-03-19.md`

Key gaps found:

- GAP-1 (P1): lsp-navigator skill missing `getDiagnostics` — industry standard is edit→diagnose loop
- GAP-2 (P1): lsp-navigator skill missing `codeActions` and `rename` — Cursor/Windsurf/Kiro/Claude Code 2.0.74+ all expose these
- GAP-3 (P2): No LSP-over-MCP bridge fallback (LSAP standard emerging at github.com/lsp-client/LSAP)
- GAP-5 (P3): CJS pre-check guideline missing — agents find out reactively after empty results
  Strengths: layered search hierarchy, agent-specific contracts, documented CJS limitation, Windows path normalization

- Created new agent: qa-guardian (2026-03-19)

- Created new agent: contract-check (2026-03-19)

- Created new agent: bool-action (2026-03-19)

- Created new agent: repo-onboarder (2026-03-19)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-19)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-19)

- Updated workflow: evolution-workflow (2026-03-19)

- Updated workflow: missing-workflow-xyz (2026-03-19)

- Created new agent: qa-guardian (2026-03-19)

- Created new agent: contract-check (2026-03-19)

- Created new agent: bool-action (2026-03-19)

- Created new agent: repo-onboarder (2026-03-19)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-19)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-19)

- Updated workflow: evolution-workflow (2026-03-19)

- Updated workflow: missing-workflow-xyz (2026-03-19)

## Full Memory Health Audit Complete (2026-03-19) [Health Score: 78/100]

**[AUDIT] Comprehensive Memory System Health Check**

- Full memory audit completed: 7.8MB directory with 109 files across all subsystems
- Core metrics: learnings.md ~250 lines, decisions.md ~200 lines, issues.md ~317 lines — all within healthy ranges
- JSON stores healthy: gotchas.json (13), patterns.json (43), discoveries.json (349), access-stats.json, codebase_map.json (84KB, under 500-entry cap)
- Archive structure sound: 12 files showing proper monthly/dated rotation pattern. Archive snapshot activity is normal behavior, not bloat.
- CC auto-memory: 51 lines, 24 files — healthy index of user feedback patterns with zero orphans
- Cross-system dedup: ZERO duplicates detected between CC auto-memory and agent-studio stores. Proper architectural separation maintained.
- Named memory API: Correctly deprecated with DEPRECATED.md notice and clear RFC pathway. 70+ unused library modules support the API but feature has zero usage.
- Session tiers: STM/MTM/LTM directory structure properly initialized and maintained
- Staleness check: No active memory entries older than 30 days. All archival properly segregated.
- Report: .claude/context/reports/backend/memory-health-audit-2026-03-19.md with detailed scoring and recommendations
- Recommendations: (1) Monitor codebase_map.json for rapid growth (2) Named memory RFC when deprecation timeline is finalized (3) Archive rotation monitoring if directory exceeds 20MB

**[PATTERN] Memory audit as routine health check**

- Memory system is well-maintained with robust rotation and archival patterns
- Archive snapshot activity represents normal monthly/dated rotation — no remediation needed
- Regular health audits (every 2 weeks) recommended to maintain this state
- System supports 5+ years of memory accumulation at current growth rate

**[DECISION] Archive snapshot strategy**

- Multiple snapshots per month in archive/ is correct behavior
- Represents checkpoints during weekly/daily rotation cycles
- Do not consolidate or delete snapshot files — they provide audit trail
- Monitor total archive size quarterly; implement cold storage if exceeds 20MB/month

## [2026-03-19] TDD Skill Gap Analysis

- Internal TDD skill v1.3.0 LEADS industry on: TDP (verbatim test injection), multi-agent decomposition (qa→dev→reflection), anti-test-hacking checks, session-persistent state, bounded repair loops
- P0 gap: No contract/schema-based assertions for AI agent output testing (Zod/JSON Schema pattern)
- P1 gaps: behavior vs implementation-detail anti-patterns, cross-session flakiness tracking, property-based testing guidance
- Report: .claude/context/reports/backend/tdd-gap-analysis-2026-03-19.md

## [2026-03-19] Security Hook Exit Code Audit Pattern

When auditing security hooks for fail-closed compliance, grep ALL hooks — not just the one under review. The C-01 evolution-state-guard finding revealed that router-tool-lockdown.cjs and write-pretool-bundle.cjs may share the same exit(0) anti-pattern on block paths. A single targeted grep covers the full surface:

```bash
grep -rn "process.exit(0)" .claude/hooks/ | grep -v "# " | grep -v "//"
```

Cross-reference with the hooks that are classified as security hooks (fail-closed policy per hooks.md).

## [2026-03-19] H-01 False Positive Pattern: JSDoc vs Runtime

When a threshold mismatch is reported between "default" and "documented" values, always check:

1. The JSDoc @param default (may be stale documentation)
2. The actual runtime default in the destructuring assignment
3. The named constant used

In memory-rotator.cjs: JSDoc says 20KB, runtime constant DEFAULT_THRESHOLD_KB = 40KB. Severity was HIGH but actual runtime is correct — only JSDoc needs fixing.

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-20)

- Created new agent: qa-guardian (2026-03-20)

- Updated workflow: evolution-workflow (2026-03-20)

- Updated workflow: missing-workflow-xyz (2026-03-20)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-20)

- Created new agent: contract-check (2026-03-20)

- Created new agent: bool-action (2026-03-20)

- Created new agent: repo-onboarder (2026-03-20)

## TDD Skill Gap Analysis (2026-03-20, Task #7)

- Internal TDD skill v1.3.0 is at/above 2026 industry standards
- Two LOW-severity gaps: (1) missing agent-evaluation skill cross-ref in AI Output Evaluation section; (2) LSP Pre-RED gate should be MANDATORY for existing APIs, OPTIONAL for new
- Stryker 7.0 supports Vitest; v9.0.1 adds partial browser mode support (still not full)
- Report: .claude/context/artifacts/research-reports/tdd-2026-research-2026-03-20.md

## 2026-03-20 — safeParseJSON Catch Block Behavior After Migration

When replacing `JSON.parse()` with `safeParseJSON(content, null, null, null)`, the surrounding try/catch becomes dead code for JSON parse failures (safeParseJSON handles them internally and never throws for that case). However, the catch is NOT fully dead — it still fires for: (a) non-string inputs, (b) RangeError on structuredClone, (c) stderr write errors. Keep catch blocks as defense-in-depth, or annotate as `// defensive — safeParseJSON handles JSON errors; catch is for edge cases`.

When inlineDefaults are provided (e.g., `{ raw: r.metadata }`), the catch block that assigns the same fallback is redundant for JSON errors but not fully dead. Worth annotating.

safeParseJSON returns Object.create(null) — safe for `typeof x.prop` checks, but breaks `obj.hasOwnProperty()`. Use `Object.prototype.hasOwnProperty.call(obj, key)` or `'key' in obj` instead.
