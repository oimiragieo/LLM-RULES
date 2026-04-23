<!-- Agent: code-simplifier | Task: #79 | Session: 2026-02-09 -->

# Code Simplification Opportunities Report

## Executive Summary

Comparative analysis of agent-studio vs pro-workflow-main reference implementation reveals significant overcomplexity in six key areas. The reference achieves comparable developer-workflow outcomes with approximately 95% less infrastructure code.

**Key Numbers:**

| Metric                  | agent-studio                                                                           | pro-workflow              | Ratio |
| ----------------------- | -------------------------------------------------------------------------------------- | ------------------------- | ----- |
| Hook files (active)     | 43                                                                                     | 8 scripts + 1 JSON        | 5:1   |
| Hook lines of code      | 19,148                                                                                 | ~800                      | 24:1  |
| Agent definitions       | 59                                                                                     | 3                         | 20:1  |
| Routing table lines     | 2,472                                                                                  | 0 (inline)                | --    |
| Reference docs (@files) | 14 files, 4,124 lines                                                                  | 1 file, 52 lines          | 14:1  |
| CLAUDE.md lines         | 632 (compressed)                                                                       | 44 (template)             | 14:1  |
| Config sources          | 5+ (CLAUDE.md, config.yaml, agent-config.json, routing-table.cjs, agent-registry.json) | 1 (config.json, 45 lines) | 5:1   |
| Templates               | 27 files                                                                               | 5 files (1 dir)           | 5:1   |
| Workflow files          | 28 files, 16,129 lines                                                                 | 0                         | --    |
| Schema files            | 53                                                                                     | 0                         | --    |
| Catalog files           | 7, 2,208 lines                                                                         | 0                         | --    |
| Skill definitions       | 448                                                                                    | 1                         | 448:1 |
| Tools scripts           | 44                                                                                     | 0                         | --    |

**Critical caveat:** Agent-studio is intentionally more capable (49 specialized agents, enforcement hooks, creator workflows, multi-phase orchestration). The question is not "should we be this complex?" but "are we doing 100 lines of work for 20 lines of result?"

---

## Opportunity 1: Routing Table Consolidation

### What Is Overcomplicated

**File:** `.claude/lib/routing/routing-table.cjs` (2,472 lines)

This file contains four overlapping data structures that express the same routing intent:

1. **ROUTING_TABLE** (lines 10-258): keyword -> agent mapping (258 entries)
2. **ROUTING_PREFIX_PATTERNS** (lines 261-268): 6 prefix patterns
3. **ROUTING_PATTERNS** (lines 274-295): regex patterns with priority
4. **INTENT_KEYWORDS** (lines 297-2009): ~1,700 keywords across 50+ intent categories
5. **INTENT_TO_AGENT** (lines 2011-2131): intent -> agent mapping (65 entries)
6. **DISAMBIGUATION_RULES** (lines 2133-2452): 20+ disambiguation rule sets

The INTENT_KEYWORDS section alone is 1,712 lines containing exhaustive keyword lists (e.g., 50+ keywords for iOS alone including "healthkit", "homekit", "cloudkit", "arkit", "realitykit", "metal", "spritekit").

**The reference approach:** No routing table at all. 3 agents with clear "When to Use" sections in their markdown definitions. The LLM handles routing via natural language understanding.

### Simpler Approach

Consolidate to a single flat map with ~100 high-signal keywords (not 1,700+). The LLM does not need 50 keywords to route an iOS request -- "ios", "swift", "xcode" is sufficient. The disambiguation rules can be reduced to a simple comment: "When ambiguous, check for framework-specific keywords."

**Proposed structure (same result, ~200 lines instead of 2,472):**

```javascript
const ROUTING_TABLE = {
  // Core agents (high-signal keywords only)
  developer: ['implement', 'fix bug', 'code', 'build feature'],
  qa: ['test', 'coverage', 'e2e', 'regression'],
  planner: ['plan', 'breakdown', 'phases', 'roadmap'],
  architect: ['system design', 'architecture', 'scalability', 'adr'],
  // ... ~5 keywords per agent, 49 agents = ~250 entries
};

const DISAMBIGUATION = {
  // Only needed for genuinely ambiguous pairs
  llm: { architecture: 'llm-architect', training: 'ai-ml-specialist' },
  test: { tdd: 'developer', coverage: 'qa' },
  mobile: { expo: 'expo-mobile-developer', swift: 'ios-pro', kotlin: 'android-pro' },
};
```

