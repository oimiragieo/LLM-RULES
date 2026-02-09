<!-- Agent: planner | Task: #52 | Session: 2026-02-09 -->

# Plan: Hybrid Search Integration Across All Agents

## Executive Summary

Integrate hybrid search skills (ripgrep, code-semantic-search, code-structural-search) across all 49 agents based on Phase 1 findings. Currently only 11/49 agents (22%) have search skills. This plan adds search capabilities to the remaining 38 agents in a tiered approach, updates the skill catalog, adds search-first guidance, and updates the agent-creator to prevent future gaps.

**Phase 1 Reports Referenced:**
- Architecture review: `.claude/context/reports/architecture/hybrid-search-integration-review-2026-02-09.md`
- QA validation: `.claude/context/reports/qa/hybrid-search-validation-2026-02-09.md`
- Agent search usage: `.claude/context/reports/architecture/agent-search-usage-analysis-2026-02-09.md`

**Key Metrics:**
- 40/41 search tests passing (97.6%)
- 78% of agents (38/49) missing search skills
- Domain specialists 70x slower for code discovery than core agents

---

## Design Decisions

### Decision 1: Three-Tier Skill Assignment

Agents receive search skills based on how they interact with code:

| Tier | Skills Added | Criteria | Agent Count |
|------|-------------|----------|-------------|
| **Tier 3** (Full) | `ripgrep`, `code-semantic-search`, `code-structural-search` | Writes/modifies code, analyzes code patterns | 22 agents |
| **Tier 2** (Discovery) | `ripgrep`, `code-semantic-search` | Explores code but does not analyze AST patterns | 8 agents |
| **Tier 1** (Basic) | `ripgrep` | Needs text search but not semantic/structural | 8 agents |

**Rationale**: Not every agent needs AST pattern matching. Orchestrators need to find files but not parse code structure. Domain specialists need all three for code-level work.

### Decision 2: Code Search Optimization Section

Add a condensed "Code Search Optimization" body section to Tier 2 and Tier 3 agents. This is a shortened version of the developer agent's search documentation (~30 lines vs ~120 lines). Tier 1 agents get only the frontmatter skill entries (no body section).

### Decision 3: Search-First Protocol

Add a "Step 0.5: Search Before Acting" instruction to key agents (developer, planner, code-reviewer, code-simplifier). This is guidance, not enforcement -- a future hook could enforce it.

### Decision 4: Agent-Creator Template Update

Update the agent-creator skill to include a search skill checklist during new agent creation. Any agent with `code`, `implementation`, `debugging`, `analysis`, or `infrastructure` in its description should receive search skills by default.

---

## Phases

### Phase 1: Tier 3 Agent Updates (22 Domain Specialists -- Highest Impact)

**Purpose**: Add all three search skills to domain specialists who write and analyze code.
**Dependencies**: None
**Parallel OK**: Yes (file edits are independent)
**Target Agent**: `developer`
**Recommended Skills**: `ripgrep`, `verification-before-completion`

#### Agents to Update (Tier 3: ripgrep + code-semantic-search + code-structural-search)

**Backend Specialists (6):**
1. `python-pro` (`.claude/agents/domain/python-pro.md`)
2. `nodejs-pro` (`.claude/agents/domain/nodejs-pro.md`)
3. `fastapi-pro` (`.claude/agents/domain/fastapi-pro.md`)
4. `golang-pro` (`.claude/agents/domain/golang-pro.md`)
5. `java-pro` (`.claude/agents/domain/java-pro.md`)
6. `php-pro` (`.claude/agents/domain/php-pro.md`)

**Frontend Specialists (4):**
7. `frontend-pro` (`.claude/agents/domain/frontend-pro.md`)
8. `nextjs-pro` (`.claude/agents/domain/nextjs-pro.md`)
9. `sveltekit-expert` (`.claude/agents/domain/sveltekit-expert.md`)
10. `typescript-pro` (`.claude/agents/domain/typescript-pro.md`)

**Mobile/Desktop Specialists (4):**
11. `android-pro` (`.claude/agents/domain/android-pro.md`)
12. `ios-pro` (`.claude/agents/domain/ios-pro.md`)
13. `expo-mobile-developer` (`.claude/agents/domain/expo-mobile-developer.md`)
14. `tauri-desktop-developer` (`.claude/agents/domain/tauri-desktop-developer.md`)

