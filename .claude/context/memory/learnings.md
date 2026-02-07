
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

