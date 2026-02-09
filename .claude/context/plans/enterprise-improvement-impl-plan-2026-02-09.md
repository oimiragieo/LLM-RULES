<!-- Agent: planner | Task: #8 | Session: 2026-02-09 -->

# Enterprise Improvement Implementation Plan

**Date**: 2026-02-09
**Framework Version**: Agent-Studio v2.2.1
**Status**: Ready for Execution
**Source**: Architect Design Doc (`enterprise-improvement-design-2026-02-09.md`)
**Complexity**: HIGH (15 files modified/created, 6 phases, 19 tasks)

---

## Executive Summary

This plan implements 4 enterprise improvements across 6 phases using the architect's zero-regression design. All changes are ADDITIVE -- no existing content is removed or replaced. Each task specifies the exact file, exact location, exact content, a TDD verification approach, and a rollback instruction.

**Areas Covered:**
- A1: Context-Compressor Integration (activate dormant infrastructure)
- A2: Hybrid Search Adoption (replace Grep defaults with search skills)
- A3: Planner Enhancement (hypothesis framing, PRD integration, search strengthening)
- A4: PM PRD System (structured PRD template and workflow)

**Total Files**: 13 existing modified + 2 new files (Phases 1-5) + 2 new hooks (Phase 6 optional)
**Estimated Effort**: 9-14 hours (excluding optional Phase 6)

---

## Parallelization Map

```
Phase 1: [1.1] [1.2] [1.3]     <-- ALL PARALLEL (independent config/doc changes)
Phase 2: [2.1] [2.2] [2.3]     <-- ALL PARALLEL (independent memory appends)
         --- COMMIT CHECKPOINT (15+ files project) ---
Phase 3: [3.1] [3.2] [3.3] [3.4] [3.5] [3.6] [3.7]  <-- ALL PARALLEL (different files)
Phase 4: [4.1] [4.2] [4.3]     <-- ALL PARALLEL (different template files)
Phase 5: [5.1]                  <-- SEQUENTIAL (uses skill-creator workflow)
Phase 6: [6.1] [6.2]           <-- PARALLEL, OPTIONAL/DEFERRED
```

---

## Phase 1: Config & Quick Wins

**Purpose**: Activate dormant infrastructure and correct documentation inaccuracies
**Duration**: ~30 minutes
**Dependencies**: None
**Parallel OK**: Yes (all 3 tasks independent)

### Task 1.1: Enable auto_compression in config.yaml

**Target Agent**: `developer`
**Recommended Skills**: `verification-before-completion`

**File**: `.claude/config.yaml`
**Location**: Line 114

**RED (test should fail before change)**:
```bash
node -e "const yaml = require('js-yaml'); const fs = require('fs'); const c = yaml.load(fs.readFileSync('.claude/config.yaml','utf8')); if(c.session.auto_compression.enabled === true) { console.log('PASS'); process.exit(0); } else { console.log('FAIL: enabled is', c.session.auto_compression.enabled); process.exit(1); }"
```
Expected: FAIL (currently `false`)

**GREEN (exact change)**:

Find this text at line 114:
```yaml
    enabled: false # Best-effort auto-trigger via user-prompt-unified when enabled
```

Replace with:
```yaml
    enabled: true # Best-effort auto-trigger via user-prompt-unified when enabled
```

**Verify**:
```bash
node -e "const yaml = require('js-yaml'); const fs = require('fs'); const c = yaml.load(fs.readFileSync('.claude/config.yaml','utf8')); if(c.session.auto_compression.enabled === true) { console.log('PASS'); process.exit(0); } else { console.log('FAIL'); process.exit(1); }"
```

**Rollback**: Change `enabled: true` back to `enabled: false` on line 114.

---

### Task 1.2: Add AUTO_COMPRESSION_PHASE_3 to .env.example

**Target Agent**: `developer`
**Recommended Skills**: `verification-before-completion`

**File**: `.env.example`
**Location**: After line 37 (after `# ELICITATION_ENABLED=false`, inside Section 2: Feature Flags)

**RED**:
```bash
grep -c "AUTO_COMPRESSION_PHASE_3" .env.example
```
Expected: `0` (not present)

**GREEN (exact content to ADD after line 37)**:

```

# Auto-compression for long sessions (Phase 3)
# Activates context-compressor when token budget approaches limit
# Values: 1 (enabled) | 0 (disabled)
# Default: 0 (disabled)
# When enabled, user-prompt-unified.cjs checks token budget and creates
# compression-reminder.txt for the router to process
#
AUTO_COMPRESSION_PHASE_3=1
```

**Verify**:
```bash
grep -c "AUTO_COMPRESSION_PHASE_3" .env.example
```
Expected: `1` (present)

**Rollback**: Remove the added block (lines containing `AUTO_COMPRESSION_PHASE_3` and surrounding comments).

---

### Task 1.3: Update CLAUDE.md Section 7 hybrid search counts

**Target Agent**: `developer`
**Recommended Skills**: `verification-before-completion`

**File**: `.claude/CLAUDE.md`
**Location**: Lines 512-514 (Section 7 "Hybrid Search Integration (Phase 1)")

**RED**:
```bash
grep -c "36+ agents" .claude/CLAUDE.md
```
Expected: `1` (aspirational text present)

**GREEN (exact change)**:

Find this text (lines 510-523):
```markdown
**All agents have code search capabilities** via integrated search skills:

- **36+ agents** (all domain agents): `code-semantic-search`, `code-structural-search`, `ripgrep`
- **9 specialized agents**: `code-semantic-search`, `ripgrep` (structural search not needed)
- **8 orchestrators/C4 agents**: `ripgrep` only (high-level coordination)

**Search-first protocol** for 3 core agents (`developer`, `code-reviewer`, `code-simplifier`):

1. Search existing code before writing new code
2. Use semantic search for pattern discovery
3. Use structural search for precise code matching
4. Use ripgrep for fast keyword searches

**Agent-creator integration:** New agents are guided to include search skills based on their domain (code-focused agents get all 3 search skills).
```

