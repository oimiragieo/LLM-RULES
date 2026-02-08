# Architecture Decision Records

> Older entries archived to `archive/decisions-2026-02.md`. This file contains recent decisions only.

## Format

Each decision should include:

- Date
- Decision made
- Context/problem
- Rationale
- Consequences

---

## ADR-100: Cross-Artifact Integration System (COMPLETE)

**Date:** 2026-02-08 (Final Completion)

**Status:** ACCEPTED & FULLY IMPLEMENTED (All 15 tasks complete, Phase 6 DevOps wiring verified, 95% deployment readiness)

**Summary:** Complete end-to-end integration framework for artifact discovery, relationship tracking, gap detection, and remediation. The 15-task enterprise pipeline (Tasks #1-15 spanning Feb 4-8) successfully demonstrated:

- **Phase 0-1:** Architecture design + security review + implementation planning
- **Phase 2:** Core library implementation (artifact-graph.cjs, 479 lines, 11 tests)
- **Phase 3:** Integration into agents (reflection-agent Step 4.5, evolution-orchestrator Phase E)
- **Phase 4:** Integration into workflows (evolution-workflow Phase 6 actions)
- **Phase 5:** Integration into system hooks (post-creation-integration.cjs queues entries)
- **Phase 6:** Integration into Router (Step 0.5 queue checking, 11 artifact-integration keywords) ← Task #12

**Key Achievements:**

- 5 integration points fully wired and verified (reflection → evolution → post-creation → router → artifact-integrator)
- 65 integration tests (100% pass rate)
- Zero missed integration gaps (5/5 checklist items complete)
- Zero design rework (plan-to-deployment without iteration)
- Non-blocking operational pattern (20ms overhead, integration runs in parallel)
- 3 new patterns extracted (non-blocking integration, intent-driven closure, enterprise pipeline)

**Deployment Verdict:** READY FOR PRODUCTION (95% confidence, 0 critical blockers)

---

## ADR-102: Memory Management System Rebuild (Rotator + Pruner + Cold Storage)

**Date:** 2026-02-08

**Status:** Accepted (Architecture + Security designs complete, Implementation plan ready)

**Context:**

Memory files (learnings.md, decisions.md, issues.md) grow unbounded, with issues.md reaching 53KB and archives reaching 463KB. Three previously archived modules (memory-rotator, smart-pruner, cold-storage) had valid designs but were never integrated. The memory-scheduler.cjs has disabled stubs where these should be wired. This is CRITICAL issue C-003 from the performance analysis (40% context budget consumption).

**Decision:**

Design and implement a simplified 3-component memory management system:

1. **memory-rotator.cjs** (~120 lines): Section-based rotation when files exceed 20KB. Parses markdown into semantic sections (delimited by `---` or `## `), preserves `[PERMANENT]` entries, archives to `archive/{file}-YYYY-MM.md`. Triggered both by `sync-memory-index.cjs` hook (on write) and by `memory-scheduler.cjs` (weekly).

2. **smart-pruner.cjs** (~100 lines): Jaccard word-similarity deduplication (threshold 0.5) and resolved-entry pruning (30-day age). No embedding dependencies. Preserves `[PERMANENT]` entries. Runs weekly via scheduler.

3. **cold-storage.cjs** (~80 lines): 3-tier system (HOT/WARM/COLD). Moves warm archives older than 30 days to plain JSONL files in `archive/cold/`. No gzip (simplicity over space). Provides cross-tier search.

**Key Design Choices:**

- Section-based over line-based rotation (preserves semantic units)
- Jaccard over embeddings for dedup (zero dependencies, deterministic)
- Plain JSONL over gzip for cold storage (debuggable, Windows-safe)
- Hook + scheduler dual triggering (immediate + batch)
- All writes via atomic-write.cjs with proper-lockfile

**Rationale:**

- Previous implementations failed due to over-engineering (combined ~900 lines) and lack of integration
- New design is ~300 lines total (67% reduction), focused on integration
- Addresses C-003 (context budget) by keeping active files under 20KB each
- Each module under 150 lines constraint ensures maintainability

**Consequences:**

- Active memory footprint drops from ~82KB to ~60KB max (27% reduction)
- Eliminates unbounded growth that previously consumed 40% of context budget
- Archives become searchable via `searchArchives()` and `searchCold()`
- `memory-scheduler.cjs` stubs become functional
- `checkAndArchiveLearnings()` in memory-manager.cjs should be deprecated long-term in favor of rotator

**Architecture Design:** `.claude/context/reports/architecture/memory-management-design-2026-02-08.md`

---

## ADR-088: Check 7 Specialist-Override Architecture Review

**Date:** 2026-02-07

**Status:** Accepted (conditional)

**Context:**
Check 7 (checkSpecialistOverride) was added to routing-guard.cjs via TDD to enforce the specialist-first routing law documented in CLAUDE.md. This is a post-hoc architecture review.

**Decision:**

1. Check 7 design is architecturally sound in intent, placement (last check), and scope (developer-only).
2. MUST remain at warn-default until keyword precision is improved (substring matching produces false positives).
3. Escalation to block-default requires: (a) word-boundary matching implemented, (b) 30 days violation-tracker data, (c) <10% false positive rate, (d) Router respects warnings >80% of the time.
4. Keyword map stays hardcoded until matching strategy stabilizes.
5. First-match-wins behavior is acceptable as a hint; scoring system is a future improvement.

**Rationale:**

- Warn-mode provides runtime enforcement without blocking legitimate developer work
- Substring matching with keywords like "document", "deploy", "migration" produces too many false positives for block mode
- Check placement (last in runAllChecks) correctly prioritizes safety > structure > quality

**Consequences:**

- Positive: First runtime enforcement of specialist-first routing (was documentary only)
- Positive: Violation tracking enables data-driven promotion decisions
- Negative: Warn-mode may cause alert fatigue if false positive rate is high
- Risk: Without R1 fixes, escalating to block would break legitimate developer workflows

**Report:** `.claude/context/reports/architecture/specialist-override-review-2026-02-07.md`

---

## ADR-087: Commands System Overhaul -- Thin Delegator Pattern + Command Catalog

**Date:** 2026-02-07

**Status:** Accepted

**Context:**

17 command files exist in `.claude/commands/`. Only 3 properly delegate to skills (brainstorm, write-plan, execute-plan). 7 are thin stubs duplicating skill content. 4 reference dead infrastructure (`.claude/todos/`, `.claude/checkpoints.log`). 1 duplicates Router functionality. Documentation in `@DIRECTORY_STRUCTURE.md` falsely claims the directory was "Deleted (was empty)" on 2026-01-28. `CLAUDE.md` has zero references to commands.

**Decision:**

1. **Canonical pattern is thin delegator:** All commands that have a corresponding skill use the 3-line delegator pattern (`disable-model-invocation: true` + `Invoke the {skill} skill`).
2. **Delete 4 dead commands:** `/checkpoint` (dead infra), `/orchestrate` (redundant with Router), `/add-todo` (dead infra), `/check-todos` (dead infra).
3. **Convert 8 thin stubs** to proper skill delegators (build-fix, code-review, e2e, eval, refactor-clean, tdd, test-coverage, verify).
4. **Enrich `/learn`** to use memory protocol instead of dead `skills/learned/` directory.
5. **Add 4 new commands:** `/debug` (debugging), `/security-review` (security-architect), `/compress` (context-compressor), `/analyze` (project-analyzer).
6. **Create command catalog** at `.claude/context/artifacts/catalogs/command-catalog.md`.
7. **Fix documentation** in `@DIRECTORY_STRUCTURE.md`, `CLAUDE.md`, `router.md`, `capability-routing.json`, `GETTING_STARTED.md`.
8. **Commands remain NOT creator-guarded** (by design, per security review).

**Rationale:**

- Thin delegators make skills the single source of truth for behavior
- Dead infrastructure references confuse agents and waste context
- New commands surface existing high-value skills that users cannot easily discover
- Command catalog provides discoverability parallel to skill-catalog and template-catalog

**Consequences:**

- 17 commands become 17 (delete 4, add 4) with 100% functional
- All behavioral commands delegate to skills (single source of truth)
- Documentation accurately reflects reality
- Users can discover commands through the catalog

**Architecture Plan:** `.claude/context/plans/commands-overhaul-architecture-2026-02-07.md`

---

## ADR-085: Template System Overhaul -- Advisory Resolver + Dead Template Cleanup

**Date:** 2026-02-07

**Status:** Proposed

**Context:**

Audit of `.claude/templates/` found 43 template files with only ~20% actively integrated. The spawn prompt assembler (`spawn-prompt-assembler.cjs`) and core library (`prompt-assembler.cjs`) do not read spawn template files from disk -- they programmatically generate all required spawn prompt sections. 28 templates have zero references across the codebase. The template-creator skill references directories that do not exist. No template catalog file exists.

**Decision:**

1. **Spawn Template Resolver (advisory):** Create `.claude/lib/spawn/spawn-template-resolver.cjs` with `resolveSpawnTemplate(agentType, options)` that returns template metadata (name, path, reason). The resolver is advisory -- it helps the Router select the right template for guidance, but does not modify the critical-path spawn-prompt-assembler hook. Selection priority: explicit override > one-shot subordinate > orchestrator > identity frontmatter > universal default.

2. **Dead Template Cleanup:** Archive 14 templates to `.claude/templates/_archive/` (via `git mv`), delete 2 (html-css, general code-styles), keep and wire 12 valuable templates, upgrade 3 pending research input.

3. **Template Catalog:** Create `.claude/context/artifacts/catalogs/template-catalog.md` with structured entries for all ~27 active templates including agent assignments, categories, and usage instructions.

4. **Template-Creator Skill Fix:** Remove phantom directory references (hooks/, code/, schemas/), add missing categories (spawn, report, code-style), assign agents.

5. **Template README Update:** Add spawn templates section, report templates section, update code-styles list, add archive documentation.

**Alternatives Considered:**

1. **Template content injection:** Resolver loads template content and injects it into spawn prompts. Rejected -- would duplicate sections already handled by the assembler (AVAILABLE_TOOLS, Memory, etc.).
2. **Full template rendering engine:** Process `{{PLACEHOLDER}}` tokens programmatically. Rejected -- adds complexity without proportional value; current manual replacement is sufficient.
3. **Delete all dead templates:** Rejected -- some have genuine reference value. Archive preserves git history.

**Rationale:**

- Advisory resolver is lowest risk -- no changes to the critical spawn hook path
- Archive via `git mv` preserves full file history for restoration
- Markdown catalog is human-readable and agent-friendly (vs JSON registry)
- Wiring 12 templates increases active utilization from 20% to ~80%

**Consequences:**

- Template system goes from 20% to 80%+ utilization
- Router gains structured template selection guidance
- Template-creator skill becomes accurate (no phantom references)
- 14 templates archived (restorable), 2 deleted, 3 pending upgrade
- New catalog provides single source of truth for template discovery

**Architecture Plan:** `.claude/context/plans/template-overhaul-architecture-2026-02-07.md`

---

## ADR-083: CI Hook Module-Resolution Checks (Hybrid Static + Dynamic)

**Date:** 2026-02-07

**Status:** Proposed

**Context:**

Commit 3487ee8b fixed three MODULE_NOT_FOUND crashes caused by hook library modules being accidentally archived during consolidation (Task #41). No mechanism exists to prevent this from recurring during future refactoring.

**Decision:**

Implement a hybrid hook verification script at `.claude/scripts/verify-hook-modules.cjs`:

1. **Static analysis (default):** Regex-based extraction of `require()` paths from all `.cjs` files in `.claude/hooks/` (excluding `_archive/`). Resolves relative paths against the filesystem. Reports missing modules.
2. **Dynamic verification (--deep flag):** Fork child processes to actually `require()` each hook with a 3-second timeout. Catches transitive dependency failures.
3. **settings.json cross-reference:** Verify every registered hook command in `settings.json` points to a file that exists on disk.

A supporting library at `.claude/lib/utils/require-analyzer.cjs` provides `extractRequires()` and `resolveRequirePath()`.

**Alternatives Considered:**

1. **Static-only:** Fast but cannot catch transitive or conditional requires. Chosen as default mode.
2. **Dynamic-only:** Comprehensive but some hooks read stdin or call process.exit(), causing hangs/crashes. Requires child process isolation with timeouts. Chosen as opt-in.
3. **AST parsing (acorn/babel):** More accurate than regex but adds npm dependencies. Rejected -- regex handles the literal-string require patterns used in all 39 active hooks.

**Rationale:**

- Static analysis covers 95%+ of cases (all hooks use literal string requires)
- Zero new npm dependencies (uses built-in `fs`, `path`, `child_process`)
- Fast enough for pre-commit (<500ms static, <15s dynamic)
- JSON output mode enables CI integration
- Cross-checks settings.json to catch "registered but deleted" hooks

**Consequences:**

- Future refactoring that moves/deletes hook libraries will be caught pre-commit
- CI pipeline can enforce hook integrity on every push
- False positives possible for dynamic requires (logged as warnings, not failures)

---

## ADR-084: Router Blacklist Violation Monitoring (Structured JSONL Tracking)

**Date:** 2026-02-07

**Status:** Proposed

**Context:**

The Router sometimes attempts to use blacklisted tools (Glob, Grep, etc.). The routing-guard.cjs hook catches these and either blocks or warns, but violations are logged as unstructured stderr output. There is no aggregation, no session-level counting, and no threshold alerting.

**Decision:**

Implement a violation tracking module at `.claude/lib/monitoring/violation-tracker.cjs`:

1. **Structured recording:** Each violation is a JSONL entry in `.claude/context/metrics/router-violations.jsonl` with timestamp, tool, action, check name, router mode, and session ID.
2. **Rotation:** Max 1000 lines with tail-trim rotation (reuses `appendJsonl` from `jsonl-utils.cjs`).
3. **Threshold alerting:** `checkThreshold()` function detects >N violations in a time window and emits a one-time warning per routing-guard invocation.
4. **Integration:** Lazy-loaded into `routing-guard.cjs` with graceful degradation if module is missing.

**Alternatives Considered:**

1. **Extend error-tracker.cjs:** Rejected -- error-tracker is for runtime errors, not policy violations. Mixing concerns would complicate analysis.
2. **Standalone hook:** Rejected -- would require additional settings.json registration and duplicate routing-guard's violation detection logic.
3. **In-memory only (no file):** Rejected -- each hook invocation is a separate process, so in-memory state does not persist across tool uses.

**Rationale:**

- JSONL format is append-friendly and matches existing metrics patterns (error-metrics.jsonl, hook-metrics.jsonl)
- Lazy loading ensures routing-guard.cjs is not broken if violation-tracker is missing
- Threshold alerting provides early warning of systematic Router misbehavior
- Separate metrics file enables independent analysis of routing policy compliance

**Consequences:**

- Router violations become visible and analyzable over time
- Threshold warnings surface systematic issues early
- Adds ~1ms overhead per violation (sync file append)
- New `.claude/lib/monitoring/` directory establishes monitoring library pattern

**Architecture Plan:** `.claude/context/plans/ci-monitoring-architecture-2026-02-07.md`

---

## ADR-082: Hook Hardening -- Restore Archived Monitoring Modules + Fix Router-State Path

**Date:** 2026-02-06

**Status:** Accepted

**Context:**

Three hook modules are MISSING at their expected paths, causing MODULE_NOT_FOUND crashes on every hook invocation:

1. `error-tracker.cjs` -- required by `error-tracker-hook.cjs` (PostToolUse), archived but not replaced
2. `metrics-collector.cjs` -- required by `metrics-collector-hook.cjs` (PostToolUse), archived but not replaced
3. `router-state.cjs` -- required by `user-prompt-unified.cjs` (UserPromptSubmit) at OLD path; module was relocated to `lib/routing/` but this one consumer was not updated

Root cause: Hook consolidation (Task #41, commit 0e449681) archived 45 orphan hooks and relocated router-state.cjs. The two monitoring library modules were mistakenly archived even though their wrapper hooks (registered in settings.json) still require them. One consumer of router-state.cjs was missed during the path update.

**Decision:**

1. Restore `error-tracker.cjs` from `_archive/monitoring/` to `hooks/monitoring/` (exact copy)
2. Restore `metrics-collector.cjs` from `_archive/monitoring/` to `hooks/monitoring/` (exact copy)
3. Fix `user-prompt-unified.cjs` line 71: change `routingRequire('router-state.cjs')` to `libRequire(path.join('routing', 'router-state.cjs'))`

**Rationale:**

- Restoring archived code is lower risk than writing new implementations
- Archived modules have proper rate limiting, validation, error handling, and match the exact interface expected by the wrapper hooks
- The router-state path fix follows the pattern already used by all other hooks in the routing directory
- No new dependencies, no test changes needed

**Consequences:**

- Error tracking and metrics collection restored on every PostToolUse event
- Router mode reset restored on every UserPromptSubmit event (routing analysis functional)
- Future hook consolidation efforts must verify wrapper hooks do not reference archived libraries

**Architecture Plan:** `.claude/context/plans/hook-hardening-architecture-2026-02-06.md`

---

## ADR-078: Workspace Conventions and Directory Reorganization

**Date:** 2026-02-06

**Status:** Accepted

**Context:**
Deep audit (Task #19) found 55+ misplaced files in `.claude/context/artifacts/` root, no naming convention, no provenance tracking, and inconsistent report placement. Research (Task #20) identified industry best practices for agent workspace organization.

**Decision:**

1. Establish `.claude/rules/workspace-conventions.md` as the canonical workspace rules file
2. Create new directory structure: `reports/{domain}/`, `artifacts/{analysis,catalogs,summaries,database}/`
3. Adopt kebab-case naming with ISO 8601 date suffixes: `{name}-{YYYY-MM-DD}.{ext}`
4. Require provenance headers on all generated files: `<!-- Agent: {type} | Task: #{id} | Session: {date} -->`
5. Move `spawn-size-audit.jsonl` to `metrics/`, `rule-index-cache.json` to `config/`
6. Keep `evolution-state.json`, `reflection-queue.jsonl`, and `agent-registry.json` at context root (35+ cross-cutting references each)
7. Inject workspace conventions into the spawn template so all agents know the rules

**Rationale:**

- Flat structure (Option A) chosen over nested because it is simpler and easier to enforce
- Files with deep cross-cutting references (evolution-state.json has 35+ refs in hooks, workflows, agents) are too risky to move; pragmatic decision to document as canonical
- Provenance headers enable traceability without complex metadata systems
- Rules placed in `.claude/rules/` which Claude Code auto-loads as project instructions

**Consequences:**

- All new agent-generated files will follow naming and placement conventions
- Spawn template instructs every agent on correct file locations
- Legacy files in `artifacts/` root remain for now (Task #22 handles migration)
- Three root-level context files documented as canonical exceptions

---

## ADR-079: Agent Utilization Remediation Strategy

**Date:** 2026-02-06

**Status:** Proposed (pending implementation)

**Context:**
Audit (Task #35) found that 94% of agents (46/49) have never been spawned. The Router collapses all requests to `developer` because enforcement hooks default to `warn` and no post-completion workflow chain exists.

**Decision:**
Implement a 4-phase remediation strategy:

1. **Phase 1 (Immediate):** Change enforcement defaults to `block` mode for `PLANNER_FIRST_ENFORCEMENT` and `SECURITY_REVIEW_ENFORCEMENT`. This forces the Router to spawn planner for complex tasks and security-architect for security-sensitive tasks.

2. **Phase 2 (Short-term):** Create a PostToolUse hook on TaskUpdate(completed) that triggers follow-up agent spawns: code-reviewer for implementation tasks, qa for code changes, technical-writer for documentation changes, and reflection-agent for all completions.

3. **Phase 3 (Medium-term):** Fix the reflection deadlock by making Step 0 either spawn reflection-agent automatically or make reflections asynchronous. Implement a workflow state machine in `.claude/context/runtime/workflow-state.json`.

4. **Phase 4 (Long-term):** Add Router intent-to-agent enforcement that prevents spawning `developer` when the classified intent maps to a different agent.

**Rationale:**

- Phase 1 is zero-code (env var changes) and immediately activates planner + security-architect
- Phase 2 activates 5 more agents (code-reviewer, qa, technical-writer, reflection-agent, architect)
- Phase 3 fixes the reflection/learning loop
- Phase 4 prevents regression to developer-only routing

**Consequences:**

- Agent spawn costs will increase (more agents = more API calls)
- Task completion will take longer (multi-phase review)
- Quality and security will significantly improve
- The multi-agent architecture will finally be utilized as designed

**Full Analysis:** `.claude/context/reports/architecture/agent-utilization-audit-2026-02-06.md`

---

## ADR-080: Enterprise Orchestration Workflow State Machine

**Date:** 2026-02-06

**Status:** Accepted

**Context:**
Agent utilization audit (Task #35, ADR-079) established that 94% of agents are never spawned. The Router collapses all requests to `developer` due to: (1) enforcement hooks defaulting to `warn`, (2) no post-completion workflow chain, (3) no workflow state machine, and (4) no phase-based execution model. Research (Task #36) identified that LangGraph-style state machines with CrewAI-style role-based teams and quality gates between phases represent industry best practices for enterprise multi-agent orchestration in 2026.

**Decision:**
Implement a 7-phase enterprise orchestration workflow state machine that the Router MUST follow for every request:

1. **Phase 0: TRIAGE** -- Router classifies request (intent, complexity, domain, risk) and determines phase path
2. **Phase 0.5: DYNAMIC CREATION** -- When capability gap detected, create missing agents/skills via EVOLVE workflow
3. **Phase 1: DESIGN** -- Parallel spawn of planner + architect + security-architect (varies by complexity)
4. **Phase 2: IMPLEMENT** -- Developer + domain specialist following the plan from Phase 1
5. **Phase 3: REVIEW** -- Parallel spawn of code-reviewer + qa + security-architect
6. **Phase 4: DEPLOY** -- DevOps agent: lint, format, commit, push, CI verification
7. **Phase 5: DOCUMENT** -- Technical-writer updates docs, README, CHANGELOG
8. **Phase 6: REFLECT** -- Reflection-agent extracts learnings and updates memory

Key architectural decisions within this ADR:

- **Complexity-based phase skipping:** TRIVIAL tasks skip to Phase 2+4 only; LOW adds Phase 1+3; MEDIUM adds Phase 5; HIGH runs all phases; EPIC adds orchestrator coordination
- **Persistent state in workflow-state.json:** Router reads this file every turn to know which phase to advance to. Survives context resets.
- **Quality gates between every phase:** Blocking checks prevent advancement; non-blocking checks generate warnings
- **Post-completion chain hook:** PostToolUse on TaskUpdate(completed) automatically triggers next phase advancement
- **Enforcement hooks in block mode by default:** `PLANNER_FIRST_ENFORCEMENT=block`, `SECURITY_REVIEW_ENFORCEMENT=block`, `SPAWN_PROMPT_VALIDATOR=block`
- **Intent-to-agent enforcement:** New hook prevents spawning `developer` when classified intent maps to a different agent
- **Agent handoff via artifacts + TaskUpdate metadata:** Agents communicate through files at workspace-convention-compliant paths plus structured metadata in TaskUpdate calls

**Alternatives Considered:**

1. **Keep current ad-hoc routing (status quo):** Rejected. 94% agent under-utilization makes the multi-agent architecture pointless. No quality gates, no post-implementation review.
2. **Full LangGraph runtime integration:** Rejected. Would require a Python runtime and external dependency. The existing Task/TaskUpdate infrastructure provides equivalent state management capability.
3. **CrewAI-only approach (role-based, no state machine):** Rejected. CrewAI crews lack quality gates between phases. State machine ensures each phase completes before the next begins.
4. **Event-driven architecture (pub/sub between agents):** Rejected for now. The file-based blackboard pattern (workflow-state.json + artifact files) is simpler and works within Claude Code's single-conversation model. Event-driven could be added later as an optimization.

**Rationale:**

- The hybrid approach (LangGraph state machine + CrewAI role-based teams) combines the strengths of both frameworks
- File-based state (workflow-state.json) survives context resets -- critical for long-running workflows
- Quality gates enforce multi-agent collaboration rather than making it optional
- Complexity-based phase skipping prevents overhead for simple tasks (TRIVIAL tasks still get just developer + devops)
- The design uses ONLY existing infrastructure (Task, TaskUpdate, TaskList, file system) -- no new external dependencies
- Block-mode enforcement is the single highest-impact change: it immediately forces the Router to use planner and security-architect

**Consequences:**

- **Positive:** Agent utilization increases from 2% to 24%+ (12 unique agent types activated)
- **Positive:** Every code change gets at least one independent review (code-reviewer, qa, or security-architect)
- **Positive:** Architectural decisions are captured in design documents before implementation
- **Positive:** Memory system (learnings, decisions, issues) is actively maintained by reflection-agent
- **Positive:** Workflow state survives interruptions -- no lost progress on context reset
- **Negative:** API costs increase (3-10 agents per request vs 1 today)
- **Negative:** Task completion time increases (multi-phase review adds latency)
- **Negative:** Router complexity increases (must manage state machine transitions)
- **Mitigated:** Complexity-based skipping keeps simple tasks fast (TRIVIAL: 2 agents, 1-2 turns)

**Implementation Plan:** `.claude/context/plans/enterprise-orchestration-plan-2026-02-06.md`
**Workflow Document:** `.claude/workflows/core/enterprise-workflow.md`
**Depends On:** ADR-079 (Agent Utilization Remediation Strategy)

---

## ADR-101: Specialist-First Routing Enforcement

**Date:** 2026-02-07

**Status:** Accepted

**Context:**

Router defaults to `developer` for 80%+ of tasks, leaving 49 specialist agents underutilized. The routing table and Step 6.5 "Developer Override Check" exist in documentation but are not programmatically enforced.

**Decision:**

1. Add `checkSpecialistOverride()` (Check 7) to routing-guard.cjs that warns when developer is spawned for specialist-matchable tasks
2. Add "SPECIALIST-FIRST ROUTING LAW" as an iron law in CLAUDE.md
3. Strengthen Step 6.5 in router-decision.md to be mandatory

**Enforcement:**

SPECIALIST_ROUTING_ENFORCEMENT=warn (default), escalate to block after validation

**Consequences:**

Router receives programmatic feedback when misrouting. Combined with planner's Target Agent annotations, this creates a two-layer specialist matching system.

---

## ADR-103: Test-Driven Integration Boundary Verification

**Date:** 2026-02-08

**Status:** Proposed

**Context:**

Task #9 (Memory Management System Rebuild) implemented 4 modules with 41 passing unit tests. Task #13 (Bug Fix) discovered 2 integration bugs that the unit tests had missed:

1. `pruneResult.entriesRemoved` vs actual `pruneResult.removed` (field name mismatch)
2. `{ similarityThreshold: 0.6 }` vs actual `{ threshold: 0.6 }` (parameter key mismatch)

Both bugs were found by **human code review**, not automated tests. This revealed that TDD's strength (module isolation) created a blind spot for integration contract mismatches.

**Problem:**

Unit tests validate internal module logic by mocking external dependencies. These mocks are based on test assumptions, not actual implementations. When Module A's test assumes Module B returns `{ removed: count }`, but Module B actually returns `{ entriesRemoved: count }`, the unit tests pass but integration fails. The mismatch only appears when code paths actually execute together (real integration, no mocks).

**Decision:**

1. **Extend TDD to include "Integration Verification Phase"**
   - After unit tests pass, write integration tests using REAL modules (not mocks)
   - Test actual function contracts: parameter names, return field names, error cases
   - Before declaring feature complete, verify integration with actual callee interfaces

2. **Document contracts explicitly for integration points**
   - Each integration boundary must define expected parameters and return values
   - Example: `const PRUNER_CONTRACT = { deduplicate: { params: { entries: 'array', threshold: 'number' }, returns: { removed: 'number' } } }`
   - Add runtime validation to detect contract violations immediately

3. **Create integration test template for multi-module systems**
   - Location: TDD skill + new test template directory
   - Template shows: load real modules → call with production parameters → verify contracts
   - Include checklist: parameter names, field names, error cases, bidirectional error handling

4. **Update TDD skill and spawn templates**
   - Add "Integration Verification Phase" to TDD guidance
   - Document when to use integration tests vs unit tests
   - Include examples of contract violation detection

**Rationale:**

- Integration bugs caught during development (TDD phase) instead of code review (detection lag)
- False confidence eliminated: passing tests actually mean integration works
- Tests become contract specifications (executable documentation)
- Future refactoring won't break contracts silently (contract validation would fail immediately)
- Small cost (integration tests are 10-20% of unit test time) with high benefit (catch bugs early)

**Consequences:**

- **Positive:** Integration bugs caught immediately during development (not in code review)
- **Positive:** Test suite becomes true quality gate (passing tests guarantee integration)
- **Positive:** Contracts documented and validated automatically
- **Positive:** Future developers won't repeat Task #9→Task #13 pattern
- **Negative:** Slightly longer TDD cycle (add 20-30 minutes for integration verification per feature)
- **Negative:** Some integration tests will be harder to write (e.g., system-level contracts)
- **Mitigated:** Template reduces boilerplate, most integration tests are simple

**Implementation Plan:**

1. Immediately: Create integration test template for memory management modules (fix Task #9 gap)
2. Update TDD skill with Integration Verification Phase section
3. Add integration contract patterns to patterns.json
4. Document lesson in issue tracker
5. Future multi-module features (workflow, routing, etc.) should follow this pattern

**Cross-References:**

- Task #9: Memory Management System Rebuild (missed integration verification)
- Task #13: Bug Fix - 2 Wiring Bugs (discovered by code review, not tests)
- learnings.md: "TDD Integration Boundary Testing Gap"
- issues.md: "Unit Test Isolation Can Hide Integration Bugs"

---

## ADR-104: Unified Ecosystem Creation Protocol

**Date:** 2026-02-08

**Status:** Proposed (Phase 1A analysis complete, pending implementation)

**Context:**

Task #14 (Phase 1A) analyzed the complete creator ecosystem and discovered critical gaps:

1. **12 artifact types exist but only 6 (50%) have creator skills.** Missing: commands, rules, tools, config entries, catalogs, @docs.
2. **Cross-creator triggering is entirely ADVISORY.** Each creator's "Cross-Reference: Creator Ecosystem" section says "consider if companion creators are needed" but provides no enforcement, automation, or blocking mechanism.
3. **artifact-integrator runs post-hoc**, detecting integration gaps AFTER creation rather than preventing them during creation.
4. **5 non-existent updater skills** are referenced by creators (agent-updater, skill-updater, hook-updater, workflow-updater, schema-updater), creating dead-end workflows when Step 0 existence checks find existing artifacts.
5. **~1,400 lines (20%) of creator SKILL.md content is duplicated** across all 6 creators (Memory Protocol, Iron Laws, Cross-Reference table, etc.).

**Problem:**

When an agent is created via agent-creator, the creator does NOT automatically create/update the agent's skills, hooks, workflows, templates, schemas, commands, or rules. This leads to "orphaned" artifacts -- fully created but disconnected from the broader ecosystem. The 70% orphan rate (measured by artifact-integrator) is a direct consequence of advisory-only cross-triggering.

**Decision:**

Implement a 4-phase Unified Ecosystem Creation Protocol:

1. **Phase 1: Ecosystem Impact Graph (ecosystem-impact-graph.json)**
   - Central configuration mapping every artifact type to its related artifact types
   - For each relationship: trigger type (BLOCKING, ADVISORY, CONDITIONAL), suggested creator, expected outputs
   - Example: creating an agent BLOCKING-triggers skill-creator (agent needs at least one skill), ADVISORY-triggers hook-creator (agent may need enforcement), CONDITIONAL-triggers command-creator (if agent has user-facing interaction)
   - All 6 existing creators read this graph at creation time

2. **Phase 2: Ecosystem Impact Analyzer (ecosystem-impact-analyzer.cjs)**
   - New hook that runs BEFORE creation begins (PreToolUse on Write/Edit for creator paths)
   - Reads ecosystem-impact-graph.json and the artifact being created
   - Generates an "impact analysis" listing all related artifact types that need review
   - BLOCKING triggers halt creation until companion artifacts are queued
   - Replaces advisory "consider" with automated "you MUST" analysis

3. **Phase 3: Missing Creator Skills**
   - P1: command-creator (17 commands exist, pattern is thin-delegation YAML, straightforward)
   - P2: rule-creator (11 rules exist, pattern is markdown with constraints)
   - P3: tool-creator (66 tools exist, most complex due to CLI wiring requirements)
   - Each follows the established creator pattern (research-synthesis prerequisite, post-creation steps, Iron Laws)

4. **Phase 4: Shared Creator Base**
   - Extract ~1,400 lines of duplicated content into a shared `creator-common.md` partial
   - All 6+ creators reference the partial instead of duplicating
   - Ensures consistency when shared patterns change (one update propagates to all)

**Alternatives Considered:**

1. **Keep advisory cross-triggering (status quo):** Rejected. 70% orphan rate demonstrates advisory approach fails. Agents ignore "consider" suggestions.
2. **Make artifact-integrator blocking instead of post-hoc:** Rejected. artifact-integrator runs after creation; blocking it would mean artifacts get created but then stuck in limbo. Better to prevent gaps before creation.
3. **Single monolithic creator that handles all artifact types:** Rejected. Would create a 10,000+ line skill, impossible to maintain. Modular creators with shared infrastructure is more maintainable.
4. **Event-driven pub/sub between creators:** Rejected for now. Over-engineered for the current file-based architecture. The impact graph + analyzer provides equivalent functionality with simpler implementation.

**Rationale:**

- The impact graph is declarative and easily extensible (add new artifact types by adding JSON entries)
- The analyzer hook leverages existing hook infrastructure (PreToolUse pattern, stdin/stdout protocol)
- Missing creators follow established patterns (6 exemplars to copy from)
- Shared base eliminates duplication while preserving per-creator specialization
- Each phase delivers incremental value (Phase 1 alone improves cross-triggering visibility)

**Consequences:**

- **Positive:** Cross-creator triggering becomes automated and enforceable (not advisory)
- **Positive:** New artifact types can be added by updating ecosystem-impact-graph.json (extensible)
- **Positive:** 3 missing creators cover the most-used uncovered artifact types (commands, rules, tools)
- **Positive:** 20% duplication across creators eliminated by shared base
- **Positive:** Orphan rate should decrease from 70% to under 20%
- **Negative:** Implementation requires 6 new components (graph config, analyzer hook, 3 creators, shared base)
- **Negative:** BLOCKING cross-triggers increase creation time (more companion artifacts to review/create)
- **Mitigated:** CONDITIONAL triggers are smart -- only fire when contextual analysis suggests need

**Implementation Priority:**

1. P0: ecosystem-impact-graph.json (foundation for everything else)
2. P1: ecosystem-impact-analyzer.cjs (enforcement mechanism)
3. P1: command-creator (highest demand missing creator)
4. P2: rule-creator + shared creator-common.md
5. P3: tool-creator

**Cross-References:**

- Task #14: Phase 1A Architecture Analysis (this ADR's source)
- Task #16: Phase 1C Creator Skills Complexity Audit (confirms duplication findings)
- ADR-100: Cross-Artifact Integration System (predecessor, focused on post-hoc detection)
- Report: `.claude/context/reports/architecture/ecosystem-creation-protocol-design-2026-02-08.md`
- Report: `.claude/context/reports/architecture/creator-skills-complexity-audit-2026-02-08.md`
