# Plan: Agent Tool/Skill Awareness Fix

## Executive Summary

Complete fix strategy for eliminating tool parameter errors and ensuring agents have full awareness of available tools and skills at spawn time. Based on root cause analysis of the current system and best practices from multi-agent frameworks (AutoGPT, CrewAI, LangChain agents).

**Status**: Phase 0 - Research Complete
**Total Tasks**: 28 atomic tasks
**Estimated Time**: ~16-20 hours
**Priority**: P1 (Critical - zero error tolerance)

## Problem Statement

The agent-studio orchestration has FIVE critical issues:

1. **Agents don't know what tools they have** - Spawned agents get "Invalid tool parameters" errors
2. **Agents don't know available skills** - Developers manually trying to pull skills instead of using Skill()
3. **Tool errors are repeated** - Orchestrator spawning agents with wrong tool configs
4. **Orchestrator makes wrong decisions** - Not aware of all available capabilities
5. **Zero error tolerance** - EVERY agent spawn can fail with tool errors

Example error pattern:
```
Invalid tool parameters
Error: Sibling tool call errored
```

---

## Phase 0: Root Cause Analysis (COMPLETE)

### Finding 1: Tool Configuration Mismatch

**Current State Analysis:**

| Component | Tool Definition | Problem |
|-----------|----------------|---------|
| `developer.md` | `tools: [Read, Write, Edit, Glob, Grep, Bash, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill]` | Missing TaskOutput |
| `master-orchestrator.md` | `tools: [Task, Read, Grep, Glob, TaskUpdate, TaskList, TaskCreate, TaskGet, Skill]` | Missing Write, Edit, Bash |
| `universal-agent-spawn.md` | `allowed_tools: [Read, Write, Edit, Bash, TaskUpdate, TaskList, TaskCreate, TaskGet, TaskOutput, Skill]` | Missing Glob, Grep |
| CLAUDE.md Section 1.4 | Lists 20 core tools | Not injected into spawn prompts |

**Root Cause**: No single source of truth for agent tool configuration. Three different definitions conflict.

### Finding 2: Skill Discovery Gap

**Current State:**
- Skill catalog exists at `.claude/context/artifacts/skill-catalog.md` (435 skills)
- Agents are TOLD to "invoke skills via Skill()" but NOT given skill list
- Spawn prompts say "use Skill({ skill: '...' })" without listing available skills

**Root Cause**: Spawn templates assume agents will discover skills on their own, but they have no mechanism to do so.

### Finding 3: Validation Exists But Is Insufficient

**Current Hooks:**
| Hook | Purpose | Gap |
|------|---------|-----|
| `tool-availability-validator.cjs` | Validates allowed_tools array | Only checks if tools exist, not if agent needs them |
| `spawn-prompt-validator.cjs` | Validates spawn prompt structure | Does not validate tool coherence |

**Root Cause**: Validation is reactive (blocks bad spawns) not proactive (ensures complete spawns).

### Finding 4: MCP Tool References in Agents

**From issues.md [TOOL-001]:**
- 11 agent definitions reference `mcp__sequential-thinking__*`
- No MCP servers configured in settings.json (`mcpServers: {}`)
- Causes "No such tool available" runtime errors

**Root Cause**: Historical MCP references not cleaned up after ADR-043 decision.

### Finding 5: Agent Definition Schema Missing Validation

**Current State:**
- Agent YAML frontmatter defines `tools: [...]` array
- No schema validation enforces tool names match CORE_TOOLS
- No validation that skills listed exist in skill catalog

**Root Cause**: Agent definition is trusted without runtime validation.

---

## Phase 0: Research - Multi-Agent System Best Practices

### Best Practice 1: Tool Manifest Pattern (AutoGPT)

**Source**: AutoGPT Plugin Architecture (github.com/Significant-Gravitas/Auto-GPT)

