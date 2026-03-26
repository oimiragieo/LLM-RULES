# Rust Development Standards

## Core Principles

- Ownership and borrowing — understand and leverage the borrow checker
- Zero-cost abstractions — prefer compile-time over runtime overhead
- Explicit over implicit — no hidden allocations or conversions
- Format with rustfmt, lint with clippy

## Ownership and Borrowing

- Prefer borrowing (&T / &mut T) over ownership transfer
- Prefer &str over String in function parameters
- Prefer &[T] over Vec<T> in function parameters
- Use Cow<str> when you might or might not need to clone
- Avoid .clone() unless necessary — audit each occurrence

## Error Handling

- Use thiserror for library errors, anyhow for application errors
- Never use .unwrap() in production code
- Use ? operator for error propagation
- Define domain-specific error enums
- Implement From<T> for error conversion

## Async Patterns

- Use tokio as the default async runtime
- Avoid blocking calls in async contexts (use spawn_blocking)
- Use tokio::select! for concurrent operations with cancellation
- Prefer tokio::sync::Mutex over std::sync::Mutex in async code

## Testing

- Use #[cfg(test)] mod tests for unit tests
- Use #[tokio::test] for async tests
- Put integration tests in tests/ directory
- Run cargo test with --release for benchmarks

## Anti-Patterns

- .unwrap() / .expect() in library code (use Result)
- Rc<RefCell<T>> everywhere (redesign ownership)
- Excessive lifetime annotations (simplify API)
- unsafe without safety comments
- Large match arms (extract to functions)

## Linting

- cargo fmt --check
- cargo clippy -- -D warnings
- cargo test
- cargo audit (check vulnerable dependencies)

## When to invoke

Skill({ skill: "rust-expert" }) for Rust development tasks