Replace with:
```markdown
**Agents with code search capabilities** via integrated search skills:

- **Current state**: 9 agents have search skills assigned (Phase 1 target: 13+ core agents)
- **Phase 1 agents** (core + high-impact): developer, code-reviewer, code-simplifier, planner, qa, architect, database-architect, devops, devops-troubleshooter, incident-responder, security-architect, technical-writer, context-compressor
- **Phase 2 target**: 25+ domain agents (python-pro, typescript-pro, etc.)
- **Phase 3 target**: 8 orchestrators (ripgrep only for quick scanning)

**Search-first protocol** for 3 core agents (`developer`, `code-reviewer`, `code-simplifier`):

1. Search existing code before writing new code
2. Use semantic search for pattern discovery
3. Use structural search for precise code matching
4. Use ripgrep for fast keyword searches

**Agent-creator integration:** New agents are guided to include search skills based on their domain (code-focused agents get all 3 search skills).
```

**Verify**:
```bash
grep -c "36+ agents" .claude/CLAUDE.md
```
Expected: `0` (aspirational text removed)

```bash
grep -c "Current state" .claude/CLAUDE.md
```
Expected: `1` (accurate text present)

**Rollback**: Restore original 3-bullet list with "36+ agents", "9 specialized agents", "8 orchestrators/C4 agents".

---

### Phase 1 Verification Gate

```bash
# All 3 must pass before proceeding to Phase 2
node -e "const yaml = require('js-yaml'); const fs = require('fs'); const c = yaml.load(fs.readFileSync('.claude/config.yaml','utf8')); console.log('auto_compression:', c.session.auto_compression.enabled); process.exit(c.session.auto_compression.enabled === true ? 0 : 1)"
grep "AUTO_COMPRESSION_PHASE_3" .env.example
grep "Current state" .claude/CLAUDE.md
```

---

## Phase 2: Memory & Documentation Updates

**Purpose**: Record patterns in memory files so agents learn from them
**Duration**: ~30 minutes
**Dependencies**: None (can run parallel with Phase 1)
**Parallel OK**: Yes (all 3 tasks append to different sections of learnings.md -- but since they write to the SAME file, execute them SEQUENTIALLY within this phase to avoid conflicts)

### Task 2.1: Append compression trigger patterns to learnings.md

**Target Agent**: `developer`
**Recommended Skills**: `verification-before-completion`

**File**: `.claude/context/memory/learnings.md`
**Location**: Append at END of file

**RED**:
```bash
grep -c "Context-Compressor Trigger Patterns" .claude/context/memory/learnings.md
```
Expected: `0` (not present)

**GREEN (exact content to APPEND)**:

```markdown

---

## 2026-02-09: Context-Compressor Trigger Patterns (Enterprise Improvement Plan)

**Pattern:** When and how to invoke context-compressor for long sessions

**Trigger Heuristics (when to compress):**
- After Phase 0 research (40+ message turns accumulated)
- When plan exceeds 50 tasks (large output accumulation)
- When message count exceeds 50 turns
- After completing Phase N tasks (5+ files changed) in developer workflows
- Between workflow phases for orchestrators (Phase N complete, Phase N+1 starting)

**How to compress:**
```javascript
Skill({ skill: 'context-compressor' });
```

**Safe compression points (WHEN to invoke):**
- After completing a logical unit (phase, milestone)
- Before starting a new implementation phase
- NOT mid-operation (mid-test-run, mid-file-edit)

**What to preserve during compression:**
- Active task IDs and status
- Key decisions made (ADRs)
- File paths modified in current session
- Test results (pass/fail counts)
- Research findings (for planner)

**Memory Takeaway:** Compression is a checkpoint operation -- invoke at natural breakpoints, not mid-stream. Preserve decision context above all else.
```

**Verify**:
```bash
grep -c "Context-Compressor Trigger Patterns" .claude/context/memory/learnings.md
```
Expected: `1`

**Rollback**: Remove the appended section (identifiable by header "## 2026-02-09: Context-Compressor Trigger Patterns").

---

### Task 2.2: Append PRD workflow patterns to learnings.md

**Target Agent**: `developer`
**Recommended Skills**: `verification-before-completion`

**File**: `.claude/context/memory/learnings.md`
**Location**: Append at END of file (after Task 2.1 content)

**RED**:
```bash
grep -c "PRD-to-Plan Pipeline Patterns" .claude/context/memory/learnings.md
```
Expected: `0`

**GREEN (exact content to APPEND)**:

```markdown

---

## 2026-02-09: PRD-to-Plan Pipeline Patterns (Enterprise Improvement Plan)

**Pattern:** Structured PRD workflow for PM-to-Planner handoff

**PRD Template Location:** `.claude/templates/prd-template.md`

**Required PRD Sections:**
- Problem Statement + Evidence (validates "why" before "how")
- Key Hypothesis (testable: "We believe X will Y. We'll know when Z.")
- MoSCoW Capabilities (Must/Should/Could/Won't with rationale)
- Implementation Phases table (Status/Depends/Plan Link columns)
- Decisions Log (Decision/Choice/Alternatives/Rationale)
- Success Metrics (Metric/Target/How Measured)

**PRD-to-Plan Handoff Protocol:**
1. PM creates PRD with Implementation Phases table
2. Planner reads PRD -> selects next pending phase (where dependencies complete)
3. Planner creates plan for THAT phase only (focused scope)
4. Planner updates PRD phases table with plan link
5. Developer reads plan (linked to PRD) for full context

**When to create PRD:** HIGH/EPIC complexity features requiring cross-team coordination.
**When to skip:** LOW/MEDIUM complexity features with clear, self-contained scope.

**Memory Takeaway:** PRDs are the single source of truth for feature status. Check PRD phases table to answer "what's the status of Feature X?"
```

**Verify**:
```bash
grep -c "PRD-to-Plan Pipeline Patterns" .claude/context/memory/learnings.md
```
Expected: `1`

**Rollback**: Remove appended section.

---

### Task 2.3: Append search preference patterns to learnings.md

**Target Agent**: `developer`
**Recommended Skills**: `verification-before-completion`

**File**: `.claude/context/memory/learnings.md`
**Location**: Append at END of file (after Task 2.2 content)

