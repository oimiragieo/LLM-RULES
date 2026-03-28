---
name: agent-creator
description: Creates specialized AI agents on-demand when no existing agent matches a request. Use when the Router cannot find a suitable agent for a task. Enables self-evolution by generating persistent agents.
version: 2.3.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Glob, Grep, WebSearch, WebFetch, Bash, Task]
# Phase 1 Integration: All tools validated against .claude/config/tool-manifest.json
# If a tool becomes unavailable, spawned agents will be notified at spawn time via
# pre-spawn-tool-validator.cjs hook (Phase 1B)
# Single source of truth: .claude/config/tool-manifest.json
args: '<agent-name> [options] [--eval] [--eval --tier light]'
best_practices:
  - Verify no existing agent matches first
  - Research domain before creating agent
  - Align agent to BLS OOH occupational profiles (Step 2.3)
  - Compare against Ongig job titles for routing keywords
  - Use MyMajors career skills for real-world skill grounding
  - Run skills gap analysis and record follow-up items for reusable skill gaps
  - Assign relevant skills to new agents
error_handling: graceful
streaming: supported
output_location: .claude/agents/
verified: true
lastVerifiedAt: '2026-02-28'
dependencies: [research-synthesis]
---

**Mode: Script-First** - Use `scripts/main.cjs` as the canonical path for generation and validation, then use this guide for research, skill assignment, and integration follow-through.

# Agent Creator Skill

Creates specialized AI agents on-demand for capabilities that do not already have a good owner.

## When This Skill Is Triggered

1. The router finds no suitable existing agent.
2. The user explicitly asks for a new agent.
3. A capability gap requires a persistent specialist rather than a one-off task.

## Reference Docs

- [Occupational alignment details](./docs/occupational-alignment.md) - preserved router notes, trigger guidance, companion checks, domain research, and occupational-alignment fetch details.
- [Research and skills-gap details](./docs/research-and-skills-gap.md) - preserved keyword research, skill discovery, configuration notes, and the full template contract reference.
- [Integration reference](./docs/integration-reference.md) - preserved validation, routing-table, registry, memory, README, and ecosystem-integration guidance.
- [Examples and evaluation](./docs/examples-and-evaluation.md) - preserved workflow integration notes, ecosystem alignment contract, examples, assertions, and optional eval add-ons.

## Quick Reference

| Operation                     | Primary command or tool                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------- | --------------- |
| Check for existing agents     | `Glob: .claude/agents/**/*.md`                                                                                                                     |
| Generate the managed template | `node .claude/skills/agent-creator/scripts/main.cjs --action generate --name <agent-name> --description "<summary>" --category <core               | domain | specialized | orchestrators>` |
| Validate the managed template | `node .claude/skills/agent-creator/scripts/main.cjs --action validate --file .claude/agents/<category>/<agent-name>.md`                            |
| Research the role             | Follow [occupational alignment details](./docs/occupational-alignment.md) and [research and skills-gap details](./docs/research-and-skills-gap.md) |
| Final integration             | Follow [integration reference](./docs/integration-reference.md)                                                                                    |

## Core Creation Workflow

### Step 0: Existence Check and Updater Delegation

Before creating any agent file, check whether the target already exists.

```bash
test -f .claude/agents/<category>/<agent-name>.md && echo "EXISTS" || echo "NEW"
```

- If the agent exists, stop and route the request to `artifact-updater`.
- If the agent is new, continue to Step 0.1.
- Do not create a new agent markdown file freehand when the managed template path applies.

### Step 0.1: Smart Duplicate Detection

Run the duplicate detector before creating a new artifact:

```javascript
const { checkDuplicate } = require('.claude/lib/creation/duplicate-detector.cjs');
const result = checkDuplicate({
  artifactType: 'agent',
  name: proposedName,
  description: proposedDescription,
  keywords: proposedKeywords || [],
});
```

Handle the outcomes exactly as before:

- `EXACT_MATCH` -> stop and route to `agent-updater`
- `REGISTRY_MATCH` -> inspect registry drift before creating
- `SIMILAR_FOUND` -> review the candidates and decide whether to create or update
- `NO_MATCH` -> continue to Step 0.5

### Step 0.5: Companion Check

Run `checkCompanions("agent", "{agent-name}")` from `.claude/lib/creators/companion-check.cjs` before you continue. Record missing companion artifacts and carry them into post-creation follow-ups.

### Step 1: Verify No Existing Agent Fits the Need

Search `.claude/agents/**/*.md` and the surrounding directories before proceeding. If an existing core, specialized, domain, or orchestrator agent already fits, use it instead of creating a duplicate specialist.

### Step 2: Research the Domain

Complete the preserved research flow before finalizing the agent contract:

- Use [occupational alignment details](./docs/occupational-alignment.md) for the original BLS/Ongig/MyMajors research and adjacent-role guidance.
- Use [research and skills-gap details](./docs/research-and-skills-gap.md) for keyword research, skills-gap analysis, and supporting-skill discovery.

### Step 3: Find Relevant Skills to Assign

Every new agent still needs a deliberate skill set.

