<!-- Agent: architect | Task: #27 | Session: 2026-02-22 -->

# Router, Agent, Skill & Tool Assignment Audit

**Date:** 2026-02-22
**Auditor:** Architect Agent (task-27, sub-track: router-audit)
**Scope:** Full routing pipeline, 7 core agents, routing-guard enforcement, CLAUDE.md accuracy

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Critical Misrouting Gaps](#2-critical-misrouting-gaps)
3. [Agent Tool Gaps](#3-agent-tool-gaps)
4. [Agent Skill Gaps](#4-agent-skill-gaps)
5. [Routing-Guard Coverage Gaps](#5-routing-guard-coverage-gaps)
6. [Top 10 Optimizations](#6-top-10-optimizations)
7. [Recommended CLAUDE.md Changes](#7-recommended-claudemd-changes)
8. [Files Analyzed](#8-files-analyzed)

---

## 1. Executive Summary

This audit examined the full routing resolution chain (routing-table-core-map.cjs -> routing-table-patterns.cjs -> routing-table-intent-keywords.cjs -> routing-table-intent-agents.cjs -> routing-table-disambiguation.cjs), the routing-guard enforcement hook (17 checks in routing-guard-core.impl.cjs + policy in routing-guard-core.policy.cjs), and 12 agent definitions across core, specialized, and support categories.

### Key Metrics

| Category | Count |
|----------|-------|
| Total registered agents | 61 |
| Core agents audited | 7 (developer, qa, planner, architect, code-reviewer, technical-writer, context-compressor) |
| Specialized agents audited | 5 (code-simplifier, devops, security-architect, database-architect, devops-troubleshooter, incident-responder, researcher) |
| Routing guard checks | 17 |
| Critical misrouting gaps found | 6 |
| Agent tool gaps found | 8 |
| Agent skill gaps found | 7 |
| Routing-guard coverage gaps found | 5 |

### Severity Scale

- **P0 (Critical):** Active misrouting causing wrong agent selection
- **P1 (High):** Missing tools/skills that block agent functionality
- **P2 (Medium):** Suboptimal assignments causing reduced quality
- **P3 (Low):** Nice-to-have improvements

---

## 2. Critical Misrouting Gaps

### GAP-01: `deploy` keyword routes to `nextjs-pro` via `vercel_deploy` intent, not `devops` [P0]

**Location:** `routing-table-core-map.cjs` line 56: `deploy: 'vercel_deploy'` which maps via `INTENT_TO_AGENT` to `devops` (line 44). However, `ROUTING_PATTERNS` (routing-table-patterns.cjs line 28) has `devops: [{ pattern: /^(deploy|ci\/cd|pipeline|kubernetes|docker)\b/i, priority: 10 }]` which should match first.

**Actual behavior:** The core-map keyword `deploy` maps to intent `vercel_deploy`, which INTENT_TO_AGENT correctly maps to `devops`. However, the core-map also contains `vercel: 'vercel_deploy'` and `serverless: 'vercel_deploy'`, and the INTENT_KEYWORDS for `vercel_deploy` include `deploy` and `vercel`. This means: (a) if the user says "deploy to vercel", it will correctly hit `devops` via INTENT_TO_AGENT. (b) But the confusion exists because `vercel_deploy` is listed in the Vercel Skills section of INTENT_KEYWORDS (line 147) and could create confusion about which agent handles deployment.

**Impact:** Low actual misrouting risk due to INTENT_TO_AGENT correctly mapping `vercel_deploy -> devops`, but the indirection through "vercel_deploy" intent name is misleading and confusing for maintainers.

**Recommendation:** Rename the intent from `vercel_deploy` to `deployment` or route `deploy` directly to `devops` in the core-map.

### GAP-02: `refactor` in ROUTING_PATTERNS maps to `architect`, not `code-simplifier` [P0]

**Location:** `routing-table-patterns.cjs` line 22: `architect: [{ pattern: /^(design|architecture|system\s+design|refactor)\b/i, priority: 10 }]`

**Issue:** The CLAUDE.md Common Misrouting table says "clean up/refactor/simplify" should go to `code-simplifier`, but ROUTING_PATTERNS has `refactor` as a trigger for `architect` at priority 10. The SPECIALIST_KEYWORD_MAP in routing-guard-core.policy.cjs correctly has `code-simplifier` keywords including "refactor" and "simplify", and Check 13 (`specialist-override`) should catch this at warn level. However, the developer agent definition also lists `refactor` as a trigger phrase.

**Impact:** Three-way conflict: `refactor` triggers architect (patterns), developer (agent triggers), and should go to code-simplifier (CLAUDE.md policy). The routing-guard specialist-override check (warn mode) should flag this, but the initial routing decision is wrong.

**Recommendation:** Remove `refactor` from architect's ROUTING_PATTERNS. Add `refactor` explicitly to code-simplifier in ROUTING_PATTERNS with priority 10. Change developer agent's trigger to not include bare `refactor`.

### GAP-03: No routing keywords for `git push`, `git commit`, `branch` operations [P1]

**Location:** `routing-table-core-map.cjs` - no entries for `git`, `commit`, `push`, `branch`, `merge`, `rebase`. `routing-table-intent-keywords.cjs` - developer intent includes `commit` (line 41).

**Issue:** Git operations like "push to remote", "create branch", "merge PR" have no explicit routing. The developer intent keywords include "commit" but this is too broad. Simple git operations should route to `developer` (with `git-expert` skill), but complex git workflows (branching strategy, release management) could benefit from `devops` routing.

**Impact:** Git-related requests fall through to fuzzy matching, which may route to developer via the "commit" keyword match, but there is no explicit disambiguation between developer (simple git) and devops (git workflows/CI).

**Recommendation:** Add `git commit`, `git push`, `git branch` to developer in core-map. Add `branching strategy`, `release management`, `git workflow` to devops in core-map. Add disambiguation rule for `git`.

### GAP-04: CLAUDE.md Common Misrouting table is incomplete [P1]

**Location:** CLAUDE.md Section 1 "Common Misrouting" table.

**Missing entries that exist in SPECIALIST_KEYWORD_MAP but not in CLAUDE.md:**

| Should Be In Table | Specialist Agent | Currently Missing |
|-------------------|-----------------|-------------------|
| "performance profiling/load test" | performance-engineer | YES |
| "accessibility audit/wcag" | accessibility-tester | YES |
| "chaos test/resilience test" | chaos-engineer | YES |
| "incident/outage/postmortem" | incident-responder | YES |
| "reverse engineer/disassembly" | reverse-engineer | YES |
| "data pipeline/etl" | data-engineer | YES |

**Impact:** Router operators (human or AI) consulting the CLAUDE.md table will miss these specialist routes and default to developer.

**Recommendation:** Expand the Common Misrouting table to cover all specialists in the SPECIALIST_KEYWORD_MAP.

### GAP-05: `integration` intent maps to `developer` instead of `artifact-integrator` [P1]

**Location:** `routing-table-intent-agents.cjs` line 132: `integration: 'developer'`

**Issue:** The legacy intent `integration` maps to developer, but the framework has a dedicated `artifact-integrator` orchestrator for integration work. There are also separate entries for `artifact-integration` (line 76) and `external_integration` (line 53) that correctly map to artifact-integrator.

**Impact:** If a user says "integrate this module", it could match the `integration` legacy intent and route to developer instead of artifact-integrator.

**Recommendation:** Change `integration: 'developer'` to `integration: 'artifact-integrator'` or remove the legacy intent entirely since `artifact-integration` and `external_integration` already cover it.

### GAP-06: Test skill entries in INTENT_TO_AGENT and ALLOWED_INTENT_KEYWORD_OVERLAPS [P2]

**Location:** `routing-table-intent-agents.cjs` lines 144-145: `enterprise-skill-test-*` entries. `routing-table-intent-keywords.cjs` lines 502-525: corresponding test entries in ALLOWED_INTENT_KEYWORD_OVERLAPS.

**Issue:** Two test artifacts (`enterprise-skill-test-1771722088465`, `enterprise-skill-test-1771722182676`) remain in production routing tables. These are test scaffolds that should have been cleaned up.

**Impact:** Low severity but adds noise to routing resolution and increases maintenance burden.

**Recommendation:** Remove test artifacts from production routing tables.

---

## 3. Agent Tool Gaps

### TOOL-01: code-reviewer missing `Edit` tool [P1]

**Agent:** `code-reviewer` (`.claude/agents/specialized/code-reviewer.md`)
**Current tools:** Read, Write, Glob, Grep, Bash, MemoryRecord, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill
**Missing:** `Edit`

**Impact:** Code reviewer cannot make targeted inline corrections or suggestions-as-edits. Can only write full-file replacements via Write tool or document findings in reports.

**Recommendation:** Add `Edit` to code-reviewer's tool list. Code reviewers often need to suggest specific line-level changes.

### TOOL-02: code-reviewer missing `WebFetch`/`WebSearch` [P2]

**Agent:** `code-reviewer`
**Missing:** `WebFetch`, `WebSearch`

**Impact:** Cannot look up documentation, API references, or best practices during reviews. Must rely solely on internal knowledge.

**Recommendation:** Add `WebFetch` and `WebSearch` to enable documentation-backed reviews.

### TOOL-03: technical-writer missing `Bash` tool [P1]

**Agent:** `technical-writer` (`.claude/agents/core/technical-writer.md`)
**Current tools:** Read, Write, Edit, Glob, Grep, WebSearch, WebFetch, MemoryRecord, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill
**Missing:** `Bash`

**Impact:** Cannot run commands to verify documentation accuracy, test code examples, generate API docs from source, or run documentation build tools.

**Recommendation:** Add `Bash` to technical-writer. Documentation writers frequently need to run code examples and build tools.

### TOOL-04: technical-writer missing `TaskOutput` [P2]

**Agent:** `technical-writer`
**Missing:** `TaskOutput`

**Impact:** Cannot read output from other agents' tasks for documentation synthesis.

**Recommendation:** Add `TaskOutput` to enable cross-agent documentation workflows.

### TOOL-05: devops missing `WebFetch`/`WebSearch` [P1]

**Agent:** `devops` (`.claude/agents/specialized/devops.md`)
**Current tools:** Read, Write, Edit, Grep, Glob, Bash, MemoryRecord, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill
**Missing:** `WebFetch`, `WebSearch`

**Impact:** Cannot look up cloud provider documentation, check API status pages, reference deployment guides, or research infrastructure best practices during operations.

**Recommendation:** Add `WebFetch` and `WebSearch`. DevOps work frequently requires referencing external documentation (AWS docs, K8s docs, Terraform registry).

### TOOL-06: security-architect missing `WebFetch` [P2]

**Agent:** `security-architect` (`.claude/agents/specialized/security-architect.md`)
**Has:** WebSearch
**Missing:** `WebFetch`

**Impact:** Has WebSearch to find security advisories but cannot fetch the full content of CVE pages, security bulletins, or OWASP documentation.

**Recommendation:** Add `WebFetch` to pair with existing WebSearch capability.

### TOOL-07: incident-responder missing `Edit` [P2]

**Agent:** `incident-responder` (`.claude/agents/specialized/incident-responder.md`)
**Current tools:** Read, Grep, Glob, Bash, Write, MemoryRecord, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill
**Missing:** `Edit`

**Impact:** Cannot make surgical fixes to configuration files or hotfixes during incident response. Must use Write for full-file replacements.

**Recommendation:** Add `Edit` for targeted configuration changes during incident response.

### TOOL-08: researcher missing `Write`/`MemoryRecord` [P1]

**Agent:** `researcher` (`.claude/agents/specialized/researcher.md`)
**Current tools:** Read, Grep, Glob, WebSearch, WebFetch, Bash, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill
**Missing:** `Write`, `MemoryRecord`

**Impact:** Cannot write research reports to disk or record findings to structured memory. Research results can only be returned inline via TaskUpdate metadata, which is limited.

**Recommendation:** Add `Write` and `MemoryRecord` to enable report writing and memory persistence.

---

## 4. Agent Skill Gaps

### SKILL-01: developer has framework-specific skill bloat [P2]

**Agent:** `developer`
**Bloated skills:** `vercel-deploy`, `next-cache-components`, `next-upgrade`, `shadcn-ui`, `web-perf`

**Issue:** The general-purpose developer agent has 5 framework-specific skills (Vercel/Next.js/shadcn-ui). These should be on domain specialists (`nextjs-pro`, `frontend-pro`, `devops`) not the general developer.

**Impact:** Increases skill context loaded for every developer spawn, wastes tokens when the task has nothing to do with Vercel/Next.js.

**Recommendation:** Move `vercel-deploy` to devops, `next-cache-components` and `next-upgrade` to nextjs-pro, `shadcn-ui` to frontend-pro, `web-perf` to frontend-pro and qa.

### SKILL-02: planner has `tdd` skill [P3]

**Agent:** `planner`
**Questionable skill:** `tdd`

**Issue:** Planners plan; they do not implement. The `tdd` skill is an implementation methodology skill. However, the enterprise planner contract in CLAUDE.md requires planners to "invoke `Skill({ skill: 'tdd' })` and produce a detailed TDD plan", so this is actually intentional.

**Impact:** None (intentional per CLAUDE.md enterprise planner contract).

**Recommendation:** No change needed, but document the rationale in the planner agent definition.

### SKILL-03: devops has `next-upgrade` and `web-perf` skills [P2]

**Agent:** `devops`
**Questionable skills:** `next-upgrade`, `web-perf`

**Issue:** `next-upgrade` is a Next.js framework skill and `web-perf` is a frontend performance skill. Neither is core to DevOps infrastructure/CI/CD responsibilities.

**Impact:** Adds unnecessary skill context to devops spawns for non-relevant work.

**Recommendation:** Move `next-upgrade` to nextjs-pro. Move `web-perf` to frontend-pro.

### SKILL-04: code-simplifier missing `checklist-generator` [P2]

**Agent:** `code-simplifier`
**Missing skill:** `checklist-generator`

**Issue:** Most core agents have `checklist-generator` for systematic validation. Code-simplifier performs complex refactoring that would benefit from a quality checklist before completion.

**Recommendation:** Add `checklist-generator` to code-simplifier.

### SKILL-05: database-architect missing `code-structural-search` [P2]

**Agent:** `database-architect`
**Missing skill:** `code-structural-search`

**Issue:** Database architect has `code-semantic-search` and `ripgrep` but not `code-structural-search`. Schema definitions and ORM models are highly structural and benefit from AST-based search.

**Recommendation:** Add `code-structural-search` to database-architect.

### SKILL-06: incident-responder missing `code-structural-search` [P3]

**Agent:** `incident-responder`
**Missing skill:** `code-structural-search`

**Issue:** Has `code-semantic-search` and `ripgrep` but not structural search. During incident response, finding specific error handlers, middleware chains, or route definitions benefits from AST search.

**Recommendation:** Add `code-structural-search` to incident-responder.

### SKILL-07: context-compressor has minimal skill set [P3]

**Agent:** `context-compressor`
**Current skills (7):** context-compressor, session-handoff, context-compressor, task-management-protocol, verification-before-completion, ripgrep, code-semantic-search
**Missing:** `code-structural-search`

**Issue:** The compressor would benefit from structural search to understand code architecture when compressing code-heavy contexts.

**Recommendation:** Add `code-structural-search` for better code comprehension during compression.

---

## 5. Routing-Guard Coverage Gaps

### GUARD-01: SPECIALIST_KEYWORD_MAP missing `performance-engineer` phrases [P1]

**Location:** `routing-guard-core.policy.cjs` SPECIALIST_KEYWORD_MAP

**Issue:** The SPECIALIST_KEYWORD_MAP has no entry for `performance-engineer`. The disambiguation rules in `routing-table-disambiguation.cjs` handle "performance" but the routing-guard specialist-override check (Check 13) cannot catch developer-over-performance-engineer misrouting.

**Impact:** Requests like "profile this service" or "run a load test" will not trigger specialist-override warnings.

**Recommendation:** Add `performance-engineer` to SPECIALIST_KEYWORD_MAP with phrases: `['performance profiling', 'load test', 'benchmark', 'bottleneck analysis', 'latency optimization']`.

### GUARD-02: SPECIALIST_KEYWORD_MAP missing `accessibility-tester` phrases [P1]

**Location:** `routing-guard-core.policy.cjs` SPECIALIST_KEYWORD_MAP

**Issue:** No entry for `accessibility-tester`. The disambiguation rules handle "accessibility" but the guard cannot enforce specialist routing.

**Impact:** Requests like "run accessibility audit" or "check WCAG compliance" will not trigger specialist-override warnings.

**Recommendation:** Add `accessibility-tester` to SPECIALIST_KEYWORD_MAP with phrases: `['accessibility audit', 'wcag compliance', 'screen reader test', 'a11y testing']`.

### GUARD-03: SPECIALIST_KEYWORD_MAP missing `chaos-engineer` phrases [P2]

**Location:** `routing-guard-core.policy.cjs` SPECIALIST_KEYWORD_MAP

**Issue:** `chaos-engineer` is in HIGH_RISK_SPECIALISTS_REQUIRING_ARCHITECT but has no entry in SPECIALIST_KEYWORD_MAP for the specialist-override check.

**Impact:** The architect-first guard (Check 10) will fire for chaos-engineer spawns, but the specialist-override check (Check 13) cannot proactively suggest chaos-engineer when developer is being spawned for resilience testing.

**Recommendation:** Add `chaos-engineer` to SPECIALIST_KEYWORD_MAP with phrases: `['chaos test', 'failure injection', 'resilience test', 'game day', 'fault tolerance test']`.

### GUARD-04: `specialist-override` check is warn-only by default [P2]

**Location:** `routing-guard-core.impl.cjs` Check 13 (specialist-override)

**Issue:** The specialist-override enforcement is warn-only (`SPECIALIST_ROUTING_ENFORCEMENT=warn`). This means misrouting to developer when a specialist is available only produces a warning, not a block.

**Impact:** Router can ignore warnings and still spawn developer for specialist tasks. The Specialist-First Routing Law is documented as "IRON LAW" but enforcement is soft.

**Recommendation:** Consider upgrading to `SPECIALIST_ROUTING_ENFORCEMENT=block` for high-confidence specialist matches (exact phrase matches), while keeping `warn` for fuzzy matches.

### GUARD-05: `config-model-validator` check (Check 17) at warn level [P3]

**Location:** `routing-guard-core.impl.cjs` Check 17

**Issue:** Model validation is warn-only. An agent could be spawned with the wrong model (e.g., haiku for security-architect) without being blocked.

**Impact:** Low, as model resolution from config.yaml usually works correctly. But in edge cases where explicit model override is wrong, there is no hard block.

**Recommendation:** Keep at warn for now but add telemetry to track how often model mismatches occur.

---

## 6. Top 10 Optimizations

### OPT-01: Expand CLAUDE.md Common Misrouting table [P0]

**Current:** 8 entries covering developer-to-specialist misrouting.
**Proposed:** Add 6 more entries for performance-engineer, accessibility-tester, chaos-engineer, incident-responder, reverse-engineer, and data-engineer. Also add researcher-to-artifact-integrator misrouting for "integrate repo/onboard" requests (already in rules/agents.md but missing from CLAUDE.md).

**Benefit:** Reduces misrouting for 6+ specialist agents that currently have no CLAUDE.md visibility.

### OPT-02: Fix `refactor` routing conflict [P0]

**Action:** Remove `refactor` from architect's ROUTING_PATTERNS (routing-table-patterns.cjs line 22). Add code-simplifier to ROUTING_PATTERNS with `refactor` at priority 10. Ensure developer's trigger phrases do not include bare `refactor`.

**Benefit:** Eliminates three-way routing conflict for the most common code improvement request.

### OPT-03: Add missing tools to 4 agents [P1]

**Actions:**
- code-reviewer: add `Edit`
- technical-writer: add `Bash`
- devops: add `WebFetch`, `WebSearch`
- researcher: add `Write`, `MemoryRecord`

**Benefit:** Unblocks core functionality for 4 high-frequency agents. These are not nice-to-haves; they block fundamental operations (reviewer cannot edit, writer cannot run examples, devops cannot reference docs, researcher cannot write reports).

### OPT-04: Add 3 agents to SPECIALIST_KEYWORD_MAP [P1]

**Actions:**
- Add `performance-engineer` with profiling/load-test phrases
- Add `accessibility-tester` with WCAG/a11y phrases
- Add `chaos-engineer` with failure-injection/resilience phrases

**Benefit:** Enables routing-guard specialist-override check to catch 3 more misrouting patterns.

### OPT-05: Remove framework-specific skill bloat from developer [P2]

**Action:** Move `vercel-deploy`, `next-cache-components`, `next-upgrade`, `shadcn-ui` from developer to appropriate domain specialists. Keep `web-perf` on developer but also add to frontend-pro.

**Benefit:** Reduces developer spawn prompt size by ~5 skill references. Developer is the most frequently spawned agent, so this has multiplicative token savings.

### OPT-06: Fix `integration` legacy intent mapping [P1]

**Action:** Change `integration: 'developer'` to `integration: 'artifact-integrator'` in routing-table-intent-agents.cjs.

**Benefit:** Prevents misrouting of integration requests to developer when artifact-integrator is the correct handler.

### OPT-07: Clean up test artifacts from routing tables [P2]

**Action:** Remove `enterprise-skill-test-*` entries from INTENT_TO_AGENT and ALLOWED_INTENT_KEYWORD_OVERLAPS.

**Benefit:** Reduces noise in routing resolution. Clean routing tables are easier to maintain and audit.

### OPT-08: Add git operation routing [P2]

**Action:** Add explicit routing for `git commit`, `git push`, `git branch` to developer. Add `branching strategy`, `release management`, `git workflow` to devops. Add disambiguation rule for `git`.

**Benefit:** Git operations are currently unrouted and fall through to fuzzy matching. Explicit routing improves determinism.

### OPT-09: Upgrade specialist-override to tiered enforcement [P2]

**Action:** Implement two-tier enforcement: `block` for exact phrase matches in SPECIALIST_KEYWORD_MAP, `warn` for partial/fuzzy matches. Current single-tier `warn` allows all misrouting.

**Benefit:** Stronger enforcement for clear-cut cases while keeping flexibility for ambiguous ones.

### OPT-10: Add `code-structural-search` to 3 more agents [P3]

**Action:** Add `code-structural-search` to database-architect, incident-responder, and context-compressor.

**Benefit:** Completes the search skill triad (ripgrep + semantic + structural) for agents that work with code structure.

---

## 7. Recommended CLAUDE.md Changes

### Change 1: Expand Common Misrouting table

Add these rows to CLAUDE.md Section 1 "Common Misrouting":

```markdown
| "performance profiling/load test" | developer | **performance-engineer** |
| "accessibility audit/WCAG"        | developer | **accessibility-tester** |
| "chaos/resilience testing"        | developer | **chaos-engineer**       |
| "incident/outage/postmortem"      | developer | **incident-responder**   |
| "reverse engineer/disassembly"    | developer | **reverse-engineer**     |
| "data pipeline/ETL"               | developer | **data-engineer**        |
| "integrate repo/onboard"          | researcher| **artifact-integrator**  |
```

### Change 2: Fix Quick Routing table formatting

CLAUDE.md Section 3 "Quick Routing" table has formatting issues (extra `|` columns for newer entries like qa-guardian, contract-check, bool-action, repo-onboarder that include a third path column not present in the original table format).

### Change 3: Update Section 8.5 skill list

CLAUDE.md Section 8.5 lists `enterprise-skill-test-*` entries in the "High-impact orchestration skills" list. Remove these test artifacts.

### Change 4: Add routing conflict documentation

Add a "Known Routing Conflicts" subsection to CLAUDE.md Section 3 or to router-decision.md documenting:
- `refactor`: architect vs code-simplifier vs developer (recommended: code-simplifier)
- `deploy`: vercel_deploy intent name vs devops agent (recommended: rename intent)
- `integration`: legacy intent maps to developer (recommended: artifact-integrator)
- `tdd`/`test`: developer (TDD implementation) vs qa (test strategy) (handled by disambiguation)

---

## 8. Files Analyzed

### Routing Pipeline

| File | Lines | Purpose |
|------|-------|---------|
| `.claude/lib/routing/routing-table.cjs` | ~20 | Facade delegating to routing-table-data.cjs |
| `.claude/lib/routing/routing-table-data.cjs` | ~30 | Aggregator importing 5 sub-modules |
| `.claude/lib/routing/routing-table-core-map.cjs` | 283 | Primary keyword-to-intent mapping (~280 keywords) |
| `.claude/lib/routing/routing-table-patterns.cjs` | 37 | Regex-based routing patterns (10 agent categories) |
| `.claude/lib/routing/routing-table-intent-keywords.cjs` | 528 | Fuzzy intent matching keywords (50+ categories) |
| `.claude/lib/routing/routing-table-intent-agents.cjs` | 149 | Intent-to-agent name mapping (70+ intents) |
| `.claude/lib/routing/routing-table-disambiguation.cjs` | 241 | Disambiguation rules for ambiguous terms (13 rules) |

### Routing Guard

| File | Lines | Purpose |
|------|-------|---------|
| `.claude/hooks/routing/routing-guard.cjs` | 31 | Entry point wrapper |
| `.claude/hooks/routing/routing-guard-core.cjs` | 11 | Delegation to implementation |
| `.claude/hooks/routing/routing-guard-core.impl.cjs` | 635 | 17 named checks executed sequentially |
| `.claude/hooks/routing/routing-guard-core.policy.cjs` | 454 | SPECIALIST_KEYWORD_MAP (28 agents), HIGH_RISK list |

### Agent Definitions

| Agent | File | Tools | Skills | Model |
|-------|------|-------|--------|-------|
| architect | `.claude/agents/core/architect.md` | 15 | 17 | opus |
| developer | `.claude/agents/core/developer.md` | 15 | 24 | sonnet |
| qa | `.claude/agents/core/qa.md` | 15 | 14 | opus |
| planner | `.claude/agents/core/planner.md` | 15 | 23 | opus |
| code-reviewer | `.claude/agents/specialized/code-reviewer.md` | 11 | 16 | (default) |
| technical-writer | `.claude/agents/core/technical-writer.md` | 13 | 9 | (default) |
| context-compressor | `.claude/agents/core/context-compressor.md` | 9 | 7 | haiku |
| code-simplifier | `.claude/agents/specialized/code-simplifier.md` | 12 | 13 | opus |
| devops | `.claude/agents/specialized/devops.md` | 12 | 31 | (default) |
| security-architect | `.claude/agents/specialized/security-architect.md` | 13 | 20 | opus |
| database-architect | `.claude/agents/specialized/database-architect.md` | 12 | 13 | opus |
| incident-responder | `.claude/agents/specialized/incident-responder.md` | 11 | 16 | sonnet |
| devops-troubleshooter | `.claude/agents/specialized/devops-troubleshooter.md` | 12 | 17 | sonnet |
| researcher | `.claude/agents/specialized/researcher.md` | 11 | 10 | sonnet |

### CLAUDE.md and Rules

| File | Purpose |
|------|---------|
| `.claude/CLAUDE.md` | Master routing document (Common Misrouting table, routing tables, enforcement references) |
| `.claude/workflows/core/router-decision.md` | Authoritative routing decision workflow (1514 lines) |
| `.claude/context/agent-registry.json` | Runtime agent registry (61 agents, 47K tokens) |
| `.claude/rules/agents.md` | Agent quick reference with misrouting table |

---

## Appendix A: Routing Resolution Chain

```
User Request
    |
    v
ROUTING_TABLE (core-map.cjs)           -- Explicit keyword -> intent
    |                                       280+ keywords
    v
ROUTING_PATTERNS (patterns.cjs)         -- Regex pattern match -> agent
    |                                       10 agent categories
    v
INTENT_KEYWORDS (intent-keywords.cjs)   -- Fuzzy intent matching
    |                                       50+ intent categories
    v
INTENT_TO_AGENT (intent-agents.cjs)     -- Intent name -> agent name
    |                                       70+ mappings
    v
DISAMBIGUATION_RULES (disambiguation.cjs) -- Ambiguous term resolution
    |                                       13 disambiguation rules
    v
ROUTING_GUARD (routing-guard-core.impl.cjs)
    |-- Check 6:  planner-first-guard
    |-- Check 8:  security-review-guard
    |-- Check 9:  code-simplifier-architect-guard
    |-- Check 10: high-risk-specialist-architect-guard
    |-- Check 13: specialist-override (SPECIALIST_KEYWORD_MAP, 28 agents)
    |-- Check 14: creator-intent-guard
    |-- Check 16: intent-agent-match
    |-- Check 17: config-model-validator
    v
Final Agent Selection
```

## Appendix B: Full Routing Guard Check Sequence

| # | Check Name | Purpose | Mode |
|---|-----------|---------|------|
| 1 | tasklist-first-gate | Ensures TaskList() called before Task() | block |
| 2 | task-payload-contract | Validates Task() payload structure | block |
| 3 | router-bash-check | Blocks router from running Bash | block |
| 4 | router-self-check | Blocks router from using banned tools | block |
| 5 | router-read-governance | Limits router Read paths | block |
| 6 | planner-first-guard | Requires planner for HIGH/EPIC | block |
| 7 | task-create-guard | Restricts router TaskCreate | block |
| 8 | security-review-guard | Requires security-architect for security work | block |
| 9 | code-simplifier-architect-guard | Requires architect before code-simplifier | block |
| 10 | high-risk-specialist-architect-guard | Requires architect before devops/chaos | block |
| 11 | router-write-guard | Blocks router Write/Edit | block |
| 12 | memory-pressure-check | Suggests compression at high token usage | warn |
| 13 | specialist-override | Warns on developer when specialist matches | warn |
| 14 | creator-intent-guard | Routes creation to creator skills | warn |
| 15 | skill-agent-confusion | Detects skill invoked as agent | warn |
| 16 | intent-agent-match | Validates intent-agent mapping | warn |
| 17 | config-model-validator | Validates model selection | warn |

---

**End of Audit Report**