**RED**:
```bash
grep -c "Hybrid Search Preference Patterns" .claude/context/memory/learnings.md
```
Expected: `0`

**GREEN (exact content to APPEND)**:

```markdown

---

## 2026-02-09: Hybrid Search Preference Patterns (Enterprise Improvement Plan)

**Pattern:** Prefer hybrid search skills over Grep for token efficiency

**Search Preference Order:**
1. `pnpm search:code "query"` -- Hybrid (text + semantic), fastest, recommended default
2. `Skill({ skill: 'ripgrep', args: 'pattern' })` -- Fast text search (0.2-0.5s)
3. `Skill({ skill: 'code-semantic-search', args: 'conceptual query' })` -- Finds similar code by meaning
4. `Skill({ skill: 'code-structural-search', args: 'pattern --lang ts' })` -- AST-based precise matching
5. `Grep({ pattern: '...', ... })` -- FALLBACK ONLY: advanced regex (PCRE2), multiline, raw content

**Token Efficiency Comparison:**
- Grep: Returns full file contents (1000+ tokens per match)
- Hybrid search: Returns file:line references (50-100 tokens per result)
- Result: 10-20x token savings with hybrid search

**When Grep is still necessary:**
- Advanced regex with lookahead/lookbehind (PCRE2 -P flag)
- Multiline pattern matching (grep -U)
- Raw content inspection (need full file output)
- Specific file filtering with complex glob patterns

**Memory Takeaway:** Default to hybrid search (ripgrep skill or pnpm search:code). Use Grep only when you need features that hybrid search cannot provide (advanced regex, multiline, raw content).
```

**Verify**:
```bash
grep -c "Hybrid Search Preference Patterns" .claude/context/memory/learnings.md
```
Expected: `1`

**Rollback**: Remove appended section.

---

### Phase 2 Verification Gate

```bash
grep "Context-Compressor Trigger Patterns" .claude/context/memory/learnings.md
grep "PRD-to-Plan Pipeline Patterns" .claude/context/memory/learnings.md
grep "Hybrid Search Preference Patterns" .claude/context/memory/learnings.md
```

All 3 must return matches.

---

## COMMIT CHECKPOINT

**Trigger**: 15+ files will be modified in this plan (exceeds 10-file threshold).

**Action**: After Phase 2 completes, commit Phase 1-2 changes before starting Phase 3.

```bash
git add .claude/config.yaml .env.example .claude/CLAUDE.md .claude/context/memory/learnings.md
git commit -m "checkpoint: Phase 1-2 enterprise improvements (config + memory)"
```

**Purpose**: Creates recovery point. If Phase 3 fails, can revert to this checkpoint without losing Phase 1-2 progress.

---

## Phase 3: Core Agent Updates

**Purpose**: Update agent definitions with new capability sections (all ADDITIVE)
**Duration**: ~3-4 hours
**Dependencies**: Phase 1 and Phase 2 complete
**Parallel OK**: Yes (all 7 tasks modify different files)

### Task 3.1: planner.md -- Add 4 new sections

**Target Agent**: `developer`
**Recommended Skills**: `verification-before-completion`

**File**: `.claude/agents/core/planner.md`
**Locations**: 4 insertion points (all additive)

#### 3.1a: Add "Context Management" section (after line 609, after "Skill Discovery" section)

**RED**:
```bash
grep -c "Context Management" .claude/agents/core/planner.md
```
Expected: `0`

**GREEN (exact content to INSERT after the line `**Important**: Always use \`Skill()\` tool - reading skill files alone does NOT apply them.` which is at line 609)**:

```markdown

## Context Management (Long Sessions)

For HIGH/EPIC complexity plans (50+ tasks, 8+ phases):

**When to compress:**
- After Phase 0 research (40+ message turns accumulated)
- When plan exceeds 50 tasks (large output accumulation)
- When message count exceeds 50 turns

**How to compress:**
```javascript
Skill({ skill: 'context-compressor' });
```

**What to preserve:** Research findings, key decisions, active task list, file paths
```

#### 3.1b: Add "Hypothesis Framing" subsection (inside Phase 0, after "Research Requirements" block at ~line 268)

Find the line that reads:
```
**Research Output**: `.claude/context/artifacts/research-reports/[feature-name]-research.md`
```

Insert AFTER that line:

```markdown

#### Hypothesis Framing (RECOMMENDED)

For each major decision in the plan, frame as a testable hypothesis:

Template: "We believe [capability] will [solve problem] for [users].
We'll know we're right when [measurable outcome]."

This makes plans falsifiable and success criteria explicit.
```

#### 3.1c: Add "PRD Integration" section (after Phase 0 section, before "Mandatory Final Phase")

Find the heading:
```
## Mandatory Final Phase (CANNOT BE OMITTED)
```

Insert BEFORE that line:

```markdown
## PRD Integration (When Available)

If a PRD exists for this feature:
1. Read PRD at `.claude/context/artifacts/specs/{feature}-prd-*.md`
2. Parse Implementation Phases table
3. Select next pending phase (where dependencies are complete)
4. Create plan for THAT phase only (focused scope)
5. After plan creation, update PRD phases table with plan link

```

#### 3.1d: Strengthen search tool guidance (lines 322-353)

Find this text (around line 347):
```markdown
**Alternative - Grep() tool** (for simple exact matches):
```

Replace with:
```markdown
**Alternative - Grep() tool** (fallback for advanced regex):
```

Find the text (around line 353):
```markdown
Use Grep when you need exact pattern matching with specific file filtering. For comprehensive discovery, prefer `pnpm search:code`.
```

Replace with:
```markdown
Use Grep ONLY when you need advanced regex (PCRE2 lookahead/lookbehind), multiline patterns, or raw content inspection. For all other searches, prefer `pnpm search:code` or `Skill({ skill: 'ripgrep' })`.

**Search Preference Order:**
1. `pnpm search:code` (hybrid, fastest, recommended)
2. `Skill({ skill: 'ripgrep' })` (fast text search)
3. `Skill({ skill: 'code-semantic-search' })` (conceptual search)
4. `Grep()` (fallback: advanced regex only)
```