AutoGPT uses a **tool manifest** that:
- Defines ALL available tools in one JSON file
- Each tool has: name, description, parameters, return type
- Agents receive tool manifest in their system prompt
- Runtime validates tool calls against manifest

**Applicability**: Create `tool-manifest.json` as single source of truth.

### Best Practice 2: Capability Discovery (CrewAI)

**Source**: CrewAI Agent Framework (docs.crewai.com)

CrewAI uses **capability discovery**:
- Agents are given a list of available tools at instantiation
- Tools are injected into agent's `tools` parameter
- Agent can query tool descriptions before using

**Applicability**: Inject tool list into spawn prompts with descriptions.

### Best Practice 3: Tool Registry (LangChain)

**Source**: LangChain Tools Documentation (python.langchain.com/docs/modules/agents/tools)

LangChain uses a **tool registry**:
- All tools registered in a central `ToolRegistry`
- Agents query registry for available tools
- Registry validates tool calls before execution

**Applicability**: Extend `tool-availability-validator.cjs` to be a proper registry.

### Best Practice 4: Skill Index (Semantic Kernel)

**Source**: Microsoft Semantic Kernel (learn.microsoft.com/semantic-kernel)

Semantic Kernel uses **skill indexing**:
- Skills stored in a searchable index
- Agents can search skills by description/tags
- Skills auto-registered on load

**Applicability**: Create skill index from catalog for agent discovery.

### Best Practice 5: Fail-Fast Validation (AutoGen)

**Source**: Microsoft AutoGen (github.com/microsoft/autogen)

AutoGen validates **before execution**:
- Tool parameters validated before spawn
- Missing tools cause immediate failure with clear message
- No silent failures

**Applicability**: Enhance `spawn-prompt-validator.cjs` with tool coherence check.

---

## Phase 1: Single Source of Truth

**Purpose**: Create canonical definitions for tools and skills
**Dependencies**: None
**Parallel OK**: No

### Task 1.1: Create Tool Manifest (~1 hour)

Create `C:\dev\projects\agent-studio\.claude\config\tool-manifest.json`:

