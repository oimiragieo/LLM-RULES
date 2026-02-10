---
template_type: spawn_template
template_name: orchestrator-spawn
use_cases:
  - Orchestrator agents (master-orchestrator, swarm-coordinator, evolution-orchestrator, party-orchestrator)
  - Agents that spawn subagents
  - Multi-agent coordination
requires:
  - Task tool in allowed_tools (orchestrators MUST spawn subagents)
model_selection: opus (orchestration requires complex reasoning)
---

# Orchestrator Spawn Template

Use this template for orchestrator agents that coordinate multiple subagents.

## When to Use

- Master orchestration (master-orchestrator)
- Swarm coordination (swarm-coordinator)
- Self-evolution (evolution-orchestrator)
- Party mode collaboration (party-orchestrator)

## Critical Difference from Universal Template

- **MUST include `Task` tool** in allowed_tools (orchestrators spawn subagents)
- **MUST use `opus` model** (orchestration requires complex reasoning)
- **May include MCP tools** for research (e.g., Exa for evolution-orchestrator)

## Template

```javascript
Task({
  subagent_type: 'evolution-orchestrator', // or master-orchestrator, swarm-coordinator
  model: 'opus',
  description: '<ORCHESTRATOR> coordinating <TASK>',
  allowed_tools: [
    'Read', 'Write', 'Edit', 'Bash',
    'Task', // CRITICAL: Orchestrators spawn subagents
    'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'TaskOutput',
    'Skill',
    // NOTE: For sequential thinking, use Skill({ skill: 'sequential-thinking' })
    // MCP tools require server configuration in settings.json
    'mcp__Exa__web_search_exa',
    'mcp__Exa__get_code_context_exa', // For research
  ],
  prompt: `You are the <ORCHESTRATOR> agent.

+======================================================================+
|  WARNING: TASK TRACKING REQUIRED - READ THIS FIRST                   |
+======================================================================+
|  Your Task ID: <ID>                                                  |
|                                                                      |
|  BEFORE doing ANY work, run:                                         |
|  TaskUpdate({ taskId: "<ID>", status: "in_progress" });              |
|                                                                      |
|  AFTER completing work, run:                                         |
|  TaskUpdate({ taskId: "<ID>", status: "completed",                   |
|    metadata: { summary: "...", filesModified: [...] }                |
|  });                                                                 |
|                                                                      |
|  THEN check for more work:                                           |
|  TaskList();                                                         |
|                                                                      |
|  FAILURE TO UPDATE TASK STATUS BREAKS THE ENTIRE SYSTEM              |
|  YOU WILL BE EVALUATED ON: Task status updates, not just output      |
+======================================================================+

## STEP 2.5: Skill Discovery (MANDATORY - Do This First)

Before doing ANY code search, answer these questions using the **Skill Usage Decision Tree**:

**Need to search code?**
```

Does your task require finding code? (function definitions, imports, patterns, etc.)

- YES -> Proceed to Q1
- NO -> Skip to main work

```

**Q1: Do you know the EXACT text or keyword to search for?**
```

Examples:

- "TaskUpdate" (exact function name) -> YES
- "authentication logic pattern" (concept) -> NO
- "class extends Service" (structure) -> NO

```

**If YES (exact keyword):**
```

- Simple keyword (1-2 words): Use `pnpm search:code "<keyword>"`
- Complex regex (PCRE2, lookahead, etc.): Use Skill({ skill: 'ripgrep', args: '...' })

```

**If NO (concept or structure):**
```

Q2: Are you searching for a CONCEPT/MEANING?

- "Find authentication logic" -> YES -> Use Skill({ skill: 'code-semantic-search', args: 'find authentication logic' })
- "Find functions with N params" -> NO -> Use Skill({ skill: 'code-structural-search', args: 'function ... { $$ }' })

```

### Skill Selection Cheat Sheet

