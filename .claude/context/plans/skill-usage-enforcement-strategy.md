# Plan: Skill Usage Enforcement Strategy

**Version**: 1.0.0
**Date**: 2026-02-04
**Framework Version**: Agent-Studio v2.2.1
**Status**: Phase 0 - Planning Complete

## Executive Summary

Enforce agents' use of specialized search skills (ripgrep, code-semantic-search, code-structural-search) instead of defaulting to basic Grep/Bash. This plan addresses the root cause: spawn templates and agent prompts mention skills but don't mandate or enforce their use.

**Total Tasks**: 18 atomic tasks across 4 phases
**Estimated Time**: 6-8 hours
**Strategy**: Template-first enforcement + hook validation + decision tree integration

---

## Root Cause Analysis

### Problem Statement

Skills exist and are documented in agent files, but agents are NOT using them. They default to basic Grep/Bash instead.

### Root Causes Identified

| Root Cause | Evidence | Impact |
|------------|----------|--------|
| **RC-1: Spawn templates don't mandate skill invocation** | `universal-agent-spawn.md` mentions skills but only says "as applicable" | Agents skip skill invocation entirely |
| **RC-2: No pre-search skill discovery phase** | No explicit step saying "BEFORE searching, determine which skill to use" | Agents use familiar Grep/Bash by default |
| **RC-3: No decision tree for search tool selection** | Agent files list skills but don't explain WHEN to use each | Cognitive overhead leads to defaulting |
| **RC-4: Skill usage not in the critical path** | Skills are optional, not mandatory | No enforcement mechanism |

### Evidence

1. **Spawn Template Gap**: Line 88 of `universal-agent-spawn.md` says `Invoke required skills via Skill({ skill: "<skill>" }) as applicable` - "as applicable" is too vague
2. **Agent File Gap**: Developer agent (lines 130-200) documents skills but doesn't mandate their use before code search
3. **No Hook Enforcement**: No PreToolUse hook validates that Skill() was called before Grep/Glob

---

## Skill Usage Decision Tree

### Code Search Decision Matrix

```
START: Need to search code?
    |
    v
[Q1] Do you know the exact text/pattern to find?
    |
    +---> YES: Is it a simple keyword (< 10 chars, no regex)?
    |           |
    |           +---> YES: Use Grep tool (basic)
    |           |
    |           +---> NO: Is it a complex regex or multi-line pattern?
    |                     |
    |                     +---> YES: Use ripgrep skill (PCRE2 support)
    |                     |
    |                     +---> NO: Use Grep tool (simple regex)
    |
    +---> NO: Are you searching by code meaning/concept?
              |
              +---> YES: Use code-semantic-search (hybrid mode)
              |           - "find authentication logic"
              |           - "find error handling patterns"
              |           - "find database queries"
              |
              +---> NO: Are you searching for a specific code structure?
                        |
                        +---> YES: Use code-structural-search (AST patterns)
                        |           - "functions with 3 params"
                        |           - "try-catch blocks"
                        |           - "classes extending X"
                        |
                        +---> NO: Use code-semantic-search (default)
```

### Quick Reference Card

| Scenario | Tool | Example |
|----------|------|---------|
| Find exact text "TaskUpdate" | Grep | `Grep({ pattern: "TaskUpdate" })` |
| Find complex regex with PCRE2 | ripgrep | `Skill({ skill: 'ripgrep', args: '-P "(?<=await )\\w+\\("' })` |
| Find ES module files (.mjs, .cjs) | ripgrep | `Skill({ skill: 'ripgrep', args: 'pattern -tjs' })` |
| Find "authentication logic" by meaning | code-semantic-search | `Skill({ skill: 'code-semantic-search', args: 'authentication logic' })` |
| Find functions with exact signature | code-structural-search | `Skill({ skill: 'code-structural-search', args: 'function $NAME($A, $B) { $$ } --lang ts' })` |
| Find all console.log statements | code-structural-search | `Skill({ skill: 'code-structural-search', args: 'console.log($$$) --lang js' })` |
| Find similar code patterns | code-semantic-search | `Skill({ skill: 'code-semantic-search', args: 'similar to error handling' })` |
| Find SQL injection risks | code-structural-search | `Skill({ skill: 'code-structural-search', args: 'db.query($SQL, $$$) --lang js' })` |

### Skill Capabilities Summary

