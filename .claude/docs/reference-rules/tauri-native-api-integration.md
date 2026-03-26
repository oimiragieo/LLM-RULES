---
paths:
  - .claude/skills/tauri-native-api-integration/**
---

# Tauri Native API Integration Rules

## Core Principles

- Use Tauri commands for Rust ↔ JS communication
- Invoke Rust functions from frontend with type safety
- Handle async operations properly
- Secure IPC with allowlists
- Bundle size optimization

## Tauri Commands Standards

- Define commands in Rust with `#[tauri::command]`
- Export via `tauri::Builder` in main.rs
- Invoke from frontend with `invoke()`
- Use Result<T, E> for error handling
- Serialize/deserialize with serde

## Type Safety Standards

- Generate TypeScript types from Rust structs
- Use tauri-specta for type generation
- Validate inputs on Rust side
- Return typed errors to frontend
- Use enums for state machines

## Security Standards

- Allowlist specific commands (not all)
- Validate all inputs in Rust
- Use CSP headers for XSS protection
- Limit API access with permissions
- Sanitize file paths (prevent traversal)

## Performance Standards

- Batch IPC calls when possible
- Use events for one-way communication
- Stream large data instead of loading fully
- Cache expensive Rust computations
- Use async for I/O operations

## Error Handling

- Return Result<T, E> from all commands
- Map Rust errors to frontend-friendly messages
- Log errors on Rust side
- Show user-friendly errors on frontend
- Include error codes for debugging

## Anti-Patterns

- No allowlist (expose all commands)
- Synchronous I/O in Rust commands
- No input validation
- Large data transfers over IPC
- Unhandled errors in async functions

## Integration Points

- `frontend-expert` skill - Frontend integration
- `security-architect` agent - IPC security review
- `expo-framework-rule` skill - Mobile patterns

## Related References

- `.claude/skills/tauri-native-api-integration/SKILL.md` - Tauri IPC patterns
- `.claude/skills/frontend-expert/SKILL.md` - Frontend integration
