---
paths:
  - .claude/skills/differential-review/**
---

# Differential Review Rules

<!-- Agent: security-architect | Task: #4 | Session: 2026-02-09 -->

Best practices for security-focused code diff review.

## Review Prioritization

- Always classify changed files by security sensitivity before reviewing
- P0: auth, security, crypto, middleware, validators, config, secrets
- P1: API routes, controllers, dependency manifests, infrastructure
- P2: data models, database queries, shared utilities
- P3: tests, documentation (review for leaked secrets only)
- Review P0 files exhaustively; P3 files can be spot-checked

## Security Regression Detection

- Treat removal of security middleware as CRITICAL (auth, CSRF, rate limit, helmet)
- Treat weakening of cookie flags as HIGH (httpOnly, secure, sameSite changes)
- Treat relaxation of CORS policy as HIGH (especially wildcard origin)
- Treat removal of input validation as HIGH
- Treat disabling TLS verification as CRITICAL
- Every security control removal requires explicit justification in PR description

## Diff Analysis Technique

- Use `git diff -U10` for extra context around changes (default 3 lines is often insufficient)
- Check both additions (new vulnerabilities) and deletions (removed protections)
- Review the full function context, not just the changed lines
- Check if changed code is reachable from public endpoints
- Verify that security tests were not removed alongside security code

## Automated Scanning

- Run `semgrep scan --baseline-commit=main` on every PR for incremental analysis
- Check for secrets in diffs before any other analysis
- Use `git diff --cached | grep` patterns for quick pre-commit checks
- Integrate automated diff scanning into CI/CD for consistent enforcement

## Dependency Change Review

- Run `npm audit` or equivalent after any dependency change
- Flag version downgrades for investigation (may reintroduce fixed CVEs)
- Flag removal of security-related dependencies as CRITICAL
- Verify new dependencies against known CVE databases before merging
- Check dependency licenses for compliance requirements

## Comment Format

- Use structured format: SECURITY [SEVERITY], description, location, impact, remediation
- Include code snippets showing both the vulnerable pattern and the safe alternative
- Reference CWE and OWASP categories for each finding
- Provide actionable remediation, not just problem identification

## Verdict Criteria

- APPROVE: No security issues, or only INFO-level observations
- APPROVE WITH CONDITIONS: LOW/MEDIUM issues with clear fix path
- REQUEST CHANGES: HIGH issues that must be addressed
- BLOCK: CRITICAL issues (exploitable vulnerabilities, credential exposure)

## Common Pitfalls

- Reviewing only the changed lines without understanding the surrounding context
- Missing security regressions caused by refactoring (moved code, renamed functions)
- Not checking whether new endpoints have authentication middleware
- Approving dependency updates without checking for known vulnerabilities
- Focusing only on additions and missing deleted security controls
- Not verifying that error handlers fail-secure after changes

## OWASP References

- A01 (Broken Access Control): Check for missing auth on new routes
- A02 (Cryptographic Failures): Check for algorithm downgrades
- A03 (Injection): Check for new user input paths without sanitization
- A05 (Security Misconfiguration): Check for config changes
- A07 (Auth Failures): Check for auth logic modifications
- A09 (Logging Failures): Check for removed security logging

## Related References

- `.claude/skills/differential-review/SKILL.md` - Full skill definition
- `.claude/skills/static-analysis/SKILL.md` - Full codebase analysis
- `.claude/rules/security.md` - General security rules
- `.claude/rules/git-workflow.md` - Git workflow rules
