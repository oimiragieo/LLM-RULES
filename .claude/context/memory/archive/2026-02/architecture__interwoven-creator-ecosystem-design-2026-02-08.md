<!-- Agent: architect | Task: #38 | Session: 2026-02-08 -->

# Architecture Design: Interwoven Creator Ecosystem with Research-First Protocol

**Date:** 2026-02-08
**Author:** Architect Agent (Task #38)
**Status:** PROPOSED
**Supersedes:** ADR-100 (extends, does not replace)
**Complexity:** HIGH (cross-cutting, 6+ files, new library module, workflow changes)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Current State Analysis](#3-current-state-analysis)
4. [Architecture Design](#4-architecture-design)
5. [Companion Matrix Data Structure](#5-companion-matrix-data-structure)
6. [companion-check.cjs API Design](#6-companion-checkcjs-api-design)
7. [artifact-integrator Enhancement](#7-artifact-integrator-enhancement)
8. [Research-First Protocol Enhancement](#8-research-first-protocol-enhancement)
9. [Ecosystem Creation Workflow](#9-ecosystem-creation-workflow)
10. [Integration Points](#10-integration-points)
11. [Diagrams](#11-diagrams)
12. [Trade-Offs and Risks](#12-trade-offs-and-risks)
13. [Implementation Sequence](#13-implementation-sequence)

---

## 1. Executive Summary

The Interwoven Creator Ecosystem addresses the "orphaned artifact" problem: when a creator skill produces an artifact (agent, skill, hook, etc.), companion artifacts are often missed, leaving the new artifact partially integrated. The current `ecosystem-impact-graph.json` describes downstream integrations but lacks the concept of "companion artifacts" -- artifacts that should be co-created alongside the primary one.

This design introduces:

- A **Companion Matrix** defining bidirectional relationships between artifact types
- A **companion-check.cjs** pre-creation library that produces a companion checklist before any creator runs
- Enhanced **artifact-integrator** post-creation flow using the companion matrix for follow-up task generation
- **Research-First Protocol** enhancements to prefer Exa/MCP tools over generic WebSearch
- A **Unified Ecosystem Creation Workflow** documenting the full creation lifecycle

---

## 2. Problem Statement

### Current Gaps

1. **No pre-creation companion awareness.** Creator skills run without knowing what companion artifacts are needed. The `ecosystem-impact-graph.json` is only checked post-creation by artifact-integrator.

2. **Unidirectional graph.** The current impact graph says "when creating an agent, update routing-table," but does not say "when creating an agent, also verify/create: a skill assignment, a command (optional), tests." It tracks integration targets, not companion artifacts.

3. **No pre-creation checkpoint.** There is no "Step 0.5" in creator skills that checks what companion artifacts already exist and what is missing before the creator begins.

4. **Research tool preference not enforced.** The research-synthesis skill lists `mcp__Exa__web_search_exa` in its tool manifest but the creator skill instructions (agent-creator Step 2, etc.) still reference `WebSearch` as the primary research method.

5. **No unified workflow documentation.** The full creation lifecycle is spread across CLAUDE.md Gate 4, router-decision.md Step 0, individual creator skills, and artifact-integrator. No single document describes the end-to-end flow.

---

## 3. Current State Analysis

### Existing Infrastructure

| Component                     | Location                              | Purpose                                         | Status          |
| ----------------------------- | ------------------------------------- | ----------------------------------------------- | --------------- |
| ecosystem-impact-graph.json   | `.claude/context/data/`               | Maps artifact types to integration targets      | Active, 9 types |
| creator-commons.cjs           | `.claude/lib/creators/`               | 5 shared functions for post-creation validation | Active          |
| ecosystem-impact-analyzer.cjs | `.claude/lib/creators/`               | analyzeImpact + checkMustHaveCompletion         | Active          |
| artifact-integrator SKILL.md  | `.claude/skills/artifact-integrator/` | Post-creation gap analysis, queue processing    | Active          |
| research-synthesis SKILL.md   | `.claude/skills/research-synthesis/`  | Pre-creation research with Exa+WebSearch        | Active          |
| 9 creator skills              | `.claude/skills/*/SKILL.md`           | Individual artifact creators                    | Active          |
| unified-creator-guard.cjs     | `.claude/hooks/safety/`               | Blocks direct writes to creator paths           | Active          |
| post-creation-integration.cjs | `.claude/hooks/workflow/`             | Queues integration analysis on completion       | Active          |
| integration-queue.jsonl       | `.claude/context/runtime/`            | Queue of artifacts needing integration          | Active          |

### Key Observations

1. **ecosystem-impact-graph.json** already has a 3-tier structure (`mustHave`, `shouldHave`, `niceToHave`) for 9 artifact types (agent, skill, hook, workflow, template, schema, command, rule, tool).

2. **creator-commons.cjs** provides `validatePostCreation`, `updateCatalog`, `queueCrossCreatorReview`, `validateSchema`, and `runIntegrationChecklist` -- all focused on post-creation.

3. **ecosystem-impact-analyzer.cjs** provides `analyzeImpact` (returns tiered items) and `checkMustHaveCompletion` (checks if integration targets are present). Both operate on the impact graph, which maps to integration targets (catalog files, registries), not companion artifacts.

4. **artifact-integrator** processes the integration queue and creates follow-up tasks for missing integrations, including backward propagation from ADR-100 Phase 3.1-3.3.

5. **All 9 creator skills** follow a consistent pattern: Step 0 (existence check / updater delegation), then creation steps, then post-creation updates. None have a "companion check" step.

---

## 4. Architecture Design

### Design Principle: Separation of Concerns

The design separates three distinct phases:

```
Phase 1: Pre-Creation (companion-check.cjs)
  - INPUT: artifact type being created
  - OUTPUT: checklist of companion artifacts (existing + missing)
  - TIMING: Before creator skill starts (Step 0.5 in each creator)
  - WHO RUNS IT: Each creator skill, inline

Phase 2: Creation (existing creator skills)
  - No changes to the creation logic itself

Phase 3: Post-Creation (enhanced artifact-integrator)
  - INPUT: completed artifact + companion matrix
  - OUTPUT: follow-up TaskCreate calls for missing companions
  - TIMING: After creator completes, via integration queue
  - WHO RUNS IT: artifact-integrator via Router Step 0.5
```

### Design Principle: Additive, Not Replacement

This design adds a `companionMatrix` field to the existing `ecosystem-impact-graph.json` rather than creating a new data file. The companion matrix describes "what else should exist" while the existing `artifactTypes` section describes "what integration targets to update." Both are needed and serve different purposes.

### Design Principle: Library, Not Hook

`companion-check.cjs` is designed as a library module in `.claude/lib/creators/`, not as a hook. Hooks operate on tool invocations (PreToolUse/PostToolUse). The companion check is a domain-level function called by creator skills during their execution, not a system-level tool interception.

---

## 5. Companion Matrix Data Structure

### Location

Add `companionMatrix` as a new top-level key in `.claude/context/data/ecosystem-impact-graph.json`.

### Schema

```json
{
  "companionMatrix": {
    "<artifactType>": {
      "required": [
        {
          "companionType": "<artifactType>",
          "relationship": "<verb-phrase>",
          "checkStrategy": "<strategy-name>",
          "checkTarget": "<path-or-pattern>",
          "autoCreate": <boolean>,
          "creatorSkill": "<skill-name>"
        }
      ],
      "recommended": [
        { ... }
      ],
      "optional": [
        { ... }
      ]
    }
  }
}
```

### Field Definitions

| Field           | Type    | Description                                                     |
| --------------- | ------- | --------------------------------------------------------------- |
| `companionType` | string  | The type of companion artifact (agent, skill, hook, etc.)       |
| `relationship`  | string  | Human-readable description of the relationship                  |
| `checkStrategy` | string  | How to verify if the companion exists (see Strategies below)    |
| `checkTarget`   | string  | Path pattern or file to check (supports `{name}` interpolation) |
| `autoCreate`    | boolean | Whether artifact-integrator should auto-spawn the creator       |
| `creatorSkill`  | string  | Which creator skill to invoke for missing companions            |

### Check Strategies

| Strategy              | Description                                  | Example                                  |
| --------------------- | -------------------------------------------- | ---------------------------------------- |
| `file-exists`         | Check if a specific file exists              | `tests/agents/{name}.test.cjs`           |
| `grep-in-file`        | Check if artifact name appears in a file     | `{name}` in `skill-catalog.md`           |
| `json-key-exists`     | Check if a key exists in a JSON file         | `agents.{name}` in `agent-registry.json` |
| `glob-match`          | Check if any file matches a glob pattern     | `.claude/commands/{name}.md`             |
| `settings-registered` | Check if hook is registered in settings.json | `{name}` in hooks array                  |

### Full Companion Matrix

```json
{
  "companionMatrix": {
    "agent": {
      "required": [
        {
          "companionType": "routing-entry",
          "relationship": "agent must have routing keywords in routing-table.cjs",
          "checkStrategy": "grep-in-file",
          "checkTarget": ".claude/lib/routing/routing-table.cjs",
          "autoCreate": false,
          "creatorSkill": "agent-creator"
        },
        {
          "companionType": "registry-entry",
          "relationship": "agent must be registered in agent-registry.json",
          "checkStrategy": "grep-in-file",
          "checkTarget": ".claude/context/agent-registry.json",
          "autoCreate": false,
          "creatorSkill": "agent-creator"
        },
        {
          "companionType": "claude-md-entry",
          "relationship": "agent must appear in CLAUDE.md Section 3 routing table",
          "checkStrategy": "grep-in-file",
          "checkTarget": ".claude/CLAUDE.md",
          "autoCreate": false,
          "creatorSkill": "agent-creator"
        }
      ],
      "recommended": [
        {
          "companionType": "skill",
          "relationship": "agent should have at least one assigned skill",
          "checkStrategy": "grep-in-file",
          "checkTarget": ".claude/context/agent-registry.json",
          "autoCreate": false,
          "creatorSkill": "skill-creator"
        },
        {
          "companionType": "test",
          "relationship": "agent should have behavioral tests",
          "checkStrategy": "glob-match",
          "checkTarget": "tests/agents/{name}*.test.*",
          "autoCreate": true,
          "creatorSkill": null
        },
        {
          "companionType": "command",
          "relationship": "agent may have a user-facing slash command",
          "checkStrategy": "file-exists",
          "checkTarget": ".claude/commands/{name}.md",
          "autoCreate": false,
          "creatorSkill": "command-creator"
        }
      ],
      "optional": []
    },
    "skill": {
      "required": [
        {
          "companionType": "catalog-entry",
          "relationship": "skill must appear in skill-catalog.md",
          "checkStrategy": "grep-in-file",
          "checkTarget": ".claude/context/artifacts/catalogs/skill-catalog.md",
          "autoCreate": false,
          "creatorSkill": "skill-creator"
        },
        {
          "companionType": "agent-assignment",
          "relationship": "skill must be assigned to at least one agent",
          "checkStrategy": "grep-in-file",
          "checkTarget": ".claude/context/agent-registry.json",
          "autoCreate": false,
          "creatorSkill": "skill-creator"
        }
      ],
      "recommended": [
        {
          "companionType": "command",
          "relationship": "skill may have a user-facing slash command",
          "checkStrategy": "file-exists",
          "checkTarget": ".claude/commands/{name}.md",
          "autoCreate": false,
          "creatorSkill": "command-creator"
        },
        {
          "companionType": "test",
          "relationship": "skill should have behavioral tests",
          "checkStrategy": "glob-match",
          "checkTarget": "tests/skills/{name}*.test.*",
          "autoCreate": true,
          "creatorSkill": null
        }
      ],
      "optional": []
    },
    "hook": {
      "required": [
        {
          "companionType": "settings-registration",
          "relationship": "hook must be registered in settings.json",
          "checkStrategy": "settings-registered",
          "checkTarget": ".claude/settings.json",
          "autoCreate": false,
          "creatorSkill": "hook-creator"
        },
        {
          "companionType": "enforcement-docs",
          "relationship": "hook must be documented in @ENFORCEMENT_HOOKS.md",
          "checkStrategy": "grep-in-file",
          "checkTarget": ".claude/docs/@ENFORCEMENT_HOOKS.md",
          "autoCreate": false,
          "creatorSkill": "hook-creator"
        }
      ],
      "recommended": [
        {
          "companionType": "test",
          "relationship": "hook should have unit tests",
          "checkStrategy": "glob-match",
          "checkTarget": "tests/hooks/{name}*.test.*",
          "autoCreate": true,
          "creatorSkill": null
        },
        {
          "companionType": "hook-agent-map",
          "relationship": "hook should appear in @HOOK_AGENT_MAP.md",
          "checkStrategy": "grep-in-file",
          "checkTarget": ".claude/docs/@HOOK_AGENT_MAP.md",
          "autoCreate": false,
          "creatorSkill": "hook-creator"
        }
      ],
      "optional": []
    },
    "workflow": {
      "required": [
        {
          "companionType": "workflow-agent-map",
          "relationship": "workflow must be mapped to agents in @WORKFLOW_AGENT_MAP.md",
          "checkStrategy": "grep-in-file",
          "checkTarget": ".claude/docs/@WORKFLOW_AGENT_MAP.md",
          "autoCreate": false,
          "creatorSkill": "workflow-creator"
        }
      ],
      "recommended": [
        {
          "companionType": "phase-definitions",
          "relationship": "workflow should have phase definitions with agent mappings",
          "checkStrategy": "grep-in-file",
          "checkTarget": null,
          "autoCreate": false,
          "creatorSkill": "workflow-creator"
        },
        {
          "companionType": "triggering-conditions",
          "relationship": "workflow should document when/how it is triggered",
          "checkStrategy": "grep-in-file",
          "checkTarget": null,
          "autoCreate": false,
          "creatorSkill": "workflow-creator"
        }
      ],
      "optional": [
        {
          "companionType": "diagram",
          "relationship": "workflow may have a Mermaid diagram",
          "checkStrategy": "glob-match",
          "checkTarget": ".claude/context/artifacts/diagrams/{name}*",
          "autoCreate": false,
          "creatorSkill": null
        }
      ]
    },
    "command": {
      "required": [
        {
          "companionType": "backing-skill",
          "relationship": "command must delegate to an existing skill",
          "checkStrategy": "glob-match",
          "checkTarget": ".claude/skills/{name}/SKILL.md",
          "autoCreate": false,
          "creatorSkill": "skill-creator"
        },
        {
          "companionType": "catalog-entry",
          "relationship": "command must appear in command-catalog.md",
          "checkStrategy": "grep-in-file",
          "checkTarget": ".claude/context/artifacts/catalogs/command-catalog.md",
          "autoCreate": false,
          "creatorSkill": "command-creator"
        }
      ],
      "recommended": [
        {
          "companionType": "claude-md-entry",
          "relationship": "command should appear in CLAUDE.md Section 7.1",
          "checkStrategy": "grep-in-file",
          "checkTarget": ".claude/CLAUDE.md",
          "autoCreate": false,
          "creatorSkill": "command-creator"
        }
      ],
      "optional": []
    },
    "rule": {
      "required": [
        {
          "companionType": "content-validation",
          "relationship": "rule must have heading, bullet points, and actionable items",
          "checkStrategy": "grep-in-file",
          "checkTarget": null,
          "autoCreate": false,
          "creatorSkill": "rule-creator"
        }
      ],
      "recommended": [
        {
          "companionType": "agent-acknowledgment",
          "relationship": "rule should be referenced by relevant agent instructions",
          "checkStrategy": "grep-in-file",
          "checkTarget": null,
          "autoCreate": false,
          "creatorSkill": null
        },
        {
          "companionType": "enforcement-hook",
          "relationship": "rule may have an enforcement hook",
          "checkStrategy": "glob-match",
          "checkTarget": ".claude/hooks/**/{name}*.cjs",
          "autoCreate": false,
          "creatorSkill": "hook-creator"
        }
      ],
      "optional": []
    },
    "tool": {
      "required": [
        {
          "companionType": "catalog-entry",
          "relationship": "tool must appear in tool-catalog.md",
          "checkStrategy": "grep-in-file",
          "checkTarget": ".claude/context/artifacts/catalogs/tool-catalog.md",
          "autoCreate": false,
          "creatorSkill": "tool-creator"
        }
      ],
      "recommended": [
        {
          "companionType": "agent-awareness",
          "relationship": "tool should be referenced by at least one agent",
          "checkStrategy": "grep-in-file",
          "checkTarget": ".claude/context/agent-registry.json",
          "autoCreate": false,
          "creatorSkill": null
        },
        {
          "companionType": "test",
          "relationship": "tool should have unit tests",
          "checkStrategy": "glob-match",
          "checkTarget": "tests/tools/{name}*.test.*",
          "autoCreate": true,
          "creatorSkill": null
        }
      ],
      "optional": []
    },
    "template": {
      "required": [
        {
          "companionType": "catalog-entry",
          "relationship": "template must appear in template-catalog.md",
          "checkStrategy": "grep-in-file",
          "checkTarget": ".claude/context/artifacts/catalogs/template-catalog.md",
          "autoCreate": false,
          "creatorSkill": "template-creator"
        }
      ],
      "recommended": [
        {
          "companionType": "consuming-skill",
          "relationship": "template should be referenced by at least one skill",
          "checkStrategy": "grep-in-file",
          "checkTarget": null,
          "autoCreate": false,
          "creatorSkill": null
        }
      ],
      "optional": []
    },
    "schema": {
      "required": [
        {
          "companionType": "catalog-entry",
          "relationship": "schema must appear in schema-catalog.md",
          "checkStrategy": "grep-in-file",
          "checkTarget": ".claude/context/artifacts/catalogs/schema-catalog.md",
          "autoCreate": false,
          "creatorSkill": "schema-creator"
        }
      ],
      "recommended": [
        {
          "companionType": "validating-consumer",
          "relationship": "schema should be consumed by a hook or skill for validation",
          "checkStrategy": "grep-in-file",
          "checkTarget": null,
          "autoCreate": false,
          "creatorSkill": null
        }
      ],
      "optional": []
    }
  }
}
```

### Relationship to Existing `artifactTypes`

The existing `artifactTypes` section in `ecosystem-impact-graph.json` focuses on **integration actions** (update-routing-table, update-catalog, etc.) with target file paths. The new `companionMatrix` focuses on **companion existence checks** -- verifying that related artifacts exist (or proposing their creation). They are complementary:

| Aspect      | `artifactTypes` (existing)          | `companionMatrix` (new)                          |
| ----------- | ----------------------------------- | ------------------------------------------------ |
| When used   | Post-creation (artifact-integrator) | Pre-creation (companion-check) AND post-creation |
| Purpose     | Track integration actions           | Check companion existence                        |
| Granularity | Action-level ("update X file")      | Artifact-level ("does Y exist?")                 |
| Consumer    | ecosystem-impact-analyzer.cjs       | companion-check.cjs AND artifact-integrator      |

---

## 6. companion-check.cjs API Design

### Location

`.claude/lib/creators/companion-check.cjs`

### Purpose

Pre-creation library module that reads the companion matrix and returns a structured checklist of companion artifacts, indicating which ones exist and which are missing.

### API Surface

```javascript
/**
 * companion-check.cjs
 *
 * Pre-creation companion artifact checker.
 * Reads the companionMatrix from ecosystem-impact-graph.json
 * and checks which companion artifacts exist for a given
 * artifact type and name.
 */

/**
 * Check all companion artifacts for a given artifact type.
 *
 * @param {string} artifactType - Type being created (agent, skill, hook, etc.)
 * @param {string} artifactName - Name of the artifact being created
 * @param {Object} [options] - Additional options
 * @param {string} [options.graphPath] - Override path to impact graph
 * @returns {CompanionCheckResult}
 */
function checkCompanions(artifactType, artifactName, options = {}) { ... }

/**
 * @typedef {Object} CompanionCheckResult
 * @property {string} artifactType - The artifact type checked
 * @property {string} artifactName - The artifact name checked
 * @property {CompanionItem[]} required - Required companions with status
 * @property {CompanionItem[]} recommended - Recommended companions with status
 * @property {CompanionItem[]} optional - Optional companions with status
 * @property {CompanionItem[]} missing - All missing companions (convenience)
 * @property {CompanionItem[]} present - All present companions (convenience)
 * @property {number} completionScore - 0.0-1.0 based on required items
 * @property {string} summary - Human-readable summary for injection into creator prompt
 */

/**
 * @typedef {Object} CompanionItem
 * @property {string} companionType - Type of companion
 * @property {string} relationship - Human-readable description
 * @property {boolean} exists - Whether the companion was found
 * @property {string} checkStrategy - Strategy used to check
 * @property {string|null} resolvedTarget - Actual path checked (after interpolation)
 * @property {boolean} autoCreate - Whether auto-creation is enabled
 * @property {string|null} creatorSkill - Creator skill to invoke if missing
 * @property {string} tier - "required" | "recommended" | "optional"
 */

/**
 * Generate a markdown checklist from check results.
 * Suitable for injection into creator skill prompts.
 *
 * @param {CompanionCheckResult} result - Output from checkCompanions
 * @returns {string} Markdown-formatted checklist
 */
function formatCompanionChecklist(result) { ... }

/**
 * Load the companion matrix from the ecosystem impact graph.
 *
 * @param {string} [graphPath] - Override path
 * @returns {Object|null} The companionMatrix section or null
 */
function loadCompanionMatrix(graphPath) { ... }

module.exports = {
  checkCompanions,
  formatCompanionChecklist,
  loadCompanionMatrix,
};
```

### Check Strategy Implementation

Each check strategy is a pure function that returns `boolean`:

```javascript
const CHECK_STRATEGIES = {
  'file-exists': resolvedTarget => {
    return fs.existsSync(path.join(PROJECT_ROOT, resolvedTarget));
  },

  'grep-in-file': (resolvedTarget, artifactName) => {
    if (!resolvedTarget) return false;
    const filePath = path.join(PROJECT_ROOT, resolvedTarget);
    if (!fs.existsSync(filePath)) return false;
    const content = fs.readFileSync(filePath, 'utf8');
    return content.toLowerCase().includes(artifactName.toLowerCase());
  },

  'json-key-exists': (resolvedTarget, artifactName) => {
    const filePath = path.join(PROJECT_ROOT, resolvedTarget);
    if (!fs.existsSync(filePath)) return false;
    const json = safeParseJSON(fs.readFileSync(filePath, 'utf8'));
    return json && artifactName in json;
  },

  'glob-match': resolvedTarget => {
    // Use simple fs.readdirSync + minimatch or manual check
    // Avoid heavy dependencies
    return globHasMatch(resolvedTarget);
  },

  'settings-registered': (resolvedTarget, artifactName) => {
    const filePath = path.join(PROJECT_ROOT, resolvedTarget);
    if (!fs.existsSync(filePath)) return false;
    const content = fs.readFileSync(filePath, 'utf8');
    return content.includes(artifactName);
  },
};
```

### Target Interpolation

The `{name}` placeholder in `checkTarget` is replaced with the actual artifact name:

```javascript
function interpolateTarget(template, artifactName) {
  if (!template) return null;
  return template.replace(/\{name\}/g, artifactName);
}
```

### Example Usage

```javascript
const {
  checkCompanions,
  formatCompanionChecklist,
} = require('.claude/lib/creators/companion-check.cjs');

// Before creating an agent named "python-pro"
const result = checkCompanions('agent', 'python-pro');

// result:
// {
//   artifactType: 'agent',
//   artifactName: 'python-pro',
//   required: [
//     { companionType: 'routing-entry', exists: true, tier: 'required', ... },
//     { companionType: 'registry-entry', exists: true, tier: 'required', ... },
//     { companionType: 'claude-md-entry', exists: true, tier: 'required', ... }
//   ],
//   recommended: [
//     { companionType: 'skill', exists: true, tier: 'recommended', ... },
//     { companionType: 'test', exists: false, tier: 'recommended', ... },
//     { companionType: 'command', exists: false, tier: 'recommended', ... }
//   ],
//   optional: [],
//   missing: [ {test}, {command} ],
//   present: [ {routing-entry}, {registry-entry}, {claude-md-entry}, {skill} ],
//   completionScore: 1.0,  // All required present
//   summary: "All 3 required companions present. 2 of 3 recommended missing (test, command)."
// }

const checklist = formatCompanionChecklist(result);
// Returns markdown like:
// ## Companion Artifact Checklist for agent:python-pro
// ### Required (3/3 present)
// - [x] routing-entry: agent must have routing keywords in routing-table.cjs
// - [x] registry-entry: agent must be registered in agent-registry.json
// - [x] claude-md-entry: agent must appear in CLAUDE.md Section 3 routing table
// ### Recommended (1/3 present)
// - [x] skill: agent should have at least one assigned skill
// - [ ] test: agent should have behavioral tests
// - [ ] command: agent may have a user-facing slash command
```

### Integration Into Creator Skills (Step 0.5)

Every creator skill gets a new step between Step 0 (existence check) and Step 1 (verification):

```markdown
### Step 0.5: Companion Check (MANDATORY)

Before proceeding with creation, check what companion artifacts already exist:

1. Load companion-check library
2. Run checkCompanions(artifactType, artifactName)
3. Review the checklist:
   - If required companions are missing and they should exist BEFORE this artifact: WARN
   - If recommended companions are missing: NOTE (will be addressed post-creation)
4. Include the checklist in your creation context so post-creation steps can reference it

This step is informational (does not block creation) but ensures the creator
is aware of the full integration landscape before starting.
```

---

## 7. artifact-integrator Enhancement

### Current Behavior

The artifact-integrator processes integration-queue.jsonl entries using `ecosystem-impact-analyzer.cjs` which reads `artifactTypes` from the impact graph. It creates follow-up tasks for missing integrations.

### Enhanced Behavior

After the existing integration check, the artifact-integrator additionally:

1. Loads the `companionMatrix` from the impact graph
2. Runs `checkCompanions(artifactType, artifactName)` on each processed artifact
3. For each missing companion with `autoCreate: true`, spawns the appropriate creator via TaskCreate
4. For each missing companion with `autoCreate: false`, creates a follow-up task noting the gap

### Enhanced Step 3 in artifact-integrator SKILL.md

```markdown
### Step 3.1: Companion Matrix Analysis (NEW)

After generating the standard integration plan (Step 3), also check companions:

1. Load companion-check: `require('.claude/lib/creators/companion-check.cjs')`
2. For each artifact processed:
   a. Run `checkCompanions(artifactType, artifactName)`
   b. For REQUIRED missing companions:
   - If `autoCreate: true` and `creatorSkill` is set: TaskCreate to invoke creator
   - If `autoCreate: false`: TaskCreate with "Verify/create {companionType} for {name}"
     c. For RECOMMENDED missing companions:
   - Create advisory tasks (lower priority)
     d. Include companion checklist in the integration report
```

### Deduplication

The artifact-integrator must deduplicate companion tasks against the existing `mustHave` integration tasks to avoid creating duplicate work. The deduplication key is `(artifactType, artifactName, companionType)`.

---

## 8. Research-First Protocol Enhancement

### Current State

- `research-synthesis` SKILL.md already lists `mcp__Exa__web_search_exa` and `mcp__Exa__get_code_context_exa` as tools
- Creator skills reference "Invoke `research-synthesis` BEFORE any creator skill" in CLAUDE.md
- However, individual creator skills' Step 2 instructions still reference `WebSearch` as the primary research method

### Proposed Changes

#### 8.1. research-synthesis SKILL.md Tool Priority

Add explicit tool priority section:

```markdown
## Tool Priority (IRON LAW)

Use tools in this priority order:

1. **mcp**Exa**web_search_exa** - Preferred for web research (better quality, structured results)
2. **mcp**Exa**get_code_context_exa** - Preferred for code examples and context
3. **mcp**Ref**ref_search_documentation** - Preferred for official documentation lookup
4. **WebSearch** - Fallback when MCP tools are unavailable
5. **WebFetch** - Fallback for fetching specific URLs

**Why MCP-first:** MCP tools provide higher-quality, structured results with better
code context. WebSearch/WebFetch are generic fallbacks.
```

#### 8.2. agent-creator Step 2 Enhancement

Update Step 2 research section to explicitly mention MCP tools:

```markdown
### Step 2: Research Domain

Research using MCP tools (preferred) or WebSearch (fallback):

1. **Code context:** `mcp__Exa__get_code_context_exa` for implementation patterns
2. **Best practices:** `mcp__Exa__web_search_exa` for domain expertise patterns
3. **Documentation:** `mcp__Ref__ref_search_documentation` for official docs
4. **Fallback:** `WebSearch` if MCP tools are unavailable
```

#### 8.3. All Creator Skills Preamble

Add to all 9 creator skills (before Step 1):

````markdown
### Research-First Protocol (MANDATORY)

Before starting creation, invoke research-synthesis:

```javascript
Skill({ skill: 'research-synthesis' });
```
````

This ensures all design decisions are backed by current best practices.
The research-synthesis skill prefers MCP tools (Exa, Ref) over WebSearch.

````

---

## 9. Ecosystem Creation Workflow

### Document: `ecosystem-creation-workflow.md`

**Location:** `.claude/workflows/core/ecosystem-creation-workflow.md`

### Structure

```markdown
# Ecosystem Creation Workflow

## Overview

End-to-end workflow for creating any artifact in the agent-studio ecosystem.
Ensures research-first protocol, companion awareness, and full integration.

## Phases

### Phase 1: Request Routing (Router)
- Router detects artifact creation request (Gate 4)
- Router spawns creator agent with research-synthesis + creator skill

### Phase 2: Research (research-synthesis)
- 3-5 Exa/MCP queries for best practices
- Existing codebase pattern analysis
- Research report generated

### Phase 3: Pre-Creation Check (companion-check.cjs)
- Load companion matrix for artifact type
- Check which companions exist
- Generate companion checklist
- Inject checklist into creator context

### Phase 4: Creation (creator skill)
- Existence check (Step 0)
- Companion check (Step 0.5)  <-- NEW
- Research validation (Step 1)
- Domain research (Step 2)
- Creation (Steps 3-N)
- Post-creation validation (creator-commons.cjs)
- Queue for integration (integration-queue.jsonl)

### Phase 5: Post-Creation Integration (artifact-integrator)
- Process integration queue
- Run standard impact analysis (ecosystem-impact-analyzer)
- Run companion matrix analysis (companion-check)  <-- NEW
- Create follow-up tasks for missing companions
- Update artifact graph
- Generate integration report

### Phase 6: Companion Creation (follow-up)
- Follow-up tasks trigger additional creator skill invocations
- Each companion goes through the same Phase 2-5 pipeline
- Recursive until all required companions are present

## Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant R as Router
    participant RS as research-synthesis
    participant CC as companion-check
    participant CR as Creator Skill
    participant CM as creator-commons
    participant IQ as integration-queue
    participant AI as artifact-integrator

    U->>R: "Create agent X"
    R->>R: Gate 4: Artifact creation detected
    R->>RS: Invoke research-synthesis
    RS->>RS: 3-5 Exa/MCP queries
    RS-->>R: Research report

    R->>CR: Invoke creator skill
    CR->>CR: Step 0: Existence check
    CR->>CC: Step 0.5: checkCompanions("agent", "X")
    CC-->>CR: CompanionCheckResult (checklist)
    CR->>CR: Steps 1-N: Create artifact
    CR->>CM: validatePostCreation + updateCatalog
    CR->>IQ: queueCrossCreatorReview

    R->>AI: Step 0.5: Process queue
    AI->>AI: Standard impact analysis
    AI->>CC: Companion matrix analysis
    CC-->>AI: Missing companions list
    AI->>AI: TaskCreate for missing companions
    AI-->>R: Integration report

    Note over R,AI: Follow-up creators run<br/>for missing companions
````

## Integration Points

| Integration Point   | Where                         | How                          |
| ------------------- | ----------------------------- | ---------------------------- |
| Router Gate 4       | CLAUDE.md Section 1.2         | Detects creation requests    |
| Router Step 0.5     | router-decision.md            | Processes integration queue  |
| Creator Step 0.5    | Each creator SKILL.md         | Runs companion check         |
| Post-creation hook  | post-creation-integration.cjs | Queues integration analysis  |
| artifact-integrator | artifact-integrator SKILL.md  | Processes queue + companions |

````

---

## 10. Integration Points

### Files to Create

| File | Purpose |
|------|---------|
| `.claude/lib/creators/companion-check.cjs` | Pre-creation companion checker library |
| `.claude/workflows/core/ecosystem-creation-workflow.md` | Unified creation workflow documentation |

### Files to Modify

| File | Change |
|------|--------|
| `.claude/context/data/ecosystem-impact-graph.json` | Add `companionMatrix` top-level key |
| `.claude/skills/agent-creator/SKILL.md` | Add Step 0.5, update Step 2 for MCP tools |
| `.claude/skills/skill-creator/SKILL.md` | Add Step 0.5 |
| `.claude/skills/hook-creator/SKILL.md` | Add Step 0.5 |
| `.claude/skills/workflow-creator/SKILL.md` | Add Step 0.5 |
| `.claude/skills/creators/command-creator/SKILL.md` | Add Step 0.5 |
| `.claude/skills/creators/rule-creator/SKILL.md` | Add Step 0.5 |
| `.claude/skills/creators/tool-creator/SKILL.md` | Add Step 0.5 |
| `.claude/skills/template-creator/SKILL.md` | Add Step 0.5 |
| `.claude/skills/schema-creator/SKILL.md` | Add Step 0.5 |
| `.claude/skills/artifact-integrator/SKILL.md` | Add Step 3.1 companion matrix analysis |
| `.claude/skills/research-synthesis/SKILL.md` | Add tool priority section |
| `.claude/workflows/core/router-decision.md` | Update Gate 4 references |

### Files to Test

| File | Test File |
|------|-----------|
| `.claude/lib/creators/companion-check.cjs` | `tests/lib/creators/companion-check.test.cjs` |
| `.claude/lib/creators/ecosystem-impact-analyzer.cjs` | Extend existing tests with companion matrix |

### No Changes Required

| File | Reason |
|------|--------|
| `creator-commons.cjs` | Functions are generic enough; no changes needed |
| `unified-creator-guard.cjs` | Still blocks direct writes; no changes needed |
| `post-creation-integration.cjs` | Already queues entries; no changes needed |

---

## 11. Diagrams

### System Architecture

```mermaid
graph TB
    subgraph "Pre-Creation Phase"
        RS[research-synthesis]
        CC[companion-check.cjs]
        EIG[ecosystem-impact-graph.json<br/>companionMatrix]
    end

    subgraph "Creation Phase"
        AC[agent-creator]
        SC[skill-creator]
        HC[hook-creator]
        WC[workflow-creator]
        OC[other creators]
    end

    subgraph "Post-Creation Phase"
        CM[creator-commons.cjs]
        IQ[integration-queue.jsonl]
        AI[artifact-integrator]
        EIA[ecosystem-impact-analyzer.cjs]
    end

    RS --> AC
    RS --> SC
    RS --> HC
    RS --> WC
    RS --> OC

    CC --> AC
    CC --> SC
    CC --> HC
    CC --> WC
    CC --> OC

    EIG --> CC
    EIG --> EIA

    AC --> CM
    SC --> CM
    HC --> CM
    WC --> CM
    OC --> CM

    CM --> IQ
    IQ --> AI
    AI --> EIA
    AI --> CC
    AI -.->|follow-up tasks| AC
    AI -.->|follow-up tasks| SC
    AI -.->|follow-up tasks| HC
````

### Data Flow

```mermaid
flowchart LR
    subgraph Input
        UR[User Request]
    end

    subgraph "Phase 1: Research"
        RS[research-synthesis<br/>3-5 Exa queries]
    end

    subgraph "Phase 2: Pre-Check"
        CC[companion-check<br/>read matrix + check files]
    end

    subgraph "Phase 3: Create"
        CR[Creator Skill<br/>write artifact]
    end

    subgraph "Phase 4: Validate"
        CM[creator-commons<br/>5 validations]
    end

    subgraph "Phase 5: Integrate"
        AI[artifact-integrator<br/>gap analysis + companion check]
    end

    subgraph "Phase 6: Follow-Up"
        FU[TaskCreate for<br/>missing companions]
    end

    UR --> RS --> CC --> CR --> CM --> AI --> FU
    FU -.->|recursive| RS
```

---

## 12. Trade-Offs and Risks

### Trade-Off 1: Library vs. Hook

**Decision:** Implement `companion-check.cjs` as a library module, not a hook.

**Pro:**

- Libraries are called explicitly by creator skills, giving them control over timing
- Hooks would fire on every Write/Edit, causing false positives on non-creator writes
- Library pattern matches existing `creator-commons.cjs` and `ecosystem-impact-analyzer.cjs`

**Con:**

- Each creator skill must explicitly add Step 0.5 (9 files to update)
- No automatic enforcement -- a creator could skip the check

**Mitigation:** The companion check is also run post-creation by artifact-integrator, providing a safety net even if a creator skips it.

### Trade-Off 2: Additive JSON vs. Separate File

**Decision:** Add `companionMatrix` to existing `ecosystem-impact-graph.json`.

**Pro:**

- Single source of truth for artifact relationships
- Avoids another JSON file that needs lifecycle management
- Companion matrix and integration targets are conceptually related

**Con:**

- File grows larger (currently ~325 lines, will grow to ~600)
- Two different consumers read different sections of the same file

**Mitigation:** Consumers load only their needed section. The file is cold-read (not hot-path).

### Trade-Off 3: Auto-Create Scope

**Decision:** Only `test` companions have `autoCreate: true`. Other companions require explicit tasks.

**Pro:**

- Prevents infinite creation loops (agent creates skill creates agent creates...)
- Tests are safe to auto-generate (no cascading side effects)
- Other companions need human/agent judgment

**Con:**

- Missing companions still require manual follow-up

**Mitigation:** artifact-integrator creates follow-up tasks (not TaskCreate from the creator itself), which the Router then assigns to appropriate agents.

### Risk 1: Circular Companion Dependencies

**Scenario:** Agent requires skill assignment. Skill requires agent assignment. Creating one triggers creation of the other in a loop.

**Mitigation:**

- The companion matrix uses `autoCreate: false` for cross-type companions
- artifact-integrator deduplicates against existing queue entries
- Follow-up tasks are P2 priority (not immediate), allowing human review

### Risk 2: Stale Companion Matrix

**Scenario:** The companion matrix falls out of sync with the actual ecosystem structure.

**Mitigation:**

- The matrix is versioned in Git alongside the code
- Schema validation can be added (schema-creator)
- artifact-integrator's health-check mode can audit the matrix

### Risk 3: Performance on Large Ecosystems

**Scenario:** With 49 agents, 50+ skills, and many hooks, the companion check reads multiple files.

**Mitigation:**

- File reads are cached per-session (companion-check runs once per creation)
- Only the relevant artifact type's companions are checked (not all types)
- Worst case: ~10 file reads per companion check (sub-second on local filesystem)

---

## 13. Implementation Sequence

### Phase 1: Data Structure (1 task)

1. Add `companionMatrix` to `ecosystem-impact-graph.json`

### Phase 2: Library Module (1 task)

2. Create `companion-check.cjs` with `checkCompanions`, `formatCompanionChecklist`, `loadCompanionMatrix`
3. Create tests for `companion-check.cjs`

### Phase 3: Creator Skill Updates (1 task, batch)

4. Add Step 0.5 to all 9 creator skills
5. Update agent-creator Step 2 with MCP tool references
6. Add tool priority section to research-synthesis SKILL.md

### Phase 4: artifact-integrator Enhancement (1 task)

7. Add Step 3.1 (companion matrix analysis) to artifact-integrator SKILL.md

### Phase 5: Workflow Documentation (1 task)

8. Create `ecosystem-creation-workflow.md`
9. Update `router-decision.md` Gate 4 references

### Phase 6: Quality Gates (1 task)

10. Run all tests (`pnpm test`)
11. Run lint (`pnpm lint:fix`) and format (`pnpm format`)
12. Verify no regressions

### Estimated Effort

| Phase                     | Files           | Complexity       | Estimated Duration |
| ------------------------- | --------------- | ---------------- | ------------------ |
| 1: Data Structure         | 1 modify        | LOW              | 15 min             |
| 2: Library Module         | 2 create        | MEDIUM           | 45 min             |
| 3: Creator Updates        | 10 modify       | LOW (repetitive) | 30 min             |
| 4: Integrator Enhancement | 1 modify        | MEDIUM           | 20 min             |
| 5: Workflow Docs          | 2 create/modify | LOW              | 20 min             |
| 6: Quality Gates          | 0 (testing)     | LOW              | 15 min             |
| **Total**                 | **16 files**    | **MEDIUM**       | **~2.5 hours**     |

---

## Appendix A: ADR Reference

This design extends **ADR-100** (Cross-Artifact Integration System) with:

- A new companion matrix data structure (backward-compatible addition to impact graph)
- A pre-creation companion check (new library)
- Enhanced post-creation companion analysis (extension to artifact-integrator)
- Unified creation workflow documentation (new workflow)

It does NOT change:

- The existing integration action model (`artifactTypes` in impact graph)
- The existing creator-commons validation functions
- The existing hook enforcement (unified-creator-guard, post-creation-integration)
- The Router's Gate 4 mechanism

---

## Appendix B: Checklist (IEEE 1028 Architecture Base)

- [x] SOLID principles: Single Responsibility (companion-check does one thing), Open/Closed (matrix is data-driven, extensible)
- [x] Separation of concerns: pre-creation check vs. creation vs. post-creation integration
- [x] Loose coupling: companion-check is a library, not wired into hooks
- [x] Extensibility: new artifact types can be added to the matrix without code changes
- [x] Failure modes: graceful degradation if matrix is missing (returns empty result)
- [x] Performance: sub-second file reads, no network calls
- [x] Backward compatibility: additive changes only, no breaking changes

### [AI-GENERATED] System-Specific Items

- [x] [AI-GENERATED] Companion matrix supports all 9 existing artifact types
- [x] [AI-GENERATED] Check strategies cover all existing verification patterns (file-exists, grep, json-key, glob, settings)
- [x] [AI-GENERATED] Circular dependency risk mitigated via autoCreate: false for cross-type companions
- [x] [AI-GENERATED] Integration with existing ADR-100 backward propagation mechanism
- [x] [AI-GENERATED] Research-first protocol preserves MCP tool priority over WebSearch fallback