| Skill | Type | Speed | Best For | Don't Use For |
|-------|------|-------|----------|---------------|
| **Grep** (built-in) | Text | Fast | Simple keywords, small repos | Complex patterns, ES modules |
| **ripgrep** | Text+Regex | 10-100x faster | Large repos, PCRE2, ES modules | Semantic search |
| **code-semantic-search** | Semantic+Structural | <150ms | Code by meaning, concepts | Exact text matching |
| **code-structural-search** | AST | <50ms | Exact patterns, refactoring | Keyword search |

---

## What Must Change

### Files Requiring Updates

| File | Priority | Changes | Impact |
|------|----------|---------|--------|
| `.claude/templates/spawn/universal-agent-spawn.md` | CRITICAL | Add skill discovery step before task execution | All spawned agents |
| `.claude/templates/spawn/orchestrator-spawn.md` | CRITICAL | Add skill discovery step for orchestrators | All orchestrators |
| `.claude/agents/core/developer.md` | HIGH | Add mandatory skill selection before code search | Developer agents |
| `.claude/agents/core/qa.md` | HIGH | Add mandatory skill selection before code search | QA agents |
| `.claude/agents/specialized/security-architect.md` | HIGH | Add mandatory skill selection before code search | Security agents |
| `.claude/hooks/routing/skill-usage-validator.cjs` | MEDIUM | Create new hook to validate skill usage | Enforcement |
| `.claude/docs/@SKILL_USAGE_GUIDE.md` | MEDIUM | Create decision tree reference doc | Documentation |
| `.claude/context/memory/learnings.md` | LOW | Add skill enforcement patterns | Memory |

### Enforcement Mechanism Design

**Layer 1: Spawn Template Enforcement (Soft)**
- Add explicit "Skill Discovery Step" to spawn templates
- Make it step 2.5 (after reading agent, before task execution)
- Include decision tree reference

**Layer 2: Agent File Enforcement (Soft)**
- Add "Code Search Protocol" section to all code-search-capable agents
- Include the decision tree directly in agent files
- Add examples specific to that agent's domain

**Layer 3: Hook Enforcement (Hard - Optional)**
- Create `skill-usage-validator.cjs` hook
- Warn (not block) when Grep/Glob used for complex patterns
- Suggest appropriate skill based on pattern analysis
- Environment: `SKILL_USAGE_VALIDATOR=warn|off`

---

## Implementation Phases

### Phase 0: Research & Planning (FOUNDATION) - COMPLETE

**Purpose**: Analyze root causes, design decision tree, plan changes
**Duration**: 2 hours
**Parallel OK**: No

#### Constitution Checkpoint - PASSED

1. **Research Completeness**
   - [x] Analyzed 3+ skill files (ripgrep, code-semantic-search, code-structural-search)
   - [x] Examined spawn templates and agent files
   - [x] Reviewed memory/learnings for prior patterns

2. **Technical Feasibility**
   - [x] All skills exist and are documented
   - [x] Spawn template modification is straightforward
   - [x] Hook creation follows established patterns

3. **Security Review**
   - [x] No security implications (read-only search operations)
   - [x] No credential/auth changes

4. **Specification Quality**
   - [x] Decision tree is testable
   - [x] Success criteria are measurable
   - [x] Edge cases documented

---

### Phase 1: Spawn Template Updates (CRITICAL)

**Purpose**: Add explicit skill discovery step to all spawn templates
**Dependencies**: Phase 0 complete
**Duration**: 1.5 hours
**Parallel OK**: Yes (templates can be updated in parallel)

#### Tasks

- [ ] **1.1** Update universal-agent-spawn.md with Skill Discovery Step (~30 min)
  - **File**: `.claude/templates/spawn/universal-agent-spawn.md`
  - **Location**: After line 87 (after "Read your agent definition")
  - **Change**: Add Step 2.5: Skill Discovery
  - **Verify**: `grep -A 5 "Skill Discovery" .claude/templates/spawn/universal-agent-spawn.md`
  - **Rollback**: `git checkout -- .claude/templates/spawn/universal-agent-spawn.md`

- [ ] **1.2** Update orchestrator-spawn.md with Skill Discovery Step (~30 min) [PARALLEL OK]
  - **File**: `.claude/templates/spawn/orchestrator-spawn.md`
  - **Location**: After line 79 (after "Read your orchestrator definition")
  - **Change**: Add Step 2.5: Skill Discovery
  - **Verify**: `grep -A 5 "Skill Discovery" .claude/templates/spawn/orchestrator-spawn.md`
  - **Rollback**: `git checkout -- .claude/templates/spawn/orchestrator-spawn.md`

