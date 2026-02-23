---
name: code-analyzer
description: Static code analysis and complexity metrics
version: 1.1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Bash, Read, Glob, Grep]
best_practices:
  - Analyze before refactoring
  - Track complexity over time
  - Focus on hotspots first
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: 2026-02-22T00:00:00.000Z
---

# Code Analyzer Skill

## Installation

No separate download: the skill runs the in-repo tool `.claude/tools/analysis/project-analyzer/analyzer.mjs`.

- Ensure **Node.js** (v18+) is installed: [nodejs.org](https://nodejs.org/) or `winget install OpenJS.NodeJS.LTS` (Windows), `brew install node` (macOS).
- From the project root, the script is invoked automatically; no extra install steps.

## Cheat Sheet & Best Practices

**Metrics:** Focus on cyclomatic complexity (decision paths), LOC, maintainability index, and duplicate blocks. Use ESLint `complexity` rule (e.g. `"complexity": ["error", 15]`) for JS/TS; optional chaining and default params add branches.

**Process:** Analyze before refactoring; run project-wide then drill into hotspots. Track trends over time (not one-off). Use `max-depth`, `max-lines`, `max-nested-callbacks`, `max-params`, `max-statements` alongside complexity.

**Hacks:** Start with project-analyzer output; filter by file type and threshold. Prioritize files with high complexity and high churn. Disable complexity rule only if you cannot set a sensible limit; prefer lowering the threshold over disabling.

## Certifications & Training

**No single cert;** aligns with static analysis and ESLint complexity. **ESLint:** [complexity rule](https://eslint.org/docs/latest/rules/complexity), max-depth, max-lines, max-params. **Skill data:** Cyclomatic complexity, LOC, maintainability, duplicates; analyze before refactor; track hotspots and trends.

## Hooks & Workflows

**Suggested hooks:** Pre-commit or CI: run project-analyzer/doctor for health; optional complexity gate. Use with **developer** (secondary), **qa** (secondary), **code-reviewer** (primary).

**Workflows:** Use with **code-reviewer** (primary), **developer**/ **qa** (secondary), **c4-code** (primary). Flow: run analyzer → filter hotspots → refactor or add tests. See `code-review-workflow.md`.

## Overview

Static code analysis and metrics. 90%+ context savings.

## Tools (Progressive Disclosure)

### Analysis

| Tool            | Description                  |
| --------------- | ---------------------------- |
| analyze-file    | Analyze single file          |
| analyze-project | Analyze entire project       |
| complexity      | Calculate complexity metrics |

### Metrics

| Tool            | Description           |
| --------------- | --------------------- |
| loc             | Lines of code         |
| cyclomatic      | Cyclomatic complexity |
| maintainability | Maintainability index |
| duplicates      | Find duplicate code   |

### Reporting

| Tool     | Description              |
| -------- | ------------------------ |
| summary  | Get analysis summary     |
| hotspots | Find complexity hotspots |
| trends   | Analyze metric trends    |

## Agent Integration

- **code-reviewer** (primary): Code review
- **refactoring-specialist** (primary): Tech debt analysis
- **architect** (secondary): Architecture assessment

## Iron Laws

1. **ALWAYS run project-wide analysis before drilling into individual files** — local analysis without context misses which files are actually the highest-priority hotspots; start broad, then focus.
2. **ALWAYS focus on high-complexity AND high-churn files** — a complex but rarely-changed file is lower priority than a moderately complex but frequently-changed one; intersection matters most.
3. **NEVER set complexity thresholds above 20** — cyclomatic complexity >20 is demonstrably correlated with defects; teams that allow >20 accumulate unmaintainable code without noticing.
4. **ALWAYS track metrics over time, not just once** — a single analysis snapshot is meaningless; track trends weekly to detect gradual degradation before it becomes a crisis.
5. **NEVER report metrics without actionable next steps** — complexity numbers without refactoring targets provide no value; every high-complexity finding must include a specific suggested improvement.

## Anti-Patterns

| Anti-Pattern                               | Why It Fails                                            | Correct Approach                                      |
| ------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------- |
| Analyzing only changed files               | Misses cross-file complexity accumulation               | Run project-wide then filter to changed hot spots     |
| Ignoring high-complexity files over time   | Gradual degradation invisible in point-in-time analysis | Track weekly trends; alert on any increase            |
| Complexity threshold >20                   | Research shows defect rate spikes sharply above 20      | Set ESLint complexity rule to ≤15 for enforcement     |
| Reporting metrics without action items     | Metrics without remediation don't reduce complexity     | Attach specific refactoring suggestion per hotspot    |
| Running analysis once and ignoring results | Technical debt silently accumulates                     | Schedule automated weekly analysis with trend reports |

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
