---
paths:
  - .claude/skills/semgrep-rule-creator/**
---

# Semgrep Rule Creator Rules

<!-- Agent: security-architect | Task: #4 | Session: 2026-02-09 -->

Best practices for authoring custom Semgrep rules.

## Rule Structure

- Every rule must have a unique, descriptive `id` in kebab-case
- Messages must explain WHAT was found, WHY it matters, and HOW to fix it
- Severity must match actual risk: ERROR (exploitable), WARNING (potential risk), INFO (style)
- Always include metadata: cwe, owasp, confidence, impact, category, technology
- Include `references` linking to documentation for the vulnerability class

## Pattern Writing

- Start with the simplest pattern that matches the target code
- Use `pattern-either` for syntactic variants of the same issue
- Use `pattern-not` to exclude known-safe patterns (reduces false positives)
- Use `pattern-inside` to scope matches to specific contexts
- Use `metavariable-regex` to constrain metavariable values
- Use `focus-metavariable` to narrow the highlighted match location
- Avoid deeply nested ellipsis (`... ... ...`) for performance

## Taint Mode Rules

- Use taint mode for cross-function data flow tracking (source-to-sink)
- Define sources precisely (user input, network data, file content)
- Define sinks precisely (SQL queries, HTML output, command execution)
- Define sanitizers to exclude properly handled flows
- Taint mode is slower than pattern matching; use only when necessary

## Testing

- Write at least 2 true positive test cases per rule (matching code)
- Write at least 2 true negative test cases per rule (safe code)
- Use `// ruleid: rule-name` and `// ok: rule-name` annotations
- Run `semgrep --validate` to check rule syntax before committing
- Run `semgrep --test` to verify test cases pass
- Test against a large codebase to check for unexpected false positives

## Metadata Standards

- `confidence`: HIGH (tested, very few false positives), MEDIUM (some false positives expected), LOW (broad pattern, many false positives)
- `impact`: HIGH (data breach, RCE), MEDIUM (info disclosure, DoS), LOW (best practice violation)
- `category`: security, correctness, performance, best-practice
- `subcategory`: vuln, audit, guardrail
- `technology`: list frameworks and libraries the rule targets

## Performance

- Specific patterns are faster than generic ones
- `pattern-inside` scoping reduces search space significantly
- Avoid matching on entire file structure when possible
- Use language-specific constructs rather than generic patterns
- Benchmark rules on the target codebase before CI deployment

## Fix Suggestions

- Include `fix:` when a safe alternative is clear and mechanical
- Fix must produce correct, compilable code
- Test the fix output to verify it resolves the finding
- Use metavariable references in fix patterns for dynamic content

## Common Pitfalls

- Writing overly broad patterns that match safe code (high false positive rate)
- Not including `pattern-not` for known-safe alternatives
- Setting confidence to HIGH without testing against real codebases
- Missing severity calibration (ERROR for style issues, INFO for security)
- Not providing remediation guidance in the message
- Creating rules without test cases
- Using `pattern-regex` as primary matcher (slower, less precise than patterns)

## Rule Organization

- Group rules by category in separate YAML files
- Name files descriptively: `sql-injection.yml`, `xss-prevention.yml`
- Use rule packs for related rules that should run together
- Version rules and track changes over time
- Maintain a rule inventory with coverage mapping

## OWASP Rule Coverage

- A01 (Access Control): Route auth checks, permission validation
- A02 (Crypto Failures): Weak algorithms, hardcoded keys, insecure randomness
- A03 (Injection): SQL, command, XSS, path traversal, LDAP
- A05 (Misconfiguration): Debug mode, CORS, insecure defaults
- A07 (Auth Failures): Weak passwords, missing MFA, session issues
- A09 (Logging): Missing security event logging
- A10 (SSRF): URL validation, allowlist enforcement

## Related References

- `.claude/skills/semgrep-rule-creator/SKILL.md` - Full skill definition
- `.claude/skills/static-analysis/SKILL.md` - Running Semgrep scans
- `.claude/rules/security.md` - General security rules
