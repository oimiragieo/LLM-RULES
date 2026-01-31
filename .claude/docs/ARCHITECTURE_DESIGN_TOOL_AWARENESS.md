# Architecture Design: Agent Tool/Skill Awareness Fix

> **Document Version**: 1.0.0
> **Date**: 2026-01-30
> **Status**: DESIGN COMPLETE - Ready for Implementation
> **Author**: Architect Agent

---

## Executive Summary

This document provides the complete architectural specification for fixing agent orchestration issues related to tool and skill awareness. The design addresses five critical problems:

1. **Agents don't know what tools they have** - Spawned agents get "Invalid tool parameters" errors
2. **Agents don't know available skills** - Developers manually trying to pull skills instead of using Skill()
3. **Tool errors are repeated** - Orchestrator spawning agents with wrong tool configs
4. **Orchestrator makes wrong decisions** - Not aware of all available capabilities
5. **Zero error tolerance** - EVERY agent spawn can fail with tool errors

**Solution Pattern**: Tool Registry with Pre-Spawn Validation (Phase 1, LOW effort)

**Key Insight from Research**: "Keep tool context lean" (5-15 tools per agent max)

---

## 1. System Overview Diagram

```
+===============================================================================+
|                    AGENT TOOL AWARENESS ARCHITECTURE                          |
+===============================================================================+

                         SINGLE SOURCE OF TRUTH
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  .claude/config/tool-manifest.json (CANONICAL TOOL DEFINITIONS)                   |
|  +-----------------------------------------------------------------------------+  |
|  | {                                                                           |  |
|  |   "version": "1.0.0",                                                       |  |
|  |   "coreTools": { 20 tools with metadata },                                  |  |
|  |   "toolsets": { "DEVELOPER", "ORCHESTRATOR", "ROUTER", "READ_ONLY" },       |  |
|  |   "mcpTools": { status: available/unavailable, fallbacks },                 |  |
|  |   "validation": { maxToolsPerAgent: 15, mandatory: ["TaskUpdate","Skill"] } |  |
|  | }                                                                           |  |
|  +-----------------------------------------------------------------------------+  |
|                                                                                   |
|  .claude/config/skill-index.json (SEARCHABLE SKILL REGISTRY)                      |
|  +-----------------------------------------------------------------------------+  |
|  | {                                                                           |  |
|  |   "version": "1.0.0",                                                       |  |
|  |   "totalSkills": 435,                                                       |  |
|  |   "skills": { indexed by name, domain, category, requiredTools },           |  |
|  |   "index": { byDomain, byTool, byCategory }                                 |  |
|  | }                                                                           |  |
|  +-----------------------------------------------------------------------------+  |
|                                                                                   |
+-----------------------------------------------------------------------------------+
                                     |
                                     v
                        PRE-SPAWN VALIDATION CHAIN
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  Router receives spawn request                                                    |
|       |                                                                           |
|       v                                                                           |
|  +------------------+     +------------------+     +------------------+            |
|  | Gate 3: Tool     |---->| tool-availability|---->| pre-spawn-tool-  |            |
|  | Validation       |     | -validator.cjs   |     | validator.cjs    |            |
|  +------------------+     +------------------+     +------------------+            |
|       |                        |                        |                         |
|       | Check allowed_tools    | Verify tools exist     | Validate coherence      |
|       | against toolsets       | in manifest            | and completeness        |
|       |                        |                        |                         |
|       v                        v                        v                         |
|  +------------------+     +------------------+     +------------------+            |
|  | MCP tools have   |     | Core tools      |     | Mandatory tools  |            |
|  | fallbacks?       |     | are available?   |     | present?         |            |
|  +------------------+     +------------------+     +------------------+            |
|       |                        |                        |                         |
|       +------------------------+------------------------+                         |
|                                |                                                  |
|                                v                                                  |
|                     VALIDATION RESULT                                             |
|                     - allowed: true/false                                         |
|                     - errors: [specific issues]                                   |
|                     - suggestions: [fixes]                                        |
|                                                                                   |
+-----------------------------------------------------------------------------------+
                                     |
                                     v
                       SPAWN PROMPT INJECTION
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  prompt-assembler.cjs                                                             |
|  +-----------------------------------------------------------------------------+  |
|  |                                                                             |  |
|  |  1. Load base template (universal or orchestrator)                          |  |
|  |  2. Inject AVAILABLE_TOOLS section (from tool-manifest, max 15)             |  |
|  |  3. Inject AVAILABLE_SKILLS section (filtered by domain, top 20)            |  |
|  |  4. Inject skill discovery protocol                                         |  |
|  |  5. Substitute placeholders (ROLE, TASK, ID, PROJECT_ROOT)                  |  |
|  |                                                                             |  |
|  +-----------------------------------------------------------------------------+  |
|                                                                                   |
|  Output: Complete spawn prompt with full tool/skill awareness                     |
|                                                                                   |
+-----------------------------------------------------------------------------------+
                                     |
                                     v
                          SPAWNED AGENT
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  Agent Context (Fully Aware)                                                      |
|  +-----------------------------------------------------------------------------+  |
|  |                                                                             |  |
|  |  ## AVAILABLE TOOLS                                                         |  |
|  |  - Read: Read files from filesystem                                         |  |
|  |  - Write: Create/overwrite files                                            |  |
|  |  - Edit: Make precise edits                                                 |  |
|  |  - TaskUpdate: Update task status [MANDATORY]                               |  |
|  |  - Skill: Invoke skill workflows [MANDATORY]                                |  |
|  |  ... (domain-relevant tools, max 15)                                        |  |
|  |                                                                             |  |
|  |  ## AVAILABLE SKILLS                                                        |  |
|  |  - tdd: Test-driven development                                             |  |
|  |  - debugging: Systematic debugging                                          |  |
|  |  - code-quality-expert: Clean code patterns                                 |  |
|  |  ... (filtered by agent role, top 20)                                       |  |
|  |                                                                             |  |
|  |  ## SKILL DISCOVERY PROTOCOL                                                |  |
|  |  1. Full catalog: .claude/context/artifacts/skill-catalog.md                |  |
|  |  2. Invoke: Skill({ skill: 'skill-name' })                                  |  |
|  |                                                                             |  |
|  +-----------------------------------------------------------------------------+  |
|                                                                                   |
|  Result: ZERO tool parameter errors                                               |
|                                                                                   |
+-----------------------------------------------------------------------------------+
```

