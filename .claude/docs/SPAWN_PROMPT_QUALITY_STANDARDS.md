# SPAWN PROMPT QUALITY STANDARDS
## Fixing Validation Score 0/70 Issues
**Date**: 2026-02-05
**Scope**: All Task() calls must meet these standards
**Enforcement**: spawn-prompt-validator hook (default: warn mode)
**Compliance**: All 42 validation failures can be prevented with this guide

---

## QUALITY CHECKLIST (70 Points Total)

### CRITICAL ELEMENTS (Must Have - 40 points)

**1. TaskUpdate Warning Box (20 points)**
```
✓ Include full 70-line warning box from universal-agent-spawn.md
✓ Must start with +======= border
✓ Must include:
  - WARNING header
  - Your Task ID: <ID>
  - BEFORE doing ANY work, run: TaskUpdate({ taskId: "<ID>", status: "in_progress" })
  - AFTER completing work, run: TaskUpdate({ taskId: "<ID>", status: "completed" })
  - FAILURE TO UPDATE TASK STATUS message
✓ Must end with +======= border
```

**2. Task ID Reference (10 points)**
```
✓ Include "Task ID: <ID>" in prompt
✓ Task ID must match the task_id parameter in Task() call
✓ Must be referenced in TaskUpdate calls
✓ Must be in at least 3 places:
  1. In warning box header
  2. In TaskUpdate(in_progress) call
  3. In TaskUpdate(completed) call
```

**3. allowed_tools Array (10 points)**
```
✓ TaskUpdate must be in allowed_tools
✓ TaskList must be in allowed_tools
✓ Other tools based on task needs
✓ Example:
  allowed_tools: [
    'Read', 'Write', 'Edit', 'Bash',
    'TaskUpdate',  // CRITICAL
    'TaskList',    // CRITICAL
    'TaskCreate', 'TaskGet', 'TaskOutput',
    'Skill',
    'Grep', 'Glob' // if needed
  ]
```

### HIGH PRIORITY ELEMENTS (Should Have - 20 points)

**4. PROJECT_ROOT Context (10 points)**
```
✓ Include PROJECT CONTEXT section
✓ Must state PROJECT_ROOT path
✓ Must state working directory
✓ Example:
  ## PROJECT CONTEXT
  - **PROJECT_ROOT**: C:\dev\projects\agent-studio
  - **Working Directory**: Current
  - **Git Branch**: main
```

**5. TaskUpdate Call Instructions (10 points)**
```
✓ Explicit instructions for TaskUpdate calls
✓ Show exact syntax:
  TaskUpdate({ taskId: "TASK-001", status: "in_progress" })
  TaskUpdate({ taskId: "TASK-001", status: "completed", metadata: { ... } })
✓ Explain when to call:
  - BEFORE: TaskUpdate(in_progress)
  - AFTER: TaskUpdate(completed)
✓ Link to task tracking documentation
```

### MEDIUM PRIORITY ELEMENTS (Could Have - 10 points)

**6. Memory Protocol Section (5 points)**
```
✓ Reference to .claude/context/memory/
✓ Mention reading learnings.md, decisions.md, issues.md
✓ Example:
  ## Memory Protocol
  MANDATORY: Read memory files BEFORE starting work:
  - `.claude/context/memory/learnings.md`
  - `.claude/context/memory/decisions.md`
  - `.claude/context/memory/issues.md`
```

**7. Skills Discovery Section (5 points)**
```
✓ Reference Skill() tool usage
✓ Link to skill discovery decision tree
✓ Show examples of when to use skills
✓ Include code search skill recommendations
```

---

## CORRECT SPAWN PROMPT FORMAT

### Minimal (Must Meet CRITICAL Requirements)

```javascript
Task({
  subagent_type: 'developer',
  task_id: 'TASK-001',
  description: 'Developer - Fix bug in auth system',
  allowed_tools: [
    'Read', 'Write', 'Edit', 'Bash',
    'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet',
    'Skill', 'Grep', 'Glob'
  ],
  prompt: `# DEVELOPER - Fix Authentication Bug

## Task ID
**Task ID: TASK-001**

## PROJECT CONTEXT
- **PROJECT_ROOT**: C:\\dev\\projects\\agent-studio
- **Working Directory**: Current

