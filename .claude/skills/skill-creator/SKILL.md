---
name: skill-creator
description: Create, validate, and convert skills for the agent ecosystem. Enforces standardized structure for consistency. Enables self-evolution by creating new skills on demand, converting MCP servers and codebases to skills.
version: 2.3.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch]
# Phase 1 Integration: All tools validated against .claude/config/tool-manifest.json
# If a tool becomes unavailable, new skills will use fallback tools from the manifest
# Single source of truth: .claude/config/tool-manifest.json
args: '<action> [options]'
best_practices:
  - Always use standardized structure
  - Include Memory Protocol section
  - Create scripts/main.cjs for executable logic
  - Validate after creation
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: '2026-02-28'
dependencies: [research-synthesis]
---

**Mode: Script-First** - Use `scripts/create.cjs` as the canonical path for new skill creation, then use this guide for research, review, and integration follow-through.

# Skill Creator

Create, validate, install, and convert skills for the multi-agent ecosystem without skipping routing, catalog, and registry integration.

## Purpose

Use this skill to:

1. Create a new skill from scratch.
2. Convert MCP servers or external codebases into skills.
3. Install a skill from GitHub.
4. Validate an existing skill definition.
5. Assign or register related hooks, schemas, and companion artifacts.

## Reference Docs

- [Research gate details](./docs/research-gate.md) - preserved research gate, security scan, evidence-quality, and typed-artifact-search guidance.
- [Enterprise bundle details](./docs/enterprise-bundle.md) - preserved scaffold defaults, action reference, and directory/layout guidance.
- [Integration reference](./docs/integration-reference.md) - preserved pre/post-creation workflow, catalog/routing/index updates, and creator-ecosystem cross-links.
- [Examples and evaluation](./docs/examples-and-evaluation.md) - preserved reference skill notes, worked examples, system impact checklists, and optional evaluation material.

## Actions

| Action                                | Use when                                          | Primary command                                                                                             |
| ------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `create`                              | Creating a brand-new skill                        | `node .claude/skills/skill-creator/scripts/create.cjs --name <skill-name> --description "<summary>"`        |
| `convert`                             | Converting an MCP server into a skill             | `node .claude/skills/skill-creator/scripts/convert.cjs --source <package-or-url>`                           |
| `validate`                            | Checking an existing skill definition             | `node .claude/tools/cli/validate-integration.cjs .claude/skills/<skill-name>/SKILL.md`                      |
| `install`                             | Importing a skill from GitHub                     | Follow the preserved install flow in [enterprise bundle details](./docs/enterprise-bundle.md)               |
| `convert-codebase`                    | Turning an external tool or codebase into a skill | Follow the preserved conversion notes in [enterprise bundle details](./docs/enterprise-bundle.md)           |
| `consolidate`                         | Folding many narrow skills into domain experts    | Use the preserved consolidation reference in [enterprise bundle details](./docs/enterprise-bundle.md)       |
| `convert-rules`                       | Migrating legacy rules into skills                | Use the preserved rule-conversion reference in [enterprise bundle details](./docs/enterprise-bundle.md)     |
| `assign`                              | Assigning a skill to one or more agents           | Use the checklist below and the detailed matrix in [integration reference](./docs/integration-reference.md) |
| `register-hooks` / `register-schemas` | Wiring existing assets into a skill               | Use the preserved action notes in [enterprise bundle details](./docs/enterprise-bundle.md)                  |
| `show-structure`                      | Reviewing the expected folder layout              | Use the template and directory guidance below                                                               |

## Core Creation Workflow

### Step 0: Existence Check and Updater Delegation

Before creating any skill file, check whether the skill already exists.

```bash
test -f .claude/skills/<skill-name>/SKILL.md && echo "EXISTS" || echo "NEW"
```

- If the skill exists, stop creation and delegate to `artifact-updater`.
- If the skill is new, continue to Step 0.1.
- Do not bypass this step with direct writes; `unified-creator-guard.cjs` is expected to block unsafe creation paths.

### Step 0.1: Smart Duplicate Detection

Run the duplicate detector before proceeding:

```javascript
const { checkDuplicate } = require('.claude/lib/creation/duplicate-detector.cjs');
const result = checkDuplicate({
  artifactType: 'skill',
  name: proposedName,
  description: proposedDescription,
  keywords: proposedKeywords || [],
});
```

Handle results exactly as before:

- `EXACT_MATCH` -> stop and route to `skill-updater`
- `REGISTRY_MATCH` -> investigate registry/file drift before creating
- `SIMILAR_FOUND` -> review candidates and decide whether to create or update
- `NO_MATCH` -> continue to Step 0.5

### Step 0.5: Companion Check

Run the companion check before creation:

1. Load `.claude/lib/creators/companion-check.cjs`.
2. Call `checkCompanions("skill", "{skill-name}")`.
3. Record required and recommended companion artifacts.
4. Capture any skipped companions in the post-creation notes.

If the skill provides behavioral guidance that should persist outside explicit invocation, confirm whether it also needs `.claude/rules/<skill-name>.md`.

### Step 1: Choose the Correct Action

Pick the narrowest action that matches the request:

- `create` for a brand-new skill
- `convert` for MCP server conversion
- `install` for importing a GitHub skill
- `convert-codebase` for lifting an external tool or codebase into a skill
- `validate` when the artifact already exists and only needs verification

### Step 2: Run the Research Gate Before Finalizing Content

Complete the preserved research workflow in [research gate details](./docs/research-gate.md) before you finalize the skill body. That reference keeps the original VoltAgent, Exa, arXiv, typed-artifact-search, evidence-quality, and external-content safety material.