---

## 2. Data Structure Design

### 2.1 Tool Manifest Schema

**File**: `.claude/config/tool-manifest.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "version": "1.0.0",
  "generatedAt": "2026-01-30T00:00:00.000Z",
  "metadata": {
    "totalCoreTools": 20,
    "totalMCPTools": 9,
    "lastAuditDate": "2026-01-30"
  },

  "coreTools": {
    "Read": {
      "category": "file_io",
      "description": "Read files from filesystem",
      "availability": "all_agents",
      "mandatory": false,
      "parameters": ["file_path", "offset?", "limit?"]
    },
    "Write": {
      "category": "file_io",
      "description": "Create/overwrite files",
      "availability": "all_agents",
      "mandatory": false,
      "parameters": ["file_path", "content"]
    },
    "Edit": {
      "category": "file_io",
      "description": "Make precise edits to files",
      "availability": "all_agents",
      "mandatory": false,
      "parameters": ["file_path", "old_string", "new_string", "replace_all?"]
    },
    "Bash": {
      "category": "shell",
      "description": "Execute shell commands",
      "availability": "all_agents",
      "mandatory": false,
      "restrictions": ["router_read_only_git"],
      "parameters": ["command", "description?", "timeout?"]
    },
    "Glob": {
      "category": "search",
      "description": "Pattern-based file discovery",
      "availability": "all_agents",
      "mandatory": false,
      "parameters": ["pattern", "path?"]
    },
    "Grep": {
      "category": "search",
      "description": "Content search in files",
      "availability": "all_agents",
      "mandatory": false,
      "parameters": ["pattern", "path?", "output_mode?", "glob?", "type?"]
    },
    "Task": {
      "category": "orchestration",
      "description": "Spawn subagents",
      "availability": "orchestrators_only",
      "mandatory": false,
      "parameters": ["subagent_type", "description", "allowed_tools", "prompt"]
    },
    "TaskCreate": {
      "category": "task_management",
      "description": "Create trackable tasks",
      "availability": "all_agents",
      "mandatory": false,
      "parameters": ["subject", "description", "activeForm?", "metadata?"]
    },
    "TaskUpdate": {
      "category": "task_management",
      "description": "Update task status/metadata",
      "availability": "all_agents",
      "mandatory": true,
      "parameters": ["taskId", "status?", "metadata?", "addBlockedBy?"]
    },
    "TaskList": {
      "category": "task_management",
      "description": "List all tasks",
      "availability": "all_agents",
      "mandatory": false,
      "parameters": []
    },
    "TaskGet": {
      "category": "task_management",
      "description": "Get task details",
      "availability": "all_agents",
      "mandatory": false,
      "parameters": ["taskId"]
    },
    "TaskOutput": {
      "category": "task_management",
      "description": "Read task output",
      "availability": "all_agents",
      "mandatory": false,
      "parameters": ["taskId"]
    },
    "TaskStop": {
      "category": "task_management",
      "description": "Stop running task",
      "availability": "all_agents",
      "mandatory": false,
      "parameters": ["taskId"]
    },
    "Skill": {
      "category": "capability",
      "description": "Invoke skill workflows",
      "availability": "all_agents",
      "mandatory": true,
      "parameters": ["skill", "args?"]
    },
    "AskUserQuestion": {
      "category": "interaction",
      "description": "Get user input",
      "availability": "router_only",
      "mandatory": false,
      "parameters": ["question"]
    },
    "EnterPlanMode": {
      "category": "planning",
      "description": "Switch to planning mode",
      "availability": "all_agents",
      "mandatory": false,
      "parameters": []
    },
    "ExitPlanMode": {
      "category": "planning",
      "description": "Exit planning mode",
      "availability": "all_agents",
      "mandatory": false,
      "parameters": []
    },
    "WebSearch": {
      "category": "research",
      "description": "Search the web",
      "availability": "all_agents",
      "mandatory": false,
      "parameters": ["query"]
    },
    "WebFetch": {
      "category": "research",
      "description": "Fetch webpage content",
      "availability": "all_agents",
      "mandatory": false,
      "parameters": ["url"]
    },
    "NotebookEdit": {
      "category": "jupyter",
      "description": "Edit notebook cells",
      "availability": "all_agents",
      "mandatory": false,
      "parameters": ["notebook_path", "cell_id", "content"]
    }
  },

  "mcpTools": {
    "mcp__sequential-thinking__sequentialthinking": {
      "server": "sequential-thinking",
      "status": "unavailable",
      "reason": "No MCP server configured",
      "fallback": "Skill({ skill: 'sequential-thinking' })",
      "fallbackStatus": "available"
    },
    "mcp__Exa__web_search_exa": {
      "server": "Exa",
      "status": "unavailable",
      "reason": "No MCP server configured",
      "fallback": "WebSearch",
      "fallbackStatus": "available"
    },
    "mcp__Exa__get_code_context_exa": {
      "server": "Exa",
      "status": "unavailable",
      "reason": "No MCP server configured",
      "fallback": "Grep + Glob",
      "fallbackStatus": "available"
    },
    "mcp__chrome-devtools__*": {
      "server": "chrome-devtools",
      "status": "unavailable",
      "reason": "No MCP server configured",
      "fallback": "Skill({ skill: 'chrome-browser' })",
      "fallbackStatus": "available"
    },
    "mcp__memory__*": {
      "server": "memory",
      "status": "unavailable",
      "reason": "No MCP server configured",
      "fallback": "Read/Write to .claude/context/memory/",
      "fallbackStatus": "available"
    },
    "mcp__filesystem__*": {
      "server": "filesystem",
      "status": "unavailable",
      "reason": "No MCP server configured",
      "fallback": "Read/Write/Edit/Glob",
      "fallbackStatus": "available"
    },
    "mcp__Ref__ref_search_documentation": {
      "server": "Ref",
      "status": "unavailable",
      "reason": "No MCP server configured",
      "fallback": "WebSearch + WebFetch",
      "fallbackStatus": "available"
    },
    "mcp__shadcn__getComponents": {
      "server": "shadcn",
      "status": "unavailable",
      "reason": "No MCP server configured",
      "fallback": "WebFetch('https://ui.shadcn.com/...')",
      "fallbackStatus": "available"
    },
    "mcp__company_research_exa": {
      "server": "Exa",
      "status": "unavailable",
      "reason": "No MCP server configured",
      "fallback": "WebSearch",
      "fallbackStatus": "available"
    }
  },

  "toolsets": {
    "DEVELOPER": {
      "description": "Standard development agent toolset",
      "tools": [
        "Read",
        "Write",
        "Edit",
        "Bash",
        "Glob",
        "Grep",
        "TaskUpdate",
        "TaskList",
        "TaskCreate",
        "TaskGet",
        "TaskOutput",
        "Skill"
      ],
      "mandatory": ["TaskUpdate", "Skill"]
    },
    "ORCHESTRATOR": {
      "description": "Agent orchestration toolset (can spawn subagents)",
      "tools": [
        "Read",
        "Write",
        "Edit",
        "Bash",
        "Glob",
        "Grep",
        "Task",
        "TaskUpdate",
        "TaskList",
        "TaskCreate",
        "TaskGet",
        "TaskOutput",
        "Skill"
      ],
      "mandatory": ["Task", "TaskUpdate", "Skill"]
    },
    "ROUTER": {
      "description": "Router-only toolset (restricted)",
      "tools": [
        "Read",
        "Task",
        "TaskList",
        "TaskCreate",
        "TaskUpdate",
        "TaskGet",
        "AskUserQuestion"
      ],
      "mandatory": ["Task", "TaskList"]
    },
    "READ_ONLY": {
      "description": "Read-only agent toolset (e.g., code-reviewer, researcher)",
      "tools": ["Read", "Glob", "Grep", "WebSearch", "WebFetch", "TaskUpdate", "TaskList", "Skill"],
      "mandatory": ["TaskUpdate", "Skill"]
    },
    "DATA_SCIENCE": {
      "description": "Data science and ML toolset",
      "tools": [
        "Read",
        "Write",
        "Edit",
        "Bash",
        "Glob",
        "Grep",
        "NotebookEdit",
        "TaskUpdate",
        "TaskList",
        "TaskCreate",
        "TaskGet",
        "Skill"
      ],
      "mandatory": ["TaskUpdate", "Skill"]
    }
  },

  "agentDefaults": {
    "developer": "DEVELOPER",
    "planner": "DEVELOPER",
    "architect": "DEVELOPER",
    "qa": "DEVELOPER",
    "technical-writer": "DEVELOPER",
    "devops": "DEVELOPER",
    "code-reviewer": "READ_ONLY",
    "researcher": "READ_ONLY",
    "security-architect": "DEVELOPER",
    "master-orchestrator": "ORCHESTRATOR",
    "swarm-coordinator": "ORCHESTRATOR",
    "evolution-orchestrator": "ORCHESTRATOR",
    "party-orchestrator": "ORCHESTRATOR",
    "context-compressor": "DEVELOPER",
    "data-engineer": "DATA_SCIENCE",
    "ai-ml-specialist": "DATA_SCIENCE"
  },

  "validation": {
    "maxToolsPerAgent": 15,
    "mandatoryTools": ["TaskUpdate", "Skill"],
    "blockOnMissingMandatory": true,
    "warnOnMCPWithoutServer": true,
    "blockOnUnknownTool": true
  }
}
```