1. Scan the existing skill catalog.
2. Identify primary, supporting, and on-demand skills.
3. Record reusable skill gaps as **Follow-Up** items for the appropriate creator/updater instead of invoking another creator inline from this workflow.
4. Include the assigned skills in frontmatter and in the workflow Step 0 load sequence.
5. Keep search-oriented and task-management skills aligned with existing conventions.

### Step 4: Determine Agent Configuration

Decide the agent archetype, category, and model before generation.

| Agent Type | Use when                                | Model    |
| ---------- | --------------------------------------- | -------- |
| Worker     | Executes tasks directly                 | `sonnet` |
| Analyst    | Research, review, or evaluation focused | `sonnet` |
| Specialist | Deep domain expertise                   | `opus`   |
| Advisor    | Strategic guidance or consulting        | `opus`   |

Choose the output directory that matches the role: core, specialized, domain, or orchestrators.

### Step 5: Generate Agent Definition

Use the contract-first generator and validate the output before any manual refinement:

```bash
node .claude/skills/agent-creator/scripts/main.cjs --action generate --name <agent-name> --description "<summary>" --category <core|domain|specialized|orchestrators>
node .claude/skills/agent-creator/scripts/main.cjs --action validate --file .claude/agents/<category>/<agent-name>.md
```

The preserved template details in [research and skills-gap details](./docs/research-and-skills-gap.md) still define the required `skills:` array, Step 0 skill loading, lazy-load path usage, hook/workflow tables, response approach, behavioral traits, and examples.

## Template Reference

Keep this minimum frontmatter and workflow contract:

```yaml
---
name: agent-name
description: What the agent does and when to use it
tools: [Read, Write, Edit, Grep, Glob, Bash, WebSearch, WebFetch, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill]
model: sonnet
context_strategy: lazy_load
skills:
  - task-management-protocol
  - code-semantic-search
context_files:
  - @.claude/context/memory/learnings.md
---
```

And keep the generated body aligned with these sections:

- `## Enforcement Hooks`
- `## Related Workflows`
- `## Core Persona`
- `## Workflow` with `### Step 0: Load Skills (FIRST)`
- `## Response Approach`
- `## Behavioral Traits`
- `## Example Interactions`
- `## Task Progress Protocol` and `## Memory Protocol`

## Post-Creation Checklist

- [ ] The existence and duplicate checks were completed.
- [ ] Occupational alignment, keyword research, and skills-gap review were documented.
- [ ] The agent was generated with `scripts/main.cjs` and validated with `--action validate`.
- [ ] Required frontmatter fields, skills, and lazy-load references are present.
- [ ] `@AGENT_ROUTING_TABLE.md` and any required routing keywords were updated.
- [ ] `node .claude/tools/cli/validate-integration.cjs .claude/agents/<category>/<agent-name>.md` passes.
- [ ] `node .claude/tools/cli/generate-agent-registry.cjs` was run when the agent is new or materially changed.
- [ ] `.claude/config/agent-config.json` was updated when tool defaults are required.
- [ ] `npm run gen:all-registries` was run for new or re-registered agents.
- [ ] README footprint updates, memory notes, and integration follow-ups were captured.

## Ecosystem Alignment Contract (MANDATORY)

This creator skill must keep new or updated agents aligned with the rest of the creator ecosystem:

- `skill-creator` for reusable capabilities and assignments
- `tool-creator` for executable automation surfaces
- `hook-creator` for guardrails and enforcement
- `template-creator` for scaffold reuse
- `workflow-creator` for orchestration and phase gating
- `command-creator` for operator-facing entry points

### Cross-Creator Handshake (Required)

Before handoff, verify the related ecosystem updates:

1. The route is discoverable in routing docs and registries.
2. Companion skills, tools, hooks, templates, or workflows were created or explicitly waived.
3. `validate-integration.cjs` passes for the affected agent artifact.
4. Registries and indexes were regenerated when metadata changed.
5. Follow-up gaps were recorded instead of silently deferred.

### Research Gate (Exa + arXiv — BOTH MANDATORY)

For new agent patterns, role designs, orchestration models, or evaluation flows:

1. Use Exa to review current implementation patterns and ecosystem conventions.
2. Search arXiv for relevant research when the topic touches AI agents, evaluation, orchestration, memory/RAG, or security.
3. Record the decisions, constraints, and non-goals that shaped the final agent contract.
4. Prefer minimal, validated changes over speculative expansion.

### Regression-Safe Delivery

- Follow RED -> GREEN -> REFACTOR for behavior changes.
- Run targeted tests for the touched agent and creator surfaces.
- Run required format and validation commands before handoff.
- Keep changes scoped to the failing contract instead of bundling unrelated cleanup.

## Notes

- Use [integration reference](./docs/integration-reference.md) for the preserved verbose Step 6-14 guidance.
- If the agent uncovers reusable skill work, capture it as a Follow-Up for the next creator workflow rather than chaining to `skill-creator` inline.
- Use [examples and evaluation](./docs/examples-and-evaluation.md) for the preserved examples, orchestrator sync notes, and optional evaluation material.
