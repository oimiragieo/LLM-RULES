## autoresearch Integration — Agent Count at 80 (2026-03-14) [FRAMEWORK]

**Event**: karpathy/autoresearch integrated. Commit 49015b79 + ceee6b1a.

**New artifacts**: `ml-experiment-loop` skill (stub → v2.0.0, 330 lines), `ml-experiment-standards.md` rule, `autoresearch` command + templates (prepare.py, train.py, program.md, pyproject.toml). Agent registry: **80 total** (was 79). Skill index: 299.

**Key patterns introduced**:

- Fixed-budget experiment protocol (5-min wall-clock budget, single scalar metric)
- Git-based keep/discard (branch per tag, commit per experiment, `git reset --hard HEAD~1` on discard)
- Context-window-safe log handling (redirect to file, targeted grep — NEVER cat)
- NEVER STOP autonomy (human controls by interruption, not permission gates)
- Simplicity criterion for keep/discard (prefer simpler code over marginal metric gains)

**Security**: External content (MIT) passed 6-point security audit before integration: size, binary, tool invocation, prompt injection, exfiltration, privilege scan — all PASS.

**Missing**: No CHANGELOG.md update in commit 49015b79 (documentation-always rule violation).

---

## MEGA Wave 3 Additions — Agent Count at 79 (2026-03-14) [FRAMEWORK]

**Event**: MEGA Wave 3 complete (commits 47622327, 21066d24, e9751c28, dda76ab3, 15e14bd4)

**New agents**: `mlops-engineer` (ML pipeline + model deployment), `data-scientist` (analytics + statistical modeling), `terraform-engineer` (IaC specialist — Terraform/Terragrunt). Agent count: **79 total** (was 76 post-Phase-2).

**New skills**: `cloudflare-workers`, `huggingface`, `api-testing` (new); `assimilate` v1.3.0 (updated — CLI-Anything 7-phase pipeline with JSON-structured output, multi-platform CLI gen, session management); `static-analysis` (updated); `sentry-monitoring` (updated with OTel patterns).

**New rules**: `vue-nuxt-rules.md`, `nextjs-app-router-rules.md`

**Application**: Agent count compliance test updated to expect 79 (commit 21066d24). Any future agent addition must update test assertion in `tests/agents/agent-tool-compliance.test.cjs`.

**Pattern**: skill-index.json post-commit reflects 295 skills; pre-commit hook auto-regenerates — manual `pnpm skills:index` unnecessary after commits.

---

## MCP Ecosystem Gap Analysis Pattern (2026-03-14) [RESEARCH]

**Task**: #1 — MCP deep-dive research (15 opportunities identified)
**Report**: `.claude/context/reports/mcp-deep-dive-2026-03-14.md`

**Pattern: Dual-source MCP audit (official registry + community lists + VoltAgent repos)**

- Technique: cross-reference MCP official registry + awesome-mcp-servers + VoltAgent awesome-\* repos against existing agent/skill catalog
- Result: 15 creation targets ranked HIGH/MED/LOW
- Highest-priority gaps found: security SAST (semgrep-mcp, snyk-mcp), ML specialization (mlops-engineer, data-scientist), web pentest (burp-suite via PortSwigger MCP)
- All official reference MCP servers (fetch, filesystem, git, memory, sequential-thinking) already covered by native tools/skills — skip list eliminates false positives

**Application**: Use this dual-source pattern for future ecosystem audits. The report format (Priority Matrix table + per-server detailed analysis) is the canonical template.

**Gotcha**: `semgrep-rule-creator` skill (writing rules) ≠ `semgrep-scanner` skill (running scans). Two distinct use cases; audit must check BOTH dimensions when evaluating coverage.

---

## assimilate Skill v1.3.0 — CLI-Anything Pipeline (2026-03-14) [SKILL]

**Task**: #2 — assimilate skill updated to v1.3.0

**Pattern: CLI-Anything 7-phase pipeline for skill assimilation**

Phase structure: (1) Discover CLI entry points → (2) Extract tool signatures → (3) Generate skill scaffold → (4) Produce JSON-structured output → (5) Multi-platform target gen → (6) Session management → (7) Integration registration.

**Application**: When assimilating any CLI tool into agent-studio, invoke `Skill({ skill: 'assimilate' })` — the v1.3.0 pipeline handles multi-platform generation (shell, PowerShell, Python) from a single invocation. JSON-structured output feeds directly into skill-index.

**Note**: 295 skills indexed after this update (skill-index.json). Pre-commit hook regenerated automatically.

---

## developer.md Autonomous Coding Patterns (2026-03-14) [AGENT]

**Task**: #4 — developer.md updated with autonomous coding patterns
**Commit**: e9751c28

**New patterns added to developer agent**:

1. **Multi-session persistence**: Always read `active_context.md` at task start; always write progress to it before context limit. Prevents total context loss across session boundaries.
2. **Git checkpointing**: Commit after every logical unit of work (not just at "done"). Enables rollback to any working state. Frequency: commit when feature increment works OR before risky refactor.
3. **TDD strict mode**: Write failing test first — ALWAYS. Never add production code without a failing test. Red-Green-Refactor with explicit commit at each color.
4. **Search-before-code**: Run `pnpm search:code` to find existing implementations BEFORE writing new code. Prevents duplicates, reveals reuse opportunities.

**Application**: These patterns are now canonical in developer.md — spawn prompts that reference developer.md automatically inherit these patterns.

---

## cleanup-always Rule: Gap Log Descriptions Are Mandatory (2026-03-14) [PROCESS]

**Pattern: cleanup_finding gap-log entries without descriptions are not actionable**

- `cleanup-always.md` rule Step 4 requires: log slop findings to `session-gap-log.jsonl` with `description` field naming specific deleted files
- 4 `cleanup_finding` entries from 2026-03-14 session all had `(no description)` — empty descriptions make the audit trail useless
- Root cause: agents are either skipping the logging step entirely or emitting entries without the file inventory
- Application: Spawn prompts for developer agents must explicitly state that gap-log entries require `description` with filenames
- Consider enforcement: add a validation check that rejects `cleanup_finding` entries with empty `description` fields
- Cross-ref: issues.md "Systemic: cleanup_finding Gaps Missing Descriptions" (2026-03-14)

---

## MEGA Wave 2 Execution Validated (2026-03-13) [WORKFLOW]

**Pattern: MEGA EPIC Wave execution — 2 agents max in parallel prevents context overflow**

- MEGA Wave 2 (2026-03-13): 27/31 tasks completed (87%) across 17 repos
- Wave execution validated: 2 agents max in parallel prevents context overflow
- Evidence: Prior session with 5+ parallel agents caused API context crash; wave-limited approach succeeded
- Application: All future MEGA EPIC sessions must enforce max-2-parallel-agents-per-wave
- Cross-ref: Wave 3 also succeeded (commit 47622327, 19 files, 295 skills, 76 agents)

---

## MEGA Wave 3 Pipeline Patterns (2026-03-14) [WORKFLOW]

**Pattern: Pre-commit hook auto-regenerates registries — no manual step needed**

- `skill-index.json` and `agent-registry.json` are regenerated by the pre-commit hook when agent/skill files change
- Anti-pattern: running `pnpm skills:index` manually after commits — the hook already did it
- Application: All wave executors can skip manual registry regeneration step

**Pattern: Background research agents before execution waves eliminates scope drift**

- Running 2-3 researcher agents in parallel BEFORE creator agents gives catalog-level awareness of what to build
- Evidence: MEGA Wave 3 Research Track A provided priority-ordered list (CodeGraphContext MCP, GWS, Firecrawl, etc.) before any creation started
- Application: For EPIC evolution sessions with 10+ artifacts, always start with parallel research agents

**Pattern: Wave staging with independent commits prevents file-conflict cascades**

- Staged files from Wave N that are NOT committed before Wave N+1 gets included in N+1's commit scope
- Anti-pattern: Wave 3A (fastapi/trpc/terraform rules) staged but not committed → included in Wave 3B's `git commit`
- Fix: Each wave executor must `git add` + `git commit` targeted files before returning control

**Pattern: Devops agent is most reliable for final push in multi-wave pipelines**

