# Developer Workflow

**Version**: 1.0.0
**Last Updated**: 2026-01-25
**Audience**: Developer agents executing implementation tasks

This document defines the MANDATORY workflow for developer agents implementing features, fixing bugs, and refactoring code within the agent-studio framework.

---

## Overview

The Developer workflow follows a systematic approach that ensures quality, testability, and maintainability:

1. **Pre-Implementation Checklist** - Context gathering before writing code
2. **Implementation Standards** - TDD-driven development with strict rules
3. **Post-Implementation Checklist** - Verification and handoff
4. **Error Recovery Procedures** - What to do when things go wrong

---

## Pre-Implementation Checklist

**BEFORE writing ANY code, complete these steps:**

### 1. Read Memory Files

```bash
# Load learnings from previous sessions
cat .claude/context/memory/learnings.md

# Check for known issues related to your task
cat .claude/context/memory/issues.md

# Review relevant architecture decisions
cat .claude/context/memory/decisions.md
```

**Why**: Avoid repeating past mistakes and leverage discovered patterns.

### 2. Understand Your Task

```javascript
// Get full task details
TaskGet({ taskId: 'X' });

// Examine dependencies
// If task has blockedBy, those tasks must complete first
```

**Check for**:

- Clear acceptance criteria
- Blocked dependencies (can't start if blocked)
- Related tasks (for context)

### 3. Read Existing Code

**Never modify code without understanding it.**

```javascript
// Use parallel reads to build context fast
Read('path/to/target-file.ts');
Read('path/to/related-file.ts');
Grep({ pattern: 'functionName', glob: '**/*.ts' });
```

**Understand**:

- Current implementation
- Existing tests
- Related components
- Dependencies and imports

### 4. Claim the Task

```javascript
// Mark task as in-progress BEFORE starting work
TaskUpdate({
  taskId: 'X',
  status: 'in_progress',
  metadata: {
    owner: 'developer',
    startedAt: new Date().toISOString(),
  },
});
```

**Why**: Prevents duplicate work from other agents.

---

## Implementation Standards

### TDD Workflow (Red-Green-Refactor)

**MANDATORY**: Follow Test-Driven Development for ALL code changes.

#### Step 1: RED - Write Failing Test

```javascript
// 1. Invoke TDD skill
Skill({ skill: 'tdd' });

// 2. Write test FIRST
Write(
  'src/feature.test.ts',
  `
  describe('new feature', () => {
    test('should do X when Y happens', () => {
      expect(feature()).toBe(expected);
    });
  });
`
);

// 3. Run test - it MUST fail
Bash({ type: 'bash_20250124', command: 'npm test -- feature.test.ts' });

// Expected output: FAIL (test fails because feature doesn't exist yet)
```

**Verification Gate**: If test passes immediately, you wrote the test AFTER the code. Delete and start over.

#### Step 2: GREEN - Minimal Implementation

```javascript
// Write ONLY enough code to pass the test
Write(
  'src/feature.ts',
  `
  export function feature() {
    return expected; // Simplest implementation
  }
`
);

// Run test - it MUST pass now
Bash({ type: 'bash_20250124', command: 'npm test -- feature.test.ts' });

// Expected output: PASS (all tests pass)
```

**Verification Gate**: Run `Bash({ command: 'npm test' })` and verify 0 failures in output.

#### Step 3: REFACTOR - Improve Quality

```javascript
// Improve code without changing behavior
Edit('src/feature.ts', {
  oldContent: '// simple implementation',
  newContent: '// improved implementation with better structure',
});

// Run tests again - MUST still pass
Bash({ type: 'bash_20250124', command: 'npm test' });

// Expected output: PASS (no regressions)
```

**Refactoring Principles**:

- Remove duplication
- Improve naming
- Extract functions
- Add comments for complex logic
- **Keep tests passing**

### Absolute Path Requirements

**ALWAYS use PROJECT_ROOT for file operations.**

```javascript
// PROJECT_ROOT is provided in agent spawn prompt
const PROJECT_ROOT = 'C:\\dev\\projects\\agent-studio';

// Correct - absolute paths
Write(`${PROJECT_ROOT}/.claude/docs/FILE.md`, content);
Read(`${PROJECT_ROOT}/.claude/agents/core/developer.md`);

// Wrong - relative paths (will fail)
Write('.claude/docs/FILE.md', content); // ❌
Read('../agents/core/developer.md'); // ❌
```

**Reference**: [FILE_PLACEMENT_RULES.md](./FILE_PLACEMENT_RULES.md) for correct output locations.

### File Placement Rules

**Where to create files:**

| File Type   | Location                                      | Example               |
| ----------- | --------------------------------------------- | --------------------- |
| Source code | Project structure                             | `src/feature.ts`      |
| Tests       | Co-located with source                        | `src/feature.test.ts` |
| Plans       | `.claude/context/plans/`                      | `feature-plan.md`     |
| Reports     | `.claude/context/artifacts/reports/`          | `qa-report.md`        |
| Research    | `.claude/context/artifacts/research-reports/` | `topic-research.md`   |
| Memory      | `.claude/context/memory/`                     | `learnings.md`        |
| Agents      | `.claude/agents/{category}/`                  | `my-agent.md`         |
| Skills      | `.claude/skills/{name}/`                      | `SKILL.md`            |
| Hooks       | `.claude/hooks/{category}/`                   | `my-hook.cjs`         |

**Full reference**: See [FILE_PLACEMENT_RULES.md](./FILE_PLACEMENT_RULES.md)

### Code Style Requirements

**Follow language-specific conventions:**

```javascript
// TypeScript/JavaScript
- Use TypeScript strict mode
- Prefer const over let
- Use descriptive variable names (no single letters except i, j in loops)
- Add JSDoc comments for public APIs
- Use async/await over promises.then()

// Python
- Follow PEP 8 style guide
- Use type hints (Python 3.10+)
- Docstrings for all public functions
- f-strings for formatting
```

**Invoke language-specific skills:**

- `Skill({ skill: 'typescript-expert' })` for TypeScript
- `Skill({ skill: 'python-backend-expert' })` for Python
- `Skill({ skill: 'golang-pro' })` for Go

### Error Handling Patterns

**Always handle errors explicitly:**

```typescript
// Good - explicit error handling
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  logger.error('Operation failed', { error });
  throw new AppError('Failed to complete operation', { cause: error });
}

// Bad - silent failures
try {
  await riskyOperation();
} catch (error) {
  // Empty catch - errors hidden
}
```

**Error types:**

- Use custom error classes
- Include context in error messages
- Log errors before throwing
- Never swallow errors silently

### No Hardcoded Values

**Use configuration, environment variables, or constants:**

```javascript
// Good
const MAX_RETRIES = 3;
const API_URL = process.env.API_URL || 'http://localhost:3000';

// Bad
if (retries > 3) { ... }  // Magic number
fetch('http://localhost:3000'); // Hardcoded URL
```

---

## Post-Implementation Checklist

### 1. Run Tests and Verify

**MANDATORY before claiming completion:**

```bash
# Run full test suite
npm test

# Check for 0 failures
# Example output:
# Tests:       34 passed, 34 total
# PASS (0 failures) ✓
```

**Invoke verification skill:**

```javascript
Skill({ skill: 'verification-before-completion' });
```

**Verification Gate**: See actual test output showing 0 failures. Never claim completion without fresh evidence.

### 2. Update Task Status

```javascript
TaskUpdate({
  taskId: 'X',
  status: 'completed',
  metadata: {
    summary: 'Implemented feature X with TDD approach',
    filesModified: ['src/feature.ts', 'src/feature.test.ts'],
    filesCreated: ['src/new-module.ts'],
    testsAdded: true,
    testsPassing: true,
    completedAt: new Date().toISOString(),
  },
});
```

**Required metadata:**

- `summary` - One-line description of work done
- `filesModified` - Array of changed files
- `filesCreated` - Array of new files
- `testsAdded` - Boolean
- `testsPassing` - Boolean
- `completedAt` - ISO timestamp

### 3. Update Memory Files

```javascript
// Record pattern discovered
// Append to .claude/context/memory/learnings.md

## [2026-01-25] Pattern: Feature X Implementation

**Context**: Implemented async error handling for feature X

**Pattern Discovered**:
- Using try/catch with custom error classes improves debuggability
- Logging errors before throwing preserves stack traces
- Custom error types enable better error recovery

**Files**: src/feature.ts

**Reusable**: Yes - applies to all async operations
```

**When to update memory**:

- New pattern discovered
- Workaround for known issue
- Architecture decision made
- Performance optimization found

### 4. Check for Next Tasks

```javascript
// Always check after completion
TaskList();

// Look for:
// - Tasks that were blocked by your task (now unblocked)
// - New tasks assigned to you
// - High priority tasks needing attention
```

---

## Error Recovery Procedures

### When Tests Fail

**Scenario**: Tests fail after your changes.

**Procedure**:

1. **Read the failure output carefully**

   ```bash
   npm test 2>&1 | tee test-output.txt
   # Review FULL output, not just summary
   ```

2. **Invoke debugging skill**

   ```javascript
   Skill({ skill: 'debugging' });
   ```

3. **Identify root cause**
   - Which test failed?
   - What assertion failed?
   - What was expected vs actual?

4. **Fix and re-test**

   ```javascript
   Edit('src/feature.ts', {
     /* fix */
   });
   Bash({ command: 'npm test' });
   ```

5. **Update task metadata**
   ```javascript
   TaskUpdate({
     taskId: 'X',
     metadata: {
       discoveries: ['Test failure due to async timing issue'],
       fixApplied: 'Added await before assertion',
     },
   });
   ```

### When Hooks Block Writes

**Scenario**: Hook prevents file write (e.g., `router-write-guard.cjs`).

**Procedure**:

1. **Read the hook error message**
   - Hook name indicates which rule was violated
   - Error message explains the reason

2. **Common hooks and fixes**:

   | Hook                       | Reason                     | Fix                                           |
   | -------------------------- | -------------------------- | --------------------------------------------- |
   | `router-write-guard.cjs`   | Router using Edit/Write    | Spawn a developer agent instead               |
   | `file-placement-guard.cjs` | Wrong file location        | Use correct path from FILE_PLACEMENT_RULES.md |
   | `task-create-guard.cjs`    | Complex task needs planner | Spawn planner first                           |

3. **Correct the violation**

   ```javascript
   // Example: Wrong location blocked
   // Blocked: .claude/my-file.md
   // Correct: .claude/docs/MY-FILE.md
   Write('.claude/docs/MY-FILE.md', content);
   ```

4. **Document in memory if recurring issue**

### When Dependencies Are Missing

**Scenario**: Code requires package not installed.

**Procedure**:

1. **Identify missing dependency**

   ```bash
   npm test
   # Error: Cannot find module 'some-package'
   ```

2. **Install dependency**

   ```bash
   npm install some-package
   # or for dev dependencies
   npm install -D some-package
   ```

3. **Verify installation**

   ```bash
   npm test
   # Should now pass
   ```

4. **Update task metadata**
   ```javascript
   TaskUpdate({
     taskId: 'X',
     metadata: {
       discoveries: ['Required package: some-package'],
       dependenciesAdded: ['some-package'],
     },
   });
   ```

### When Tasks Are Blocked

**Scenario**: Task has `blockedBy` dependency.

**Procedure**:

1. **Check blocking tasks**

   ```javascript
   TaskGet({ taskId: 'X' });
   // Output shows: blockedBy: ["Y", "Z"]
   ```

2. **Check status of blocking tasks**

   ```javascript
   TaskList();
   // Find tasks Y and Z
   ```

3. **Two options**:

   **A. Wait for blocker completion**
   - Check back later
   - Work on different task

   **B. Help complete blocker**
   - If you can resolve the blocker, do so
   - Update blocker task status when done

4. **Task becomes available when all blockers complete**

---

## Best Practices

### Keep Changes Minimal and Focused

**Good**:

- 1-3 files per change
- Single responsibility changes
- Clear commit messages

**Bad**:

- 10+ files in one change
- Multiple unrelated features
- Vague commit messages

### Co-locate Tests with Source Files

```
src/
├── feature.ts
├── feature.test.ts        # Test next to source
├── utils.ts
└── utils.test.ts          # Test next to source
```

**Why**: Easier to find, maintain, and review together.

### Document Decisions in Memory

**When to document**:

- "Why did we choose approach X over Y?"
- "What's the workaround for issue Z?"
- "How do we handle edge case W?"

**Format** (in `.claude/context/memory/decisions.md`):

```markdown
## ADR-NNN: Decision Title

**Date**: YYYY-MM-DD
**Status**: Accepted
**Context**: What's the situation?
**Decision**: What did we decide?
**Consequences**: What are the trade-offs?
```

### Use Skills via Skill() Tool

**Correct**:

```javascript
Skill({ skill: 'tdd' });
Skill({ skill: 'debugging' });
```

**Wrong**:

```javascript
Read('.claude/skills/tdd/SKILL.md'); // Reading ≠ Invoking
```

**Why**: The `Skill()` tool loads instructions into context. Reading the file doesn't apply the skill.

---

## Skill Integration

### Core Skills (Always Invoke)

Before starting ANY task:

```javascript
Skill({ skill: 'tdd' }); // Red-Green-Refactor
Skill({ skill: 'debugging' }); // 4-phase debugging
Skill({ skill: 'git-expert' }); // Git best practices
Skill({ skill: 'verification-before-completion' }); // Evidence-based gates
```

### Contextual Skills

Invoke based on task requirements:

| Trigger             | Skill                   | Purpose           |
| ------------------- | ----------------------- | ----------------- |
| Python code         | `python-backend-expert` | Python patterns   |
| TypeScript code     | `typescript-expert`     | TS best practices |
| Security changes    | `security-architect`    | Threat modeling   |
| Context limit       | `context-compressor`    | Token reduction   |
| GitHub operations   | `github-mcp`            | GitHub API        |
| Code quality review | `code-analyzer`         | Static analysis   |

### Skill Discovery

**Consult the catalog**:

```bash
cat .claude/context/artifacts/catalogs/skill-catalog.md
```

**Search by category or keyword, then invoke**:

```javascript
Skill({ skill: '<skill-name>' });
```

---

## Related Documentation

- [FILE_PLACEMENT_RULES.md](./FILE_PLACEMENT_RULES.md) - Where to place files
- [CLAUDE.md](../.claude/CLAUDE.md) - Main framework documentation
- [developer.md](../agents/core/developer.md) - Developer agent definition

---

## Quick Reference Card

### Pre-Implementation

1. ✓ Read memory files
2. ✓ TaskGet to understand task
3. ✓ Read existing code
4. ✓ TaskUpdate to claim

### Implementation

1. ✓ RED - Write failing test
2. ✓ GREEN - Minimal code to pass
3. ✓ REFACTOR - Improve quality
4. ✓ Use absolute paths
5. ✓ Follow file placement rules

### Post-Implementation

1. ✓ Run tests (verify 0 failures)
2. ✓ TaskUpdate with metadata
3. ✓ Update memory files
4. ✓ TaskList for next work

### Error Recovery

- Tests fail → Invoke debugging skill
- Hook blocks → Read error, fix violation
- Missing deps → Install and verify
- Task blocked → Work on different task or help unblock

---

**CRITICAL**: This workflow is MANDATORY for all developer agents. Deviations without documented justification are violations of framework standards.

_Last updated: 2026-01-25_
_Part of Framework Refactoring Phase 4_
