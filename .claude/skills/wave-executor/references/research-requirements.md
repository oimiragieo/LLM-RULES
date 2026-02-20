# Wave Executor Research Requirements

Generated: 2026-02-19

## Problem Statement

Bun's JSC garbage collector has a use-after-free race condition triggered by high spawn/abort_signal accumulation in long-running processes. This crashes Claude Code during EPIC-tier multi-agent orchestration.

## Root Cause Research

- anthropics/claude-code#21875 — 78 documented crashes, root cause analysis with ProcDump/WinDbg
- anthropics/claude-code#27003 — Confirms Bun 1.3.10 still affected
- oven-sh/bun#26153 — JSC GC corruption in MarkedBlock sweep
- oven-sh/bun#26853 — Segfault at 0xFFFFFFFFFFFFFFFF on Windows x64

## Solution Research

- Ralph Wiggum pattern: https://paddo.dev/blog/ralph-wiggum-autonomous-loops/
- Ralph loop quickstart: https://github.com/coleam00/ralph-loop-quickstart
- Claude Agent SDK sessions: https://platform.claude.com/docs/en/agent-sdk/sessions
- Claude Agent SDK TypeScript ref: https://platform.claude.com/docs/en/agent-sdk/typescript

## Key Design Decisions

1. Use Claude Agent SDK `query()` instead of raw `spawnSync('claude', ...)` — typed messages, session management, streaming
2. Run wave-executor on system Node.js (not Bun) — the outer loop must not be subject to the same GC bug
3. File-based coordination (plan.json + inventory.json) instead of in-memory state — survives process death
4. Each `query()` call = new Bun subprocess = fresh GC state