**Verify (all 4 additions)**:
```bash
grep -c "Context Management" .claude/agents/core/planner.md
grep -c "Hypothesis Framing" .claude/agents/core/planner.md
grep -c "PRD Integration" .claude/agents/core/planner.md
grep -c "Search Preference Order" .claude/agents/core/planner.md
```
All 4 must return `1`.

**YAML frontmatter validation:**
```bash
node -e "const fs = require('fs'); const content = fs.readFileSync('.claude/agents/core/planner.md','utf8'); const match = content.match(/^---\n([\s\S]*?)\n---/); if(match) { require('js-yaml').load(match[1]); console.log('YAML OK'); } else { console.log('NO FRONTMATTER'); process.exit(1); }"
```

**Rollback**: Remove each added section by its header.

---

### Task 3.2: developer.md -- Add "Context Management" section

**Target Agent**: `developer`
**Recommended Skills**: `verification-before-completion`

**File**: `.claude/agents/core/developer.md`
**Location**: Before line 387 (before `## Memory Protocol (MANDATORY)`)

**RED**:
```bash
grep -c "Context Management" .claude/agents/core/developer.md
```
Expected: `0`

**GREEN (exact content to INSERT before the `## Memory Protocol (MANDATORY)` heading at line 387)**:

```markdown
## Context Management (Long Implementations)

For multi-file implementations (10+ files, 3000+ LOC):

**When to compress:**
- After completing a logical unit (Phase N tasks, 5+ files changed)
- Before starting next implementation phase
- When message count exceeds 50 turns

**How to compress:**
```javascript
Skill({ skill: 'context-compressor' });
```

**What to preserve:** Active task IDs, file paths modified, test results, key decisions

```

**Verify**:
```bash
grep -c "Context Management" .claude/agents/core/developer.md
```
Expected: `1`

**YAML frontmatter validation:**
```bash
node -e "const fs = require('fs'); const content = fs.readFileSync('.claude/agents/core/developer.md','utf8'); const match = content.match(/^---\n([\s\S]*?)\n---/); if(match) { require('js-yaml').load(match[1]); console.log('YAML OK'); } else { console.log('NO FRONTMATTER'); process.exit(1); }"
```

**Rollback**: Remove section "## Context Management (Long Implementations)" and its content.

---

### Task 3.3: pm.md -- Add "PRD Workflow" section

**Target Agent**: `developer`
**Recommended Skills**: `verification-before-completion`

**File**: `.claude/agents/core/pm.md`
**Location**: After line 93 (after the Responsibilities section, before "## Code Search")

Find:
```markdown
## Code Search
```
(at line 94)

Insert BEFORE that line:

**RED**:
```bash
grep -c "PRD Workflow" .claude/agents/core/pm.md
```
Expected: `0`

**GREEN (exact content to INSERT)**:

```markdown
## PRD Workflow (Structured Product Requirements)

**When to create PRD**: HIGH/EPIC complexity features requiring cross-team coordination.
**When to skip**: LOW/MEDIUM complexity features with clear, self-contained scope.

### PRD Template

Use the structured PRD template at `.claude/templates/prd-template.md` for all PRDs.

**Required Sections:**
- Problem Statement + Evidence (validates "why" before "how")
- Key Hypothesis (testable assumption with measurable outcome)
- MoSCoW Capabilities (Must/Should/Could/Won't with rationale)
- Implementation Phases table (Status/Depends/Plan Link columns)
- Decisions Log (Decision/Choice/Alternatives/Rationale)
- Success Metrics (Metric/Target/How Measured)

**Output Location:** `.claude/context/artifacts/specs/{feature-name}-prd-{YYYY-MM-DD}.md`

### PRD-to-Plan Handoff

After PRD is created:
1. Planner reads PRD -> selects next pending phase -> creates plan
2. Planner updates PRD phases table with plan link
3. Developer reads plan (linked to PRD) for full context

```

**Verify**:
```bash
grep -c "PRD Workflow" .claude/agents/core/pm.md
grep -c "prd-template.md" .claude/agents/core/pm.md
```
Both must return `1` or more.

**YAML frontmatter validation:**
```bash
node -e "const fs = require('fs'); const content = fs.readFileSync('.claude/agents/core/pm.md','utf8'); const match = content.match(/^---\n([\s\S]*?)\n---/); if(match) { require('js-yaml').load(match[1]); console.log('YAML OK'); } else { console.log('NO FRONTMATTER'); process.exit(1); }"
```

**Rollback**: Remove section "## PRD Workflow (Structured Product Requirements)" and its content.

---

### Task 3.4: qa.md -- Add search skills to frontmatter + "Search Protocol" section

**Target Agent**: `developer`
**Recommended Skills**: `verification-before-completion`

**File**: `.claude/agents/core/qa.md`
**Location**: Frontmatter (lines 28-42) and body (before line 279 `## Memory Protocol`)

**Note**: qa.md ALREADY has `code-semantic-search`, `code-structural-search`, and `ripgrep` in its frontmatter skills list (lines 32-33, 37). No frontmatter change needed.

**RED**:
```bash
grep -c "## Search Protocol" .claude/agents/core/qa.md
```
Expected: `0`

**GREEN (exact content to INSERT before the `## Memory Protocol (MANDATORY)` heading at line 279)**:

```markdown
## Search Protocol

**PREFER** hybrid search skills over Grep for code discovery:

| What You Need | Use This | Example |
|---------------|----------|---------|
| Test patterns | code-structural-search | `Skill({ skill: 'code-structural-search', args: 'describe($NAME, function() { $$ }) --lang ts' })` |
| Test file discovery | ripgrep | `Skill({ skill: 'ripgrep', args: '*.test.ts' })` |
| Conceptual test patterns | code-semantic-search | `Skill({ skill: 'code-semantic-search', args: 'error handling test patterns' })` |
| Advanced regex (fallback) | Grep | `Grep({ pattern: 'complex-regex', ... })` |

```

**Verify**:
```bash
grep -c "## Search Protocol" .claude/agents/core/qa.md
```
Expected: `1`