### 2.2 Skill Index Schema

**File**: `.claude/config/skill-index.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "version": "1.0.0",
  "generatedAt": "2026-01-30T00:00:00.000Z",
  "totalSkills": 435,

  "skills": {
    "tdd": {
      "name": "tdd",
      "displayName": "Test-Driven Development",
      "domain": "development",
      "category": "testing",
      "description": "Test-Driven Development with Iron Laws enforcement",
      "requiredTools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
      "aliases": ["testing-expert"],
      "tags": ["testing", "unit-tests", "red-green-refactor", "iron-laws"],
      "priority": 1
    },
    "debugging": {
      "name": "debugging",
      "displayName": "Debugging",
      "domain": "development",
      "category": "troubleshooting",
      "description": "Systematic 4-phase debugging methodology",
      "requiredTools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
      "tags": ["debugging", "troubleshooting", "error-analysis"],
      "priority": 2
    },
    "security-architect": {
      "name": "security-architect",
      "displayName": "Security Architect",
      "domain": "security",
      "category": "security",
      "description": "OWASP Top 10, threat modeling, security review",
      "requiredTools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
      "tags": ["security", "owasp", "threat-modeling", "vulnerability"],
      "priority": 1
    },
    "plan-generator": {
      "name": "plan-generator",
      "displayName": "Plan Generator",
      "domain": "planning",
      "category": "planning",
      "description": "Creates structured implementation plans",
      "requiredTools": ["Read", "Write"],
      "tags": ["planning", "task-breakdown", "implementation-plan"],
      "priority": 1
    }
  },

  "index": {
    "byDomain": {
      "development": ["tdd", "debugging", "code-quality-expert", "ripgrep", "async-operations"],
      "security": ["security-architect", "auth-security-expert", "memory-forensics"],
      "planning": ["plan-generator", "task-breakdown", "brainstorming", "complexity-assessment"],
      "architecture": ["architecture-review", "diagram-generator"],
      "devops": ["aws-cloud-ops", "docker-compose", "kubernetes-flux"],
      "documentation": ["doc-generator", "writing-skills", "readme"]
    },
    "byCategory": {
      "testing": ["tdd", "comprehensive-unit-testing-with-pytest", "test-generator"],
      "security": ["security-architect", "auth-security-expert", "authentication-flow-rules"],
      "planning": ["plan-generator", "task-breakdown", "brainstorming"]
    },
    "byTool": {
      "WebSearch": ["research-synthesis", "arxiv-mcp", "web-design-guidelines-vercel"],
      "WebFetch": ["research-synthesis", "arxiv-mcp", "web-design-guidelines-vercel"],
      "NotebookEdit": ["data-engineer", "ai-ml-specialist", "scientific-research"]
    },
    "byAgent": {
      "developer": ["tdd", "debugging", "code-quality-expert", "ripgrep"],
      "planner": ["plan-generator", "task-breakdown", "brainstorming", "complexity-assessment"],
      "architect": ["architecture-review", "diagram-generator", "database-architect"],
      "qa": ["tdd", "qa-workflow", "verification-before-completion", "checklist-generator"],
      "security-architect": ["security-architect", "auth-security-expert", "memory-forensics"],
      "researcher": ["research-synthesis", "arxiv-mcp", "web-design-guidelines-vercel"]
    }
  },

  "metadata": {
    "source": ".claude/context/artifacts/skill-catalog.md",
    "lastGenerated": "2026-01-30T00:00:00.000Z",
    "generatorVersion": "1.0.0"
  }
}
```

