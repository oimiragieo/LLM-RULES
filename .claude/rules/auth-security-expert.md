# Auth Security Expert Rules

## Core Principles

- OAuth 2.1 and RFC 8725 (JWT) are 2026 standards
- Never trust client-side auth - always validate on server
- Use short-lived access tokens with refresh tokens
- Encrypt all PII at rest and in transit
- Implement defense in depth for authentication

## Input Requirements

- Authentication mechanism to review (JWT, sessions, OAuth)
- Token handling code (generation, validation, storage)
- Authorization logic (RBAC, permissions)
- User credential handling (passwords, secrets)
- API endpoint security configuration

## Output Standards

### Required Auth Review Elements
1. **OAuth 2.1 Compliance**: Grant types, PKCE, redirect URIs
2. **JWT Security (RFC 8725)**: Algorithm, claims, expiry, validation
3. **Token Management**: Storage, rotation, revocation
4. **Password Security**: Hashing algorithm, salt, cost factor
5. **Session Management**: Timeout, secure cookies, CSRF protection
6. **API Security**: Authentication middleware, rate limiting

### OAuth 2.1 Requirements

| Requirement                | Standard                     | Check For                        |
| -------------------------- | ---------------------------- | -------------------------------- |
| Grant Types                | Authorization Code + PKCE    | No implicit grant                |
| PKCE                       | REQUIRED for all clients     | code_challenge parameter present |
| Redirect URIs              | Exact match validation       | No wildcards, HTTPS only         |
| Token Lifetime             | Short-lived access tokens    | <15 min for access, 7d for refresh |
| State Parameter            | REQUIRED                     | CSRF protection                  |
| Secure Token Storage       | httpOnly secure cookies      | No localStorage for tokens       |

### JWT Security (RFC 8725)

| Requirement          | Standard              | Check For                           |
| -------------------- | --------------------- | ----------------------------------- |
| Algorithm            | RS256 or ES256        | No HS256 (unless HSM), no "none"    |
| Signature Validation | ALWAYS validate       | Verify signature before using claims|
| Expiry (exp)         | REQUIRED              | Check exp claim, reject if expired  |
| Audience (aud)       | REQUIRED              | Validate matches expected value     |
| Not Before (nbf)     | RECOMMENDED           | Reject tokens used before nbf       |
| Token Storage        | Secure + httpOnly     | No localStorage, use httpOnly cookie|

## Anti-Patterns

| Anti-Pattern                   | Problem                        | Fix                                   |
| ------------------------------ | ------------------------------ | ------------------------------------- |
| JWT in localStorage            | XSS vulnerability              | Use httpOnly secure cookies           |
| No token expiry                | Stolen tokens valid forever    | Set exp claim (max 15 min)            |
| HS256 with client secret       | Secret exposure risk           | Use RS256 with private key            |
| No signature validation        | Forged tokens accepted         | ALWAYS validate signature             |
| Password hashing with MD5/SHA1 | Fast cracking                  | Use bcrypt (cost>=12) or Argon2       |
| No rate limiting on auth       | Brute force attacks            | Limit to 5 attempts per 15 min       |
| Implicit grant                 | Deprecated in OAuth 2.1        | Use authorization code + PKCE         |
| Client-side auth logic         | Trivial bypass                 | Always validate on server             |

## Integration Points

### Agents Using This Skill
- **security-architect** (primary): Reviews auth implementations
- **code-reviewer**: Security review of auth code
- **developer**: Implements auth following patterns
- **penetration-tester**: Tests auth vulnerabilities

### Related Skills
- **security-architect**: STRIDE and OWASP Top 10 analysis
- **static-analysis**: Automated vulnerability detection
- **insecure-defaults**: Detects default credentials
- **differential-review**: Security review of auth code changes

### Workflows
- **security-review-workflow.md**: Auth review phase
- **feature-development-workflow.md**: Auth in security review phase
- **enterprise-workflow.md**: Security gate for auth features

## Auth Review Checklist

Before finalizing auth security review, verify:
- [ ] OAuth 2.1 compliance (no implicit grant, PKCE required)
- [ ] JWT algorithm is RS256 or ES256 (not HS256 with client secret)
- [ ] JWT signature ALWAYS validated before using claims
- [ ] Access token expiry ≤15 minutes
- [ ] Refresh token expiry ≤7 days
- [ ] Tokens stored in httpOnly secure cookies (not localStorage)
- [ ] Password hashing uses bcrypt (cost>=12) or Argon2
- [ ] Rate limiting on login endpoint (5 attempts/15 min)
- [ ] CSRF protection for state-changing operations
- [ ] HTTPS enforced for all auth endpoints
- [ ] Multi-factor authentication (MFA) available
- [ ] Token revocation mechanism exists
- [ ] Audience (aud) claim validated
- [ ] Redirect URIs exactly matched (no wildcards)

## Password Security Standards (2026)

| Aspect         | Standard                    | Example                     |
| -------------- | --------------------------- | --------------------------- |
| Hashing        | bcrypt (cost>=12) or Argon2 | bcrypt.hash(pwd, 12)        |
| Salt           | Per-password random salt    | Auto with bcrypt/Argon2     |
| Min Length     | 12 characters               | Policy enforced             |
| Complexity     | No special char required    | Length > complexity         |
| Storage        | Never store plaintext       | Hash before database        |
| Comparison     | Constant-time comparison    | bcrypt.compare()            |

## Token Rotation Strategy

| Token Type     | Lifetime   | Rotation Strategy                 |
| -------------- | ---------- | --------------------------------- |
| Access Token   | 5-15 min   | Auto-expire, refresh to get new   |
| Refresh Token  | 7 days     | Rotate on use (single-use)        |
| API Key        | 90 days    | Manual rotation, expiry warning   |
| Session Cookie | 24 hours   | Sliding window, extend on activity|

## Iron Laws

### 1. The JWT Storage Law
```
NEVER STORE JWTS IN LOCALSTORAGE
```
Use httpOnly secure cookies. localStorage is vulnerable to XSS.

### 2. The Signature Validation Law
```
ALWAYS VALIDATE JWT SIGNATURE BEFORE USING CLAIMS
```
Unsigned or unvalidated JWTs can be forged.

### 3. The Algorithm Law
```
USE RS256 OR ES256 FOR JWT (NOT HS256 WITH CLIENT SECRET)
```
HS256 with client secret exposes secret in client code.

### 4. The OAuth Grant Law
```
NO IMPLICIT GRANT - USE AUTHORIZATION CODE + PKCE
```
Implicit grant is deprecated in OAuth 2.1.

## Related References
- `.claude/skills/auth-security-expert/SKILL.md` - Full skill documentation
- `security-architect` skill - General security review
- `@SECURITY.md` - Security rules and OWASP guidance
- RFC 8725: JWT Best Current Practices
- OAuth 2.1 Authorization Framework
