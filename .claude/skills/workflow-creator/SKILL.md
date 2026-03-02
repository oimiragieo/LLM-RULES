---
name: workflow-creator
description: 'Creates multi-agent orchestration workflows for complex tasks. Handles enterprise workflows, operational procedures, and custom orchestration patterns. Use when user needs to automate multi-phase processes with agent coordination.'
version: 2.2.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Glob, Grep]
# Phase 1 Integration: All tools validated against .claude/config/tool-manifest.json
# When workflows spawn agents, agents receive tools from manifest-based toolsets
# Single source of truth: .claude/config/tool-manifest.json
best_practices:
  - Define clear phase boundaries
  - Specify agent handoffs explicitly
  - Include error recovery procedures
  - Document parallel vs sequential execution
error_handling: graceful
streaming: supported
output_location: .claude/workflows/
verified: true
lastVerifiedAt: '2026-02-28'
---

# Workflow Creator Skill

Creates multi-agent orchestration workflows for complex tasks that require coordination across multiple agents and phases.

## ROUTER UPDATE REQUIRED (CRITICAL - DO NOT SKIP)

**After creating ANY workflow, you MUST update CLAUDE.md Section 8.6 "ENTERPRISE WORKFLOWS":**

```markdown
### {Workflow Name}

**Path:** `.claude/workflows/{category}/{workflow-name}.md`

**When to use:** {Trigger conditions}

**Phases:**

1. **{Phase Name}** - {Description}
   ...

**Agents Involved:**

- `{agent-name}` - {Role in workflow}
```

**Verification:**

```bash
grep "{workflow-name}" .claude/CLAUDE.md || echo "ERROR: CLAUDE.md SECTION 8.6 NOT UPDATED!"
```

**WHY**: Workflows not in CLAUDE.md will NEVER be invoked by the Router.

---

## When This Skill Is Triggered

1. **User requests complex orchestration** requiring multiple agents
2. **Repeatable multi-phase process** needs standardization
3. **Router identifies workflow gap** for common task pattern
4. **Existing workflow needs enhancement** or customization

## Quick Reference

| Operation                | Method                                                  |
| ------------------------ | ------------------------------------------------------- |
| Check existing workflows | `Glob: .claude/workflows/**/*.md`                       |
| Review workflow template | Read `.claude/templates/workflows/workflow-template.md` |
| Find relevant agents     | `Glob: .claude/agents/**/*.md`                          |
| Find relevant skills     | `Glob: .claude/skills/*/SKILL.md`                       |
| Create workflow          | Write to `.claude/workflows/<category>/<name>.md`       |

## Workflow Types

| Type       | Location                        | Purpose                               | Examples                             |
| ---------- | ------------------------------- | ------------------------------------- | ------------------------------------ |
| Enterprise | `.claude/workflows/enterprise/` | Complex multi-phase development       | feature-development, c4-architecture |
| Operations | `.claude/workflows/operations/` | Runtime procedures, incident response | incident-response, deployment        |
| Rapid      | `.claude/workflows/rapid/`      | Quick, focused task automation        | fix, refactor, review                |
| Custom     | `.claude/workflows/`            | Project-specific patterns             | conductor-setup                      |

## Workflow-Agent Archetype Reference

When creating workflows, determine which agent archetypes will use the workflow. See `.claude/docs/@WORKFLOW_AGENT_MAP.md` for:

- **Section 1**: Full workflow-agent matrix
- **Section 2**: Archetype workflow sets (Router/Orchestrator, Implementer, Reviewer, Documenter, Researcher, Domain)

After creating a workflow, you MUST add it to both the matrix AND update affected agents' `## Related Workflows` sections.

## Workflow Creation Process

### Step 0: Existence Check and Updater Delegation (MANDATORY - FIRST STEP)

**BEFORE creating any workflow file, check if it already exists:**

1. **Check if workflow already exists:**

   ```bash
   test -f .claude/workflows/<category>/<workflow-name>.md && echo "EXISTS" || echo "NEW"
   ```

2. **If workflow EXISTS:**
   - **DO NOT proceed with creation**
   - **Invoke artifact-updater workflow instead:**

     ```javascript
     Skill({
       skill: 'artifact-updater',
       args: {
         name: '<workflow-name>',
         changes: '<description of requested changes>',
         justification: 'Update requested via workflow-creator',
       },
     });
     ```

   - **Return updater result and STOP**

