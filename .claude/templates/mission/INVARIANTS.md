# Mission Invariants

This file documents the absolute core invariants of this codebase that you MUST never break. If you break any of these statements, the build is wrong.

1. **Test-Driven:** Start with a failing test when behavior changes.
2. **Local Validation:** Run all local regression gates (`npm test`, `cargo test`, etc.) before committing any changes.
3. **No Blind Tweaking:** Reject regressions immediately even if the code looks cleaner. Always prefer established, working architectures.
4. **Specific Constraint:** _(Add your codebase-specific rule here)_
5. **Specific Constraint:** _(Add your codebase-specific rule here)_
