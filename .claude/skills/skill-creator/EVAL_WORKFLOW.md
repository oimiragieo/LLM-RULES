# Evaluation-Driven Development Workflow

This document describes the optional evaluation loop for skill-creator. It is referenced from `SKILL.md` under the `--eval` flag. Running evaluation is not required for quick skill creation — it is a quality gate for skills intended for production use.

---

## Anthropic Principles Applied Here

### Explanation Over Commands

Rather than mandating evaluation steps, this workflow explains _why_ each step matters. When you understand the reasoning, you can adapt the workflow intelligently instead of following it mechanically.

### Lean Instructions

Keep each skill under ~500 lines. If a skill's SKILL.md has grown large, the `--eval` loop will surface which instructions are actually impactful and which can be removed. Treat evaluation data as a lean-audit signal, not just a pass/fail gate.

---

## When to Use Evaluation

| Path                | When                                                         | Duration       |
| ------------------- | ------------------------------------------------------------ | -------------- |
| `--quick` (default) | Iterating fast, early draft, non-critical skill              | 0 min overhead |
| `--eval`            | Before promoting a skill to production use or sharing widely | 10–20 min      |

The quick path (default behavior) preserves the existing research-synthesis → create → integrate workflow unchanged. The eval path adds an optional post-creation loop.

---

## The Evaluation Loop

```
Create → Benchmark → Grade → Compare → Analyze → Iterate
```

### Step 1: Create (existing workflow)

Run the standard skill-creator workflow to produce the first version of the skill. This is your **candidate version**.

### Step 2: Benchmark

Run parallel test cases with two tracks:

- **With-skill track**: agent executes the task using the new skill
- **Baseline track**: agent executes the same task without any skill guidance

**What the eval runner captures:**

- Output files produced by each track
- Agent transcript (tool calls, decisions, deviations)
- Token usage estimate
- Wall-clock execution time

Run the eval runner:

```bash
node .claude/skills/skill-creator/scripts/eval-runner.cjs \
  --skill .claude/skills/<skill-name>/SKILL.md \
  --cases .claude/skills/<skill-name>/eval/cases.json \
  --output .claude/context/tmp/eval-$(date +%Y%m%d-%H%M%S)/
```

If no `eval/cases.json` exists, the runner generates a minimal default test case from the skill's trigger conditions and description. Graceful degradation — missing cases do not abort.

### Step 3: Grade

Invoke the Grader agent with the benchmark output:

```javascript
// Grader reads transcript + output files and produces PASS/FAIL per assertion
// Agent file: .claude/skills/skill-creator/agents/grader.md
Skill({ skill: 'skill-creator', args: '--grade <eval-output-dir>' });
```

The grader produces a structured JSON report (see schema: `.claude/schemas/skill-evaluation-output.schema.json`).

**What to watch:**

- `instruction_score < 6`: skill instructions have gaps — agent deviated significantly
- `fail_count > 0`: specific assertion failures need attention
- `eval_critique`: weak assertions need strengthening before next iteration

### Step 4: Compare

If you have a previous version (v1 vs v2, or skill vs baseline), invoke the Comparator agent for blind A/B evaluation:

```javascript
// Comparator receives Version A and Version B without knowing which is which
// Agent file: .claude/skills/skill-creator/agents/comparator.md
```

The comparator produces a winner determination with rubric scores (1–10), per-criterion breakdown, and confidence level. A "high confidence" win means the newer version is ready. A "low confidence" or tie means iterate before promoting.

### Step 5: Analyze

Invoke the Analyzer agent for targeted improvement suggestions:

```javascript
// Analyzer identifies WHY one version outperformed the other
// Agent file: .claude/skills/skill-creator/agents/analyzer.md
```

The analyzer produces improvement suggestions organized by category:

| Category         | Address                                           |
| ---------------- | ------------------------------------------------- |
| `instructions`   | Clarity, ordering, specificity of workflow steps  |
| `tools`          | Missing tool calls, wrong tool, missing tool docs |
| `examples`       | Missing, outdated, or misleading examples         |
| `error_handling` | Missing error cases, silent failures              |
| `structure`      | Section ordering, heading hierarchy               |
| `references`     | Missing file path references                      |

Each suggestion is tagged High / Medium / Low priority. Focus on **High** first.

### Step 6: Iterate

Apply the High-priority suggestions from Step 5 as an additive patch to the skill. Re-run Steps 2–5 with the patched version as the new candidate. Repeat until:

- `instruction_score >= 8` in the Grader report
- Comparator confidence is "high" for the new version over baseline
- No High-priority suggestions remain from Analyzer

---

## Complexity-Gated Evaluation Tiers

Not every skill needs the full loop. Use the tier that matches the skill's complexity and risk:

| Tier        | Complexity | Required Steps | Notes                                 |
| ----------- | ---------- | -------------- | ------------------------------------- |
| **TRIVIAL** | TRIVIAL    | None           | Skip eval entirely; quick path only   |
| **LIGHT**   | LOW        | Steps 2+3 only | Benchmark + Grade; no compare/analyze |
| **FULL**    | MEDIUM+    | Steps 2–6      | Complete loop with iteration          |

The `--eval` flag runs the FULL tier. Use `--eval --tier light` for the LIGHT tier.

---

## Eval Runner Output Structure

The runner writes to a timestamped directory under `.claude/context/tmp/eval-<timestamp>/`:

```
eval-20260305-143022/
  with-skill/
    transcript.json        # agent conversation log
    output-files.json      # list of files produced
    metrics.json           # tokens, timing, tool-call-count
  baseline/
    transcript.json
    output-files.json
    metrics.json
  assertions.json          # assertions loaded from cases.json
  grader-report.json       # Grader agent output (written after grading)
  comparator-report.json   # Comparator output (written after comparison)
  analyzer-report.json     # Analyzer output (written after analysis)
```

---

## Handoff Format Between Agents

Agents communicate via structured JSON files in the eval output directory. The schema for all report files is defined at:

`.claude/schemas/skill-evaluation-output.schema.json`

Key fields:

- Grader → `grader-report.json`: `verdict`, `assertion_results`, `instruction_score`
- Comparator → `comparator-report.json`: `winner`, `scores`, `confidence`
- Analyzer → `analyzer-report.json`: `improvement_suggestions[]` with `category`, `priority`

---

## Integration with Skill-Updater

When a skill has evaluation data from a previous run, skill-updater can use it as a `eval_regression` trigger:

```
--trigger eval_regression --eval-dir .claude/context/tmp/eval-<timestamp>/
```

This passes the historical grader reports to the Analyzer (Workflow B: benchmark pattern analysis) to surface recurring failure patterns before applying updates.

---

## Memory Protocol

After completing an evaluation loop, record findings:

```javascript
MemoryRecord({
  type: 'pattern',
  content: 'Skill <name> v<N> scored instruction_score=<X>; top improvement: <category>',
  area: 'skill-evaluation',
  source: 'eval-workflow',
});
```