3. **If workflow is NEW:**
   - Continue with Step 0.5 below

---

### Step 0.5: Companion Check

Before proceeding with creation, run the ecosystem companion check:

1. Use `companion-check.cjs` from `.claude/lib/creators/companion-check.cjs`
2. Call `checkCompanions("workflow", "{workflow-name}")` to identify companion artifacts
3. Review the companion checklist — note which required/recommended companions are missing
4. Plan to create or verify missing companions after this artifact is complete
5. Include companion findings in post-creation integration notes

This step is **informational** (does not block creation) but ensures the full artifact ecosystem is considered.

---

### Step 1: Verify No Existing Workflow

```bash
# Search for relevant workflows
Glob: .claude/workflows/**/*.md
Grep: "<topic>" in .claude/workflows/
```

If a suitable workflow exists, consider enhancing it instead of creating a duplicate.

### Step 2.5: Workflow Pattern Research (MANDATORY)

Before creating a workflow, research existing patterns.

**1. Check existing workflows:**

```bash
Glob: .claude/workflows/**/*.md
```

**2. Research workflow patterns** (minimum 2 queries):

```javascript
WebSearch({ query: 'best <domain/topic name> agent workflow process 2026' });
WebSearch({ query: 'industry standard <workflow-type> orchestration phases 2026' });
```

**3. Document patterns found** in workflow comments

**BLOCKING**: Workflow creation cannot proceed without pattern research. This ensures workflows follow established patterns rather than reinventing solutions.

### Step 2: Identify Phases and Agents

**Analyze the process to break into phases:**

| Question                           | Determines                       |
| ---------------------------------- | -------------------------------- |
| What are the distinct stages?      | Phase boundaries                 |
| Which agent handles each stage?    | Agent assignments                |
| Can any stages run in parallel?    | Parallel execution opportunities |
| What outputs feed into next stage? | Data flow and handoffs           |
| What can go wrong at each stage?   | Error recovery procedures        |

**Common Phase Patterns:**

| Pattern                                      | Phases                        | When to Use |
| -------------------------------------------- | ----------------------------- | ----------- |
| Discovery -> Design -> Review -> Implement   | Feature development           |
| Analyze -> Fix -> Test -> Deploy             | Bug fix workflow              |
| Explore -> Plan -> Review                    | Planning workflow             |
| Triage -> Investigate -> Resolve -> Document | Incident response             |
| Code -> Component -> Container -> Context    | C4 architecture documentation |

### Step 3: Define Agent Handoffs

For each phase transition, specify:

```markdown
### Phase 1 -> Phase 2 Handoff

**Output from Phase 1**: .claude/context/plans/phase1-output.md
**Input to Phase 2**: Read output from Phase 1
**Handoff validation**: [Check output exists and is valid]
```

### Step 4: Generate Workflow Definition

Write to `.claude/workflows/<category>/<workflow-name>.md`:

````markdown
---
name: { workflow-name }
description: { Brief description of workflow purpose }
version: 1.0.0
agents:
  - { agent-1 }
  - { agent-2 }
tags: [{ tag1 }, { tag2 }, workflow]
---

# {Workflow Title}

{Brief description of workflow purpose and when to use it.}

**Extended Thinking**: {Detailed explanation of workflow rationale, approach, and design decisions.}

## Overview

{Detailed description of what this workflow accomplishes.}

## Configuration Options

### {Option Category 1}

- **{value_1}**: {Description}
- **{value_2}**: {Description}

## Phase 1: {Phase Name}

### Step 1: {Step Name}

**Agent**: {agent-name}

**Task Spawn**:

```javascript
Task({
  task_id: 'task-1',
  subagent_type: 'general-purpose',
  description: '{Task description}',
  prompt: `You are the {AGENT_NAME} agent.

## Task
{Task description}

## Instructions
1. Read your agent definition: .claude/agents/{category}/{agent}.md
2. **Invoke skills**: Skill({ skill: "{skill-name}" })
3. {Additional instructions}
4. Save output to: .claude/context/{output-path}

## Context
- {Context item 1}
- {Context item 2}

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record decisions to .claude/context/memory/decisions.md
`,
});
```
````

**Expected Output**: {Description of expected output}

## Phase 2: {Phase Name}

### Step 2: {Step Name} (Parallel)

