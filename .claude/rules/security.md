# Security

## Core Rules

- Never commit secrets or credentials to version control
- Validate all user input and sanitize outputs
- Use parameterized queries for database access (never string interpolation)
- Review auth/authz/PII changes with security-architect agent

## Command Execution Safety

- Use `spawnSync` with array arguments and `shell: false`
- Never use `eval()` or `new Function()` with user input
- Validate file paths before operations (prevent path traversal)

## OWASP Top 10 Coverage

### A06: Vulnerable Components
- Keep dependencies updated via `pnpm audit`
- Review CVE databases for critical packages

### A09: Security Logging Failures
- Use structured logging (never log secrets)
- Log authentication failures and access control violations
- Protect log integrity

### A10: Server-Side Request Forgery (SSRF)
- Validate and sanitize all URLs
- Use allowlists for external requests
- Restrict outbound network access

## Additional Guidance

For comprehensive security review, invoke:
- `security-architect` skill (STRIDE, OWASP Top 10, threat modeling)
- `auth-security-expert` skill (OAuth 2.1, JWT patterns)