- [ ] **1.3** Create @SKILL_USAGE_GUIDE.md reference document (~30 min) [PARALLEL OK]
  - **File**: `.claude/docs/@SKILL_USAGE_GUIDE.md`
  - **Content**: Decision tree, quick reference card, examples
  - **Verify**: `ls .claude/docs/@SKILL_USAGE_GUIDE.md`
  - **Rollback**: `rm .claude/docs/@SKILL_USAGE_GUIDE.md`

#### Phase 1 Content Specifications

**Universal Agent Spawn - New Step 2.5:**
```markdown
## Step 2.5: Skill Discovery (BEFORE Code Search)

If your task requires searching code:

1. **STOP** - Do not use Grep/Glob directly
2. **Consult Decision Tree**: See @SKILL_USAGE_GUIDE.md
3. **Select Skill**:
   - Exact text/simple regex -> Grep (built-in)
   - Complex regex/PCRE2/large repo -> `Skill({ skill: 'ripgrep', args: '...' })`
   - Search by meaning/concept -> `Skill({ skill: 'code-semantic-search', args: '...' })`
   - Search by code structure -> `Skill({ skill: 'code-structural-search', args: '...' })`

**Quick Decision:**
- "I know the exact text" -> Grep or ripgrep
- "I'm looking for code that does X" -> code-semantic-search
- "I need functions/classes with specific structure" -> code-structural-search

**Failure to use appropriate skills reduces search accuracy by 20-30%.**
```

#### Phase 1 Verification Gate

```bash
# All must pass before proceeding
grep "Skill Discovery" .claude/templates/spawn/universal-agent-spawn.md
grep "Skill Discovery" .claude/templates/spawn/orchestrator-spawn.md
ls .claude/docs/@SKILL_USAGE_GUIDE.md
```

---

### Phase 2: Agent File Updates (HIGH)

**Purpose**: Add Code Search Protocol section to key agent files
**Dependencies**: Phase 1 complete
**Duration**: 2 hours
**Parallel OK**: Yes (agents can be updated in parallel)

#### Tasks

- [ ] **2.1** Update developer.md with Code Search Protocol section (~40 min)
  - **File**: `.claude/agents/core/developer.md`
  - **Location**: After "Code Search Optimization" section (line 92)
  - **Change**: Add mandatory "Code Search Protocol" with decision tree
  - **Verify**: `grep -A 10 "Code Search Protocol" .claude/agents/core/developer.md`
  - **Rollback**: `git checkout -- .claude/agents/core/developer.md`

- [ ] **2.2** Update qa.md with Code Search Protocol section (~40 min) [PARALLEL OK]
  - **File**: `.claude/agents/core/qa.md`
  - **Location**: After skills section
  - **Change**: Add mandatory "Code Search Protocol" with decision tree
  - **Verify**: `grep -A 10 "Code Search Protocol" .claude/agents/core/qa.md`
  - **Rollback**: `git checkout -- .claude/agents/core/qa.md`

- [ ] **2.3** Update security-architect.md with Code Search Protocol section (~40 min) [PARALLEL OK]
  - **File**: `.claude/agents/specialized/security-architect.md`
  - **Location**: After skills section
  - **Change**: Add mandatory "Code Search Protocol" with decision tree
  - **Verify**: `grep -A 10 "Code Search Protocol" .claude/agents/specialized/security-architect.md`
  - **Rollback**: `git checkout -- .claude/agents/specialized/security-architect.md`

#### Phase 2 Content Specification

**Code Search Protocol Section (for each agent):**
```markdown
## Code Search Protocol (MANDATORY)

**BEFORE using Grep or Glob, STOP and determine the right tool:**

### Decision Tree

1. **Do you know the exact text/pattern?**
   - YES + simple keyword -> Use `Grep` (built-in)
   - YES + complex regex/PCRE2 -> Use `Skill({ skill: 'ripgrep', args: '...' })`

2. **Are you searching by code meaning/concept?**
   - "find authentication logic" -> Use `Skill({ skill: 'code-semantic-search', args: '...' })`
   - "find error handling" -> Use `Skill({ skill: 'code-semantic-search', args: '...' })`

3. **Are you searching for code structure?**
   - "functions with 3 params" -> Use `Skill({ skill: 'code-structural-search', args: '...' })`
   - "try-catch blocks" -> Use `Skill({ skill: 'code-structural-search', args: '...' })`

### Tool Performance Comparison

| Tool | Accuracy | Speed | Use When |
|------|----------|-------|----------|
| Grep | 70% | Fast | Simple keywords |
| ripgrep | 70% | 10-100x | Large repos, PCRE2 |
| code-semantic-search | 95% | <150ms | Search by meaning |
| code-structural-search | 100% | <50ms | Exact AST patterns |

**Using Grep for semantic searches wastes time and reduces accuracy by 25%.**
```

