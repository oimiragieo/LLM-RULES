<!-- Agent: planner | Task: #45 | Session: 2026-02-06 -->

# Plan: Update Creator and Updater Skills for Alignment Integration

## Executive Summary

After completing 4 alignment passes (skills #39, hooks #41, workflows #44, workspace conventions), the 6 creator skills need updates so that newly created artifacts automatically include the alignment data. This plan details the exact changes needed for each creator skill and notes the status of updater counterparts.

## Context

### What alignment added to agents (the reference format)

Using `python-pro.md` as the canonical example, agents now include:

1. **`## Enforcement Hooks` section** - Table of hooks that govern the agent, with Hook/Event/Purpose/Override columns, plus a reference to `@HOOK_AGENT_MAP.md`
2. **`## Related Workflows` section** - Table of workflows that guide the agent, with Workflow/Path/When to Use columns, plus output standards from workspace-conventions
3. **`skills:` frontmatter array** - 3-tier skill mapping (primary/supporting/on-demand)
4. **Workspace conventions compliance** - Provenance headers, naming conventions, output placement

### Reference documents

- `@HOOK_AGENT_MAP.md` - Hook-to-agent-archetype mapping (Section 2 has archetype hook sets)
- `@WORKFLOW_AGENT_MAP.md` - Workflow-to-agent-archetype mapping (Section 2 has archetype workflow sets)
- `.claude/rules/workspace-conventions.md` - Output standards, naming, provenance

### Updater status

All 6 updaters exist as YAML workflow files at `.claude/workflows/updaters/`:
- `agent-updater-workflow.yaml` - Exists, well-structured EVOLVE workflow
- `skill-updater-workflow.yaml` - Exists
- `hook-updater-workflow.yaml` - Exists
- `workflow-updater-workflow.yaml` - Exists
- `template-updater-workflow.yaml` - Exists
- `schema-updater-workflow.yaml` - Exists

**None exist as standalone `SKILL.md` files** in `.claude/skills/`. They are workflow YAML files only. The creator skills already reference them via `Skill({ skill: '<type>-updater' })` in their Step 0 (existence check), which is the intended pattern. No new updater SKILL.md files need to be created -- the YAML workflows are the correct implementation.

---

## Phases

### Phase 1: Update agent-creator SKILL.md (HIGHEST PRIORITY)

**File**: `.claude/skills/agent-creator/SKILL.md`
**Why first**: This is the skill that creates the artifacts most affected by alignment passes.

#### Task 1.1: Add Enforcement Hooks section to the agent template

**Location**: Step 5 "Generate Agent Definition" -- the agent template at ~line 258-448.

**What to add**: After the frontmatter and `# <Agent Title>` heading, BEFORE `## Core Persona`, add `## Enforcement Hooks` and `## Related Workflows` sections as part of the generated agent template.

**Old text to find** (in the agent template within Step 5):
```
# <Agent Title>

## Core Persona
```

**New text to replace with**:
```
# <Agent Title>

## Enforcement Hooks

The following hooks govern this agent's behavior at runtime:

<!-- AGENT-CREATOR: Populate this table based on the agent's archetype.
     Reference: .claude/docs/@HOOK_AGENT_MAP.md Section 2 "Agent Archetype Hook Sets"

     Determine archetype by agent's tools:
     - Has Task but NO Write/Edit/Bash → Router or Orchestrator archetype
     - Has Write/Edit/Bash → Implementer archetype
     - Has Read/Grep/Glob but NO Write/Edit → Reviewer archetype
     - Has Write/Edit but NO Bash → Documenter archetype
     - Has WebSearch/WebFetch + Read → Researcher archetype

     Then copy the appropriate hook table from @HOOK_AGENT_MAP.md Section 2. -->

| Hook | Event | Purpose | Override |
|------|-------|---------|----------|
| `tool-scope-validator.cjs` | PreToolUse(All) | Validates tool is in allowed set | -- |
| `execution-limit-monitor-hook.cjs` | PreToolUse(All) | Monitors execution limits | -- |
| <!-- Add archetype-specific hooks from @HOOK_AGENT_MAP.md --> | | | |

See `@.claude/docs/@HOOK_AGENT_MAP.md` for the complete hook-agent matrix.

## Related Workflows

The following workflows guide this agent's execution:

<!-- AGENT-CREATOR: Populate this table based on the agent's archetype.
     Reference: .claude/docs/@WORKFLOW_AGENT_MAP.md Section 2 "Agent Archetype Workflow Sets"

     All agents get: enterprise-workflow, reflection-workflow, workspace-conventions
     Then add archetype-specific workflows from @WORKFLOW_AGENT_MAP.md Section 2. -->

| Workflow | Path | When to Use |
|----------|------|-------------|
| Workspace Conventions | `.claude/rules/workspace-conventions.md` | Output placement, naming, provenance |
| <!-- Add archetype-specific workflows from @WORKFLOW_AGENT_MAP.md --> | | |

**Output Standards** (from workspace-conventions):
- Reports: `.claude/context/reports/`
- Plans: `.claude/context/plans/`
- Artifacts: `.claude/context/artifacts/[category]/`
- Naming: lowercase kebab-case with ISO date suffix
- Provenance: `<!-- Agent: {type} | Task: #{id} | Session: {date} -->`

## Core Persona
```

**Verify**: `grep "Enforcement Hooks" .claude/skills/agent-creator/SKILL.md`

#### Task 1.2: Add alignment references to Step 3 (Find Relevant Skills)

**Location**: Step 3 skill discovery section (~line 165-201).

**What to add**: Note that agent files now have a 3-tier `skills:` array structure.

**Old text to find**:
```
4. **Include ALL relevant skills** in the agent's frontmatter
```

**New text to replace with**:
```
4. **Include ALL relevant skills** in the agent's frontmatter using 3-tier mapping:
   - **Primary skills**: Core to this agent's domain (always loaded)
   - **Supporting skills**: Used frequently but not always
   - **On-demand skills**: Loaded only when specific task requires it
   - Reference: Task #39 skill-agent mapping for existing tier assignments
```

**Verify**: `grep "3-tier" .claude/skills/agent-creator/SKILL.md`

#### Task 1.3: Add new post-creation step for hook/workflow section population

**Location**: After Step 7.5 (Update Routing Table), before Step 8.

**What to add**: A new step that populates the Enforcement Hooks and Related Workflows sections based on archetype.

Insert a new **Step 7.6: Populate Alignment Sections (MANDATORY)** that reads:

```markdown
### Step 7.6: Populate Alignment Sections (MANDATORY - BLOCKING)

**After writing the agent file, you MUST populate the Enforcement Hooks and Related Workflows sections.**

1. **Determine agent archetype** based on tools array:
   - Router: Has Task but NOT Write/Edit/Bash
   - Implementer: Has Write/Edit + Bash
   - Reviewer: Has Read/Grep/Glob but NOT Write/Edit
   - Documenter: Has Write/Edit but NOT Bash
   - Orchestrator: Has Task tool, operates as coordinator
   - Researcher: Has WebSearch/WebFetch + Read

2. **Read hook archetype set** from `@.claude/docs/@HOOK_AGENT_MAP.md` Section 2
3. **Read workflow archetype set** from `@.claude/docs/@WORKFLOW_AGENT_MAP.md` Section 2
4. **Edit the agent file** to replace placeholder rows in both tables with the actual archetype-appropriate hooks and workflows

**Verification:**
```bash
grep "Enforcement Hooks" .claude/agents/<category>/<agent-name>.md || echo "ERROR: Missing Enforcement Hooks section!"
grep "Related Workflows" .claude/agents/<category>/<agent-name>.md || echo "ERROR: Missing Related Workflows section!"
```

**BLOCKING**: Agent creation is INCOMPLETE without populated alignment sections.
```

#### Task 1.4: Update Reference Agent comparison checklist

**Location**: The "Reference Agent (MANDATORY COMPARISON)" section (~line 479-503).

**Old text to find**:
```
[ ] Has all sections python-pro has (Core Persona, Capabilities, Workflow, Response Approach, Behavioral Traits, Example Interactions, Skill Invocation Protocol, Memory Protocol)
```

**New text to replace with**:
```
[ ] Has all sections python-pro has (Enforcement Hooks, Related Workflows, Core Persona, Capabilities, Workflow, Response Approach, Behavioral Traits, Example Interactions, Skill Invocation Protocol, Memory Protocol)
[ ] Enforcement Hooks table populated with archetype-appropriate hooks
[ ] Related Workflows table populated with archetype-appropriate workflows
[ ] Output Standards block present under Related Workflows
```

#### Task 1.5: Update Iron Law #7 to include alignment

**Location**: Iron Laws section (~line 837-890).

**Old text to find**:
```
7. NO CREATION WITHOUT SYSTEM IMPACT ANALYSIS
   - Update CLAUDE.md routing table (MANDATORY)
   - Update router.md agent tables (MANDATORY)
   - Check if new workflows are needed
   - Check if related agents need skill updates
   - Document all system changes made
```

**New text to replace with**:
```
7. NO CREATION WITHOUT SYSTEM IMPACT ANALYSIS
   - Update CLAUDE.md routing table (MANDATORY)
   - Update router.md agent tables (MANDATORY)
   - Populate Enforcement Hooks section from @HOOK_AGENT_MAP.md (MANDATORY)
   - Populate Related Workflows section from @WORKFLOW_AGENT_MAP.md (MANDATORY)
   - Check if new workflows are needed
   - Check if related agents need skill updates
   - Document all system changes made
```

#### Task 1.6: Update Completion Checklist

**Location**: Completion Checklist at ~line 999-1022.

**Old text to find**:
```
[ ] Compared against python-pro.md reference agent structure
```

**New text to replace with**:
```
[ ] Compared against python-pro.md reference agent structure
[ ] Enforcement Hooks section populated (archetype-matched from @HOOK_AGENT_MAP.md)
[ ] Related Workflows section populated (archetype-matched from @WORKFLOW_AGENT_MAP.md)
[ ] Output Standards block present with workspace-conventions references
```

**Success Criteria**: `agent-creator/SKILL.md` now generates agents with Enforcement Hooks and Related Workflows sections pre-populated by archetype.

---

### Phase 2: Update hook-creator SKILL.md

**File**: `.claude/skills/hook-creator/SKILL.md`

#### Task 2.1: Add post-creation step to update @HOOK_AGENT_MAP.md

**Location**: After Step 7 (System Impact Analysis), before Step 8.

**What to add**: A new sub-step in the System Impact Analysis checklist:

**Old text to find**:
```
5. MEMORY UPDATED
   [ ] Added to learnings.md with hook summary
```

**New text to replace with**:
```
5. MEMORY UPDATED
   [ ] Added to learnings.md with hook summary

6. HOOK-AGENT MAP UPDATED (MANDATORY)
   [ ] Added new hook to @HOOK_AGENT_MAP.md Section 1 matrix
   [ ] Determined which agent archetypes are affected (based on hook trigger/tool target)
   [ ] Updated affected agents' `## Enforcement Hooks` sections
   [ ] Verified: `grep "<hook-name>" .claude/docs/@HOOK_AGENT_MAP.md || echo "ERROR: Hook not in agent map!"`
```

#### Task 2.2: Add Iron Law for hook-agent map

**Location**: Iron Laws section (~line 930-971).

**Old text to find**:
```
8. NO CREATION WITHOUT SYSTEM IMPACT ANALYSIS
   - Check if hook requires settings.json registration
   - Check if hook requires config.yaml registration
   - Check if related hooks need updating
   - Document all system changes made
```

**New text to replace with**:
```
8. NO CREATION WITHOUT SYSTEM IMPACT ANALYSIS
   - Check if hook requires settings.json registration
   - Check if hook requires config.yaml registration
   - Check if related hooks need updating
   - Update @HOOK_AGENT_MAP.md with new hook row (MANDATORY)
   - Update affected agents' Enforcement Hooks sections (MANDATORY)
   - Document all system changes made
```

#### Task 2.3: Add reference to archetype hook sets

**Location**: After the Hook Types table (~line 57-63), add a note about archetypes.

**Old text to find**:
```
## Claude Code Hook Types
```

**New text to replace with**:
```
## Hook-Agent Archetype Reference

When creating hooks, determine which agent archetypes will be governed by the new hook. See `@.claude/docs/@HOOK_AGENT_MAP.md` for:
- **Section 1**: Full hook-agent matrix
- **Section 2**: Archetype hook sets (Router, Implementer, Reviewer, Documenter, Orchestrator, Researcher)

After creating a hook, you MUST add it to both the matrix AND update affected agents' `## Enforcement Hooks` sections.

## Claude Code Hook Types
```

**Success Criteria**: `hook-creator/SKILL.md` mandates updating `@HOOK_AGENT_MAP.md` and affected agent files on every hook creation.

---

### Phase 3: Update workflow-creator SKILL.md

**File**: `.claude/skills/workflow-creator/SKILL.md`

#### Task 3.1: Add post-creation step to update @WORKFLOW_AGENT_MAP.md

**Location**: In Step 7 (System Impact Analysis), add a new sub-item.

**Old text to find**:
```
5. RELATED WORKFLOW CHECK
   - Does this duplicate existing workflow functionality?
   - Should existing workflows reference this one?
   - Are there workflow dependencies to document?
```

**New text to replace with**:
```
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

#### Task 3.2: Add Iron Law for workflow-agent map

**Location**: Iron Laws section (~line 660-706).

**Old text to find**:
```
7. NO CREATION WITHOUT SYSTEM IMPACT ANALYSIS
   - Check if new agents are needed
   - Check if new skills are needed
   - Document all system changes made
```

**New text to replace with**:
```
7. NO CREATION WITHOUT SYSTEM IMPACT ANALYSIS
   - Check if new agents are needed
   - Check if new skills are needed
   - Update @WORKFLOW_AGENT_MAP.md with new workflow row (MANDATORY)
   - Update affected agents' Related Workflows sections (MANDATORY)
   - Document all system changes made
```

#### Task 3.3: Add archetype reference to Workflow Types section

**Location**: After the Workflow Types table (~line 76-82).

**Old text to find**:
```
## Workflow Creation Process
```

**New text to replace with**:
```
## Workflow-Agent Archetype Reference

When creating workflows, determine which agent archetypes will use the workflow. See `@.claude/docs/@WORKFLOW_AGENT_MAP.md` for:
- **Section 1**: Full workflow-agent matrix
- **Section 2**: Archetype workflow sets (Router/Orchestrator, Implementer, Reviewer, Documenter, Researcher, Domain)

After creating a workflow, you MUST add it to both the matrix AND update affected agents' `## Related Workflows` sections.

## Workflow Creation Process
```

**Success Criteria**: `workflow-creator/SKILL.md` mandates updating `@WORKFLOW_AGENT_MAP.md` and affected agent files on every workflow creation.

---

### Phase 4: Update skill-creator SKILL.md

**File**: `.claude/skills/skill-creator/SKILL.md`

#### Task 4.1: Update Step 7 (Assign to Relevant Agents) with 3-tier note

**Location**: Step 7 Agent Assignment section (~line 774-812).

**Old text to find**:
```
3. **For each matching agent:**
   a. Read agent file
   b. Check if agent has YAML frontmatter with `skills:` array
   c. Add skill to `skills:` array if not present
   d. Update agent file using Edit tool
```

**New text to replace with**:
```
3. **For each matching agent:**
   a. Read agent file
   b. Check if agent has YAML frontmatter with `skills:` array
   c. Add skill to `skills:` array if not present
   d. Determine tier placement (primary/supporting/on-demand based on relevance)
   e. Update agent file using Edit tool

**Tier Placement Guide:**
- **Primary**: Skill is core to the agent's domain (always loaded in Step 0)
- **Supporting**: Skill is frequently useful but not always needed
- **On-demand**: Skill is only loaded for specific task types
```

#### Task 4.2: Add workspace-conventions reference

**Location**: In the "File Placement & Standards" section (~line 597-652).

**Old text to find**:
```
### Mandatory References

- **File Placement**: See `.claude/docs/FILE_PLACEMENT_RULES.md`
- **Developer Workflow**: See `.claude/docs/DEVELOPER_WORKFLOW.md`
- **Artifact Naming**: See `.claude/docs/ARTIFACT_NAMING.md`
```

**New text to replace with**:
```
### Mandatory References

- **File Placement**: See `.claude/docs/FILE_PLACEMENT_RULES.md`
- **Developer Workflow**: See `.claude/docs/DEVELOPER_WORKFLOW.md`
- **Artifact Naming**: See `.claude/docs/ARTIFACT_NAMING.md`
- **Workspace Conventions**: See `.claude/rules/workspace-conventions.md` (output placement, naming, provenance)
- **Skill Catalog**: See `@.claude/docs/@SKILL_CATALOG_TABLE.md` for proper categorization
```

**Success Criteria**: `skill-creator/SKILL.md` now references workspace-conventions and guides 3-tier skill placement.

---

### Phase 5: Update template-creator SKILL.md

**File**: `.claude/skills/template-creator/SKILL.md`

#### Task 5.1: Add Enforcement Hooks and Related Workflows placeholder guidance for agent templates

**Location**: In the Template Types section or Step 3, add guidance for agent templates.

**Old text to find**:
```
| Agent    | `.claude/templates/agents/`    | Agent definition templates       | name, description, tools, skills, model |
```

**New text to replace with**:
```
| Agent    | `.claude/templates/agents/`    | Agent definition templates       | name, description, tools, skills, model, enforcement_hooks, related_workflows |
```

#### Task 5.2: Add workspace-conventions reference

**Location**: File Placement & Standards section (~line 789-810).

**Old text to find** (in template-creator):
```
### Mandatory References
- **File Placement**: See `.claude/docs/FILE_PLACEMENT_RULES.md`
- **Developer Workflow**: See `.claude/docs/DEVELOPER_WORKFLOW.md`
- **Artifact Naming**: See `.claude/docs/ARTIFACT_NAMING.md`
```

**New text to replace with**:
```
### Mandatory References
- **File Placement**: See `.claude/docs/FILE_PLACEMENT_RULES.md`
- **Developer Workflow**: See `.claude/docs/DEVELOPER_WORKFLOW.md`
- **Artifact Naming**: See `.claude/docs/ARTIFACT_NAMING.md`
- **Workspace Conventions**: See `.claude/rules/workspace-conventions.md` (output placement, naming, provenance)
```

#### Task 5.3: Note that agent templates must include alignment sections

**Location**: After Iron Law 7, add a new iron law or modify the existing structure note.

**Old text to find**:
```
7. NO TEMPLATE WITHOUT VERIFICATION COMMANDS
   - Include commands to validate created artifacts
   - Users can verify their work is correct
```

**New text to replace with**:
```
7. NO TEMPLATE WITHOUT VERIFICATION COMMANDS
   - Include commands to validate created artifacts
   - Users can verify their work is correct

8. NO AGENT TEMPLATE WITHOUT ALIGNMENT SECTIONS
   - Agent templates MUST include {{ENFORCEMENT_HOOKS}} placeholder section
   - Agent templates MUST include {{RELATED_WORKFLOWS}} placeholder section
   - Agent templates MUST include Output Standards block referencing workspace-conventions
   - Reference: @HOOK_AGENT_MAP.md and @WORKFLOW_AGENT_MAP.md for archetype sets
```

**Success Criteria**: `template-creator/SKILL.md` requires alignment section placeholders in agent templates.

---

### Phase 6: Update schema-creator SKILL.md (MINIMAL)

**File**: `.claude/skills/schema-creator/SKILL.md`

#### Task 6.1: Add workspace-conventions reference

**Location**: File Placement & Standards section (~line 881-906).

**Old text to find** (in schema-creator):
```
### Mandatory References

- **File Placement**: See `.claude/docs/FILE_PLACEMENT_RULES.md`
- **Developer Workflow**: See `.claude/docs/DEVELOPER_WORKFLOW.md`
- **Artifact Naming**: See `.claude/docs/ARTIFACT_NAMING.md`
```

**New text to replace with**:
```
### Mandatory References

- **File Placement**: See `.claude/docs/FILE_PLACEMENT_RULES.md`
- **Developer Workflow**: See `.claude/docs/DEVELOPER_WORKFLOW.md`
- **Artifact Naming**: See `.claude/docs/ARTIFACT_NAMING.md`
- **Workspace Conventions**: See `.claude/rules/workspace-conventions.md` (output placement, naming, provenance)
```

**Success Criteria**: `schema-creator/SKILL.md` references workspace-conventions.

---

## Updater Skills Assessment

### Status: No SKILL.md files needed

All 6 updater workflows exist as `.claude/workflows/updaters/<type>-updater-workflow.yaml` files. These are YAML workflow definitions designed for the `WorkflowEngine` at `.claude/lib/workflow/workflow-engine.cjs`.

The creator skills already reference updaters via `Skill({ skill: '<type>-updater' })` in their Step 0 existence checks. This is the correct architecture -- updaters are workflow-based, not skill-based.

**No new updater SKILL.md files need to be created.**

However, the updater YAML workflows MAY need minor updates to:
- Include `@HOOK_AGENT_MAP.md` and `@WORKFLOW_AGENT_MAP.md` in their `registration_targets`
- Reference workspace-conventions in their validation steps

This is LOW priority and can be done in a follow-up task since the updaters are already functional.

---

## Risks

| Risk | Impact | Mitigation | Rollback |
|------|--------|------------|----------|
| Edit operations fail due to non-unique text | Medium | Use longer context strings; verify file positions first | Re-read file, find correct edit target |
| Agent template too verbose | Low | Keep placeholder comments concise; use HTML comments | Trim if feedback received |
| Updater YAML changes break workflow engine | Medium | Skip updater YAML changes for now (marked as follow-up) | Restore from git |

## Timeline Summary

| Phase | Tasks | Est. Time | Parallel? |
|-------|-------|-----------|-----------|
| 1: agent-creator | 6 tasks | 45 min | No (sequential edits) |
| 2: hook-creator | 3 tasks | 15 min | Yes with Phase 3 |
| 3: workflow-creator | 3 tasks | 15 min | Yes with Phase 2 |
| 4: skill-creator | 2 tasks | 10 min | Yes with Phase 5/6 |
| 5: template-creator | 3 tasks | 10 min | Yes with Phase 4/6 |
| 6: schema-creator | 1 task | 5 min | Yes with Phase 4/5 |
| **Total** | **18 tasks** | **~100 min** | |

## Commit Checkpoint

Since this involves 6 files modified, no commit checkpoint is needed (under 10-file threshold). However, a single commit after all changes is recommended with message:

```
feat(creators): add alignment integration to all 6 creator skills

- agent-creator: generates Enforcement Hooks + Related Workflows sections
- hook-creator: mandates @HOOK_AGENT_MAP.md updates on creation
- workflow-creator: mandates @WORKFLOW_AGENT_MAP.md updates on creation
- skill-creator: adds 3-tier placement guide and workspace-conventions ref
- template-creator: requires alignment placeholders in agent templates
- schema-creator: adds workspace-conventions reference
```

## Phase FINAL: Evolution & Reflection Check

**Purpose**: Quality assessment and learning extraction

**Tasks**:

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Success Criteria**:

- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected
