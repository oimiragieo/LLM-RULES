# Windows Platform Quirks

## Network Errors

Node.js on Windows throws `AggregateError` for network failures instead of specific network error types (like `ECONNREFUSED`). When writing test assertions for network errors, ensure the regex or type check accounts for `AggregateError` on Windows.

## Process Management

Reliably obtaining the PID of a detached background process (like `cmd.exe`) on Windows may require using an undocumented `powershell` command fallback via `execFileSync`, as standard node tools may not surface the correct PID.

## Filesystem EBUSY

When writing tests that involve filesystem operations (especially cleanup/deletion), Windows frequently throws `EBUSY` errors due to file locking. Test cleanup routines should implement retry logic or graceful error ignoring to prevent test flakiness.
