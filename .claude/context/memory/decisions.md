# Decisions

This file records architectural decisions and their rationale (ADRs).

## Format

Each decision should include:

- Date
- Decision made
- Context/problem
- Rationale
- Consequences

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

## ADR-076: Simple 50-Line Chunking for BM25-Only Mode

**Date:** 2026-02-05

**Status:** Accepted

**Context:**
Code indexer OOMed at 4GB heap when processing 600+ files using `parseInProcess` (CodeParser + SemanticChunker) in BM25-only mode. Investigation revealed:

- parseInProcess uses tree-sitter AST parsing + semantic boundary detection
- Creates large intermediate objects and native allocations
- Memory grows unbounded with file count
- BM25 is lexical search and doesn't benefit from semantic boundaries

**Decision:**
Replace `parseInProcess` with simple 50-line chunking in BM25-only sync fast-path:

```javascript
const lines = content.split('\n');
for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 50) {
  const text = lines
    .slice(lineIdx, lineIdx + 50)
    .join('\n')
    .trim();
  if (text.length === 0) continue;
  chunks.push({ id: `${relPath}:${lineIdx}`, text });
}
```

**Rationale:**

1. **BM25 is Lexical:** Pure term frequency matching; semantic boundaries irrelevant
2. **Uniform Chunks Better:** BM25 length normalization assumes uniform distribution
3. **Minimal Allocations:** No parser overhead, only string slices
4. **Proven Pattern:** Tested in scratchpad/rebuild-index.cjs (success at 2011 files)
5. **Memory Safety:** O(chunk_size) not O(file_size) memory usage

**Alternatives Considered:**

1. **Keep parseInProcess, increase heap:** Rejected (unbounded growth, only delays OOM)
2. **Modify BM25 to not store text:** Rejected (requires search result re-reading from disk)
3. **Worker pool with memory limits:** Rejected (already in-process when concurrency=1)
4. **Checkpoint-based multi-run:** Rejected (index too large to resume from checkpoint)

**Consequences:**

- ✅ **Positive:** 60x memory reduction (4GB → 120MB), 10x speed increase
- ✅ **Positive:** Unblocks full codebase indexing (1330+ files)
- ✅ **Positive:** More uniform chunk lengths improve BM25 scoring
- ⚠️ **Neutral:** AST chunking still used in embedding mode (semantic search)
- ❌ **Negative:** Chunk boundaries ignore function/class boundaries in BM25 mode

**Verification:**

- Test: 1330 files indexed in 19.5 seconds, 120MB peak memory
- Search: BM25 returns relevant results for test queries
- Memory: No OOM at any file count
- Speed: 68 files/sec average (vs 7 files/sec with parseInProcess)

**Implementation:**

- File: `.claude/lib/code-indexing/index-manager.cjs`
- Lines: ~458-466 (sync fast-path block)
- Condition: `if (this.vectorStore.embeddingMode === 'off')`

---

## ADR-081: Context Directory Cleanup (2026-02-06)

**Date:** 2026-02-06

**Status:** Accepted

**Context:**