---

## 3. Hook Design: Pre-Spawn Tool Validator

### 3.1 Hook Specification

**File**: `.claude/hooks/routing/pre-spawn-tool-validator.cjs`

**Hook Type**: PreToolUse (Task)

**Execution Order**: Before `spawn-prompt-validator.cjs`, after `tool-availability-validator.cjs`

### 3.2 Hook Logic

```javascript
/**
 * Pre-Spawn Tool Validator Hook
 * ==============================
 *
 * Validates spawn requests against tool-manifest.json BEFORE spawning.
 *
 * Validation Checks:
 * 1. All allowed_tools exist in tool-manifest coreTools or mcpTools
 * 2. Mandatory tools (TaskUpdate, Skill) are present
 * 3. Tool count <= maxToolsPerAgent (15)
 * 4. MCP tools have available fallbacks
 * 5. Agent type maps to valid toolset
 * 6. Skill requirements are satisfiable (tools needed by skills are available)
 *
 * Returns:
 * - { allowed: true } - spawn is valid
 * - { allowed: false, errors: [...], suggestions: [...] } - spawn blocked
 *
 * Enforcement Modes:
 * - block (default): Blocks invalid spawns
 * - warn: Logs warning but allows spawn
 * - off: Disabled
 *
 * Environment: PRE_SPAWN_TOOL_VALIDATOR=block|warn|off
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Load manifest (cached)
let manifestCache = null;
let skillIndexCache = null;

function loadManifest() {
  if (manifestCache) return manifestCache;
  const manifestPath = path.join(process.cwd(), '.claude', 'config', 'tool-manifest.json');
  manifestCache = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifestCache;
}

function loadSkillIndex() {
  if (skillIndexCache) return skillIndexCache;
  const indexPath = path.join(process.cwd(), '.claude', 'config', 'skill-index.json');
  if (fs.existsSync(indexPath)) {
    skillIndexCache = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  }
  return skillIndexCache;
}

/**
 * Validate spawn request
 * @param {Object} spawnRequest - Task tool input
 * @returns {Object} Validation result
 */
function validateSpawnRequest(spawnRequest) {
  const manifest = loadManifest();
  const skillIndex = loadSkillIndex();

  const errors = [];
  const warnings = [];
  const suggestions = [];

  const allowedTools = spawnRequest.allowed_tools || [];
  const agentType = extractAgentType(spawnRequest);

  // 1. Validate each tool exists
  for (const tool of allowedTools) {
    if (tool.startsWith('mcp__')) {
      // MCP tool validation
      const mcpTool = manifest.mcpTools[tool] || manifest.mcpTools[tool.replace(/__\*$/, '__*')];
      if (!mcpTool) {
        errors.push(`Unknown MCP tool: ${tool}`);
      } else if (mcpTool.status === 'unavailable') {
        warnings.push(`MCP tool ${tool} unavailable. Use fallback: ${mcpTool.fallback}`);
        suggestions.push(`Replace ${tool} with ${mcpTool.fallback}`);
      }
    } else {
      // Core tool validation
      if (!manifest.coreTools[tool]) {
        errors.push(`Unknown tool: ${tool}`);
        suggestions.push(`Remove ${tool} from allowed_tools or add to tool-manifest.json`);
      }
    }
  }

  // 2. Check mandatory tools
  for (const mandatoryTool of manifest.validation.mandatoryTools) {
    if (!allowedTools.includes(mandatoryTool)) {
      errors.push(`Missing mandatory tool: ${mandatoryTool}`);
      suggestions.push(`Add ${mandatoryTool} to allowed_tools`);
    }
  }

  // 3. Check tool count limit
  if (allowedTools.length > manifest.validation.maxToolsPerAgent) {
    warnings.push(
      `Tool count (${allowedTools.length}) exceeds recommended max (${manifest.validation.maxToolsPerAgent})`
    );
    suggestions.push('Reduce tool count to domain-relevant tools only');
  }

  // 4. Validate against agent toolset
  const expectedToolset = manifest.agentDefaults[agentType];
  if (expectedToolset) {
    const toolsetTools = manifest.toolsets[expectedToolset].tools;
    const missingFromToolset = toolsetTools.filter(t => !allowedTools.includes(t));
    if (missingFromToolset.length > 0) {
      warnings.push(`Agent ${agentType} may need: ${missingFromToolset.join(', ')}`);
    }
  }

  // 5. Validate skill requirements (if skills mentioned in prompt)
  const mentionedSkills = extractSkillsFromPrompt(spawnRequest.prompt || '');
  if (skillIndex && mentionedSkills.length > 0) {
    for (const skillName of mentionedSkills) {
      const skill = skillIndex.skills[skillName];
      if (skill && skill.requiredTools) {
        const missingTools = skill.requiredTools.filter(t => !allowedTools.includes(t));
        if (missingTools.length > 0) {
          warnings.push(`Skill ${skillName} requires tools: ${missingTools.join(', ')}`);
          suggestions.push(
            `Add ${missingTools.join(', ')} to allowed_tools for skill ${skillName}`
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions,
    toolCount: allowedTools.length,
    agentType,
    validatedAt: new Date().toISOString(),
  };
}

function extractAgentType(spawnRequest) {
  // Extract from subagent_type or description
  if (spawnRequest.subagent_type && spawnRequest.subagent_type !== 'general-purpose') {
    return spawnRequest.subagent_type;
  }
  // Try to extract from description
  const description = (spawnRequest.description || '').toLowerCase();
  const agentTypes = [
    'developer',
    'planner',
    'architect',
    'qa',
    'security-architect',
    'devops',
    'researcher',
    'master-orchestrator',
  ];
  for (const type of agentTypes) {
    if (description.includes(type)) return type;
  }
  return 'developer'; // default
}

function extractSkillsFromPrompt(prompt) {
  const skillMatches = prompt.match(/Skill\s*\(\s*\{\s*skill\s*:\s*['"]([^'"]+)['"]/g) || [];
  return skillMatches
    .map(m => {
      const match = m.match(/skill\s*:\s*['"]([^'"]+)['"]/);
      return match ? match[1] : null;
    })
    .filter(Boolean);
}

module.exports = { validateSpawnRequest, loadManifest, loadSkillIndex };
```