**Agents**: {agent-a} + {agent-b} (spawned in parallel)

**Task Spawn**:

```javascript
// Spawn both agents in parallel for efficiency
Task({
  task_id: 'task-2',
  subagent_type: 'general-purpose',
  description: '{Agent A task}',
  prompt: `You are {AGENT_A}...`,
});

Task({
  task_id: 'task-3',
  subagent_type: 'general-purpose',
  description: '{Agent B task}',
  prompt: `You are {AGENT_B}...`,
});
```

**Expected Output**: {Description}

## Error Recovery

### If Phase 1 fails:

1. {Recovery step}
2. Restart Phase 1

### If Phase 2 review finds blockers:

1. {Recovery step}
2. Re-run reviews

## Success Criteria

- [ ] {Criterion 1}
- [ ] {Criterion 2}
- [ ] All agents completed their phases
- [ ] Memory files updated

## Usage Example

```javascript
// Router spawning workflow orchestrator
Task({
  task_id: 'task-4',
  subagent_type: 'general-purpose',
  description: 'Orchestrating {workflow-name} workflow',
  prompt: `Execute {workflow-name} workflow.

## Parameters
- {Parameter 1}
- {Parameter 2}

## Instructions
Follow the phased workflow in: .claude/workflows/{category}/{workflow-name}.md
`,
});
```

```

### Step 5: Validate Workflow References (BLOCKING)

**Before writing workflow file, verify ALL references are valid:**

| Reference | Validation |
|-----------|-----------|
| Agent files | All agents in `agents:` array exist in `.claude/agents/` |
| Skills | All skills referenced in prompts exist in `.claude/skills/` |
| Output paths | All output directories exist or will be created |
| Context files | All context files referenced are accessible |

**Validation checklist before writing:**
```

[ ] All referenced agents exist
[ ] All referenced skills exist
[ ] Output paths are valid
[ ] Error recovery procedures are complete
[ ] Success criteria are measurable

````

**BLOCKING**: Do not write workflow file if any reference is invalid.

### Step 5.5: Model and Tool Validation (CRITICAL)

**Model Validation for Agent Spawns (CRITICAL):**

When workflow templates spawn agents via Task tool:
- model field MUST be base name only: `haiku`, `sonnet`, or `opus`
- DO NOT use dated versions like `claude-opus-4-5-20251101`
- Choose model based on task complexity:
  - `haiku`: Quick validation, simple tasks
  - `sonnet`: Standard work (default)
  - `opus`: Complex reasoning, architecture

**Example:**
```javascript
// CORRECT
Task({
  task_id: 'task-5',
  model: 'sonnet',
  // ...
});

// WRONG - causes validation failures
Task({
  task_id: 'task-6',
  model: 'claude-sonnet-4-20250514',
  // ...
});
````

**Tools Array Validation:**

When specifying allowed_tools for spawned agents:

- Use standard tools: Read, Write, Edit, Bash, TaskUpdate, TaskList, etc.
- DO NOT include MCP tools (mcp\_\_\*) unless whitelisted in routing-table.cjs
- MCP tools cause router enforcement failures

**Allowed tools (standard):**

```javascript
allowed_tools: [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'TaskUpdate',
  'TaskList',
  'TaskCreate',
  'TaskGet',
  'Skill',
];
```

**Restricted tools (require explicit whitelisting):**

- `mcp__Exa__*` - Only for evolution-orchestrator
- `mcp__github__*` - Only for specific GitHub operations
- Other MCP tools - Must be whitelisted in routing-table.cjs

**Validation checklist for agent spawns:**

```
[ ] Model field uses base name (haiku/sonnet/opus)
[ ] allowed_tools contains only standard tools OR explicitly whitelisted MCP tools
[ ] No dated model versions (e.g., claude-opus-4-5-20251101)
```

### Step 6: Update CLAUDE.md Section 8.6 (MANDATORY - BLOCKING)

**This step is AUTOMATIC and BLOCKING. Do not skip.**

After workflow file is written, you MUST update CLAUDE.md:

1. **Find Section 8.6** ("ENTERPRISE WORKFLOWS")
2. **Generate workflow entry** in this format:

```markdown
### {Workflow Name}

**Path:** `.claude/workflows/{category}/{workflow-name}.md`

**When to use:** {Trigger conditions - be specific}

