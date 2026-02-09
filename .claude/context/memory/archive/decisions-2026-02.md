# Decisions Archive (February 2026)

> Archived ADRs from decisions.md rotation on 2026-02-07.
> To restore an ADR, copy it back to decisions.md

---

## ADR-095: Workflow System Security Hardening -- Prompt Sanitization, State Integrity, Env Var Restriction

**Date:** 2026-02-07

**Status:** Proposed (Security Assessment Complete: 2026-02-07)

**Context:**

Pipeline #13 Workflows System Deep Dive security assessment (Task #115) found 5 HIGH, 5 MEDIUM, 4 LOW findings across the `.claude/workflows/` subsystem (54 files, 7 subdirectories). Security Score: 62/100 (CONDITIONAL PASS). The workflow orchestration layer controls agent execution flow, model selection, tool access, and quality gates. Key vulnerability classes: prompt injection via spawn templates, workflow state file tampering, phase-advance signal injection, environment variable security bypass, and complexity downgrade bypass.

**Decision:**

1. **P1 -- Centralized Prompt Sanitization:** Create `sanitizePromptContent()` in `.claude/lib/utils/prompt-sanitizer.cjs` to strip injection patterns from user content before embedding in spawn prompts. This addresses the SYSTEMIC prompt injection issue found in Pipelines #11 (agents), #12 (context), and #13 (workflows).

2. **P1 -- State File Integrity:** Add HMAC verification to `workflow-state.json` and `phase-advance.json` reads/writes. Replace `JSON.parse()` with `safeJSONParse()` in `post-completion-chain.cjs`. Add JSON Schema validation for all runtime state files.

3. **P1 -- Phase-Advance Authentication:** Add a source token to `phase-advance.json` signals that only `post-completion-chain.cjs` can generate. The Router must verify this token before accepting phase advancement.

4. **P1 -- Environment Variable Hardening:** Remove `HOOK_FAIL_OPEN` master bypass. Restrict remaining override env vars to CI-only contexts (document in `.env.example` with warnings). Consider a single `SECURITY_ENFORCEMENT_MODE` variable instead of 8 individual overrides.

5. **P1 -- Complexity Classification Integrity:** Add integrity checks to complexity classification output. Ensure security review is ALWAYS required regardless of complexity when the request involves auth/credentials/security-critical code.

6. **P2 -- Quality Gate Independence:** Replace self-reported quality gate metrics with independent verification (e.g., run `pnpm test` instead of trusting `metadata.testsPassing`).

7. **P2 -- Structured Agent Detection:** Replace string-matching agent detection in `routing-guard.cjs` with `subagent_type` parameter inspection.

**Rationale:**

- Prompt injection is the most widespread vulnerability (found in 3 of 3 subsystem audits)
- State integrity is critical because file-based state is the backbone of enterprise workflow execution
- Environment variable bypasses negate ALL security enforcement when set
- Self-reported quality gates provide no real assurance

**Consequences:**

- All spawn prompts will have user content sanitized (may slightly alter prompt wording)
- State file reads/writes become ~1ms slower (HMAC computation)
- Reduced operational flexibility (fewer env var overrides)
- Quality gates become meaningfully enforced (may slow phase transitions)

**Security Report:** `.claude/context/reports/security/workflows-security-review-2026-02-07.md`

---

## ADR-094: Context System Overhaul -- Artifact Archive, Dead File Cleanup, JSONL Rotation

**Date:** 2026-02-07

**Status:** Accepted (P1 Implementation Complete: 2026-02-07)

**Context:**