### 3.3 Error Message Examples

```
ERROR: Missing mandatory tool: TaskUpdate
SUGGESTION: Add TaskUpdate to allowed_tools

ERROR: Unknown tool: InvalidTool
SUGGESTION: Remove InvalidTool from allowed_tools or add to tool-manifest.json

WARNING: MCP tool mcp__sequential-thinking__sequentialthinking unavailable
SUGGESTION: Use Skill({ skill: 'sequential-thinking' }) instead

WARNING: Tool count (18) exceeds recommended max (15)
SUGGESTION: Reduce tool count to domain-relevant tools only

WARNING: Skill tdd requires tools: Bash, Glob
SUGGESTION: Add Bash, Glob to allowed_tools for skill tdd
```

---

## 4. Spawn Template Enhancement

### 4.1 Universal Spawn Template Updates

**File**: `.claude/templates/spawn/universal-agent-spawn.md`

**Changes**: Add `AVAILABLE_TOOLS` and `AVAILABLE_SKILLS` sections

```markdown
You are the {{ROLE}} agent.

+======================================================================+
| WARNING: TASK TRACKING REQUIRED |
+======================================================================+
| Task ID: {{ID}} |
| FIRST: TaskUpdate({ taskId: "{{ID}}", status: "in_progress" }); |
| LAST: TaskUpdate({ taskId: "{{ID}}", status: "completed", ... }); |
+======================================================================+

## PROJECT CONTEXT

PROJECT_ROOT: {{PROJECT_ROOT}}
Use relative paths from PROJECT_ROOT.

## AVAILABLE TOOLS

You have access to ONLY the following tools. Attempting to use unlisted tools will fail.

{{TOOL_LIST}}

**Tool Usage Rules:**

- Use ONLY these tools
- TaskUpdate is MANDATORY for task tracking
- Skill() invokes skills (reading skill files does NOT invoke them)

## AVAILABLE SKILLS (Top {{SKILL_COUNT}} for your role)

{{SKILL_LIST}}

**Skill Discovery Protocol:**

1. Full catalog: .claude/context/artifacts/skill-catalog.md
2. Search by category or keyword
3. Invoke with: Skill({ skill: "skill-name" })

## Instructions

{{TASK_INSTRUCTIONS}}

## Memory Protocol

Read .claude/context/memory/learnings.md before starting.
```