**Data/Specialist Domains (5):**
15. `data-engineer` (`.claude/agents/domain/data-engineer.md`)
16. `ai-ml-specialist` (`.claude/agents/domain/ai-ml-specialist.md`)
17. `web3-blockchain-expert` (`.claude/agents/domain/web3-blockchain-expert.md`)
18. `scientific-research-expert` (`.claude/agents/domain/scientific-research-expert.md`)
19. `gamedev-pro` (`.claude/agents/domain/gamedev-pro.md`)

**Other Code-Working Specialists (3):**
20. `graphql-pro` (`.claude/agents/domain/graphql-pro.md`)
21. `mobile-ux-reviewer` (`.claude/agents/specialized/mobile-ux-reviewer.md`)
22. `reverse-engineer` -- SKIP (already has all 3 skills)

**Effective count: 21 agents** (reverse-engineer already has search skills)

#### Changes Per Agent

**Frontmatter** -- Add three skills to the `skills:` list:
```yaml
skills:
  - code-semantic-search    # ADD
  - code-structural-search  # ADD
  - ripgrep                 # ADD
  # ... existing skills remain
```

**Body** -- Add "Code Search Optimization" section after the last existing body section (before Memory Protocol if present):

```markdown
## Code Search Optimization

This agent can search code efficiently using the hybrid search system:

**Search Strategy (use in order):**

1. **Broad Discovery**: `Skill({ skill: 'ripgrep', args: '<pattern>' })` -- Fast keyword search (<10ms)
2. **Semantic Understanding**: `Skill({ skill: 'code-semantic-search', args: '<query>' })` -- Find by meaning (<150ms, 95% accuracy)
3. **Structural Refinement**: `Skill({ skill: 'code-structural-search', args: '<ast-pattern> --lang <lang>' })` -- Exact AST patterns (100% accuracy)

**CLI Alternative**: `pnpm search:code "<query>"` for instant hybrid search (0.2-0.5s for 40k files)

| Tool                   | Speed  | Accuracy | Use Case                  |
| ---------------------- | ------ | -------- | ------------------------- |
| ripgrep                | <10ms  | ~70%     | Keyword filtering         |
| code-semantic-search   | <150ms | ~95%     | General code discovery    |
| code-structural-search | <50ms  | 100%     | Exact pattern matching    |
```

#### Phase 1 Verification Gate

```bash
# Verify all 21 agents have ripgrep in frontmatter skills
grep -l "ripgrep" .claude/agents/domain/*.md .claude/agents/specialized/mobile-ux-reviewer.md | wc -l
# Expected: 21+ (existing + new)

# Verify no YAML syntax errors (frontmatter still parseable)
node -e "const fs=require('fs'); const files=fs.readdirSync('.claude/agents/domain').filter(f=>f.endsWith('.md')); files.forEach(f=>{const c=fs.readFileSync('.claude/agents/domain/'+f,'utf8'); const m=c.match(/^---\n([\s\S]*?)\n---/); if(!m) console.error('FAIL:',f)})"
```

**Success Criteria**: All 21 agents have all 3 search skills in frontmatter and the Code Search Optimization body section.

---

### Phase 2: Tier 2 Agent Updates (8 Code Discovery Agents)

**Purpose**: Add ripgrep + code-semantic-search to agents that explore code but do not need AST analysis.
**Dependencies**: None (can run parallel to Phase 1)
**Parallel OK**: Yes
**Target Agent**: `developer`
**Recommended Skills**: `ripgrep`, `verification-before-completion`

#### Agents to Update (Tier 2: ripgrep + code-semantic-search)

1. `planner` (`.claude/agents/core/planner.md`) -- needs to search before planning
2. `technical-writer` (`.claude/agents/core/technical-writer.md`) -- needs to find code for docs
3. `devops` (`.claude/agents/specialized/devops.md`) -- needs to find config patterns
4. `devops-troubleshooter` (`.claude/agents/specialized/devops-troubleshooter.md`) -- needs to trace errors
5. `database-architect` (`.claude/agents/specialized/database-architect.md`) -- needs to find schemas
6. `pm` (`.claude/agents/core/pm.md`) -- needs to find feature implementations
7. `incident-responder` (`.claude/agents/specialized/incident-responder.md`) -- needs rapid search
8. `researcher` -- SKIP (already has all 3 search skills)

**Effective count: 7 agents** (researcher already has search skills)

#### Changes Per Agent

**Frontmatter** -- Add two skills:
```yaml
skills:
  - code-semantic-search  # ADD
  - ripgrep               # ADD
  # ... existing skills remain
```

