# Preserved Reference Content

This file preserves sections extracted from the pre-refactor `SKILL.md` so the core workflow can stay concise.

### Step 6: Validate Required Fields (BLOCKING)

**Before writing agent file, verify ALL required fields are present.**

| Field              | Required | Default        | Notes                                   |
| ------------------ | -------- | -------------- | --------------------------------------- |
| `name`             | YES      | -              | lowercase-with-hyphens                  |
| `description`      | YES      | -              | Single line, include trigger conditions |
| `model`            | YES      | sonnet         | sonnet, opus, or haiku                  |
| `context_strategy` | YES      | lazy_load      | minimal, lazy_load, or full             |
| `tools`            | YES      | []             | At least [Read] required                |
| `skills`           | YES      | []             | List relevant skills                    |
| `context_files`    | YES      | [learnings.md] | Memory files to load                    |
| `temperature`      | NO       | 0.4            | 0.0-1.0                                 |
| `priority`         | NO       | medium         | low, medium, high                       |

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

```

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
- DO NOT add MCP tools (mcp\_\_\*) unless whitelisted in routing-table.cjs
- MCP tools (mcp**Exa**_, mcp**GitHub**_, etc.) cause router enforcement failures
- If MCP integration is needed, document it explicitly and verify hook compatibility

After writing, validate file was saved:

1. **YAML frontmatter is valid** - No syntax errors
2. **Required fields present** - All fields from checklist above
3. **Skills exist** - All referenced skills are in `.claude/skills/`
4. **File saved correctly** - Glob to verify file exists

### Step 7: Update Routing Table (MANDATORY - BLOCKING)

**This step is AUTOMATIC and BLOCKING. Do not skip.**

After agent file is written, you MUST update `@AGENT_ROUTING_TABLE.md` (the canonical routing reference):

1. **Parse `.claude/docs/@AGENT_ROUTING_TABLE.md`** (Section 3 canonical source)
2. **Generate routing entry**:
   ```markdown
   | {request_type} | `{agent_name}` | `.claude/agents/{category}/{agent_name}.md` |
   ```

`````

1. **Find correct insertion point** (alphabetical within category, or at end of relevant section)
2. **Insert using Edit tool**
3. **Verify with**:

   ```bash
   grep "{agent-name}" .claude/docs/@AGENT_ROUTING_TABLE.md || echo "ERROR: ROUTING TABLE NOT UPDATED!"
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
  task_id: 'task-1',
  subagent_type: 'general-purpose',
  description: 'ux-reviewer executing original task',
  prompt: 'You are the UX-REVIEWER agent...',
});
```

**Option B: Spawn via Task tool manually**

```javascript
Task({
  task_id: 'task-2',
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
`````

> **CRITICAL**: Use `Skill()` tool, not `Read()`. Skill() loads AND applies the workflow.

### Step 1-5: Execute Task

...

````

5. **Execute**: Spawn via Task tool

### Example 2: Data Engineer Agent

**User**: "Analyze this dataset and build a prediction model"

1. **Check**: No `data-engineer*.md` agent exists
2. **Research**:
   - `WebSearch: "data science workflow best practices 2026"`
   - `WebSearch: "machine learning model evaluation techniques"`
3. **Find skills**: `text-to-sql`, `diagram-generator`, `doc-generator`, `task-management-protocol`
4. **Create**: `.claude/agents/domain/data-engineer.md`
5. **Execute**: Task tool with new agent

### Example 3: API Design Specialist

**User**: "Help me integrate with the Stripe API"

1. **Check**: No `stripe*.md` or `api-integration*.md` agent exists
2. **Research**:
   - `WebSearch: "Stripe API integration best practices 2026"`
   - `WebFetch: "https://stripe.com/docs"` (extract key patterns)
3. **Find skills**: `github-ops`, `test-generator`, `doc-generator`, `task-management-protocol`
4. **Create**: `.claude/agents/domain/api-designer.md`
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
   - Run: node .claude/tools/cli/validate-agents.mjs to catch broken pointers

5. NO AGENT WITHOUT MEMORY PROTOCOL
   - Every agent MUST have Memory Protocol section in body
   - Without it, learnings are lost

6. NO AGENT WITHOUT ROUTING TABLE ENTRY
   - After creating agent, add to @AGENT_ROUTING_TABLE.md
   - Unrouted agents are never spawned

7. NO CREATION WITHOUT SYSTEM IMPACT ANALYSIS
   - Update @AGENT_ROUTING_TABLE.md routing table (MANDATORY)
   - Update CLAUDE.md agent tables (MANDATORY)
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

## Anti-Patterns

