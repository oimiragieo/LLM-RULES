# Archived Memory — Early February 2026 (2026-02-07 to 2026-02-09)

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

## ADR-091: JSON Schema Domain Standardization -- agent-studio.dev

**Date:** 2026-02-09

**Status:** Accepted

**Context:**

All JSON schemas in `.claude/schemas/` previously used inconsistent $id domains (some used localhost, some had no $id, some used example.com). This prevents proper schema validation, IDE autocompletion, and cross-schema references.

**Decision:**

Standardize all schema $id fields to use `https://agent-studio.dev/schemas/{filename}` domain. This establishes a canonical namespace for all agent-studio schemas.

**Examples:**

- `skill-tdd-output.schema.json` → $id: `https://agent-studio.dev/schemas/skill-tdd-output.schema.json`
- `skill-debugging-output.schema.json` → $id: `https://agent-studio.dev/schemas/skill-debugging-output.schema.json`

**Alternatives Considered:**

1. **localhost domain:** Rejected. Not globally addressable, breaks cross-repository references.
2. **No $id field:** Rejected. Required for proper JSON Schema validation and IDE tooling.
3. **example.com domain:** Rejected. Not owned by project, violates RFC 2606 guidance for non-example use.

**Rationale:**

- agent-studio.dev is the project's canonical domain
- Provides globally unique identifiers for all schemas
- Enables future schema hosting/documentation website
- Follows JSON Schema best practices (https://json-schema.org/understanding-json-schema/structuring.html#id)

**Consequences:**

- All 78 schemas now have consistent, globally unique $id values
- Future tooling can resolve schema references via domain
- Enables potential future schema registry/documentation site at agent-studio.dev/schemas/

**Implementation:**

- Phase 2, Task 2.2 of schema standardization plan (2026-02-09)
- Modified 57 schemas (21 already compliant)
- Verified via automated script: 78/78 schemas now use agent-studio.dev domain

---

## ADR-090: ACCS Integration Strategy -- Catalog Discovery + Selective Agent Adoption

**Date:** 2026-02-09

**Status:** Proposed

**Context:**

Comparison of VoltAgent/awesome-claude-code-subagents (128 agents, catalog architecture) against agent-studio (49 agents, enterprise orchestration) reveals complementary patterns. ACCS has superior agent discovery UX and broader domain coverage. AS has superior runtime infrastructure (enforcement, memory, skills, task tracking). See full report at `.claude/context/reports/architecture/awesome-claude-code-comparison-2026-02-09.md`.

**Decision:**

1. **Agent Catalog Discovery (P1):** Create `.claude/commands/agent-catalog/` with search, list, fetch slash commands. Use `agent-registry.json` as data source. Modeled after ACCS `subagent-catalog` tool pattern.

2. **Category README Documentation (P1):** Add README.md files to `.claude/agents/core/`, `.claude/agents/domain/`, `.claude/agents/specialized/`, `.claude/agents/orchestrators/` with Quick Selection Guide tables and Common Combinations sections. Modeled after ACCS category README pattern.

3. **Selective Agent Adoption (P2):** Create 7 new agents via agent-creator workflow: chaos-engineer, accessibility-tester, performance-engineer, llm-architect, legacy-modernizer, mcp-developer, compliance-auditor. These fill genuine capability gaps. Do NOT adopt ACCS agents that duplicate existing AS capabilities (context-manager, agent-organizer, multi-agent-coordinator, task-distributor, performance-monitor, error-coordinator, knowledge-synthesizer).

4. **Do NOT adopt ACCS patterns that conflict with AS architecture:** No removal of enforcement hooks. No prompt-fiction (capabilities described without implementation). No communication protocols without infrastructure.

**Alternatives Considered:**

1. **Wholesale import of ACCS agents:** Rejected. ACCS agents lack memory protocol, task tracking, skill invocation. Importing them directly would create 128 agents that bypass all AS enforcement and quality gates.

2. **Fork ACCS as base, add AS infrastructure:** Rejected. ACCS lacks the directory structure, hook system, and workflow engine. Starting from ACCS would require more work than enhancing AS.

3. **Ignore ACCS entirely:** Rejected. Agent catalog discovery and category documentation patterns are genuinely valuable improvements.

**Rationale:**

- Agent discovery is a real usability gap in AS
- Category documentation reduces misrouting
- 7 selected agents fill genuine capability gaps without redundancy
- Preserving AS enforcement/memory/skills is non-negotiable

**Consequences:**

- Users gain slash-command agent discovery
- Category READMEs reduce routing confusion
- 7 new agents expand capability coverage by ~14%
- No breaking changes to existing architecture

---

## ADR-110: Stub Modules for Archived Functionality

**Date:** 2026-02-09

**Status:** ACCEPTED (proven by Tasks #1-9 audit remediation)

**Context:**

When refactoring/consolidating code, modules are often archived to `_archive/` directories. However, consumers of these modules may still exist in active code. Removing all references is time-consuming and risky. Direct archival without consumer updates causes MODULE_NOT_FOUND crashes.

**Problem:**

Tasks #1-9 audit found 3 cases where archived modules had active consumers:

1. `ml/index.cjs` - archived ML pipeline still imported by code expecting ML features
2. `clients/model-client.cjs` - archived LLM client still imported by memory extraction pipeline
3. `hooks/audit/git-notes-audit.cjs` - archived audit hook still referenced in hook chain

**Decision:**

Create minimal stub modules at the original import path that:

1. Export the same function names as the original module
2. Return safe defaults (null, false, empty objects, { success: false })
3. Include JSDoc comments explaining "archived" status and fallback behavior
4. Rely on consumers' existing fallback logic to handle disabled functionality

**Example Implementation:**

```javascript
// .claude/lib/ml/index.cjs (STUB)
/**
 * ML features disabled (archived).
 * Returns null for all ML clients.
 */
function getMLClient() {
  return null;
}

module.exports = { getMLClient };
```

**Alternatives Considered:**

1. **Remove all consumer references:** Rejected. Time-consuming, risky, requires understanding all call sites and their fallback logic.
2. **Throw errors from stubs:** Rejected. Breaks consumers without existing error handling, causes crashes.
3. **Return undefined:** Rejected. Causes `TypeError: Cannot read property 'X' of undefined` when consumers access properties.
4. **Full reimplementation:** Rejected. Defeats purpose of archival.

**Rationale:**

- Minimal risk: Stubs preserve API surface, consumers already have fallback logic
- Fast implementation: ~20 lines per stub vs hours of consumer refactoring
- Clear intent: JSDoc documents "archived/disabled" status
- Gradual migration: Stubs buy time to refactor consumers properly later
- Safe defaults: null/false/empty prevent crashes while signaling "feature disabled"

**Consequences:**

- **Positive:** Zero crashes from archived modules, fast remediation (4 stubs in <1 hour)
- **Positive:** Consumers' existing fallback logic activates (e.g., "ML disabled, skipping pattern detection")
- **Positive:** Clear upgrade path: grep for stub usage → refactor consumers → remove stub
- **Negative:** Stubs hide the true cost of archival (deferred consumer refactoring)
- **Negative:** Stubs can persist indefinitely if no one audits/removes them
- **Mitigated:** Document stub locations in issues.md, tag with "STUB - remove after consumer refactoring"

**Guidelines:**

1. **Check for consumers FIRST:** `grep -r "require.*module-name" --include="*.cjs"`
2. **Choose safe defaults:** null (ML disabled), false (feature off), "" (empty), [] (no results), {} (no data), { success: false, mode: 'mock' }
3. **Document in stub:** JSDoc explaining archived status and expected consumer fallback
4. **Document in issues.md:** Create entry "STUB: module-name - remove after refactoring consumers"
5. **Test stub loads:** `node -e "require('./path/to/stub.cjs')"` (no crash = success)

**Cross-References:**

- Tasks #1-9: Audit remediation pipeline (proven pattern)
- learnings.md: "Stub Modules for Archived Functionality (Pattern)"
- issues.md: Should add "STUB inventory" section listing all active stubs

---

## ADR-095: Canonical Skill Output Schema Standard

**Date:** 2026-02-09

**Status:** Proposed (Architecture Design Complete, Pending Implementation)

**Context:**

Skill expansion created 87 output schemas with two incompatible envelope structures (Structure A: skillName/version/timestamp/output used by 19 pre-existing schemas; Structure B: status/output used by 68 new schemas). Additionally, 70/87 schemas lacked `additionalProperties:false`, 12 were hollow stubs, and `$id` domains were inconsistent (claude-code.anthropic.com vs agent-studio.dev vs missing).

**Decision:**

1. **Canonical envelope**: Structure B (`{status: enum, output: object}`) with `additionalProperties: false` at root and output levels.
2. **JSON Schema version**: Draft-07 (`http://json-schema.org/draft-07/schema#`). Migration to 2020-12 deferred (zero features from 2020-12 are used; migration cost: 464 breaking edits).
3. **$id domain**: `https://agent-studio.dev/schemas/skill-{name}-output.schema.json`
4. **Generic base**: `generic-skill-output-base.schema.json` for skills without domain-specific output (replaces 12 hollow stubs via deletion, not $ref).
5. **Mandatory constraints**: All schemas must have `additionalProperties: false` at root. Schemas with defined output properties must also have it on the output object.

**Alternatives Considered:**

1. **Structure A as canonical**: Rejected. Only 22% adoption; more complex (4 required root fields vs 2); migration cost 3.5x higher (68 schemas vs 19).
2. **Draft 2020-12 migration**: Rejected. 464 breaking edits for zero feature benefit. All schemas use only Draft-07 keywords.
3. **$ref pattern for stubs**: Rejected. Draft-07 `$ref` replaces entire object (no composition with sibling keywords); no runtime resolver exists; file deletion is simpler.
4. **Keep both structures**: Rejected. Bifurcation prevents generic validation logic; maintenance burden doubles.

**Migration Sub-Categories:**

- A1 (14 schemas): Standard skillName/version/timestamp/output -- remove metadata, add status
- A2 (5 schemas): Variant using `result` instead of `output` -- rename + remove metadata + add status
- A3 (5 schemas): Trail of Bits flat security schemas -- wrap existing properties in `output`, add status at root

**Consequences:**

- All 75 active schemas use identical envelope structure
- 12 hollow stubs deleted, replaced by catalog reference to base schema
- `additionalProperties: false` prevents typo-based schema bypass
- Consistent `$id` prevents future `$ref` resolution issues
- Creator rules updated to enforce standard on new schemas
- Total effort: 8-12 hours across 4 implementation phases

**Architecture Document:** `.claude/context/plans/schema-standardization-architecture-2026-02-09.md`

---

## ARCHIVED CONTENT FROM 2026-02-13 TRIM

All detailed implementation content, alternatives considered, rationale sections, and historical context from ADRs 100-122 have been moved here to reduce operational memory load.

Full content preserved in decisions-2026-02.md and this archive.
