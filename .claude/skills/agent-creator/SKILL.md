---
name: agent-creator
description: Creates specialized AI agents on-demand when no existing agent matches a request. Use when the Router cannot find a suitable agent for a task. Enables self-evolution by generating persistent agents.
version: 2.1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Glob, Grep, WebSearch, WebFetch, Bash, Task]
# Phase 1 Integration: All tools validated against .claude/config/tool-manifest.json
# If a tool becomes unavailable, spawned agents will be notified at spawn time via
# pre-spawn-tool-validator.cjs hook (Phase 1B)
# Single source of truth: .claude/config/tool-manifest.json
best_practices:
  - Verify no existing agent matches first
  - Research domain before creating agent
  - Assign relevant skills to new agents
error_handling: graceful
streaming: supported
output_location: .claude/agents/
---

**Mode: Cognitive/Prompt-Driven** — No standalone utility script; use via agent context.

# Agent Creator Skill

Creates specialized AI agents on-demand for capabilities that don't have existing agents.

## ROUTER UPDATE REQUIRED (CRITICAL - DO NOT SKIP)

**After creating ANY agent, you MUST update CLAUDE.md Section 3 "AGENT ROUTING TABLE":**

```markdown
| Request Type | agent-name | `.claude/agents/<category>/<name>.md` |
```

**Verification:**

```bash
grep "<agent-name>" .claude/CLAUDE.md || echo "ERROR: CLAUDE.md ROUTING TABLE NOT UPDATED!"
```

**WHY**: Agents not in the routing table will NEVER be spawned by the Router.

---

## When This Skill Is Triggered

1. **Router finds no matching agent** for a user request
2. **User explicitly requests** creating a new agent
3. **Specialized expertise needed** that existing agents don't cover

## Quick Reference

| Operation             | Method                                         |
| --------------------- | ---------------------------------------------- |
| Check existing agents | `Glob: .claude/agents/**/*.md`                 |
| Research domain       | `WebSearch: "<topic> best practices 2026"`     |
| Find relevant skills  | `Glob: .claude/skills/*/SKILL.md`              |
| Create agent          | Write to `.claude/agents/<category>/<name>.md` |
| Spawn agent           | `Task` tool with new `subagent_type`           |
| Run in terminal       | `claude -p "prompt" --allowedTools "..."`      |

## Agent Creation Process

### Step 0: Existence Check and Updater Delegation (MANDATORY - FIRST STEP)

**BEFORE creating any agent file, check if it already exists:**

1. **Check if agent already exists:**

   ```bash
   test -f .claude/agents/<category>/<agent-name>.md && echo "EXISTS" || echo "NEW"
   ```

2. **If agent EXISTS:**
   - **DO NOT proceed with creation**
   - **Invoke agent-updater workflow instead:**

     ```javascript
     // Delegate to updater
     Skill({
       skill: 'agent-updater',
       args: {
         name: '<agent-name>',
         changes: '<description of requested changes>',
         justification: 'Update requested via agent-creator',
       },
     });
     ```

   - **Return updater result to user**
   - **STOP HERE** - Do not continue with creation steps

3. **If agent is NEW:**
   - Continue to Step 1 below (verification and creation steps)

**Why this matters:** The agent-updater workflow safely handles updates with backup, protected section validation, registry synchronization, and version tracking.

### Step 1: Verify No Existing Agent

```bash
# Search for relevant agents
Glob: .claude/agents/**/*.md
Grep: "<topic>" in .claude/agents/
```

If a suitable agent exists, use it instead. Check:

- Core agents: `.claude/agents/core/`
- Specialized agents: `.claude/agents/specialized/`
- Orchestrators: `.claude/agents/orchestrators/`

### Step 2: Research the Domain

**Use web search to gather current information:**

```
WebSearch: "<topic> expert techniques best practices 2026"
WebSearch: "<topic> tools frameworks methodologies"
```

**Research goals:**

- Current best practices and industry standards
- Popular tools, frameworks, and methodologies
- Expert techniques and evaluation criteria
- Common workflows and deliverables

### Step 2.5: Research Keywords (MANDATORY - DO NOT SKIP)

Before designing the agent, you MUST research keywords that users will use to invoke this agent.

#### Required Actions

1. **Execute Exa Searches** (minimum 3 queries):

   ```javascript
   // Query 1: Role-specific tasks
   mcp__Exa__web_search_exa({ query: '[agent-role] common tasks responsibilities' });

   // Query 2: Industry terminology
   mcp__Exa__web_search_exa({ query: '[agent-role] terminology keywords phrases' });

   // Query 3: Problem types
   mcp__Exa__web_search_exa({ query: '[agent-role] problem types use cases' });
   ```

2. **Document Keywords** (save to research report):
   - High-Confidence Keywords: Unique to this agent
   - Medium-Confidence Keywords: May overlap with other agents
   - Action Verbs: Common verbs for this role
   - Problem Indicators: Phrases users say when needing this agent

3. **Save Research Report**:
   Save to: `.claude/context/artifacts/research-reports/agent-keywords-[agent-name].md`

#### Validation Gate

- [ ] Minimum 3 Exa searches executed
- [ ] Keywords documented with confidence levels
- [ ] Research report saved

**BLOCKING**: Agent creation CANNOT proceed without completing keyword research.

### Step 3: Find Relevant Skills to Assign (CRITICAL)

