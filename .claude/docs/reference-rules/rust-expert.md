---
paths:
  - .claude/skills/rust-expert/**
---

# Rust Expert Rules

## When to Invoke

Use the `rust-expert` skill when:

- Implementing Rust libraries, CLIs, or systems-level components
- Reviewing Rust code for ownership, borrowing, or lifetime correctness
- Designing async Rust services (Tokio, async-std)
- Optimizing Rust code for performance or binary size
- Handling unsafe blocks that require soundness review

## Core Principles

- Prefer safe Rust; use `unsafe` only when necessary and always document why
- Leverage the ownership and borrowing system to eliminate runtime errors
- Express invariants through the type system rather than runtime checks
- Prefer zero-cost abstractions over dynamic dispatch when performance matters
- Use idiomatic error handling: `Result<T, E>` and the `?` operator

## Key Constraints and Guidelines

### Ownership and Borrowing

- Follow the single-owner rule; clone only when necessary and justified
- Prefer borrowing (`&T`, `&mut T`) over cloning for large data structures
- Use lifetimes explicitly when the compiler cannot infer them
- Avoid reference cycles; use `Weak<T>` when back-references are needed

### Error Handling

- Use `thiserror` for library error types; use `anyhow` for application errors
- Never use `unwrap()` or `expect()` in library code without a clear guarantee
- Propagate errors with `?`; convert errors at API boundaries
- Document all error variants in public APIs

### Async Patterns

- Use `tokio` as the default async runtime for services
- Prefer `async fn` over manual `Future` implementations
- Avoid blocking calls in async contexts; use `spawn_blocking` for CPU-bound work
- Pin futures only when required for self-referential structures

### Safety

- Document every `unsafe` block with a `// SAFETY:` comment explaining the invariant
- Minimize the surface area of `unsafe` code
- Prefer well-audited crates over writing unsafe code from scratch
- Run `cargo miri` on unsafe code when practical

## Routing Guidance

### Agents That Should Use This Skill

- **developer**: When implementing Rust features or fixing Rust bugs
- **code-reviewer**: When reviewing Rust pull requests for correctness
- **architect**: When designing Rust module boundaries and API surfaces
- **security-architect**: When auditing `unsafe` code or FFI boundaries

### Do NOT Use For

- Non-Rust implementation work (use the appropriate language expert instead)
- High-level architecture decisions independent of Rust specifics

## Related References

- `.claude/skills/rust-expert/SKILL.md` - Complete Rust skill specification
- `.claude/rules/code-standards.md` - General code quality standards
- `.claude/rules/security.md` - Security rules including unsafe code review