```json
{
  "version": "1.0.0",
  "lastUpdated": "2026-01-30",
  "coreTools": {
    "Read": {
      "category": "file_io",
      "description": "Read files from filesystem",
      "availability": "all_agents",
      "requiredBy": ["developer", "planner", "architect", "qa", "technical-writer"]
    },
    "Write": {
      "category": "file_io",
      "description": "Create/overwrite files",
      "availability": "all_agents",
      "requiredBy": ["developer", "planner", "architect", "qa", "technical-writer"]
    },
    "Edit": {
      "category": "file_io",
      "description": "Make precise edits to files",
      "availability": "all_agents",
      "requiredBy": ["developer", "planner", "architect", "qa"]
    },
    "Bash": {
      "category": "shell",
      "description": "Execute shell commands",
      "availability": "all_agents",
      "restrictions": ["router_read_only_git"],
      "requiredBy": ["developer", "devops", "qa"]
    },
    "Glob": {
      "category": "search",
      "description": "Pattern-based file discovery",
      "availability": "all_agents",
      "requiredBy": ["developer", "architect", "code-reviewer"]
    },
    "Grep": {
      "category": "search",
      "description": "Content search in files",
      "availability": "all_agents",
      "requiredBy": ["developer", "architect", "code-reviewer"]
    },
    "Task": {
      "category": "orchestration",
      "description": "Spawn subagents",
      "availability": "orchestrators_only",
      "requiredBy": ["router", "master-orchestrator", "swarm-coordinator", "evolution-orchestrator", "party-orchestrator"]
    },
    "TaskCreate": {
      "category": "task_management",
      "description": "Create trackable tasks",
      "availability": "all_agents",
      "requiredBy": ["planner", "master-orchestrator"]
    },
    "TaskUpdate": {
      "category": "task_management",
      "description": "Update task status/metadata",
      "availability": "all_agents",
      "mandatory": true,
      "requiredBy": ["all"]
    },
    "TaskList": {
      "category": "task_management",
      "description": "List all tasks",
      "availability": "all_agents",
      "requiredBy": ["all"]
    },
    "TaskGet": {
      "category": "task_management",
      "description": "Get task details",
      "availability": "all_agents",
      "requiredBy": ["all"]
    },
    "TaskOutput": {
      "category": "task_management",
      "description": "Read task output",
      "availability": "all_agents",
      "requiredBy": ["master-orchestrator", "planner"]
    },
    "TaskStop": {
      "category": "task_management",
      "description": "Stop running task",
      "availability": "all_agents",
      "requiredBy": ["master-orchestrator"]
    },
    "Skill": {
      "category": "capability",
      "description": "Invoke skill workflows",
      "availability": "all_agents",
      "mandatory": true,
      "requiredBy": ["all"]
    },
    "AskUserQuestion": {
      "category": "interaction",
      "description": "Get user input",
      "availability": "router_only",
      "requiredBy": ["router"]
    },
    "EnterPlanMode": {
      "category": "planning",
      "description": "Switch to planning mode",
      "availability": "all_agents",
      "requiredBy": ["planner", "architect"]
    },
    "ExitPlanMode": {
      "category": "planning",
      "description": "Exit planning mode",
      "availability": "all_agents",
      "requiredBy": ["planner", "architect"]
    },
    "WebSearch": {
      "category": "research",
      "description": "Search the web",
      "availability": "all_agents",
      "requiredBy": ["researcher", "evolution-orchestrator"]
    },
    "WebFetch": {
      "category": "research",
      "description": "Fetch webpage content",
      "availability": "all_agents",
      "requiredBy": ["researcher"]
    },
    "NotebookEdit": {
      "category": "jupyter",
      "description": "Edit notebook cells",
      "availability": "all_agents",
      "requiredBy": ["data-engineer", "ai-ml-specialist"]
    }
  },
  "agentToolsets": {
    "standard": ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "TaskUpdate", "TaskList", "TaskCreate", "TaskGet", "TaskOutput", "Skill"],
    "orchestrator": ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "Task", "TaskUpdate", "TaskList", "TaskCreate", "TaskGet", "TaskOutput", "Skill"],
    "router": ["Read", "Task", "TaskList", "TaskCreate", "TaskUpdate", "TaskGet", "AskUserQuestion"],
    "read_only": ["Read", "Glob", "Grep", "WebSearch", "WebFetch", "TaskUpdate", "TaskList", "Skill"]
  }
}
```

**Command**: Write tool-manifest.json
**Verify**: `cat .claude/config/tool-manifest.json | jq .version`
**Rollback**: `rm .claude/config/tool-manifest.json`

### Task 1.2: Create Skill Index Generator (~1 hour)

Create `C:\dev\projects\agent-studio\.claude\lib\utils\skill-index-generator.cjs`:

```javascript
// Generates searchable skill index from skill catalog
// Output: .claude/config/skill-index.json

// Features:
// - Parses skill-catalog.md
// - Extracts skill name, category, description, tools
// - Creates searchable index by category/keyword
// - Validates skill files exist
```

**Command**: `node .claude/lib/utils/skill-index-generator.cjs`
**Verify**: `cat .claude/config/skill-index.json | jq '.totalSkills'`

### Task 1.3: Generate Initial Skill Index (~30 min)

Run the generator to create the skill index.

**Command**: `node .claude/lib/utils/skill-index-generator.cjs --output .claude/config/skill-index.json`
**Verify**: Skill index has 435 entries

### Task 1.4: Create Agent Definition Validator (~1 hour)

Create `C:\dev\projects\agent-studio\.claude\lib\utils\agent-definition-validator.cjs`:

```javascript
// Validates agent YAML frontmatter against tool-manifest.json
// Checks:
// - tools[] array only contains valid tool names
// - skills[] array only contains existing skills
// - No MCP tools referenced without server config
// - Mandatory tools (TaskUpdate, Skill) present
```

**Command**: `node .claude/lib/utils/agent-definition-validator.cjs .claude/agents/core/developer.md`
**Verify**: Validates without errors

---

## Phase 2: Spawn Template Enhancement

**Purpose**: Inject tool/skill awareness into spawn prompts
**Dependencies**: Phase 1 complete
**Parallel OK**: Partial

### Task 2.1: Create Tool Injection Module (~1 hour)

Create `C:\dev\projects\agent-studio\.claude\lib\spawn\tool-injector.cjs`:

```javascript
// Injects tool manifest information into spawn prompts
// Features:
// - Reads tool-manifest.json
// - Determines agent toolset based on agent type
// - Generates AVAILABLE_TOOLS section for prompt
// - Formats tool descriptions inline
```

### Task 2.2: Create Skill Injection Module (~1 hour)

Create `C:\dev\projects\agent-studio\.claude\lib\spawn\skill-injector.cjs`:

```javascript
// Injects skill catalog summary into spawn prompts
// Features:
// - Reads skill-index.json
// - Selects top 20 most relevant skills for agent type
// - Generates AVAILABLE_SKILLS section for prompt
// - Includes category index for discovery
```

### Task 2.3: Update Universal Spawn Template (~1 hour)

Update `.claude/templates/spawn/universal-agent-spawn.md`:

Add new sections:

```markdown
## AVAILABLE TOOLS (AUTO-INJECTED)

You have access to the following tools:

{{TOOL_LIST}}

**Tool Usage Rules:**
- Use ONLY these tools. Attempting to use unlisted tools will fail.
- TaskUpdate is MANDATORY for task tracking.
- Skill() invokes skills (reading skill files does NOT invoke them).

## AVAILABLE SKILLS (TOP 20 FOR YOUR ROLE)

{{SKILL_LIST}}

**Skill Discovery:**
- Full catalog: .claude/context/artifacts/skill-catalog.md
- Search by category or keyword
- Invoke with: Skill({ skill: "<skill-name>" })
```

**Verify**: Template contains {{TOOL_LIST}} and {{SKILL_LIST}} placeholders

### Task 2.4: Update Orchestrator Spawn Template (~30 min)

Update `.claude/templates/spawn/orchestrator-spawn.md`:

Add same sections with orchestrator toolset.

### Task 2.5: Create Spawn Prompt Assembler (~1.5 hours)

Create `C:\dev\projects\agent-studio\.claude\lib\spawn\prompt-assembler.cjs`:

```javascript
// Assembles complete spawn prompt from components:
// 1. Load base template (universal or orchestrator)
// 2. Inject tool list via tool-injector
// 3. Inject skill list via skill-injector
// 4. Substitute placeholders (ROLE, TASK, ID, PROJECT_ROOT)
// 5. Return complete prompt

const assembleSpawnPrompt = async (options) => {
  const { agentType, taskId, subject, projectRoot } = options;

  // 1. Select template
  const template = isOrchestrator(agentType)
    ? await loadOrchestratorTemplate()
    : await loadUniversalTemplate();

  // 2. Inject tools
  const toolset = getToolsetForAgent(agentType);
  const toolSection = formatToolSection(toolset);

  // 3. Inject skills
  const relevantSkills = getRelevantSkills(agentType);
  const skillSection = formatSkillSection(relevantSkills);

  // 4. Substitute placeholders
  return substituteAll(template, {
    TOOL_LIST: toolSection,
    SKILL_LIST: skillSection,
    ROLE: agentType,
    TASK: subject,
    ID: taskId,
    PROJECT_ROOT: projectRoot
  });
};
```

---

## Phase 3: Validation Enhancement

**Purpose**: Pre-spawn validation to prevent tool errors
**Dependencies**: Phase 1 complete
**Parallel OK**: Yes (with Phase 2)

