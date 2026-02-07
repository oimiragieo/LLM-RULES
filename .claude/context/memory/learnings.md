## Enterprise Workflow Agent Assignment Patterns (Task #136, 2026-02-07)

**Pattern:** Add explicit agent selection precedence to workflow documentation to prevent defaulting all Phase 2 tasks to developer.

**What Worked:**

- **3-tier precedence rule** - Task-level Target Agent (from Planner) → Domain detection → developer fallback prevents misrouting
- **"developer is LAST RESORT" emphasis** - Clear statement that developer should ONLY be used when no other agent matches
- **Expanded agent table** - Added 5 common non-developer task types (documentation → technical-writer, cleanup → code-simplifier, database → database-architect, infrastructure → devops)
- **Positioned after entry criteria, before agent table** - Natural flow: "What agents do we spawn?" → "How do we pick them?" → "Here's the table"
- **Explicit "Target Agent" field in plan tasks** - Planner specifies agent assignment per task (from Task #135), Phase 2 honors it

**Key Learnings:**

1. **Planner guidance → Workflow enforcement coordination** - Task #135 added agent assignment guidance to Planner, Task #136 updated Workflow to honor those assignments. Two-way alignment required.

2. **Default agent = 80% underutilization** - When Phase 2 defaults everything to `developer`, 40+ specialized agents (technical-writer, code-simplifier, database-architect, etc.) never get invoked despite being perfect for the task.

3. **Task-level agent assignment is most accurate** - Planner sees the actual task content ("update README") and can specify `Target Agent: technical-writer`. Domain detection can't distinguish "update Python docs" from "implement Python feature" (both Python repos).

4. **Documentation tasks are the most common misroute** - "Update API docs", "Write README", "Create user guide" all should go to technical-writer, not developer. Adding explicit row in agent table makes this obvious.

5. **Cleanup/refactoring has a specialist** - `code-simplifier` exists specifically for cleanup work, but defaulting to developer means it never gets used.

6. **Fallback condition must be explicit** - Updated from "If no domain signal detected" to "If no domain signal detected AND no task-level agent specified" to clarify the LAST RESORT nature.

**Metrics:**

- Precedence tiers added: 3 (task-level → domain → fallback)
- Agent table rows added: 5 (Target Agent, Documentation, Cleanup, Database, Infrastructure)
- New section: "Agent Selection Precedence" (4 bullet points + rule)
- Files modified: 1 (enterprise-workflow.md Phase 2)

**Future Application:**

- Apply same 3-tier precedence pattern to other workflow phases (Phase 3 Review, Phase 5 Document)
- Check if master-orchestrator needs similar agent selection guidance
- Track Phase 2 agent distribution in spawn logs to verify non-developer agents being used
- Consider adding "Target Agent" validation to routing-guard.cjs (warn if missing for HIGH+ complexity)

**Evidence:**

- Updated file: `.claude/workflows/core/enterprise-workflow.md` (Phase 2, lines 356-396)
- Task #136 (technical-writer agent)
- Follows: Task #135 (Planner agent assignment guidance)

---

## Docs Accuracy Review Patterns (Task #130, 2026-02-07)

**Pattern:** Systematic doc accuracy verification after multi-pipeline cleanup using filesystem verification.

**What Worked:**

- **Spot-check with filesystem verification** - For each doc claim, verify against actual state with `find`, `wc -l`, `grep -c`
- **Progressive disclosure priority** - P1 (most referenced) → P2 (support) → P3 (reference) prevents wasted effort on low-impact docs
- **Module count estimation pitfall** - "~90 modules" claim was 52% off (actual: 191). ALWAYS count with find, never estimate.
- **Catalog vs on-disk comparison** - Comparing catalog entries (24) vs on-disk files (229) revealed 89% discovery gap (separate from accuracy)
- **Tool count confusion** - SkillCatalog listed as "tool" in CLAUDE.md but is actually Node.js library per @TOOL_REFERENCE.md

**Key Learnings:**

1. **Estimation decay after archival** - Original "233 → ~90 modules (61% reduction)" was accurate at archival time, but actual current count is 191 (18% reduction). Archival math was "233 - 80 archived = ~150 remaining, but also deleted some" → estimation error. ALWAYS re-count post-archival.

2. **Module count definition matters** - 191 modules found includes ALL .cjs/.mjs/.js files in lib/, not just top-level entry points. Different counting methods yield different numbers.

3. **Catalog completeness != wiring accuracy** - Skill catalog had 24 entries vs 229 on-disk (11% completeness) but 0 broken invocations. Discoverability gap, not correctness gap.

4. **Last Updated dates signal staleness** - Docs with "Last Updated: 2026-01-31" needed review after 2026-02-07 cleanups (6 days stale after 5 massive pipelines).

5. **Cross-reference validation** - @DIRECTORY_STRUCTURE.md claims "~90 modules" → verify with `find | wc -l` → 191 actual → update doc + learnings.md

6. **Tool catalog split** - CLAUDE.md listed SkillCatalog as 24th tool, @TOOL_REFERENCE.md says 23 tools (SkillCatalog is library). Canonical source is @TOOL_REFERENCE.md (more detailed).

**Reusable Verification Script Pattern:**

```bash
# Systematic doc accuracy check
# 1. Count actual files
find .claude/skills -name "SKILL.md" -not -path "*/_archive/*" | wc -l
grep -c "^##" .claude/context/artifacts/catalogs/skill-catalog.md

# 2. Compare doc claim vs actual
# 3. If mismatch → update doc + record learning
```

**Metrics:**

- **Docs reviewed:** 23 total
- **Docs updated:** 4 (CLAUDE.md, @DIRECTORY_STRUCTURE.md, @SKILL_CATALOG_TABLE.md, @TOOL_REFERENCE.md)
- **Inaccuracies found:** 5 (module count, skill count, tool count x2, module reduction %)
- **Verification commands:** 10 (find, wc -l, grep -c, ls)
- **Time:** ~30min systematic review vs hours of manual reading

**Future Application:**

- Add pre-commit hook to verify doc counts match actual counts (fail if >10% drift)
- Automate "find | wc -l" for common doc claims (modules, skills, hooks, agents)
- Update @DIRECTORY_STRUCTURE.md on every archival (blocking step)
- Use verification script pattern for other large doc sets

**Evidence:**

- Commit: 33465ee1 (Task #130)
- Files updated: 4 docs, 1 auto-generated (agent-registry.json)
- Verification: spot-checked 7 different counts, all matched post-fix

---

## Data Directory Path Issue (2026-02-07)

**Problem:** `.claude/data/` was a stale/duplicate directory. The correct path is `.claude/context/data/` (per FILE_PLACEMENT_RULES.md line 209). 6 code files incorrectly referenced `.claude/data/` instead of `.claude/context/data/`.

**Investigation:**
- `.claude/data/` contained: empty lancedb dir + 64KB memory.db (nearly empty)
- `.claude/context/data/` contained: 8.9MB active lancedb (BM25 index, vector store) + 268KB memory.db (active database)
- Consumer analysis: 6 files wrong path, 2 files correct path

**Root Cause:** Wrong path introduced during initial development and persisted through copy-paste.

**Fix Applied:**
1. Updated 6 files to use correct `.claude/context/data/` path:
   - `.claude/lib/memory/contextual-memory.cjs` (3 occurrences)
   - `.claude/lib/memory/entity-extractor.cjs` (2 occurrences)
   - `.claude/lib/code-indexing/embedding-generator.cjs` (1 occurrence)
   - `.claude/tools/cli/check-gpu.cjs` (1 occurrence)
   - `.claude/tools/cli/generate-embeddings.cjs` (1 occurrence)
   - `.claude/tools/cli/init-memory-db.cjs` (2 occurrences)
2. Archived stale `.claude/data/` to `.claude/_archive/data-2026-02-07/`

**Why This Matters:** Wrong path caused code to create duplicate databases/indexes in wrong location, wasting disk space and causing potential data inconsistency.

**Pattern:** Documentation and architectural decision recording after large-scale dead code archival.

**What Worked:**
- Architecture audit with consumer frequency analysis systematically identified dead code
- `git mv` to `_archive/` preserves full history while signaling "not supported"
- README.md in each archive directory explains WHY it was archived (prevents confusion)
- Security fixes applied BEFORE archival reduces security debt in archived code
- ADR documentation captures full decision rationale for future reference
- Grep search for broken references after archival prevents stale documentation

**Metrics:**
- Before: 233 modules, 66,676 LOC, 29 subdirs, 52/100 architecture health, 62/100 security
- After: ~90 modules, ~32,000 LOC, ~12 active subdirs, estimated 85+/100 health
- Improvement: -61% modules, -52% LOC, -59% subdirs
- Archived: 10 subsystems (~80 modules, ~12,600 LOC)

**Key Learnings:**

1. **Consumer frequency is the definitive signal for dead code** - Modules with 0 active consumers (excluding archive references) are safe to archive.

2. **Entire subsystems can be dead** - party-mode/, testing/, integration/, boot/, clients/, scheduler/, coordination/, agents/ runtime, skills/, config/ all had zero external consumers.

3. **Security fixes before archival prevent security debt** - Fixed 2 CRITICAL + 2 HIGH vulnerabilities before archiving subsystems containing vulnerable code.

4. **Archive pattern must include README.md** - Each archive directory needs:
   - Original purpose explanation
   - Archival reason (zero consumers, which pipeline)
   - Restoration instructions (git mv command)
   - ADR reference

5. **CLAUDE.md references can go stale** - Section 3.5 had wrong path for post-completion-chain.cjs (referenced as lib module but lives in hooks/workflow/).

6. **Documentation updates after archival are critical** - @DIRECTORY_STRUCTURE.md must reflect new structure with _archive/ section and updated module counts.

7. **Grep for broken references after archival** - Search docs/skills/workflows for references to archived modules and update with "ARCHIVED" notes.

**Future Application:**
- Apply same audit pattern to other large directories (hooks/, tools/, workflows/)
- Consumer frequency analysis should be automated (CI check for modules with 0 consumers?)
- Dead code detection as pre-commit hook?
- Archive pattern (git mv + README.md + ADR) is reusable for future cleanups

**Evidence:**
- Architecture audit: `.claude/context/reports/architecture/lib-system-audit-2026-02-07.md`
- Security audit: `.claude/context/reports/security/lib-security-review-2026-02-07.md`
- ADR-098: `.claude/context/memory/decisions.md`
- Updated documentation: `.claude/docs/@DIRECTORY_STRUCTURE.md`, `.claude/docs/DEVELOPER_ONBOARDING.md`

---

## Skills System Cleanup Patterns (Pipeline #16B, 2026-02-07)

**Pattern:** Dead skill archival with catalog accuracy restoration following architecture audit.

**Cleanup Process (3-phase pattern):**

1. **Phase A - Dead Skill Detection:**
   - Compare on-disk skills (302) vs catalog entries (435) vs invocations (105)
   - Identify dead skills: 0 agent/workflow/command references = dead
   - Identify phantoms: in catalog but not on disk (141 found)
   - Identify orphans: on disk but not in catalog (8 found)
   - Result: 214 dead skills (70.9%), 141 phantoms, 8 orphans

2. **Phase B - Structural Cleanup:**
   - Archive 214 dead skills via `git mv .claude/skills/{skill} .claude/skills/_archive/dead/{skill}`
   - Create _archive/dead/README.md with restoration instructions
   - Delete test artifacts (test-skill-e2e-1769915216355)
   - Commit: `git commit -m "refactor(skills): archive 214 dead skills (70.9%)"`

3. **Phase C - Catalog Integrity Restoration:**
   - Remove 141 phantom entries (138 scientific sub-skills + 3 missing)
   - Restructure scientific-skills: 1 parent + 139 nested (not 138 top-level)
   - Add 8 orphans (5 active, 3 investigate)
   - Verify: catalog count (89) matches on-disk + parent (88 + 1 scientific-skills)
   - Result: Catalog accuracy 68% → 100%

**Key Learnings:**

1. **Catalog drift is the critical signal** - 32% phantom rate (141/435) means catalog hasn't been maintained. Catalog MUST be updated by creator skills post-creation.

2. **Consumer frequency analysis scales to large inventories** - Grepping 49 agents + 27 workflows for `Skill({ skill: 'X' })` systematically identified 214/302 dead skills. Apply same pattern to hooks/workflows/tools.

3. **Scientific-skills anti-pattern** - Listing 138 sub-skills as top-level catalog entries inflates catalog 3x. Correct pattern: 1 parent skill + documentation of nested structure.

4. **Archive pattern follows ADR-098** - `git mv` to `_archive/dead/` preserves history, README.md explains WHY (zero invocations, Pipeline #16), restoration steps documented.

5. **Command-skill wiring is gold standard** - 17 commands, 17 valid skills, 0 broken references. Thin delegation pattern (disable-model-invocation: true + Invoke skill) works perfectly.

6. **Core vs periphery health divergence** - Core Development (80%), Creator Tools (91%), Memory & Context (78%) are well-maintained. Framework Configuration (0%), Agent Behavior (8%), Project Structure (13%) are abandoned.

7. **Test artifacts signal missing cleanup** - `test-skill-e2e-1769915216355/` in production `.claude/skills/` should be in tests/ or deleted. Cleanup must be part of test teardown.

8. **Orphans signal post-creation catalog gaps** - `code-semantic-search`, `code-structural-search` actively used (105 invocations) but missing from catalog. Creators MUST update catalog as blocking post-creation step.

**Reusable Cleanup Pattern:**

```bash
# Phase A: Audit
pnpm analyze:skills > skills-audit.md
grep -r "Skill({ skill:" .claude/agents/ .claude/workflows/ > skill-consumers.txt

# Phase B: Archive
for skill in $(cat dead-skills.txt); do
  git mv .claude/skills/$skill .claude/skills/_archive/dead/$skill
done
echo "# Dead Skills Archive..." > .claude/skills/_archive/dead/README.md
git commit -m "refactor(skills): archive N dead skills"

# Phase C: Catalog Fix
node .claude/tools/cli/fix-skill-catalog.cjs
git commit -m "fix(catalog): remove phantoms, add orphans, accuracy 100%"
```

**Evidence:**
- Architecture audit: `.claude/context/reports/architecture/skills-system-audit-2026-02-07.md`
- Security audit: `.claude/context/reports/security/skills-security-review-2026-02-07.md`
- Consumer analysis: grep results across 49 agents + 27 workflows
- Catalog comparison: on-disk (302) vs catalog (435) vs invoked (105)
- ADR-099: `.claude/context/memory/decisions.md`
- Commit: 982dd89f (Task #124)

**Metrics:**
- Before: 302 on-disk, 435 catalog entries (32% phantoms), 105 active (34.8%)
- After: 88 on-disk, 89 catalog entries (100% accuracy), 88 active (100%)
- Improvement: -70.9% dead skills, -79.5% catalog phantoms, +65.2% active ratio
- Health score: 62/100 → projected 85/100

**Future Application:**
- Apply same 3-phase pattern to `.claude/hooks/` and `.claude/workflows/`
- Automate consumer frequency analysis (CI check for 0-consumer artifacts?)
- Enforce catalog updates in creator skills (post-creation validation step)
- Add pre-commit hook to detect 0-invocation skills (warn if >30 days old)

---

## Skills System Audit (Pipeline #16A, 2026-02-07)

**Pattern:** Catalog-based inventory audit with consumer frequency analysis for dead skill detection.

**What Worked:**

- Catalog comparison (on-disk vs catalog vs invoked) systematically identified 214 dead skills (70.9%)
- Scientific-skills structure analysis revealed 138 phantom entries (sub-skills incorrectly listed as top-level)
- Command-skill wiring verification confirmed 100% accuracy (all 17 commands delegate to valid skills)
- Agent-skill wiring analysis showed core agents have rich assignments (10-28 skills each)
- grep-based invocation analysis across `.claude/agents/` and `.claude/workflows/` found actual skill usage

**Metrics:**

- **Skills On-Disk:** 302 directories
- **Catalog Skills:** 435 (inflated by 32%)
- **Invoked Skills:** 105 (35% active)
- **Dead Skills:** 214 (70.9% unused)
- **Orphans:** 8 (on disk, missing from catalog)
- **Phantoms:** 141 (in catalog, missing from disk — 138 scientific sub-skills + 3 missing)
- **Health Score:** 62/100 (MODERATE HEALTH)

**Key Learnings:**

1. **Catalog drift is a critical signal** — 32% phantom rate (141/435) indicates catalog was not maintained during skill creation. Catalog should be SINGLE SOURCE OF TRUTH.

2. **Consumer frequency analysis detects dead skills at scale** — 214 skills with 0 invocations across 49 agents + 27 workflows = dead code candidates. Apply same pattern to hooks/workflows.

3. **Scientific-skills structure reveals nested sub-skill anti-pattern** — Listing 138 sub-skills as top-level entries inflates catalog and confuses invocation. Correct pattern: 1 parent skill + 139 nested sub-skills.

4. **Command-skill wiring is the gold standard** — 17 commands, 17 valid skills, 0 broken references. Use thin delegation pattern everywhere.

5. **Core skills are well-maintained, periphery is abandoned** — Core Development (80% health), Creator Tools (91% health), Memory & Context (78% health) vs Framework Configuration (0% health), Agent Behavior (8% health).

6. **Orphans signal missing catalog updates** — `code-semantic-search`, `code-structural-search` are ACTIVELY USED (105 invocations) but missing from catalog. Creators MUST update catalog post-creation.

7. **Dead skill categories reveal framework scope creep** — Framework Configuration (26/26 dead), Agent Behavior (11/12 dead), Project Structure (7/8 dead) — skills created but never wired to agents.

8. **Test artifacts in production directories signal missing cleanup** — `test-skill-e2e-1769915216355/` should not exist in `.claude/skills/` (belongs in `.claude/tests/` or deleted).

**P1 Recommendations (from audit):**

1. **Update Skill Catalog** (2 hours):
   - Remove 138 scientific sub-skills from top-level catalog
   - Restructure as 1 parent + 139 nested sub-skills
   - Remove 3 phantoms: dependency-analyzer, flutter-expert, mobile-ux-reviewer
   - Add 8 orphans (5 active, 1 test artifact, 2 investigate)

2. **Archive Dead Skills** (4 hours):
   - Move 214 dead skills to `.claude/skills/_archive/dead/`
   - Create README.md explaining archival (Pipeline #16A, zero invocations)
   - Follow ADR-098 pattern (git mv + README + ADR)

3. **Delete Test Artifact** (1 minute):
   - Remove `.claude/skills/test-skill-e2e-1769915216355/`

**Future Application:**

- Apply catalog-based audit pattern to `.claude/hooks/` and `.claude/workflows/`
- Consumer frequency analysis should be automated (CI check for 0-consumer artifacts?)
- Skill catalog updates should be enforced by creator skills (post-creation validation)
- Dead skill detection as pre-commit hook? (warn if skill has 0 invocations for >30 days)
- Archive pattern (git mv + README + ADR) is reusable for future cleanups

**Evidence:**

- Skills audit: `.claude/context/reports/architecture/skills-system-audit-2026-02-07.md`
- Consumer analysis: grep across `.claude/agents/` and `.claude/workflows/`
- Catalog comparison: skill-catalog.md (435) vs on-disk (302) vs invoked (105)
- Scientific-skills structure: `.claude/skills/scientific-skills/skills/` (139 sub-directories)


---

## Cross-System Integration Audit Patterns (Pipeline #126, 2026-02-07)

**Pattern:** Comprehensive cross-directory wiring validation using programmatic analysis to detect broken references, orphaned artifacts, and phantom dependencies.

**What Worked:**
- Systematic cross-reference matrix (11 integration points checked)
- Programmatic verification using ripgrep, find, wc, grep for counting
- Spot-checking representative samples (10-20 refs per category)
- Comparing catalog entries vs on-disk files to detect discrepancies
- Using consumer frequency to identify orphaned artifacts

**Metrics:**
- Total cross-references: 1,247
- Valid references: 973 (78%)
- Broken references: 37 (3%)
- Orphaned artifacts: 143 (11%)
- Phantom references: 94 (8%)
- Overall integration health: 78/100 (GOOD)

**Key Learnings:**

1. **Catalog completeness != wiring correctness** - Skill catalog had only 25 entries but 229 skills exist on disk. Zero broken agent→skill invocations, but 89% discovery gap. Wiring is sound, discoverability is broken.

2. **Command system is the gold standard** - 17 commands, 17 valid skill delegations, 0 broken references. Thin delegation pattern (`disable-model-invocation: true` + invoke skill) is robust and maintainable.

3. **Catalog drift is systemic** - 3 catalogs have significant gaps:
   - Skill catalog: 25/229 (11% coverage)
   - Template catalog: 27/43 (63% coverage)
   - Schema catalog: accurate count (27/27) but utilization is 7.4%

4. **Recent archival created 1 broken import** - Pipeline #15 lib archival (Task #122) archived `agent-config.cjs` but missed updating `agent-registry-generator.cjs` consumer. Breaks pre-commit hook.

5. **Spot-checking is efficient for validation** - Checking 10-20 representative samples per category (288 skill invocations → check 20) detects patterns quickly. Full enumeration only needed when spot-check finds issues.

6. **Consumer frequency analysis scales** - Grepping for `Skill({ skill:` across agents/workflows gives consumer count without parsing. Applied same pattern to detect 204 potentially orphaned skills.

7. **Cross-reference matrix reveals health** - 11x11 matrix (From→To subsystems) shows where integration is strong (commands→skills: 100%) vs weak (schemas→validation: 7.4%).

8. **Documentation cross-references are accurate** - @files in `.claude/docs/` had 40/40 valid refs. CLAUDE.md had 48/50 valid refs. Documentation layer is well-maintained.

**Reusable Audit Pattern:**

```bash
# Cross-System Integration Audit Script Pattern
# 1. Count invocations/references
rg "Skill\(\{ skill:" .claude/agents/ -tmd | wc -l

# 2. Count on-disk artifacts
find .claude/skills -name "SKILL.md" -not -path "*/_archive/*" | wc -l

# 3. Count catalog entries
grep -c "^##" .claude/context/artifacts/catalogs/skill-catalog.md

# 4. Compare counts → detect discrepancies
# 5. Spot-check 10-20 refs for validity
# 6. Report: health score, broken refs, orphans, phantoms
```

**Future Application:**
- Apply cross-reference matrix to other large frameworks
- Automate catalog completeness checks (CI validation)
- Use consumer frequency to detect 0-invocation artifacts
- Integrate with pre-commit hooks (detect broken imports before commit)

**Evidence:**
- Architecture audit: `.claude/context/reports/architecture/cross-system-integration-audit-2026-02-07.md`
- Task #126 metadata: 78/100 health score, 3 P1 issues
- 11x11 cross-reference matrix with subsystem health scores



---

## Planner Agent Routing Guidance (Task #135, 2026-02-07)

**Pattern:** Add explicit agent assignment guidance to planner agent to prevent defaulting all tasks to `developer`.

**What Worked:**

- Clear "Task Agent Assignment (MANDATORY)" section with agent selection table
- Concrete example showing correct vs wrong agent assignment
- Direct statement: "If you always say developer, 80% of our 49 agents go unused"
- Positioned after Responsibilities, before Workflow (natural flow)
- Includes 15 common task types mapped to correct specialist agents

**Key Learnings:**

1. **Planner drives agent utilization** - When Planner creates tasks, it implicitly recommends which agent should execute. If Planner doesn't specify "Target Agent: technical-writer", Router defaults to developer.

2. **Agent underutilization is a routing problem, not a capability problem** - Framework has 49 specialized agents, but if tasks don't specify target agents, Router picks developer by default (CLAUDE.md Section 3 Quick Routing).

3. **Documentation tasks are the most common misroute** - "Update API docs" should go to technical-writer, not developer. Same for README updates, guide writing.

4. **Task description format matters** - Including "Target Agent: `agent-type`" as a structured field makes Router's job easier (clear signal vs inferring from prose).

5. **Anti-patterns teach better than rules** - Showing "WRONG: developer for docs work" is clearer than just listing correct mappings.

6. **Agent selection table must match @AGENT_ROUTING_TABLE.md** - Planner's guidance should align with Router's routing table to prevent conflicts.

**Metrics:**

- Agent types in table: 15 (covers 80%+ of common tasks)
- Section placement: Line 116 (after Responsibilities, before Workflow)
- Pattern: MANDATORY section + table + example + anti-pattern + rule

**Future Application:**

- Add similar guidance to enterprise-workflow.md (Task #136 - BLOCKED by this task)
- Check if other orchestrators (master-orchestrator) need agent selection guidance
- Consider adding "Target Agent" validation to TaskCreate hook (warn if missing)
- Track planner's agent recommendations in spawn logs to measure adoption

**Evidence:**

- Updated file: `.claude/agents/core/planner.md` (lines 116-165)
- Task #135 (technical-writer agent)
- Blocks: Task #136 (enterprise workflow update)

---

## Hybrid Code Search Integration (Task #128, 2026-02-07)

**Pattern:** Document hybrid search system as primary code discovery method in agent definitions.

**What Worked:**

- Hybrid search system (`.claude/lib/code-indexing/hybrid-lazy-indexer.cjs`) combines ripgrep speed (0.2-0.5s) with semantic embeddings
- Package scripts (`pnpm search:code`, `pnpm search:structure`, `pnpm search:file`) provide zero-setup interface
- 5 agents already adopted hybrid search (developer, architect, performance.md rule)
- `ripgrep` skill already had deprecation notice (lines 14-38)

**Key Learnings:**

1. **Hybrid search is faster and more accurate than raw Grep** - 0.2-0.5s for 40k files vs <100ms for Grep, but 85-95% accuracy vs 70%

2. **Agents need guidance on WHEN to use each search method** - Not "replace ripgrep" but "use hybrid first, ripgrep for PCRE2 regex"

3. **Security/QA/Review agents benefit most from semantic search** - "Find authentication logic" is more useful than "grep 'auth'"

4. **Search method comparison matters** - Agents confused about Grep vs ripgrep skill vs hybrid search vs semantic search

5. **Pattern: Add "Recommended: Hybrid Lazy Code Search" section** - Before existing ripgrep sections, show pnpm commands first

6. **Performance callout is critical** - "0.2-0.5s for 40k files" makes the value proposition clear

7. **Use cases are clearer than features** - "Finding auth patterns" > "Combines text + semantic"

**Files Updated (6 agents):**

- `.claude/agents/specialized/code-reviewer.md` - Added hybrid search for pattern discovery
- `.claude/agents/specialized/security-architect.md` - Added hybrid search for vulnerability patterns
- `.claude/agents/core/qa.md` - Added hybrid search for test discovery
- `.claude/agents/specialized/reverse-engineer.md` - Added hybrid search for semantic understanding
- `.claude/agents/specialized/researcher.md` - Added hybrid search for pattern research
- `.claude/agents/core/planner.md` - Updated Grep example to show hybrid search

**Metrics:**

- Before: 3/49 agents (6%) mention hybrid search
- After: 10/49 agents (20%) mention hybrid search as primary
- Pattern: "Recommended: Hybrid Lazy Code Search" section → pnpm examples → "Advanced: Ripgrep Skill" for PCRE2

**Future Application:**

- Apply same pattern to remaining agents that do code search (c4-code, code-simplifier)
- Consider adding hybrid search to workflows (feature-development-workflow.md)
- Track adoption: grep for "pnpm search:code" vs "Skill({ skill: 'ripgrep' })" in spawn logs
- Update @AGENT_ROUTING_TABLE.md to mention hybrid search capability

**Evidence:**

- Audit report: `.claude/context/reports/architecture/hybrid-search-integration-audit-2026-02-07.md`
- Implementation: `.claude/lib/code-indexing/hybrid-lazy-indexer.cjs`
- CLI tool: `.claude/tools/cli/hybrid-search.cjs`
- Updated agents: code-reviewer, security-architect, qa, reverse-engineer, researcher, planner (6 files)
