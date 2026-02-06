# CLAUDE.md Compression Implementation Plan

**Version:** 1.0.0
**Date:** 2026-01-31
**Status:** Design Complete - Ready for Implementation
**Target:** Compress CLAUDE.md from 1200 lines → ≤450 lines (62.5% reduction)
**Enforcement Preservation:** 100% (router-first protocol unchanged)

---

## EXECUTIVE SUMMARY

Restructure CLAUDE.md by extracting 11 non-critical reference sections to `.claude/docs/` while preserving all router-enforcement sections inline. This achieves the 450-line target while maintaining 100% router-first protocol enforcement.

**Key Metrics:**
- Current size: ~1200 lines
- Target size: ≤450 lines
- Reduction: ~750 lines (62.5%)
- Enforcement-critical sections: 300 lines (stay inline)
- Extractable reference material: 900 lines (move to @files)
- External reference files: 11 files

---

## 1. FILE BREAKDOWN SPECIFICATION

### 1.1 External Reference Files (@files)

All external files will be created in `.claude/docs/` directory.

| File Name | Purpose | Source Lines | Target Lines | Critical? |
|-----------|---------|--------------|--------------|-----------|
| **@AGENT_ROUTING_TABLE.md** | Agent routing matrix | 70-100 | ~80 | ❌ Reference |
| **@CREATOR_SKILLS_TABLE.md** | Creator skill mapping | 15-20 | ~18 | ❌ Reference |
| **@TOOL_REFERENCE.md** | Complete tool catalog | 200-250 | ~230 | ❌ Reference |
| **@MODEL_SELECTION.md** | Model selection guide | 30-40 | ~35 | ❌ Reference |
| **@SKILL_CATALOG_TABLE.md** | Workflow enhancement skills | 60-80 | ~70 | ❌ Reference |
| **@ENTERPRISE_WORKFLOWS.md** | Workflow path reference | 40-50 | ~45 | ❌ Reference |
| **@ENVIRONMENT_CONFIG.md** | Environment variable reference | 50-70 | ~60 | ❌ Reference |
| **@DIRECTORY_STRUCTURE.md** | Directory layout reference | 80-100 | ~90 | ❌ Reference |
| **@ENFORCEMENT_HOOKS.md** | Hook enforcement details | 30-40 | ~35 | ❌ Reference |
| **@TASK_TRACKING_GUIDE.md** | TaskUpdate best practices | 40-50 | ~45 | ❌ Reference |
| **@EVOLUTION_WORKFLOW.md** | EVOLVE workflow details | 40-50 | ~45 | ❌ Reference |

**Total Extractable:** ~900 lines

### 1.2 Cross-Dependencies Between @files

```
@AGENT_ROUTING_TABLE.md
  ├─ References: @CREATOR_SKILLS_TABLE.md (for skill invocation)
  └─ References: @MODEL_SELECTION.md (for model recommendations)

@TOOL_REFERENCE.md
  ├─ References: @ENFORCEMENT_HOOKS.md (tool validation hooks)
  └─ References: @AGENT_ROUTING_TABLE.md (agent-specific toolsets)

@EVOLUTION_WORKFLOW.md
  ├─ References: @CREATOR_SKILLS_TABLE.md (creator skill invocation)
  └─ References: @ENFORCEMENT_HOOKS.md (research-enforcement.cjs)

@TASK_TRACKING_GUIDE.md
  └─ References: @ENFORCEMENT_HOOKS.md (post-spawn-task-updater.cjs)

@ENVIRONMENT_CONFIG.md
  └─ References: @ENFORCEMENT_HOOKS.md (enforcement mode environment variables)
```

**Dependency Resolution Strategy:**
- Each @file is self-contained for its primary purpose
- Cross-references use `See @FILENAME.md` notation
- No circular dependencies (all references are one-way)

---

## 2. INLINE SECTION SPECIFICATION

These sections MUST remain in CLAUDE.md for router-first enforcement.

