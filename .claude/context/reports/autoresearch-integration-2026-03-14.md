<!-- Agent: artifact-integrator | Task: #10 | Session: 2026-03-14 -->

# karpathy/autoresearch Integration Report

**Date:** 2026-03-14
**Source:** https://github.com/karpathy/autoresearch (MIT License)
**Integration Type:** Skill update + Rule creation

---

## Summary

The karpathy/autoresearch framework — an autonomous ML research loop where an AI agent iterates on `train.py` overnight using fixed 5-minute experiment budgets — has been fully integrated into Agent Studio. The integration produced two artifacts: an updated comprehensive skill and a new rules file.

---

## Artifacts Created / Updated

### 1. Updated Skill: `ml-experiment-loop`

**Path:** `.claude/skills/ml-experiment-loop/SKILL.md`
**Version:** 2.0.0 (bumped from unversioned bare stub)
**Size:** ~330 lines (from 48-line stub)

**Gap analysis — 11 weaknesses addressed:**

| Gap | Severity | Resolution |
|-----|----------|-----------|
| Missing Phase 1 Setup protocol | High | Added complete 7-step setup (branch, files, data verification, env, results.tsv init, baseline) |
| Bare experiment loop with no structure | High | Added full LOOP FOREVER pseudocode with 10 numbered steps |
| Missing git-based experiment versioning | High | Added branch-per-tag, commit-per-experiment, `git reset --hard HEAD~1` on discard |
| Incorrect metric grep pattern | High | Fixed: `grep "^val_bpb:\|^peak_vram_mb:" run.log` (was wrong file + pattern) |
| Missing output redirect | High | Added: `uv run train.py > run.log 2>&1` (context-window safety) |
| Missing NEVER STOP autonomy protocol | High | Added Iron Law #1 and dedicated Autonomy section |
| Missing simplicity criterion | Medium | Added decision table: improvement magnitude vs. complexity cost |
| Missing crash recovery | Medium | Added trivial/fundamental crash classification with 2-attempt limit + 10-min timeout |
| Missing results.tsv schema | Medium | Added TSV schema with example, column formats, untracked requirement |
| Broken skill reference (`research-logger` does not exist) | Medium | Removed; replaced with correct Memory Protocol |
| Missing Anti-Patterns table | Low | Added 10-entry Anti-Patterns table |

**Key Iron Laws added:**
1. NEVER STOP the loop to ask the human for permission
2. ALWAYS redirect training output to a file
3. NEVER cat or tail -n 500 the run log
4. NEVER modify `prepare.py`
5. ALWAYS git reset on discard
6. ALWAYS keep results.tsv untracked
7. NEVER install new packages

### 2. New Rule: `ml-experiment-standards`

**Path:** `.claude/rules/ml-experiment-standards.md`
**Size:** ~110 lines

**Sections:**
- Fixed-Budget Experiment Protocol — wall-clock budget, single scalar metric, baseline requirement
- One Hypothesis Per Experiment — no bundled changes, reviewable diffs
- Simplicity Criterion — keep/discard decision framework with examples
- Git-Based Experiment Versioning — branch naming, commit format, keep/discard/crash handling
- Results Logging Format — TSV schema, column definitions, example
- Context-Window-Safe Log Handling — redirect + targeted grep, never cat
- Crash Recovery Protocol — trivial vs. fundamental classification, retry limits
- Autonomy Protocol — NEVER STOP, human controls by interrupting
- Reproducibility Requirements — no new packages, fixed evaluation harness
- Anti-Patterns — 7 named anti-patterns (catting logs, asking permission, etc.)
- When to Invoke — references `ml-experiment-loop` skill

---

## Security Audit Results

External content from https://github.com/karpathy/autoresearch was analyzed before integration:

- **SIZE CHECK:** PASS — repository content is well under 50KB
- **BINARY CHECK:** PASS — all content is UTF-8 text (Python, Markdown)
- **TOOL INVOCATION SCAN:** PASS — no tool invocations outside code examples
- **PROMPT INJECTION SCAN:** PASS — no adversarial instruction patterns
- **EXFILTRATION SCAN:** PASS — no curl/wget/fetch to non-github.com domains
- **PRIVILEGE SCAN:** PASS — no CREATOR_GUARD, settings.json writes, or CLAUDE.md modifications

**Provenance logged:** Source MIT licensed, patterns incorporated at skill/rule level only (no wholesale content copy).

---

## Ecosystem Impact

- **Skill index:** Regenerated (`pnpm skills:index`) — 299 skills indexed across 22 domains
- **Agent registry:** Regenerated (`pnpm agents:registry`) — 80 agents, validation passed
- **Routing keywords added:** `autoresearch`, `ml experiment`, `train.py`, `val_bpb`, `autonomous training`, `fixed budget experiment`
- **Related skills cross-linked:** `ai-ml-expert`, `modern-python`, `git-expert`

---

## Usage

To start an autonomous ML research loop:

```javascript
Skill({ skill: 'ml-experiment-loop' });
```

The skill will:
1. Propose a run tag and create branch `autoresearch/<tag>`
2. Read `README.md`, `prepare.py`, `train.py`
3. Verify data cache exists
4. Run environment sync (`uv sync`)
5. Initialize `results.tsv`
6. Establish baseline
7. Loop indefinitely: formulate hypothesis → edit → commit → run → extract metric → keep/discard → log

---

## Decisions

- Used `skill-updater` (not `skill-creator`) since `ml-experiment-loop` already existed as a stub — avoids duplication
- Wrote `ml-experiment-standards.md` directly via Write (`.claude/rules/` is not Gate 4 protected)
- Checked VoltAgent/awesome-agent-skills — no counterpart found for autonomous ML training loop skills
- Version bumped to 2.0.0 to signal major content expansion
- `results.tsv` stays untracked in git by design (spans kept + discarded experiments)
