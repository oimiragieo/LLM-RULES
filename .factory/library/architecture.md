# Architecture

Architectural decisions and patterns discovered during mission execution.

**What belongs here:** Module structure decisions, integration patterns, dependency choices.

---

## Module Layout

New mission engine modules go in:

- `.claude/lib/mission/` - Core mission engine (workspace, state machine, mutex, parsers, handoff, dispatch, persona, friction, validation, scrutiny, gate)
- `.claude/lib/services/` - services.yaml registry and bootstrap system
- `.claude/lib/readiness/` - Readiness scoring engine and remediation

Tests mirror the module structure:

- `tests/mission/` - Mission engine tests
- `tests/services/` - Services tests
- `tests/readiness/` - Readiness tests

## Integration Points

- **Existing SQLite queue:** `.claude/lib/db/queue-operations.cjs` - Worker dispatch bridge
- **Existing worker pool:** `.claude/lib/workers/dispatcher.cjs` - EventEmitter pattern
- **Existing platform utils:** `.claude/lib/platform.cjs` - isWindows, getShell
- **Existing command detection:** `.claude/lib/utils/command-exists.cjs`
- **Existing readiness:** `.claude/lib/utils/readiness-checker.cjs` (reference, not extend)

## Design Decisions

- **Atomic writes for all state files** - Prevents corruption from crashes
- **EventEmitter pattern** for handoff watcher and friction loop - Matches existing codebase
- **AJV for all schema validation** - Consistent with existing codebase
- **No new dependencies** - Use only packages already in package.json