| Anti-Pattern                           | Why It Fails                                                          | Correct Approach                                       |
| -------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| Copying another agent verbatim         | Misses unique requirements, wrong tools/skills for the new domain     | Start from agent-creator with domain research (Step 2) |
| Omitting `tools:` block in frontmatter | Registry falls back to defaults, agent gets wrong tool permissions    | Explicitly list all needed tools in YAML frontmatter   |
| Skipping mandatory skills              | Agent missing core capabilities (task-mgmt, search, memory, etc.)     | Include all 6 mandatory skills in every agent          |
| Writing agent `.md` directly           | Bypasses post-creation steps (catalog, registry, routing, assignment) | Always use `Skill({ skill: 'agent-creator' })`         |
| No verification step                   | Agent deployed without integration validation, invisible to Router    | Run `validate-integration.cjs` before marking complete |

## System Impact Analysis (MANDATORY)

**After creating ANY agent, you MUST analyze and update system-wide impacts.**

### Impact Checklist

Run this analysis after every agent creation:

```
[AGENT-CREATOR] System Impact Analysis for: <agent-name>

1. ROUTING TABLE UPDATE (MANDATORY)
   - Add entry to @AGENT_ROUTING_TABLE.md
   - Format: | Request Type | agent-name | .claude/agents/<category>/<name>.md |
   - Choose appropriate request type keywords

2. ROUTER AGENT UPDATE (MANDATORY)
   - Update CLAUDE.md Core/Specialized/Domain agent tables
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

### Orchestrator Sync Contract (MANDATORY)

If category is `orchestrators`, you MUST also update and verify all of the following files:

- `.claude/CLAUDE.md`
- `.claude/workflows/core/router-decision.md`
- `.claude/workflows/core/ecosystem-creation-workflow.md`

Do not mark orchestrator creation complete until all four files reflect the new/updated orchestrator behavior.

### Example: Creating a "technical-writer" Agent

```
[AGENT-CREATOR] Created: .claude/agents/core/technical-writer.md

[AGENT-CREATOR] System Impact Analysis...

1. ROUTING TABLE UPDATE
   Added to CLAUDE.md:
   | Documentation, docs | technical-writer | .claude/agents/core/technical-writer.md |

2. ROUTER AGENT UPDATE
   Added to CLAUDE.md Core Agents table
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
# Add to @AGENT_ROUTING_TABLE.md routing table (edit manually)
# Look for the relevant agent category section

# Update CLAUDE.md agent tables (edit manually)
# Look for "Core Agents:" or "Specialized Agents:" sections

# Verify routing table entry exists
grep "<agent-name>" .claude/docs/@AGENT_ROUTING_TABLE.md || echo "ERROR: Not in routing table!"

# Verify CLAUDE.md entry exists
grep "<agent-name>" .claude/CLAUDE.md || echo "ERROR: Not in CLAUDE.md!"

# Full validation
node .claude/tools/cli/validate-agents.mjs
```

### Validation Checklist (Run After Every Creation) - BLOCKING

**This checklist is BLOCKING. All items must pass before agent creation is complete.**

```bash
# Verify keyword research report exists (Step 2.5) - MANDATORY
[ -f ".claude/context/artifacts/research-reports/agent-keywords-<agent-name>.md" ] || echo "ERROR: Keyword research report missing - AGENT CREATION INCOMPLETE"

# Validate the new agent
node .claude/tools/cli/validate-agents.mjs 2>&1 | grep "<agent-name>"

# Verify skills exist
for skill in $(grep -A10 "^skills:" .claude/agents/<category>/<agent>.md | grep "  - " | sed 's/  - //'); do
  [ -f ".claude/skills/$skill/SKILL.md" ] || echo "BROKEN: $skill"
done

# Check @AGENT_ROUTING_TABLE.md routing table - MANDATORY
grep "<agent-name>" .claude/docs/@AGENT_ROUTING_TABLE.md || echo "ERROR: Not in routing table - AGENT CREATION INCOMPLETE"

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
[ ] @AGENT_ROUTING_TABLE.md routing table updated
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
[ ] README.md footprint count updated (Step 13)
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
    ↓
Step 13: README.md Updated (footprint count)
```

### Step 13: Global Ecosystem Sync (MANDATORY)

To guarantee that all registries and indexes are perfectly synchronized across the entire framework, you must run the composite registry command as your final action:

```bash
npm run gen:all-registries
```

This ensures the `agent-registry`, `skill-index`, and `tool-manifest` are completely up-to-date and consistent with each other.

### Step 14: Update README.md Footprint Count (MANDATORY)

After all registries are updated, refresh the agent count in README.md so the Current Footprint stays accurate.

1. **Count current agent files:**

   ```bash
   find .claude/agents -name "*.md" | wc -l
   ```

2. **Edit README.md** — locate and update the footprint line:

   Find: `- Agents: {N} files`
   Replace with: `- Agents: {new_count} files`

3. **Verify:**

   ```bash
   grep "^- Agents:" README.md
   ```

---
