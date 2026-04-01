## Validation Concurrency
- **CLI / Node scripts**: Max 4 concurrent validators. Isolation requires running tests in separate temporary directories or ensuring no shared state. 

## Flow Validator Guidance: CLI
- **Boundaries**: When testing CLI hooks, use `node <script_path>` with simulated `stdin` input. Do not mutate the global project files like `.claude/settings.json` unless using a dedicated test environment. For testing `denial-feedback-reader.cjs`, create a temporary `denial-log.json` and pass its path to `getDenialFeedback(logFile)`.
- **Shared State**: Ensure isolated temp files for inputs or logs when testing concurrently.