| Section | Lines | Content | Enforcement-Critical? |
|---------|-------|---------|----------------------|
| **0) ROUTER OUTPUT CONTRACT** | ~65 | TaskList() first, Task() spawn, Template Loading Protocol | ✅ YES - Entry point |
| **1) PRIME DIRECTIVE** | ~20 | Router protocol steps, critical warnings | ✅ YES - Core routing |
| **1.1) ROUTER TOOL RESTRICTIONS** | ~20 | Whitelist/blacklist, Bash exceptions | ✅ YES - Tool enforcement |
| **1.2) ROUTER SELF-CHECK GATES** | ~120 | Gates 1-4 with violation examples | ✅ YES - Gate logic |
| **1.3) ENFORCEMENT HOOKS** | ~25 | Hook list with override environment variables | ✅ YES - Enforcement |
| **2) SPAWNING AGENTS** | ~60 | Template references, Golden-Path Example, Fallback | ✅ YES - Spawn patterns |
| **5.6) AGENT SPAWNING VERIFICATION** | ~40 | TaskUpdate mandatory protocol, verification pattern | ✅ YES - Tracking |
| **6) EXECUTION RULES** | ~10 | Router NEVER/ALWAYS iron laws | ✅ YES - Router behavior |
| **7) SKILL INVOCATION PROTOCOL** | ~10 | Skill() tool usage (not Read) | ✅ YES - Skill usage |
| **8) MEMORY PERSISTENCE** | ~15 | Read/Write memory protocol | ✅ YES - State management |

**Total Inline:** ~385 lines

**Additional Inline (Connector Sections):**
- Section headers with @file references: ~30 lines
- Cross-references and navigation: ~20 lines
- **Final Total:** ~435 lines (under 450 target)

---

## 3. REFERENCE PATTERN SPECIFICATION

### 3.1 @filename Reference Syntax

**Standard Reference Pattern:**
```markdown
## [SECTION NUMBER] [SECTION NAME]

> **REFERENCE:** See **@FILENAME.md** for complete details.

[Brief 1-2 sentence summary of what the referenced file contains]

**Key Points:**
- [Critical takeaway 1]
- [Critical takeaway 2]
- [Critical takeaway 3]
```

**Example 1: Agent Routing Table**
```markdown
## 3) AGENT ROUTING TABLE

> **REFERENCE:** See **@AGENT_ROUTING_TABLE.md** for complete agent routing matrix.

The routing table maps request types to agent definitions across 4 categories:
- Core agents (developer, planner, qa, architect, pm, technical-writer)
- Specialized agents (code-reviewer, security-architect, devops, c4-*, database-architect)
- Domain agents (python-pro, rust-pro, typescript-pro, frontend-pro, ai-ml-specialist, etc.)
- Orchestrators (master-orchestrator, swarm-coordinator, evolution-orchestrator, party-orchestrator)

**Quick Reference:**
- Bug fixes → `developer` (.claude/agents/core/developer.md)
- Security review → `security-architect` (.claude/agents/specialized/security-architect.md)
- Multi-agent coordination → `master-orchestrator` (.claude/agents/orchestrators/master-orchestrator.md)

For creator skills (agent-creator, skill-creator, workflow-creator, etc.), see **@CREATOR_SKILLS_TABLE.md**.
```

**Example 2: Tool Reference**
```markdown
## 1.4) TOOLS REFERENCE

> **REFERENCE:** See **@TOOL_REFERENCE.md** for comprehensive tool catalog.

22 core tools available (Read, Write, Edit, Bash, Glob, Grep, Task, TaskUpdate, TaskList, TaskCreate, TaskGet, TaskOutput, TaskStop, Skill, SkillCatalog, AvailableAgents, AskUserQuestion, EnterPlanMode, ExitPlanMode, WebSearch, WebFetch, NotebookEdit).

**Router Toolset (Whitelist):**
- Task, TaskList, TaskCreate, TaskUpdate, TaskGet
- Read (agent files / routing docs only)
- AskUserQuestion

**Router Blacklist (must spawn agent):**
- Edit, Write, Bash (implementation), Glob, Grep, WebSearch, mcp__*

See Section 1.1 for Router Tool Restrictions enforcement.
```

### 3.2 Template for @file Creation

Each @file MUST follow this structure:

```markdown
# [TITLE]

**Source:** CLAUDE.md Section [NUMBER]
**Version:** v2.2.1
**Last Updated:** 2026-01-31

---

## PURPOSE

[1-2 sentences describing what this reference document provides]

---

## CONTENT

[Full content from CLAUDE.md section]

---

## RELATED REFERENCES

- **@FILENAME1.md** - [Brief description of relationship]
- **@FILENAME2.md** - [Brief description of relationship]

---

## BACK TO MAIN

See **CLAUDE.md** Section [NUMBER] for inline summary.
```

---

## 4. VALIDATION CRITERIA

### 4.1 Router-First Protocol Verification

**Test 1: Router Output Contract**
```bash
# Verify Section 0 contains TaskList() + Task() requirements
grep -A 5 "ROUTER OUTPUT CONTRACT" .claude/CLAUDE.md | grep "TaskList()"
# Expected: FIRST TOOL CALL MUST BE: TaskList()
```