**Every agent MUST have relevant skills assigned and include skill loading in their workflow.**

**Search existing skills the agent should use:**

```bash
Glob: .claude/skills/*/SKILL.md
Grep: "<related-term>" in .claude/skills/
```

**Skill categories available:**
| Domain | Skills |
|--------|--------|
| Documentation | doc-generator, diagram-generator |
| Testing | test-generator, tdd |
| DevOps | docker-compose, kubernetes-flux, terraform-infra |
| Cloud | aws-cloud-ops, gcloud-cli |
| Code Quality | code-analyzer, code-style-validator |
| Project Management | linear-pm, jira-pm, github-ops |
| Debugging | debugging, smart-debug |
| Communication | slack-notifications |
| Data | text-to-sql, repo-rag |
| Task Management | task-management-protocol |

**Skill Discovery Process:**

1. **Scan all skills**: `Glob: .claude/skills/*/SKILL.md`
2. **Read each SKILL.md** to understand what it does
3. **Match skills to agent domain**:
   - If agent does code → consider: tdd, debugging, git-expert, code-analyzer
   - If agent does planning → consider: plan-generator, sequential-thinking, diagram-generator
   - If agent does security → consider: security-related skills
   - If agent does documentation → consider: doc-generator, diagram-generator
   - **ALL agents** should include: task-management-protocol (for task tracking)
4. **Include ALL relevant skills** in the agent's frontmatter using 3-tier mapping:
   - **Primary skills**: Core to this agent's domain (always loaded)
   - **Supporting skills**: Used frequently but not always
   - **On-demand skills**: Loaded only when specific task requires it
   - Reference: Task #39 skill-agent mapping for existing tier assignments

### Step 4: Determine Agent Configuration

| Agent Type | Use When                       | Model  | Temperature |
| ---------- | ------------------------------ | ------ | ----------- |
| Worker     | Executes tasks directly        | sonnet | 0.3         |
| Analyst    | Research, review, evaluation   | sonnet | 0.4         |
| Specialist | Deep domain expertise          | opus   | 0.4         |
| Advisor    | Strategic guidance, consulting | opus   | 0.5         |

| Category      | Directory                       | Examples                      |
| ------------- | ------------------------------- | ----------------------------- |
| Core          | `.claude/agents/core/`          | developer, planner, architect |
| Specialized   | `.claude/agents/specialized/`   | security-architect, devops    |
| Domain Expert | `.claude/agents/domain/`        | ux-reviewer, data-scientist   |
| Orchestrator  | `.claude/agents/orchestrators/` | master-orchestrator           |

### Step 5: Generate Agent Definition (WITH SKILL LOADING AND LAZY-LOAD RULE)

**CRITICAL**: The generated agent MUST include:

1. Skills listed in frontmatter `skills:` array
2. "Step 0: Load Skills" in the Workflow section with ACTUAL skill paths
3. **LAZY-LOAD CONTEXT RULE** (see below)

#### LAZY-LOAD CONTEXT RULE (MANDATORY)

When referencing `.claude/` file paths in the agent, follow these rules:

| Location                   | Pattern        | Example                                   | Rule            |
| -------------------------- | -------------- | ----------------------------------------- | --------------- |
| **Markdown documentation** | `@.claude/...` | Read: `@.claude/skills/tdd/SKILL.md`      | ✅ Add @ prefix |
| **context_files array**    | `@.claude/...` | `- @.claude/context/memory/learnings.md`  | ✅ Add @ prefix |
| **Bash commands**          | `.claude/...`  | `cat .claude/context/memory/learnings.md` | ❌ NO @ prefix  |
| **Bash examples**          | `.claude/...`  | `Bash("node .claude/tools/validate.mjs")` | ❌ NO @ prefix  |

**Why this matters:**

- `@.claude/` paths enable lazy-loading in Claude Code context system
- Lazy-loaded references don't count toward token limits
- Reduces agent spawn prompt size (faster initialization)
- Makes intent clear: @ signals "reference, not inline content"

**Examples in agent documentation:**

```markdown
✅ CORRECT: Read: @.claude/skills/tdd/SKILL.md
❌ WRONG: Read: .claude/skills/tdd/SKILL.md

✅ CORRECT: Location: @.claude/context/memory/decisions.md
❌ WRONG: Location: .claude/context/memory/decisions.md

✅ CORRECT: Bash("grep '<pattern>' .claude/CLAUDE.md")
❌ WRONG: Bash("grep '<pattern>' @.claude/CLAUDE.md")
```

Write to `.claude/agents/<category>/<agent-name>.md`:

````yaml
---
name: <agent-name>
description: <One sentence: what it does AND when to use it. Be specific about trigger conditions.>
tools: [Read, Write, Edit, Grep, Glob, Bash, WebSearch, WebFetch, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill]
model: sonnet
temperature: 0.4
context_strategy: lazy_load  # REQUIRED: minimal, lazy_load, or full
priority: medium
skills:
  - <skill-1>
  - <skill-2>
  - task-management-protocol
context_files:
  - @.claude/context/memory/learnings.md
---

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
**Identity**: <Role title>
**Style**: <Working style adjectives>
**Approach**: <Methodology>
**Values**: <Core principles>

## Responsibilities
1. **<Area 1>**: Description
2. **<Area 2>**: Description
3. **<Area 3>**: Description

## Capabilities
Based on current best practices:
- <Capability from web research>
- <Capability from web research>
- <Capability from web research>

