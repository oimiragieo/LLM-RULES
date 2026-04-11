# Session Handoff — 2026-04-10/11 — REVENG Phase 1.5 Complete (LLM Round Pending)

**NEXT ACTION (IMMEDIATE):** The ONLY remaining gate is a real LLM round-trip. Set ANTHROPIC_API_KEY then run: `cd C:/dev/projects/reveng-main && REVENG_AI_PROVIDER=anthropic python scripts/run_vrl.py --binary hexyl --max-iterations 3`. Spawn agents for everything else — router does NOT implement directly.

---

## WHAT IS NOT PROVEN YET

1. **The LLM feedback loop has never fired.** Oracle detects divergence (3/3 seeds, 0 vs 615–768 bytes). But ANTHROPIC_API_KEY is not in the subprocess env — only CLAUDE_CODE_OAUTH_TOKEN exists (OAuth, not usable by SDK). Zero Claude API calls made during refinement.
2. **`behavior_matched` never achieved** on any binary via LLM.
3. **API key required to unblock:** `export ANTHROPIC_API_KEY=sk-ant-...` before running run_vrl.py. Or: start ollama (`ollama serve`, `ollama pull llama3`) and use `REVENG_AI_PROVIDER=ollama`.

---

## Session Accomplishments (this session — full picture)

### Commits pushed to origin/ghidramcp-eval

```
1071d170 chore: gitignore VRL run artifacts and local config noise
343a35c1 docs: prune REVOLUTION_PLAN.md to VRL-only with Phase 2 gate
6f5a2a68 chore(vrl): record hexyl VRL run 2026-04-11 — llm_error (missing API key)
87da9989 test: P0 force-divergence VRL run against real hexyl binary
9c00ec89 fix: oracle exception resilience + fault-injection tests + PYTHONPATH fix
5344e613 feat: phase-1.5 first real VRL run against hexyl — CONVERGED (smoke test only)
2ba6d3ef feat: phase-1.5 end-to-end VRL runner script
629b831e feat: phase-1.5 compile+oracle adapters for VRL pipeline
```

### What was proven this session

- Oracle integration works end-to-end: hexyl (3/3 seeds) → 0 stdout vs 615–768 bytes from real binary
- compile_adapter + oracle_adapter wired and tested
- IterativeRefiner has 18 tests: 10 happy-path + 8 fault-injection (oracle timeout, malformed LLM, cascade failure, no-progress guard)
- run_vrl.py works standalone (no PYTHONPATH prefix needed)
- REVOLUTION_PLAN.md pruned: Phase 2 gate added, aspirational scope labeled

## Working Directory

- **Primary:** `C:\dev\projects\reveng-main`
- **Branch:** `ghidramcp-eval` (pushed to origin)
- **ALWAYS:** `python scripts/run_vrl.py` (no PYTHONPATH needed now)
- **NEVER:** `--timeout` with pytest

## Current Test Baseline

**1093/1106 green** (3 pre-existing failures in JS bundle + release report tests — unrelated to VRL).

```bash
cd C:/dev/projects/reveng-main && python -m pytest tests/unit/ -q --tb=no
```

## Next Session: Single Priority

**Get one real LLM round to fire.**

```bash
# Option A — Anthropic
export ANTHROPIC_API_KEY=sk-ant-...
cd C:/dev/projects/reveng-main && REVENG_AI_PROVIDER=anthropic python scripts/run_vrl.py --binary hexyl --max-iterations 3

# Option B — Ollama (free, local)
ollama serve  # in separate terminal
ollama pull llama3  # or codellama
cd C:/dev/projects/reveng-main && REVENG_AI_PROVIDER=ollama python scripts/run_vrl.py --binary hexyl --max-iterations 3
```

**After the run:** Report honestly. Did Claude read the divergence report? Did it produce C code? Did it compile? Did the grade improve? This is the receipt the whole project needs.

**If grade improves:** Run on 2 more corpus binaries. Update corpus.yaml grades.
**If grade doesn't improve:** Debug why (compile failure? oracle not detecting improvement? prompt too vague?). Fix one thing at a time.

## Phase 2 Gate (still locked)

- [ ] 1 real LLM round-trip: divergence → fix → recompile → grade improves
- [ ] 3 binaries at `behavior_matched`
- [ ] ≥5 non-trivial seeds per binary

## Key Files

- `scripts/run_vrl.py` — CLI runner (standalone, no PYTHONPATH needed)
- `src/reveng/verification/refinement/refiner.py` — IterativeRefiner
- `src/reveng/verification/refinement/compile_adapter.py` — make_compile_fn()
- `src/reveng/verification/refinement/oracle_adapter.py` — make_oracle_factory()
- `.reveng/benchmarks/corpus.yaml` — corpus with hexyl seeds + binary_path set
- `external/ga_binaries/hexyl/hexyl.exe` — real hexyl binary (1MB)
- `_archive/2026-04-10-cleanup/analysis-dirs/analysis_hexyl/reconstructed.c` — initial source

## Known Gotchas

1. ANTHROPIC_API_KEY not in subprocess env — must export explicitly
2. NEVER `--timeout` with pytest
3. `git commit -F <file>` not `-m` (parentheses break hooks)
4. No `{ }` bash compound groups in hooks
5. 3 pre-existing test failures (JS bundle + release report) — not ours to fix
6. corpus.yaml hexyl.current_grade is `llm_error` — update after first successful LLM run
7. ccusage blocked by SEC-AUDIT-017 hook — already added to allowlist in registry.cjs

## Session Cost

$352.41 today (~634K tokens: haiku-4-5, opus-4-6, sonnet-4-6)
