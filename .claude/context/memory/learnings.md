## EPIC Pipeline Context Overflow Prevention — Enforcement at Plan Time (2026-03-12)

**Pattern: Context-Compressor Gate Between EPIC Phases**

- Root cause: EPIC audit pipelines (22+ tasks, 3+ phases) saturate router context by Phase 3 even with max-4 concurrency cap
- Second occurrence confirmed (prior: Task #25, 2026-02-10) — this is a recurring P0 systemic pattern
- Prior prevention guidance (wave-limiting, report-file-only outputs) was in memory but not enforced at plan-writing time
- Fix: Plans for EPIC+ pipelines MUST include explicit context-compressor spawn as a gate step between phases
- Fix: Max-concurrent cap for heavy analysis agents is 2 (not 4) — Wave 11 retrospective evidence: 4+ heavy agents → context saturation
- Fix: Agent spawn prompts MUST require output to report files; return only file path + 5-bullet summary (max 500 chars)
- Enforcement: Apply at plan-writing time (planner agent), not just at execution time (router)
- Evidence: 2026-02-10 incident (Task #25) + 2026-03-12 incident (Task #1, EPIC ecosystem audit plan)

## Structural Audit Health Baseline (2026-03-12)

**Ecosystem health snapshot for 2026-03-12 (Task #2, ecosystem-audit-epic)**:

- 74 agents: 0 phantom skills, all routing wiring intact as of this date
- 38 hooks: all files present on disk, 1 unregistered in settings.json (`step0-reflection-enforcer.cjs` in session/)
- Reflection system: fully functional — reflection-cleanup, queue-processor, step0-guard all registered
- Evolution system: functional — evolution-state-guard, conflict-detector registered
- Memory system: issues.md bloat is systemic (1000+ lines of routing warning noise, 11x past rotation threshold)
- P1 findings: unregistered hook, CLAUDE.md states "73 agents" (actual: 74), raw JSON.parse in `shell-injection-validator.cjs` line 427, issues.md bloat
- P0 findings: zero (ecosystem is fundamentally sound)
- Context overflow ended the session before P1 implementations — resume in fresh session

## TDD + LSP Skills Modernized (2026-03-11)

- TDD skill v1.2.0 updated with 4 new sections: Test Runner Selection (node --test vs Vitest 4), AI Output Evaluation Testing (score-based + tool-call sequence validation), MSW v2 HTTP Mocking (API boundary tests), expanded Property-Based Testing (memory serialization, hook validation, path normalization, schema stability)
- LSP navigator skill updated with LSP 3.17 features section: inlayHint (TDD pre-RED param names), prepareTypeHierarchy/supertypes/subtypes (inheritance tracing), goToDeclaration (TypeScript .d.ts resolution)
- Pattern: score-based agent output evaluation (relevance/safety/faithfulness 0-1 dimensions, 0.75 overall threshold)
- MSW v2 `onUnhandledRequest: 'error'` catches unintentional external calls in tests — use as safety net
- node --test = CJS standard; Vitest 4 = ESM/TypeScript future standard; never use Jest for new files
- All LSP 3.17 features inherit CJS limitation — fall back to ripgrep for .cjs files

- Updated workflow: evolution-workflow (2026-03-10)

- Updated workflow: missing-workflow-xyz (2026-03-10)

## Shift Change Context Handoff Research (2026-03-10)

**Pattern: Session handover log as stateful baton for LLM context continuity**

- "Finish-Only" drain mode maps to Kubernetes terminationGracePeriod + preStop hook lifecycle
- LangGraph uses checkpoints; OpenAI SDK uses session-as-ground-truth — neither has formal drain mode
- PID assassination (old session spawns successor, self-terminates) is precedented in Erlang hot code upgrades and Nginx graceful reload
- SOC shift handover log structure (open incidents, pending actions, memory pointers) is the correct template for LLM agent handover
- Key risk: context poisoning via handover log if freeform text is included — use strict JSON schema only
- Agent-studio existing spawn-token-guard.cjs (80K/120K thresholds) + TaskStateMachine SQLite are the correct substrate
- Novel aspects confirmed: drain mode as operational state, SOC-style structured handover, PID assassination for LLM agents
- No academic papers found specifically on LLM agent session handoff — genuinely underresearched area
- Report: .claude/context/artifacts/research-reports/shift-change-research-2026-03-10.md

- Created new agent: qa-guardian (2026-03-11)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-11)

- Created new agent: contract-check (2026-03-11)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-11)

- Created new agent: bool-action (2026-03-11)

- Created new agent: repo-onboarder (2026-03-11)

- Updated workflow: evolution-workflow (2026-03-11)

- Updated workflow: missing-workflow-xyz (2026-03-11)

## TDD 2026 Industry Research (2026-03-11) [Task #4]

**Multi-agent TDD is the 2025-2026 standard (TDFlow 94.3% SWE-Bench Verified):**

- 4-sub-agent decomposition: propose → debug → revise → generate-test outperforms monolithic single-agent loops
- Test writing (not code generation) is the primary bottleneck for AI TDD
- Pattern: QA writes test + commits, developer implements without touching test file, reflection verifies no test hacking
- Test-hacking rate drops from ~40% to 7/800 runs with sub-agent decomposition

**LSP pre-RED type verification (LSPAI FSE 2025):**

- Using lsp_hover BEFORE writing test raises valid test rate 25%+ by preventing API mismatch false REDs
- Falls back to `node -e "typeof require('./file').fn"` for .cjs files where LSP returns empty

**PBT with @fast-check/vitest (2025 standard, 650K monthly downloads):**

- Best for: routeIntent(anyString) → always returns string; hook(anyJSON) → exits 0 or 2
- Two modes: one-time random (lightweight) and full PBT; both integrate with Vitest natively

**Mutation testing gap (Stryker JS):**

- Not in TDD skill or testing.md — P1 gap
- Target: >70% production, >90% security-critical hooks/routing
- Incremental mode makes CI integration practical

**Top 5 gaps found:** (1) multi-agent TDD pattern, (2) LSP pre-RED verification, (3) @fast-check/vitest actionable example, (4) contract testing for hook schemas, (5) mutation testing guidance

**Report:** `.claude/context/artifacts/research-reports/tdd-2026-standards-research-2026-03-11.md`

## Structural Audit Patterns (2026-03-12)

**Pattern: Dead Code exit(0)/exit(2) in Security Hooks [HOOK]**

- Context: pre-completion-validation.cjs line 692 had `process.exit(0); process.exit(2);` — Node.js exits on first call
- Impact: Artifact output contract enforcement was completely non-functional (block printed to stdout but exit(0) allowed through)
- Detection: Line-level code read (not function-level) required to catch this
- Application: When reviewing security hooks, read the actual exit lines, not just the overall flow

**Pattern: formatResult() Object Signature Silent Bypass [HOOK]**

- Context: `formatResult({ decision: 'block', reason: msg })` does not set `result.allow` — inferredDecision defaults to 'allow'
- Root cause: formatResult() checks `result.allow` (boolean), not `result.decision` (string), when called with an object
- Fix: Always use string-first signature: `formatResult('block', check.message)`
- Application: Any hook calling formatResult with an object arg should be audited for this bypass

**Pattern: Fail-Open Sibling Hook Audit Heuristic [HOOK]**

- Context: 3 of 4 evolution hooks shared the same fail-open catch block defect (exit 0 instead of exit 2)
- Heuristic: When one security hook in a directory has a defect, audit ALL sibling hooks in that directory for the same class
- Application: Batch-apply fixes; never fix one sibling in isolation

**Pattern: Policy Without ESLint Enforcement Causes Drift [SECURITY]**

- Context: ADR-115 accepted safeParseJSON for all hooks Feb 2026; 3 hooks still using raw JSON.parse in Mar 2026
- Root cause: Policy documentation does not prevent future regressions without automated lint rule
- Fix: Add ESLint rule blocking raw JSON.parse in .claude/hooks/ directory
- Application: Any security policy for code patterns needs corresponding ESLint/tooling enforcement

## [2026-03-12] TDD Modernization Research (Task #22)

- **Stryker/Vitest**: `@stryker-mutator/vitest-runner` is the 2025-2026 standard for mutation testing ESM/TypeScript; replaces jest-runner. StrykerJS 7.0+. Use `stryker.config.mjs` with `testRunner: 'vitest'`. Browser Mode NOT supported. Always uses `perTest` coverage analysis.
- **TDAID five phases**: Plan → Red → Green → Refactor → Validate. Plan phase uses thinking-model for structured TDD plan before code. Validate phase is human gate for spec-gaming detection. Agent-studio Multi-Agent TDD (QA→Developer→Reflection) covers phases 2-4.
- **LSP 3.18**: No dedicated test lens provider — test "Run/Debug" code lenses are IDE-extension territory, not LSP standard. New: SnippetTextEdit (test scaffolding), diagnostic MarkupContent (rich test failure messages).
- **TDD skill gap**: Current SKILL.md uses `@stryker-mutator/jest-runner` install example — should be vitest-runner for ESM/TypeScript targets.
- Research report: `.claude/context/artifacts/research-reports/tdd-modernization-research-2026-03-12.md`

- Created new agent: qa-guardian (2026-03-12)

- Created new agent: contract-check (2026-03-12)

- Created new agent: bool-action (2026-03-12)

- Created new agent: repo-onboarder (2026-03-12)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-12)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-12)