## Tools & Frameworks
- <Tool/Framework from research>
- <Tool/Framework from research>
- <Pattern/Practice from research>

## Workflow

### Step 0: Load Skills (FIRST)

Invoke your assigned skills using the Skill tool:

```javascript
Skill({ skill: 'doc-generator' });
Skill({ skill: 'diagram-generator' });
````

> **CRITICAL**: Do NOT just read SKILL.md files. Use the `Skill()` tool to invoke skill workflows.
> Reading a skill file does not apply it. Invoking with `Skill()` loads AND applies the workflow.
>
> **NOTE FOR AGENT-CREATOR**: Replace these skill names with the ACTUAL skills
> you assigned in the frontmatter. Every skill in `skills:` must have
> its invocation listed here.

### Step 1-5: Execute Task

1. **Analyze**: Understand the request and context
2. **Research**: Gather relevant information
3. **Execute**: Perform the task using available tools AND skill workflows
4. **Deliver**: Produce deliverables in appropriate format
5. **Document**: Record findings to memory

> **Skill Protocol**: Your skills define specialized workflows.
> Apply them throughout your task execution.

## Response Approach

When executing tasks, follow this 8-step approach:

1. **Acknowledge**: Confirm understanding of the task
2. **Discover**: Read memory files, check task list
3. **Analyze**: Understand requirements and constraints
4. **Plan**: Determine approach and tools needed
5. **Execute**: Perform the work using tools and skills
6. **Verify**: Check output quality and completeness
7. **Document**: Update memory with learnings
8. **Report**: Summarize what was done and results

## Behavioral Traits

- <Trait 1: Domain-specific behavior>
- <Trait 2: Quality focus>
- <Trait 3: Communication style>
- <Trait 4: Error handling approach>
- <Trait 5: Testing philosophy>
- <Trait 6: Documentation practices>
- <Trait 7: Collaboration style>
- <Trait 8: Performance consideration>
- <Trait 9: Security awareness>
- <Trait 10: Continuous improvement>

> **NOTE FOR AGENT-CREATOR**: Replace these with ACTUAL behavioral traits
> specific to the agent's domain. Reference python-pro.md for examples.
> Minimum 10 traits required.

## Example Interactions

| User Request          | Agent Action         |
| --------------------- | -------------------- |
| "<example request 1>" | <how agent responds> |
| "<example request 2>" | <how agent responds> |
| "<example request 3>" | <how agent responds> |
| "<example request 4>" | <how agent responds> |
| "<example request 5>" | <how agent responds> |
| "<example request 6>" | <how agent responds> |
| "<example request 7>" | <how agent responds> |
| "<example request 8>" | <how agent responds> |

> **NOTE FOR AGENT-CREATOR**: Replace these with ACTUAL example interactions
> specific to the agent's domain. Reference python-pro.md for examples.
> Minimum 8 examples required.

## Output Locations

> **LAZY-LOAD RULE**: In agent documentation, reference these paths with `@` prefix for lazy-loading.

- Deliverables: `@.claude/context/artifacts/`
- Reports: `@.claude/context/reports/`
- Temporary files: `@.claude/context/tmp/`
- Memory: `@.claude/context/memory/`

(No `@` prefix in bash commands: `cat .claude/context/artifacts/file.md`)

## Task Progress Protocol (MANDATORY)

**When assigned a task, use TaskUpdate to track progress:**

```javascript
// 1. Check available tasks
TaskList();

// 2. Claim your task (mark as in_progress)
TaskUpdate({
  taskId: '<your-task-id>',
  status: 'in_progress',
});

// 3. Do the work...

// 4. Mark complete when done
TaskUpdate({
  taskId: '<your-task-id>',
  status: 'completed',
  metadata: {
    summary: 'Brief description of what was done',
    filesModified: ['list', 'of', 'files'],
  },
});

// 5. Check for next available task
TaskList();
```

**The Three Iron Laws of Task Tracking:**

1. **LAW 1**: ALWAYS call TaskUpdate({ status: "in_progress" }) when starting
2. **LAW 2**: ALWAYS call TaskUpdate({ status: "completed", metadata: {...} }) when done
3. **LAW 3**: ALWAYS call TaskList() after completion to find next work

**Why This Matters:**

- Progress is visible to Router and other agents
- Work survives context resets
- No duplicate work (tasks have owners)
- Dependencies are respected (blocked tasks can't start)

## Memory Protocol (MANDATORY)

**Before starting any task:**

```bash
cat .claude/context/memory/learnings.md
```

**After completing work, record findings:**

- New pattern/solution -> Append to `.claude/context/memory/learnings.md`
- Roadblock/issue -> Append to `.claude/context/memory/issues.md`
- Decision made -> Append to `.claude/context/memory/decisions.md`

**During long tasks:** Use `.claude/context/memory/active_context.md` as scratchpad.

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.

```

## Architecture Compliance

### File Placement (ADR-076)
- Agents: `.claude/agents/{category}/` (core, domain, specialized, orchestrators)
- Skills: `.claude/skills/{name}/SKILL.md`
- Hooks: `.claude/hooks/{category}/`
- Tests: `tests/` (NOT in .claude/)
- Workflows: `.claude/workflows/{category}/`
- Templates: `.claude/templates/`
- Schemas: `.claude/schemas/`