**YAML frontmatter validation:**
```bash
node -e "const fs = require('fs'); const content = fs.readFileSync('.claude/agents/core/qa.md','utf8'); const match = content.match(/^---\n([\s\S]*?)\n---/); if(match) { require('js-yaml').load(match[1]); console.log('YAML OK'); } else { console.log('NO FRONTMATTER'); process.exit(1); }"
```

**Rollback**: Remove section "## Search Protocol" and its content.

---

### Task 3.5: code-reviewer.md -- Add "Search Protocol" section

**Target Agent**: `developer`
**Recommended Skills**: `verification-before-completion`

**File**: `.claude/agents/specialized/code-reviewer.md`
**Location**: Before line 503 (`## Memory Protocol (MANDATORY)`)

**Note**: code-reviewer.md ALREADY has `code-semantic-search`, `code-structural-search`, and `ripgrep` in its frontmatter skills list (lines 17-18, 25). No frontmatter change needed.

**RED**:
```bash
grep -c "## Search Protocol" .claude/agents/specialized/code-reviewer.md
```
Expected: `0`

**GREEN (exact content to INSERT before the `## Memory Protocol (MANDATORY)` heading at line 503)**:

```markdown
## Search Protocol

**PREFER** hybrid search skills over Grep for code review:

| What You Need | Use This | Example |
|---------------|----------|---------|
| Similar code patterns | code-semantic-search | `Skill({ skill: 'code-semantic-search', args: 'error handling patterns' })` |
| Exact code structure | code-structural-search | `Skill({ skill: 'code-structural-search', args: 'class $NAME extends $BASE { $$ } --lang ts' })` |
| Fast keyword search | ripgrep | `Skill({ skill: 'ripgrep', args: 'pattern' })` |
| Advanced regex (fallback) | Grep | Use only for PCRE2 lookahead/lookbehind patterns |

```

**Verify**:
```bash
grep -c "## Search Protocol" .claude/agents/specialized/code-reviewer.md
```
Expected: `1`

**YAML frontmatter validation:**
```bash
node -e "const fs = require('fs'); const content = fs.readFileSync('.claude/agents/specialized/code-reviewer.md','utf8'); const match = content.match(/^---\n([\s\S]*?)\n---/); if(match) { require('js-yaml').load(match[1]); console.log('YAML OK'); } else { console.log('NO FRONTMATTER'); process.exit(1); }"
```

**Rollback**: Remove section "## Search Protocol" and its content.

---

### Task 3.6: code-simplifier.md -- Verify search skills (no change expected)

**Target Agent**: `developer`
**Recommended Skills**: `verification-before-completion`

**File**: `.claude/agents/specialized/code-simplifier.md`
**Location**: Frontmatter (lines 9-21)

**Verification Only**: code-simplifier.md already has `code-semantic-search` (line 14), `code-structural-search` (line 15), and `ripgrep` (line 20) in its frontmatter. No change needed.

**Verify**:
```bash
grep "code-semantic-search" .claude/agents/specialized/code-simplifier.md
grep "code-structural-search" .claude/agents/specialized/code-simplifier.md
grep "ripgrep" .claude/agents/specialized/code-simplifier.md
```
All 3 must return matches.

**If ANY grep returns no match**: Add the missing skill to the frontmatter `skills:` list, following the same YAML array format as existing entries.

**Rollback**: N/A (verification only, no change expected).

---

### Task 3.7: master-orchestrator.md -- Add "Context Management" section

**Target Agent**: `developer`
**Recommended Skills**: `verification-before-completion`

**File**: `.claude/agents/orchestrators/master-orchestrator.md`
**Location**: Before line 219 (`## Memory Protocol (MANDATORY)`)

**RED**:
```bash
grep -c "Context Management" .claude/agents/orchestrators/master-orchestrator.md
```
Expected: `0`

**GREEN (exact content to INSERT before the `## Memory Protocol (MANDATORY)` heading at line 219)**:

```markdown
## Context Management (Multi-Phase Workflows)

For workflows with 3+ phases:

**When to compress:**
- Between workflow phases (Phase N complete, Phase N+1 starting)
- When accumulated agent outputs exceed 50 message turns
- After aggregating results from parallel agent spawns

**How to compress:**
```javascript
Skill({ skill: 'context-compressor' });
```

**What to preserve:** Phase summaries, agent outputs, active decisions, remaining phases

```

**Verify**:
```bash
grep -c "Context Management" .claude/agents/orchestrators/master-orchestrator.md
```
Expected: `1`

**YAML frontmatter validation:**
```bash
node -e "const fs = require('fs'); const content = fs.readFileSync('.claude/agents/orchestrators/master-orchestrator.md','utf8'); const match = content.match(/^---\n([\s\S]*?)\n---/); if(match) { require('js-yaml').load(match[1]); console.log('YAML OK'); } else { console.log('NO FRONTMATTER'); process.exit(1); }"
```

**Rollback**: Remove section "## Context Management (Multi-Phase Workflows)" and its content.

---

### Phase 3 Verification Gate

```bash
# Verify all agent changes
grep "Context Management" .claude/agents/core/planner.md
grep "Hypothesis Framing" .claude/agents/core/planner.md
grep "PRD Integration" .claude/agents/core/planner.md
grep "Search Preference Order" .claude/agents/core/planner.md
grep "Context Management" .claude/agents/core/developer.md
grep "PRD Workflow" .claude/agents/core/pm.md
grep "Search Protocol" .claude/agents/core/qa.md
grep "Search Protocol" .claude/agents/specialized/code-reviewer.md
grep "code-semantic-search" .claude/agents/specialized/code-simplifier.md
grep "Context Management" .claude/agents/orchestrators/master-orchestrator.md

# Verify all YAML frontmatters parse
for f in .claude/agents/core/planner.md .claude/agents/core/developer.md .claude/agents/core/pm.md .claude/agents/core/qa.md .claude/agents/specialized/code-reviewer.md .claude/agents/specialized/code-simplifier.md .claude/agents/orchestrators/master-orchestrator.md; do node -e "const fs=require('fs');const c=fs.readFileSync('$f','utf8');const m=c.match(/^---\n([\s\S]*?)\n---/);if(m){require('js-yaml').load(m[1]);console.log('OK:','$f')}else{console.log('FAIL:','$f');process.exit(1)}"; done

# Run lint and format
pnpm lint:fix
pnpm format
```