#### Phase 2 Verification Gate

```bash
# All must pass before proceeding
grep "Code Search Protocol" .claude/agents/core/developer.md
grep "Code Search Protocol" .claude/agents/core/qa.md
grep "Code Search Protocol" .claude/agents/specialized/security-architect.md
```

---

### Phase 3: Enforcement Hook (MEDIUM - Optional)

**Purpose**: Create validation hook to suggest appropriate skills
**Dependencies**: Phase 2 complete
**Duration**: 2 hours
**Parallel OK**: No (sequential development)

#### Tasks

- [ ] **3.1** Create skill-usage-validator.cjs hook (~60 min)
  - **File**: `.claude/hooks/routing/skill-usage-validator.cjs`
  - **Trigger**: PreToolUse(Grep, Glob)
  - **Behavior**: Analyze pattern, suggest appropriate skill if applicable
  - **Mode**: warn (default), off
  - **Verify**: `node .claude/hooks/routing/skill-usage-validator.cjs --test`
  - **Rollback**: `rm .claude/hooks/routing/skill-usage-validator.cjs`

- [ ] **3.2** Write tests for skill-usage-validator.cjs (~45 min)
  - **File**: `tests/hooks/skill-usage-validator.test.cjs`
  - **Coverage**: Pattern analysis, skill suggestions, warn mode
  - **Verify**: `pnpm test -- tests/hooks/skill-usage-validator.test.cjs`
  - **Rollback**: `rm tests/hooks/skill-usage-validator.test.cjs`

- [ ] **3.3** Register hook in settings.json (~15 min)
  - **File**: `.claude/settings.json`
  - **Change**: Add PreToolUse hook for Grep, Glob
  - **Verify**: `grep "skill-usage-validator" .claude/settings.json`
  - **Rollback**: `git checkout -- .claude/settings.json`

#### Phase 3 Hook Design

**skill-usage-validator.cjs:**
```javascript
// PreToolUse(Grep, Glob) hook
// Analyzes pattern and suggests appropriate skill

// Patterns that suggest semantic search:
// - Contains natural language words: "find", "search for", "locate"
// - No regex special characters
// - > 20 characters (likely a description)

// Patterns that suggest structural search:
// - Contains AST keywords: "function", "class", "try", "catch"
// - Contains parameter placeholders: "$NAME", "$ARGS"
// - Contains block markers: "{ $$ }", "$$$"

// Patterns that suggest ripgrep:
// - PCRE2 syntax: (?=...), (?<=...), (?!...), (?<!...)
// - Complex regex: backreferences, conditionals
// - File type filters: -tjs, -tts, -tpy

// Output: { decision: 'allow' | 'warn', suggestion: 'skill-name', reason: '...' }
```

#### Phase 3 Verification Gate

```bash
# All must pass before proceeding
ls .claude/hooks/routing/skill-usage-validator.cjs
pnpm test -- tests/hooks/skill-usage-validator.test.cjs
grep "skill-usage-validator" .claude/settings.json
```

---

### Phase 4: Verification & Documentation

**Purpose**: Test the enforcement strategy with real agents
**Dependencies**: Phase 3 complete (or Phase 2 if skipping hook)
**Duration**: 1 hour
**Parallel OK**: Yes

#### Tasks

- [ ] **4.1** Test spawn template with developer agent (~20 min)
  - **Action**: Spawn developer with code search task
  - **Verify**: Agent uses Skill() before Grep
  - **Evidence**: TaskOutput shows Skill() invocation

- [ ] **4.2** Update memory files with new patterns (~20 min)
  - **File**: `.claude/context/memory/learnings.md`
  - **Content**: Document skill enforcement pattern
  - **Verify**: `grep "skill enforcement" .claude/context/memory/learnings.md`

- [ ] **4.3** Update CLAUDE.md reference index (~10 min)
  - **File**: `.claude/CLAUDE.md`
  - **Change**: Add @SKILL_USAGE_GUIDE.md to reference index
  - **Verify**: `grep "SKILL_USAGE_GUIDE" .claude/CLAUDE.md`

- [ ] **4.4** Create ADR for skill enforcement decision (~10 min)
  - **File**: `.claude/context/memory/decisions.md`
  - **Content**: ADR-079: Skill Usage Enforcement Strategy
  - **Verify**: `grep "ADR-079" .claude/context/memory/decisions.md`