### Documentation References (CLAUDE.md v2.2.1)
- Reference files use @notation: @AGENT_ROUTING_TABLE.md, @TOOL_REFERENCE.md, etc.
- Located in: `.claude/docs/@*.md`
- See: CLAUDE.md Section 3 (AGENT ROUTING TABLE reference)

### Shell Security (ADR-077)
- Background Bash tasks require: `cd "$PROJECT_ROOT" || exit 1`
- Environment variables control validators (block/warn/off mode)
- See: .claude/docs/SHELL-SECURITY-GUIDE.md
- Apply to: spawn templates, background tasks, agent documentation

### Recent ADRs
- ADR-075: Router Config-Aware Model Selection
- ADR-076: File Placement Architecture Redesign
- ADR-077: Shell Command Security Architecture

---

### Reference Agent (MANDATORY COMPARISON)

**Use `.claude/agents/domain/python-pro.md` as the canonical reference agent.**

Before finalizing any agent, compare against python-pro.md structure:

```

[ ] Has all sections python-pro has (Core Persona, Enforcement Hooks, Related Workflows, Capabilities, Workflow, Response Approach, Behavioral Traits, Example Interactions, Skill Invocation Protocol, Output Standards, Memory Protocol)
[ ] Section order matches python-pro
[ ] Level of detail is comparable
[ ] Behavioral Traits has 10+ items (domain-specific)
[ ] Example Interactions has 8+ items (domain-specific)
[ ] Response Approach has 8 numbered steps
[ ] Skill Invocation Protocol includes Automatic and Contextual skills tables

```

**Why python-pro is the reference:**
- Most complete implementation of all required sections
- Demonstrates proper skill invocation protocol
- Shows appropriate level of detail for capabilities
- Has proper Response Approach structure

**BLOCKING**: Do not proceed if agent is missing sections that python-pro has.

### Step 6: Validate Required Fields (BLOCKING)

**Before writing agent file, verify ALL required fields are present.**

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `name` | YES | - | lowercase-with-hyphens |
| `description` | YES | - | Single line, include trigger conditions |
| `model` | YES | sonnet | sonnet, opus, or haiku |
| `context_strategy` | YES | lazy_load | minimal, lazy_load, or full |
| `tools` | YES | [] | At least [Read] required |
| `skills` | YES | [] | List relevant skills |
| `context_files` | YES | [learnings.md] | Memory files to load |
| `temperature` | NO | 0.4 | 0.0-1.0 |
| `priority` | NO | medium | low, medium, high |

**BLOCKING**: Do not write agent file if any required field is missing.

**Validation checklist before writing:**
```

[ ] name: defined and kebab-case
[ ] description: single line, describes trigger conditions
[ ] model: one of sonnet/opus/haiku
[ ] context_strategy: one of minimal/lazy_load/full
[ ] tools: array with at least Read
[ ] skills: array (can be empty but must exist)
[ ] context_files: array with at least learnings.md
[ ] Response Approach section present with 8 steps
[ ] Behavioral Traits section present with 10+ traits
[ ] Example Interactions section present with 8+ examples

````

**Model Validation (CRITICAL):**
- model field MUST be base name only: `haiku`, `sonnet`, or `opus`
- DO NOT use dated versions like `claude-opus-4-5-20251101`
- DO NOT use full version strings like `claude-3-sonnet-20240229`
- The orchestration layer handles model resolution automatically

**Extended Thinking (NOT STANDARD):**
- `extended_thinking: true` is NOT documented in CLAUDE.md
- DO NOT add this field unless explicitly documented and requested
- If used, must have documented justification in the agent definition
- This field may cause unexpected behavior in agent spawning

**Tools Array Validation:**
- Standard tools: Read, Write, Edit, Bash, Grep, Glob, WebSearch, WebFetch, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill
- DO NOT add MCP tools (mcp__*) unless whitelisted in routing-table.cjs
- MCP tools (mcp__Exa__*, mcp__GitHub__*, etc.) cause router enforcement failures
- If MCP integration is needed, document it explicitly and verify hook compatibility

After writing, validate file was saved:

1. **YAML frontmatter is valid** - No syntax errors
2. **Required fields present** - All fields from checklist above
3. **Skills exist** - All referenced skills are in `.claude/skills/`
4. **File saved correctly** - Glob to verify file exists

### Step 7: Update CLAUDE.md Routing Table (MANDATORY - BLOCKING)

**This step is AUTOMATIC and BLOCKING. Do not skip.**

After agent file is written, you MUST update the CLAUDE.md routing table:

1. **Parse CLAUDE.md Section 3** ("AGENT ROUTING TABLE")
2. **Generate routing entry**:
   ```markdown
   | {request_type} | `{agent_name}` | `.claude/agents/{category}/{agent_name}.md` |
````

3. **Find correct insertion point** (alphabetical within category, or at end of relevant section)
4. **Insert using Edit tool**
5. **Verify with**:
   ```bash
   grep "{agent-name}" .claude/CLAUDE.md || echo "ERROR: CLAUDE.md ROUTING TABLE NOT UPDATED!"
   ```

**BLOCKING**: If routing table update fails, agent creation is INCOMPLETE. Do NOT proceed to spawning the agent.

**Why this is mandatory**: Agents not in the routing table will NEVER be spawned by the Router. An agent without a routing entry is effectively invisible to the system.

### Step 7.5: Update Routing Table (MANDATORY - BLOCKING)