- Wave 5 QA agents do not reliably complete `git push` — they focus on validation, not deployment
- Always include a dedicated devops spawn as the LAST wave in any pipeline that touches committed files
- Evidence: MEGA Wave 3 required a separate devops task (task #18) for final push after QA task stalled

**Gotcha: Skill count discrepancy between commit message and task summary**

- Commit 47622327 message says "288 skills" but task summary says "295 skills"
- Root cause: commit message was written BEFORE pre-commit hook regenerated skill-index.json
- Always read skill-index.json entry count AFTER commit to get accurate number

## Plan-File Update Enforcement — Triple-Anchor Pattern (2026-03-14)

**Task**: 21 — fix(protocol): enforce plan-file updates by executing agents (not router)
**Commit**: 3f7b7447 | **Score**: 0.892 PASS

**Pattern: Triple-Anchor Protocol Enforcement**

When enforcing a new behavioral protocol across the framework, anchor it in three places:

1. **Rule** (`.claude/rules/`) — the canonical spec with full detail (markers, timing, tools, anti-patterns)
2. **Template** (`.claude/templates/spawn/`) — propagates awareness to all future spawns automatically
3. **Rubric** (reflection-agent.md) — creates a feedback loop that scores compliance in future reflections

Without all three anchors, behavioral changes decay. A rule alone is referenced only when agents read it explicitly. A template ensures every new spawn carries the requirement. A rubric ensures violations are detected and scored.

**Application**: Use this triple-anchor pattern for any behavioral enforcement that must survive across sessions and agents.

**Evidence**: Plan-file update: `plan-file-update.md` (rule) + `universal-agent-spawn.md` (template) + `reflection-agent.md` rubric section (feedback loop).

---

## MEGA EPIC Phase 2 — Wave-Based Parallel Execution Pattern (2026-03-14)

**Session**: MEGA EPIC Phase 2 final (reflection-mega-epic-phase2-final)
**Result**: 100% plan completion + net-new capabilities. 76 agents (+1 nlp-engineer), 285 skills (+3: code-graph-context, security-scanning, design-systems). Score: 0.89 PASS.

**Pattern 1: Wave-Based Parallel Execution (2 agents max per wave)**

- 6 waves (2A-2F), each with exactly 2 parallel agents. Zero context overflow observed.
- IRON LAW confirmed: max 2 heavy agents per wave prevents context saturation (prior evidence: 4+ = overflow).
- Wave naming (2A, 2B, 2C...) provides clear dependency ordering and audit trail.

**Pattern 2: Devops Agent Cut-Off Pattern (5 occurrences)**

- Devops agents were cut off mid-commit 5 times. Resume pattern recovered all 5.
- Root cause: long devops prompts (merge + cleanup + commit) exceed context mid-execution.
- Fix: Spawn devops with single focused command (commit only or merge only, not both).
- Recovery: Always resume devops if cut off rather than re-spawning fresh (avoids duplicate work).

**Pattern 3: Skill-Creator Tight Output When Given Exact Content**

- Providing exact markdown in the creator prompt produced correct, under-4KB skills first pass.
- Zero oversizing events in Phase 2 (contrast: Phase 1 had 2 oversizing incidents requiring code-simplifier trim).
- Pattern: Provide exact content + explicit size constraints in creator prompt → first-pass success.

**Pattern 4: Researcher + Explore Parallel Gap Assessment**

- Spawning researcher (web research) + Explore (local codebase scan) simultaneously for gap analysis saved time.
- Researcher covers external API updates; Explore covers current state of local skills/agents.
- Pattern: Use this dual-spawn for any "what's changed externally vs what we have" assessment.

**Pattern 5: Worktree-Per-Developer + Devops Merge Agent**

- Every developer agent created its own worktree automatically.
- Devops merge agent handles cleanup: copy → remove worktree → prune → commit. Reliable.
- No worktree conflicts observed across 6 waves.

---

## MEGA EPIC Commit Pattern — Untracked Architectural Tooling (2026-03-13)

**Task**: task-commit-untracked — 9 files, 958 insertions committed to main branch

**Pattern: Batch Architectural Tooling Commit Without Integration Queue**

- When committing untracked architectural tooling files (CLI scripts, maintenance tools, config files), the devops agent correctly commits to main with a well-structured conventional commit message and co-author attribution
- The commit included critical fixes (`patch-hook-exits.cjs` — eliminates 475K token infinite hook loop) and new CLI tools (`auto-ignore-scanner.cjs` — dynamic .claudeignore generator for foreign codebases)
- Gap detected: new CLI tools and maintenance scripts committed without corresponding integration-queue.jsonl entries — these require artifact-integrator analysis to ensure tool-catalog.md, package.json scripts, and CHANGELOG are updated
- **Pattern (IRON LAW)**: Any new tool under `.claude/tools/cli/` or `scripts/maintenance/` committed for the first time MUST generate an integration-queue.jsonl entry so artifact-integrator can verify catalog registration and package.json wiring
- Score: 0.84 PASS — good commit hygiene, minor integration gap

## Agent Oversizing in Batch Creation Pipelines — Two-Pass Pattern (2026-03-13)

**Task**: Task #13 — legacy-modernizer agent from MEGA EPIC 17-repo assimilation

**Pattern: Agent-Creator Oversizing in Batch EPIC Pipelines**

- Agents created during MEGA EPIC batch passes consistently exceed the 6KB/~200-line budget when agent-creator synthesizes from multiple external sources simultaneously
- legacy-modernizer was initially 19KB (far over the 6KB limit); required code-simplifier trimming pass to reach 5.1KB
- This is now the 2nd confirmed occurrence of oversized-draft-then-trim pattern in the same MEGA EPIC session (browser-automation skill was the first — 1st occurrence, Task #15)
- Root cause: agent-creator synthesizes from rich external repos (awesome-claude-code-subagents patterns) and includes everything found rather than distilling to essentials
- **Fix (IRON LAW)**: agent-creator in MEGA EPIC batch mode MUST add explicit size gate before accepting output: if draft > 6KB or > 200 lines → auto-invoke code-simplifier before registry registration. Do NOT accept first-draft oversized artifacts.
- **Recommended enforcement**: agent-creator Step N (post-draft) should include `wc -l` + `wc -c` check and fail if over threshold, similar to how skill-creator should add a 4KB/120-line gate
- **The two-pass anti-pattern is avoidable**: a size constraint prompt-template appended to agent-creator's synthesis step ("max 200 lines, max 6KB, no inline code examples") would prevent the first-pass oversizing

**Integration status**: legacy-modernizer cataloged, routing table updated, assigned to domain/

---

## Skill Sizing Budget in Batch Creation Pipelines (2026-03-13)

**Task**: Task #15 — browser-automation skill from MEGA EPIC 17-repo assimilation

**Pattern: Skill-Creator Oversizing in Batch EPIC Pipelines**

- Skills created during large MEGA EPIC batch passes may exceed the recommended 4-5KB budget because skill-creator synthesizes from multiple external sources simultaneously
- browser-automation was initially oversized, required code-simplifier trimming to reach 3.8KB
- Sibling skills in same batch stayed within budget: tts-generation ~4KB, transcription ~4KB, deep-research ~5KB, lsp-navigator ~5KB
- Root cause: batch assimilation from 3 external repos (mermaid-diagram-plugin, claude-quickstarts, vercel) produces richer-than-needed content
- **Fix**: When skill-creator is invoked in MEGA EPIC batch mode, add explicit "max 4KB / 120 lines" size gate before accepting output; if oversized, auto-invoke code-simplifier before catalog registration
- **Integration check passed**: browser-automation cataloged, indexed (agentPrimary: developer), assigned to developer.md + qa.md agents

---

## MEGA EPIC Completion — Ecosystem Assimilation (2026-03-13)

**Task**: Task #1 — 17 repos assimilated, 75 agents (+1 legacy-modernizer), 282 skills, 2 commits (2046b614 + f5dec41e), 47 files touched.

**Pattern: Batch External Repo Assimilation at EPIC Scale**

- Successfully integrated content from 17 external repositories into agent-studio skill/rule/agent ecosystem
- Key artifacts created: tts-generation, transcription, deep-research, browser-automation, vercel-deploy (updated), lsp-navigator (updated), legacy-modernizer agent, 5 rules (lancedb, supabase, playwright-testing, astro, solidjs), aso-specialist (updated)
- Rule count discrepancy: rule-index not updated — `pnpm index-rules` step was skipped by at least one rule-creator invocation. Count verification after batch creation is mandatory.
- QA gate (task #16) passed as final validation before commit — 75 agents, 282 skills confirmed.
- Agent count registry check is mandatory when agents are added — registry compliance tests expect exact count.

**Pattern: Temp File Hygiene for Developer/Integration Agents (IRON LAW)**

- Developer and testing agents consistently dump temp/debug scripts to the project root: `dump-test.cjs`, `errors.json`, `eslint.json`, `test-out.txt`, `rename_agent.cjs`, etc.
- **IRON LAW**: ALL temporary scripts, logs, and CLI output dumps MUST go to `.claude/context/tmp/` OR your system's `tmp/` equivalent.
- **IRON LAW**: NEVER leave one-off scripts or JSON dumps in the project root. The project root is considered a sacred production boundary.
- If you need a script to remain permanently, place it in `scripts/maintenance/` and commit it.
- **Enforcement**: Subagents that pollute the project root with ephemeral logs and test outputs are actively violating the `workspace-conventions` rule.

## Rule Creator Step 4 Mandatory Verification (2026-03-13)

**Issue**: rule-creator was invoked but `pnpm index-rules` (Step 4) was skipped during MEGA EPIC. This caused a rule-index count discrepancy (claimed 114→126 but index not updated).

**Pattern**:

- rule-creator Step 4 (`pnpm index-rules`) is MANDATORY after any rule file creation
- Count verification is required: compare before-count with expected after-count
- If count doesn't match, rule creation failed silently — re-run the creator step

**Enforcement**: Post-creation integration step for rules should validate `pnpm validate:rules` exits clean.

## Rule Creation — Wave 4A (2026-03-13)

Created 5 new rule files in `.claude/rules/` from awesome-rules/awesome-cursorrules patterns:

- `lancedb-rules.md` — IVF_PQ indexing, hybrid search, batch writes, versioning, anti-patterns
- `supabase-rules.md` — Auth/OAuth, RLS policies, Edge Functions, Realtime, Storage
- `playwright-testing-rules.md` — Page Object Model, fixtures, locators, storage state, no waitForTimeout
- `astro-rules.md` — Frontmatter, Islands hydration directives, Content Collections, Image component, SSR
- `solidjs-rules.md` — Signals, createMemo, createEffect, For/Show, createStore, batch()
  All passed `runIntegrationChecklist` + `queueCrossCreatorReview` via `.claude/lib/creators/creator-commons.cjs`.
  Integration lib path: `.claude/lib/creators/creator-commons.cjs` (NOT `.claude/lib/creator-commons.cjs`).

## tts-generation Skill Created (2026-03-13)

**Skill:** `.claude/skills/tts-generation/SKILL.md`

- Created AI text-to-speech skill covering OpenAI TTS (tts-1/tts-1-hd), ElevenLabs (eleven_turbo_v2), and Google gTTS backends
- OpenAI TTS max 4096 chars/request — long text requires chunking with pydub for concatenation
- Voice options: alloy, echo, fable, onyx, nova, shimmer (OpenAI); cloneable voices (ElevenLabs); 40+ languages (gTTS)
- Assigned to: developer, ai-ml-expert agents
- Catalog updated in @SKILL_CATALOG_TABLE.md under AI/ML category

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

## EPIC Ecosystem Audit — 2026-03-12 (commit 779bf82b)

**P0 Fixed:** `routing-guard-core.impl.cjs` — block path was exiting 0 instead of 2. Fix: `resolveExitCode()` helper extracted to keep complexity ≤50. 5 tests that were failing now pass (94/94 total).

**P1 Fixed:** CLAUDE.md agent count "73 agents" corrected to "74 agents" in Section 3 and reference index.

**Shell-injection-validator:** Already uses `safeParseJSON` correctly — auditor finding from prior session was stale.

**TDD Skill v1.3:** Added TDP (Test-Driven Prompting), 3-consecutive-pass flakiness gate, memory-search in Step 0, and Autonomous TDD with ralph-loop section.

**ralph-loop Skill:** Added TDD State Schema `{scenarios[], completedScenarios[], currentScenario, evidenceLog[]}` with resumption pattern.

**Spawn failures:** Context >100K tokens causes "Prompt is too long" on ALL agent spawns. Pattern: switch to direct execution mode.

**ESLint complexity gate:** Adding a ternary inside a function at complexity=50 blocks commit. Always extract to named helper function.

## MEGA WAVE 3 Research Track A (2026-03-14)

- VoltAgent OpenClaw has 5,366 community skills; best picks for agent-studio: academic-deep-research, rate-limiter, adversarial-prompting, airtable-automation
- Telegram is confirmed in OpenClaw Communication category (149 skills) but agent-studio already has telegram-polling skill
- VoltAgent awesome-agent-skills: biggest gaps are Google Workspace CLI suite (12 skills), Firecrawl, Hugging Face model management, Neon, Notion
- VoltAgent subagents: 128 agents; agent-studio covers ~74; key NEW agents to create: slack-expert, electron-pro, mlops-engineer, fintech-engineer, payment-integration, iot-engineer, m365-admin
- CLI-Anything: 7-phase pipeline (Analyze→Design→Implement→Plan Tests→Write Tests→Document→Publish) converts GUI apps to JSON-enabled CLIs; integrate with assimilate skill
- CodeGraphContext: MCP server supporting 14 languages + KùzuDB graph backend; directly upgrades existing code-graph-context skill; use for cross-language call chain analysis
- Top 10 priority picks: (1) CodeGraphContext MCP, (2) GWS CLI suite, (3) Firecrawl, (4) slack-expert agent, (5) CLI-Anything/assimilate, (6) electron-pro, (7) HuggingFace skills, (8) mlops-engineer, (9) rate-limiter skill, (10) fintech/payment agents

## cloudflare-workers skill created (2026-03-14) [SKILL_CREATION]

**Skill:** `cloudflare-workers`
**Path:** `.claude/skills/cloudflare-workers/SKILL.md`
**Category:** DevOps & Infrastructure
**Agents:** developer, devops

Covers: Durable Objects (hibernation API), KV/R2/D1 storage tiers, Workers AI inference, AI Gateway routing, wrangler.toml bindings, Vitest testing with `@cloudflare/vitest-pool-workers`.

Key anti-patterns captured:

- Use `state.acceptWebSocket()` not `ws.accept()` for DO WebSockets (hibernation)
- Never use `setTimeout`/`setInterval` — use Cron Triggers or DO alarms
- Never store secrets in wrangler.toml vars — use `wrangler secret put`

- Refreshed agent: .claude/agents/domain/aso-specialist.md (2026-03-14)

- Created new agent: qa-guardian (2026-03-14)

- Created new agent: contract-check (2026-03-14)

- Created new agent: bool-action (2026-03-14)

- Created new agent: repo-onboarder (2026-03-14)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-14)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-14)

- Updated workflow: evolution-workflow (2026-03-14)

- Updated workflow: missing-workflow-xyz (2026-03-14)

## Session Handoff Research (2026-03-14) [Task #task-handoff-research]

**`--resume`/`-r` behavior (VERIFIED from official docs):** Restores session by name or ID from disk. Does NOT restore LLM context window state. Resuming agent starts fresh and rebuilds context from persisted conversation log. Design handoff docs to be self-contained.

**`--name`/`-n` flag:** Sets a human-readable session name. Enables `claude --resume <name>` from any terminal. Use format `shift-YYYY-MM-DD-HH` for shift-change sessions.

**`--fork-session`:** Creates new session ID from an existing session's history. Use before risky operations. Works with `--resume` or `--continue`.

**`--session-id`:** Force a specific UUID for the session (must be valid UUID format). Enables deterministic session identity.

**Token Counting API (VERIFIED):** `client.messages.count_tokens()` (Python) / `client.messages.countTokens()` (TS) is a real, free endpoint. Returns `{ input_tokens: N }` estimate (±5%). Rate limited separately from messages.create() (100–8,000 RPM by tier). Use for pre-flight validation before spawning sessions with large handoff prompts.

**Production handoff patterns:** Winning pattern = separate durable state from working context. Write all outputs to persistent storage immediately; new sessions query storage rather than relying on in-context history. Summarization at thresholds (not line-count truncation).

**Report:** `.claude/context/artifacts/research-reports/session-handoff-research-2026-03-14.md`

- Created new agent: qa-guardian (2026-03-15)

- Created new agent: contract-check (2026-03-15)

- Created new agent: bool-action (2026-03-15)

- Created new agent: repo-onboarder (2026-03-15)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-15)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-15)

- Updated workflow: evolution-workflow (2026-03-15)

- Updated workflow: missing-workflow-xyz (2026-03-15)

- Created new agent: qa-guardian (2026-03-15)

- Created new agent: contract-check (2026-03-15)

- Created new agent: bool-action (2026-03-15)

- Created new agent: repo-onboarder (2026-03-15)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-15)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-15)

- Updated workflow: evolution-workflow (2026-03-15)

- Updated workflow: missing-workflow-xyz (2026-03-15)

- Created new agent: qa-guardian (2026-03-15)

- Created new agent: contract-check (2026-03-15)

- Created new agent: bool-action (2026-03-15)

- Created new agent: repo-onboarder (2026-03-15)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-15)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-15)

- Updated workflow: evolution-workflow (2026-03-15)

- Updated workflow: missing-workflow-xyz (2026-03-15)

- Created new agent: qa-guardian (2026-03-15)

- Created new agent: contract-check (2026-03-15)

- Created new agent: bool-action (2026-03-15)

- Created new agent: repo-onboarder (2026-03-15)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-15)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-15)
