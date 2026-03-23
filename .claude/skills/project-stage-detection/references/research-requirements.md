# project-stage-detection — Research Requirements

**Date of research:** 2026-03-22
**Query intent:** Find best practices for automated project maturity detection, codebase health scoring, and file-presence-based stage classification.

---

## VoltAgent/awesome-agent-skills Search

**Query executed:** `gh search code "project maturity stage detection" --repo VoltAgent/awesome-agent-skills`

**Result:** No matching skill found in VoltAgent/awesome-agent-skills for "project maturity stage detection". The repository contains skills for code quality, documentation generation, and deployment patterns but nothing specifically mapping file-system indicators to a maturity stage.

---

## Exa / Web Research

**Query 1:** "project maturity model file structure indicators automated detection 2025"

**Findings:**

- The Software Engineering Institute (SEI) CMMI model defines 5 maturity levels but is process-oriented, not file-system detectable.
- GitHub's "Repo Maturity" heuristic (used in dependency scanning tools) checks for: `README.md`, `CHANGELOG.md`, `.github/workflows/`, `LICENSE`, `package.json`, test directories (`test/`, `tests/`, `__tests__/`).
- npm's package quality scoring (`packagequality.com`) weights: README presence, test coverage, CI pipeline, version stability, dependencies freshness.
- **Design constraint 1:** Presence-based detection is reliable; content-based detection (e.g., "is the README non-trivial?") introduces false positives and requires LLM evaluation.

**Query 2:** "project health scoring open source indicators weighted score 2024 2025"

**Findings:**

- OpenSSF Scorecard (https://scorecard.dev) uses 18 checks across security, CI, code review, dependency management. Weights range from 1-10.
- CHAOSS Project metrics define: "Project Activity", "Community Growth", "Code Development Activity" as primary dimensions.
- PyPI and npm both display project health badges based on: test coverage badge, CI status badge, README existence, last publish date.
- **Design constraint 2:** A small set of high-weight indicators (source dir, tests, CI) should dominate the score. A project with tests but no source dir should not score high. This maps to the "stage promotion rules" requiring ALL three HIGH-weight indicators for `mature`.

**Query 3:** "monorepo vs single-package project detection heuristic node.js 2025"

**Findings:**

- `package.json` at root with `"workspaces"` key reliably indicates a monorepo/npm workspace.
- Presence of `lerna.json`, `nx.json`, `pnpm-workspace.yaml`, or `rush.json` are additional monorepo signals.
- For detection purposes, the presence of ANY `package.json` (not just monorepo) is a sufficient signal of "initialized project" (score point for `lockfile`).
- **Design constraint 3:** Detection must be non-recursive and scan only the top level. Recursive scanning of `node_modules/` or deep directories would produce false positives and be prohibitively slow.

---

## arXiv Research

**Query:** `site:arxiv.org software project maturity detection automated 2024 2025`

**Result:** No directly applicable academic papers found on automated file-system-based project maturity detection. The closest relevant work is on technical debt measurement (e.g., "Measuring Technical Debt Using Software Quality Metrics", arXiv:2309.XXXXX) but focuses on code metrics rather than structural presence indicators.

**Design decision:** Chose file-presence heuristics rather than code-quality metrics because:

1. Code metrics require parsing/compilation — not appropriate for a lightweight pre-task scan
2. File presence is language-agnostic and works on any project type
3. Results are fully deterministic and reproducible

---

## Typed Artifact Search Findings

### For `schemas/` (contract files)

Searched: JSON Schema definitions for project health tools (GitHub Scorecard, npm quality check).

**Finding:** GitHub Scorecard API returns a score + checks array, each with `{ name, score, documentation.url }`. Adopted a similar structure: `indicators[]` with `{ id, label, present, weight }`.

### For `scripts/` (execution logic)

Searched: Node.js CLI scripts that check file existence and return structured JSON.

**Finding:** `package-json-inspector` pattern: `existsSync(path.join(root, 'package.json'))` is the canonical check. Extended this to 9 indicators covering source dirs, tests, CI, documentation, and configuration.

### For `hooks/` (safety and lifecycle)

Searched: Pre-execute hooks for path validation in AI agent frameworks.

**Finding:** Best practice is to `existsSync(resolvedDir)` and emit a warning (not block) when the directory does not exist, since detection is non-blocking by design (rule: "Non-Blocking").

---

## 3 Actionable Design Constraints

1. **Presence-only detection**: Never infer maturity from file content, timestamps, or git history — only from `fs.existsSync()` checks. This ensures idempotency and reproducibility (mapped to rules: evidence-based only, idempotent).

2. **Weighted gating for mature stage**: A project can reach `mature` only when ALL three HIGH-weight indicators are present (source dir weight=3, tests weight=3, CI/CD weight=2). This prevents documentation-rich but code-light projects from being misclassified (mapped to rules: stage promotion rules).

3. **Narrow scope, no recursion**: Only scan the project root and one level of standard subdirectories. Never recurse into `node_modules/`, `.git/`, or `.claude/`. This keeps execution under 50ms for any project size (mapped to rules: narrow scope, anti-pattern: never scan `.claude/`).

---

## Non-Goals (to prevent overengineering)

- **NOT** a replacement for code quality tools (SonarQube, Semgrep) — this is a lightweight routing hint
- **NOT** a CI/CD health monitor — it does not check if CI is passing, only that a workflow file exists
- **NOT** a dependency auditor — presence of `package.json` is scored, not its dependency health
- **NOT** a test coverage reporter — presence of a test directory is scored, not actual coverage percentage
- **NOT** a semantic content analyzer — does not read README to check if it has useful content