**This step is MANDATORY and BLOCKING. Without it, the Router cannot discover the agent.**

After updating CLAUDE.md, you MUST register the agent in `routing-table.cjs`:

#### Required Updates

1. **Add to `INTENT_KEYWORDS`** with keywords from Step 2.5:

   ```javascript
   // In routing-table.cjs INTENT_KEYWORDS section
   '<agent-name>': [
     // High-confidence keywords (unique to this agent)
     'keyword1', 'keyword2',
     // Action verbs
     'review', 'analyze',
     // Problem indicators
     'need help with X'
   ],
   ```

2. **Add to `INTENT_TO_AGENT`** (map intent key → agent name):

   ```javascript
   // In routing-table.cjs INTENT_TO_AGENT section
   '<intent-key>': '<agent-name>',
   ```

3. **Add a `DISAMBIGUATION_RULES` entry if needed** (for overlapping keywords):
   ```javascript
   // In routing-table.cjs DISAMBIGUATION_RULES section
   '<keyword>': [
     {
       condition: ['keyword1', 'keyword2'],
       prefer: '<agent-name>',
       deprioritize: '<other-agent>',
     },
   ],
   ```

#### Verification

```bash
grep "<agent-name>" .claude/lib/routing/routing-table.cjs || echo "ERROR: Agent not in routing-table.cjs - AGENT CREATION INCOMPLETE"
```

**BLOCKING**: If routing-table update fails, agent creation is INCOMPLETE. The agent will never be discovered by the Router.

**Why this is mandatory**: The routing table drives router-enforcer scoring. Without keyword registration, the Router's scoring algorithm cannot consider this agent for any request.

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

### Step 8: Create Workflow & Update Memory

The CLI tool automatically:

1. **Creates a workflow example** in `.claude/workflows/<agent-name>-workflow.md`
2. **Updates memory** in `.claude/context/memory/learnings.md` with routing hints

```bash
# Create agent with full self-evolution
node .claude/tools/agent-creator/create-agent.mjs \
  --name "ux-reviewer" \
  --description "Reviews mobile app UX and accessibility" \
  --original-request "Review the UX of my iOS app"
```

This outputs a spawn command for the Task tool to immediately execute the original request.

### Step 9: Execute the Agent

**Option A: Use output spawn command (recommended for self-evolution)**
The CLI outputs a Task spawn command when `--original-request` is provided:

```javascript
Task({
  subagent_type: 'general-purpose',
  description: 'ux-reviewer executing original task',
  prompt: 'You are the UX-REVIEWER agent...',
});
```

**Option B: Spawn via Task tool manually**

```javascript
Task({
  subagent_type: 'general-purpose',
  description: 'Execute task with new agent',
  prompt: 'You are <AGENT>. Read .claude/agents/domain/<name>.md and complete: <task>',
});
```

**Option C: Run in separate terminal (new session)**

```bash
node .claude/tools/agent-creator/spawn-agent.mjs --agent "<name>" --prompt "<task>"
```

## Agent Naming Conventions

- **Format**: `lowercase-with-hyphens`
- **Pattern**: `<domain>-<role>` (e.g., `ux-reviewer`, `data-analyst`)
- **Avoid**: Generic names like `helper`, `assistant`, `agent`

## Examples

### Example 1: UX Reviewer for Mobile Apps (Complete Flow)

**User**: "I need a UX review of an Apple mobile app"

1. **Check**: No `ux-reviewer*.md` or `mobile*.md` agent exists
2. **Research**:
   - `WebSearch: "mobile UX review best practices 2026 iOS"`
   - `WebSearch: "Apple Human Interface Guidelines evaluation criteria"`
3. **Find skills**: Scan `.claude/skills/*/SKILL.md`:
   - `diagram-generator` for wireframes
   - `doc-generator` for reports
   - `task-management-protocol` for task tracking
4. **Create** `.claude/agents/domain/mobile-ux-reviewer.md`:

````yaml
---
name: mobile-ux-reviewer
description: Reviews mobile app UX against Apple HIG and accessibility standards. Use for UX audits and accessibility compliance checks.
tools: [Read, WebSearch, WebFetch, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill]
model: sonnet
temperature: 0.4
context_strategy: lazy_load
skills:
  - diagram-generator
  - doc-generator
  - task-management-protocol
context_files:
  - .claude/context/memory/learnings.md
---

# Mobile UX Reviewer

## Core Persona
**Identity**: UX/Accessibility Specialist
...

## Workflow

### Step 0: Load Skills (FIRST)

Invoke your assigned skills using the Skill tool:

```javascript
Skill({ skill: 'diagram-generator' });
Skill({ skill: 'doc-generator' });
````

> **CRITICAL**: Use `Skill()` tool, not `Read()`. Skill() loads AND applies the workflow.

### Step 1-5: Execute Task

...

````

5. **Execute**: Spawn via Task tool

### Example 2: Data Scientist Agent

**User**: "Analyze this dataset and build a prediction model"

1. **Check**: No `data-scientist*.md` agent exists
2. **Research**:
   - `WebSearch: "data science workflow best practices 2026"`
   - `WebSearch: "machine learning model evaluation techniques"`
3. **Find skills**: `text-to-sql`, `diagram-generator`, `doc-generator`, `task-management-protocol`
4. **Create**: `.claude/agents/domain/data-scientist.md`
5. **Execute**: Task tool with new agent

### Example 3: API Integration Specialist

**User**: "Help me integrate with the Stripe API"

1. **Check**: No `stripe*.md` or `api-integration*.md` agent exists
2. **Research**:
   - `WebSearch: "Stripe API integration best practices 2026"`
   - `WebFetch: "https://stripe.com/docs"` (extract key patterns)
3. **Find skills**: `github-ops`, `test-generator`, `doc-generator`, `task-management-protocol`
4. **Create**: `.claude/agents/domain/api-integrator.md`
5. **Execute**: Spawn agent to complete integration

## Integration with Router

The Router should output this when no agent matches:

```json
{
  "intent": "specialized_task",
  "complexity": "medium",
  "target_agent": "agent-creator",
  "reasoning": "No existing agent matches UX review for mobile apps. Creating specialized agent.",
  "original_request": "<user's original request>"
}
````

## Persistence

- Agents saved to `.claude/agents/` persist across sessions
- Next session automatically discovers new agents via `/agents` command
- Skills assigned in frontmatter are available to the agent

## File Placement & Standards

### Output Location Rules

This skill outputs to: `.claude/agents/<category>/`

Categories:

- `core/` - fundamental agents (developer, planner, architect, etc.)
- `domain/` - language/framework specialists (python-pro, etc.)
- `specialized/` - task-specific agents (security-architect, etc.)
- `orchestrators/` - multi-agent coordinators

### Mandatory References

- **File Placement**: See `@.claude/docs/FILE_PLACEMENT_RULES.md`
- **Developer Workflow**: See `@.claude/docs/DEVELOPER_WORKFLOW.md`
- **Artifact Naming**: See `@.claude/docs/ARTIFACT_NAMING.md`
- **Lazy-Load Rule**: All new agents should use `@.claude/` prefix in documentation (see LAZY-LOAD CONTEXT RULE above)

### Enforcement

File placement is enforced by `file-placement-guard.cjs` hook.
Invalid placements will be blocked in production mode.

---

## Memory Protocol (MANDATORY)

**Before creating an agent:**

```bash
cat .claude/context/memory/learnings.md
```

Check for patterns in previous agent creations.

**After creating an agent:**

- Record the new agent pattern to `.claude/context/memory/learnings.md`
- If the domain is new, add to `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.

## Iron Laws of Agent Creation

These rules are INVIOLABLE. Breaking them causes silent failures.

```
1. NO AGENT WITHOUT TOOLS FIELD
   - Every agent MUST have tools: [Read, ...] in frontmatter
   - Agents without tools cannot perform actions

2. NO AGENT WITHOUT SKILLS FIELD
   - Every agent SHOULD have skills: [...] in frontmatter
   - Skills provide specialized workflows

3. NO MULTI-LINE YAML DESCRIPTIONS
   - description: | causes parsing failures
   - Always use single-line description

4. NO SKILLS THAT DON'T EXIST
   - Every skill in skills: array must exist at .claude/skills/<skill>/SKILL.md
   - Run: node .claude/tools/validate-agents.mjs to catch broken pointers

5. NO AGENT WITHOUT MEMORY PROTOCOL
   - Every agent MUST have Memory Protocol section in body
   - Without it, learnings are lost

6. NO AGENT WITHOUT ROUTING TABLE ENTRY
   - After creating agent, add to CLAUDE.md routing table
   - Unrouted agents are never spawned

7. NO CREATION WITHOUT SYSTEM IMPACT ANALYSIS
   - Update CLAUDE.md routing table (MANDATORY)
   - Update router.md agent tables (MANDATORY)
   - Populate Enforcement Hooks section from @HOOK_AGENT_MAP.md (MANDATORY)
   - Populate Related Workflows section from @WORKFLOW_AGENT_MAP.md (MANDATORY)
   - Check if new workflows are needed
   - Check if related agents need skill updates
   - Document all system changes made

8. NO AGENT WITHOUT TASK TRACKING
   - Every agent MUST include Task Progress Protocol section
   - Every agent MUST have task tools in tools: array
   - Without task tracking, work is invisible to Router

9. NO AGENT WITHOUT ROUTER KEYWORDS
   - Every agent MUST have researched keywords (Step 2.5)
   - Keywords must be documented in research report
  - Agent must be registered in routing-table.cjs with keywords
   - Without router keywords, agent will never be discovered by Router

10. NO AGENT WITHOUT RESPONSE APPROACH
    - Every agent MUST have Response Approach section with 8 numbered steps
    - Every agent MUST have Behavioral Traits section with 10+ domain-specific traits
    - Every agent MUST have Example Interactions section with 8+ examples
    - Without these sections, execution strategy is undefined
    - Reference python-pro.md for canonical structure
```

## System Impact Analysis (MANDATORY)

**After creating ANY agent, you MUST analyze and update system-wide impacts.**

### Impact Checklist

Run this analysis after every agent creation:

```
[AGENT-CREATOR] System Impact Analysis for: <agent-name>

1. ROUTING TABLE UPDATE (MANDATORY)
   - Add entry to CLAUDE.md routing table
   - Format: | Request Type | agent-name | .claude/agents/<category>/<name>.md |
   - Choose appropriate request type keywords

2. ROUTER AGENT UPDATE (MANDATORY)
   - Update router.md Core/Specialized/Domain agent tables
   - Add to Planning Orchestration Matrix if applicable
   - Add example spawn pattern if complex

