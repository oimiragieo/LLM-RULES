# Router Task() Call Template
## Copy-Paste Ready Template for High-Quality Spawns
**Purpose**: Prevent spawn prompt validation failures (score 0/70)
**Usage**: Use this template for ALL Task() calls from router or agents
**Quality Score Target**: 70/70

---

## QUICK START COPY-PASTE

Replace placeholders in `<>` and copy the entire block below:

```javascript
Task({
  subagent_type: '<TYPE>',  // developer, architect, qa, planner, etc.
  task_id: '<TASK-ID>',  // e.g., FIX-ISSUE-001
  description: '<SHORT DESCRIPTION>',  // 5-10 words
  allowed_tools: [
    'Read', 'Write', 'Edit', 'Bash',
    'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet', 'TaskOutput',
    'Skill',
    'Grep', 'Glob'  // Add/remove as needed
  ],
  prompt: `# <AGENT-TYPE> - <TASK-TITLE>

## Task ID
**Task ID: <TASK-ID>**

## PROJECT CONTEXT
- **PROJECT_ROOT**: C:\\dev\\projects\\agent-studio
- **Working Directory**: Current
- **Current Branch**: main

+======================================================================+
|  WARNING: TASK TRACKING REQUIRED - READ THIS FIRST                   |
+======================================================================+
|  Your Task ID: <TASK-ID>                                             |
|                                                                      |
|  BEFORE doing ANY work, run:                                         |
|  TaskUpdate({ taskId: "<TASK-ID>", status: "in_progress" });         |
|                                                                      |
|  AFTER completing work, run:                                         |
|  TaskUpdate({ taskId: "<TASK-ID>", status: "completed",              |
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
- \`.claude/context/memory/learnings.md\` - Learn from past patterns
- \`.claude/context/memory/decisions.md\` - Understand decisions
- \`.claude/context/memory/issues.md\` - Know current issues

## Skill Discovery (MANDATORY for code search)
If your task requires finding code:
1. Do you know the EXACT keyword/function name?
   - YES -> Use Grep tool (simple) or Skill({ skill: 'ripgrep' }) (complex regex)
   - NO -> Use Skill({ skill: 'code-semantic-search' })

Reference: \`.claude/docs/@SKILL_USAGE_GUIDE.md\`

## Your Task

<DETAILED TASK DESCRIPTION>

## Expected Workflow
1. TaskUpdate({ taskId: "<TASK-ID>", status: "in_progress" })
2. Read memory files
3. Implement/fix/test
4. TaskUpdate({ taskId: "<TASK-ID>", status: "completed", metadata: { ... } })
5. TaskList()

## Success Criteria
- <Criterion 1>
- <Criterion 2>
- <Criterion 3>
`
})
```

---

## STEP-BY-STEP CUSTOMIZATION

### 1. Replace `<AGENT-TYPE>`
Options: developer, architect, qa, planner, general-purpose, etc.

### 2. Replace `<TASK-ID>`
Pattern: `<CATEGORY>-<DESCRIPTION>-<NUMBER>`
Examples:
- `FIX-AUTH-001` (fix authentication)
- `FEAT-DASHBOARD-001` (feature: dashboard)
- `TEST-API-001` (testing: API)
- `DOC-MEMORY-001` (documentation: memory system)

### 3. Replace `<SHORT-DESCRIPTION>`
5-10 words maximum
Examples:
- "Fix authentication bug in login flow"
- "Implement new dashboard feature"
- "Write tests for API endpoints"

### 4. Replace `<TASK-TITLE>` (in prompt header)
Same as description but can be longer (1-2 sentences)

### 5. Replace `<DETAILED-TASK-DESCRIPTION>`
2-5 paragraphs explaining:
- What needs to be done
- Why it matters
- Any context or constraints
- Links to related issues

### 6. Customize `allowed_tools`
Remove/add based on task needs:
- **Always include**: TaskUpdate, TaskList, Skill
- **For file operations**: Read, Write, Edit
- **For commands**: Bash
- **For task tracking**: TaskCreate, TaskGet, TaskOutput
- **For code search**: Grep, Glob (or use skills)

### 7. Customize Success Criteria
Replace with 2-4 measurable outcomes:
- "All tests passing"
- "Lint score 0 errors, 0 warnings"
- "Documentation updated"
- "Memory system updated with learnings"

---

## VALIDATION CHECKLIST

Before submitting Task(), verify ALL boxes:

- [ ] Task ID present in both parameter AND prompt
- [ ] Full 70-line warning box with ======= borders
- [ ] TaskUpdate calls shown in both in_progress and completed form
- [ ] allowed_tools includes TaskUpdate and TaskList
- [ ] PROJECT_ROOT context section present
- [ ] Memory protocol section present
- [ ] Skill discovery section present (if applicable)
- [ ] Clear task description with success criteria
- [ ] Professional markdown formatting

**If any box is unchecked: DO NOT submit - the task will fail validation**

---

## EXAMPLES

### Example 1: Developer - Bug Fix

```javascript
Task({
  subagent_type: 'developer',
  task_id: 'FIX-AUTH-001',
  description: 'Fix authentication token expiration bug',
  allowed_tools: [
    'Read', 'Write', 'Edit', 'Bash',
    'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet',
    'Skill', 'Grep'
  ],
  prompt: `# DEVELOPER - Fix Authentication Token Expiration

## Task ID
**Task ID: FIX-AUTH-001**

## PROJECT CONTEXT
- **PROJECT_ROOT**: C:\\dev\\projects\\agent-studio
- **Working Directory**: Current
- **Issue**: Tokens expiring immediately (should last 24 hours)

+======================================================================+
|  WARNING: TASK TRACKING REQUIRED - READ THIS FIRST                   |
+======================================================================+
|  Your Task ID: FIX-AUTH-001                                          |
|                                                                      |
|  BEFORE doing ANY work, run:                                         |
|  TaskUpdate({ taskId: "FIX-AUTH-001", status: "in_progress" });      |
|                                                                      |
|  AFTER completing work, run:                                         |
|  TaskUpdate({ taskId: "FIX-AUTH-001", status: "completed",           |
|    metadata: { summary: "Fixed token expiration", filesModified: ["src/auth.js", "tests/auth.test.js"] }                |
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

## Skill Discovery
Use Skill({ skill: 'code-semantic-search' }) to find authentication logic

## Your Task

The authentication system currently expires JWT tokens immediately instead of after 24 hours. This breaks user sessions.

Root cause analysis needed:
1. Check JWT creation logic (probably using wrong expiration setting)
2. Check token validation logic (might be rejecting valid tokens)
3. Compare against expected behavior

## Expected Workflow
1. TaskUpdate({ taskId: "FIX-AUTH-001", status: "in_progress" })
2. Search for JWT creation code
3. Identify expiration bug
4. Fix and test
5. TaskUpdate({ taskId: "FIX-AUTH-001", status: "completed" })

## Success Criteria
- JWT tokens last 24 hours (not immediate expiration)
- All auth tests passing
- Lint score 0 errors
`
})
```

### Example 2: QA - Testing

```javascript
Task({
  subagent_type: 'qa',
  task_id: 'TEST-API-001',
  description: 'Write comprehensive API endpoint tests',
  allowed_tools: [
    'Read', 'Write', 'Edit', 'Bash',
    'TaskUpdate', 'TaskList', 'TaskCreate', 'TaskGet',
    'Skill', 'Grep'
  ],
  prompt: `# QA - Write API Endpoint Tests

## Task ID
**Task ID: TEST-API-001**

## PROJECT CONTEXT
- **PROJECT_ROOT**: C:\\dev\\projects\\agent-studio
- **Working Directory**: Current
- **API**: REST endpoints in src/api/

+======================================================================+
|  WARNING: TASK TRACKING REQUIRED - READ THIS FIRST                   |
+======================================================================+
|  Your Task ID: TEST-API-001                                          |
|                                                                      |
|  BEFORE doing ANY work, run:                                         |
|  TaskUpdate({ taskId: "TEST-API-001", status: "in_progress" });      |
|                                                                      |
|  AFTER completing work, run:                                         |
|  TaskUpdate({ taskId: "TEST-API-001", status: "completed",           |
|    metadata: { summary: "API tests complete", testCount: 15, passCount: 15 }  |
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

## Skill Discovery
Use Skill({ skill: 'code-structural-search' }) to find API endpoint definitions

## Your Task

Write comprehensive integration tests for all API endpoints. Current coverage is <50%, target is >90%.

Tests should cover:
1. Happy path (valid input, expected success)
2. Error cases (invalid input, 400/500 errors)
3. Edge cases (empty data, special characters)
4. Authentication/Authorization

## Expected Workflow
1. TaskUpdate({ taskId: "TEST-API-001", status: "in_progress" })
2. Find all API endpoints
3. Write tests for each endpoint
4. Run tests (pnpm test)
5. TaskUpdate({ taskId: "TEST-API-001", status: "completed" })

## Success Criteria
- All API endpoints have tests
- Test coverage >90%
- All tests passing (pnpm test: 15/15 pass)
- No lint errors
`
})
```

---

## VERIFICATION COMMAND

After creating your Task() call, verify the prompt:

```bash
# Check spawn prompt quality score
node .claude/hooks/routing/spawn-prompt-validator.cjs << 'EOF'
[PASTE YOUR PROMPT HERE]
EOF
```

Expected output:
```
Spawn prompt validation: score 70/70 ✓ PASS
```

If score < 70: Fix the missing elements using the checklist above.

---

## SUMMARY

**Use this template to:**
- ✅ Prevent validation failures (0/70 → 70/70)
- ✅ Ensure proper task tracking (TaskUpdate calls)
- ✅ Follow best practices (memory protocol, skills)
- ✅ Get professional results (clear requirements, success criteria)

**Template guarantees:**
- Quality score: 70/70
- Task tracking: 100% working
- No validation warnings
- Proper completion logging

---

**Last Updated**: 2026-02-05
**Target Compliance**: 100% of Task() calls use this template
**Validation**: spawn-prompt-validator.cjs (70/70 required)