### Step 3: Run the Canonical Create Script

For a brand-new skill, start with the managed scaffold:

```bash
node .claude/skills/skill-creator/scripts/create.cjs --name <skill-name> --description "<summary>"
```

Use the template below as the contract that the generated `SKILL.md` must satisfy. The detailed format notes, action examples, and layout guidance remain preserved in [enterprise bundle details](./docs/enterprise-bundle.md).

### Step 4: Review the Requested Scaffold

The enterprise bundle is now **opt-in**. Start from the minimal scaffold by default, and only add enterprise files when the request explicitly asks for `--enterprise` or the capability truly needs them. At minimum, decide whether the skill needs:

- `scripts/` for executable helpers
- `hooks/` for pre/post execution enforcement
- `schemas/` for typed interfaces
- `templates/` or `references/` for reusable authoring material
- a companion tool in `.claude/tools/<skill-name>/`
- a workflow in `.claude/workflows/`

The original bundle breakdown and acceptance checklist are preserved in [enterprise bundle details](./docs/enterprise-bundle.md).

### Step 5: Validate and Integrate

Before completion:

1. Run the post-creation checklist below.
2. Run `node .claude/tools/cli/validate-integration.cjs .claude/skills/<skill-name>/SKILL.md`.
3. Regenerate the skill index if the artifact is new or materially changed.
4. Re-run any targeted validators needed for the touched surface.
5. If the new skill reveals companion artifact work for another creator, record it as a **Follow-Up** item instead of invoking another creator inline from this flow.

## Router Gap Detection

After scaffolding or updating a skill, verify the routing layer can still discover it. Treat any `no matching agent/skill` result as a routing gap that must be resolved before handoff.

- Check whether the skill needs a new or updated agent assignment.
- Regenerate indexes and registries when discoverability metadata changed.
- Record unresolved routing follow-ups explicitly instead of assuming another creator will infer them.

## Template Reference

Use this baseline structure in `SKILL.md`:

```yaml
---
name: skill-name
description: What the skill does
version: 1.0.0
model: sonnet
invoked_by: user | agent | both
user_invocable: true | false
tools: [Read, Write, Bash]
args: "<required> [optional]"
agents: [developer, qa]
category: "Validation & Quality"
tags: [testing, validation]
---

# Skill Name

## Purpose
What this skill accomplishes.

## Usage
How the skill is invoked and applied.

## Examples
Concrete invocation or workflow examples.
```

Required frontmatter fields that must stay explicit: `name`, `description`, `version`, `agents`, `category`, `tags`, `tools`, `invoked_by`, and `user_invocable`.

## Post-Creation Checklist

- [ ] The right action path was used (`create`, `convert`, `install`, `validate`, or another supported action).
- [ ] The research gate was completed or explicitly documented with preserved evidence.
- [ ] The skill file exists at `.claude/skills/<skill-name>/SKILL.md`.
- [ ] Required frontmatter fields are present, especially `agents`, `category`, and `tags`.
- [ ] At least one relevant agent assignment was confirmed.
- [ ] `CLAUDE.md`, routing notes, and the skill catalog were updated if required.
- [ ] `node .claude/tools/cli/validate-integration.cjs .claude/skills/<skill-name>/SKILL.md` passes.
- [ ] `node .claude/tools/cli/generate-skill-index.cjs` was run when discoverability metadata changed.
- [ ] `npm run gen:all-registries` was run for new or re-registered skills.
- [ ] README footprint or catalog updates were completed when the creation flow requires them.
- [ ] Companion artifacts, memory notes, and follow-up items were recorded.

## Ecosystem Alignment Contract (MANDATORY)

This creator skill must keep every new or updated skill aligned with the broader creator ecosystem:

- `agent-creator` for ownership and execution paths
- `tool-creator` for executable helpers
- `hook-creator` for enforcement and guardrails
- `rule-creator` and `semgrep-rule-creator` for policy coverage
- `template-creator` for reusable scaffolds
- `workflow-creator` for orchestration
- `command-creator` for user-facing shortcuts

### Cross-Creator Handshake (Required)

Before handoff, verify the related ecosystem updates:

1. Routing and discovery metadata were updated where required.
2. Companion agents, hooks, tools, templates, rules, or workflows were created or explicitly waived.
3. `validate-integration.cjs` passes for the skill artifact.
4. Skill indexes and registries were regenerated when metadata changed.
5. Any unresolved ecosystem gaps were recorded as follow-up work.

### Research Gate (Exa + arXiv — BOTH MANDATORY)

For new skill patterns, packaging approaches, or AI-adjacent methodologies:

1. Use Exa to review current ecosystem patterns and implementation examples.
2. Search arXiv when the topic touches AI agents, evaluation, orchestration, memory/RAG, security, or other emerging methods.
3. Record the decisions, constraints, and non-goals that shaped the skill contract.
4. Prefer the smallest validated change that satisfies the request.

### Regression-Safe Delivery

- Follow RED -> GREEN -> REFACTOR for behavior changes.
- Run targeted tests for the touched skill and creator surfaces.
- Run required format and validation commands before handoff.
- Keep changes scoped to the failing contract instead of bundling unrelated cleanup.

## Notes

- Direct creation outside the creator flow risks invisible skills and broken registry state.
- If the new skill implies a new agent or other companion artifact, capture that as a Follow-Up for the next creator workflow rather than chaining creators inline.
- Use [integration reference](./docs/integration-reference.md) for the preserved verbose Step 6-13 guidance.
- Use [examples and evaluation](./docs/examples-and-evaluation.md) for the preserved reference skill, example creation walkthrough, and optional evaluation add-ons.