All must pass with 0 errors.

---

## Phase 4: Template Updates

**Purpose**: Update templates so new agents inherit improvements
**Duration**: ~2 hours
**Dependencies**: Phase 3 complete
**Parallel OK**: Yes (all 3 tasks modify different files)

### Task 4.1: universal-agent-spawn.md -- Add compression checklist

**Target Agent**: `developer`
**Recommended Skills**: `verification-before-completion`

**File**: `.claude/templates/spawn/universal-agent-spawn.md`
**Location**: After line 338 (after "Memory Protocol" section, before "## Model Selection Guide" at line 342)

Find:
```markdown
## Model Selection Guide
```
(at line 342)

Insert BEFORE that line:

**RED**:
```bash
grep -c "Context Compression" .claude/templates/spawn/universal-agent-spawn.md
```
Expected: `0`

**GREEN (exact content to INSERT)**:

```markdown
## Context Compression (Long Tasks)

If your task involves 50+ messages, 10+ file changes, or multi-phase work:
- [ ] Check if context-compressor needed at safe checkpoints
- [ ] Invoke `Skill({ skill: 'context-compressor' })` between phases or after logical units
- [ ] Preserve: active task IDs, key decisions, file paths, test results

```

**Verify**:
```bash
grep -c "Context Compression" .claude/templates/spawn/universal-agent-spawn.md
```
Expected: `1`

**Rollback**: Remove section "## Context Compression (Long Tasks)" and its content.

---

### Task 4.2: prd-template.md -- Create NEW structured PRD template

**Target Agent**: `developer`
**Recommended Skills**: `verification-before-completion`

**File**: `.claude/templates/prd-template.md` (NEW FILE)
**Location**: N/A (new file)

**RED**:
```bash
test -f .claude/templates/prd-template.md && echo "EXISTS" || echo "NOT_FOUND"
```
Expected: `NOT_FOUND`

**GREEN (exact content for NEW file)**:

```markdown
# PRD: {{FEATURE_NAME}}

**Version**: {{VERSION}}
**Author**: {{AUTHOR}}
**Date**: {{DATE}}
**Status**: {{STATUS}}

---

## Problem Statement

[What problem does this solve? Why now?]

## Evidence

[Data, user feedback, metrics that demonstrate the problem]

## Key Hypothesis

We believe [capability] will [solve problem] for [users].
We'll know we're right when [measurable outcome].

## What We're NOT Building

[Explicit scope exclusions]

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| ... | ... | ... |

## Core Capabilities (MoSCoW)

| Priority | Capability | Rationale |
|----------|-----------|-----------|
| Must | ... | ... |
| Should | ... | ... |
| Could | ... | ... |
| Won't | ... | ... |

## Users & Context

**Primary User**: [Who, current behavior, trigger, success state]

**Job to Be Done**: When [situation], [user] wants [outcome], so they can [benefit].

## Solution Detail

### MVP Scope

[Phase 1 deliverables]

### User Flow

[Critical path description]

## Technical Approach

**Feasibility**: [HIGH/MEDIUM/LOW]

[Architecture notes, dependencies, integration points]

## Implementation Phases

| # | Phase | Description | Status | Parallel | Depends | Plan Link |
|---|-------|-------------|--------|----------|---------|-----------|
| 1 | ... | ... | pending | No | - | - |
| 2 | ... | ... | pending | No | 1 | - |

## Decisions Log

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| ... | ... | ... | ... |

## Research Summary

**Market Context:** [external research]
**Technical Context:** [feasibility, existing patterns]

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| ... | ... | ... |

## Open Questions

- [ ] ...

---

*Generated: {{DATE}}*
*Status: {{STATUS}}*
```

**Verify**:
```bash
test -f .claude/templates/prd-template.md && echo "EXISTS" || echo "NOT_FOUND"
grep "Implementation Phases" .claude/templates/prd-template.md
grep "Decisions Log" .claude/templates/prd-template.md
grep "MoSCoW" .claude/templates/prd-template.md
grep "Key Hypothesis" .claude/templates/prd-template.md
```
All must succeed.

**Rollback**: Delete `.claude/templates/prd-template.md`.

---

### Task 4.3: plan-template.md -- Add Hypothesis, Patterns, Mandatory Reading sections

**Target Agent**: `developer`
**Recommended Skills**: `verification-before-completion`

**File**: `.claude/templates/plan-template.md`
**Location**: After line 129 (after "Phase 0 Tasks" section, before "### Phase 1:")

Find:
```markdown
**Success Criteria**: Research complete, decisions documented, constitution checkpoint passed

---

### Phase 1: {{PHASE_1_NAME}} ({{PHASE_1_TYPE}})
```

Insert between the `---` and `### Phase 1:` lines:

**RED**:
```bash
grep -c "Hypothesis Framing" .claude/templates/plan-template.md
```
Expected: `0`

**GREEN (exact content to INSERT)**:

```markdown

#### Hypothesis Framing

For each major technical decision, state:
"We believe [approach] will [achieve outcome]. We'll know when [metric]."

#### Mandatory Reading

Before planning, agents MUST read these files:
- [List specific files with line ranges]
- [Include code snippets to mirror]

#### Patterns to Mirror

Copy these existing patterns from the codebase:
- [Pattern 1: file path + description]
- [Pattern 2: file path + description]

```

**Verify**:
```bash
grep -c "Hypothesis Framing" .claude/templates/plan-template.md
grep -c "Mandatory Reading" .claude/templates/plan-template.md
grep -c "Patterns to Mirror" .claude/templates/plan-template.md
```
All must return `1`.

**Rollback**: Remove the 3 added subsections.

---

### Phase 4 Verification Gate

```bash
# All template changes verified
grep "Context Compression" .claude/templates/spawn/universal-agent-spawn.md
test -f .claude/templates/prd-template.md && echo "prd-template EXISTS"
grep "Hypothesis Framing" .claude/templates/plan-template.md
grep "Mandatory Reading" .claude/templates/plan-template.md
grep "Patterns to Mirror" .claude/templates/plan-template.md

# Verify prd-template has all required sections
grep "Implementation Phases" .claude/templates/prd-template.md
grep "Decisions Log" .claude/templates/prd-template.md
grep "MoSCoW" .claude/templates/prd-template.md
```