**Body** -- Add condensed Code Search section (no structural search):

```markdown
## Code Search Optimization

Search the codebase efficiently before acting:

1. **Keyword Search**: `Skill({ skill: 'ripgrep', args: '<pattern>' })` -- Fast text search (<10ms)
2. **Semantic Search**: `Skill({ skill: 'code-semantic-search', args: '<query>' })` -- Find by meaning (<150ms)
3. **CLI**: `pnpm search:code "<query>"` -- Instant hybrid search (0.2-0.5s)
```

#### Phase 2 Verification Gate

```bash
# Verify all 7 agents have ripgrep in frontmatter
grep -l "ripgrep" .claude/agents/core/planner.md .claude/agents/core/technical-writer.md .claude/agents/core/pm.md .claude/agents/specialized/devops.md .claude/agents/specialized/devops-troubleshooter.md .claude/agents/specialized/database-architect.md .claude/agents/specialized/incident-responder.md | wc -l
# Expected: 7
```

**Success Criteria**: All 7 agents have ripgrep + code-semantic-search in frontmatter and the condensed search body section.

---

### Phase 3: Tier 1 Agent Updates (8 Basic Search Agents)

**Purpose**: Add ripgrep to agents that need basic text search only.
**Dependencies**: None (can run parallel to Phase 1-2)
**Parallel OK**: Yes
**Target Agent**: `developer`
**Recommended Skills**: `ripgrep`, `verification-before-completion`

#### Agents to Update (Tier 1: ripgrep only)

**Orchestrators (3):**
1. `master-orchestrator` (`.claude/agents/orchestrators/master-orchestrator.md`)
2. `evolution-orchestrator` (`.claude/agents/orchestrators/evolution-orchestrator.md`)
3. `swarm-coordinator` (`.claude/agents/orchestrators/swarm-coordinator.md`)

**C4 Architecture Agents (3):**
4. `c4-context` (`.claude/agents/specialized/c4-context.md`)
5. `c4-container` (`.claude/agents/specialized/c4-container.md`)
6. `c4-component` (`.claude/agents/specialized/c4-component.md`)

**Other (2):**
7. `c4-code` (`.claude/agents/specialized/c4-code.md`) -- already has ripgrep + structural; ADD code-semantic-search only
8. `party-orchestrator` (`.claude/agents/orchestrators/party-orchestrator.md`)

**Effective count: 8 agents** (c4-code gets semantic search added to existing ripgrep/structural)

#### Changes Per Agent

**Frontmatter** -- Add ripgrep (and code-semantic-search for c4-code):
```yaml
skills:
  - ripgrep  # ADD
  # ... existing skills remain
```

**Body** -- No body section added (Tier 1 agents use ripgrep via Skill() invocation only).

For `c4-code` specifically -- add `code-semantic-search` to frontmatter since it already has `ripgrep` and `code-structural-search`.

#### Phase 3 Verification Gate

```bash
# Verify orchestrators have ripgrep
grep -l "ripgrep" .claude/agents/orchestrators/*.md | wc -l
# Expected: 3+

# Verify C4 agents have ripgrep
grep -l "ripgrep" .claude/agents/specialized/c4-*.md | wc -l
# Expected: 4 (c4-code already had it, now all 4 have it)
```

**Success Criteria**: All 8 agents have ripgrep in frontmatter. c4-code has all 3 search skills.

---

### Phase 4: Skill Catalog and Search-First Protocol Updates

**Purpose**: Update skill catalog with correct agent assignments and add search-first guidance.
**Dependencies**: Phases 1-3 (need to know final skill assignments)
**Parallel OK**: No (depends on Phase 1-3 completion)
**Target Agent**: `developer`
**Recommended Skills**: `verification-before-completion`

#### Task 4.1: Update Skill Catalog

**File**: `.claude/context/artifacts/catalogs/skill-catalog.md`

Update the Search section's "Primary Agents" column:

| Skill | Current Primary Agents | New Primary Agents |
|-------|----------------------|-------------------|
| `ripgrep` | developer, code-reviewer | **all agents** (49/49) |
| `code-semantic-search` | developer, architect | **developer, architect, qa, code-reviewer, code-simplifier, security-architect, researcher, reverse-engineer, planner, technical-writer, devops, devops-troubleshooter, database-architect, pm, incident-responder, c4-code, + 21 domain specialists** |
| `code-structural-search` | developer, code-reviewer | **developer, architect, qa, code-reviewer, code-simplifier, security-architect, researcher, reverse-engineer, c4-code, + 21 domain specialists** |

