---
name: platform-fix-worker
description: Fixes Windows platform issues, path resolution, glob patterns, and cleanup tasks
---

# Platform Fix Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features involving:

- Windows path resolution fixes (MODULE_NOT_FOUND)
- Glob pattern cross-platform compatibility
- WSL/bash script compatibility
- Auto-generated file determinism
- Format/lint compliance
- Missing command files

## Work Procedure

1. **Read the feature description** and identify the Windows-specific failure.

2. **Reproduce the failure:**
   - Run the exact command that fails on Windows
   - Capture the full error output including stack trace
   - Identify the specific line and file causing the issue

3. **For MODULE_NOT_FOUND fixes:**
   - Read the failing require/import statement
   - Check if path separators are wrong (forward vs backslash)
   - Check if path.resolve/path.join is used correctly
   - Check for case sensitivity issues
   - Fix using `path.resolve()` or `path.join()` with proper cross-platform handling

4. **For glob pattern fixes:**
   - Node.js `--test` with glob patterns doesn't expand on Windows PowerShell
   - Use programmatic file discovery (fs.readdirSync + filter) instead of shell glob
   - Or use `glob` package if available
   - Test that the fix works on both Windows and Unix-like systems

5. **For init.sh WSL fixes:**
   - Ensure LF line endings (not CRLF)
   - Use `#!/usr/bin/env bash` shebang
   - Use `command -v` instead of `which` for portability
   - Handle pnpm/node path differences between Windows and WSL

6. **For auto-generated JSON determinism:**
   - Ensure JSON.stringify uses consistent key ordering
   - Use 2-space indentation
   - End file with newline
   - Ensure Prettier config is respected

7. **Write tests for the fix**, run platform-specific validation, commit.

## Example Handoff

```json
{
  "salientSummary": "Fixed validate-full-sequential.cjs path resolution: replaced hardcoded Unix paths with path.resolve() for cross-platform support. Fixed test:tools glob by replacing shell glob with programmatic file discovery. All 5 validators now pass on Windows.",
  "whatWasImplemented": "Path resolution fix in validate-full-sequential.cjs using path.resolve(). File discovery wrapper in test:tools script replacing shell glob.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "pnpm validate:full:parallel",
        "exitCode": 0,
        "observation": "All validators pass, no MODULE_NOT_FOUND"
      },
      {
        "command": "pnpm test:tools",
        "exitCode": 0,
        "observation": "15 tool tests executed and passed"
      }
    ],
    "interactiveChecks": []
  },
  "tests": { "added": [], "coverage": "Platform tests validated on Windows" },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Fix requires changes to npm scripts in package.json
- Platform issue is in a third-party dependency
- Fix breaks Unix/Mac compatibility
