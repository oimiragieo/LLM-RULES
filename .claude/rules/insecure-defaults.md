# Insecure Defaults Rules

<!-- Agent: security-architect | Task: #4 | Session: 2026-02-09 -->

Best practices for detecting and preventing insecure default configurations.

## Credential Detection

- Never hardcode passwords, API keys, tokens, or private keys in source code
- Store all credentials in environment variables or a secrets manager
- Use `.env.example` with placeholder values only (never real credentials)
- Ensure `.env` files are listed in `.gitignore`
- Scan for AWS access keys (`AKIA` prefix), GitHub tokens (`ghp_`), and common key patterns
- Check connection strings for embedded credentials
- Audit configuration files (JSON, YAML, TOML) for credential values

## Fail-Open Prevention

- All authentication errors MUST deny access (fail-secure principle)
- All authorization errors MUST deny access
- Empty catch blocks in security code paths are CRITICAL vulnerabilities
- Error handlers must return appropriate HTTP error status codes (401, 403, 500)
- Never let execution continue past a failed security check
- Default switch/case branches in auth logic must deny access
- Boolean security checks must default to `false` (deny), not `true` (allow)

## Configuration Security

- CORS: Never use wildcard (`*`) origin in production
- TLS: Never disable certificate verification (`rejectUnauthorized: false`)
- Debug: Always disable debug mode in production configurations
- Binding: Bind to specific interfaces, not `0.0.0.0`, in production
- Cookies: Always set `secure: true`, `httpOnly: true`, `sameSite: 'strict'`
- Session: Use random secrets from environment variables, never hardcoded strings
- Permissions: Use restrictive file permissions (`0644` for files, `0755` for dirs)

## Cryptographic Defaults

- Never use MD5, SHA1, DES, RC4, or other weak algorithms
- Use SHA-256 or stronger for hashing
- Use AES-256-GCM or ChaCha20-Poly1305 for encryption
- Use Argon2id or bcrypt (cost 12+) for password hashing
- JWT must use RS256 or ES256, never `algorithm: 'none'`
- Generate cryptographic keys with proper entropy (crypto.randomBytes, not Math.random)

## Security Header Defaults

- Set `Strict-Transport-Security` (HSTS) with includeSubDomains
- Set `X-Content-Type-Options: nosniff`
- Set `X-Frame-Options: DENY` or `SAMEORIGIN`
- Set `Content-Security-Policy` with restrictive defaults
- Enable security header middleware (Helmet for Express, equivalent for other frameworks)

## Rate Limiting and Protection

- All authentication endpoints must have rate limiting
- All API endpoints should have rate limiting
- CSRF protection must be enabled for state-changing operations
- Request size limits must be configured (prevent memory exhaustion)
- Timeout values must be set for all network operations

## Default Credentials Audit

- Verify no service ships with factory default credentials
- Check database connections for default passwords (postgres/postgres, root/empty)
- Check message queues for default credentials (guest/guest for RabbitMQ)
- Check admin panels for default accounts (admin/admin)
- Flag any default credential as CRITICAL regardless of context

## Scanning Cadence

- Run credential scans on every commit (pre-commit hook or CI)
- Run configuration audit before every deployment
- Run full insecure defaults assessment quarterly
- Re-scan after any infrastructure or dependency change
- Archive scan results for compliance audit trails

## Common Pitfalls

- Committing `.env` files with real credentials to version control
- Using example/default secrets in production (e.g., `secret: 'keyboard cat'`)
- Disabling TLS verification "temporarily" and forgetting to re-enable
- Leaving debug mode enabled after troubleshooting
- Assuming default configurations are secure (they rarely are)
- Not checking third-party library defaults for security implications
- Treating credential detection as a one-time activity instead of continuous

## OWASP References

- A02 (Cryptographic Failures): Weak algorithms, hardcoded keys
- A05 (Security Misconfiguration): Insecure defaults, debug mode, missing headers
- A07 (Auth Failures): Default credentials, fail-open patterns
- A09 (Logging Failures): Missing security event logging

## Related References

- `.claude/skills/insecure-defaults/SKILL.md` - Full skill definition
- `.claude/skills/static-analysis/SKILL.md` - Automated scanning
- `.claude/skills/semgrep-rule-creator/SKILL.md` - Custom detection rules
- `.claude/rules/security.md` - General security rules