### Risk Assessment

- **Low risk:** The LLM router already understands intent from context. Keywords are a safety net, not the primary routing mechanism. Reducing from 1,700 to 250 keywords would still provide adequate coverage.
- **Risk mitigation:** Keep the full keyword list in an archive file for reference; only load the compressed version at runtime.

### Estimated Effort

Medium (2-3 hours). Requires careful keyword pruning but no logic changes.

---

## Opportunity 2: Hook Consolidation

### What Is Overcomplicated

**Directory:** `.claude/hooks/` (43 active hook files, 19,148 lines)

The reference implementation uses 8 simple scripts (total ~800 lines) and 1 hooks.json configuration. Our system has:

- **routing-guard.cjs** (1,723 lines) -- a single hook with 10+ enforcement checks
- **user-prompt-unified.cjs** (1,597 lines) -- user prompt processing
- **unified-reflection-handler.cjs** (1,228 lines) -- reflection system
- **spawn-prompt-assembler.cjs** (1,073 lines) -- spawn prompt construction
- **pre-task-unified.cjs** (831 lines) -- pre-task validation
- **post-task-unified.cjs** (751 lines) -- post-task processing
- **unified-creator-guard.cjs** (700 lines) -- creator path protection
- **pre-tool-unified.cjs** (597 lines) -- pre-tool validation
- **7 safety/validators/** files (3,279 lines total) -- bash command validation

**Observation:** We already did one round of hook consolidation (6 wildcard hooks into 2 unified hooks on 2026-02-08 per MEMORY.md). But many hooks remain that overlap in purpose:

| Hook                          | Purpose                                                                | Overlap With                                   |
| ----------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| `routing-guard.cjs`           | 10 checks including planner-first, security review, specialist routing | `pre-task-unified.cjs` (also validates spawns) |
| `config-model-validator.cjs`  | Validates model matches config                                         | `routing-guard.cjs` (could be a check)         |
| `intent-agent-match.cjs`      | Matches intent to agent                                                | `routing-guard.cjs` Check 7                    |
| `task-list-tracker.cjs`       | Tracks task list calls                                                 | `pre-task-unified.cjs`                         |
| `task-status-enforcement.cjs` | Enforces task status                                                   | `pre-completion-validation.cjs`                |
| `spawn-prompt-validator.cjs`  | Validates spawn prompts                                                | `spawn-prompt-assembler.cjs`                   |

**The reference approach:** Hooks are lightweight reminders (stderr messages), not blocking enforcement. The `quality-gate.js` (124 lines) counts edits and reminds at thresholds. The `post-edit-check.js` (80 lines) scans for console.log and secrets. No hook does blocking enforcement.

### Simpler Approach

**Phase 1 -- Merge overlapping routing hooks (same result, fewer files):**

Merge these into `routing-guard.cjs` as additional checks:

- `config-model-validator.cjs` (becomes Check 11)
- `intent-agent-match.cjs` (already overlaps with Check 7)
- `task-list-tracker.cjs` (becomes a counter in pre-task-unified)
- `task-status-enforcement.cjs` (merge into pre-completion-validation)

This eliminates 4 hooks (~400 lines) with zero feature loss.

**Phase 2 -- Extract validator registry into data:**

The 7 `safety/validators/*.cjs` files (3,279 lines) contain pattern lists (dangerous commands, injection patterns, etc.). These could be data files loaded by a single validator engine, reducing 7 files to 2 (engine + data).

**Phase 3 -- Reduce routing-guard.cjs complexity:**

The 1,723-line routing-guard has 10+ checks. Several share boilerplate (read stdin, parse JSON, emit result). Extract shared protocol handling into a base function, reducing each check to its core logic.

### Risk Assessment

- **Low risk for Phase 1:** Pure consolidation, same checks, fewer files.
- **Medium risk for Phase 2:** Validator refactoring could miss edge cases in pattern matching. Requires test coverage.
- **Medium risk for Phase 3:** routing-guard is the most critical enforcement hook. Changes need careful testing.

### Estimated Effort

- Phase 1: Low (1-2 hours)
- Phase 2: Medium (3-4 hours)
- Phase 3: Medium (3-4 hours)

---

## Opportunity 3: Configuration Fragmentation

### What Is Overcomplicated

Agent-studio has 5+ configuration sources that must stay synchronized:

| Source                        | Purpose                                             | Lines |
| ----------------------------- | --------------------------------------------------- | ----- |
| `CLAUDE.md`                   | Router instructions, routing table, model selection | 632   |
| `config.yaml`                 | Agent model configuration                           | 135   |
| `agent-config.json` (runtime) | Agent registry with 49 entries                      | ~500  |
| `agent-registry.json`         | Agent discovery registry                            | ~300  |
| `routing-table.cjs`           | Keyword-to-agent routing                            | 2,472 |
| `capability-routing.json`     | Capability-to-agent mapping                         | ~50   |

The reference uses a single `config.json` (45 lines) covering database, search, quality gates, model preferences, and parallel sessions.

**Specific redundancy observed:**

- The routing table in CLAUDE.md (Section 3) duplicates routing-table.cjs
- agent-config.json and agent-registry.json serve overlapping discovery purposes
- config.yaml model preferences could be inline in CLAUDE.md

### Simpler Approach

1. **Merge agent-config.json and agent-registry.json** into a single `agent-registry.json` that includes model preferences (currently in config.yaml). One file to update when adding agents.

2. **Remove CLAUDE.md routing table duplication.** CLAUDE.md Section 3 has a markdown table that duplicates routing-table.cjs. Replace with a single reference: "See routing-table.cjs for routing rules."

3. **Merge capability-routing.json into routing-table.cjs.** The capability mapping is another layer of indirection serving the same purpose.

### Risk Assessment

- **Low risk:** These are data consolidations, not logic changes.
- **Risk:** Any code that imports from the old location needs updating. Grep for consumers first.

### Estimated Effort

Medium (3-4 hours). Mostly find-and-replace across consumers.

---

## Opportunity 4: Reference Documentation Explosion

### What Is Overcomplicated

**Directory:** `.claude/docs/` (24 files, 14 @-prefixed reference files totaling 4,124 lines)

These @reference files exist because CLAUDE.md was compressed to 632 lines by extracting details into separate files. However, this creates a lookup chain: CLAUDE.md references @file, agent reads @file, still needs to cross-reference other @files.

| @File                    | Lines | Content                       |
| ------------------------ | ----- | ----------------------------- |
| @ENFORCEMENT_HOOKS.md    | 1,134 | Hook enforcement details      |
| @DIRECTORY_STRUCTURE.md  | 467   | Directory layout              |
| @TOOL_REFERENCE.md       | 402   | Tool catalog                  |
| @WORKFLOW_AGENT_MAP.md   | 319   | Workflow-agent mapping        |
| @HOOK_AGENT_MAP.md       | 302   | Hook-agent mapping            |
| @ENVIRONMENT_CONFIG.md   | 265   | Environment variables         |
| @MODEL_SELECTION.md      | 267   | Model selection guide         |
| @SKILL_USAGE_GUIDE.md    | 243   | Skill selection decision tree |
| @EVOLUTION_WORKFLOW.md   | 199   | EVOLVE process                |
| @TASK_TRACKING_GUIDE.md  | 145   | TaskUpdate best practices     |
| @AGENT_ROUTING_TABLE.md  | 106   | Routing matrix                |
| @CREATOR_SKILLS_TABLE.md | 95    | Creator skill mapping         |
| @SKILL_CATALOG_TABLE.md  | 92    | Skill catalog                 |
| @ENTERPRISE_WORKFLOWS.md | 88    | Workflow paths                |

**The reference approach:** 1 reference file (`claude-code-resources.md`) linking to official docs. Rules are inline in `core-rules.md` (52 lines).

Additionally, the `.claude/context/artifacts/catalogs/` directory has 7 catalog files (2,208 lines) that overlap with the @reference files.

### Simpler Approach

**Consolidate @files by audience:**

Instead of 14 specialized @files, create 3:

1. **@ROUTER-REFERENCE.md** -- Merges routing table, model selection, agent routing, task tracking (for router only)
2. **@AGENT-REFERENCE.md** -- Merges tool reference, skill catalog, enforcement hooks, environment config (for spawned agents)
3. **@ARCHITECTURE-REFERENCE.md** -- Merges directory structure, enterprise workflows, evolution workflow (for architects/planners)

This reduces 14 files / 4,124 lines to 3 files / ~2,500 lines (with deduplication).

**Remove catalog/reference overlap:**

- skill-catalog.md overlaps with @SKILL_CATALOG_TABLE.md
- tool-catalog.md overlaps with @TOOL_REFERENCE.md
- Delete the catalog versions or the @file versions (keep one)

### Risk Assessment

- **Low risk:** Documentation changes do not affect runtime behavior.
- **Risk:** Agents that reference specific @file names in their definitions need updating.

### Estimated Effort

Medium (2-3 hours). Mostly copy-paste consolidation.

---

## Opportunity 5: Spawn Template Overengineering

### What Is Overcomplicated

**Directory:** `.claude/templates/` (27 files across agents, code-styles, reports, skills, spawn, workflows subdirectories)

The spawn templates include:

- `universal-agent-spawn.md` -- Standard agent spawn template
- `orchestrator-spawn.md` -- Orchestrator spawn template
- `agent-identity-integration.md` -- Identity overlay
- `subordinate-once.md` -- One-shot subordinate template

Plus 23 other templates for ADRs, architecture docs, code styles, error recovery, plans, reports, security checklists, specifications, task lists, test plans.

**The reference approach:** 5 template files in a single `split-claude-md/` directory (CLAUDE.md, AGENTS.md, COMMANDS.md, LEARNED.md, SOUL.md). These are project setup templates, not spawn templates. Agent spawning uses the agent markdown files directly -- no separate spawn template layer.

**Specific overengineering:**
The spawn template system has a multi-step protocol: load template, substitute placeholders, validate with spawn-prompt-validator.cjs, handle fallback. The reference just includes agent instructions directly in the Task() prompt.

### Simpler Approach

1. **Reduce spawn templates to 2:** `standard-spawn.md` (all non-orchestrator agents) and `orchestrator-spawn.md` (agents that spawn subagents). The identity integration and subordinate-once patterns can be inline options within the standard template.

2. **Remove non-spawn templates that are unused or have single consumers.** If only one agent uses `error-recovery-template.md`, inline it in that agent's definition.

3. **Simplify spawn protocol:** The template loading / placeholder substitution / validation chain could be a single function that takes (agentType, taskId, task) and returns a prompt string. No need for Read-template-then-substitute-then-validate.

### Risk Assessment

- **Low risk for template reduction:** Removing unused templates has no runtime impact.
- **Medium risk for spawn protocol simplification:** The spawn-prompt-validator catches real issues (missing task IDs, wrong model). Simplification must preserve these checks.

### Estimated Effort

Low-Medium (2-3 hours).

---

## Opportunity 6: Workflow and Schema Proliferation

### What Is Overcomplicated

**Workflows:** 28 files, 16,129 lines across `.claude/workflows/`

Many workflows describe processes that are either:

- Rarely triggered (e.g., `consensus-voting-skill-workflow.md`, `chrome-browser-skill-workflow.md`)
- Already encoded in agent prompts (e.g., `code-review-workflow.md` duplicates code-reviewer.md instructions)
- Too granular (e.g., separate workflows for `context-compressor`, `progressive-disclosure`, `database-architect`)

**Schemas:** 53 JSON schema files in `.claude/schemas/`

Most schemas validate agent frontmatter or artifact structure. The reference uses no schemas -- agent definitions are simple YAML frontmatter + markdown, validated by the LLM's natural language understanding.

**The reference approach:** Zero workflow files. Processes are described directly in agent definitions and skill files. The `AGENTS.md` template (49 lines) covers planning, subagent usage, quality gates, session wrap-up, and self-correction.

### Simpler Approach

**Workflows:**

1. **Tier 1 (keep as-is):** `router-decision.md`, `enterprise-workflow.md`, `evolution-workflow.md` -- these are core orchestration logic.
2. **Tier 2 (merge into agent definitions):** Skill-specific workflows (12 files like `database-architect-skill-workflow.md`) should be sections within their agent's definition file. The workflow adds no value as a separate file when the agent already has the same instructions.
3. **Tier 3 (archive):** Rarely-used workflows that have not been triggered in practice.

This could reduce 28 workflow files to ~8 (the core orchestration ones).

**Schemas:**

- Keep schemas for runtime validation (hook input/output, task metadata).
- Archive schemas that only validate agent frontmatter -- the LLM handles this.
- Reduce from 53 to ~15 essential schemas.

### Risk Assessment

- **Low risk for workflow merging:** Agent definitions already contain the workflow logic; the separate files are redundant documentation.
- **Medium risk for schema reduction:** Some schemas may be consumed by CI validation tools.

### Estimated Effort

Medium (4-6 hours for full audit and consolidation).

---

## Summary of Opportunities

| #         | Opportunity                  | Files Affected         | Lines Saved | Risk       | Effort     |
| --------- | ---------------------------- | ---------------------- | ----------- | ---------- | ---------- |
| 1         | Routing table consolidation  | 1 file                 | ~2,200      | Low        | Medium     |
| 2         | Hook consolidation (Phase 1) | 4 hooks merged         | ~400        | Low        | Low        |
| 2         | Hook consolidation (Phase 2) | 7 validators -> 2      | ~2,000      | Medium     | Medium     |
| 2         | Hook consolidation (Phase 3) | routing-guard refactor | ~500        | Medium     | Medium     |
| 3         | Configuration deduplication  | 3 files merged         | ~400        | Low        | Medium     |
| 4         | @reference doc consolidation | 14 -> 3 files          | ~1,600      | Low        | Medium     |
| 5         | Spawn template reduction     | 27 -> ~8               | ~500        | Low-Medium | Low-Medium |
| 6         | Workflow consolidation       | 28 -> ~8               | ~8,000      | Low-Medium | Medium     |
| 6         | Schema reduction             | 53 -> ~15              | variable    | Medium     | Medium     |
| **Total** |                              |                        | **~15,600** |            |            |

## Principles Applied

This analysis follows the constraint: **"Overcomplicated" does NOT mean "remove features."**

Every opportunity preserves the exact same functionality:

- Same 49 agents are routable
- Same enforcement hooks fire
- Same creator guards protect artifact paths
- Same quality gates block bad commits
- Same multi-phase orchestration works

The savings come from:

- Eliminating duplicated data (routing table in 3 places)
- Merging overlapping hooks (4 hooks doing variants of the same check)
- Consolidating reference docs (14 files that could be 3)
- Archiving unused artifacts (schemas nobody consumes)

## What We Should NOT Simplify

Based on the previous failed attempt (user rejected 80-line agent checklists replacing 400-line enterprise agents):

1. **Agent definitions** -- Our agents are rich, domain-specific prompts. The reference's 55-line agents would not achieve the same specialization depth.
2. **Creator guard enforcement** -- The unified-creator-guard.cjs prevents orphan artifacts. The reference has no equivalent because it has no artifact creation workflow.
3. **Task tracking protocol** -- Our TaskUpdate enforcement prevents stuck tasks. The reference has no multi-agent coordination to track.
4. **Memory protocol** -- Our learnings/decisions/issues system persists knowledge across sessions. The reference has a simpler LEARNED.md approach that does not scale to 49 agents.
5. **Hook enforcement modes** -- The block/warn/off system allows gradual rollout. Removing it would lose operational flexibility.

## Recommended Priority Order

1. **Routing table consolidation** (Opportunity 1) -- Highest impact-to-effort ratio. Single file, 2,200 lines saved.
2. **Reference doc consolidation** (Opportunity 4) -- Low risk, immediate clarity improvement.
3. **Hook Phase 1 merge** (Opportunity 2a) -- 4 hooks eliminated with zero feature loss.
4. **Workflow consolidation** (Opportunity 6a) -- 8,000 lines of redundant workflow docs.
5. **Config deduplication** (Opportunity 3) -- Reduces sync burden across 5 config sources.
6. **Spawn template reduction** (Opportunity 5) -- Cleanup with moderate impact.
7. **Validator extraction** (Opportunity 2b) and **Schema reduction** (Opportunity 6b) -- Lower priority, higher risk.
