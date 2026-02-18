---
paths:
  - .claude/skills/gemini-cli-security/**
---

# Gemini CLI Security Rules

## Core Principles

- Always analyze code BEFORE generating it; catch vulnerabilities early
- Report precision and recall metrics so consumers understand coverage limitations
- Never execute unknown remote scripts or auto-remediate findings
- Use parameterized queries for any database interactions in code you analyze
- Escalate CRITICAL findings immediately; do not queue them for later review

## Detection Rules

### Secrets Detection (CRITICAL severity)

| Rule ID | Pattern               | Action                             |
| ------- | --------------------- | ---------------------------------- |
| SEC-001 | Hardcoded API key     | Flag and recommend env var         |
| SEC-002 | Hardcoded password    | Flag and recommend secrets manager |
| SEC-003 | Private key in source | Flag immediately; highest priority |
| SEC-004 | Hardcoded secret key  | Flag and recommend vault           |
| SEC-005 | Hardcoded token       | Flag and recommend env var         |

**SLA: CRITICAL findings must be reported before any code is merged.**

### Injection Detection (HIGH severity)

| Rule ID | Pattern                             | Action                                      |
| ------- | ----------------------------------- | ------------------------------------------- |
| INJ-001 | SQL string concatenation in queries | Recommend parameterized queries             |
| INJ-002 | innerHTML with user content         | Recommend textContent or DOMPurify          |
| INJ-003 | exec() with user-controlled args    | Recommend shell: false + array args         |
| INJ-004 | eval() with user input              | Recommend JSON.parse() or safe alternatives |

### Cryptography Detection (MEDIUM severity)

| Rule ID | Pattern                           | Action                              |
| ------- | --------------------------------- | ----------------------------------- |
| CRY-001 | MD5/SHA1 for sensitive data       | Recommend SHA-256+ or bcrypt/Argon2 |
| CRY-002 | DES/RC4/AES-ECB                   | Recommend AES-256-GCM or ChaCha20   |
| CRY-003 | Math.random() for security values | Recommend crypto.randomBytes()      |

### LLM Safety Detection (MEDIUM severity)

| Rule ID | Pattern                                 | Action                                    |
| ------- | --------------------------------------- | ----------------------------------------- |
| LLM-001 | User input concatenated into LLM prompt | Recommend prompt templates + sanitization |
| LLM-002 | eval() of LLM output                    | Prohibit; use structured parsing          |
| LLM-003 | Shell exec with LLM-provided args       | Require allowlisting + validation         |

## Output Requirements

- Always include severity classification (CRITICAL/HIGH/MEDIUM/LOW)
- Always include remediation guidance for each finding
- Always include file path and line number for traceability
- Report benchmark metrics (90% precision, 93% recall) when discussing coverage
- Use `--json` flag for CI/CD integration (machine-parseable output)

## Anti-Patterns (FORBIDDEN)

- Do NOT auto-apply remediations without user review
- Do NOT ignore CRITICAL findings due to "context"
- Do NOT skip OSV.dev scan when `--scan-deps` is requested
- Do NOT report findings without remediation guidance
- Do NOT use this skill to analyze non-TypeScript/JavaScript files (out of scope)

## Dependency Scanning Rules

When `--scan-deps` is specified:

1. Read `package.json` from the target directory
2. Extract `dependencies` and `devDependencies`
3. Build OSV.dev batch query for packages (max 50 per batch)
4. Query `https://api.osv.dev/v1/querybatch` via WebFetch
5. Report CVE ID, severity, affected version, and fix version for each finding

**OSV.dev API**: Public endpoint, no authentication required.

## Scope Filtering Rules

When `--scope <text>` is provided:

- Parse scope as space-separated keywords
- Filter files to those whose path contains at least one keyword (case-insensitive)
- Log excluded file count in verbose mode
- Always document scope restriction in report header

## Iron Law

```
NO PRODUCTION CODE WITHOUT SECURITY ANALYSIS FOR AUTH/SECRETS/EXTERNAL-INPUT HANDLERS
```

## Related References

- `.claude/skills/gemini-cli-security/SKILL.md` - Full skill documentation
- `security-architect` agent - Performs comprehensive security reviews using this skill
- `auth-security-expert` skill - OAuth 2.1 and JWT patterns
- `insecure-defaults` skill - Detects hardcoded credentials and default passwords
- `differential-review` skill - Security review of code diffs