For space efficiency, use shorthand like "all code-working agents (30+)" in the catalog table.

**Verify**: Catalog search section reflects actual agent assignments.

#### Task 4.2: Add Search-First Protocol to Developer Agent

**File**: `.claude/agents/core/developer.md`

Add a "Step 0.5: Search Before Coding" section to the Workflow:

```markdown
### Step 0.5: Search Before Coding (RECOMMENDED)

Before modifying code, search the codebase to understand existing patterns:

1. `Skill({ skill: 'ripgrep', args: '<feature-keyword>' })` -- Find related code
2. `Skill({ skill: 'code-semantic-search', args: '<what you want to build>' })` -- Find similar implementations
3. Review search results to avoid duplicating existing code or breaking patterns
```

#### Task 4.3: Add Search-First Protocol to Code-Reviewer

**File**: `.claude/agents/specialized/code-reviewer.md`

Add search-first guidance for finding related code during reviews.

#### Task 4.4: Add Search-First Protocol to Planner

**File**: `.claude/agents/core/planner.md`

The planner already references `pnpm search:code` in its body (Hybrid Lazy Search section). Add the skill-based search references to complement.

#### Phase 4 Verification Gate

```bash
# Verify skill catalog has updated agent assignments
grep -A2 "ripgrep" .claude/context/artifacts/catalogs/skill-catalog.md | grep -i "all"
# Expected: Should show "all agents" or similar

# Verify developer has search-first step
grep "Search Before" .claude/agents/core/developer.md
# Expected: 1 match
```

**Success Criteria**: Skill catalog reflects actual assignments. Developer, code-reviewer, and planner have search-first guidance.

---

### Phase 5: Agent-Creator Template Update (Systemic Prevention)

**Purpose**: Ensure future agents automatically get search skills during creation.
**Dependencies**: Phase 4
**Parallel OK**: No
**Target Agent**: `developer`
**Recommended Skills**: `tdd`, `verification-before-completion`

#### Task 5.1: Update Agent-Creator Skill

**File**: `.claude/skills/agent-creator/SKILL.md`

Add a "Search Skills Checklist" step to the agent creation workflow:

```markdown
### Step N: Search Skills Assignment

Check if the new agent works with code (description contains any of: code, implementation, debugging, infrastructure, deployment, analysis, development, programming, architecture):

If YES, add to frontmatter skills:
- `ripgrep` (always)
- `code-semantic-search` (if agent explores or discovers code)
- `code-structural-search` (if agent analyzes or modifies code patterns)

If NO (pure documentation, research, or orchestration agent):
- `ripgrep` (always -- all agents benefit from text search)
```

#### Task 5.2: Add Performance Table to Code-Semantic-Search Skill Docs

**File**: `.claude/skills/code-semantic-search/SKILL.md`

Add the missing performance comparison table (flagged by QA test):

```markdown
| Mode            | Speed  | Accuracy | Best For          |
| --------------- | ------ | -------- | ----------------- |
| Hybrid          | <150ms | 95%      | General search    |
| Semantic-only   | <50ms  | 85%      | Concepts          |
| Structural-only | <50ms  | 100%     | Exact patterns    |
| Phase 1 only    | <50ms  | 80%      | Legacy (fallback) |
```

#### Phase 5 Verification Gate

```bash
# Verify agent-creator has search skills checklist
grep -i "search skills" .claude/skills/agent-creator/SKILL.md
# Expected: 1+ matches

# Verify performance table exists
grep "Hybrid.*150ms.*95%" .claude/skills/code-semantic-search/SKILL.md
# Expected: 1 match
```

**Success Criteria**: Agent-creator includes search skill assignment step. Performance table present in semantic search skill docs.

---

### Phase 6: Quality Gates and Final Verification

**Purpose**: Run lint, format, and verify all changes are consistent.
**Dependencies**: Phases 1-5
**Parallel OK**: No (blocking gate)
**Target Agent**: `developer`
**Recommended Skills**: `verification-before-completion`, `checklist-generator`

#### Task 6.1: Run Lint and Format

```bash
pnpm lint:fix
pnpm format
```

Both must exit with 0 errors/changes.

#### Task 6.2: Final Verification Count