+======================================================================+
|  WARNING: TASK TRACKING REQUIRED - READ THIS FIRST                   |
+======================================================================+
|  Your Task ID: TASK-001                                              |
|                                                                      |
|  BEFORE doing ANY work, run:                                         |
|  TaskUpdate({ taskId: "TASK-001", status: "in_progress" });          |
|                                                                      |
|  AFTER completing work, run:                                         |
|  TaskUpdate({ taskId: "TASK-001", status: "completed",               |
|    metadata: { summary: "...", filesModified: [...] }                |
|  });                                                                 |
|                                                                      |
|  THEN check for more work:                                           |
|  TaskList();                                                         |
|                                                                      |
|  FAILURE TO UPDATE TASK STATUS BREAKS THE ENTIRE SYSTEM              |
|  YOU WILL BE EVALUATED ON: Task status updates, not just output      |
+======================================================================+

## Memory Protocol
MANDATORY: Read memory files BEFORE starting work:
- \`.claude/context/memory/learnings.md\`
- \`.claude/context/memory/decisions.md\`
- \`.claude/context/memory/issues.md\`

## Your Task
Fix the authentication bug in login flow...

## Expected Workflow
1. TaskUpdate({ taskId: "TASK-001", status: "in_progress" })
2. Read learnings.md
3. Investigate bug
4. Implement fix
5. Run tests
6. TaskUpdate({ taskId: "TASK-001", status: "completed" })
`
})
```

### Complete (Maximum Quality - All Elements)

```javascript
Task({
  subagent_type: 'developer',
  task_id: 'TASK-002',
  description: 'Developer - Implement feature X with testing',
  allowed_tools: [
    'Read', 'Write', 'Edit', 'Bash',
    'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'TaskOutput',
    'Skill',
    'Grep', 'Glob'
  ],
  prompt: `# DEVELOPER - Implement Feature X

## Task ID
**Task ID: TASK-002**

## PROJECT CONTEXT
- **PROJECT_ROOT**: C:\\dev\\projects\\agent-studio
- **Git Branch**: feature/implement-x
- **Working Directory**: Current
- **Time Budget**: ~2-3 hours expected

+======================================================================+
|  WARNING: TASK TRACKING REQUIRED - READ THIS FIRST                   |
+======================================================================+
|  Your Task ID: TASK-002                                              |
|                                                                      |
|  CRITICAL REQUIREMENT: You must call TaskUpdate at start & end       |
|                                                                      |
|  STEP 1: Start of work (BEFORE any implementation)                   |
|  TaskUpdate({                                                        |
|    taskId: "TASK-002",                                               |
|    status: "in_progress",                                            |
|    metadata: { phase: "initialization", startTime: Date.now() }      |
|  });                                                                 |
|                                                                      |
|  STEP 2: End of work (AFTER testing passes)                          |
|  TaskUpdate({                                                        |
|    taskId: "TASK-002",                                               |
|    status: "completed",                                              |
|    metadata: {                                                       |
|      summary: "Feature X implemented with tests",                    |
|      filesModified: ["src/x.js", "tests/x.test.js"],                 |
|      testsAdded: 5,                                                  |
|      testsPassed: 5,                                                 |
|      timeTaken: "XXXms"                                              |
|    }                                                                 |
|  });                                                                 |
|                                                                      |
|  THEN: Check for more work                                           |
|  TaskList();                                                         |
|                                                                      |
|  WHY THIS MATTERS:                                                   |
|  Without TaskUpdate calls, the task tracking system cannot:          |
|  - Know if your task is in progress                                  |
|  - Track when you completed work                                     |
|  - Know what files you modified                                      |
|  - Detect task failures or hangs                                     |
|                                                                      |
|  FAILURE TO UPDATE TASK STATUS BREAKS THE ENTIRE SYSTEM              |
|  YOU WILL BE EVALUATED ON: Task status updates, not just output      |
+======================================================================+

## Memory Protocol
MANDATORY: Read memory files BEFORE starting work:
- \`.claude/context/memory/learnings.md\` - Learn from past patterns
- \`.claude/context/memory/decisions.md\` - Understand previous decisions
- \`.claude/context/memory/issues.md\` - Know current blockers

## Skill Discovery (MANDATORY)
Before searching code, answer:
1. Do you know the EXACT text/keyword to find?
   - YES (e.g., "authenticate()") -> Use Grep tool
   - NO -> Use Skill({ skill: 'code-semantic-search' })

2. Searching for architecture/patterns?
   - YES -> Use Skill({ skill: 'code-structural-search' })
   - NO -> Use Grep or Glob

Reference: \`.claude/docs/@SKILL_USAGE_GUIDE.md\`

## Your Task: Implement Feature X

[Detailed task description...]

## Implementation Workflow
1. TaskUpdate({ taskId: "TASK-002", status: "in_progress" })
2. Read memory files
3. Code search (using appropriate skill)
4. Implement feature
5. Write tests (TDD approach)
6. Run pnpm test (verify passing)
7. Run pnpm lint (fix any issues)
8. TaskUpdate({ taskId: "TASK-002", status: "completed" })

## Success Criteria
- Feature fully implemented
- Tests written and passing
- Linting passing (0 errors, 0 warnings)
- Documentation updated
- Memory updated (learnings.md)
`
})
```

---

## INCORRECT EXAMPLES (Score 0/70)

### ❌ Example 1: Minimal Prompt (What Was Happening)
```javascript
Task({
  subagent_type: 'developer',
  task_id: 'TASK-003',
  description: 'Fix issue',
  prompt: `# Fix this issue

Do the thing described above.`
})
```

**Issues**:
- ❌ No TaskUpdate warning box
- ❌ No Task ID reference in prompt
- ❌ No allowed_tools array
- ❌ No PROJECT_ROOT context
- ❌ No memory protocol
- ❌ No skill discovery section
- ❌ Score: 0/70 (FAILS VALIDATION)

### ❌ Example 2: Missing Critical Elements
```javascript
Task({
  subagent_type: 'developer',
  prompt: `# Developer Task

Your task ID is ABC-123. Do this work...

[Actual task description]
`
})
```

**Issues**:
- ❌ Task ID not in warning box
- ❌ No TaskUpdate calls explained
- ❌ TaskUpdate not in allowed_tools
- ❌ No PROJECT_ROOT context
- ❌ No full warning box
- ❌ Score: ~15/70 (FAILS VALIDATION)

---

## VALIDATION CHECKLIST (For Router/Developers)

Before calling Task(), verify:

- [ ] **Task ID**: Set in both task_id parameter AND prompt?
- [ ] **Warning Box**: Full 70-line box included with ======= borders?
- [ ] **TaskUpdate Calls**: Both in_progress and completed shown?
- [ ] **allowed_tools**: Includes TaskUpdate and TaskList?
- [ ] **PROJECT_ROOT**: Context section with path?
- [ ] **Memory Protocol**: Section mentioning learnings/decisions/issues?
- [ ] **Skill Discovery**: Section on code search skills?
- [ ] **Format**: Professional markdown with clear sections?

**All checks must pass before calling Task()**

---

## ENFORCEMENT

### Current Status
- **Validator**: spawn-prompt-validator.cjs (active)
- **Mode**: warn (allows execution, shows warnings)
- **Score Threshold**: 0/70 = FAIL

### How to Check Score
1. Run: `node .claude/hooks/routing/spawn-prompt-validator.cjs`
2. Input: Your spawn prompt
3. Output: Score X/70, specific failures

### How to Override (if needed)
```bash
SPAWN_PROMPT_VALIDATOR=off  # Disable validation (not recommended)
SPAWN_PROMPT_VALIDATOR=warn # Warn only (current)
SPAWN_PROMPT_VALIDATOR=block # Block invalid prompts
```

---

## SUMMARY

### The 42 Failures Can Be Prevented
- **Root Cause**: Not using full universal-agent-spawn.md template
- **Solution**: Always include TaskUpdate warning box + Task ID + PROJECT_ROOT
- **Score Target**: 70/70 (not 0/70)

### Key Takeaways
1. ✅ **Every Task() call needs a warning box** (70 lines)
2. ✅ **Task ID must appear in at least 3 places**
3. ✅ **TaskUpdate and TaskList must be in allowed_tools**
4. ✅ **Memory protocol section is mandatory**
5. ✅ **PROJECT_ROOT context is required**

### Result of Following This Guide
- **Score**: 70/70 (perfect)
- **Task Tracking**: 100% working
- **No Warnings**: Clean execution
- **Proper Completion**: TaskUpdate calls logged correctly

---

**Last Updated**: 2026-02-05
**Compliance Target**: 100% of future Task() calls meet all standards
**Validation Tools**: `.claude/hooks/routing/spawn-prompt-validator.cjs`