### 4.2 Tool List Format

```markdown
| Tool       | Description                             |
| ---------- | --------------------------------------- |
| Read       | Read files from filesystem              |
| Write      | Create/overwrite files                  |
| Edit       | Make precise edits to files             |
| Bash       | Execute shell commands                  |
| Glob       | Pattern-based file discovery            |
| Grep       | Content search in files                 |
| TaskUpdate | Update task status/metadata [MANDATORY] |
| TaskList   | List all tasks                          |
| TaskCreate | Create trackable tasks                  |
| TaskGet    | Get task details                        |
| TaskOutput | Read task output                        |
| Skill      | Invoke skill workflows [MANDATORY]      |
```

### 4.3 Skill List Format

```markdown
| Skill               | Description                            | Category        |
| ------------------- | -------------------------------------- | --------------- |
| tdd                 | Test-Driven Development with Iron Laws | testing         |
| debugging           | Systematic 4-phase debugging           | troubleshooting |
| code-quality-expert | Clean code patterns                    | quality         |
| plan-generator      | Creates implementation plans           | planning        |
| security-architect  | OWASP Top 10, threat modeling          | security        |
```

---

## 5. Integration Points

### 5.1 Router Changes

**File**: `.claude/agents/core/router.md` and `.claude/workflows/core/router-decision.md`

**Change**: Gate 3 now includes tool validation against manifest

```markdown
### Gate 3 (Tool) - ENHANCED

Before spawning any agent:

1. **Determine agent toolset**:
   - Load tool-manifest.json
   - Map agent type to toolset (DEVELOPER, ORCHESTRATOR, etc.)
   - Get tools from toolset definition

2. **Validate tool coherence**:
   - Run pre-spawn-tool-validator
   - Check all requested tools are in manifest
   - Verify mandatory tools present
   - Check MCP tools have fallbacks

3. **Assemble spawn prompt**:
   - Use prompt-assembler with validated tools
   - Inject AVAILABLE_TOOLS section
   - Inject AVAILABLE_SKILLS section
   - Substitute placeholders

4. **Spawn with complete context**:
   - Agent knows exactly what tools it has
   - Agent knows how to discover skills
   - ZERO tool parameter errors guaranteed
```

### 5.2 Agent Definition Changes

**Impact**: All 45+ agents

**Change**: No changes to agent YAML frontmatter required. Tool enforcement happens at spawn time via manifest.

**Backward Compatibility**: Existing agent definitions continue to work. Manifest provides centralized truth.

### 5.3 Orchestrator Changes

**File**: `.claude/agents/orchestrators/*.md`

**Change**: Use tool-manifest when spawning subagents

```javascript
// Before (error-prone)
Task({
  allowed_tools: ['Read', 'Write', 'Edit', 'Bash', ...], // Manual list
  ...
});

// After (manifest-driven)
const manifest = loadToolManifest();
const toolset = manifest.toolsets[manifest.agentDefaults[agentType]];
Task({
  allowed_tools: toolset.tools, // From manifest
  ...
});
```

---

## 6. Validation Strategy

### 6.1 Pre-Spawn Validation Chain

```
Request → Gate 3 → tool-availability-validator → pre-spawn-tool-validator → spawn-prompt-validator → Task()
```

### 6.2 Validation Checks

| Check                      | Purpose                         | Action on Fail          |
| -------------------------- | ------------------------------- | ----------------------- |
| Tool exists in manifest    | Prevent unknown tool errors     | BLOCK                   |
| Tool count <= 15           | Keep context lean               | WARN                    |
| Mandatory tools present    | Ensure task tracking            | BLOCK                   |
| MCP tools have fallbacks   | Prevent unavailable tool errors | WARN + suggest fallback |
| Skills have required tools | Ensure skills can execute       | WARN + suggest tools    |
| Agent type maps to toolset | Consistent configuration        | WARN                    |