```bash
# Count agents with ripgrep
grep -rl "ripgrep" .claude/agents/ | grep -v _archive | wc -l
# Expected: 47+ (was 9, adding 38)

# Count agents with code-semantic-search
grep -rl "code-semantic-search" .claude/agents/ | grep -v _archive | wc -l
# Expected: 37+ (9 existing + 28 new)

# Count agents with code-structural-search
grep -rl "code-structural-search" .claude/agents/ | grep -v _archive | wc -l
# Expected: 30+ (8 existing + 22 new)
```

#### Task 6.3: Spot-Check 3 Agent Files

Read and verify YAML parsability + correct skill assignment for:
1. One domain agent (e.g., `python-pro.md`)
2. One specialized agent (e.g., `devops.md`)
3. One orchestrator (e.g., `master-orchestrator.md`)

#### Phase 6 Verification Gate

- [ ] `pnpm lint:fix` exits with 0 errors
- [ ] `pnpm format` exits with 0 changes
- [ ] 47+ agents have ripgrep
- [ ] 37+ agents have code-semantic-search
- [ ] 30+ agents have code-structural-search
- [ ] 3 spot-checked files have valid YAML frontmatter

**Success Criteria**: All quality gates pass. Agent counts match expectations.

---

### CHECKPOINT: Commit Phase 1-5 Changes

**Rationale**: This plan modifies 36+ agent files, 2 skill files, and 1 catalog file (39+ files total). A commit checkpoint after Phase 5 creates a recovery point before final verification.

```bash
git add .claude/agents/ .claude/skills/ .claude/context/artifacts/catalogs/skill-catalog.md
git commit -m "feat: add hybrid search skills to 36 agents (78% coverage gap fix)"
```

---

### Phase FINAL: Evolution and Reflection Check

**Purpose**: Quality assessment and learning extraction

**Tasks**:

1. Spawn reflection-agent to analyze completed work
2. Extract learnings and update memory files
3. Check for evolution opportunities (new agents/skills needed)

**Spawn Command**:
```
Task({
  subagent_type: "reflection-agent",
  description: "Session reflection and learning extraction",
  prompt: "You are REFLECTION-AGENT. Read @.claude/agents/core/reflection-agent.md. Analyze the completed hybrid search integration work from this plan, extract learnings to memory files, and check for evolution opportunities (patterns that suggest new agents or skills should be created)."
})
```

**Success Criteria**:

- Reflection-agent spawned and completed
- Learnings extracted to `.claude/context/memory/learnings.md`
- Evolution opportunities logged if any detected

---

## Risk Assessment

| Risk | Impact | Mitigation | Rollback |
|------|--------|------------|----------|
| YAML syntax error in frontmatter | HIGH -- agent file unparseable | Verify YAML after each edit; spot-check | `git checkout -- .claude/agents/<file>` |
| Body section placed incorrectly | LOW -- cosmetic, does not affect skills | Follow consistent pattern (after last section, before Memory Protocol) | Manual fix |
| Skill name typo in frontmatter | MEDIUM -- skill invocation fails silently | Use exact names: `ripgrep`, `code-semantic-search`, `code-structural-search` | Grep + fix |
| Existing agent content overwritten | HIGH -- loss of agent-specific guidance | Use Edit tool (not Write) for modifications | `git checkout -- <file>` |
| Too many files changed, merge conflict | LOW -- no parallel development on agent files | Commit checkpoint after Phase 5 | `git stash` |

---

## Timeline Summary

| Phase | Tasks | Est. Time | Files Changed | Parallel? |
|-------|-------|-----------|--------------|-----------|
| Phase 1 | 21 agent updates (Tier 3) | ~45 min | 21 files | Yes (internal) |
| Phase 2 | 7 agent updates (Tier 2) | ~20 min | 7 files | Yes (internal) |
| Phase 3 | 8 agent updates (Tier 1) | ~15 min | 8 files | Yes (internal) |
| Phase 4 | Catalog + search-first | ~20 min | 4 files | No |
| Phase 5 | Agent-creator + perf table | ~15 min | 2 files | No |
| Phase 6 | Quality gates + verify | ~15 min | 0 files | No |
| Checkpoint | Commit | ~2 min | N/A | No |
| Phase FINAL | Reflection | ~10 min | Memory files | No |
| **Total** | **~36 agents + 6 support files** | **~142 min** | **~42 files** | |

---

## Task Summary for Router

The following tasks map to the existing task list:

**Task #53 (Developer)**: Implement Phases 1-6 of this plan
- Target Agent: `developer`
- Recommended Skills: `ripgrep`, `verification-before-completion`
- Scope: 36 agent file updates + 4 catalog/skill updates + 2 search-first additions
- Verification: Lint/format pass, agent counts match, YAML valid

