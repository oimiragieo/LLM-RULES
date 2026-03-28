---
name: a2a-worker
description: Builds A2A protocol integration - auto-start hook, client library, router wiring
---

# A2A Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features involving:

- A2A server auto-start hook creation
- A2A client library development
- Router-to-A2A integration
- Cross-session communication via A2A HTTP
- A2A test suite development

## Work Procedure

1. **Read CTO Directive #3 from AGENTS.md:** A2A server MUST be spawned as fully detached background subprocess. NEVER synchronous.

2. **Study the existing pattern** in `.claude/hooks/channels/channel-auto-start.cjs`:
   - How it checks env vars and prerequisites
   - How it uses lockfile with `wx` flag for cooldown
   - How it records PID in `terminal-pids.json`
   - How it spawns a detached process via `.bat` file + `start "" /D`
   - How it uses VBScript for auto-accept

3. **Write tests first (red)** for the component you're building:
   - Auto-start hook: test lockfile creation, PID tracking, duplicate prevention
   - Client library: test discovery, send, get, cancel, subscribe
   - Router integration: test dispatch flow

4. **Implement following existing A2A code patterns:**
   - Server code is in `.claude/lib/a2a/server.cjs` (Express, JSON-RPC 2.0)
   - Task state machine in `.claude/lib/a2a/task-state-machine.cjs`
   - Agent card in `.claude/lib/a2a/agent-card.cjs`
   - SSE in `.claude/lib/a2a/sse-stream.cjs`
   - JSON-RPC in `.claude/lib/a2a/jsonrpc-handler.cjs`

5. **For auto-start hook (`a2a-server-autostart.cjs`):**
   - Register as UserPromptSubmit hook in settings.json
   - Check `A2A_AUTO_START=true` env var
   - Check not already inside A2A session
   - Use atomic lockfile with 2-min cooldown
   - Check terminal-pids.json for existing live PID
   - Spawn via `.bat` file + `start "" /D` pattern (Windows)
   - Record PID in terminal-pids.json with purpose: 'a2a-server'
   - Exit hook promptly (< 5 seconds)

6. **For client library (`client.cjs`):**
   - Create at `.claude/lib/a2a/client.cjs`
   - Methods: discover(), sendTask(), getTask(), cancelTask(), sendSubscribe()
   - Uses standard http/https module (no external dependencies)
   - Handles JSON-RPC 2.0 request/response envelope
   - Handles SSE streaming for subscribe

7. **For router integration:**
   - Wire A2A client into the routing/dispatch flow
   - Router can send tasks to channel session via A2A HTTP
   - Handle task results and failures

8. **Run tests:**

   ```
   node --test tests/lib/a2a/*.test.cjs
   ```

9. **Verify coexistence with Telegram:**
   - Both auto-start hooks should work independently
   - Separate lockfiles, separate PID entries
   - No port conflicts

10. **Commit** with descriptive message.

## Example Handoff

```json
{
  "salientSummary": "Created a2a-server-autostart.cjs hook following channel-auto-start.cjs pattern. Spawns Express server on port 3100 as detached background process via .bat file. Uses independent lockfile and PID tracking. Created A2A client at .claude/lib/a2a/client.cjs with discover/send/get/cancel/subscribe methods. Both Telegram and A2A auto-start work independently.",
  "whatWasImplemented": "Auto-start hook with env check, lockfile, PID tracking, detached spawn. Client library with full JSON-RPC 2.0 support and SSE streaming. Both registered in settings.json.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "node --test tests/lib/a2a/a2a-server.test.cjs",
        "exitCode": 0,
        "observation": "All server tests pass"
      },
      {
        "command": "node --test tests/lib/a2a/a2a-client.test.cjs",
        "exitCode": 0,
        "observation": "All client tests pass"
      },
      { "command": "pnpm test:framework", "exitCode": 0, "observation": "No regressions" }
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      {
        "file": "tests/lib/a2a/a2a-client.test.cjs",
        "cases": [
          { "name": "discovers remote agent card", "verifies": "client discovery" },
          { "name": "sends task via JSON-RPC", "verifies": "task creation" },
          { "name": "polls task status", "verifies": "status retrieval" }
        ]
      }
    ],
    "coverage": "A2A server, client, and autostart hook covered"
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Express server can't bind to port 3100 (port conflict)
- Telegram auto-start interferes with A2A auto-start
- Existing A2A server code has bugs that block integration
- Windows-specific spawn pattern doesn't work as expected
