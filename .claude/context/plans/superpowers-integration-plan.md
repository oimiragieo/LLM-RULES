# SUPERPOWERS INTEGRATION PLAN

> **For Claude:** Use this plan to integrate high-value skills, patterns, and agents from the Superpowers codebase into agent-studio's .claude framework.

## Executive Summary

Integration of the superpowers codebase into agent-studio framework. Key integrations focus on:

1. **Iron Laws Pattern** - Enforceable rules with rationalization tables that prevent shortcuts
2. **Verification Gates** - Evidence-before-claims methodology
3. **Two-Stage Code Review** - Spec compliance THEN quality review
4. **Systematic Debugging** - 4-phase root cause investigation
5. **Skill Writing Framework** - TDD-for-documentation methodology

**Source:** `C:\dev\projects\agent-studio\.claude.archive\.tmp\superpowers-main`
**Target:** `C:\dev\projects\agent-studio\.claude`
**Estimated Time:** 6-8 hours total

---

## Completed (this pass)

- Phase 1: Commands added under `.claude/commands` (brainstorm, write-plan, execute-plan).
- Phase 2 (Option A): Skill protocol reminder added to UserPromptSubmit memory reminder box.
- Phase 3: Debugging skill updated with find-polluter reference.
- Phase 5: Skill-triggering prompts + manifest + runner script added, with `pnpm test:skill-triggering`.
- Phase 6: Added `.claude/docs/DEEP_DIVE_SUPERPOWERS_MAPPING.md` for mapping and test guidance.

---

## 1. HIGH-VALUE INTEGRATIONS

### Tier 1: Critical (Must Have)

| Item                                   | Reason                                                                                                                                                   | Priority |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `test-driven-development` skill        | Far more comprehensive than existing `tdd` skill - includes Iron Laws, rationalization prevention tables, red flags, and testing anti-patterns reference | P0       |
| `systematic-debugging` skill           | More rigorous than existing `debugging` skill - 4-phase process with root-cause-tracing and defense-in-depth techniques                                  | P0       |
| `verification-before-completion` skill | Unique capability - prevents false completion claims with "Evidence before claims" protocol                                                              | P0       |
| `code-reviewer` agent                  | Two-stage review (spec compliance then code quality) is a unique pattern not present in existing framework                                               | P0       |

### Tier 2: High Value (Should Have)

| Item                                                           | Reason                                                                           | Priority |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------- |
| `brainstorming` skill                                          | Structured design refinement before implementation - prevents "Description Trap" | P1       |
| `writing-plans` skill                                          | Bite-sized task creation (2-5 min tasks) with complete code snippets             | P1       |
| `executing-plans` skill                                        | Batch execution with review checkpoints                                          | P1       |
| `subagent-driven-development` skill                            | Same-session plan execution with two-stage review per task                       | P1       |
| Slash commands (`/brainstorm`, `/write-plan`, `/execute-plan`) | User-facing workflow triggers                                                    | P1       |

### Tier 3: Valuable (Nice to Have)

| Item                                                      | Reason                                               | Priority |
| --------------------------------------------------------- | ---------------------------------------------------- | -------- |
| `using-git-worktrees` skill                               | Isolated workspace creation with safety verification | P2       |
| `finishing-a-development-branch` skill                    | Structured merge/PR decision workflow                | P2       |
| `dispatching-parallel-agents` skill                       | Concurrent subagent coordination pattern             | P2       |
| `requesting-code-review` / `receiving-code-review` skills | Code review protocol skills                          | P2       |
| `writing-skills` skill                                    | TDD applied to skill documentation creation          | P2       |
| `using-superpowers` skill                                 | Skill discovery and invocation introduction          | P2       |
| Session-start hook                                        | Automatic skill awareness injection                  | P2       |
| `skills-core.js` library                                  | Skill discovery/parsing utilities                    | P3       |
| `find-polluter.sh` tool                                   | Test pollution bisection finder                      | P3       |

---

## 2. OVERLAP ANALYSIS

### Skills Requiring Replacement (Superpowers version is superior)