---

## Phase 5: New Skill Creation (prd-generator)

**Purpose**: Create the `prd-generator` skill for structured PRD creation
**Duration**: ~3-4 hours
**Dependencies**: Phase 4 complete (prd-template.md must exist)
**Parallel OK**: No (sequential, uses creator workflow)

### Task 5.1: Create prd-generator skill via skill-creator workflow

**Target Agent**: `developer` (invokes skill-creator workflow)
**Recommended Skills**: `research-synthesis`, `skill-creator`, `verification-before-completion`

**CRITICAL**: This task MUST use the skill-creator workflow, NOT direct file writes. The `unified-creator-guard.cjs` hook will BLOCK direct writes to `.claude/skills/`.

**Execution Steps**:

1. Invoke `Skill({ skill: 'research-synthesis' })` to research PRD best practices
2. Invoke `Skill({ skill: 'skill-creator' })` to create the skill with these specifications:

**Skill Specification**:
- **Name**: `prd-generator`
- **Purpose**: Guide PM through structured PRD creation using `.claude/templates/prd-template.md`
- **Assigned Agents**: `pm`
- **Skills Used**: `progressive-disclosure` (for requirements gathering), `template-renderer` (for PRD output)
- **Output**: `.claude/context/artifacts/specs/{feature-name}-prd-{date}.md`
- **Workflow**: Interactive question phases -> fill template -> validate sections -> save PRD
- **Required Sections** (validation): Problem Statement, Key Hypothesis, MoSCoW table, Implementation Phases table, Decisions Log

3. Skill-creator handles automatically:
   - Creates `.claude/skills/prd-generator/SKILL.md`
   - Adds entry to `.claude/context/artifacts/catalogs/skill-catalog.md`
   - Assigns skill to `pm` agent
   - Adds routing keywords

**RED**:
```bash
test -d .claude/skills/prd-generator && echo "EXISTS" || echo "NOT_FOUND"
```
Expected: `NOT_FOUND`

**Verify (after skill-creator completes)**:
```bash
# Skill file exists
test -f .claude/skills/prd-generator/SKILL.md && echo "SKILL EXISTS" || echo "MISSING"

# Catalog has entry
grep -c "prd-generator" .claude/context/artifacts/catalogs/skill-catalog.md

# PM agent has skill assigned (may need manual verification)
grep "prd-generator" .claude/agents/core/pm.md || echo "NOTE: May need manual assignment to pm.md frontmatter"
```

**Rollback**: Delete `.claude/skills/prd-generator/` directory and remove catalog entry.

---

### Phase 5 Verification Gate

```bash
test -f .claude/skills/prd-generator/SKILL.md && echo "SKILL OK"
grep "prd-generator" .claude/context/artifacts/catalogs/skill-catalog.md && echo "CATALOG OK"
```

Both must pass.

---

## Phase 6: Optional Hooks (DEFERRED)

**Purpose**: Add non-blocking advisory hooks for search and compression
**Duration**: ~2-3 hours
**Dependencies**: Phase 3 complete
**Parallel OK**: Yes (both independent)
**Status**: OPTIONAL -- can be deferred to a future session

> **NOTE**: Phase 6 is marked OPTIONAL by the architect. These hooks provide a safety net for adoption but are not required for the core improvements. Include them in a future sprint if adoption metrics show agents are not following the new guidance.

### Task 6.1: [DEFERRED] Create hybrid-search-advisor.cjs hook

**Target Agent**: `developer` (invokes `hook-creator` skill)
**Recommended Skills**: `hook-creator`, `verification-before-completion`

**File**: `.claude/hooks/optimization/hybrid-search-advisor.cjs` (NEW)
**Event**: PreToolUse(Grep)
**Mode**: Non-blocking (exit 0 always, warn via stderr)
**Behavior**: When agent uses Grep, emit: "Consider Skill({ skill: 'ripgrep' }) for token efficiency"
**Config**: `SEARCH_ADVISOR_HOOK=warn|off` (default: warn)

**IMPORTANT**: Must use `hook-creator` skill (not direct write). Settings.json changes require session restart.

**Verify**:
```bash
test -f .claude/hooks/optimization/hybrid-search-advisor.cjs && echo "HOOK EXISTS"
# Test hook protocol: echo '{"tool_name":"Grep"}' | node .claude/hooks/optimization/hybrid-search-advisor.cjs
```

**Rollback**: Unregister from settings.json; delete hook file; restart session.

---

### Task 6.2: [DEFERRED] Create compression-reminder-check.cjs hook

**Target Agent**: `developer` (invokes `hook-creator` skill)
**Recommended Skills**: `hook-creator`, `verification-before-completion`

**File**: `.claude/hooks/session/compression-reminder-check.cjs` (NEW)
**Event**: PreToolUse (broad trigger, sampled ~every 10th invocation)
**Mode**: Non-blocking (exit 0 always)
**Behavior**: When session exceeds estimated 150K tokens, write compression-reminder.txt
**Config**: Uses existing `auto_compression` config from config.yaml

**IMPORTANT**: Must use `hook-creator` skill (not direct write). Settings.json changes require session restart.

**Verify**:
```bash
test -f .claude/hooks/session/compression-reminder-check.cjs && echo "HOOK EXISTS"
```

**Rollback**: Unregister from settings.json; delete hook file; restart session.

---

## Phase FINAL: Evolution & Reflection Check

**Purpose**: Quality assessment and learning extraction

**Tasks**:

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Spawn Command**:

```javascript
Task({
  subagent_type: 'reflection-agent',
  model: 'sonnet',
  description: 'Session reflection and learning extraction',
  allowed_tools: ['Read', 'Write', 'Edit', 'Bash', 'TaskUpdate', 'TaskList', 'Skill'],
  prompt: 'You are REFLECTION-AGENT. Read .claude/agents/core/reflection-agent.md. Analyze the completed work from this plan, extract learnings to memory files, and check for evolution opportunities (patterns that suggest new agents or skills should be created).',
});
```

