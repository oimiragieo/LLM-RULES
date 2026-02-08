# Archived Tools

**Archive Date:** 2026-02-07
**Reason:** ADR-089 - Tools System Overhaul (Dead Tool Cleanup)

This directory contains tools that have been archived because they have zero active consumers in the codebase. These files are preserved in Git history for future reference but are no longer part of the active tools system.

## Archived Files (25 tools)

### CLI Tools - Validation (3 files)

- `validate-agent.cjs` - Duplicates `validate-agents.mjs`
- `validate-agent-routing.cjs` - No consumer
- `validate-agent-tools.cjs` - No consumer

### CLI Tools - Search (2 files)

- `kb-search.cjs` - Superseded by `hybrid-search.cjs`
- `tool_search.mjs` - No consumer

### CLI Tools - Reporting (2 files)

- `cost-report.js` - No consumer
- `monitoring-dashboard.cjs` - No consumer

### CLI Tools - Migration/One-Time (5 files)

- `migrate-agent-config.cjs` - One-time migration (completed)
- `conductor-gap-analyzer.cjs` - Conductor-specific (not used)
- `conductor-state-migrate.cjs` - Conductor-specific (not used)
- `populate-agent-config.cjs` - One-time populator (completed)
- `fix-spawn-log-task-ids.cjs` - One-time fix (completed)

### CLI Tools - ESLint Fixers (3 files)

- `eslint-batch-fix.cjs` - Ad-hoc lint fixer (also SEC-TOOL-002 - command injection)
- `eslint-unused-var-fix.cjs` - Ad-hoc lint fixer
- `eslint-useless-escape-fix.cjs` - Ad-hoc lint fixer

### CLI Tools - Modes/Tasks/Config (5 files)

- `switch-modes.cjs` - Superseded by `router-state` system
- `schedule-task.cjs` - No consumer
- `document-query.cjs` - No consumer (also SEC-TOOL-003 - path traversal)
- `get-current-config.cjs` - No consumer
- `detect-orphans.mjs` - No consumer

### CLI Tools - Memory (3 files)

- `migrate-memory.cjs` - One-time migration (completed)
- `archive-memory.mjs` - No consumer
- `archive-issues.py` - No consumer (Python)

### Visualization Tools (1 directory)

- `render-graphs/` - Zero references anywhere

### Maintenance Tools (1 file)

- `compact-lancedb.cjs` - Self-referential only

## Security Findings Mitigated by Archival

**SEC-TOOL-002 [MEDIUM]**: Command injection risk in `eslint-batch-fix.cjs`

- **Status:** MITIGATED BY ARCHIVAL
- **Original Risk:** `execSync` with string interpolation
- **Mitigation:** File archived (dead code)

**SEC-TOOL-003 [MEDIUM]**: Path traversal in `document-query.cjs`

- **Status:** MITIGATED BY ARCHIVAL
- **Original Risk:** Allows reading arbitrary files outside PROJECT_ROOT
- **Mitigation:** File archived (dead code)

## Restoration Instructions

If you need to restore any of these tools:

1. **Verify it's needed:** Check if an equivalent tool exists first
2. **Restore file:** `git mv .claude/tools/_archive/<filename> .claude/tools/cli/`
3. **Update consumers:** Update any code that imports this tool
4. **Add to package.json:** If CLI-invokable, add corresponding npm script
5. **Update documentation:** Update tools README and tool-catalog.md
6. **Run tests:** `pnpm test:tools` to verify no breakage

## Related Documentation

- **ADR-089:** `.claude/context/memory/decisions.md` (Tools System Overhaul decision)
- **Architecture Plan:** `.claude/context/plans/tools-overhaul-architecture-2026-02-07.md`
- **Security Review:** `.claude/context/reports/security/tools-system-security-review-2026-02-07.md`
- **Tool Catalog:** `.claude/context/artifacts/catalogs/tool-catalog.md`

---

**Note:** These files remain accessible in Git history. Use `git log -- .claude/tools/_archive/<filename>` to see their commit history.