| Existing Skill                      | Superpowers Skill         | Action                                                                                                                                   |
| ----------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/skills/tdd/SKILL.md`       | `test-driven-development` | **REPLACE** - Superpowers version includes Iron Laws, red flags, rationalization tables, DOT flowcharts, testing anti-patterns reference |
| `.claude/skills/debugging/SKILL.md` | `systematic-debugging`    | **REPLACE** - Superpowers version includes 4-phase process, root-cause-tracing, defense-in-depth, find-polluter tool                     |

### Skills That Complement (No Conflict)

| Existing Skill                        | Relationship                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/skills/smart-debug/SKILL.md` | **KEEP** - Focuses on observability/production debugging. Superpowers `systematic-debugging` focuses on methodology. They complement each other.  |
| `.claude/agents/core/qa.md`           | **KEEP** - QA agent focuses on test coverage and regression. Code-reviewer agent focuses on plan compliance and code quality. Different purposes. |

---

## 3. FOLDER MAPPING

### Skills

| Source                                                    | Target                                           |
| --------------------------------------------------------- | ------------------------------------------------ |
| `superpowers-main/skills/brainstorming/`                  | `.claude/skills/brainstorming/`                  |
| `superpowers-main/skills/writing-plans/`                  | `.claude/skills/writing-plans/`                  |
| `superpowers-main/skills/executing-plans/`                | `.claude/skills/executing-plans/`                |
| `superpowers-main/skills/subagent-driven-development/`    | `.claude/skills/subagent-driven-development/`    |
| `superpowers-main/skills/test-driven-development/`        | `.claude/skills/tdd/` (REPLACE)                  |
| `superpowers-main/skills/systematic-debugging/`           | `.claude/skills/debugging/` (REPLACE)            |
| `superpowers-main/skills/verification-before-completion/` | `.claude/skills/verification-before-completion/` |
| `superpowers-main/skills/using-git-worktrees/`            | `.claude/skills/using-git-worktrees/`            |
| `superpowers-main/skills/finishing-a-development-branch/` | `.claude/skills/finishing-a-development-branch/` |
| `superpowers-main/skills/dispatching-parallel-agents/`    | `.claude/skills/dispatching-parallel-agents/`    |
| `superpowers-main/skills/requesting-code-review/`         | `.claude/skills/requesting-code-review/`         |
| `superpowers-main/skills/receiving-code-review/`          | `.claude/skills/receiving-code-review/`          |
| `superpowers-main/skills/writing-skills/`                 | `.claude/skills/writing-skills/`                 |
| `superpowers-main/skills/using-superpowers/`              | `.claude/skills/skill-discovery/`                |

### Agent

| Source                                     | Target                                        |
| ------------------------------------------ | --------------------------------------------- |
| `superpowers-main/agents/code-reviewer.md` | `.claude/agents/specialized/code-reviewer.md` |

### Commands

| Source                                      | Target                             |
| ------------------------------------------- | ---------------------------------- |
| `superpowers-main/commands/brainstorm.md`   | `.claude/commands/brainstorm.md`   |
| `superpowers-main/commands/write-plan.md`   | `.claude/commands/write-plan.md`   |
| `superpowers-main/commands/execute-plan.md` | `.claude/commands/execute-plan.md` |

### Hooks

| Source                    | Target                   |
| ------------------------- | ------------------------ |
| `superpowers-main/hooks/` | `.claude/hooks/session/` |

### Tools

| Source                                                          | Target                                         |
| --------------------------------------------------------------- | ---------------------------------------------- |
| `superpowers-main/lib/skills-core.js`                           | `.claude/tools/skills-core/skills-core.js`     |
| `superpowers-main/skills/systematic-debugging/find-polluter.sh` | `.claude/tools/find-polluter/find-polluter.sh` |
| `superpowers-main/skills/writing-skills/render-graphs.js`       | `.claude/tools/render-graphs/render-graphs.js` |

---

## 4. IMPLEMENTATION PHASES

### Phase 1: Foundation (Core Discipline Skills)

**Tasks**:

1. Backup existing `tdd` and `debugging` skills to `.claude.archive/`
2. Install enhanced TDD skill with Iron Laws and anti-patterns
3. Install systematic-debugging skill with 4-phase process
4. Install verification-before-completion skill
5. Update cross-references (`superpowers:` -> framework names)

**Dependencies**: None
**Verification**: Run TDD workflow, verify Iron Law enforcement

### Phase 2: Code Review Agent

**Tasks**:

