# Active Context

<!-- Last Updated: 2026-03-11 | Task: Shift Change Phase 7+8 -->

## Current Focus

EPIC: Always-On Memory + Async Worker Pool + A2A Protocol — verify full wiring, test coverage, and runtime correctness after the massive memory upgrade.

## Pending Actions (EXECUTE THESE IN ORDER)

1. **[HIGH] Lint + format** — run `pnpm lint:fix && pnpm format`, fix all issues found
2. **[HIGH] LSP wiring audit** — use lsp-navigator skill to check for unwired symbols, broken imports, missing exports across the memory subsystem (`.claude/lib/memory/`, `.claude/lib/a2a/`, `scripts/`)
3. **[HIGH] Ripgrep code issues scan** — use ripgrep skill to search for TODO/FIXME/HACK/console.log in production paths, unhandled promise rejections, bare JSON.parse calls, shell:true occurrences
4. **[HIGH] Memory wiring verification** — confirm STM/MTM/LTM tiers, memory-rotator, contextual-memory, memory-manager are all correctly wired together and tests cover each boundary
5. **[HIGH] A2A + Worker Pool test coverage** — run `pnpm test` and confirm TaskStateMachine, zombie watchdog, consolidate-agent, jsonrpc-handler, file-watcher all pass; fix any failures
6. **[MEDIUM] Fix all issues found** — apply fixes for every problem found in steps 1–5, commit by concern

## Recent Decisions

- **Shift Change Phases 1–8**: Complete and verified (commit f2d50099). Two-phase spawn, Step 0 pre-flight, drain gate, MT-A/MT-B all working.
- **Memory EPIC**: STM/MTM/LTM tiers shipped. TaskStateMachine SQLite persistence. Zombie watchdog. A2A JSON-RPC 2.0. Worker pool with 60s timeout. debounceMap cleanup interval.
- **safeParseJSON**: All hooks use `.claude/lib/utils/safe-json.cjs` — no bare JSON.parse on untrusted input.
- **spawn-token-guard**: Warns at 80K tokens, blocks at 120K.

## Open Questions

- Are all memory subsystem modules correctly imported/exported with no orphaned references?
- Do all tests covering the memory EPIC actually pass on a clean run?
- Any console.log statements left in production memory/a2a code?

## Working Memory

- **Key paths**: `.claude/lib/memory/`, `.claude/lib/a2a/`, `.claude/lib/context/`, `scripts/`
- **Test paths**: `tests/lib/memory/`, `tests/lib/a2a/`, `tests/hooks/`
- **Agent count**: 74 agents in registry
- **Health score**: 9.6/10 (post MEGA EPIC audit 2026-03-08)
- **pnpm commands**: `pnpm test`, `pnpm lint:fix`, `pnpm format`, `pnpm validate:full`