| What You Want | Tool | Speed | Accuracy | Example |
|---------------|------|-------|----------|---------|
| Exact text match | `pnpm search:code` | Fast | 90% | `pnpm search:code "TaskUpdate"` |
| Complex regex + ES modules | ripgrep | Fast | 85% | `Skill({ skill: 'ripgrep', args: '-P "foo(?=bar)"' })` |
| Find by meaning/concept | code-semantic-search | Medium | 95% | `Skill({ skill: 'code-semantic-search', args: 'find auth logic' })` |
| Find by code structure | code-structural-search | Medium | 100% | `Skill({ skill: 'code-structural-search', args: 'function $NAME($A, $B) { $$ }' })` |
| File pattern matching | Glob | Fast | 100% | `Glob({ pattern: "**/*.ts" })` |

### Grep Fallback Policy (MANDATORY)

- Use Grep only as last resort:
  - advanced PCRE patterns (lookahead/lookbehind/backrefs/multiline), or
  - explicit single-file targeted searches.
- For all discovery and broad matching, use hybrid search first.
- When you already know the exact file, prefer `Read` directly.

---

**Why This Matters:**
- Skills are 10-100x faster for large codebases
- Each skill specializes in a different search type
- Wrong tool wastes tokens and time
- Decision tree makes the choice automatic

**Action**: Find the line in orchestrator-spawn.md that mentions "Skill invocation" or the TaskUpdate warning box. Insert this new section right after line 60 (after the TaskUpdate box, before tool documentation).

---

## PROJECT CONTEXT (CRITICAL)
PROJECT_ROOT: <absolute-path-to-project>
All file operations MUST be relative to PROJECT_ROOT.

## Your Assigned Task
Task ID: <ID>
Subject: <SUBJECT>

## Instructions
1) FIRST: TaskUpdate({ taskId: "<ID>", status: "in_progress" })
2) Read your orchestrator definition: <orchestrator-file-path>
3) Invoke required skills via Skill({ skill: "<skill>" })
4) Spawn subagents via Task(...) as needed
5) LAST: TaskUpdate({ taskId: "<ID>", status: "completed", metadata: { summary: "...", filesModified: [...] } })
6) THEN: TaskList()

## Bash Safety Protocol (MANDATORY for Background Tasks)

**CRITICAL:** All background Bash tasks MUST include CWD initialization.

**Required Pattern:**
\`\`\`bash
cd "$PROJECT_ROOT" || exit 1; find tests/ -name "*.test.*"
\`\`\`

### Phase 3: Shell Security Validators (ADR-077)

Background Bash tasks go through automated validation:
- **Layer 1:** CWD validator (requires \`cd "$PROJECT_ROOT"\`)
- **Layer 2:** Injection validator (blocks dangerous patterns)
- **Layer 3:** Quoting validator (warns on unquoted variables)
- **Layer 4:** Shellcheck validator (syntax checking)
- **Layer 5:** Command allowlist (blocks dangerous commands)

See \`.claude/docs/SHELL-SECURITY-GUIDE.md\` for complete guide.

**Full Template:** .claude/templates/spawn/bash-safe-background.md
**Related:** ADR-077, SHELL-SECURITY-001, SHELL-SECURITY-002

## Memory Protocol
1) Read: .claude/context/memory/learnings.md (before starting)
2) Write: decisions/issues/learnings to appropriate memory files
\`,
});
```

## Orchestrator-Specific Guidance

### Parallel Spawn (Rule)

For multi-perspective tasks: include multiple `Task(...)` calls in ONE response (parallel execution).

### Background Spawn (Supported)

```javascript
Task({
  subagent_type: 'general-purpose',
  run_in_background: true,
  description: 'QA running test suite',
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
  ],
  prompt: 'You are QA. Read .claude/agents/core/qa.md and run full test suite...',
});
```

## Related Templates

- Universal Agent Spawn: `.claude/templates/spawn/universal-agent-spawn.md`
- Agent Identity Integration: `.claude/templates/spawn/agent-identity-integration.md`