**Task #54 (Code-Reviewer)**: Review all changes from Task #53
- Target Agent: `code-reviewer`
- Recommended Skills: `code-analyzer`, `checklist-generator`
- Focus: YAML consistency, search section formatting, no accidental content deletion

**Task #55 (QA)**: Final validation
- Target Agent: `qa`
- Recommended Skills: `verification-before-completion`, `checklist-generator`
- Focus: Run search tests (40/41 should still pass), verify agent file integrity

**Task #56 (DevOps)**: Commit and push
- Target Agent: `devops`
- Recommended Skills: `git-expert`, `verification-before-completion`

**Task #57 (Technical-Writer)**: Update documentation
- Target Agent: `technical-writer`
- Recommended Skills: `doc-generator`, `writing-skills`
- Focus: Update any architecture docs referencing search coverage

**Task #58 (Reflection)**: Session reflection
- Target Agent: `reflection-agent`
- Recommended Skills: `insight-extraction`

---

## Implementation Guidance for Developer (Task #53)

### Edit Pattern for Frontmatter Skills

For each agent file, the developer should:

1. Read the file
2. Find the `skills:` section in the YAML frontmatter
3. Add the appropriate search skills (maintaining alphabetical order if possible)
4. For Tier 2/3 agents: Add the Code Search Optimization body section

**Example Edit (python-pro.md frontmatter):**

```yaml
# Before:
skills:
  - task-management-protocol
  - api-development-expert
  - code-quality-expert
  # ...

# After:
skills:
  - task-management-protocol
  - api-development-expert
  - code-quality-expert
  - code-semantic-search
  - code-structural-search
  - ripgrep
  # ...
```

### Batch Efficiency

Group edits by directory:
1. All `.claude/agents/domain/*.md` files (21 files -- Tier 3)
2. All `.claude/agents/core/*.md` files (3 files -- Tier 2: planner, technical-writer, pm)
3. All `.claude/agents/specialized/*.md` files (4 files -- Tier 2: devops, troubleshooter, database-architect, incident-responder)
4. All `.claude/agents/orchestrators/*.md` files (3 files -- Tier 1)
5. All `.claude/agents/specialized/c4-*.md` files (4 files -- Tier 1)

### Content Templates

**Tier 3 Body Section** (for domain specialists):

```markdown
## Code Search Optimization

This agent can search code efficiently using the hybrid search system:

**Search Strategy (use in order):**

1. **Broad Discovery**: `Skill({ skill: 'ripgrep', args: '<pattern>' })` -- Fast keyword search (<10ms)
2. **Semantic Understanding**: `Skill({ skill: 'code-semantic-search', args: '<query>' })` -- Find by meaning (<150ms, 95% accuracy)
3. **Structural Refinement**: `Skill({ skill: 'code-structural-search', args: '<ast-pattern> --lang <lang>' })` -- Exact AST patterns (100% accuracy)

**CLI Alternative**: `pnpm search:code "<query>"` for instant hybrid search (0.2-0.5s for 40k files)

| Tool                   | Speed  | Accuracy | Use Case                  |
| ---------------------- | ------ | -------- | ------------------------- |
| ripgrep                | <10ms  | ~70%     | Keyword filtering         |
| code-semantic-search   | <150ms | ~95%     | General code discovery    |
| code-structural-search | <50ms  | 100%     | Exact pattern matching    |
```

**Tier 2 Body Section** (for discovery agents):

```markdown
## Code Search Optimization

Search the codebase efficiently before acting:

1. **Keyword Search**: `Skill({ skill: 'ripgrep', args: '<pattern>' })` -- Fast text search (<10ms)
2. **Semantic Search**: `Skill({ skill: 'code-semantic-search', args: '<query>' })` -- Find by meaning (<150ms)
3. **CLI**: `pnpm search:code "<query>"` -- Instant hybrid search (0.2-0.5s)
```

---

## Excluded from Scope

1. **Index freshness mechanism**: Stale indices (3 days old) are a separate concern. Documented in architecture review but not addressed in this plan.
2. **Search-first enforcement hook**: Future work. This plan adds guidance; enforcement requires a new hook.
3. **Routing table search keywords**: No routing changes needed -- search is a capability, not a routing concern.
4. **Dual search system unification**: HybridLazyIndexer vs HybridSearch are complementary by design. No unification needed.
5. **Agents without Bash tool access**: Router, context-compressor, and reflection-agent do not need search skills (they do not explore code directly).
