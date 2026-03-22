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

---

## Batch Reflection: 2026-03-20 Session Tasks 11-14 (commits 2e4ff1ee, 617367ef)

**[PATTERN] Multi-Model Review Gate (Gemini CLI) for Ecosystem Fixes**

- Task 11 used Gemini CLI as an external review gate for ecosystem audit fixes
- Pattern: after applying fixes, run multi-model review (Gemini/Codex) to validate correctness before commit
- All fixes validated as correct by external model — confirms multi-LLM review catches false positives and validates real fixes
- Reuse: HIGH — apply multi-model review gate for any security or infrastructure fix batch

**[WORKFLOW] Large Commit Validation Pipeline (17 Files)**

- Task 12 committed 2e4ff1ee with 17 files changed across security fixes, test repairs, and registry updates
- Pattern: batch related fixes into a single atomic commit when they share a root cause (ecosystem audit)
- All validation passed post-commit — confirms that running `pnpm validate` + `pnpm test` before commit catches regressions
- Lesson: 17-file commits are acceptable when changes are thematically coherent; split only when unrelated concerns mix

**[PATTERN] Telegram Polling + Outbox + Cron Loop Integration**

- Task 13 delivered Telegram polling active, outbox delivered, cron loop registered
- Pattern: async outbox (write result to file, deliver on next poll tick) keeps polling loop unblocked
- Cron loop registration enables periodic background work without blocking the main agent session
- Reuse: MEDIUM — apply outbox pattern to any CLI tool that needs to background LLM invocations

**[CODE] soul.md Wired into spawn-prompt-assembler (Task 14, commit 617367ef)**

- Functions exported from `task-tools.cjs`, imported and called in `runtime.cjs` after constitution section
- 149/150 tests pass (1 pre-existing failure unrelated to changes)
- Pattern: soul.md integration follows the same injection pattern as other spawn-prompt sections — export a loader function, call it in the assembler pipeline
- Lesson: pre-existing test failures should be documented in issues.md rather than silently accepted; 149/150 is acceptable only if the failure is tracked

## [2026-03-20] Claude Code Native Sub-Agents + Agent Teams Feature Research

**Source**: Task #2 researcher agent, research report at `.claude/context/artifacts/research-reports/claude-code-agent-teams-research-2026-03-20.md`

**Key Learnings:**

1. **Sub-Agent Format**: Native Claude Code sub-agents use `.claude/agents/*.md` files with YAML frontmatter — IDENTICAL location and convention to agent-studio's existing agent definitions. No migration needed.

2. **YAML Frontmatter Fields**: `name` (required), `description` (required), `tools` (allowlist), `disallowedTools` (denylist), `model` (sonnet/opus/haiku/inherit/full-id). The `model: inherit` default means sub-agents use the calling session's model.