1. Install code-reviewer agent to `.claude/agents/specialized/`
2. Install requesting-code-review and receiving-code-review skills
3. Update CLAUDE.md routing table

**Dependencies**: Phase 1
**Verification**: Dispatch code-reviewer, verify two-stage review

### Phase 3: Workflow Skills

**Tasks**:

1. Install brainstorming skill
2. Install writing-plans skill
3. Install executing-plans skill
4. Install subagent-driven-development skill (with templates)
5. Update all cross-references

**Dependencies**: Phases 1 & 2
**Verification**: Complete brainstorm -> plan -> execute cycle

### Phase 4: Git Workflow Skills

**Tasks**:

1. Install using-git-worktrees skill
2. Install finishing-a-development-branch skill

**Dependencies**: Phase 3
**Verification**: Create worktree, complete work, verify finish options

### Phase 5: Slash Commands

**Tasks**:

1. Install `/brainstorm`, `/write-plan`, `/execute-plan` commands
2. Update command skill references

**Dependencies**: Phase 3
**Verification**: Test all three slash commands

### Phase 6: Advanced Skills

**Tasks**:

1. Install dispatching-parallel-agents skill
2. Install writing-skills skill (TDD for docs)
3. Install skill-discovery skill (renamed from using-superpowers)

**Dependencies**: Phase 1
**Verification**: Create test skill using writing-skills workflow

### Phase 7: Hooks and Tools

**Tasks**:

1. Create `.claude/hooks/session/` directory
2. Install session-start hook
3. Install utility tools (skills-core.js, find-polluter.sh, render-graphs.js)
4. Update CLAUDE.md with new hooks

**Dependencies**: Phase 6
**Verification**: Start session, verify hook injects skill awareness

---

## 5. TESTING STRATEGY

### Per-Skill Testing

1. **Academic Test**: Ask Claude to explain the skill's rules
2. **Pressure Test**: Create scenario that tempts violation
3. **Integration Test**: Use skill in realistic development task

### Integration Testing

1. **Complete Workflow Test**: brainstorm -> plan -> execute -> review -> merge
2. **Regression Test**: Ensure existing skills still work

### Verification Checklist

| Phase | Test                              |
| ----- | --------------------------------- |
| 1     | TDD workflow enforces Iron Law    |
| 1     | Debugging follows 4-phase process |
| 2     | Two-stage code review works       |
| 3     | Complete workflow cycle           |
| 4     | Git worktree isolation works      |
| 5     | Slash commands trigger correctly  |
| 6     | Parallel agent dispatch works     |
| 7     | Session hook injects content      |

---

## 6. DOCUMENTATION UPDATES

### Files to Update

| File                                  | Changes                            |
| ------------------------------------- | ---------------------------------- |
| `.claude/CLAUDE.md`                   | Add code-reviewer to routing table |
| `.claude/context/memory/learnings.md` | Add integration learnings          |

### New Documentation

| File                                   | Content                       |
| -------------------------------------- | ----------------------------- |
| `.claude/docs/WORKFLOW_GUIDE.md`       | Complete development workflow |
| `.claude/docs/SKILL_AUTHORING.md`      | How to create new skills      |
| `.claude/docs/CODE_REVIEW_PROTOCOL.md` | Two-stage review process      |

### Cross-Reference Updates

Replace all `superpowers:skill-name` with framework skill names:

- `superpowers:test-driven-development` -> `tdd`
- `superpowers:systematic-debugging` -> `debugging`
- `superpowers:verification-before-completion` -> `verification-before-completion`
- etc.

---

## 7. RISK MITIGATION

### Backup Strategy

```
.claude.archive/
  pre-superpowers-backup/
    skills/tdd/
    skills/debugging/
    hooks/
```

### Rollback Plan

1. Restore from `.claude.archive/pre-superpowers-backup/`
2. Document failure in `.claude/context/memory/issues.md`
3. Iterate on fix before re-attempting

---

## Summary Counts

- **Skills to Add**: 14 new skills
- **Skills to Replace**: 2 (tdd, debugging)
- **Agent to Add**: 1 (code-reviewer)
- **Commands to Add**: 3 (/brainstorm, /write-plan, /execute-plan)
- **Hooks to Add**: 1 (session-start)
- **Tools to Add**: 3 (skills-core.js, find-polluter.sh, render-graphs.js)
- **Implementation Phases**: 7

