# Static Analysis Rules

<!-- Agent: security-architect | Task: #4 | Session: 2026-02-09 -->

Best practices for running CodeQL and Semgrep static analysis effectively.

## Tool Selection

- Use **CodeQL** for deep dataflow and taint analysis (higher precision, slower)
- Use **Semgrep** for pattern matching and quick scans (faster, broader rules)
- Use both together for comprehensive coverage
- Always output in SARIF v2.1.0 format for toolchain interoperability

## CodeQL Best Practices

- Always create a fresh database before analysis (stale databases miss new code)
- Use language-specific security query suites, not generic suites
- For JavaScript/TypeScript projects, use `codeql/javascript-queries:Security`
- Include quality suites alongside security for a complete picture
- Custom queries should extend standard library classes, not reimplement them
- Set `@precision` to `high` or `very-high` for CI/CD blocking rules

## Semgrep Best Practices

- Start with `p/security-audit` and `p/owasp-top-ten` rule sets
- Add `p/secrets` for credential detection in every scan
- Use `--baseline-commit` in CI to scan only changed code (faster, less noise)
- Custom rules should include `fix:` suggestions when a safe alternative exists
- Always set `confidence` and `impact` metadata for triage prioritization
- Test custom rules with `semgrep --validate` before deploying

## SARIF Output Rules

- Always use SARIF v2.1.0 schema (`--format=sarifv2.1.0` for CodeQL)
- Include rule metadata in SARIF for downstream processing
- Parse results with `jq` for quick triage before detailed review
- Upload SARIF to GitHub Advanced Security when available
- Archive SARIF results for trend analysis across scans

## Triage Rules

- CRITICAL/HIGH findings block merges in CI/CD pipelines
- MEDIUM findings are tracked and fixed within the current sprint
- LOW findings are reviewed and addressed opportunistically
- Evaluate each finding for false positive status before dismissing
- Document false positive rationale in code comments for future scans

## OWASP Coverage

- Map all findings to OWASP Top 10 categories for compliance reporting
- Ensure rule coverage for at least A01 through A03 and A07 through A10
- A04 (Insecure Design) and A05 (Security Misconfiguration) require manual review
- A06 (Vulnerable Components) requires dependency scanning (`npm audit`, `pip audit`)

## Common Pitfalls

- Running analysis on test/fixture code produces false positives; exclude test directories
- Outdated CodeQL databases miss recently added code
- Semgrep `p/default` rules are not security-focused; use `p/security-audit` instead
- Suppressing findings without documentation creates security debt
- Not re-running analysis after fixes leaves remediation unverified

## CI/CD Integration

- Run Semgrep on every PR (fast, catches most issues)
- Run CodeQL on nightly builds or release branches (thorough, slower)
- Use GitHub Actions `codeql-action/analyze` for seamless SARIF upload
- Set severity thresholds: block on ERROR, warn on WARNING

## Related References

- `.claude/skills/static-analysis/SKILL.md` - Full skill definition
- `.claude/skills/semgrep-rule-creator/SKILL.md` - Custom rule authoring
- `.claude/rules/security.md` - General security rules