### Task 3.1: Enhance tool-availability-validator.cjs (~1.5 hours)

Update `.claude/hooks/routing/tool-availability-validator.cjs`:

New features:
- Read tool-manifest.json for validation
- Validate against agent toolset definitions
- Check for mandatory tools (TaskUpdate, Skill)
- Generate helpful error messages with fixes

```javascript
// Enhanced validation
function validateAgentTools(agentType, requestedTools) {
  const manifest = loadToolManifest();
  const validToolset = manifest.agentToolsets[getToolsetType(agentType)];

  const errors = [];

  // Check mandatory tools
  if (!requestedTools.includes('TaskUpdate')) {
    errors.push('Missing mandatory tool: TaskUpdate');
  }
  if (!requestedTools.includes('Skill')) {
    errors.push('Missing mandatory tool: Skill');
  }

  // Check for invalid tools
  for (const tool of requestedTools) {
    if (!manifest.coreTools[tool] && !tool.startsWith('mcp__')) {
      errors.push(`Unknown tool: ${tool}`);
    }
  }

  // Check for missing recommended tools
  const missing = validToolset.filter(t => !requestedTools.includes(t));
  if (missing.length > 0) {
    warnings.push(`Agent may need: ${missing.join(', ')}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}
```

**Verify**: `SPAWN_PROMPT_VALIDATOR=block node .claude/hooks/routing/tool-availability-validator.cjs < test-input.json`

### Task 3.2: Create Agent Definition Pre-Spawn Check (~1 hour)

Create `.claude/hooks/routing/agent-definition-check.cjs`:

```javascript
// PreToolUse(Task) hook that:
// 1. Reads agent definition YAML
// 2. Validates tools against tool-manifest
// 3. Validates skills exist in skill-index
// 4. Blocks spawn if validation fails
```

### Task 3.3: Enhance spawn-prompt-validator.cjs (~1 hour)

Add tool coherence check to existing validator:

```javascript
// New check: TOOL_COHERENCE
// Ensures allowed_tools in spawn matches prompt's AVAILABLE_TOOLS section
function checkToolCoherence(allowedTools, promptContent) {
  const declaredTools = extractToolsFromPrompt(promptContent);

  // All allowed tools should be declared
  for (const tool of allowedTools) {
    if (!declaredTools.includes(tool)) {
      return { valid: false, reason: `Tool ${tool} in allowed_tools but not in prompt` };
    }
  }

  return { valid: true };
}
```

### Task 3.4: Register New Hooks in settings.json (~30 min)

Update `.claude/settings.json`:

```json
{
  "matcher": "Task",
  "hooks": [
    { "type": "command", "command": "node .claude/hooks/routing/agent-definition-check.cjs" },
    { "type": "command", "command": "node .claude/hooks/safety/spawn-prompt-validator.cjs" },
    { "type": "command", "command": "node .claude/hooks/routing/tool-availability-validator.cjs" },
    { "type": "command", "command": "node .claude/hooks/routing/pre-task-unified.cjs" }
  ]
}
```

**Verify**: `grep "agent-definition-check" .claude/settings.json`

---

## Phase 4: Agent Definition Cleanup

**Purpose**: Fix existing agent definitions to match manifest
**Dependencies**: Phase 1 complete
**Parallel OK**: Yes (each agent independent)

### Task 4.1: Audit All Agent Definitions (~2 hours)

Run agent-definition-validator on all agents:

```bash
for agent in .claude/agents/**/*.md; do
  node .claude/lib/utils/agent-definition-validator.cjs "$agent"