3. SKILL ASSIGNMENT CHECK
   - Are all assigned skills valid? (validate-agents.mjs checks this)
   - Should any existing skills be assigned to this agent?
   - Scan .claude/skills/ for relevant unassigned skills

4. WORKFLOW CHECK
   - Does this agent need a dedicated workflow?
   - Should it be added to existing enterprise workflows?
   - Create/update .claude/workflows/ as needed

5. RELATED AGENT CHECK
   - Does this agent overlap with existing agents?
   - Should existing agents reference this one?
   - Update Planning Orchestration Matrix for multi-agent patterns
```

### Example: Creating a "technical-writer" Agent

```
[AGENT-CREATOR] Created: .claude/agents/core/technical-writer.md

[AGENT-CREATOR] System Impact Analysis...

1. ROUTING TABLE UPDATE
   Added to CLAUDE.md:
   | Documentation, docs | technical-writer | .claude/agents/core/technical-writer.md |

2. ROUTER AGENT UPDATE
   Added to router.md Core Agents table
   Added to Planning Orchestration Matrix:
   | Documentation (new/update) | technical-writer | - | Single |

3. SKILL ASSIGNMENT CHECK
   Assigned skills: writing, doc-generator, writing-skills, task-management-protocol
   All skills exist and validated

4. WORKFLOW CHECK
   Consider creating: .claude/workflows/documentation-workflow.md

5. RELATED AGENT CHECK
   No overlap with existing agents
   Planner may delegate doc tasks to this agent
```

### System Update Commands

```bash
# Add to CLAUDE.md routing table (edit manually)
# Look for "## 3. AGENT ROUTING TABLE" section

# Update router.md agent tables (edit manually)
# Look for "Core Agents:" or "Specialized Agents:" sections

# Verify routing table entry exists
grep "<agent-name>" .claude/CLAUDE.md || echo "ERROR: Not in routing table!"

# Verify router.md entry exists
grep "<agent-name>" .claude/agents/core/router.md || echo "ERROR: Not in router!"

# Full validation
node .claude/tools/validate-agents.mjs
```

### Validation Checklist (Run After Every Creation) - BLOCKING

**This checklist is BLOCKING. All items must pass before agent creation is complete.**

```bash
# Verify keyword research report exists (Step 2.5) - MANDATORY
[ -f ".claude/context/artifacts/research-reports/agent-keywords-<agent-name>.md" ] || echo "ERROR: Keyword research report missing - AGENT CREATION INCOMPLETE"

# Validate the new agent
node .claude/tools/validate-agents.mjs 2>&1 | grep "<agent-name>"

# Verify skills exist
for skill in $(grep -A10 "^skills:" .claude/agents/<category>/<agent>.md | grep "  - " | sed 's/  - //'); do
  [ -f ".claude/skills/$skill/SKILL.md" ] || echo "BROKEN: $skill"
done

# Check CLAUDE.md routing table - MANDATORY
grep "<agent-name>" .claude/CLAUDE.md || echo "ERROR: Not in routing table - AGENT CREATION INCOMPLETE"

