# skill-updater Rules

1. Do not refresh a missing skill. If target does not exist, route to `skill-creator`.
2. Always run `research-synthesis` before proposing updates.
3. Use `assimilate` only when external parity benchmarking is required.
4. Prefer smallest viable patch set that satisfies explicit failing tests.
5. Keep command surfaces as thin delegators.
6. Keep schemas in sync with script contract.
7. Validate integration + regenerate indexes after updates.
8. Record learnings/decisions/issues in memory files.
