# Claude Code Internals

Key constants and patterns from Claude Code source that agent-studio must align with.

## Character Caps

- **CLAUDE.md + rules total**: 40,000 character hard cap (`MAX_MEMORY_CHARACTER_COUNT`)
- Characters beyond cap are **silently dropped** — no error, no warning
- Current agent-studio total: ~66K (26K over cap) — being fixed in Phase 5

## Hook System

- **Async hooks**: `async: true` in registration — runs in background, doesn't block tool execution
- **Hook events available**: PreToolUse, PostToolUse, PostToolUseFailure, UserPromptSubmit, SessionStart, SessionEnd, SubagentStart, SubagentStop, PreCompact, PostCompact, Stop, PermissionDenied, FileChanged, CwdChanged, WorktreeCreate, WorktreeRemove, TaskCreated, TaskCompleted, ConfigChange, InstructionsLoaded, Setup, Notification, PermissionRequest, Elicitation
- **Hook output fields**: `updatedInput` (modify tool params), `suppressOutput`, `additionalContext`, `watchPaths` (SessionStart)
- **`if` conditions**: Use tool's `preparePermissionMatcher` for fine-grained matching (e.g., `Bash(git push *)`)

## Compaction Constants

- `AUTOCOMPACT_BUFFER_TOKENS = 13,000`
- `MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3` (circuit breaker)
- `POST_COMPACT_MAX_FILES_TO_RESTORE = 5`
- `POST_COMPACT_TOKEN_BUDGET = 50,000`
- `CAPPED_DEFAULT_MAX_TOKENS = 8,000` (output token slot reservation)
- `ESCALATED_MAX_TOKENS = 64,000`

## Prompt Cache

- Tools must be sorted alphabetically for cache stability
- Static/dynamic boundary marker: `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__`
- Cache breakpoints on last 3 user messages
- Section content cached per-section to prevent accidental invalidation

## Settings Layers

- settings.local.json for local overrides (not committed)
- settings.json for project settings (committed)
- 7-layer merge with strict precedence
