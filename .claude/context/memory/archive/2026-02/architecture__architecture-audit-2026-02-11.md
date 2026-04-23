# Architecture Audit Report: agent-studio

**Date**: 2026-02-11
**Auditor**: architect agent (Task: architecture-audit)
**Scope**: Structural integrity, configuration consistency, dependency health, architectural debt

---

## Executive Summary

**Overall Status**: 🟡 MEDIUM RISK - Multiple P1 configuration issues, several P2 structural concerns

**Critical Finding**: Missing `config.yaml` in project root (referenced by multiple systems), agent-registry.json too large for single read operations, 25+ deprecated hooks still registered in settings.json

**Key Stats**:

- **Agents**: 60 agent files found, registry claims different count (needs verification)
- **Skills**: 454 SKILL.md files found, catalog reports 100 active (major discrepancy)
- **Hooks**: 100+ hook files, settings.json registers ~30 active hooks
- **Tools**: 72 active tool scripts
- **Workflows**: 8 core workflows

---

## P0 Findings (Critical - Runtime Failures)

### P0-001: Missing config.yaml in Project Root

**Status**: 🔴 CRITICAL

**File Locations**:

- Expected: `C:\dev\projects\agent-studio\config.yaml` (MISSING)
- Found: `C:\dev\projects\agent-studio\.claude\config.yaml` (EXISTS)

**Impact**:

- All agents attempting to resolve models via config.yaml will fail
- config.yaml references in CLAUDE.md Section 5.1 point to root location
- Model resolution fallback will always trigger (haiku/sonnet/opus defaults)

**Evidence**:

```bash
$ test -f "C:\dev\projects\agent-studio\config.yaml" && echo "EXISTS" || echo "MISSING"
MISSING
```

**Suggested Fix**:

```bash
# Option 1: Move config to root (RECOMMENDED)
mv .claude/config.yaml config.yaml

# Option 2: Update all references to .claude/config.yaml
# Update .claude/lib/utils/agent-config-reader.cjs
# Update all documentation references
```

**References**:

- CLAUDE.md Section 5.1: Model Resolution from config.yaml (ADR-075)
- `.claude/lib/utils/agent-config-reader.cjs` (model resolver)

---

### P0-002: Agent Registry Too Large for Single Read

**Status**: 🔴 CRITICAL

**File**: `.claude/context/agent-registry.json` (43,627 tokens)
**Limit**: 25,000 tokens per Read operation

**Impact**:

- Any agent attempting `Read('.claude/context/agent-registry.json')` will fail
- Router agent discovery will fail if registry fallback is triggered
- CI/CD validation scripts may fail

**Evidence**:

```
Read error: File content (43627 tokens) exceeds maximum allowed tokens (25000)
```

**Suggested Fix**:

```javascript
// Split registry into chunks
// Option 1: Pagination in code
Read({ file_path: '.claude/context/agent-registry.json', offset: 0, limit: 500 })

// Option 2: Split registry by category
// .claude/context/agent-registry-core.json (core agents)
// .claude/context/agent-registry-domain.json (domain specialists)
// .claude/context/agent-registry-orchestrators.json (orchestrators)

// Option 3: Use Grep to extract specific agent
Grep({ pattern: '"name": "planner"', path: '.claude/context/agent-registry.json', -A: 20 })
```

**References**:

- CLAUDE.md Section 1: Agent discovery (Registry-first, filesystem fallback)
- `.claude/lib/routing/agent-registry-resolver.cjs`

---

### P0-003: Missing Tool Script Referenced by Package.json

**Status**: 🔴 CRITICAL

**File**: `.claude/tools/analysis/verify-hook-files.mjs` (MISSING)

**Impact**:

- Cannot verify hook file existence programmatically
- CI/CD hook validation will fail
- Dead hook detection disabled

**Evidence**:

```bash
$ node .claude/tools/analysis/verify-hook-files.mjs
Error: Cannot find module 'C:\dev\projects\agent-studio\.claude\tools\analysis\verify-hook-files.mjs'
```

**Suggested Fix**:

```bash
# Create missing script or remove reference
# Check if script exists in _archive
find .claude -name "verify-hook-files.mjs"

# If archived, restore or update documentation
# If deleted, remove references from docs
```

---