---

## APPENDIX A: KEY PATTERNS TO ADOPT

### Pattern 1: Iron Laws

The Iron Laws pattern is the most valuable innovation. It defines an inviolable rule with explicit loophole closures:

```markdown
## The Iron Law

\`\`\`
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
\`\`\`

Write code before the test? Delete it. Start over.

**No exceptions:**

- Don't keep it as "reference"
- Don't "adapt" it while writing tests
- Don't look at it
- Delete means delete

Implement fresh from tests. Period.
```

This pattern should be applied to:

- TDD skill (already has it in Superpowers)
- Verification-before-completion skill
- Any discipline-enforcing skill

### Pattern 2: Rationalization Tables

Anticipate and counter agent rationalizations with explicit tables:

```markdown
## Common Rationalizations

| Excuse                                 | Reality                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------- |
| "Too simple to test"                   | Simple code breaks. Test takes 30 seconds.                              |
| "I'll test after"                      | Tests passing immediately prove nothing.                                |
| "Tests after achieve same goals"       | Tests-after = "what does this do?" Tests-first = "what should this do?" |
| "Already manually tested"              | Ad-hoc ≠ systematic. No record, can't re-run.                           |
| "Deleting X hours is wasteful"         | Sunk cost fallacy. Keeping unverified code is technical debt.           |
| "TDD is dogmatic, I'm being pragmatic" | TDD IS pragmatic. Finds bugs before commit.                             |
```

### Pattern 3: Red Flags Lists

Provide self-check triggers that force agents to STOP:

```markdown
## Red Flags - STOP and Start Over

- Code before test
- Test after implementation
- Test passes immediately
- Can't explain why test failed
- Tests added "later"
- Rationalizing "just this once"
- "I already manually tested it"
- "This is different because..."

**All of these mean: Delete code. Start over with TDD.**
```

### Pattern 4: The Gate Function

Verification-before-completion uses a gate function pattern:

```markdown
## The Gate Function

\`\`\`
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
\`\`\`
```

### Pattern 5: Two-Stage Code Review

Separates concerns for better quality:

1. **Spec Compliance Review** - Did they build what was requested?
   - Check for missing requirements
   - Check for extra/unneeded work
   - Check for misunderstandings
   - Verify by reading code, not trusting report

2. **Code Quality Review** - Is it well-built?
   - Clean architecture
   - Proper error handling
   - Type safety
   - Test quality

The key insight: spec compliance must pass BEFORE code quality review.

### Pattern 6: Spirit vs Letter Principle

Preemptively close the "spirit of the rule" loophole:

```markdown
**Violating the letter of the rules is violating the spirit of the rules.**
```

This single line prevents agents from rationalizing violations by claiming they're "following the spirit."

---

## APPENDIX B: ADAPTATION REQUIREMENTS

### YAML Frontmatter Conversion

Superpowers skills use minimal frontmatter:

```yaml
---
name: skill-name
description: Use when...
---
```

Agent-studio skills use extended frontmatter:

```yaml
---
name: skill-name
description: Description text
version: 1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Glob, Grep]
best_practices:
  - Practice 1
  - Practice 2
error_handling: graceful
streaming: supported
---
```

**Action:** Add agent-studio extended fields to all imported skills.

### Memory Protocol Addition

Every imported skill MUST include the Memory Protocol section at the end:

```markdown
## Memory Protocol (MANDATORY)

**Before starting:**
\`\`\`bash
cat .claude/context/memory/learnings.md
\`\`\`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
```

### Cross-Reference Updates

Replace all Superpowers skill references:

| Superpowers Reference                        | Agent-Studio Reference           |
| -------------------------------------------- | -------------------------------- |
| `superpowers:test-driven-development`        | `tdd`                            |
| `superpowers:systematic-debugging`           | `debugging`                      |
| `superpowers:verification-before-completion` | `verification-before-completion` |
| `superpowers:brainstorming`                  | `brainstorming`                  |
| `superpowers:writing-plans`                  | `writing-plans`                  |
| `superpowers:executing-plans`                | `executing-plans`                |
| `superpowers:subagent-driven-development`    | `subagent-driven-development`    |
| `superpowers:code-reviewer`                  | `code-reviewer`                  |
| `superpowers:using-git-worktrees`            | `using-git-worktrees`            |
| `superpowers:finishing-a-development-branch` | `finishing-a-development-branch` |

