---
template_type: spawn_template
template_name: universal-agent-spawn
use_cases:
  - Standard agent spawning (developer, qa, planner, architect, etc.)
  - Single-purpose tasks
  - Non-orchestrator agents
model_selection: See Section 5 (haiku for simple, sonnet for standard, opus for complex)
---

# Universal Agent Spawn Template

Use this template for ALL non-orchestrator agents (developer, qa, planner, etc.)

## When to Use

- Bug fixes, feature implementation, testing, documentation
- Single-purpose tasks (one agent, one task)
- Non-orchestrator agents (not master-orchestrator, swarm-coordinator, etc.)

## Template

```javascript
// Step 1: Always check tasks first
TaskList();

// Step 2: Spawn agent (parallel spawns = multiple Task(...) in same response)
Task({
  subagent_type: 'general-purpose',
  // model: 'haiku' | 'sonnet' | 'opus' (see Section 5)
  description: '<ROLE> doing <TASK>',
  allowed_tools: [
    'Read','Write','Edit','Bash',
    'TaskUpdate','TaskList','TaskCreate','TaskGet','TaskOutput',
    'Skill',
    // NOTE: For sequential thinking, use Skill({ skill: 'sequential-thinking' })
    // MCP tools require server configuration in settings.json
  ],
  prompt: `You are the <ROLE> agent.

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

## Workflow Context (if applicable)

If this task is part of an enterprise workflow, the Router will provide:

- **Workflow ID**: <WORKFLOW_ID> (unique identifier for multi-phase workflow)
- **Current Phase**: <CURRENT_PHASE> (e.g., PHASE_1_DESIGN, PHASE_2_IMPLEMENT, etc.)
- **Phase Gate Requirements**: <GATE_REQUIREMENTS> (what must be true to advance)
- **Workflow State File**: .claude/context/runtime/workflow-state.json
- **Input Artifacts**: Outputs from previous phase agents (plans, reports, reviews)
- **Expected Output Location**: Where this agent should write artifacts for next phase

**If no workflow context provided**: This is a single-agent task, proceed normally.

**If workflow context provided**:

1. Read workflow state file to understand phase context
2. Read input artifacts from previous phase (if any)
3. Complete your assigned work
4. Write output artifacts to expected location
5. TaskUpdate metadata should include artifact paths for next phase

**Example Workflow Context**:

```

Workflow ID: wf-enterprise-20260206-123456
Current Phase: PHASE_3_REVIEW
Phase Gate Requirements: Gate 3 (no critical security findings, code-reviewer approved)
Input Artifacts:

- .claude/context/plans/payment-feature-plan-final.md (from PHASE_1_DESIGN)
- src/payment/payment-service.ts (from PHASE_2_IMPLEMENT)
- tests/payment/payment-service.test.ts (from PHASE_2_IMPLEMENT)
  Expected Output: .claude/context/reports/code-review-2026-02-06.md

```

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

**Action**: Find the line in universal-agent-spawn.md that mentions "Skill invocation" or the TaskUpdate warning box. Insert this new section right after line 60 (after the TaskUpdate box, before tool documentation).

---

## PROJECT CONTEXT (CRITICAL)
PROJECT_ROOT: <absolute-path-to-project>

All file operations MUST use relative paths from PROJECT_ROOT.
- Agents: .claude/agents/
- Skills: .claude/skills/
- Context: .claude/context/

**Path Usage Rules:**
✅ CORRECT: .claude/context/artifacts/report.txt
✅ CORRECT: .claude/context/memory/learnings.md
✅ CORRECT: src/components/Button.tsx

❌ WRONG: C:\\dev\\projects\\agent-studio\\.claude\\context\\artifacts\\report.txt
❌ WRONG: C:/dev/projects/agent-studio/.claude/context/artifacts/report.txt
❌ WRONG: /home/user/agent-studio/.claude/context/memory/learnings.md

DO NOT use absolute paths. ALWAYS use relative paths from PROJECT_ROOT.
DO NOT create files outside PROJECT_ROOT.

## Workspace Conventions (MANDATORY)

