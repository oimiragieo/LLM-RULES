# Session Handoff — Performance Phase 3: Mtime Cache Invalidation

**NEXT ACTION (IMMEDIATE):** Implement Phase 3 from the performance plan — mtime-based cache invalidation for spawn-prompt-assembler.task-tools.cjs. The plan is at `C:\Users\oimir\.claude\plans\cuddly-shimmying-stardust.md`.

## What Was Done This Session

1. **Factory Droid parity** — Planner emits features.json, spawn template requires handoff metadata, orchestrator wired to grading/evidence/contract generation
2. **Telegram /code command** — Mission-aware coding pipeline with skill-router, handoff-capture, mission-executor (48 tests)
3. **Bug fixes** — AJV format warnings, workspace nested path, evidence-collector shell safety, complexity-classifier restored, drift-detector unreachable code, 8 unused var fixes
4. **Code index fix** — Exclusion patterns added for worktrees/tmp (index went from 15K junk files to 4K real files, 10x faster rebuild)
5. **Performance phases 1,2,4,5 complete** — Lazy AJV (saves 15-30ms), metadata size caps (2K/4K), token budget enforcement (90% + diminishing returns), index config validation test
6. **Session-handoff bug fix** — Added --model sonnet flag to spawn-new-session.cjs to prevent 1M context extra-usage error

## Phase 3 Remaining (THE TASK)

**File to modify:** `.claude/hooks/routing/spawn-prompt-assembler.task-tools.cjs`

**What to do:**

- Replace `let _registryCache = null` (line 302) with `{ data: null, mtimeMs: 0 }`
- Same for `_manifestCache` (line 303) and `_constitutionCache` (line 304)
- Add `_getMtimeMs(path)` helper: `fs.statSync(path).mtimeMs` in try/catch
- In `loadAgentRegistry()` (line 306): compare current mtime to cached mtime, skip read if unchanged
- In `loadToolManifest()` (line 324): same pattern
- In `loadConstitutionContext()` (line 542): track two mtimes (constitution.md + behaviour.md)
- Export `_resetCaches()` for test cleanup

**Test to write:** `tests/hooks/spawn-prompt-assembler-mtime-cache.test.cjs`

**After Phase 3:** Run `pnpm lint:fix && pnpm format && pnpm test`. Then commit ALL session changes and push.

## All Uncommitted Changes

30+ modified files, 20+ new files. Run `git status` for full list. ALL tests pass (25 new + existing). Lint and format clean.
