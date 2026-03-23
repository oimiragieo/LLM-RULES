# Gap Detection — Research Requirements

**Date:** 2026-03-22
**Skill:** gap-detection
**Research Intent:** Identify best practices for automated project health scanning, documentation gap detection, and test coverage analysis in multi-language codebases.

## Research Summary

### VoltAgent/awesome-agent-skills Search

Searched for "gap detection", "health check", "coverage scan", "documentation audit" — no direct matching skill found. Proceeding with original design grounded in common tooling patterns.

### Key Design Constraints (from codebase and tooling patterns)

1. **Evidence-first constraint**: Any gap reported must reference a concrete file path. Vague summaries like "coverage is low" without file citations are not actionable and waste developer attention. This drives the file-path citation requirement in all scan steps.

2. **Exclude-list constraint**: Scans must exclude `node_modules/`, `dist/`, `.git/`, `build/` or scan time becomes O(100K+ files) and findings are meaningless (e.g., undocumented vendored code). This is enforced in all `find`/`grep` commands via `--exclude-dir` and `! -path` guards.

3. **Blast-radius ranking constraint**: Not all gaps are equal. A missing README in a public API directory is higher priority than a TODO comment in an internal test helper. Ranking by blast radius (public API > entrypoint > internal > tests) ensures teams address high-value gaps first.

### Non-Goals

- This skill does NOT measure line-level code coverage (use `nyc`/`c8` for that)
- This skill does NOT fix gaps — it only detects and reports them
- This skill does NOT replace semantic documentation review — it checks for presence, not quality of docs
- This skill does NOT scan binary files or generated code

### Prior Art References

- `proactive-audit` skill in agent-studio: broader framework-level audit (hook syntax, agent consistency)
- `system-health-check` skill: verifies repository basics (tests pass, lint clean)
- Standard GNU `find` + `grep` patterns widely used in CI pipelines for documentation enforcement