**Test 2: Self-Check Gates**
```bash
# Verify all 4 gates are inline
grep "Gate 1" .claude/CLAUDE.md  # Complexity
grep "Gate 2" .claude/CLAUDE.md  # Security
grep "Gate 3" .claude/CLAUDE.md  # Tool
grep "Gate 4" .claude/CLAUDE.md  # Creator Workflow
# Expected: All 4 gates present with violation examples
```

**Test 3: Spawn Template References**
```bash
# Verify template references present
grep "universal-agent-spawn.md" .claude/CLAUDE.md
grep "orchestrator-spawn.md" .claude/CLAUDE.md
grep "agent-identity-integration.md" .claude/CLAUDE.md
# Expected: All 3 template references found
```

**Test 4: Enforcement Hook References**
```bash
# Verify enforcement hooks inline
grep "routing-guard.cjs" .claude/CLAUDE.md
grep "unified-creator-guard.cjs" .claude/CLAUDE.md
# Expected: Both hooks referenced with enforcement modes
```

### 4.2 Compression Acceptance Criteria

| Metric | Target | Validation Method |
|--------|--------|------------------|
| **Total Lines** | ≤450 | `wc -l .claude/CLAUDE.md` |
| **Enforcement Preserved** | 100% | Manual review of Gates 1-4 |
| **@file References** | 11 files | `ls .claude/docs/@*.md \| wc -l` |
| **No Broken Links** | 0 errors | `grep "@" .claude/CLAUDE.md` check |
| **Spawn Patterns Work** | 100% | Router smoke test |
| **File Placement Guard** | Working | Test unified-creator-guard.cjs |

### 4.3 Functional Testing

**Test 1: Router Spawning**
```javascript
// Test: Router can spawn developer with template reference
Task({
  subagent_type: 'developer',
  description: 'Test spawn after compression',
  allowed_tools: ['Read', 'Write', 'Edit', 'Bash', 'TaskUpdate', 'TaskList', 'Skill'],
  prompt: 'Read: .claude/templates/spawn/universal-agent-spawn.md\n\nTest task.'
});
// Expected: Agent spawns successfully with TaskUpdate protocol
```

**Test 2: Gate Enforcement**
```javascript
// Test: Gate 1 (Complexity) triggers PLANNER spawn
// User: "Add authentication to the app"
// Expected: Router spawns PLANNER + SECURITY-ARCHITECT (parallel)
```

**Test 3: Creator Workflow**
```javascript
// Test: Gate 4 (Creator Workflow) blocks direct artifact writes
Write({ file_path: '.claude/skills/test-skill/SKILL.md', content: '...' });
// Expected: unified-creator-guard.cjs blocks write (CREATOR_GUARD=block mode)
```

**Test 4: @file Loading**
```bash
# Test: Router can load @file references
Read({ file_path: '.claude/docs/@AGENT_ROUTING_TABLE.md' });
# Expected: File loads successfully with complete routing table
```

---

## 5. IMPLEMENTATION ORDER

### Phase 1: Prepare External Files (3 hours)

**Tasks:**

1. **Create @file templates** (~30 min)
   - Create 11 empty @file templates in `.claude/docs/`
   - Add frontmatter (title, source, version, last updated)
   - Add section headers (PURPOSE, CONTENT, RELATED REFERENCES, BACK TO MAIN)

2. **Extract content from CLAUDE.md** (~1.5 hours)
   - Copy content from each CLAUDE.md section to corresponding @file
   - Preserve all markdown formatting
   - Add cross-references between @files
   - Validate no content loss (diff check)

3. **Add navigation links** (~30 min)
   - Add "RELATED REFERENCES" section to each @file
   - Add "BACK TO MAIN" link to CLAUDE.md section
   - Test all cross-references resolve

4. **Validate @file structure** (~30 min)
   - Check all @files follow template structure
   - Verify cross-references are bidirectional
   - Run markdown linter on all @files

**Verification:**
```bash
# Check all @files created
ls -1 .claude/docs/@*.md | wc -l
# Expected: 11

# Check no placeholder content
grep "TODO\|FIXME\|XXX" .claude/docs/@*.md
# Expected: No matches

# Check all files have frontmatter
for f in .claude/docs/@*.md; do grep "^**Source:**" "$f" || echo "Missing: $f"; done
# Expected: All files have Source field
```

---

### Phase 2: Update CLAUDE.md (2 hours)

**Tasks:**