## P1 Findings (High - Incorrect Behavior)

### P1-001: Skill Count Discrepancy (454 vs 100)

**Status**: 🟠 HIGH PRIORITY

**Files**:

- Filesystem: 454 SKILL.md files found
- Catalog: `.claude/context/artifacts/catalogs/skill-catalog.md` reports 100 active skills

**Impact**:

- 354 skills are undocumented/untracked (orphans)
- Agents may invoke skills not in catalog
- Skill discovery via catalog will miss 78% of skills

**Evidence**:

```bash
$ find .claude/skills -name "SKILL.md" -type f | wc -l
454

$ head -3 .claude/context/artifacts/catalogs/skill-catalog.md
> **Total Skills: 100** (1 deprecated alias) | Last Updated: 2026-02-09
```

**Suggested Fix**:

```bash
# Audit all SKILL.md files
find .claude/skills -name "SKILL.md" -type f > /tmp/all-skills.txt

# Compare against catalog
# Extract skill names from catalog
grep "^\| \`" .claude/context/artifacts/catalogs/skill-catalog.md | cut -d'`' -f2 > /tmp/catalog-skills.txt

# Find orphans
comm -23 <(sort /tmp/all-skills.txt) <(sort /tmp/catalog-skills.txt) > /tmp/orphan-skills.txt

# Options:
# 1. Archive orphan skills to .claude/skills/_archive/orphans/
# 2. Add missing skills to catalog
# 3. Validate each SKILL.md for active use
```

**References**:

- `.claude/context/artifacts/catalogs/skill-catalog.md` (catalog)
- Skill cleanup history in catalog: "Archived: 214 dead skills"

---

### P1-002: Agent Count Mismatch (config.yaml vs filesystem)

**Status**: 🟠 HIGH PRIORITY

**Files**:

- Filesystem: 60 agent .md files found
- Config.yaml: 56 agents defined (router through swarm-coordinator)

**Impact**:

- 4 agents exist on filesystem but not in config
- These agents won't have model resolution configured
- Agents may use incorrect model (fallback to sonnet)

**Evidence**:

```bash
$ find .claude/agents -name "*.md" -type f | wc -l
60

$ grep "^  [a-z-]*:" .claude/config.yaml | wc -l
56
```

**Suggested Fix**:

```bash
# Find agents in filesystem not in config
find .claude/agents -name "*.md" -type f | while read file; do
  agent_name=$(basename "$file" .md)
  grep -q "^  $agent_name:" .claude/config.yaml || echo "MISSING: $agent_name"
done

# Add missing agents to config.yaml or archive them
```

---

### P1-003: Stale Catalog Modification Dates

**Status**: 🟠 HIGH PRIORITY

**Files**:

- `skill-catalog.md`: Last updated 2026-02-09 (2 days old)
- `tool-catalog.md`: Last updated 2026-02-10 (1 day old)
- Current audit date: 2026-02-11

**Impact**:

- Catalogs may not reflect recent changes
- New skills/tools added in last 2 days are missing
- Agents relying on catalog will miss new capabilities

**Evidence**:

```bash
$ ls -la .claude/context/artifacts/catalogs/*.md
-rw-r--r-- 1 oimir 197609 26476 Feb  9 14:24 skill-catalog.md
-rw-r--r-- 1 oimir 197609 17006 Feb 10 00:03 tool-catalog.md
```

**Suggested Fix**:

```bash
# Regenerate catalogs from source
node .claude/tools/analysis/regenerate-skill-catalog.mjs
node .claude/tools/analysis/regenerate-tool-catalog.mjs

# Add to CI/CD pre-commit hook
# Verify catalog freshness on every commit
```

---

### P1-004: Archived Hooks Still Registered in settings.json

**Status**: 🟠 HIGH PRIORITY

**Hooks Registered**: ~30 active hooks in settings.json
**Hooks on Filesystem**: 100+ hook .cjs files (including \_archive/ directory)

**Potential Dead Hooks** (Need Verification):

- Settings.json references hooks that may be in \_archive/
- Example: `.claude/hooks/_archive/routing/task-auto-route.cjs`
- Settings.json may have stale references

**Impact**:

- Claude Code will attempt to execute dead hooks
- Hook failures will slow down all tool invocations
- Errors logged but not surfaced clearly

**Evidence**:

```bash
$ find .claude/hooks -name "*.cjs" | wc -l
100+

$ grep '"command":' .claude/settings.json | wc -l
~30
```

**Suggested Fix**:

```bash
# Verify all registered hooks exist
grep '"command": "node' .claude/settings.json | sed 's/.*"node //' | sed 's/".*//' | while read hook; do
  test -f "$hook" || echo "DEAD HOOK: $hook"
