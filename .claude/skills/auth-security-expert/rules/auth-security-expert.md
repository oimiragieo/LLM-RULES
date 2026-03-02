# auth-security-expert Rules

## Purpose

OAuth 2.1, JWT (RFC 8725), encryption, and authentication security expert. Enforces 2026 security standards.

## Best Practices

- OAuth 2.1 compliance mandatory Q2 2026 (PKCE for ALL clients)
- JWT best practices RFC 8725 (RS256/ES256, never 'none')
- Token storage in HttpOnly cookies ONLY (never localStorage)
- Refresh token rotation with reuse detection
- Password hashing Argon2id or bcrypt ≥12 rounds
- PKCE downgrade attack prevention

## Integration Points

See SKILL.md for complete documentation.