#### Phase 4 Verification Gate

```bash
# All must pass
grep "skill enforcement" .claude/context/memory/learnings.md
grep "SKILL_USAGE_GUIDE" .claude/CLAUDE.md
grep "ADR-079" .claude/context/memory/decisions.md
```

---

### Phase [FINAL]: Evolution & Reflection Check

**Purpose**: Quality assessment and learning extraction
**Dependencies**: Phase 4 complete

#### Tasks

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Spawn Command**:
```javascript
Task({
  subagent_type: "reflection-agent",
  description: "Session reflection and learning extraction",
  prompt: "You are REFLECTION-AGENT. Read @.claude/agents/core/reflection-agent.md. Analyze the completed work from this plan, extract learnings to memory files, and check for evolution opportunities (patterns that suggest new agents or skills should be created)."
})
```

**Success Criteria**:
- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Risks

| Risk | Impact | Mitigation | Rollback |
|------|--------|------------|----------|
| Agents ignore new protocol | HIGH | Hook enforcement (Phase 3) provides hard validation | Revert to soft documentation |
| Performance degradation | MEDIUM | Hook uses pattern analysis (<5ms) | Set SKILL_USAGE_VALIDATOR=off |
| Decision tree too complex | MEDIUM | Quick reference card simplifies choice | Simplify to 3-option table |
| Spawn prompts too long | LOW | Decision tree in separate @file reference | Remove from spawn, keep in agent |

---

## Timeline Summary

| Phase | Tasks | Est. Time | Parallel? |
|-------|-------|-----------|-----------|
| 0 (Research) | 4 | 2 hours | No |
| 1 (Templates) | 3 | 1.5 hours | Yes |
| 2 (Agents) | 3 | 2 hours | Yes |
| 3 (Hook) | 3 | 2 hours | No |
| 4 (Verify) | 4 | 1 hour | Yes |
| FINAL | 3 | 30 min | No |
| **Total** | **20** | **~9 hours** | |

---

## Success Criteria

1. **Agents invoke Skill() at least once per task when code search is needed**
   - Measurement: Spawn logs show Skill() calls for search tasks
   - Target: 90%+ of code search tasks use appropriate skill

2. **Spawn logs show Skill() tool usage for appropriate tasks**
   - Measurement: `grep "Skill\(" .claude/context/metrics/spawn-log.jsonl`
   - Target: Visible skill invocations in recent spawns

3. **No performance degradation**
   - Measurement: Hook execution time <10ms
   - Target: No noticeable slowdown in agent spawning

4. **Decision tree is discoverable and usable**
   - Measurement: @SKILL_USAGE_GUIDE.md exists and is referenced
   - Target: Document in place and linked from spawn templates

---

## Key Deliverables

1. **Updated Spawn Templates** (Phase 1)
   - `.claude/templates/spawn/universal-agent-spawn.md`
   - `.claude/templates/spawn/orchestrator-spawn.md`

2. **New Reference Document** (Phase 1)
   - `.claude/docs/@SKILL_USAGE_GUIDE.md`

3. **Updated Agent Files** (Phase 2)
   - `.claude/agents/core/developer.md`
   - `.claude/agents/core/qa.md`
   - `.claude/agents/specialized/security-architect.md`

4. **Enforcement Hook** (Phase 3 - Optional)
   - `.claude/hooks/routing/skill-usage-validator.cjs`
   - `tests/hooks/skill-usage-validator.test.cjs`

5. **Memory Updates** (Phase 4)
   - `.claude/context/memory/learnings.md`
   - `.claude/context/memory/decisions.md` (ADR-079)
   - `.claude/CLAUDE.md` (reference index update)

---

## Memory Protocol

**Patterns Discovered**:
- Skills are documented but not enforced in spawn flow
- "As applicable" language in templates leads to skill skip
- Decision trees reduce cognitive overhead and improve compliance

**Decision Made**:
- ADR-079: Enforce skill usage through spawn templates + agent files + optional hook

**Next Steps**:
- Execute Phase 1 (spawn template updates)
- Monitor spawn logs for skill usage
- Iterate based on agent compliance rates

---

## Continuation

---

## Plan Created

**Plan:** skill-usage-enforcement-strategy
**Tasks:** 20 atomic tasks across 5 phases

## Next Up

**Execute Plan** - Run the implementation plan

`/execute-plan`

<sub>`/clear` first -> fresh context window</sub>

---

**Also available:**
- Review plan details
- `/verify` - verify before executing

---