# Check routing-table.cjs keywords registration (Step 7.5) - MANDATORY
grep "<agent-name>" .claude/lib/routing/routing-table.cjs || echo "ERROR: Agent not in routing-table.cjs - AGENT CREATION INCOMPLETE"
```

**Completion Checklist** (all must be checked):

```
[ ] Step 2.5 keyword research completed (3+ Exa searches)
[ ] Keyword research report saved to .claude/context/artifacts/research-reports/agent-keywords-<name>.md
[ ] Agent file created at .claude/agents/<category>/<name>.md
[ ] All required YAML fields present (name, description, model, context_strategy, tools, skills, context_files)
[ ] model field is base name only (sonnet/opus/haiku) - NO dated versions
[ ] NO extended_thinking field unless explicitly documented
[ ] NO MCP tools (mcp__*) unless whitelisted
[ ] All assigned skills exist in .claude/skills/
[ ] CLAUDE.md routing table updated
[ ] Routing table entry verified with grep
[ ] validate-agents.mjs passes for new agent
[ ] Task Progress Protocol section included in agent body
[ ] Task tools included in tools: array
[ ] Router keywords registered in routing-table.cjs (Iron Law #9)
[ ] Response Approach section present with 8 numbered steps (Iron Law #10)
[ ] Behavioral Traits section present with 10+ domain-specific traits (Iron Law #10)
[ ] Example Interactions section present with 8+ examples (Iron Law #10)
[ ] Compared against python-pro.md reference agent structure
[ ] Enforcement Hooks section populated (archetype-matched from @HOOK_AGENT_MAP.md)
[ ] Related Workflows section populated (archetype-matched from @WORKFLOW_AGENT_MAP.md)
[ ] Output Standards block present with workspace-conventions references
```

**BLOCKING**: If ANY item fails, agent creation is INCOMPLETE. Fix all issues before proceeding.

### Step 10: Integration Verification (BLOCKING - DO NOT SKIP)

**This step verifies the artifact is properly integrated into the ecosystem.**

Before calling `TaskUpdate({ status: "completed" })`, you MUST run the Post-Creation Validation workflow:

1. **Run the 10-item integration checklist:**

   ```bash
   node .claude/tools/cli/validate-integration.cjs .claude/agents/<category>/<agent-name>.md
   ```

2. **Verify exit code is 0** (all checks passed)

3. **If exit code is 1** (one or more checks failed):
   - Read the error output for specific failures
   - Fix each failure:
     - Missing CLAUDE.md entry -> Add routing table entry
   - Missing routing-table keywords -> Add intent keywords
   - Missing memory update -> Update learnings.md
   - Re-run validation until exit code is 0

4. **Only proceed when validation passes**

**This step is BLOCKING.** Do NOT mark task complete until validation passes.

**Why this matters:** The Party Mode incident showed that fully-implemented artifacts can be invisible to the Router if integration steps are missed. This validation ensures no "invisible artifact" pattern.

**Reference:** `.claude/workflows/core/post-creation-validation.md`

### Step 11: Post-Creation Registry Regeneration (BLOCKING - PHASE 3 INTEGRATION)

**This step ensures the new agent is discoverable via the AvailableAgents() tool (Phase 3 infrastructure).**

After the agent is created and validated, you MUST regenerate the agent registry:

1. **Run the agent registry generator:**

   ```bash
   node .claude/tools/cli/generate-agent-registry.cjs
   ```

2. **Verify the command completed successfully:**
   - Exit code should be 0
   - You should see: `Successfully generated agent registry`

3. **Verify agent appears in registry:**

   ```bash
   grep "<agent-name>" .claude/context/agent-registry.json || echo "ERROR: Agent not in registry!"
   ```

4. **Check capability card was generated:**
   - Verify the agent has a capability card in agent-registry.json
   - Card should include `capabilities`, `health`, and `constraints`
   - Health status should be `healthy` for new agents

**Why this is mandatory:**

- Agents not in agent-registry.json are **invisible to AvailableAgents()** tool
- Router cannot discover them for capability-based routing
- AvailableAgents() excludeFailed logic won't work without health tracking
- New agents must be registered in Phase 3 discovery system

**Phase 3 Context:**

- **File**: `.claude/context/agent-registry.json` (runtime agent registry)
- **Tool**: `AvailableAgents()` for agent discovery by capability
- **Schema**: `.claude/schemas/agent-capability-card.schema.json`
- **Routing**: `.claude/config/capability-routing.json` (capability-to-agent mapping)

### Step 12: Update agent-config.json (REQUIRED FOR TOOL DEFAULTS)

**Spawn tool enrichment uses agent-config.json as a fallback when registry requiredTools are missing.**

After regenerating the agent registry, add an entry to:

- **File:** `.claude/config/agent-config.json`
- **Path:** `agents.<agent-name>`

**Required fields:**

- `tools`: array of tool names (match the agent’s frontmatter tools if present)
- `thinkingDefault`: `none | low | medium | high | ultrathink`
- `phase`: optional (`spec | planning | coding | qa`)

**Verification:**

```bash
grep "\"<agent-name>\"" .claude/config/agent-config.json || echo "ERROR: agent-config.json NOT UPDATED!"
```

**Troubleshooting:**

If agent doesn't appear in registry:

- Check agent file has valid YAML frontmatter
- Verify no syntax errors in agent name/description
- Check agent file is readable and in correct location
- Re-run generator with verbose output: `node .claude/tools/cli/generate-agent-registry.cjs --verbose`

**Integration Diagram:**

```
Agent Created
    ↓
Step 10: Validation (CLAUDE.md, routing-table.cjs)
    ↓
Step 11: Registry Regeneration (Phase 3 Discovery)
    ↓
Step 12: Update agent-config.json (tool defaults)
    ↓
Agent in agent-registry.json
    ↓
AvailableAgents() can discover
    ↓
Router can route by capability
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

This skill is part of the **Creator Ecosystem**. After creating an agent, consider whether companion creators are needed:

| Creator              | When to Use                                     | Invocation                             |
| -------------------- | ----------------------------------------------- | -------------------------------------- |
| **skill-creator**    | Agent needs new skills not in `.claude/skills/` | `Skill({ skill: 'skill-creator' })`    |
| **workflow-creator** | Agent needs orchestration workflow              | `Skill({ skill: 'workflow-creator' })` |
| **template-creator** | Agent needs code templates                      | `Skill({ skill: 'template-creator' })` |
| **schema-creator**   | Agent needs input/output validation schemas     | `Skill({ skill: 'schema-creator' })`   |
| **hook-creator**     | Agent needs pre/post execution hooks            | `Skill({ skill: 'hook-creator' })`     |

### Integration Workflow

After creating an agent that needs additional capabilities:

```javascript
// 1. Agent created but needs new skill
Skill({ skill: 'skill-creator' });
// Create the skill, then update agent's skills: array

// 2. Agent needs MCP server integration
// Use skill-creator to convert MCP server to skill
// node .claude/skills/skill-creator/scripts/convert.cjs --server "@modelcontextprotocol/server-xyz"

// 3. Agent needs workflow
// Create workflow in .claude/workflows/<agent-name>-workflow.md
// Update CLAUDE.md Section 8.6 if enterprise workflow
```

### Post-Creation Checklist for Ecosystem Integration

After agent is fully created and validated:

```
[ ] Does agent need skills that don't exist? -> Use skill-creator
[ ] Does agent need multi-phase orchestration? -> Create workflow
[ ] Does agent need code scaffolding? -> Create templates
[ ] Does agent interact with external services? -> Consider MCP integration
[ ] Should agent be part of enterprise workflows? -> Update Section 8.6
```