Comprehensive audit of `.claude/context/` (Pipeline #12, Task #110) found 371 files across 58 directories. The operational core (memory, runtime, metrics, code-index) is healthy (94-100% health scores), but the `artifacts/` subdirectory has accumulated 217 files with ~45 having zero real consumers. ADR-081 report consolidation was partial -- 15+ files remain in old locations. The `plans/` directory contains 7 abandoned random-hash directories from the QA workflow skill. A Windows reserved filename (`nul`, 0 bytes) exists at context root.

**Decision:**

1. **P0 (Immediate):** Delete `nul` file, 7 orphaned plan directories, empty `workflows/` directory, 2 duplicate root-level artifact files
2. **P1 (Same day):** Create `artifacts/_archive/`, archive 19+ dead artifact files (deployment-docs, code-styleguides, audit-logs, audits, qa-reports, risk-assessments)
3. **P1 (Same day):** Move 16 misplaced files to canonical ADR-081 locations (artifacts/reflections/ -> reports/reflections/, artifacts/security-reviews/ -> reports/security/, etc.)
4. **P1 (Same day):** Rewrite `reports/README.md` to reflect actual directory structure
5. **P2 (Next day):** Add JSONL rotation for reflection-queue.jsonl, hook-metrics.jsonl, router-violations.jsonl using existing jsonl-utils.cjs rotation support
6. **P2 (Next day):** Document `data/` directory in FILE_PLACEMENT_RULES.md and workspace-conventions.md
7. **P3 (This week):** Add cleanup logic to QA workflow skill for hash-named temporary plan directories

**Rationale:**

- `nul` file is a critical Windows compatibility issue (reserved name prevents git clone)
- Archive pattern follows proven precedent from Pipelines #3, #6, #7 (tools, templates, schemas)
- File moves complete the ADR-081 consolidation that was left partial
- JSONL rotation prevents unbounded growth (reflection-queue already at 1029 lines, above 1000-line soft limit)
- QA skill cleanup prevents future plan directory pollution

**Consequences:**

- Context directory goes from 371 to ~340 files (8% reduction)
- artifacts/ goes from 217 to ~175 files (19% reduction)
- plans/ goes from 10 to 3 entries (70% reduction)
- reports/ becomes sole canonical report location (ADR-081 complete)
- JSONL files gain rotation preventing unbounded growth

**Architecture Plan:** `.claude/context/reports/architecture/context-system-audit-2026-02-07.md`

**Implementation:**

- **Task #112 (P0+P1 Cleanup)**: Deleted `nul` file, 7 orphaned plan directories (impl-plan-kHwypz, progress-WuHjJL, qa-report-EjOE7P, qa-report-c05Ene, qa-report-eiwkdm, test-plan-DCyOsO, test-plan-zHYXQi), 1 dead audit file (CREATOR-SKILLS-AUDIT.md). All misplaced report files moved to canonical `reports/{domain}/` locations. Regression tests confirmed proper file placement.

- **Task #113 (Documentation & Governance)**: Updated FILE_PLACEMENT_RULES.md with all missing context subdirectories (data/, memory/archive/, memory/metrics/, memory/named/, memory/stm/mtm/ltm/, artifacts/diagrams/, artifacts/error-reports/, artifacts/error-summaries/, artifacts/specs/, code-index/, self-healing/, teams/). Updated workspace-conventions.md to document data/ directory and clarify tmp/ cleanup is manual (not automated). Rewrote reports/README.md to accurately reflect current structure (architecture/, qa/, security/, reflections/). Updated active_context.md to reflect current framework state (49 agents, ~30 skills, Pipeline #12 progress). Changed ADR-094 status from "Proposed" to "Accepted" with implementation notes.

**P2/P3 Remaining:** JSONL rotation for reflection-queue.jsonl, hook-metrics.jsonl, router-violations.jsonl (P2). QA workflow skill cleanup logic for hash-named directories (P3).

---

## ADR-091: Rules System Overhaul -- Expand Thin Rules, Fix Path Conflicts, Add Missing Protocol Rules

**Date:** 2026-02-07

**Status:** Accepted (Implementation Complete: 2026-02-07)

**Context:**

Comprehensive audit of `.claude/rules/` (Enterprise Pipeline #9) found 9 rule files totaling ~128 lines. Rules in Claude Code are auto-loaded into every conversation's system prompt. Key findings:

1. **7 of 9 rules are extremely thin** (3-7 lines each), providing minimal actionable guidance
2. **Critical path conflict:** `workspace-conventions.md` says plans go to `context/plans/` and reports to `context/reports/{domain}/` (correct per ADR-078, ADR-081), but `FILE_PLACEMENT_RULES.md` (stale v2.0) says `context/artifacts/plans/` and `context/artifacts/reports/` respectively
3. **`agents.md` lists 7 agents when 49 exist** -- severely outdated
4. **`rule-index.json` missing `workspace-conventions.md`** (8 indexed, 9 exist) -- the most-referenced rule file in the project is invisible to programmatic discovery
5. **No rules for memory protocol or task tracking** -- the two most critical agent behavioral requirements (CLAUDE.md Sections 8 and 5.5-5.6) have no rule coverage
6. **`coding-style.md` and `patterns.md` overlap** -- both cover "how to write code" in 3-5 bullet points

**Decision:**

1. **UPDATE 6 rules** (agents.md, git-workflow.md, hooks.md, performance.md, security.md, testing.md) -- expand from 3-7 lines to 8-15 lines each with project-specific directives
2. **MERGE 2 rules** (coding-style.md + patterns.md) into `code-standards.md` -- eliminates overlap, creates single authoritative code conventions file
3. **CREATE 2 new rules** (`memory-protocol.md`, `task-tracking.md`) -- covers the two most critical agent behavioral gaps
4. **FIX path conflicts** in `FILE_PLACEMENT_RULES.md` (plan path, report path) to match `workspace-conventions.md` (canonical per ADR-078, ADR-081)
5. **FIX rule-index.json** to include `workspace-conventions.md` and populate empty description fields
6. **KEEP `workspace-conventions.md`** unchanged -- accurate, well-integrated, referenced by 46+ agents

**Alternatives Considered:**

1. **Leave rules as-is:** Rejected -- thin rules provide minimal value. The memory protocol and task tracking gaps are critical.
2. **Move all rules into CLAUDE.md:** Rejected -- CLAUDE.md is already large (~5,000 lines compressed). Rules auto-load separately and are more maintainable as individual files.
3. **Create granular per-agent rules with glob patterns:** Rejected -- Claude Code rules do not support per-agent loading. All rules load for every conversation.
4. **Delete thin rules, keep only workspace-conventions:** Rejected -- even thin rules serve as reminders. Expanding them is better than removing them.

**Rationale:**

- Rules auto-load into every conversation, making them the most reliable way to enforce cross-cutting conventions
- Memory protocol and task tracking are mandatory for every agent but currently only documented in CLAUDE.md (which spawned agents may not fully absorb)
- Merging coding-style + patterns reduces rule count while increasing per-rule value
- Path conflict fixes prevent agents from writing artifacts to wrong locations
- Expanding thin rules from 3-7 to 8-15 lines adds ~950 tokens to system prompt -- acceptable given the value of consistent enforcement

**Consequences:**

- Rule count changes from 9 to 10 (merge 2 into 1, create 2 new)
- System prompt token load increases by ~950 tokens (from ~1,100 to ~2,050)
- FILE_PLACEMENT_RULES.md becomes consistent with workspace-conventions.md
- rule-index.json becomes complete (10 of 10 rules indexed)
- All conversations receive memory protocol and task tracking reminders automatically
- TDD regression test prevents future rule-index drift

**Architecture Plan:** `.claude/context/plans/rules-overhaul-architecture-2026-02-07.md`

---

## ADR-090: Scripts System Overhaul -- Phantom Import Fix, Script Merge, Wiring Gaps

**Date:** 2026-02-07

**Status:** Accepted

**Context:**

Audit of both `scripts/` (project root, 30 files) and `.claude/scripts/` (framework, 5 files) found 35 script files totaling 4,920 lines. The wrapper-shim delegation pattern is sound (11 root-level 6-line shims delegate to subdirectory implementations). 20 package.json entries wire most scripts. However, the Phase C consumer update from the Tools Overhaul (ADR-089) missed 2 scripts: `validate-index.mjs` still imports from the old `.claude/tools/context/` path, and `validate-all-references.mjs` checks for 3 workflow files at their old `.claude/tools/workflow/` locations. Additionally, `validate-index.mjs` overlaps entirely with `validate-rule-index-paths.mjs` (which is a superset). 4 scripts lack package.json entries. 1 script (`benchmark-ml-performance.cjs`) is dead with a broken relative path. The `validate:full` CI chain is broken at step 5 due to the phantom import.

**Decision:**

1. Merge `validate-index.mjs` into `validate-rule-index-paths.mjs` (eliminate overlap + fix phantom import)
2. Archive `validate-index.mjs` to `scripts/validation/_archive/`
3. Update `validate:index` npm script to point to `validate-rule-index-paths.mjs`
4. Fix 3 phantom references in `validate-all-references.mjs` (tools/workflow/ -> lib/workflow/)
5. Add 3 missing npm scripts: `verify:deps`, `test:count`, `verify:hooks`
6. Archive dead `benchmark-ml-performance.cjs`
7. Create TDD regression test for script import resolution (prevents future phantom imports)
8. **[NEW]** Fix MEDIUM-001 security vulnerability: path traversal in install.mjs
9. **[NEW]** Add Windows compatibility note to validate-sync.sh (GAP-6)

**Rationale:**

- Merging overlapping scripts reduces confusion and fixes the `validate:full` CI chain
- Phantom import fixes follow the same pattern as Phase C of ADR-089 (consumer path updates)
- Wiring unwired scripts makes them discoverable via `pnpm` (consistent with project convention)
- TDD regression test prevents recurrence (proven pattern from ADR-089)
- Path traversal fix addresses MEDIUM severity security finding from Pipeline #8 security review
- Windows compatibility note prevents user frustration with bash-only scripts

**Consequences:**

- Scripts directory goes from 35 to 34 files (1 merge/archive)
- `validate:full` CI chain restored to working (currently broken at step 5)
- All scripts discoverable via `pnpm` (3 new entries)
- 1 dead script archived (benchmark-ml-performance.cjs)
- Regression test guards import resolution across all scripts
- Path traversal vulnerability mitigated with TDD regression test
- Cross-platform documentation improved

**Implementation (2026-02-07):**

**Phase A (Task #99 - completed):**

- Fixed GAP-1 (CRITICAL): validate-index.mjs phantom import
- Fixed GAP-2: validate-all-references.mjs phantom paths
- Fixed GAP-3: Archived dead benchmark-ml-performance.cjs
- Fixed GAP-4: Merged overlapping validators
- Created TDD regression test: `tests/scripts/script-imports.test.cjs`

**Phase B (Task #100 - completed):**

- Fixed GAP-5: Added 3 package.json scripts (`verify:deps`, `test:count`, `verify:hooks`)
- Fixed MEDIUM-001: Path traversal validation in install.mjs with TDD test
- Fixed GAP-6: Windows compatibility note in validate-sync.sh
- Fixed typo: `_statSync` → `statSync` in install.mjs

**Evidence:**

- Task #99: 2 scripts fixed, 2 scripts archived, 1 test created (passes)
- Task #100: 3 package.json entries added, 1 security fix with test (4/4 tests pass), 1 documentation fix
- Learnings recorded: `.claude/context/memory/learnings.md`

**Architecture Plan:** `.claude/context/plans/scripts-overhaul-architecture-2026-02-07.md` (note: plan document not found, but work completed per ADR)

**Reflection (Task #102):**

- Batch reflection completed 2026-02-07
- Overall score: 0.9725 / 1.0 (EXCELLENT)
- All 6 gaps verified as fixed
- 3 patterns extracted, 3 gotchas recorded
- Report: `.claude/context/artifacts/reflections/batch-reflection-pipeline-8-scripts-2026-02-07.md`

---

## ADR-089: Tools System Overhaul -- Dead Tool Cleanup, Phantom Script Fix, Location Corrections

**Date:** 2026-02-07

**Status:** Accepted

**Context:**

Audit of `.claude/tools/` found 88 source files across 13 subdirectories. Only 28% (26 tools) are actively wired through code paths (hooks, lib/, package.json). 34% (32 tools) are dead (zero references). 9 package.json scripts reference files that do not exist (phantom scripts), breaking 15 npm commands. 3 files are stubs with placeholder code (1-8 lines). 7 library modules are misplaced in tools/ instead of lib/. No tool catalog exists. Documentation is stale.

**Decision:**

1. Archive 25 dead CLI tools to `.claude/tools/_archive/` via `git mv`
2. Delete 3 stub files (1-8 lines of mock code)
3. Delete 6 `__pycache__/` directories and add to `.gitignore`
4. Remove 15 broken package.json scripts referencing 9 phantom files
5. Add 11 missing package.json scripts for wired-but-unscripted tools
6. Move 8 library modules from `tools/` to `lib/` (update all importers)
7. Create tool catalog at `.claude/context/artifacts/catalogs/tool-catalog.md`
8. Rewrite tools README with complete inventory
9. Fix `@DIRECTORY_STRUCTURE.md` tools section

**Rationale:**

- Archive via `git mv` is the proven pattern (templates Pipeline #3, schemas Pipeline #6)
- Removing phantom scripts prevents developer confusion and CI failures
- Moving library modules to `lib/` enforces the `tools/ = CLI scripts, lib/ = importable modules` boundary
- Tool catalog provides discoverability consistent with skill/template/command/schema catalogs
- Adding missing package.json scripts makes existing tools discoverable via `pnpm`

**Consequences:**

- Tools directory goes from 88 to ~55 files (37% reduction)
- Active package.json script count goes from ~73 to ~69 (remove 15 phantom, add 11 real)
- Zero broken npm scripts (currently 15 broken)
- All library modules correctly located in `lib/`
- Complete tool catalog for agent/human discovery

**Implementation (2026-02-07):**

**Phase A (Task #93):**

- Deleted 3 stub files via `git rm`
- Deleted 3 `__pycache__/` directories
- Removed 12 phantom package.json scripts (referencing 9 missing files)
- Created TDD regression test: `tests/tools/phantom-scripts.test.cjs` (prevents future phantom scripts)

**Phase B (Task #94):**

- Archived 25 dead tools to `.claude/tools/_archive/` via `git mv`
- Created `.claude/tools/_archive/README.md` with restoration instructions
- History preserved for all archived tools

**Phase C (Task #95):**

- Relocated 8 library modules from `tools/` to `lib/` via `git mv`:
  - `skills-core.js` → `lib/skills/`
  - `swarm-coordination.cjs` → `lib/coordination/`
  - `context-path-resolver.mjs` → `lib/utils/`
  - `gate.mjs` → `lib/qa/`
  - `decision-handler.mjs` → `lib/workflow/` (+ SEC-TOOL-001 fix)
  - `loop-handler.mjs` → `lib/workflow/`
  - `workflow-runner.js` → `lib/workflow/`
- Updated all 45+ consumer imports
- Fixed SEC-TOOL-001: Replaced `new Function()` with SafeExpressionParser in `decision-handler.mjs`
- Created 41 security tests for SafeExpressionParser
- Commit: `789f849c` (45 files changed, 946 insertions, 297 deletions)

**Phase D (Task #96):**

- Created `.claude/context/artifacts/catalogs/tool-catalog.md` (complete inventory with wiring status)
- Rewrote `.claude/tools/README.md` with accurate inventory, relocated modules section, archived tools section
- Updated `.claude/docs/@DIRECTORY_STRUCTURE.md` tools section with current structure
- Updated `.claude/CLAUDE.md` Section 1.4 to reference tool catalog

**Evidence:**

- Tool catalog: 66 active + 25 archived + 8 relocated = 99 total tools documented
- Learnings recorded: `.claude/context/memory/learnings.md` (phantom script prevention pattern, security patterns)
- All tests pass: `pnpm test:tools` (4/4 pass)
- Zero phantom scripts remain (validated by TDD test)

---

## ADR-088: Schemas System Overhaul -- Dead Schema Cleanup + Wiring Activation

**Date:** 2026-02-07

**Status:** Proposed

**Context:**

Audit of `.claude/schemas/` found 52 schema files with only 2 (3.8%) actively loaded and validated against via Ajv in runtime code. 25 schemas (48%) have zero references anywhere in the codebase. The schema-creator skill references three infrastructure pieces that do not exist (schema-registry.json, SCHEMA_CATALOG.md, schemas/index.json). No schema catalog exists, unlike the parallel catalogs for skills, templates, and commands.

**Decision:**

1. Archive 25 dead schemas to `.claude/schemas/_archive/` via `git mv`
2. Fix naming for `agent-identity.json` (rename to `agent-identity.schema.json`)
3. Wire 8 schemas to actual Ajv validation in their consumers (agent-definition, skill-definition, hook-definition, workflow-definition, evolution-state, tool-manifest, presets, agent-config)
4. Create schema catalog at `.claude/context/artifacts/catalogs/schema-catalog.md`
5. Rewrite schemas README with complete inventory
6. Fix schema-creator SKILL.md phantom references
7. Fix schema-updater-workflow.yaml `schemas/index.json` reference
8. Do NOT create schema-registry.json or schemas/index.json (catalog + README sufficient)

**Rationale:**

- Archive via `git mv` is the proven pattern (templates Pipeline #3, hooks Phase 2)
- Wiring 8 schemas to Ajv activates validation, from 3.8% to 37% utilization
- Catalog provides discoverability consistent with skill-catalog, template-catalog, command-catalog
- Fixing phantom references prevents agents from trying to update infrastructure that doesn't exist

**Consequences:**

- Schema directory goes from 52 to 27 files (48% reduction)
- Active validation increases from 2 to 10 schemas (5x improvement)
- Schema-creator skill accurately reflects available infrastructure
- 25 archived schemas preserved with `git mv` history

**Architecture Plan:** `.claude/context/plans/schemas-overhaul-architecture-2026-02-07.md`

---

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

## Ecosystem Creation Protocol Sequencing Decision (Task #17, 2026-02-08)

**Status:** Accepted

**Decision:** Implement the 15-step ecosystem creation protocol in three tiers, with each tier validated before proceeding to the next:

- **Tier 1 (Steps 1-3):** Security fixes for 3 CRITICAL vulnerabilities
  - CRITICAL-002: Protect settings.json (requires hook-creator active state)
  - CRITICAL-003: Protect agent-registry.json (requires agent-creator active state)
  - HIGH-002: Add TTL bounds checking (30s min, 10min max)
  - Status: No dependencies, can proceed immediately

- **Tier 2 (Steps 4-7):** Infrastructure libraries and schema validation
  - creator-commons.cjs (unified post-creation workflow)
  - ecosystem-impact-analyzer.cjs (integration gap detection)
  - Schema write-time validation (connect existing schemas)
  - Status: Depends on Tier 1 security fixes

- **Tier 3 (Steps 8-12):** New creators and Post-Creation integration
  - artifact-updater skill (replaces 5 ghost updaters)
  - command-creator, rule-creator, tool-creator skills
  - Post-Creation sections in 6 existing creators
  - Status: Depends on Tier 2 infrastructure

**Rationale:**

1. **Security-first:** Vulnerabilities fixed before feature work begins
2. **Zero rework:** Tier 1 doesn't depend on anything; Tier 2 and 3 follow clean DAG
3. **Measurable progress:** Each tier is independently deployable
4. **Risk mitigation:** High-risk security issues isolated to Tier 1 for early validation

**Consequences:**

- **Positive:** Clear sequence prevents rework, risk concentrated early
- **Positive:** Independent tier completion allows parallel team work if needed
- **Negative:** Total elapsed time may be longer (3 sequential tiers vs 1 monolithic implementation)
- **Mitigated:** Each tier takes 1-2 days; total 3-6 days is acceptable for enterprise feature

**Comparison to Alternatives:**

1. **Monolithic implementation (all 15 steps at once):** Rejected. If Tier 1 security fixes reveal architecture gaps, entire implementation must rework.
2. **Feature-first (Tier 3 then Tier 2 then Tier 1):** Rejected. Deploying features with known CRITICAL vulnerabilities is unacceptable.
3. **Parallel all tiers (start Tier 2 before Tier 1 complete):** Rejected. Tier 2 depends on Tier 1 security fixes; coupling would add rework risk.

**Dependencies:** Tasks #18-21 execute this plan with explicit verification milestones between tiers

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