1. **Replace sections with @file references** (~1 hour)
   - Section 3: Replace routing table with @AGENT_ROUTING_TABLE.md reference
   - Section 1.4: Replace full tool catalog with @TOOL_REFERENCE.md reference
   - Section 5: Replace model selection with @MODEL_SELECTION.md reference
   - Section 8.5: Replace skill catalog with @SKILL_CATALOG_TABLE.md reference
   - Section 8.6: Replace workflows with @ENTERPRISE_WORKFLOWS.md reference
   - Section 8.7: Replace env config with @ENVIRONMENT_CONFIG.md reference
   - Section 9: Replace directory structure with @DIRECTORY_STRUCTURE.md reference
   - Section 1.3: Condense enforcement hooks, link to @ENFORCEMENT_HOOKS.md
   - Section 5.6: Condense task tracking, link to @TASK_TRACKING_GUIDE.md
   - Section 4: Condense evolution workflow, link to @EVOLUTION_WORKFLOW.md
   - Creator Skills Table: Link to @CREATOR_SKILLS_TABLE.md

2. **Add inline summaries** (~30 min)
   - Write 1-2 sentence summary for each @file reference
   - Add "Key Points" bullets (3-5 per section)
   - Ensure critical information still visible in CLAUDE.md

3. **Preserve enforcement sections** (~30 min)
   - Verify Section 0 (Router Output Contract) unchanged
   - Verify Section 1-1.3 (Prime Directive, Restrictions, Gates) unchanged
   - Verify Section 2 (Spawning Agents) has Golden-Path Example
   - Verify Section 5.6 (Agent Spawning Verification) has TaskUpdate protocol
   - Verify Section 6 (Execution Rules) has NEVER/ALWAYS laws
   - Verify Section 7 (Skill Invocation) has Skill() protocol
   - Verify Section 8 (Memory Persistence) has Read/Write protocol

**Verification:**
```bash
# Check line count
wc -l .claude/CLAUDE.md
# Expected: ≤450 lines

# Check @file references present
grep -c "@" .claude/CLAUDE.md
# Expected: ≥11 (one per @file)

# Check enforcement sections unchanged
git diff HEAD -- .claude/CLAUDE.md | grep "^-" | grep -E "(Gate [1-4]|TaskList|TaskUpdate|ROUTER OUTPUT CONTRACT)"
# Expected: No deletions of critical enforcement lines
```

---

### Phase 3: Testing & Validation (1.5 hours)

**Tasks:**

1. **Router smoke test** (~30 min)
   ```bash
   # Test: Router spawns developer
   node .claude/tools/cli/router-smoke-test.cjs
   # Expected: All tests pass
   ```

2. **Enforcement hook validation** (~30 min)
   ```bash
   # Test: routing-guard.cjs blocks invalid spawns
   PLANNER_FIRST_ENFORCEMENT=block node .claude/tools/cli/test-routing-guard.cjs
   # Expected: High-complexity requests trigger PLANNER spawn

   # Test: unified-creator-guard.cjs blocks direct writes
   CREATOR_GUARD=block node .claude/tools/cli/test-creator-guard.cjs
   # Expected: Direct artifact writes blocked
   ```

3. **@file loading test** (~15 min)
   ```javascript
   // Test: Read all @files
   const files = [
     '@AGENT_ROUTING_TABLE.md',
     '@CREATOR_SKILLS_TABLE.md',
     '@TOOL_REFERENCE.md',
     // ... (all 11 files)
   ];
   files.forEach(file => {
     const content = Read({ file_path: `.claude/docs/${file}` });
     assert(content.length > 0, `${file} is empty`);
   });
   // Expected: All files load successfully
   ```

4. **Manual review** (~15 min)
   - Read CLAUDE.md Section 0-2 for router-first protocol clarity
   - Verify Gates 1-4 examples are clear
   - Check @file reference syntax is consistent
   - Verify no broken internal links

**Verification:**
```bash
# Run full test suite
npm test tests/integration/claude-md-compression.test.mjs
# Expected: All tests pass

# Check no broken links
node .claude/tools/cli/check-broken-links.cjs .claude/CLAUDE.md
# Expected: 0 broken links

# Validate against success criteria
node .claude/tools/cli/validate-compression.cjs
# Expected: All criteria pass (≤450 lines, 100% enforcement, 11 @files, 0 errors)
```

---

### Phase 4: Documentation & Rollback (30 min)

**Tasks:**

1. **Update references** (~15 min)
   - Update `.claude/workflows/core/router-decision.md` (if references CLAUDE.md sections)
   - Update `.claude/docs/ARCHITECTURE.md` (if references CLAUDE.md structure)
   - Update `.claude/README.md` (if references CLAUDE.md sections)

