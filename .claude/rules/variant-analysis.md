---
paths:
  - .claude/skills/variant-analysis/**
---

# Variant Analysis Rules

<!-- Agent: security-architect | Task: #4 | Session: 2026-02-09 -->

Best practices for discovering vulnerability variants across codebases.

## Seed Vulnerability Analysis

- Always start from a known, confirmed vulnerability (CVE, bug report, or verified finding)
- Extract the abstract pattern: source, sink, missing sanitization, and data flow shape
- Document the seed formally before writing queries (prevents scope creep)
- Identify the CWE classification for the bug class, not just the specific instance

## Pattern Generalization

- Start with exact pattern matching, then broaden incrementally
- Use four abstraction levels: Exact, Local, Structural, Semantic
- Exact matches confirm the query works; broader matches find new variants
- Always verify at least one known-vulnerable instance matches before scanning broadly
- Overly broad patterns produce noise; overly narrow patterns miss variants

## CodeQL Variant Queries

- Use `DataFlow::Configuration` for source-to-sink analysis
- Define barrier nodes (sanitizers) explicitly to reduce false positives
- Use `@security-severity` annotation to classify risk (0.0 to 10.0 CVSS scale)
- Set `@precision` to reflect actual false positive rate after testing
- Include `@tags` with `external/cwe/cwe-XXX` for standards compliance
- Test queries against the seed vulnerability first (must match)

## Semgrep Variant Rules

- Use `pattern-either` for syntactic variants of the same pattern
- Use `taint` mode for cross-function data flow analysis
- Include `pattern-not` for known-safe patterns to reduce false positives
- Add `fix` suggestions when a safe alternative is known
- Set `confidence` to reflect pattern precision (HIGH only if tested)

## Cross-Repository Scanning

- When a variant is found in one repository, check all related repositories
- Use GitHub code search or CodeQL multi-repo scanning for organization-wide discovery
- Prioritize repositories with the same framework and architecture
- Track variant families across repositories in a central registry

## Triage and Classification

- Classify each variant by reachability, exploitability, and impact
- Assign confidence scores: HIGH (confirmed), MEDIUM (likely), LOW (possible)
- True positives require verification (manual review or exploit proof)
- False positives should be documented with rationale
- Track variant relationships to the original seed vulnerability

## Remediation Strategy

- Fix all CRITICAL/HIGH variants before disclosing the original vulnerability
- Add regression tests for each confirmed variant
- Create CI/CD checks (Semgrep rules) to prevent pattern recurrence
- Consider architectural changes to eliminate the entire bug class
- Update the variant family registry after each remediation

## Common Pitfalls

- Searching only for exact syntactic matches misses refactored variants
- Ignoring test code may miss variants that indicate production patterns
- Not testing the query against the seed vulnerability first
- Overly broad queries that match safe code (high false positive rate)
- Not tracking variant families leads to rediscovery of known issues
- Stopping after first variant found instead of exhaustive search

## Related References

- `.claude/skills/variant-analysis/SKILL.md` - Full skill definition
- `.claude/skills/static-analysis/SKILL.md` - CodeQL and Semgrep tooling
- `.claude/skills/semgrep-rule-creator/SKILL.md` - Custom rule creation
- `.claude/rules/security.md` - General security rules
