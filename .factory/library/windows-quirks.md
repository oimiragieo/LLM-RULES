# Windows Platform Quirks

## Network Errors
Node.js on Windows throws `AggregateError` for network failures instead of specific network error types (like `ECONNREFUSED`). When writing test assertions for network errors, ensure the regex or type check accounts for `AggregateError` on Windows.

## Process Management
Reliably obtaining the PID of a detached background process (like `cmd.exe`) on Windows may require using an undocumented `powershell` command fallback via `execFileSync`, as standard node tools may not surface the correct PID.