done > agent-audit-results.txt
```

**Output**: List of all agents with tool/skill issues

### Task 4.2: Fix developer.md Tools (~15 min)

Update tools array:
```yaml
tools: [Read, Write, Edit, Glob, Grep, Bash, TaskUpdate, TaskList, TaskCreate, TaskGet, TaskOutput, Skill]
```

### Task 4.3: Fix master-orchestrator.md Tools (~15 min)

Update tools array:
```yaml
tools: [Task, Read, Write, Edit, Glob, Grep, Bash, TaskUpdate, TaskList, TaskCreate, TaskGet, TaskOutput, Skill]
```

### Task 4.4: Remove MCP Tool References (~1 hour)

For all 11 agents with `mcp__sequential-thinking__*`:
- Remove MCP tool from tools array
- Add comment: `# Use Skill({ skill: 'sequential-thinking' }) instead`

### Task 4.5: Validate All Agents Post-Fix (~30 min)

Re-run validator to confirm zero errors:

```bash
node .claude/lib/utils/agent-definition-validator.cjs --all --strict
```

**Success Criteria**: 0 errors, 0 warnings

---

## Phase 5: Router Enhancement

**Purpose**: Make Router use prompt-assembler for all spawns
**Dependencies**: Phase 2 complete
**Parallel OK**: No

### Task 5.1: Update CLAUDE.md Spawn Examples (~1 hour)

Update Section 2 with new spawn pattern:

```javascript
// NEW: Use prompt-assembler for complete prompts
const prompt = await assembleSpawnPrompt({
  agentType: 'developer',
  taskId: taskId,
  subject: 'Implement feature X',
  projectRoot: 'C:\\dev\\projects\\agent-studio'
});

Task({
  subagent_type: 'general-purpose',
  description: 'Developer implementing feature X',
  allowed_tools: getToolsetForAgent('developer'), // From tool-manifest
  prompt: prompt
});
```

### Task 5.2: Update router-decision.md (~1 hour)

Add new step to routing workflow:

```markdown
## Step 5.5: Assemble Spawn Prompt (NEW)

Before spawning, Router MUST:

1. Determine agent toolset from tool-manifest.json
2. Assemble prompt using prompt-assembler
3. Validate assembled prompt via pre-spawn hooks
4. Only then call Task()

This ensures:
- Agent knows all available tools
- Agent knows relevant skills
- Tool/skill coherence is validated
- No "Invalid tool parameters" errors
```

### Task 5.3: Create Spawn Helper Utility (~1 hour)

Create `.claude/lib/spawn/spawn-helper.cjs`:

```javascript
// High-level spawn helper that Router can use
// Encapsulates all complexity:

const spawnAgent = async (options) => {
  const { agentType, taskId, subject, description } = options;

  // 1. Get toolset
  const toolset = getToolsetForAgent(agentType);

  // 2. Assemble prompt
  const prompt = await assembleSpawnPrompt({
    agentType, taskId, subject, projectRoot: process.cwd()
  });

  // 3. Validate (hook will run anyway, but pre-check is helpful)
  const validation = validateSpawnPrompt(prompt, toolset);
  if (!validation.valid) {
    throw new Error(`Spawn validation failed: ${validation.errors.join(', ')}`);
  }

  // 4. Return Task call
  return {
    subagent_type: isOrchestrator(agentType) ? agentType : 'general-purpose',
    description: description,
    allowed_tools: toolset,
    prompt: prompt
  };
};

module.exports = { spawnAgent, getToolsetForAgent, assembleSpawnPrompt };
```

---

## Phase 6: Integration Testing

**Purpose**: Verify zero tool errors in real scenarios
**Dependencies**: Phase 5 complete
**Parallel OK**: Yes

### Task 6.1: Create Spawn Integration Tests (~2 hours)

Create `tests/integration/spawn-tool-awareness.test.cjs`:

```javascript
describe('Spawn Tool Awareness', () => {
  it('should include all tools in spawn prompt', async () => {
    const prompt = await assembleSpawnPrompt({ agentType: 'developer', ... });
    expect(prompt).toContain('## AVAILABLE TOOLS');
    expect(prompt).toContain('Read');
    expect(prompt).toContain('TaskUpdate');
  });

  it('should include relevant skills in spawn prompt', async () => {
    const prompt = await assembleSpawnPrompt({ agentType: 'developer', ... });
    expect(prompt).toContain('## AVAILABLE SKILLS');
    expect(prompt).toContain('tdd');
    expect(prompt).toContain('debugging');
  });

  it('should validate tool coherence', () => {
    const result = validateToolCoherence(['Read', 'Write'], 'prompt without tools section');
    expect(result.valid).toBe(false);
  });

  it('should block spawn with invalid tools', () => {
    const result = validateAgentTools('developer', ['Read', 'InvalidTool']);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Unknown tool: InvalidTool');
  });

  it('should warn on missing mandatory tools', () => {
    const result = validateAgentTools('developer', ['Read', 'Write']);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing mandatory tool: TaskUpdate');
  });
});
```

### Task 6.2: Create E2E Spawn Test (~1 hour)

Create `tests/e2e/spawn-no-errors.test.cjs`:

```javascript
// Spawns each agent type and verifies no tool errors
describe('E2E: Spawn Without Errors', () => {
  const agentTypes = ['developer', 'planner', 'architect', 'qa', 'master-orchestrator'];

  for (const agentType of agentTypes) {
    it(`should spawn ${agentType} without tool errors`, async () => {
      const spawnConfig = await spawnAgent({ agentType, taskId: 'test-1', subject: 'Test' });

      // Simulate hook validation
      const hookResult = await runPreTaskHooks(spawnConfig);
      expect(hookResult.allowed).toBe(true);
      expect(hookResult.errors).toHaveLength(0);
    });
  }
});
```

### Task 6.3: Run Full Test Suite (~30 min)

```bash
npm test -- --grep "Spawn"
```

**Success Criteria**: All spawn tests pass

---

## Phase 7: Documentation & Memory Update

**Purpose**: Document changes and update memory
**Dependencies**: Phase 6 complete
**Parallel OK**: Yes

### Task 7.1: Update CLAUDE.md Section 1.4 (~1 hour)

Add reference to tool-manifest.json:

```markdown
### Tool Manifest

Single source of truth for all tool definitions:

**File**: `.claude/config/tool-manifest.json`

Contains:
- All 20 core tools with descriptions
- Agent toolset definitions (standard, orchestrator, router, read_only)
- Tool requirements per agent type
- Mandatory tools specification

Agents receive tool list via spawn prompt injection.
```

### Task 7.2: Update learnings.md (~30 min)

Document patterns discovered:

```markdown
## Agent Tool/Skill Awareness Fix (2026-01-30)

**Problem Solved**: Tool parameter errors and missing skill awareness

**Key Patterns Implemented:**

1. **Single Source of Truth**: tool-manifest.json defines all tools
2. **Spawn Prompt Injection**: Tools/skills injected into prompts
3. **Pre-Spawn Validation**: Hooks validate before Task()
4. **Skill Index**: Generated from catalog for discovery

**Files Created:**
- .claude/config/tool-manifest.json
- .claude/config/skill-index.json
- .claude/lib/spawn/prompt-assembler.cjs
- .claude/lib/spawn/tool-injector.cjs
- .claude/lib/spawn/skill-injector.cjs
- .claude/hooks/routing/agent-definition-check.cjs

**Result**: Zero tool parameter errors guaranteed by validation chain.
```

### Task 7.3: Update decisions.md (~30 min)

Document architecture decision:

```markdown
## [ADR-066] Tool Manifest and Spawn Prompt Injection

- **Date**: 2026-01-30
- **Status**: Accepted
- **Context**: Agents had no awareness of available tools/skills at spawn time, causing "Invalid tool parameters" errors. No single source of truth for tool definitions.
- **Decision**: Create tool-manifest.json as canonical tool definitions. Inject tool/skill lists into spawn prompts via prompt-assembler. Validate coherence via pre-spawn hooks.
- **Consequences**:
  - Benefits: Zero tool errors, agents self-aware, consistent toolsets
  - Trade-offs: Additional spawn complexity, manifest maintenance required
  - Future: Consider dynamic tool discovery for MCP tools
```