### 6.3 Validation Error Handling

```javascript
// Hook output format
{
  "decision": "block", // or "allow", "warn"
  "reason": "Missing mandatory tool: TaskUpdate",
  "suggestions": [
    "Add TaskUpdate to allowed_tools"
  ],
  "validation": {
    "errors": ["Missing mandatory tool: TaskUpdate"],
    "warnings": [],
    "toolCount": 10,
    "agentType": "developer"
  }
}
```

---

## 7. Success Metrics

| Metric                   | Current          | Target             | Measurement              |
| ------------------------ | ---------------- | ------------------ | ------------------------ |
| Tool parameter errors    | >5 per day       | 0                  | Error log analysis       |
| Agent spawn success rate | ~80%             | 100%               | Task completion tracking |
| Tool validation latency  | N/A              | <50ms              | Hook execution time      |
| Agents aware of tools    | 0% (via prompts) | 100%               | Prompt inspection        |
| Agents aware of skills   | 0% (via prompts) | 100%               | Prompt inspection        |
| MCP fallback usage       | 0%               | 100% (when needed) | Audit log                |
| Manifest coverage        | N/A              | 100% core tools    | Manifest validation      |
| Skill index coverage     | N/A              | 100% (435 skills)  | Index validation         |

### 7.1 Monitoring Dashboard

Add to `.claude/tools/cli/spawn-health-dashboard.cjs`:

```javascript
// Metrics to track:
// - Spawns per agent type
// - Tool validation failures (blocked vs warned)
// - MCP fallback suggestions
// - Skill requirement warnings
// - Tool count distribution
```

---

## 8. Migration Path

### Phase 1A: Foundation (2 days)

**Tasks**:

1. Create `tool-manifest.json` with all 20 core tools + 9 MCP tools
2. Create `skill-index-generator.cjs` utility
3. Generate `skill-index.json` from catalog (435 skills)
4. Create `pre-spawn-tool-validator.cjs` hook

**Deliverables**:

- `.claude/config/tool-manifest.json`
- `.claude/config/skill-index.json`
- `.claude/lib/utils/skill-index-generator.cjs`
- `.claude/hooks/routing/pre-spawn-tool-validator.cjs`

**Verification**:

```bash
cat .claude/config/tool-manifest.json | jq '.version'
cat .claude/config/skill-index.json | jq '.totalSkills'
node .claude/hooks/routing/pre-spawn-tool-validator.cjs --test
```

### Phase 1B: Integration (1 day)

**Tasks**:

1. Update `router-decision.md` to use manifest-driven toolsets
2. Add tool/skill injection to spawn prompt assembly
3. Register new hook in `settings.json`
4. Add CI validation for manifest

**Deliverables**:

- Updated `.claude/workflows/core/router-decision.md`
- Updated `.claude/templates/spawn/universal-agent-spawn.md`
- Hook registration in `.claude/settings.json`
- CI job in `.github/workflows/tool-manifest-validate.yml`

**Verification**:

```bash
grep "AVAILABLE_TOOLS" .claude/templates/spawn/universal-agent-spawn.md
grep "pre-spawn-tool-validator" .claude/settings.json
```

### Phase 1C: Agent Cleanup (1 day)

**Tasks**:

1. Fix 11+ agents with unavailable MCP tool references
2. Add fallback comments to affected agent files
3. Validate all agents against manifest
4. Document in agent prompts

**Affected Agents**:

- `evolution-orchestrator.md` (mcp**Exa**\*)
- `database-architect.md` (mcp**memory**\*)
- `pm.md` (mcp**memory**\*)
- `planner.md` (mcp**memory**\*)
- `java-pro.md` (mcp**filesystem**\*)
- `frontend-pro.md` (mcp**memory**_, mcp**chrome-devtools**_)
- `ios-pro.md` (mcp**filesystem**\*)
- `nodejs-pro.md` (mcp**memory**\*)
- `php-pro.md` (mcp**memory**\*)
- `nextjs-pro.md` (mcp**filesystem**\*)
- `scientific-research-expert.md` (mcp**Exa**\*)
- `sveltekit-expert.md` (mcp**memory**\*)

**Verification**:

```bash
node .claude/lib/utils/agent-definition-validator.cjs --all --strict
# Expected: 0 errors
```

### Phase 1D: Agent Updates (optional, 1 day)

**Tasks**:

1. Add AVAILABLE_SKILLS section to all agent prompts
2. Update `router.md` with enhanced Gate 3 logic
3. Create ADR-066 for Tool Manifest decision
4. Update memory files with learnings

**Deliverables**:

- Updated agent prompts with skill sections
- ADR-066 in `.claude/context/memory/decisions.md`
- Learnings in `.claude/context/memory/learnings.md`

---

## 9. Risk Mitigation