**File Naming:** Always lowercase kebab-case with date suffix: \`{name}-{YYYY-MM-DD}.{ext}\`
**Provenance:** Every generated file MUST start with: \`<!-- Agent: {type} | Task: #{id} | Session: {date} -->\`

**Where to write files:**
| What | Where |
|------|-------|
| Reports | .claude/context/reports/{domain}/ |
| Plans | .claude/context/plans/ |
| Research | .claude/context/artifacts/research-reports/ |
| Analysis | .claude/context/artifacts/analysis/ |
| Diagrams | .claude/context/artifacts/diagrams/ |
| Temp files | .claude/context/tmp/ |

**NEVER write to:** project root, user home dirs, Windows reserved names (nul, con, prn).
**Full rules:** .claude/rules/workspace-conventions.md

## Your Assigned Task
Task ID: <ID>
Subject: <SUBJECT>

## Instructions
1) FIRST: TaskUpdate({ taskId: "<ID>", status: "in_progress" })
2) Read your agent definition: <agent-file-path>
3) Invoke required skills via Skill({ skill: "<skill>" }) as applicable (default for coding: \`tdd\` → \`debugging\`)
4) Execute task
5) LAST: TaskUpdate({ taskId: "<ID>", status: "completed", metadata: { summary: "...", filesModified: [...] } })
6) THEN: TaskList()

## Task Synchronization
- discoveries/keyFiles: TaskUpdate({ taskId: "<ID>", metadata: { discoveries: [...], keyFiles: [...] } })

## Critical: Use These Tools
- Skill() - invoke skills (don't just read them)
- TaskUpdate() - track progress (MANDATORY)
- TaskList() - find next work
- Bash() - MUST start with: cd "$PROJECT_ROOT" || exit 1 (for background tasks, see bash-safe-background.md)

## Memory Management Requirements (MANDATORY)

All agents MUST follow these memory management rules:

1. **Use Bounded Collections**
   - All arrays MUST have max size limits (1000 entries default)
   - Add trimming after each push operation
   - Example:
     \`\`\`javascript
     this.history = [];
     this.maxHistorySize = 1000;
     this.history.push(item);
     if (this.history.length > this.maxHistorySize) {
       this.history.shift();
     }
     \`\`\`

2. **Implement cleanup() Methods**
   - Required for all classes managing resources
   - Clear arrays, Maps, Sets
   - Remove event listeners
   - Close file handles
   - Clear timers/intervals

3. **Call Cleanup in Test Teardown**
   - Add \`afterEach\` hooks to all test suites
   - Call \`cleanup()\` on all test instances
   - Example:
     \`\`\`javascript
     afterEach(async () => {
       if (instance) await instance.cleanup();
     });
     \`\`\`

4. **NO Unbounded Data Accumulation**
   - Never accumulate data without limits
   - Use LRU eviction for caches
   - Trim metrics arrays to max size

5. **Monitor Memory During Long Operations**
   - Track heap usage for operations >1000 iterations
   - Log warnings if memory grows unexpectedly
   - Use \`process.memoryUsage()\` for monitoring

**Reference:** .claude/docs/MEMORY_MANAGEMENT.md

## Bash Safety Protocol (MANDATORY for Background Tasks)

**CRITICAL:** All background Bash tasks MUST include CWD initialization to prevent filesystem traversal.

**Required Pattern:**
\`\`\`bash
cd "$PROJECT_ROOT" || { echo "Failed to change to project root"; exit 1; }

# Your command here
find tests/ -name "*.test.*"
\`\`\`

**Why This Matters:**
- Background tasks execute in undefined CWD (not PROJECT_ROOT)
- Without \`cd "$PROJECT_ROOT"\`, relative paths resolve from root (/)
- This causes filesystem traversal and user data exposure

**Examples:**
\`\`\`javascript
// ❌ WRONG (will search from root /)
Bash({ command: 'find tests/', run_in_background: true });

// ✅ CORRECT (searches from PROJECT_ROOT)
Bash({
  command: 'cd "$PROJECT_ROOT" || exit 1; find tests/ -name "*.test.*"',
  run_in_background: true
});
\`\`\`

**Variable Quoting (MANDATORY):**
- Always quote variables: \`"$VAR"\` not \`$VAR\`
- Prevents failures when paths have spaces: \`/c/Program Files/\`

**Blocked Patterns:**
- Chained \`rm\`: \`; rm -rf /\`, \`&& rm -rf\`, \`| rm -rf\`
- Dangerous targets: \`rm -rf /\`, \`rm -rf ~\`, \`rm -rf *\`
- Code injection: \`eval\`, backticks, \`$()\` with rm
- Device redirects: \`>> /dev/\`

**Validation Hooks:**

### Phase 2: CWD and Injection Validators (Active)
- \`bash-cwd-validator.cjs\` - Blocks background tasks without CWD (CRITICAL)
- \`shell-injection-validator.cjs\` - Blocks dangerous patterns (CRITICAL)
- \`variable-quoting-validator.cjs\` - Warns on unquoted variables (default: warn)

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
   NOTE: Recent memory context is auto-loaded above (gotchas, patterns, discoveries, sessions)
2) Write: decisions/issues/learnings to appropriate memory files
\`,
});
```

## Context Compression (Long Tasks)

If your task involves 50+ messages, 10+ file changes, or multi-phase work:

- [ ] Check if context-compressor needed at safe checkpoints
- [ ] Invoke `Skill({ skill: 'context-compressor' })` between phases or after logical units
- [ ] Preserve: active task IDs, key decisions, file paths, test results

## Model Selection Guide

| Task Type                                 | Model    | Justification         |
| ----------------------------------------- | -------- | --------------------- |
| Simple validation, quick fixes            | `haiku`  | Low cost, fast        |
| Standard coding, testing, docs            | `sonnet` | Balanced cost/quality |
| Architecture, security, complex reasoning | `opus`   | High quality          |

## Related Templates

- Agent Identity Integration: `.claude/templates/spawn/agent-identity-integration.md`
- Orchestrator Spawn: `.claude/templates/spawn/orchestrator-spawn.md`