- Updated workflow: evolution-workflow (2026-03-12)

- Updated workflow: missing-workflow-xyz (2026-03-12)

- Created new agent: qa-guardian (2026-03-12)

- Created new agent: contract-check (2026-03-12)

- Created new agent: bool-action (2026-03-12)

- Created new agent: repo-onboarder (2026-03-12)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-12)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-12)

- Updated workflow: evolution-workflow (2026-03-12)

- Updated workflow: missing-workflow-xyz (2026-03-12)

## TDD/LSP Gap Analysis (2026-03-12) [Task #3]

**Findings: TDD skill v1.2.0 is substantively current with 2026 standards (updated 2026-03-11)**

- Multi-agent TDD (TDFlow), TDAID phases, LSP pre-RED, PBT, MSW v2, Stryker, AI output eval: all documented
- Three narrow gaps remain: (1) `@fast-check/vitest` package name not explicit, (2) Stryker `--incremental` mode not documented, (3) LSPRAG pre-test full-context retrieval (arXiv:2510.22210) not in LSP skill
- LSPRAG pattern: `findReferences` → `hover` all callers → write contract test = 174-213% coverage gain
- MemoryRecord enforcement is policy-only — no hook verifies agents wrote memory after TaskUpdate(completed)
- ralph-loop v2.0.0 is well-structured; no gaps found
- Memory files actively used (confirmed 2026-03-12 entries exist)
- P1 actions: skill-updater on tdd + lsp-navigator skills with above gaps
- Report: .claude/context/artifacts/research-reports/tdd-lsp-gap-analysis-research-2026-03-12.md

## Ecosystem Audit 2026-03-12 — Key Findings

- **routing-guard exits 0 on block**: `routing-guard-core.impl.cjs` emits deny JSON but calls `process.exit(0)` at block path. Must be `process.exit(2)` per security hook policy. 5 ENFORCEMENT-003 tests fail.
- **validate-ecosystem-integrity.cjs does not exist** — ecosystem-integrity-scanner skill references a nonexistent script. Use `ci-validation-gate.cjs` as closest equivalent.
- **loop skill missing** — `.claude/skills/loop/` directory and SKILL.md do not exist. No agent frontmatter references it (safe for now).
- **Agent count**: 74 agents on disk = 74 in registry = 100% aligned. All 74 have health.status: "healthy".
- **Hook coverage**: 38/38 settings.json hooks verified on disk. Unified-creator-guard invoked via write-pretool-bundle bundle pattern (by design, not directly in settings).
- **spawn-token-guard**: Correctly registered as first Task PreToolUse hook, correctly fail-open (all exits are 0).
- **Memory files**: learnings 11KB, decisions 14KB, issues 15KB — all within thresholds after 2026-03-12 bloat fix.
- **Agent search coverage**: 68/68 non-orchestrator agents have pnpm search:code + token-saver references.