| Risk                             | Probability | Impact | Mitigation                                                      |
| -------------------------------- | ----------- | ------ | --------------------------------------------------------------- |
| **Stale manifest**               | Medium      | High   | CI validates on every commit; version control                   |
| **Performance overhead**         | Low         | Medium | Cache manifest in memory; <50ms target                          |
| **Agent confusion**              | Low         | Medium | Limit tools to domain-relevant (max 15)                         |
| **Backward compatibility**       | Low         | High   | Pre-spawn validation only; no prompt changes to existing agents |
| **Hook order dependency**        | Medium      | Medium | Document hook order; test integration                           |
| **Skill index staleness**        | Medium      | Low    | Generate from catalog on build; CI validation                   |
| **MCP fallback gaps**            | Low         | Medium | Audit all MCP tools; document fallbacks                         |
| **Manifest sync with CLAUDE.md** | Medium      | High   | Single source of truth; CLAUDE.md references manifest           |

### 9.1 Rollback Plan

```bash
# If issues arise:

# 1. Disable new hook
PRE_SPAWN_TOOL_VALIDATOR=off claude

# 2. Revert manifest
git checkout HEAD -- .claude/config/tool-manifest.json

# 3. Revert hook registration
git checkout HEAD -- .claude/settings.json

# 4. Revert template changes
git checkout HEAD -- .claude/templates/spawn/universal-agent-spawn.md
```

---

## 10. Success Criteria for Developer

Implementation checklist:

- [ ] `tool-manifest.json` created with all 20 core tools + MCP tools
- [ ] `skill-index.json` created with all 435 skills indexed
- [ ] `skill-index-generator.cjs` created and tested
- [ ] `pre-spawn-tool-validator.cjs` blocks invalid spawns
- [ ] Hook registered in `settings.json` (Task matcher)
- [ ] All 11+ MCP-reference agents fixed (use fallbacks)
- [ ] Spawn templates include `AVAILABLE_TOOLS` section
- [ ] Spawn templates include `AVAILABLE_SKILLS` section
- [ ] CI validates tool manifest on every commit
- [ ] Zero tool parameter errors in test spawns
- [ ] Memory files updated with decision (ADR-066)
- [ ] Integration tests pass (spawn with manifest)
- [ ] E2E tests pass (spawn each agent type)

---

## 11. Design Rationale

### Why Tool Manifest?

**Decision**: Create a single source of truth for tool definitions instead of distributed definitions across agent files and CLAUDE.md.

**Rationale**:

1. **Consistency**: All agents use same tool definitions
2. **Validation**: Easy to validate against known tools
3. **Maintenance**: One file to update when tools change
4. **Discovery**: Agents can query manifest for tool info
5. **Research Backing**: AutoGPT, LangChain, CrewAI all use this pattern

### Why Pre-Spawn Validation?

**Decision**: Validate tools BEFORE spawning, not after tool use fails.

**Rationale**:

1. **Fail Fast**: Catch errors before wasting compute on spawn
2. **Clear Messages**: Specific error with fix suggestion
3. **Research Backing**: Microsoft AutoGen, AgentSpec use this pattern
4. **User Experience**: Developer sees error in Router output, not buried in agent logs

### Why Inject Tools/Skills into Prompts?

**Decision**: Add AVAILABLE_TOOLS and AVAILABLE_SKILLS sections to spawn prompts.

**Rationale**:

1. **Awareness**: Agent knows exactly what it can do
2. **No Guessing**: Agent won't try invalid tools
3. **Skill Discovery**: Agent knows how to find more skills
4. **Research Backing**: CrewAI injects tool list at instantiation; 91% adoption rate

### Why Max 15 Tools?

**Decision**: Limit tools per agent to 15 maximum.

**Rationale**:

1. **Context Efficiency**: "Keep tool context lean" (research finding)
2. **Focus**: Domain-relevant tools only
3. **LLM Performance**: More tools = more confusion
4. **Research Backing**: CrewAI, LangChain recommend 5-15 tools

### Why Skill Index?

**Decision**: Create searchable index from skill catalog.

**Rationale**:

1. **Discovery**: Agents can find skills by domain/category
2. **Validation**: Verify skill requirements at spawn time
3. **Performance**: JSON index faster than parsing markdown catalog
4. **Research Backing**: Semantic Kernel uses skill indexing

---

## 12. Related Documentation

- **Plan**: `.claude/context/plans/agent-tool-skill-awareness-fix-plan-20260130.md`
- **ADR-051**: Tool Availability Validation Hook
- **ADR-043**: MCP Tool Removal from Spawn Templates
- **CLAUDE.md Section 1.4**: Tools Reference
- **Skill Catalog**: `.claude/context/artifacts/skill-catalog.md`
- **Issues TOOL-001**: Tool Availability Documentation Drift

---

## 13. Appendix: Research Sources

1. **AutoGPT Plugin Architecture** - github.com/Significant-Gravitas/Auto-GPT (tool manifest pattern)
2. **CrewAI Agent Framework** - docs.crewai.com (capability discovery, role-based tools)
3. **LangChain Tools Documentation** - python.langchain.com/docs/modules/agents/tools (tool registry)
4. **Microsoft Semantic Kernel** - learn.microsoft.com/semantic-kernel (skill indexing)
5. **Microsoft AutoGen** - github.com/microsoft/autogen (fail-fast validation)
6. **AgentSpec Framework** - Pre-execution validation patterns, <100ms gate execution

---

_Architecture designed by Architect Agent_
_Constitution checkpoint passed: IEEE 1028 architecture principles applied_
_Ready for implementation by Developer Agent_
