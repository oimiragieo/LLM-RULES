# ML Experiment Standards

Standards for autonomous ML research loops: experiment tracking, reproducibility, and the keep/discard decision framework. Derived from karpathy/autoresearch (MIT).

## Fixed-Budget Experiment Protocol

- Each experiment MUST run for a fixed time budget (wall clock). Never compare experiments run with different time budgets.
- Use a single scalar validation metric as the sole decision criterion (e.g., `val_bpb` — lower is better).
- The metric must be vocabulary-size-independent so architectural changes (which affect vocab size) are fairly compared.
- Always establish a baseline before experimenting: run the unmodified code first and record the result.
- Do not start a new experiment until the previous one is fully logged in `results.tsv`.

## One Hypothesis Per Experiment

- Each experiment tests exactly ONE hypothesis. No bundled changes.
- The git diff for each experiment MUST be reviewable in under 2 minutes.
- If a hypothesis requires 3+ interdependent changes, decompose it into sequential experiments.

## Simplicity Criterion

All else being equal, simpler code is preferred over complex code. When evaluating whether to keep an experiment:

- A 0.001 val_bpb improvement that adds 20 lines of hacky code → **discard**
- A 0.001 val_bpb improvement from deleting code → **keep**
- Near-zero improvement with simpler code → **keep** (simplification win)
- Significant improvement (≥0.005 val_bpb) with reasonable complexity → **keep**

**Never keep complexity for marginal gains.** Complexity compounds and degrades future experiment quality.

## Git-Based Experiment Versioning

- Create a dedicated branch per run session: `autoresearch/<tag>` (e.g., `autoresearch/mar14`).
- Commit each experiment to this branch with message format: `experiment: <one-line description>`
- On **keep**: advance the branch — this commit becomes the new baseline.
- On **discard**: `git reset --hard HEAD~1` immediately. Do not iterate on a failed idea.
- On **crash**: log as crash in results.tsv, revert, move on. Only retry if the crash was a trivial fix (typo, import error).

## Results Logging Format

Use a tab-separated `results.tsv` file. **Never use commas** (commas appear in descriptions and break CSV parsers). Keep this file untracked in git.

**Header:**
```
commit	val_bpb	memory_gb	status	description
```

**Columns:**
| Column | Format | Notes |
|--------|--------|-------|
| commit | 7-char hex | `git rev-parse --short HEAD` |
| val_bpb | 6 decimal places | Use `0.000000` for crashes |
| memory_gb | 1 decimal place | `peak_vram_mb / 1024`. Use `0.0` for crashes |
| status | enum | `keep`, `discard`, or `crash` |
| description | free text | Short, no tabs |

**Never commit `results.tsv` to git.** It spans all experiments including discards.

## Context-Window-Safe Log Handling

Training scripts produce massive output volumes that crash AI agent sessions if read directly.

- **ALWAYS** redirect training output to a file: `uv run train.py > run.log 2>&1`
- **NEVER** `cat` or `tail -n 500` a training log file
- Extract metrics only via targeted grep: `grep "^val_bpb:\|^peak_vram_mb:" run.log`
- For crash investigation, read only the tail: `tail -n 50 run.log`

## Crash Recovery Protocol

1. Read `tail -n 50 run.log` for the Python stack trace.
2. Classify the crash:
   - **Trivial** (typo, missing import, dimension arithmetic off-by-one): Fix and re-run once.
   - **Fundamental** (out-of-memory on a model that's clearly too large, logically broken idea): Log as crash, revert, move on.
3. Never attempt more than 2 fix cycles on the same crashed experiment.
4. Timeout rule: Kill any run that exceeds 10 minutes (double the expected budget). Treat as crash.

## Autonomy Protocol

Once an experiment loop begins, it runs indefinitely without human intervention:

- The researcher NEVER pauses to ask "should I continue?"
- The researcher NEVER stops because they "ran out of ideas" — they generate more ideas.
- The researcher NEVER stops because a few experiments failed in a row — that is normal.
- The human controls when to stop by manually interrupting the process.

If ideas are exhausted: re-read source files, combine near-misses, try radical changes, simplify existing code.

## Reproducibility Requirements

- Never install new packages during an experiment run. Use only the dependencies in `pyproject.toml`.
- Never modify the evaluation harness or data loading code. These are fixed ground-truth components.
- Platform differences (different GPU, different compute) produce different absolute metric values. Results from one platform are not comparable to results from another.
- The fixed time budget ensures results are comparable across experiments on the same platform.

## Anti-Patterns

- **Asking the human for permission to continue** — defeats the purpose of autonomous research
- **Catting training logs** — crashes the agent session with gigabytes of output
- **Modifying the evaluation harness** — invalidates all results
- **Multiple hypotheses per experiment** — impossible to attribute outcomes
- **Keeping tiny improvements with large complexity adds** — violates simplicity criterion
- **Installing new packages** — breaks reproducibility
- **Committing results.tsv** — clutters history and conflates kept vs. discarded experiments

## When to Invoke

Reference these standards when running:
- `Skill({ skill: 'ml-experiment-loop' })` — the primary autonomous experiment loop skill
- Any ML experiment that uses a fixed compute budget and a single validation metric