Comprehensive wiring audit (Task #46 Phases 1-2) found 17 suspicious directories/files in `.claude/context/`. Most were wired and actively used, but 2 were truly dead (zero references). Reports were scattered across two locations (`artifacts/reports/` and `reports/[domain]/`). Workflows test fixtures were misplaced in production directory.

**Decision:**

**Deleted** (zero references found):

- `code-indexing/` — Legacy directory; active indexer uses `code-index/`
- `ml/` — Optional ML features never activated

**Moved**:

- `workflows/checkpoints/test-*` → `tests/fixtures/checkpoints/` (test fixtures, not production state)
- `artifacts/reports/` → consolidated into `reports/[domain]/` (single canonical location)
- 28 root-level reports → organized into `reports/architecture/`, `reports/qa/`, `reports/reflections/`

**Kept** (verified actively wired):

- `backups/` — Created on-demand by saga-coordinator.cjs for rollback checkpoints
- `sessions/` — Used by consensus-voting and swarm-coordinator for session state
- `memory/stm/` — STM tier: session data written by user-prompt-unified.cjs
- `memory/ltm/` — LTM tier: summarized session data written by memory-tiers.cjs
- `memory/named/` — Named memory API: readMemory/writeMemory (CLAUDE.md Section 8)
- `self-healing/` — anomaly-detector and loop-state-manager write anomaly logs/state
- `teams/` — Party mode team definitions (swarm-coordinator)
- `config/` — All 4 config files actively read by generators/validators
- `agent-catalog.json` — Generated simplified view of agent-registry.json (NOT duplicate)
- `evolution-state.json` — Evolution workflow state machine
- `reflection-queue.jsonl` — Core reflection pipeline

**Documentation Updates**:

- `FILE_PLACEMENT_RULES.md` — Updated report paths to canonical `reports/[domain]/`
- `workspace-conventions.md` — Removed "legacy reports" note; consolidated location is now standard
- `@DIRECTORY_STRUCTURE.md` — Added explanatory comments for empty-but-wired directories, added `reports/reflections/`, noted `agent-catalog.json` is generated (not duplicate), documented deleted directories

**Rationale:**

Audit found only 2 truly dead directories out of 17. Most "empty" directories are on-demand (wired but waiting for trigger events). Consolidating reports to single canonical location (`reports/[domain]/`) eliminates confusion and ensures workspace-conventions compliance.

**Consequences:**

- ✅ **Positive:** Single canonical report location (no more artifacts/reports/ vs reports/ confusion)
- ✅ **Positive:** Test fixtures correctly placed in tests/ directory
- ✅ **Positive:** Documentation explains why empty directories exist (on-demand wiring)
- ✅ **Positive:** Zero dead code in context/ (only 2 dirs deleted after comprehensive audit)
- ⚠️ **Neutral:** agent-catalog.json clarified as generated view (not duplicate to delete)
- ⚠️ **Neutral:** Empty directories preserved with explanations (wired for future use)

**Related Tasks:**

- Task #46 (Context Directory Cleanup - comprehensive wiring audit)
- ADR-076 (Workspace Conventions and Directory Reorganization)

---

## ADR-086: Template-Creator Overhaul to v2.1 Creator Standard

**Date:** 2026-02-07

**Status:** Accepted

**Context:**

The agent-studio project has six creator skills (agent-creator, skill-creator, workflow-creator, hook-creator, schema-creator, template-creator). Five have been updated to follow a consistent v2.1 pattern with research-synthesis integration, blocking post-creation steps, catalog updates, integration verification, and architecture compliance references. The template-creator remains the sole outlier.

Gap analysis identified 11 specific gaps (GAP-1 through GAP-11):
1. Missing research-synthesis invocation (Phase 0)
2. Missing template-catalog.md update as blocking step
3. Missing integration verification step
4. Missing CLAUDE.md update as blocking step
5. Missing Architecture Compliance section
6. Missing consumer assignment step
7. Template types table does not match filesystem
8. Missing security considerations
9. Weak system impact analysis (4-point vs 6-8-point)
10. No spawn-template-resolver integration reference
11. Missing research-synthesis mandate from CLAUDE.md Section 3

**Decision:**

Overhaul template-creator SKILL.md to match the common creator pattern:

1. Add WARNING BOX preventing direct writes (matching skill-creator pattern)
2. Add research-synthesis invocation as mandatory Step 0
3. Add template-catalog.md update as blocking Step 9
4. Add CLAUDE.md update as conditional blocking Step 10
5. Add consumer assignment as Step 11
6. Add integration verification as blocking Step 13
7. Add Architecture Compliance section (ADR-076, ADR-077, SEC-TMPL-006)
8. Add Template Security Compliance section
9. Expand Iron Laws from 8 to 11
10. Expand Completion Checklist from 6 to 15 items
11. Expand System Impact Analysis from 4-point to 7-point
12. Update Template Types table to match filesystem reality
13. Add spawn-template-resolver cross-reference

**Rationale:**

- Consistency across all six creators reduces cognitive load for agents
- Blocking steps prevent "invisible artifact" pattern (proven by Party Mode incident)
- Template catalog integration makes templates discoverable programmatically
- Security compliance ensures no credential leakage through template content
- Research-synthesis mandate is a CLAUDE.md requirement, not optional

**Consequences:**

- Template creation workflow becomes longer (13 steps vs 9 steps)
- Every template creation now updates the catalog (additional ~30 seconds)
- Integration verification adds a blocking gate before completion
- Full parity with other creators achieved

**Alternatives Considered:**

1. Minimal update (just add catalog step): Rejected because it would leave 10 other gaps open
2. Merge template-creator into skill-creator: Rejected because templates serve distinct consumers and have unique validation needs
3. Make all steps non-blocking (warnings only): Rejected because the Party Mode incident proved warnings are insufficient

**Architecture Plan:** `.claude/context/plans/template-creator-overhaul-architecture-2026-02-07.md`

---