2. **Create rollback script** (~10 min)
   ```bash
   #!/bin/bash
   # rollback-compression.sh
   echo "Rolling back CLAUDE.md compression..."
   git checkout HEAD -- .claude/CLAUDE.md
   rm .claude/docs/@*.md
   echo "Rollback complete. CLAUDE.md restored to original."
   ```

3. **Record decision** (~5 min)
   ```bash
   cat >> .claude/context/memory/decisions.md << EOF
   ## [ADR-074] CLAUDE.md Compression Strategy

   - **Date**: 2026-01-31
   - **Status**: Accepted
   - **Context**: CLAUDE.md was 1200 lines, approaching Read tool limits. Need compression while preserving 100% router-first enforcement.
   - **Decision**: Extract 11 reference sections to @files in .claude/docs/, keep enforcement-critical sections inline (Sections 0-2, 1.1-1.3, 5.6, 6-8).
   - **Consequences**:
     - **Benefits**: 62.5% size reduction (1200 → 450 lines), improved maintainability, single-source-of-truth for reference material
     - **Trade-offs**: Router must load @files explicitly via Read() tool (minimal overhead)
     - **Rollback**: git checkout HEAD -- .claude/CLAUDE.md && rm .claude/docs/@*.md
   EOF
   ```

**Verification:**
```bash
# Test rollback script
bash scripts/rollback-compression.sh
git status
# Expected: CLAUDE.md restored, @files deleted

# Re-apply compression
bash scripts/apply-compression.sh
wc -l .claude/CLAUDE.md
# Expected: ≤450 lines
```

---

## 6. ROLLBACK STRATEGY

### 6.1 Rollback Triggers

Rollback IMMEDIATELY if:

1. **Router spawning fails** (template references broken)
2. **Enforcement hooks malfunction** (gates not firing)
3. **Critical workflow blocked** (agents can't find routing info)
4. **Line count exceeds target** (>450 lines after compression)
5. **User reports confusion** (cannot find critical information)

### 6.2 Rollback Procedure (< 2 minutes)

```bash
# Step 1: Restore original CLAUDE.md
git checkout HEAD -- .claude/CLAUDE.md

# Step 2: Remove @files
rm .claude/docs/@*.md

# Step 3: Verify restoration
wc -l .claude/CLAUDE.md
# Expected: ~1200 lines (original)

# Step 4: Test router
node .claude/tools/cli/router-smoke-test.cjs
# Expected: All tests pass

# Step 5: Notify
echo "[ROLLBACK] CLAUDE.md compression rolled back at $(date)" >> .claude/context/memory/issues.md
```

### 6.3 Post-Rollback Analysis

If rollback occurs:

1. **Document failure reason** in `.claude/context/memory/issues.md`
2. **Analyze root cause** (which section broke? which test failed?)
3. **Revise plan** (adjust @file boundaries, keep more inline)
4. **Re-test with smaller scope** (extract fewer sections initially)

---

## 7. SUCCESS METRICS

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| **CLAUDE.md Lines** | ≤450 | ___ | ⬜ |
| **Enforcement Preserved** | 100% | ___ | ⬜ |
| **@files Created** | 11 | ___ | ⬜ |
| **Router Spawning** | 100% pass | ___ | ⬜ |
| **Hook Enforcement** | 100% pass | ___ | ⬜ |
| **Broken Links** | 0 | ___ | ⬜ |
| **User Clarity** | High | ___ | ⬜ |

**Definition of Done:**
- ✅ CLAUDE.md ≤450 lines
- ✅ All 4 self-check gates inline and functional
- ✅ Router spawns agents successfully
- ✅ All @files load without errors
- ✅ No broken links or markdown syntax errors
- ✅ Memory recorded in decisions.md
- ✅ Rollback script tested and working

---

## 8. RISK ASSESSMENT

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Router breaks** (template references fail) | MEDIUM | HIGH | Keep Golden-Path Example inline; test spawning before merge |
| **Gates malfunction** (enforcement logic unclear) | LOW | CRITICAL | Preserve Gates 1-4 completely inline; no compression |
| **User confusion** (@files too fragmented) | MEDIUM | MEDIUM | Keep critical summaries inline; clear @file navigation |
| **Maintenance burden** (more files to update) | HIGH | LOW | @files are reference-only; rarely change |
| **Rollback needed** (compression fails validation) | LOW | MEDIUM | Rollback script ready; git history preserves original |
| **Cross-reference errors** (broken @file links) | MEDIUM | LOW | Automated link checker; bidirectional references |

**Overall Risk:** MEDIUM (acceptable for 62.5% compression gain)

---

## 9. TIMELINE

| Phase | Duration | Dependencies | Output |
|-------|----------|--------------|--------|
| **Phase 1: @files** | 3 hours | None | 11 @files created |
| **Phase 2: CLAUDE.md** | 2 hours | Phase 1 complete | CLAUDE.md ≤450 lines |
| **Phase 3: Testing** | 1.5 hours | Phase 2 complete | All tests pass |
| **Phase 4: Documentation** | 30 min | Phase 3 complete | ADR recorded |
| **Total** | **7 hours** | Sequential | Compression complete |

**Recommended Schedule:**
- Day 1 (4 hours): Phase 1 + Phase 2
- Day 2 (3 hours): Phase 3 + Phase 4

---

## 10. APPENDIX: @FILE CONTENT SPECIFICATION

### A.1 @AGENT_ROUTING_TABLE.md

**Content:** Full agent routing table from CLAUDE.md Section 3

**Includes:**
- Core agents (developer, planner, qa, architect, pm, technical-writer)
- Specialized agents (code-reviewer, security-architect, devops, c4-*, database-architect, etc.)
- Domain agents (python-pro, rust-pro, typescript-pro, frontend-pro, ai-ml-specialist, etc.)
- Orchestrators (master-orchestrator, swarm-coordinator, evolution-orchestrator, party-orchestrator)
- Routing logic source of truth reference (router-enforcer.cjs)

**CLAUDE.md Reference:**
```markdown
## 3) AGENT ROUTING TABLE

> **REFERENCE:** See **@AGENT_ROUTING_TABLE.md** for complete agent routing matrix.

**Quick Reference:**
- Bug fixes → `developer`
- Security review → `security-architect`
- Multi-agent coordination → `master-orchestrator`
```

---

### A.2 @CREATOR_SKILLS_TABLE.md

**Content:** Creator skills table from CLAUDE.md Section 3 (subsection)

**Includes:**
- research-synthesis (before ANY creation)
- agent-creator, skill-creator, workflow-creator, hook-creator, template-creator, schema-creator
- Skill invocation pattern: `Skill({ skill: "..." })`
- Critical warning: Always invoke research-synthesis BEFORE other creators

**CLAUDE.md Reference:**
```markdown
### Creator Skills

> **REFERENCE:** See **@CREATOR_SKILLS_TABLE.md** for creator skill invocation patterns.

**CRITICAL:** Always invoke `research-synthesis` BEFORE any other creator skill.
```

---

### A.3 @TOOL_REFERENCE.md

**Content:** Complete tool catalog from CLAUDE.md Section 1.4

**Includes:**
- Core tools table (22 tools)
- MCP tools table (9 tools, all unconfigured)
- Tool categories (File I/O, Search, Task Management, Capability, Research, Planning, Jupyter)
- Agent toolset mappings (Standard, Orchestrator, Router)
- Read-only agents (code-reviewer, researcher)
- Tool validation and enforcement (tool-availability-validator.cjs)

**CLAUDE.md Reference:**
```markdown
## 1.4) TOOLS REFERENCE

> **REFERENCE:** See **@TOOL_REFERENCE.md** for comprehensive tool catalog.

**Router Toolset (Whitelist):** Task, TaskList, TaskCreate, TaskUpdate, TaskGet, Read, AskUserQuestion
**Router Blacklist:** Edit, Write, Bash (implementation), Glob, Grep, WebSearch, mcp__*
```

---

### A.4 @MODEL_SELECTION.md

**Content:** Model selection guide from CLAUDE.md Section 5

**Includes:**
- haiku (simple validation, quick fixes) - low cost
- sonnet (standard agent work, default) - medium cost
- opus (complex reasoning, architecture/security) - high cost
- Use case guidelines for each model

**CLAUDE.md Reference:**
```markdown
## 5) MODEL SELECTION FOR SUBAGENTS

> **REFERENCE:** See **@MODEL_SELECTION.md** for detailed model selection guidelines.

**Quick Reference:**
- haiku: Simple validation, quick fixes (low cost)
- sonnet: Standard agent work (medium cost, default)
- opus: Complex reasoning, architecture/security (high cost)
```

---

### A.5 @SKILL_CATALOG_TABLE.md

**Content:** Workflow enhancement skills from CLAUDE.md Section 8.5

**Includes:**
- 30+ skill references (project-onboarding, thinking-tools, operational-modes, summarize-changes, session-handoff, smart-revert, tdd, debugging, qa-workflow, ripgrep, chrome-browser, arxiv-mcp, checklist-generator, progressive-disclosure, template-renderer, task-breakdown, etc.)
- When to use each skill
- Skill catalog location: `.claude/context/artifacts/catalogs/skill-catalog.md`

**CLAUDE.md Reference:**
```markdown
## 8.5) WORKFLOW ENHANCEMENT SKILLS

> **REFERENCE:** See **@SKILL_CATALOG_TABLE.md** for complete skill catalog.

**Most Used:**
- `tdd` - Test-driven development workflow
- `debugging` - Systematic debugging approach
- `progressive-disclosure` - Requirements gathering (3-5 clarifications)
- `task-breakdown` - Break plans into Epic→Story→Task lists
```

---

### A.6 @ENTERPRISE_WORKFLOWS.md

**Content:** Enterprise workflows from CLAUDE.md Section 8.6

**Includes:**
- 15+ workflow references (router-decision, external-integration, skill-lifecycle, feature-development, c4-architecture, conductor-setup, incident-response, evolution-workflow, reflection-workflow, security-audit, architecture-review, etc.)
- Workflow paths and purposes

**CLAUDE.md Reference:**
```markdown
## 8.6) ENTERPRISE WORKFLOWS

> **REFERENCE:** See **@ENTERPRISE_WORKFLOWS.md** for complete workflow catalog.

**Core Workflows:**
- `router-decision.md` - Master routing logic (source of truth)
- `evolution-workflow.md` - EVOLVE process (E→V→O→L→V→E)
- `feature-development-workflow.md` - End-to-end feature development
```

---

### A.7 @ENVIRONMENT_CONFIG.md

**Content:** Environment variable reference from CLAUDE.md Section 8.7

**Includes:**
- Configuration categories (Environment, Features, Hooks, Safety, Routing, Debug, Integration)
- .env.example template reference
- Staging environment setup
- Key environment variables and their purposes

**CLAUDE.md Reference:**
```markdown
## 8.7) CONFIGURATION (ENVIRONMENT VARIABLES)

> **REFERENCE:** See **@ENVIRONMENT_CONFIG.md** for complete environment variable reference.

**Setup:**
1. `cp .env.example .env`
2. Edit `.env` for local environment
3. Variables auto-loaded

**Key Variables:**
- `PLANNER_FIRST_ENFORCEMENT` (block/warn/off)
- `CREATOR_GUARD` (block/warn/off)
- `SPAWN_PROMPT_VALIDATOR` (block/warn/off)
```

---

### A.8 @DIRECTORY_STRUCTURE.md

**Content:** Directory structure reference from CLAUDE.md Section 9

**Includes:**
- Top-level structure (.claude/)
- Subsections: agents/, context/, hooks/, lib/, schemas/, skills/, templates/, tools/, workflows/
- Output locations by creator
- Deleted/deprecated directories

**CLAUDE.md Reference:**
```markdown
## 9) DIRECTORY STRUCTURE (REFERENCE)

> **REFERENCE:** See **@DIRECTORY_STRUCTURE.md** for complete directory layout.

**Key Directories:**
- `.claude/agents/` - Core, domain, specialized, orchestrators
- `.claude/context/memory/` - learnings.md, decisions.md, issues.md
- `.claude/hooks/` - Enforcement hooks (routing/, safety/, validation/)
- `.claude/skills/` - Skill definitions (SKILL.md files)
```

---

### A.9 @ENFORCEMENT_HOOKS.md

**Content:** Hook enforcement details from CLAUDE.md Section 1.3 (expanded)

**Includes:**
- routing-guard.cjs (planner-first, task-create complexity, security review, router self-check, documentation routing)
- unified-creator-guard.cjs (Gate 4 enforcement for all artifact types)
- Enforcement modes (block/warn/off)
- Override environment variables
- Hook registration in settings.json

**CLAUDE.md Reference:**
```markdown
## 1.3) ENFORCEMENT HOOKS

> **REFERENCE:** See **@ENFORCEMENT_HOOKS.md** for detailed hook enforcement logic.

**Primary Hooks:**
- `routing-guard.cjs` (PreToolUse Task) - Enforces planner-first, security review, router self-check
- `unified-creator-guard.cjs` (PreToolUse Write/Edit) - Enforces Gate 4 creator workflow

**Enforcement Modes:** block (default), warn, off
**Override:** `PLANNER_FIRST_ENFORCEMENT=warn`, `CREATOR_GUARD=off`
```

---

### A.10 @TASK_TRACKING_GUIDE.md

**Content:** TaskUpdate best practices from CLAUDE.md Section 5.5-5.6 (expanded)

**Includes:**
- Iron Laws (never complete without summary, always update on discovery, always TaskList after completion)
- TaskUpdate mandatory protocol (FIRST: in_progress, LAST: completed)
- Verification pattern (wait for completion, check TaskList, escalate stuck tasks)
- Agent responsibility checklist
- Common failures and fixes

**CLAUDE.md Reference:**
```markdown
## 5.5-5.6) TASK TRACKING

> **REFERENCE:** See **@TASK_TRACKING_GUIDE.md** for complete TaskUpdate protocol.

**Iron Laws:**
- FIRST action: `TaskUpdate({ taskId: "X", status: "in_progress" })`
- LAST action: `TaskUpdate({ taskId: "X", status: "completed", metadata: {...} })`
- THEN: `TaskList()` to check for more work

**Common Failures:**
- Agent exits early on error → Wrap in try/catch, update with error status
- Agent forgets TaskUpdate → Warning box in spawn template
- Agent context limit reached → Summarize sooner, use context-compressor skill
```

---

### A.11 @EVOLUTION_WORKFLOW.md

**Content:** EVOLVE workflow details from CLAUDE.md Section 4 (expanded)

**Includes:**
- EVOLVE acronym (E→V→O→L→V→E: Evaluate, Validate, Obtain, Lock, Verify, Enable & Monitor)
- Research requirement (Phase O cannot be skipped: minimum 3 Exa/WebSearch queries, 3 external sources, research report, design decisions)
- Enforcement hooks (research-enforcement.cjs, evolution-state-guard.cjs, conflict-detector.cjs, evolution-audit.cjs)
- Spawning evolution (concrete recipe)
- State tracking (evolution-state.json)

**CLAUDE.md Reference:**
```markdown
## 4) SELF-EVOLUTION (EVOLVE WORKFLOW)

> **REFERENCE:** See **@EVOLUTION_WORKFLOW.md** for complete EVOLVE process.

**When Triggers:**
- User requests missing capability
- Router detects "no matching agent"
- Pattern analyzer suggests evolution
- Explicit create agent/skill/workflow/hook/template/schema

**EVOLVE:** E→V→O→L→V→E
- **Phase O (Obtain/Research) MANDATORY:** Minimum 3 Exa queries, 3 sources, research report

**Spawn:** `evolution-orchestrator` (opus model) with Skill({ skill: "research-synthesis" })
```

---

## 11. DEVELOPER CHECKLIST

Before starting implementation:

- [ ] Read this plan in full
- [ ] Understand @file reference pattern
- [ ] Review enforcement-critical sections (Sections 0-2, 1.1-1.3, 5.6, 6-8)
- [ ] Set up rollback script
- [ ] Commit current CLAUDE.md state (backup)
- [ ] Allocate 7 hours for implementation
- [ ] Notify team of compression work (if applicable)

During implementation:

- [ ] Follow phase order (Phase 1 → Phase 2 → Phase 3 → Phase 4)
- [ ] Run validation after each phase
- [ ] Test router spawning after Phase 2
- [ ] Document any deviations from plan
- [ ] Keep rollback script ready

After completion:

- [ ] Run full test suite
- [ ] Manual review of CLAUDE.md clarity
- [ ] Record ADR-074 in decisions.md
- [ ] Update related documentation
- [ ] Test rollback script
- [ ] Mark task as completed with summary

---

## 12. CONCLUSION

This plan provides a comprehensive roadmap for compressing CLAUDE.md from 1200 → ≤450 lines (62.5% reduction) while preserving 100% router-first enforcement protocol. By extracting 11 reference sections to @files and keeping enforcement-critical sections inline, we achieve significant size reduction without sacrificing functionality.

**Key Success Factors:**
1. Preserve all 4 self-check gates inline
2. Keep Golden-Path Example for router learning
3. Test spawning patterns thoroughly
4. Maintain bidirectional @file navigation
5. Have rollback ready if validation fails

**Next Steps:**
1. Review and approve this plan
2. Allocate 7 hours for implementation
3. Execute Phase 1-4 sequentially
4. Validate against success criteria
5. Record ADR-074 in memory

**Expected Outcome:**
- ✅ CLAUDE.md ≤450 lines (62.5% smaller)
- ✅ Router-first protocol 100% preserved
- ✅ 11 @files for reference material
- ✅ Improved maintainability
- ✅ No functional regressions

---

**Plan Status:** READY FOR IMPLEMENTATION
**Estimated Effort:** 7 hours
**Risk Level:** MEDIUM (acceptable)
**Approval Required:** Yes

---

**END OF PLAN**