---

## Phase FINAL: Evolution & Reflection Check

**Purpose**: Quality assessment and learning extraction
**Dependencies**: All previous phases complete

### Tasks

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Spawn Command**:
```javascript
Task({
  subagent_type: "reflection-agent",
  description: "Session reflection and learning extraction",
  prompt: "You are REFLECTION-AGENT. Read .claude/agents/core/reflection-agent.md. Analyze the completed work from this plan, extract learnings to memory files, and check for evolution opportunities (patterns that suggest new agents or skills should be created)."
})
```

**Success Criteria**:
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Tool manifest out of sync | Medium | Medium | Add CI validation, version control |
| Spawn prompt too large | Low | Low | Limit skill injection to top 20 |
| Hook order dependency | Medium | Low | Document hook order in settings.json |
| Agent definitions not updated | High | Medium | Run validator in CI |
| Skill index generation fails | Low | Low | Graceful fallback to catalog |

---

## Success Criteria

**Phase Verification Gates:**

| Phase | Gate | Verification Command |
|-------|------|---------------------|
| 1 | Tool manifest valid | `cat .claude/config/tool-manifest.json \| jq .` |
| 2 | Spawn templates updated | `grep "AVAILABLE TOOLS" .claude/templates/spawn/*.md` |
| 3 | Hooks registered | `grep "agent-definition-check" .claude/settings.json` |
| 4 | All agents validated | `node agent-definition-validator.cjs --all` |
| 5 | Router uses assembler | `grep "assembleSpawnPrompt" .claude/CLAUDE.md` |
| 6 | Tests pass | `npm test -- --grep "Spawn"` |
| 7 | Memory updated | `grep "ADR-066" .claude/context/memory/decisions.md` |

**Overall Success:**
- [ ] Zero "Invalid tool parameters" errors in testing
- [ ] All 45+ agents validated against tool-manifest
- [ ] Spawn prompts contain AVAILABLE_TOOLS section
- [ ] Spawn prompts contain AVAILABLE_SKILLS section
- [ ] Pre-spawn hooks validate tool coherence
- [ ] CI validates agent definitions

---

## Timeline Summary

| Phase | Tasks | Est. Time | Parallel? |
|-------|-------|-----------|-----------|
| 1 | 4 | 3.5 hours | No |
| 2 | 5 | 5 hours | Partial |
| 3 | 4 | 4 hours | Yes |
| 4 | 5 | 4 hours | Yes |
| 5 | 3 | 3 hours | No |
| 6 | 3 | 3.5 hours | Yes |
| 7 | 3 | 2 hours | Yes |
| **Total** | **27** | **~20 hours** | |

**With Parallelization**: ~16 hours (2 developers)

---

## Related Documentation

- ADR-051: Tool Availability Validation Hook
- ADR-043: MCP Tool Removal from Spawn Templates
- TOOL-001: Tool Availability Documentation Drift (issues.md)
- CLAUDE.md Section 1.4: Tools Reference
- skill-catalog.md: Full skill inventory

---

## Appendix: Research Sources

1. **AutoGPT Plugin Architecture** - github.com/Significant-Gravitas/Auto-GPT
2. **CrewAI Agent Framework** - docs.crewai.com
3. **LangChain Tools Documentation** - python.langchain.com/docs/modules/agents/tools
4. **Microsoft Semantic Kernel** - learn.microsoft.com/semantic-kernel
5. **Microsoft AutoGen** - github.com/microsoft/autogen

---

*Plan generated by Planner Agent using plan-generator skill*
*Constitution checkpoint passed: Research complete (5 sources), technical feasibility validated, security reviewed*
