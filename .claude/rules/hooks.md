# Hooks

## Core Rules

- Hooks must never break the tool pipeline
- Use stderr for logging; stdout for structured hook outputs only
- All hooks must handle errors gracefully (exit 0 on non-critical failures)

## Hook Protocol

- Hooks use **stdin/stdout JSON protocol**
- Input: JSON object via stdin with tool invocation details
- Output: JSON object via stdout with `{ allow: true/false, message?: string }`
- Exit codes: `0` = allow, `2` = block
- Never use blocking operations or network calls in pre-commit hooks

## Chain-of-Responsibility Pattern

**Pattern**: Hooks execute in priority order, each can pass/block/transform.

**Implementation**:

- Hooks registered in `.claude/settings.json` with priority
- Execution order: routing → safety → validation
- Early exit on first block (no wasted execution)

**Example**:

```javascript
// Priority 1: routing-guard.cjs (checks planner-first)
// Priority 2: unified-creator-guard.cjs (checks creator paths)
// Priority 3: unified-pre-write-hook.cjs (checks file safety)
```

## Performance Budget

**Target**: Hooks should complete in <100ms.

**Why**: Hooks block tool execution. Slow hooks = slow agent workflows.

**Monitoring**: `post-tool-metrics-unified.cjs` tracks hook execution time

**Red Flags**:

- Hook >500ms: Investigate immediately
- Hook >1s: Disable or refactor

## Hook Categories

**Pre-Action Hooks** (validation, guard):

- Validate inputs before tool execution
- Block unsafe operations
- Example: `routing-guard.cjs`, `unified-creator-guard.cjs`

**Post-Action Hooks** (metrics, logging):

- Record metrics after tool execution
- Log completions, errors
- Example: `post-tool-metrics-unified.cjs`

**Why Separate**: Pre-action is blocking (must be fast), post-action is async (can be slower)

## Hook Organization

- Hooks live in `.claude/hooks/` organized by concern:
  - `routing/` - Agent routing and spawning validation
  - `safety/` - File safety, path validation, Windows compatibility
  - `validation/` - Input validation, schema validation
  - `reflection/` - Reflection enforcement and verification
  - `git/` - Git-related hooks (pre-commit, commit-msg)

## Creating New Hooks

- Use `hook-creator` skill for new hooks
- Test hooks with hook test framework: `pnpm test:hooks`
- Add graceful degradation (try/catch wrapping)
- Document hook behavior in frontmatter

## Consolidated Hooks (2026-02-08)

**Major consolidation**: 6 wildcard hooks consolidated into 2:

- `pre-tool-unified.cjs` - 11 safety checks (path validation, Windows compatibility, file safety)
- `post-tool-metrics-unified.cjs` - Metrics collection, logging

**Benefits**: Reduced hook overhead from 6 checks to 2, faster execution

## Fail-Open vs Fail-Closed Policy

Hooks MUST follow the correct error-handling posture based on their category:

| Category                                                              | Policy           | Exit Code on Error | Examples                                                                                                 |
| --------------------------------------------------------------------- | ---------------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| **Security hooks** (routing, creator, write)                          | Fail-closed      | `process.exit(2)`  | `routing-guard.cjs`, `unified-creator-guard.cjs`, `write-pretool-bundle.cjs`, `router-tool-lockdown.cjs` |
| **Advisory hooks** (metrics, bypass-audit, validate-skill-invocation) | May fail-open    | `process.exit(0)`  | `post-tool-metrics-unified.cjs`, `bypass-audit-hook.cjs`                                                 |
| **Post hooks** (all PostToolUse)                                      | Should fail-open | `process.exit(0)`  | `post-completion-chain.cjs`, `reflection-cleanup.cjs`                                                    |

**Rationale:** Security hooks that fail-open on errors create bypass vectors (SEC-008). Advisory and post hooks should not block workflow on transient errors.

## Reference Documentation

See `.claude/docs/HOOKS_REFERENCE.md` for comprehensive hook authoring guide.

## Related References

- `@ENFORCEMENT_HOOKS.md` - Complete hook catalog and enforcement modes
- `@HOOK_AGENT_MAP.md` - Hook-agent mapping matrix
- `.claude/hooks/` - Hook implementation directory