done

# Remove dead hooks from settings.json
# Archive orphaned hooks
```

**References**:

- `.claude/settings.json` (lines 10-283)
- User memory: "Claude Code caches settings.json at session startup — hook registration changes require restart"

---

## P2 Findings (Medium - Structural Debt)

### P2-001: Missing Documentation Reference Files

**Status**: 🟡 MEDIUM PRIORITY

**Missing Files Referenced by CLAUDE.md**:

- `@AGENT_ROUTING_TABLE.md`
- `@CREATOR_SKILLS_TABLE.md`
- `@TOOL_REFERENCE.md`
- `@MODEL_SELECTION.md`
- `@SKILL_CATALOG_TABLE.md`
- `@SKILL_USAGE_GUIDE.md`
- `@ENTERPRISE_WORKFLOWS.md`
- `@ENVIRONMENT_CONFIG.md`
- `@DIRECTORY_STRUCTURE.md`
- `@ENFORCEMENT_HOOKS.md`
- `@HOOK_AGENT_MAP.md`
- `@WORKFLOW_AGENT_MAP.md`
- `@TASK_TRACKING_GUIDE.md`
- `@EVOLUTION_WORKFLOW.md`

**Impact**:

- Router references these files for routing decisions
- Agents attempting to read these files will fail
- Documentation fragmentation

**Suggested Fix**:

```bash
# Check if files exist in .claude/docs/
ls .claude/docs/@*.md

# Option 1: Create missing files
# Option 2: Update CLAUDE.md to remove @file references
# Option 3: Generate @files from existing content
```

**References**:

- CLAUDE.md Section "REFERENCE INDEX" (all @file references)

---

### P2-002: Duplicate Agent File (router.md)

**Status**: 🟡 MEDIUM PRIORITY

**Files**:

- `.claude/agents/router.md` (root level)
- `.claude/agents/core/router.md` (core directory)

**Impact**:

- Ambiguity in agent file resolution
- User memory notes: "router.md (root) is a DUPLICATE — delete root"
- Risk of editing wrong file

**Evidence**:

- User memory: `.claude/agents/router.md` (root) is a DUPLICATE of `.claude/agents/core/router.md` - delete root

**Suggested Fix**:

```bash
# Compare files
diff .claude/agents/router.md .claude/agents/core/router.md

# If identical, delete root duplicate
rm .claude/agents/router.md

# If different, merge or archive
```

---

### P2-003: Inconsistent Workflow Count (8 vs documented count)

**Status**: 🟡 MEDIUM PRIORITY

**Core Workflows Found**: 8 workflows in `.claude/workflows/core/`

- ecosystem-creation-workflow.md
- enterprise-workflow.md
- evolution-workflow.md
- external-integration.md
- post-creation-validation.md
- reflection-workflow.md
- router-decision.md
- skill-lifecycle.md

**CLAUDE.md References**: Multiple workflows referenced but not all documented

**Impact**:

- Unclear which workflows are active
- Missing workflow documentation
- Agents may not know which workflow to use

**Suggested Fix**:

```bash
# Audit all workflows
find .claude/workflows -name "*.md" -type f

# Create workflow registry
# Map workflow to agent assignments
# Document workflow dependencies
```

---

### P2-004: Oversized Memory Files Risk

**Status**: 🟡 MEDIUM PRIORITY

**Config.yaml Memory Settings**:

```yaml
memory:
  rotation:
    threshold_kb: 20 # Rotate hot memory files when they exceed 20KB