**Phases:**

1. **{Phase 1 Name}** - {Brief description}
2. **{Phase 2 Name}** - {Brief description}
   ...

**Configuration Options:**

- {Option category}: `{values}`

**Agents Involved:**

- `{agent-name}` - {Role description}
```

3. **Insert in appropriate location** (alphabetical or at end of section)
4. **Verify with**:

```bash
grep "{workflow-name}" .claude/CLAUDE.md || echo "ERROR: CLAUDE.md NOT UPDATED - BLOCKING!"
```

**BLOCKING**: If CLAUDE.md update fails, workflow creation is INCOMPLETE. Do NOT proceed.

### Step 7: System Impact Analysis (BLOCKING)

**After creating ANY workflow, analyze and update system-wide impacts.**

```
[WORKFLOW-CREATOR] System Impact Analysis for: <workflow-name>

1. CLAUDE.md UPDATE (MANDATORY)
   - Add entry to Section 8.6 (Enterprise Workflows)
   - Add to Section 3 (Multi-Agent Workflows) if referenced by Router
   - Verify with grep

2. AGENT COORDINATION CHECK
   - Do all agents referenced exist?
   - Do agents need new skills for this workflow?
   - Should any agent's definition reference this workflow?

3. SKILL AVAILABILITY CHECK
   - Are all skills referenced available?
   - Does this workflow need new skills? -> Invoke skill-creator
   - Should existing skills be enhanced?

4. MEMORY INTEGRATION CHECK
   - Does workflow use Memory Protocol?
   - Are output paths writable?
   - Will artifacts be properly persisted?

5. RELATED WORKFLOW CHECK
   - Does this duplicate existing workflow functionality?
   - Should existing workflows reference this one?
   - Are there workflow dependencies to document?

6. WORKFLOW-AGENT MAP UPDATED (MANDATORY)
   - Added new workflow to @WORKFLOW_AGENT_MAP.md Section 1 matrix
   - Determined which agent archetypes use this workflow
   - Updated affected agents' `## Related Workflows` sections
   - Verified: `grep "<workflow-name>" .claude/docs/@WORKFLOW_AGENT_MAP.md || echo "ERROR: Workflow not in agent map!"`
```

### Validation Checklist (Run After Every Creation) - BLOCKING

```bash
# Validate workflow file exists
ls .claude/workflows/<category>/<workflow-name>.md

# Verify all referenced agents exist
for agent in $(grep -oE '\\.claude/agents/[^"]+\\.md' .claude/workflows/<category>/<workflow>.md); do
  [ -f "$agent" ] || echo "BROKEN: $agent"
done

# Verify all referenced skills exist
for skill in $(grep -oE 'skill: "[^"]+"' .claude/workflows/<category>/<workflow>.md | cut -d'"' -f2); do
  [ -f ".claude/skills/$skill/SKILL.md" ] || echo "BROKEN: $skill"
done

