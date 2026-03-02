# authentication-flow-rules Rules

## Purpose

OAuth 2.1 compliant authentication flows (MANDATORY Q2 2026). PKCE required for ALL clients, Implicit Flow removed, modern token security.

## Best Practices

- OAuth 2.1 compliance is MANDATORY (Q2 2026)
- PKCE required for ALL clients (public AND confidential)
- Never use Implicit Flow or Password Credentials
- Store tokens in HttpOnly, Secure, SameSite=Strict cookies
- Access tokens ≤15 minutes, refresh token rotation required

## Integration Points

See SKILL.md for complete documentation.
