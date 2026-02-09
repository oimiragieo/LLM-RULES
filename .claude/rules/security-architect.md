# Security Architect Rules

## Core Principles

- Defense in depth: layer security controls
- Least privilege: minimal permissions by default
- Fail securely: default to deny
- Validate everything: never trust input
- Keep secrets secret: use secret managers

## Input Requirements

- Code or architecture design to review
- Security requirements (auth, encryption, compliance)
- Threat model (if available)
- Technology stack and dependencies
- Data classification (public, internal, confidential, sensitive)

## Output Standards

### Required Security Report Elements
1. **STRIDE Threat Model**: Spoofing, Tampering, Repudiation, Information Disclosure, DoS, Elevation
2. **OWASP Top 10 Analysis**: A01-A10 vulnerability checks
3. **Security Findings**: Categorized by severity (CRITICAL/HIGH/MEDIUM/LOW)
4. **Remediation Steps**: Specific, actionable fixes
5. **Security Patterns**: Recommended patterns (auth, encryption, validation)
6. **Compliance Notes**: SOC2, GDPR, HIPAA considerations if applicable

### STRIDE Threat Categories

| Threat                     | Description                 | Mitigations                             |
| -------------------------- | --------------------------- | --------------------------------------- |
| Spoofing                   | Impersonating users/systems | Strong auth, MFA, JWT validation        |
| Tampering                  | Modifying data              | Input validation, parameterized queries |
| Repudiation                | Denying actions             | Audit logs, non-repudiation signatures  |
| Information Disclosure     | Data leaks                  | Encryption at rest/transit, access logs |
| Denial of Service          | Blocking access             | Rate limiting, resource quotas          |
| Elevation of Privilege     | Gaining unauthorized access | RBAC, least privilege, access controls  |

### OWASP Top 10 (2021)

| ID   | Vulnerability              | Check For                               |
| ---- | -------------------------- | --------------------------------------- |
| A01  | Broken Access Control      | Authorization on every endpoint         |
| A02  | Cryptographic Failures     | Strong algorithms (AES-256, SHA-256+)   |
| A03  | Injection                  | Parameterized queries, input validation |
| A04  | Insecure Design            | Threat modeling, secure patterns        |
| A05  | Security Misconfiguration  | Hardened defaults, minimal features     |
| A06  | Vulnerable Components      | Updated dependencies, CVE monitoring    |
| A07  | Authentication Failures    | MFA, secure session management          |
| A08  | Software/Data Integrity    | Dependency verification, CI/CD security |
| A09  | Logging Failures           | Security event logging, log integrity   |
| A10  | SSRF                       | URL validation, allowlists              |

## Anti-Patterns

| Anti-Pattern                   | Problem                        | Fix                                   |
| ------------------------------ | ------------------------------ | ------------------------------------- |
| Hardcoded secrets              | Credentials in source code     | Use environment variables, vaults     |
| String interpolation in SQL    | SQL injection vulnerability    | Use parameterized queries             |
| No input validation            | XSS, injection attacks         | Validate/sanitize all inputs          |
| Weak password hashing          | Password cracking              | Use bcrypt, scrypt, or Argon2         |
| No rate limiting               | Brute force attacks            | Implement rate limiting (5 req/min)   |
| HTTP instead of HTTPS          | Man-in-the-middle attacks      | Enforce HTTPS everywhere              |
| Client-side auth               | Trivial bypass                 | Always validate on server             |
| Trusting user input            | All attack vectors             | Validate everything server-side       |

## Integration Points

### Agents Using This Skill
- **security-architect** (primary): Security reviews and threat modeling
- **architect**: Includes security in architecture reviews
- **code-reviewer**: Security-focused code reviews
- **penetration-tester**: Security testing based on findings

### Related Skills
- **auth-security-expert**: OAuth 2.1, JWT-specific security
- **static-analysis**: Automated vulnerability detection
- **variant-analysis**: Finding similar vulnerabilities
- **insecure-defaults**: Detecting default credential issues
- **differential-review**: Security review of code diffs

### Workflows
- **security-review-workflow.md**: Comprehensive security audit process
- **feature-development-workflow.md**: Security review in Review phase
- **enterprise-workflow.md**: Security gate before deployment

## Security Review Checklist

Before finalizing security review, verify:
- [ ] STRIDE threat model completed
- [ ] All OWASP Top 10 categories checked
- [ ] Authentication mechanism reviewed (MFA, sessions, JWT)
- [ ] Authorization checked (RBAC, least privilege)
- [ ] Input validation on all endpoints
- [ ] SQL injection risk assessed (parameterized queries?)
- [ ] XSS risk assessed (output encoding?)
- [ ] Secrets management reviewed (no hardcoded credentials?)
- [ ] Encryption at rest and in transit
- [ ] Error handling doesn't leak information
- [ ] Logging includes security events
- [ ] Rate limiting on authentication endpoints
- [ ] Dependencies checked for CVEs
- [ ] Security headers configured (CSP, HSTS, etc.)

## Severity Classification

| Severity | Impact                | Examples                              | SLA      |
| -------- | --------------------- | ------------------------------------- | -------- |
| CRITICAL | System compromise     | RCE, auth bypass, data breach         | 24 hours |
| HIGH     | Significant exposure  | SQL injection, XSS, privilege escalation | 7 days   |
| MEDIUM   | Limited exposure      | Missing security headers, weak crypto | 30 days  |
| LOW      | Best practice violation | Verbose error messages, no rate limiting | 90 days  |

## Iron Law

```
NO PRODUCTION DEPLOYMENT WITHOUT SECURITY REVIEW FOR AUTH/PII/EXTERNAL DATA
```

Any code handling authentication, personally identifiable information (PII), or external data integrations MUST have security review before production.

## Related References
- `.claude/skills/security-architect/SKILL.md` - Full skill documentation
- `security-architect` agent - Performs security reviews
- `auth-security-expert` skill - OAuth 2.1 and JWT patterns
- `@SECURITY.md` - Security rules and OWASP guidance
