# Windows Platform Quirks

## Network Errors

Node.js on Windows throws `AggregateError` for network failures instead of specific network error types (like `ECONNREFUSED`). When writing test assertions for network errors, ensure the regex or type check accounts for `AggregateError` on Windows.

## Process Management

Reliably obtaining the PID of a detached background process (like `cmd.exe`) on Windows may require using an undocumented `powershell` command fallback via `execFileSync`, as standard node tools may not surface the correct PID.

## Filesystem EBUSY

When writing tests that involve filesystem operations (especially cleanup/deletion), Windows frequently throws `EBUSY` errors due to file locking. Test cleanup routines should implement retry logic or graceful error ignoring to prevent test flakiness.

## Process Spawning

When using `child_process.spawn` for shell commands, Windows requires using `cmd.exe /s /c` with `windowsVerbatimArguments: true` instead of `/bin/bash -c`. Ensure cross-platform code handles this platform difference correctly.

## Unix Utilities Alternatives

When trying to use standard Unix utilities like `wc -l` for line counting, the Windows equivalent `find /c /v ""` can sometimes fail with "Parameter format not correct". A reliable cross-platform alternative is writing a simple `node -e` script.
