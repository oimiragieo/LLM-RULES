# Session Handoff — 2026-04-10 — REVENG Phase 1.5 Wired (NOT Proven)

**NEXT ACTION (IMMEDIATE):** Before building anything new — adversarially read the last claim. The refiner feedback loop has NEVER been exercised. Spawn agents to force a real divergence and observe one complete LLM round-trip. Router MUST spawn agents, NEVER implement directly.

---

## WHAT IS NOT PROVEN YET (read this first, every session)

1. **The iterative refiner has never run a real LLM round.** hexyl "CONVERGED" in 0 iterations on `--help`. The differential oracle found no divergence before any LLM was invoked. Zero Claude API calls were made during refinement. The pipeline wires up — that is all that is proven.

2. **`behavior_matched` has never been achieved on any binary.** No binary has progressed past `compile_only` via the LLM loop. The current corpus.yaml grade for hexyl (`converged`) reflects 0-divergence on a trivial seed, not real behavioral equivalence.

3. **The refiner has zero adversarial tests.** 10 happy-path tests exist. No tests for: malformed LLM response, infinite loop guard, parse failure, compile error cascade, oracle timeout.

4. **"First real VRL run" commit name was overclaimed.** It should read "first smoke test of VRL wiring." A careful reviewer would push back on it. File this as a framing debt.

---

## Immediate Priority (next session, in order)

### P0: Force a real divergence and observe one LLM round

**Agent: python-pro**

- Add diverse seed inputs to `.reveng/benchmarks/corpus.yaml` for hexyl:
  ```yaml
  seed_inputs:
    - '--help'
    - '--version'
    - 'tests/fixtures/hexyl/sample.bin' # create this: 32 random bytes
  ```
- Create the fixture: `python -c "import os; open('tests/fixtures/hexyl/sample.bin','wb').write(os.urandom(32))"`
- Deliberately introduce a small mutation to reconstructed.c (e.g., off-by-one in output formatting) to force divergence
- Run: `PYTHONPATH=src python scripts/run_vrl.py --binary hexyl --max-iterations 3`
- Observe: does the oracle detect divergence? Does Claude produce a fix? Does recompile succeed? Does the grade improve?
- Report honestly: what happened at each iteration

### P1: Add fault-injection tests to IterativeRefiner

**Agent: python-pro**

- Add to `tests/unit/test_iterative_refiner.py`:
  - Malformed LLM response (empty string, invalid C, JSON blob)
  - Compile fails on all 3 attempts (compiler cascade exhausted)
  - Oracle timeout on every round
  - Budget exhausted before convergence
  - LLM response loops (same broken code repeated)
- These tests must pass before any further VRL work

### P2: Fix PYTHONPATH in run_vrl.py

**Agent: python-pro**

- Add `sys.path.insert(0, ...)` at top of `scripts/run_vrl.py` before any imports
- Verify `python scripts/run_vrl.py --help` works without PYTHONPATH= prefix

### P3: Land or kill the 89 modified files

**Agent: developer** (dedicated session, no new features)

- Read `git status` in reveng-main, list all 89 modified files
- For each: commit if complete + tested, revert if abandoned, archive if uncertain
- This is not optional. New phases cannot be built on an unresolved working tree.

### P4 (deferred): Prune REVOLUTION_PLAN.md

- Kill everything past VRL in the plan until: 3 binaries reach `behavior_matched`, at least 1 real LLM round-trip proven
- No MCP, no knowledge graph, no compiler archaeology, no browser viewer, no VS Code extension
- Earn each phase with a receipt

---

## Handoff Discipline (IRON LAW for all future sessions)

Every session handoff MUST contain a "WHAT IS NOT PROVEN YET" section at the top, before anything else.

Every session's first action is: adversarially read the previous session's last claim. If it sounds like a milestone, ask: "Is this wiring or proof?"

---

## Working Directory

- **Primary target:** `C:\dev\projects\reveng-main`
- **Branch:** `ghidramcp-eval` (pushed to origin)
- **Python:** 3.14.0 — ALWAYS prefix: `PYTHONPATH=src python ...`
- **NEVER:** `--timeout` with pytest, `import reveng` directly, `{ }` bash groups

## Current Test Baseline

**153/153 green** across 7 files. Do not regress.

```bash
cd C:/dev/projects/reveng-main && PYTHONPATH=src python -m pytest tests/unit/ -q
```

## Session Commits (this session — ghidramcp-eval)

```
5344e613 feat: phase-1.5 first real VRL run against hexyl — CONVERGED  ← overclaimed
2ba6d3ef feat: phase-1.5 end-to-end VRL runner script
629b831e feat: phase-1.5 compile+oracle adapters for VRL pipeline
1a01542b feat: phase-1.5 iterative LLM refiner — VRL conceptual centerpiece
```

## Key Files

- `src/reveng/verification/refinement/refiner.py` — IterativeRefiner (339 lines, 10 happy-path tests only)
- `src/reveng/verification/refinement/compile_adapter.py` — make_compile_fn()
- `src/reveng/verification/refinement/oracle_adapter.py` — make_oracle_factory()
- `scripts/run_vrl.py` — CLI runner (requires PYTHONPATH=src/)
- `.reveng/benchmarks/corpus.yaml` — 10-binary corpus (hexyl graded "converged" — see caveat above)
- `_archive/2026-04-10-cleanup/analysis-dirs/analysis_hexyl/reconstructed.c` — initial source

## Known Friction (framework tax ~20% of budget)

- Prompt-too-long aborts: use general-purpose agent for short tasks, avoid developer/python-pro for <20 line jobs
- Bash compound-command blocker: no `{ }` groups, no heredoc `-m`, use `-F <file>` for commits
- Zombie task task-lifecycle-42: generating gap-log noise, user must close manually
- Phantom Vercel skill injections: ignore unless actually working on Vercel
- reveng.py root shadow: PYTHONPATH=src/ always