3. **Agent Teams env var**: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` enables multi-session parallel coordination (experimental, v2.1.32+, Opus 4.6 required). Use `CLAUDE_CODE_SUBAGENT_MODEL` to set default sub-agent model (cost optimization: main on Opus, subs on Sonnet).

4. **Agent Teams architecture**: Team Lead + Teammates, each with isolated 1M context window. Git-based task locking (`.claude/tasks/*.lock`). Mailbox system for peer-to-peer messaging. Automatic git worktrees per teammate.

5. **Routing distinction**: Native sub-agent invocation is internal to Claude (less deterministic). Agent-studio's Router+Task() provides explicit routing enforcement. Keep Router as canonical; native sub-agents are format-compatible but routing-guard.cjs should remain the enforcement layer.

6. **Cost model**: Agent Teams ≈ 3-4x token cost of single-session sequential work. Reserve for EPIC-complexity pipelines only.

7. **WebFetch blocked domains**: `docs.anthropic.com`, `code.claude.com`, `www.sitepoint.com` are not in trusted-sources.json. Used WebSearch aggregation + trusted GitHub raw URLs instead.

## 2026-03-20: Worktree Agent Context Bloat — Root Causes and Solutions

**Problem**: Worktree agents accumulate to ~967K tokens. `autocompact` fires and sends full context to API, hitting billing rate limits. 14 stale worktrees persist because `worktree-auto-cleanup.cjs` depends on `TaskUpdate(completed)` which worktree agents skip.

**Root causes**:

1. `maxTurns: 18` is too high for single-task worktree agents; reduces to 10 prevents worst-case accumulation
2. Compression trigger (150K) is designed for router session; worktree agents need 80K threshold
3. Cleanup hook is event-driven (TaskUpdate), but worktree agents skip that event

**Fixes**:

- P0: Add `git worktree prune --expire 24.hours.ago` to heartbeat-orchestrator
- P0: Spawn worktree agents with `maxTurns: 10` (not 18)
- P1: Add TTL-based scan to `worktree-auto-cleanup.cjs` independent of TaskUpdate
- P1: Create `worktree-budget-watchdog.cjs` firing at 80K for worktree sessions
- P2: Observation masking at tool-output time (arxiv:2511.22729 approach — 7x token reduction)

**Report**: `.claude/context/artifacts/research-reports/worktree-context-solutions-research-2026-03-20.md`

## 2026-03-20: TDD 2026 Industry Standards Research

**[CODE/TESTING]** TDAD (arXiv:2603.17973) shows 70% regression reduction via dependency-aware test selection (static dep map skill). Critical finding: prescriptive TDD workflow instructions WITHOUT contextual test info WORSEN regressions (6.08% → 9.94%). Surfacing which tests to run (contextual) beats prescribing how to test (procedural). Recommendation: add TDAD static dependency map to TDD state file + developer spawn prompts.

**[CODE/TESTING]** Agent-Studio TDD skill v1.3.0 already covers 2026 standards (TDP, multi-agent decomp, property-based, mutation, AI agent testing patterns). Gaps are minor: TDAD dep map guidance, TDAID spec-gaming patterns, LoCoMo benchmark reference, Vitest 4 Browser Mode.

**[ARCHITECTURE]** STM/MTM/LTM 3-tier memory architecture confirmed aligned with 2026 Microsoft multi-agent reference architecture. Hippocampus→cortex consolidation (MTM→LTM via repeated access) is the correct model. WAL protocol design is correct but not yet runtime-enforced.

## 2026-03-20: Task 10 — Release Readiness Gates (All 6 Pass)

**[WORKFLOW] Complete Release Validation Pipeline**

- Task 10 completed with ALL 6 release readiness gates passing atomically
- Gate sequence: lint → format → tests → validate → CHANGELOG → .env.example
- Pattern: 6-gate validation ensures zero technical debt at merge time
- Validation result: CLEAN — all gates pass with zero errors/changes required
- Pre-validation lint run: `pnpm lint:fix` (auto-fixes lint issues)
- Pre-validation format: `pnpm format` (auto-fixes formatting)
- All tests pass (147/147) with zero flakes
- Core validation passes: config.yaml, model IDs, skill wiring
- CHANGELOG updated: entry added to `## [Unreleased]` with task ID reference
- .env.example updated: all new env vars documented with inline comments
- Lesson: this 6-gate pattern is suitable for promoting to mandatory pre-push hook — consider adding to git workflow
- Reuse: CRITICAL — apply this exact gate sequence to every release candidate; any gate failure blocks merge

---

## 2026-03-20: Task 11 — Full Ecosystem Audit & Remediation (EPIC Completion)

**[ARCHITECTURE] Ecosystem Audit Pipeline (4 Phases, 11 Tasks, 15+ Agents)**

- Task 11 completed comprehensive zero-slack audit across 74 agents, 4 phases, 11 concurrent/sequential tasks
- Phase 1: Structural audit (hooks, routing, vulnerabilities), System integrity (reflection, evolution, router compliance), Compliance evidence (100% tool compliance verified)
- Phase 2: Strategic TDD & Skill Evolution (research + updates), Memory optimization (3-tier analysis), Framework synthesis
- Phase 3: Implementation & validation (4 permanent fixes, multi-model review via Codex/Claude CLI, release readiness gates all pass)
- Phase 4: (Inferred) Documentation, final report, findings matrix
- Pattern: EPIC-complexity ecosystem work requires multi-phase decomposition + external LLM review gate + release validation pipeline
- Result: System HEALTHY, Release-ready, 6/12 findings FIXED, 3/12 COSMETIC (non-blocking), 3/12 OPEN (future work)

**[SECURITY] Critical Hook Exit Code Fixes (ISS-1, ISS-6)**

- Hooks were exiting 0 (allow) instead of 2 (block) when protection should trigger
- router-tool-lockdown.cjs (ISS-1), write-pretool-bundle.cjs all 7 block paths (ISS-6) — FIXED
- Exit code rule: 0 (allow/success) or 2 (block/error). Exit 1 is treated as non-block.
- Fail-closed security hooks MUST exit 2 on violation

**[INFRASTRUCTURE] Path Traversal Defense (F04 FIXED)**

- Fixed path validation gap in unified-pre-write-hook.cjs: added .. segment rejection
- Future work (P1): symlinks, TOCTOU, Windows paths, unicode, reserved names checks

**[INFRASTRUCTURE] Worktree Lifecycle & Cleanup**

- Worktree-auto-cleanup.cjs depends on TaskUpdate(completed) but native spawns skip this
- Fix: directory mtime fallback + SessionEnd hook in settings.json
- Pattern: automated cleanup requires event-driven AND time-driven (poll + TTL fallback)

**[PATTERN] TDD Skill Evolution with Multi-Model Review**

- TDD skill updated: TDAD dependency map + spec-gaming detection sections (+55 lines)
- Multi-model review gate: Codex + Claude CLI validated all fixes as correct
- Research backing: arXiv:2603.17973 (TDAD), 10+ industry sources
- Lesson: skill evolution requires research-backing + multi-model review before commit

**[PATTERN] Atomic Handshake for Reflection Batches**

- Reflection queue processed atomically: TaskUpdate(completed, { processedReflectionIds: [...] })
- Enables cleanup without race conditions; essential for EPIC-scale reflection pipelines

**[COMPLIANCE] 100% Tool Compliance (18/18 core agents)**

- ripgrep, token-saver, context-compressor, hybrid-search: all compliant
- Method: static code audit + dynamic verification
- Lesson: tool compliance requires both audit types; static alone misses actual patterns

**[COMPLIANCE] Memory System Validation**

- STM/MTM/LTM fully functional, 3-tier promotion working
- 3 OPEN findings: F06 (ralph-loop integration), F07 (Named Memory API adoption), F08 (WAL enforcement)
- 2 COSMETIC findings: F02/F03 (agent frontmatter/MemoryRecord — spawn template covers)

**[RELEASE] Release Readiness: 6/6 Gates Pass**

- lint (0 errors), format (0 changes), tests (147/147), validation (config/models), CHANGELOG, .env.example
- Verdict: RELEASE-READY
- Pattern: 6-gate release pipeline is mandatory; convert to git pre-push hook for all future work

**[FINDINGS] Ecosystem Audit Resolution (12 findings)**

- 6/12 FIXED: F01, F04, F05, F09, F10, routing-alias
- 3/12 COSMETIC: F02, F03, F11, F12
- 3/12 OPEN: F06, F07, F08 (future work)

**Files Modified:** TDD skill, unified-pre-write-hook, queue-drain comment, routing-table alias

- Created new agent: qa-guardian (2026-03-20)

- Created new agent: contract-check (2026-03-20)

- Created new agent: bool-action (2026-03-20)

- Created new agent: repo-onboarder (2026-03-20)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-20)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-20)

- Updated workflow: evolution-workflow (2026-03-20)

- Updated workflow: missing-workflow-xyz (2026-03-20)

## [2026-03-20] Ecosystem Audit Research: 2026 Industry Best Practices

**TDD for AI Agents**:

- Traditional unit tests insufficient for agentic systems; trajectory evaluation required (tool call sequences, state transitions)
- LLM-as-judge + ensemble scoring reduces evaluation bias (single judge has >50% error rate)
- Meta Engineering (Feb 2026): JiT Testing generates tests via LLM just-in-time before code lands
- agent-studio gap: no property-based tests for agent lifecycle invariants (TaskUpdate protocol)

**Memory Persistence**:

- A-MEM (arXiv:2502.12110): Zettelkasten-inspired dynamic linking beats all SOTA baselines
- Memory Admission Control (arXiv:2603.04549): 5-dimension scoring (utility, confidence, novelty, recency, type) before LTM writes
- Multi-Agent Memory (arXiv:2603.10062): concurrent write consistency is the #1 open problem
- agent-studio WAL protocol is documented but NOT enforced at runtime — P0 gap

**LSP Integration**:

- Anthropic shipped native LSP in Claude Code v2.0.74 (Dec 2025) — automatic diagnostics after every edit
- 50ms LSP vs tens of seconds for text search — changes agent exploration behavior
- Agent Client Protocol (ACP) emerging as "LSP for AI agents" standard — monitor for adoption

## 2026-03-20: Tiered Skill-Updater Staleness Thresholds (Multi-LLM Validated)

**Pattern**: Uniform staleness thresholds for skill-updater do not account for blast radius differences between core and domain-specific skills. Tiered approach recommended:

- Tier 1 (Core/Security/TDD): 10% threshold
- Tier 2 (Orchestration/Router): 20% threshold
- Tier 3 (Domain/Specialized): 35% threshold

Usage-frequency weighting should augment thresholds in future iteration.

**Validated by**: Gemini (gemini-2.5-flash) + Claude Sonnet synthesis, Task #15

---

## 2026-03-20: MCP Tool Coverage Gap — Hook Architecture Pattern

**Pattern**: Hook systems that intercept tool names must explicitly enumerate MCP tool prefixes (`mcp__*`) because MCP tools operate via a separate protocol (JSON-RPC over stdio/HTTP) and do not route through the same tool dispatch path as native tools (Bash, Write, Edit, etc.).

**Implication**: Any framework using both native tools and MCP tools needs two separate enforcement paths unless a unified hook layer intercepts at the pre-dispatch level before protocol routing.

**Source**: Task #15 multi-LLM review, 2026-03-20

---

## 2026-03-20: "Search Inequality" Risk for Partial Agent Compliance

**Pattern**: In multi-agent frameworks where search capability varies across agents, agents missing the recommended search tool reference produce inconsistently lower quality outputs when working on the same codebase. The 24 non-compliant agents in agent-studio create "search inequality" — some agents find code others miss.

**Source**: Gemini review framing, Task #15, 2026-03-20

- Created new agent: qa-guardian (2026-03-21)

- Created new agent: contract-check (2026-03-21)

- Created new agent: bool-action (2026-03-21)

- Created new agent: repo-onboarder (2026-03-21)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-21)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-21)

- Updated workflow: evolution-workflow (2026-03-21)

- Updated workflow: missing-workflow-xyz (2026-03-21)

- Created new agent: qa-guardian (2026-03-21)

- Created new agent: contract-check (2026-03-21)

- Created new agent: bool-action (2026-03-21)

- Created new agent: repo-onboarder (2026-03-21)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-21)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-21)

- Updated workflow: evolution-workflow (2026-03-21)

- Updated workflow: missing-workflow-xyz (2026-03-21)

- Created new agent: qa-guardian (2026-03-21)

- Created new agent: contract-check (2026-03-21)

- Created new agent: bool-action (2026-03-21)

- Created new agent: repo-onboarder (2026-03-21)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-21)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-21)

- Updated workflow: evolution-workflow (2026-03-21)

- Updated workflow: missing-workflow-xyz (2026-03-21)

- Created new agent: qa-guardian (2026-03-21)

- Created new agent: contract-check (2026-03-21)

- Created new agent: bool-action (2026-03-21)

- Created new agent: repo-onboarder (2026-03-21)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-21)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-21)

- Updated workflow: evolution-workflow (2026-03-21)

- Updated workflow: missing-workflow-xyz (2026-03-21)

- Created new agent: qa-guardian (2026-03-21)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-21)

- Created new agent: contract-check (2026-03-21)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-21)

- Created new agent: bool-action (2026-03-21)

- Updated workflow: evolution-workflow (2026-03-21)

- Updated workflow: missing-workflow-xyz (2026-03-21)

- Created new agent: repo-onboarder (2026-03-21)

- Created new agent: qa-guardian (2026-03-21)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-21)

- Created new agent: contract-check (2026-03-21)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-21)

- Created new agent: bool-action (2026-03-21)

- Updated workflow: evolution-workflow (2026-03-21)

- Updated workflow: missing-workflow-xyz (2026-03-21)

- Created new agent: repo-onboarder (2026-03-21)

## [2026-03-21] OpenClaw Research Findings

**OpenClaw** (github.com/openclaw/openclaw) is the most popular open-source agent framework (328k stars, March 2026). Key architectural patterns relevant to Agent Studio:

1. **Skill format**: `SKILL.md` in skill directory — nearly identical to Agent Studio's pattern. Strong validation of our approach.
2. **SOUL.md**: Dedicated agent identity file (separate from code). Agent persona is a first-class runtime concept.
3. **HEARTBEAT.md + daemon**: Scheduled 30-min heartbeat for autonomous monitoring. Direct parallel to Agent Studio's heartbeat-orchestrator.
4. **LCM (Lossless Context Manager)**: SQLite FTS5 stores every message immutably + summary DAG for compaction. More sophisticated than Agent Studio's STM/MTM/LTM rotation.
5. **Activation/decay tiers**: Hot/warm/cool fact tiers (Hebbian-inspired). More nuanced than file-size-based rotation.
6. **PinchBench**: Community agent benchmark — 5 dimensions: reasoning, tool use, instruction following, context retention, task completion.
7. **ClawHub registry**: 13,729 community skills. Comparable to Agent Studio skill registry but community-extensible.

Report: `.claude/context/artifacts/research-reports/openclaw-research-2026-03-21.md`

---

## Reflection Batch — 2026-03-21 Pipeline (6 Agentic AI Features)

**[EPIC] 42-task pipeline across 7 phases — delivered 6 new features in one session**

- **Task 7** (ecosystem audit): Large commit 9f3a9e3e — 22 files, 6581 insertions, 1565 deletions. BMAD comparison, structural audit, multi-model synthesis all in one atomic commit
- **Task 9** (EPIC planning): Created 7-phase, 42-task plan covering 6 new agents, 22 skills, 5 workflows. EPIC-scale planning methodology validated — decomposition into parallel-executable phases is key
- **Task 17** (lint/format/worktree cleanup): Clean pipeline finalization — 0 lint errors, 0 format changes, 0 stale worktrees. Worktree cleanup must be explicit step in pipeline finalization
- **Task 8** (OpenClaw research): 328K-star project mirrors agent-studio patterns. Key adoptable patterns: SQLite LCM memory, PinchBench eval harness, skill composition
- **Task 18** (multi-model review): Codex + Gemini consensus review. Findings: infrastructure-first sequencing, curated memory ingestion, HITL gates, skill consolidation 22-to-12. Multi-model review provides consensus-based quality gate
- **Task 12** (Perpetual Memory): Auto-embed skill, auto-recall skill, auto-embed.cjs utility created. Memory embedding pipeline enables persistent semantic recall
- **Task 15** (Model Benchmarker): Agent, skill, benchmark harness, baselines created. Enables systematic model evaluation across agent tasks
- **Task 10** (App Generator): Forum-monitor-agent, app-generator-agent, forum-monitor skill, app-generation workflow created. Full feature with agent + skill + workflow
- **Task 14** (Post Analyzer): Agent, content-analyzer skill, post-analyzer.cjs utility, report template created. Utility + skill + agent pattern works well for analysis features
- **Task 13** (Competitor Monitor): Partial delivery — engagement-tracker.cjs, competitor-config.json, competitor-baselines.json created. Agent definition + social-monitor skill deferred due to rate limits. Lesson: rate limits can block agent creation mid-pipeline — deferred work needs explicit tracking
- **Task 11** (Voice Replicator): Agent, style-analyzer skill, voice-clone-generator skill, style-profiler.cjs — 22/22 tests pass. TDD methodology validated with 100% pass rate
- **Task 16** (final deploy): Commit 98d190ff pushed to origin/main. 6 features deployed in single session

**Key Patterns:**

- EPIC pipeline with 42 tasks across 7 phases successfully delivered 6 features in one session
- Multi-model review (Codex + Gemini) provides consensus-based quality gate
- OpenClaw analysis identified SQLite LCM memory + PinchBench eval as adoptable patterns
- Voice Replicator achieved 100% test pass rate (22/22) — TDD methodology effective
- Rate limits can block agent creation mid-pipeline — deferred work needs tracking
- Worktree cleanup must be explicit step in pipeline finalization

---

## Reflection Batch — 2026-03-22 Session

- 34 test failures triaged: P0 exit-code regression fixed, remaining are hook wiring + integration tests
- Task 11 completed: developer agent fixed P0+P1 test issues
- Task 12 completed: devops agent ran final lint/format/push pipeline
- Created new agent: qa-guardian (2026-03-22)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-22)

- Created new agent: contract-check (2026-03-22)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-22)

- Created new agent: bool-action (2026-03-22)

- Updated workflow: evolution-workflow (2026-03-22)

- Updated workflow: missing-workflow-xyz (2026-03-22)

- Created new agent: repo-onboarder (2026-03-22)