# Check CLAUDE.md has workflow entry - MANDATORY
grep "<workflow-name>" .claude/CLAUDE.md || echo "ERROR: Not in CLAUDE.md - WORKFLOW CREATION INCOMPLETE"
```

**Completion Checklist** (all must be checked):

```
[ ] Workflow pattern research completed (Step 2.5)
[ ] Workflow file created at .claude/workflows/<category>/<name>.md
[ ] All referenced agents exist in .claude/agents/
[ ] All referenced skills exist in .claude/skills/
[ ] Model fields use base names only (haiku/sonnet/opus)
[ ] allowed_tools arrays contain only standard or whitelisted tools
[ ] CLAUDE.md Section 8.6 updated
[ ] Workflow entry verified with grep
[ ] Memory Protocol included in all agent prompts
```

**BLOCKING**: If ANY item fails, workflow creation is INCOMPLETE. Fix all issues before proceeding.

### Step 8: Post-Creation Workflow Registration (Phase 3 Integration)

**This step is CRITICAL.** After creating the workflow artifact, you MUST register it in the workflow discovery system.

**Phase 3 Context:** Phase 1 created tool manifests (tools), Phase 2 created skill indices (skills), Phase 3 creates workflow registries so workflows can be discovered and invoked by orchestrators.

After workflow file is written and validated:

1. **Create/Update Workflow Registry Entry** in appropriate location:

   If registry doesn't exist, create `.claude/context/artifacts/catalogs/workflow-registry.json`:

   ```json
   {
     "workflows": [
       {
         "name": "{workflow-name}",
         "id": "{workflow-name}",
         "description": "{Brief description from workflow}",
         "category": "{enterprise|core|operations}",
         "version": "1.0.0",
         "triggerConditions": ["{Condition 1}", "{Condition 2}"],
         "participatingAgents": ["{agent-1}", "{agent-2}"],
         "phases": [
           { "name": "{Phase 1 Name}", "description": "{Brief description}" },
           { "name": "{Phase 2 Name}", "description": "{Brief description}" }
         ],
         "filePath": ".claude/workflows/{category}/{workflow-name}.md",
         "orchestratorReferences": []
       }
     ]
   }
   ```

2. **Register with Appropriate Orchestrator:**

   Update the orchestrator that should use this workflow:
   - **master-orchestrator.md**: Meta-workflows coordinating other workflows
   - **evolution-orchestrator.md**: EVOLVE phase workflows (research, creation, validation)
   - **party-orchestrator.md**: Consensus/voting workflows
   - **swarm-coordinator.md**: Coordination workflows

   Add to orchestrator's workflow references:

   ```markdown
   ## Available Workflows

   - `{workflow-name}` (.claude/workflows/{category}/{workflow-name}.md)
   ```

3. **Document in `.claude/docs/WORKFLOW_CATALOG.md`:**

   If catalog doesn't exist, create it. Add entry:

   ```markdown
   ### {Workflow Title}

   **Path:** `.claude/workflows/{category}/{workflow-name}.md`

   **When to use:** {Trigger conditions - specific scenarios}

   **Participating Agents:**

   - {agent-1}: {role in workflow}
   - {agent-2}: {role in workflow}

   **Phases:**

   1. **{Phase 1 Name}** - {Description}
   2. **{Phase 2 Name}** - {Description}

   **Orchestrator Integration:**

   - Invoked by: {orchestrator-name}
   - Trigger: {How orchestrator discovers/triggers this}
   ```

4. **Verify Workflow Discoverability:**

   Test that the workflow can be discovered:

   ```bash
   # Check workflow registry exists and is valid JSON
   node -e "console.log(JSON.stringify(require('./.claude/context/artifacts/catalogs/workflow-registry.json'), null, 2))"

   # Verify orchestrator references it
   grep "{workflow-name}" .claude/agents/orchestrators/*-orchestrator.md
   ```

5. **Update Memory:**

   Append to `.claude/context/memory/learnings.md`:

   ```markdown
   ## Workflow: {workflow-name}

   - **Purpose:** {Workflow purpose}
   - **Orchestrator:** {Which orchestrator uses it}
   - **Key Pattern:** {Key pattern discovered}
   - **Integration Notes:** {Any special integration considerations}
   ```

**Why this matters:** Without workflow registration:

- Orchestrators cannot discover available workflows
- Workflows cannot be dynamically selected for complex tasks
- System loses visibility into workflow network
- "Invisible artifact" pattern emerges

**Phase 3 Integration:** Workflow registry is the discovery mechanism for Phase 3, enabling orchestrators to query available workflows and select appropriate ones for complex multi-agent tasks.

### Step 9: Integration Verification (BLOCKING - DO NOT SKIP)

**This step verifies the artifact is properly integrated into the ecosystem.**

Before calling `TaskUpdate({ status: "completed" })`, you MUST run the Post-Creation Validation workflow:

1. **Run the 10-item integration checklist:**

   ```bash
   node .claude/tools/cli/validate-integration.cjs .claude/workflows/<category>/<workflow-name>.md
   ```

2. **Verify exit code is 0** (all checks passed)

3. **If exit code is 1** (one or more checks failed):
   - Read the error output for specific failures
   - Fix each failure:
     - Missing CLAUDE.md entry -> Add to Section 8.6
     - Missing workflow registry -> Create registry entry (Step 8)
     - Missing orchestrator reference -> Add to orchestrator definition
     - Missing memory update -> Update learnings.md
   - Re-run validation until exit code is 0

4. **Only proceed when validation passes**

**This step is BLOCKING.** Do NOT mark task complete until validation passes.

**Why this matters:** The Party Mode incident showed that fully-implemented artifacts can be invisible to the Router if integration steps are missed. This validation ensures no "invisible artifact" pattern.

**Reference:** `.claude/workflows/core/post-creation-validation.md`

---

## Iron Laws of Workflow Creation

These rules are INVIOLABLE. Breaking them causes silent failures.

```
1. NO WORKFLOW WITHOUT AGENT VALIDATION
   - Every agent referenced must exist in .claude/agents/
   - Verify with: ls .claude/agents/<category>/<agent>.md

2. NO WORKFLOW WITHOUT SKILL VALIDATION
   - Every skill referenced must exist in .claude/skills/
   - Verify with: ls .claude/skills/<skill>/SKILL.md

3. NO PARALLEL EXECUTION WITHOUT INDEPENDENCE
   - Only spawn agents in parallel if their work is independent
   - Dependent work must be sequential

4. NO HANDOFF WITHOUT OUTPUT SPECIFICATION
   - Every phase must specify its output location
   - Every phase must specify what it reads from previous phases

5. NO WORKFLOW WITHOUT MEMORY PROTOCOL
   - Every agent prompt must include Memory Protocol section
   - Without it, learnings and decisions are lost

6. NO CREATION WITHOUT CLAUDE.MD UPDATE
   - After creating workflow, add to Section 8.6
   - Unregistered workflows are never invoked by Router

7. NO CREATION WITHOUT SYSTEM IMPACT ANALYSIS
   - Check if new agents are needed
   - Check if new skills are needed
   - Update @WORKFLOW_AGENT_MAP.md with new workflow row (MANDATORY)
   - Update affected agents' Related Workflows sections (MANDATORY)
   - Document all system changes made

8. NO AGENT SPAWN WITHOUT MODEL VALIDATION
   - model field MUST be base name only: haiku, sonnet, or opus
   - DO NOT use dated versions like claude-opus-4-5-20251101
   - Dated versions cause validation failures

9. NO AGENT SPAWN WITH UNRESTRICTED MCP TOOLS
   - Use standard tools: Read, Write, Edit, Bash, TaskUpdate, etc.
   - MCP tools (mcp__*) require explicit whitelisting
   - Unwhitelisted MCP tools cause router enforcement failures

10. NO WORKFLOW WITHOUT PATTERN RESEARCH
    - Research existing workflow patterns before creating new ones
    - Minimum 2 WebSearch queries for domain patterns
    - Document patterns found in workflow comments
```

---

## Workflow Integration

This skill is part of the unified artifact lifecycle. For complete multi-agent orchestration:

**Router Decision:** `.claude/workflows/core/router-decision.md`

- How the Router discovers and invokes this skill's artifacts

**Artifact Lifecycle:** `.claude/workflows/core/skill-lifecycle.md`

- Discovery, creation, update, deprecation phases
- Version management and registry updates
- CLAUDE.md integration requirements

**External Integration:** `.claude/workflows/core/external-integration.md`

- Safe integration of external artifacts
- Security review and validation phases

---

## Cross-Reference: Creator Ecosystem

This skill is part of the **Creator Ecosystem**. After creating a workflow, consider whether companion creators are needed:

| Gap Discovered                           | Required Artifact | Creator to Invoke                      | When                              |
| ---------------------------------------- | ----------------- | -------------------------------------- | --------------------------------- |
| Domain knowledge needs a reusable skill  | skill             | `Skill({ skill: 'skill-creator' })`    | Gap is a full skill domain        |
| Existing skill has incomplete coverage   | skill update      | `Skill({ skill: 'skill-updater' })`    | Close skill exists but incomplete |
| Capability needs a dedicated agent       | agent             | `Skill({ skill: 'agent-creator' })`    | Agent to own the capability       |
| Existing agent needs capability update   | agent update      | `Skill({ skill: 'agent-updater' })`    | Close agent exists but incomplete |
| Domain needs code/project scaffolding    | template          | `Skill({ skill: 'template-creator' })` | Reusable code patterns needed     |
| Behavior needs pre/post execution guards | hook              | `Skill({ skill: 'hook-creator' })`     | Enforcement behavior required     |
| Process needs multi-phase orchestration  | workflow          | `Skill({ skill: 'workflow-creator' })` | Multi-step coordination needed    |
| Artifact needs structured I/O validation | schema            | `Skill({ skill: 'schema-creator' })`   | JSON schema for artifact I/O      |
| User interaction needs a slash command   | command           | `Skill({ skill: 'command-creator' })`  | User-facing shortcut needed       |
| Repeated logic needs a reusable CLI tool | tool              | `Skill({ skill: 'tool-creator' })`     | CLI utility needed                |
| Narrow/single-artifact capability only   | inline            | Document within this artifact only     | Too specific to generalize        |

### Integration Workflow

After creating a workflow that needs additional capabilities:

```javascript
// 1. Workflow created but needs new agent
Skill({ skill: 'agent-creator' });
// Create the agent, then update workflow's agents: array

// 2. Workflow needs new skill
Skill({ skill: 'skill-creator' });
// Create the skill, then reference in workflow prompts

// 3. Workflow needs hooks for critical steps
// Create hooks in .claude/hooks/workflows/<workflow-name>/
// Reference in workflow's hooks: section
```

### Post-Creation Checklist for Ecosystem Integration

After workflow is fully created and validated:

```
[ ] Does workflow need agents that don't exist? -> Use agent-creator
[ ] Does workflow need skills that don't exist? -> Use skill-creator
[ ] Does workflow need entry/exit hooks? -> Create hooks
[ ] Does workflow need input validation? -> Create schemas
[ ] Should workflow be part of larger orchestration? -> Update master-orchestrator
[ ] Run post-creation validation -> node .claude/tools/cli/validate-integration.cjs .claude/workflows/<category>/<workflow-name>.yaml
```

---

## Examples

### Example 1: Creating Feature Development Workflow

**Request**: "Create a workflow for end-to-end feature development"

1. **Identify phases**: Discovery -> Architecture -> Implementation -> Testing -> Deployment
2. **Assign agents**: planner -> architect + security-architect -> developer -> qa -> devops
3. **Define handoffs**: Each phase outputs to `.claude/context/plans/feature-<name>/`
4. **Reference**: See `.claude/workflows/enterprise/feature-development-workflow.md`

### Example 2: Creating Incident Response Workflow

**Request**: "Create a workflow for production incident response"

1. **Identify phases**: Triage -> Investigation -> Resolution -> Post-mortem
2. **Assign agents**: incident-responder -> devops-troubleshooter + developer -> devops -> planner
3. **Define handoffs**: Each phase outputs to `.claude/context/incidents/`
4. **Create**: `.claude/workflows/operations/incident-response.md`

### Example 3: Creating C4 Architecture Workflow

**Request**: "Create a workflow to document system architecture using C4 model"

1. **Identify phases**: Code Analysis -> Component Synthesis -> Container Mapping -> Context Documentation
2. **Assign agents**: c4-code -> c4-component -> c4-container -> c4-context
3. **Define handoffs**: Bottom-up, each level builds on previous documentation
4. **Reference**: See `.claude/workflows/enterprise/c4-architecture-workflow.md`

---

## Workflow Template Quick Reference

Use the template at `.claude/templates/workflows/workflow-template.md` for consistent structure.

**Key sections every workflow must have:**

1. **YAML Frontmatter**: name, description, version, agents, tags
2. **Overview**: Purpose and when to use
3. **Configuration Options**: Customizable parameters
4. **Phases**: Sequential or parallel execution blocks
5. **Task Spawns**: Actual Task() calls with full prompts
6. **Error Recovery**: What to do when phases fail
7. **Success Criteria**: How to verify workflow completed successfully
8. **Usage Example**: How Router should invoke the workflow

---

## Architecture Compliance

### File Placement (ADR-076)

- Workflows: `.claude/workflows/{category}/` (core, enterprise, operations, creators)
- Tests: `tests/` (NOT in .claude/)
- Related agents: `.claude/agents/{category}/`
- Related skills: `.claude/skills/{name}/`
- Related templates: `.claude/templates/`

### Documentation References (CLAUDE.md v2.2.1)

- Reference files use @notation: @ENTERPRISE_WORKFLOWS.md, @AGENT_ROUTING_TABLE.md
- Located in: `.claude/docs/@*.md`
- See: CLAUDE.md Section 8.6 (ENTERPRISE WORKFLOWS reference)

### Shell Security (ADR-077)

- Workflow spawn templates must include: `cd "$PROJECT_ROOT" || exit 1` for background tasks
- Environment variables control validators (block/warn/off mode)
- See: .claude/docs/SHELL-SECURITY-GUIDE.md
- Apply to: agent spawn prompts, task execution examples

### Recent ADRs

- ADR-075: Router Config-Aware Model Selection
- ADR-076: File Placement Architecture Redesign
- ADR-077: Shell Command Security Architecture

---

## File Placement & Standards

### Output Location Rules

This skill outputs to: `.claude/workflows/<category>/`

Categories:

- `core/` - Essential workflows (router-decision, skill-lifecycle)
- `enterprise/` - Complex multi-agent flows (feature-development)
- `operations/` - Operational procedures (incident-response)
- `creators/` - Creator workflow YAML files

### Mandatory References

- **File Placement**: See `.claude/docs/FILE_PLACEMENT_RULES.md`
- **Developer Workflow**: See `.claude/docs/DEVELOPER_WORKFLOW.md`
- **Artifact Naming**: See `.claude/docs/ARTIFACT_NAMING.md`

### Enforcement

File placement is enforced by `file-placement-guard.cjs` hook.
Invalid placements will be blocked in production mode.

---

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
cat .claude/context/memory/learnings.md
```

Check for:

- Previously created workflows
- Workflow patterns that worked well
- Issues with existing workflows

**After completing:**

- New workflow created -> Append to `.claude/context/memory/learnings.md`
- Workflow issue found -> Append to `.claude/context/memory/issues.md`
- Architecture decision -> Append to `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.

---

## Post-Creation Integration

After creation completes, run the ecosystem integration checklist:

1. Call `runIntegrationChecklist(artifactType, artifactPath)` from `.claude/lib/creators/creator-commons.cjs`
2. Call `queueCrossCreatorReview(artifactType, artifactPath)` from `.claude/lib/creators/creator-commons.cjs`
3. Review the impact report — address all `mustHave` items before marking task complete
4. Log any `shouldHave` items as follow-up tasks

**Integration verification:**

- [ ] Workflow added to @WORKFLOW_AGENT_MAP.md
- [ ] Workflow referenced in CLAUDE.md (if enterprise workflow)
- [ ] Workflow assigned to at least one agent
- [ ] Workflow catalog entry added (if applicable)

## Ecosystem Alignment Contract (MANDATORY)

This creator skill is part of a coordinated creator ecosystem. Any artifact created here must align with and validate against related creators:

- `agent-creator` for ownership and execution paths
- `skill-creator` for capability packaging and assignment
- `tool-creator` for executable automation surfaces
- `hook-creator` for enforcement and guardrails
- `rule-creator` and `semgrep-rule-creator` for policy and static checks
- `template-creator` for standardized scaffolds
- `workflow-creator` for orchestration and phase gating
- `command-creator` for user/operator command UX

### Cross-Creator Handshake (Required)

Before completion, verify all relevant handshakes:

1. Artifact route exists in `.claude/CLAUDE.md` and related routing docs.
2. Discovery/registry entries are updated (catalog/index/registry as applicable).
3. Companion artifacts are created or explicitly waived with reason.
4. `validate-integration.cjs` passes for the created artifact.
5. Skill index is regenerated when skill metadata changes.

### Research Gate (Exa + arXiv — BOTH MANDATORY)

For new patterns, templates, or workflows, research is mandatory:

1. Use Exa for implementation and ecosystem patterns:
   - `mcp__Exa__web_search_exa({ query: '<topic> 2025 best practices' })`
   - `mcp__Exa__get_code_context_exa({ query: '<topic> implementation examples' })`
2. Search arXiv for academic research (mandatory for AI/ML, agents, evaluation, orchestration, memory/RAG, security):
   - Via Exa: `mcp__Exa__web_search_exa({ query: 'site:arxiv.org <topic> 2024 2025' })`
   - Direct API: `WebFetch({ url: 'https://arxiv.org/search/?query=<topic>&searchtype=all&start=0' })`
3. Record decisions, constraints, and non-goals in artifact references/docs.
4. Keep updates minimal and avoid overengineering.

**arXiv is mandatory (not fallback) when topic involves:** AI agents, LLM evaluation, orchestration, memory/RAG, security, static analysis, or any emerging methodology.

### Regression-Safe Delivery

- Follow strict RED -> GREEN -> REFACTOR for behavior changes.
- Run targeted tests for changed modules.
- Run lint/format on changed files.
- Keep commits scoped by concern (logic/docs/generated artifacts).