---

## APPENDIX C: FILES TO COPY

### Complete File Manifest

**Phase 1: Foundation Skills**

```
SOURCE                                                     DESTINATION
skills/test-driven-development/SKILL.md                   .claude/skills/tdd/SKILL.md (REPLACE)
skills/test-driven-development/testing-anti-patterns.md   .claude/skills/tdd/testing-anti-patterns.md (NEW)
skills/verification-before-completion/SKILL.md            .claude/skills/verification-before-completion/SKILL.md (NEW)
skills/systematic-debugging/SKILL.md                      .claude/skills/debugging/SKILL.md (REPLACE)
skills/systematic-debugging/root-cause-tracing.md         .claude/skills/debugging/root-cause-tracing.md (NEW)
skills/systematic-debugging/defense-in-depth.md           .claude/skills/debugging/defense-in-depth.md (NEW)
skills/systematic-debugging/condition-based-waiting.md    .claude/skills/debugging/condition-based-waiting.md (NEW)
```

**Phase 2: Code Review**

```
SOURCE                                                     DESTINATION
agents/code-reviewer.md                                    .claude/agents/specialized/code-reviewer.md (NEW)
skills/requesting-code-review/SKILL.md                     .claude/skills/requesting-code-review/SKILL.md (NEW)
skills/requesting-code-review/code-reviewer.md             .claude/skills/requesting-code-review/code-reviewer.md (NEW)
skills/receiving-code-review/SKILL.md                      .claude/skills/receiving-code-review/SKILL.md (NEW)
```

**Phase 3: Workflow Skills**

```
SOURCE                                                     DESTINATION
skills/brainstorming/SKILL.md                              .claude/skills/brainstorming/SKILL.md (NEW)
skills/writing-plans/SKILL.md                              .claude/skills/writing-plans/SKILL.md (NEW)
skills/executing-plans/SKILL.md                            .claude/skills/executing-plans/SKILL.md (NEW)
skills/subagent-driven-development/SKILL.md                .claude/skills/subagent-driven-development/SKILL.md (NEW)
skills/subagent-driven-development/implementer-prompt.md   .claude/skills/subagent-driven-development/implementer-prompt.md (NEW)
skills/subagent-driven-development/spec-reviewer-prompt.md .claude/skills/subagent-driven-development/spec-reviewer-prompt.md (NEW)
skills/subagent-driven-development/code-quality-reviewer-prompt.md .claude/skills/subagent-driven-development/code-quality-reviewer-prompt.md (NEW)
```

**Phase 4: Git Workflow**

```
SOURCE                                                     DESTINATION
skills/using-git-worktrees/SKILL.md                        .claude/skills/using-git-worktrees/SKILL.md (NEW)
skills/finishing-a-development-branch/SKILL.md             .claude/skills/finishing-a-development-branch/SKILL.md (NEW)
```

**Phase 6: Advanced**

```
SOURCE                                                     DESTINATION
skills/dispatching-parallel-agents/SKILL.md                .claude/skills/dispatching-parallel-agents/SKILL.md (NEW)
skills/writing-skills/SKILL.md                             .claude/skills/writing-skills/SKILL.md (NEW)
skills/writing-skills/anthropic-best-practices.md          .claude/skills/writing-skills/anthropic-best-practices.md (NEW)
skills/writing-skills/persuasion-principles.md             .claude/skills/writing-skills/persuasion-principles.md (NEW)
skills/writing-skills/testing-skills-with-subagents.md     .claude/skills/writing-skills/testing-skills-with-subagents.md (NEW)
skills/using-superpowers/SKILL.md                          .claude/skills/skill-discovery/SKILL.md (NEW + RENAME)
```

---

## Review Required

- [x] **Architect Review**: Required - Validates skill structure and integration patterns
- [ ] **Security Review**: Not Required - No auth/security changes

### Review Focus Areas

- Architect: Skill naming consistency, agent skill assignments, directory structure, Iron Laws pattern implementation

---

**Plan Status:** Ready for execution
**Created:** 2026-01-24
**Last Updated:** 2026-01-24
**Author:** Planner Agent (via Superpowers analysis)