**Success Criteria**:

- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Files Created/Modified Summary

### Modified Files (13)

| File | Phase | Change Type |
|------|-------|-------------|
| `.claude/config.yaml` | 1 | CONFIG (1 line) |
| `.env.example` | 1 | ADDITIVE (~8 lines) |
| `.claude/CLAUDE.md` | 1 | MODIFICATION (Section 7) |
| `.claude/context/memory/learnings.md` | 2 | ADDITIVE (~90 lines) |
| `.claude/agents/core/planner.md` | 3 | ADDITIVE (~65 lines, 4 sections) |
| `.claude/agents/core/developer.md` | 3 | ADDITIVE (~15 lines) |
| `.claude/agents/core/pm.md` | 3 | ADDITIVE (~40 lines) |
| `.claude/agents/core/qa.md` | 3 | ADDITIVE (~15 lines) |
| `.claude/agents/specialized/code-reviewer.md` | 3 | ADDITIVE (~15 lines) |
| `.claude/agents/specialized/code-simplifier.md` | 3 | VERIFY ONLY |
| `.claude/agents/orchestrators/master-orchestrator.md` | 3 | ADDITIVE (~15 lines) |
| `.claude/templates/spawn/universal-agent-spawn.md` | 4 | ADDITIVE (~8 lines) |
| `.claude/templates/plan-template.md` | 4 | ADDITIVE (~20 lines) |

### New Files (2+)

| File | Phase | Type |
|------|-------|------|
| `.claude/templates/prd-template.md` | 4 | Template (~80 lines) |
| `.claude/skills/prd-generator/SKILL.md` | 5 | Skill (via creator) |

### Optional New Files (Phase 6, deferred)

| File | Phase | Type |
|------|-------|------|
| `.claude/hooks/optimization/hybrid-search-advisor.cjs` | 6 | Hook |
| `.claude/hooks/session/compression-reminder-check.cjs` | 6 | Hook |

---

## Agent Assignment Matrix

| Phase | Task(s) | Target Agent | Recommended Skills |
|-------|---------|-------------|-------------------|
| 1 | 1.1, 1.2, 1.3 | `developer` | `verification-before-completion` |
| 2 | 2.1, 2.2, 2.3 | `developer` | `verification-before-completion` |
| 3 | 3.1-3.7 | `developer` | `verification-before-completion` |
| 4 | 4.1, 4.2, 4.3 | `developer` | `verification-before-completion` |
| 5 | 5.1 | `developer` | `research-synthesis`, `skill-creator`, `verification-before-completion` |
| 6 | 6.1, 6.2 | `developer` | `hook-creator`, `verification-before-completion` |
| FINAL | Reflection | `reflection-agent` | -- |

---

## Timeline Summary

| Phase | Tasks | Duration | Parallel? | Key Deliverables |
|-------|-------|----------|-----------|------------------|
| 1: Config | 3 | 30 min | Yes | Config enabled, env updated, CLAUDE.md corrected |
| 2: Memory | 3 | 30 min | Sequential (same file) | 3 learning patterns appended |
| CHECKPOINT | 1 | 5 min | -- | Git commit for recovery |
| 3: Agents | 7 | 3-4 hours | Yes (different files) | 7 agent files updated |
| 4: Templates | 3 | 2 hours | Yes | 2 templates updated, 1 new |
| 5: Skill | 1 | 3-4 hours | No | prd-generator skill created |
| 6: Hooks | 2 | 2-3 hours | Yes | DEFERRED |
| FINAL | 1 | 30 min | No | Reflection and learnings |
| **TOTAL** | **19** | **~9-11 hours** | | **15 files touched** |

---

## Risks

| Risk | Impact | Mitigation | Rollback |
|------|--------|------------|----------|
| YAML frontmatter broken after edit | HIGH | Validate YAML after every agent file change | Remove added section |
| Skill-creator workflow fails (Phase 5) | MEDIUM | Retry with explicit skill spec; fallback to manual creation with CREATOR_GUARD=warn | Delete skill directory |
| Settings.json cache stale (Phase 6) | LOW | Document: user must restart session for hooks | Unregister hooks |
| learnings.md conflicts (Phase 2) | LOW | Execute 2.1/2.2/2.3 sequentially, not in parallel | Remove appended sections |
| planner.md merge conflicts (multiple additions) | LOW | All additions are at different locations; apply sequentially | Remove each section by header |

---

## Quality Checklist (IEEE 1028 + Context-Specific)

### Code Quality
- [ ] All changes follow project style guide (kebab-case filenames, markdown conventions)
- [ ] No code duplication across agent "Context Management" sections (acceptable: similar pattern, different agent-specific details)

### Testing
- [ ] Each task has RED/GREEN/VERIFY commands
- [ ] YAML frontmatter validated for every modified agent file
- [ ] Phase gates verified before advancing

### Security
- [ ] No secrets or credentials introduced
- [ ] No security-critical code modified (all changes are documentation/config)

### Documentation
- [ ] learnings.md updated with 3 new patterns (Phase 2)
- [ ] Agent definitions updated with new capability sections (Phase 3)
- [ ] Templates updated for future agents (Phase 4)

### Context-Specific (AI-Generated)
- [ ] [AI-GENERATED] All changes are ADDITIVE (zero deletions of existing content)
- [ ] [AI-GENERATED] config.yaml parses correctly after change
- [ ] [AI-GENERATED] .env.example follows existing comment/variable format
- [ ] [AI-GENERATED] CLAUDE.md Section 7 counts match actual agent skill assignments
- [ ] [AI-GENERATED] prd-template.md contains all 6 required sections
- [ ] [AI-GENERATED] Phase 5 uses skill-creator workflow (not direct write)
- [ ] [AI-GENERATED] Phase 6 hooks are marked DEFERRED

---

**Plan Created**: 2026-02-09
**Total Tasks**: 19 atomic tasks (17 active + 2 deferred)
**Estimated Implementation Time**: 9-11 hours (Phases 1-5 + FINAL)
**Zero Regression Confidence**: HIGH
