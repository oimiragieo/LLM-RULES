# Config Archive

This directory contains configuration files that have been archived because they are no longer actively consumed by any code.

## Archived Files

### command-allowlist.yaml

- **Archived:** 2026-02-07
- **Reason:** Dead config. The validator hook (`command-allowlist-validator.cjs`) was archived in Pipeline #7. The library (`lib/safety/command-allowlist.cjs`) hardcodes the allowlist data in JavaScript instead of reading the YAML file. Zero active consumers.
- **Restoration:** If needed, restore via `git mv .claude/config/_archive/command-allowlist.yaml .claude/config/` and update `lib/safety/command-allowlist.cjs` to read from the file.

### contexts/claude-code.yml

- **Archived:** 2026-02-07
- **Reason:** Dead config. Zero active consumers in the agent-studio codebase. Appears to be speculative scaffolding for a Claude Code platform feature that was never activated.
- **Restoration:** If needed, restore via `git mv .claude/config/_archive/contexts .claude/config/`

### modes/editing.yml

- **Archived:** 2026-02-07
- **Reason:** Dead config. Zero active consumers in the agent-studio codebase. Appears to be speculative scaffolding for a Claude Code platform feature that was never activated.
- **Restoration:** If needed, restore via `git mv .claude/config/_archive/modes .claude/config/`

### modes/planning.yml

- **Archived:** 2026-02-07
- **Reason:** Dead config. Zero active consumers in the agent-studio codebase. Appears to be speculative scaffolding for a Claude Code platform feature that was never activated.
- **Restoration:** If needed, restore via `git mv .claude/config/_archive/modes .claude/config/`

## Archival Context

**Source:** Pipeline #10 - Config System Overhaul (Task #107)
**ADR:** ADR-092 (Config System Overhaul)
**Architecture Plan:** `.claude/context/plans/config-overhaul-architecture-2026-02-07.md`

## Pattern

This follows the proven archive pattern from Pipelines #3, #6, #7, and #8:

- Use `git mv` to preserve full git history (blame, log)
- Create README explaining archival rationale and restoration process
- Update documentation to reference archive location