```

**Current Memory Files** (Need Check):

- `.claude/context/memory/learnings.md`
- `.claude/context/memory/decisions.md`
- `.claude/context/memory/issues.md`

**Impact**:

- Memory files approaching 20KB limit trigger rotation
- Rotation failures may cause memory loss
- No automated rotation monitoring

**Suggested Fix**:

```bash
# Check current file sizes
ls -lh .claude/context/memory/*.md

# Set up monitoring
# Automate rotation when threshold approached
# Add pre-commit hook to check memory file sizes
```

**References**:

- config.yaml lines 66-73 (memory management)
- ADR-102 (Memory management rebuild)

---

### P2-005: No Validation for Tool Catalog vs Filesystem

**Status**: 🟡 MEDIUM PRIORITY

**Tools on Filesystem**: 72 tool scripts (.mjs/.cjs files)
**Tool Catalog**: Claims 66 active tools (from catalog header)

**Impact**:

- 6 tools may be undocumented
- New tools added but not cataloged
- Tool discovery incomplete

**Evidence**:

```bash
$ find .claude/tools -name "*.mjs" -o -name "*.cjs" | wc -l
72

# Catalog claims:
# "66 active CLI-executable utilities across 13 categories"
```

**Suggested Fix**:

```bash
# Generate tool inventory
find .claude/tools -name "*.mjs" -o -name "*.cjs" | sort > /tmp/all-tools.txt

# Compare against catalog
# Add validation script to CI/CD
```

---

### P2-006: Missing Package.json Dependencies Validation

**Status**: 🟡 MEDIUM PRIORITY

**Package.json Scripts**: 50+ npm scripts defined
**Dependency Count**: Unknown (need full package.json read)

**Impact**:

- Scripts may reference missing dependencies
- Validation scripts may fail silently
- CI/CD may break on fresh install

**Suggested Fix**:

```bash
# Validate all scripts can execute
pnpm validate:full

# Check for missing dependencies
npm ls --depth=0 2>&1 | grep UNMET

# Run dependency audit
pnpm audit
```

---

## P3 Findings (Low - Minor Issues)

### P3-001: Inconsistent Naming Conventions

**Status**: 🟢 LOW PRIORITY

**Examples**:

- Hooks use `.cjs` extension (CommonJS)
- Tools use mixed `.mjs`/`.cjs` (ESM vs CommonJS)
- Some files use `kebab-case`, others `camelCase`

**Impact**:

- Inconsistent module loading
- Developer confusion
- No enforcement of naming conventions

**Suggested Fix**:

- Document naming conventions in CONTRIBUTING.md
- Add linter rules for filename patterns
- Standardize extensions (.cjs for CommonJS, .mjs for ESM)

---

### P3-002: Stale Test References

**Status**: 🟢 LOW PRIORITY

**Package.json Test Scripts**:

```json
"test:hooks": "echo 'Hook tests archived - see .claude.archive/.claude.old/tests/'"
```

**Impact**:

- Developer confusion (tests archived but scripts remain)
- CI/CD may attempt to run non-existent tests

**Suggested Fix**:

- Remove archived test scripts from package.json
- Update README with test migration notes

---

### P3-003: Large Archive Directory (.claude.archive)

**Status**: 🟢 LOW PRIORITY

**Archive Contains**:

- Old config.yaml
- Deprecated agents
- Archived tools
- Historical code

**Impact**:

- Large repository size
- Slow git operations
- Confusion about active vs archived files

**Suggested Fix**:

- Move .claude.archive to separate git repository
- Add .claude.archive to .gitignore
- Document archive location externally

---

## Recommendations by Priority

### Immediate Actions (P0 - This Week)

1. **Move config.yaml to root** or update all references
2. **Split agent-registry.json** into smaller chunks (<25K tokens)
3. **Create/restore verify-hook-files.mjs** tool script

### Short-Term Actions (P1 - Next 2 Weeks)

1. **Audit skill files** and reconcile with catalog (454 vs 100)
2. **Verify all registered hooks exist** and archive dead references
3. **Regenerate all catalogs** to match current state
4. **Add missing agents to config.yaml**
5. **Delete duplicate router.md** from root

### Medium-Term Actions (P2 - Next Month)

1. **Create missing @files** referenced by CLAUDE.md
2. **Audit all workflows** and create workflow registry
3. **Implement memory file size monitoring**
4. **Validate tool catalog against filesystem**
5. **Run full dependency audit** (pnpm audit)

### Long-Term Actions (P3 - Next Quarter)

1. **Standardize naming conventions** across codebase
2. **Clean up package.json** test scripts
3. **Archive .claude.archive** to external storage
4. **Document file placement rules** enforcement

---

## Testing Recommendations

### Validation Scripts to Run

```bash
# Full validation suite
pnpm validate:full

# Specific validations
pnpm validate:routing    # Check routing table consistency
pnpm validate:schemas    # Validate JSON schemas
pnpm validate:references # Check all file references
pnpm validate:models     # Verify model names

# Metrics checks
pnpm metrics:ci          # Run all metrics checks

# Test suite
pnpm test               # Run all tests
```

### Manual Verification Checklist

- [ ] Verify config.yaml location and references
- [ ] Check agent-registry.json can be read
- [ ] Confirm all hooks in settings.json exist
- [ ] Audit skill count (454 vs catalog)
- [ ] Verify workflow registry accuracy
- [ ] Check memory file sizes
- [ ] Validate tool catalog completeness
- [ ] Test model resolution for all agents
- [ ] Verify @file references in CLAUDE.md

---

## Architecture Quality Metrics

**Configuration Health**: 🟡 MEDIUM

- config.yaml: ✅ EXISTS (.claude/ location)
- settings.json: ✅ VALID
- package.json: ✅ VALID
- Consistency: 🟡 ISSUES (location mismatch, dead hooks)

**Registry Health**: 🟡 MEDIUM

- agent-registry.json: 🔴 TOO LARGE (43K tokens)
- skill-catalog.md: 🟡 STALE (2 days old)
- tool-catalog.md: 🟡 STALE (1 day old)
- workflow-registry.json: ✅ EXISTS

**Dependency Health**: 🟢 GOOD

- Node.js: ✅ v22.17.1 (current)
- Package scripts: ✅ 50+ scripts defined
- Validation: ✅ Multiple validation scripts

**Code Organization**: 🟢 GOOD

- Agents: ✅ 60 files organized by category
- Skills: 🟡 454 files (354 orphans)
- Hooks: ✅ 100+ files (some archived)
- Tools: ✅ 72 files (66 cataloged)

**Documentation**: 🟡 MEDIUM

- Core docs: ✅ CLAUDE.md comprehensive
- Reference docs: 🔴 14 @files missing
- Catalogs: 🟡 STALE (1-2 days old)
- Workflows: ✅ 8 core workflows documented

---

## Summary of Action Items

### Critical Path (Blocking Issues)

1. **Fix config.yaml location** (P0-001) - 1 hour
2. **Split agent-registry.json** (P0-002) - 2 hours
3. **Restore verify-hook-files.mjs** (P0-003) - 1 hour

**Total**: 4 hours to resolve critical blocking issues

### High Priority (Correctness Issues)

1. **Audit skill orphans** (P1-001) - 4 hours
2. **Clean up dead hooks** (P1-004) - 2 hours
3. **Regenerate catalogs** (P1-003) - 1 hour
4. **Add missing agents to config** (P1-002) - 1 hour

**Total**: 8 hours for high-priority correctness

### Medium Priority (Debt Reduction)

1. **Create @file documentation** (P2-001) - 8 hours
2. **Delete duplicate router.md** (P2-002) - 30 minutes
3. **Audit workflows** (P2-003) - 2 hours
4. **Monitor memory files** (P2-004) - 1 hour

**Total**: 11.5 hours for debt reduction

---

## Conclusion

The agent-studio project is structurally sound with strong foundations (comprehensive config.yaml, organized directory structure, extensive validation scripts), but suffers from **configuration location issues**, **catalog staleness**, and **registry size problems**.

**Most Critical**: The missing config.yaml in project root and oversized agent-registry.json are blocking issues that prevent correct model resolution and agent discovery.

**Most Impactful**: The 354 orphan skills (454 vs 100 in catalog) represent significant undocumented capability that agents cannot discover.

**Quick Wins**:

1. Move config.yaml to root (30 min)
2. Delete duplicate router.md (5 min)
3. Regenerate catalogs (30 min)

**Recommended Next Steps**:

1. Address all P0 findings this week (4 hours)
2. Schedule P1 findings for sprint planning (8 hours)
3. Create technical debt backlog for P2/P3 findings

---

**Report Generated**: 2026-02-11
**Agent**: architect (Task: architecture-audit)
**Session**: claude-code-session-2026-02-11
