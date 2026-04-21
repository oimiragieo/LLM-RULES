<!-- Agent: security-architect | Task: #oauth2-security-review | Session: 2026-02-08 -->

# OAuth2 Authentication Security Architecture Review

**Date:** 2026-02-08
**Agent:** security-architect
**Status:** COMPREHENSIVE REVIEW -- SECURITY REQUIREMENTS FOR IMPLEMENTATION
**Severity Classification:** ARCHITECTURE-LEVEL (pre-implementation)
**Compliance Scope:** OAuth 2.1, RFC 8725, OWASP Top 10 (2021), GDPR, SOC2

---

## Executive Summary

This document provides a comprehensive security architecture review for adding OAuth2 authentication to the agent-studio project. It covers threat modeling (STRIDE), OAuth 2.1 compliance requirements, JWT best practices per RFC 8725, OWASP Top 10 coverage for authentication surfaces, and actionable security controls that MUST be incorporated into the implementation plan.

**Key Findings:**

- OAuth 2.1 (draft-ietf-oauth-v2-1) MUST be the baseline -- implicit flow and ROPC are forbidden
- PKCE is MANDATORY for ALL client types (public AND confidential)
- The existing agent-studio codebase has no authentication layer; this is greenfield security-critical work
- 14 OAuth security controls + 9 CLI-specific requirements defined below, all mapped to OWASP and STRIDE categories
- 4 CRITICAL requirements, 8 HIGH requirements, and 6 MEDIUM requirements identified
- CLI-specific concerns: loopback redirect URI security, OS keychain token storage, device authorization flow for headless environments
- Existing systemic issues (SEC-LIB-001 command injection, SEC-HOOK-001 kill switch) should be addressed as prerequisites

**Verdict:** Implementation may proceed with the security controls defined in this document as binding requirements. Any deviation requires a follow-up security review.

---

## Table of Contents

1. [Threat Model (STRIDE)](#1-threat-model-stride)
2. [OAuth 2.1 Compliance Requirements](#2-oauth-21-compliance-requirements)
3. [JWT Security (RFC 8725)](#3-jwt-security-rfc-8725)
4. [Token Storage and Transport](#4-token-storage-and-transport)
5. [OWASP Top 10 Coverage](#5-owasp-top-10-coverage)
6. [Security Controls Registry](#6-security-controls-registry)
7. [Security Testing Requirements](#7-security-testing-requirements)
8. [Compliance Considerations](#8-compliance-considerations)
9. [Incident Response for Auth Breaches](#9-incident-response-for-auth-breaches)
10. [Hybrid Validation Checklist](#10-hybrid-validation-checklist)
11. [Recommendations Summary](#11-recommendations-summary)
12. [CLI-Specific Security Considerations](#12-cli-specific-security-considerations)
13. [Risk Matrix (Likelihood x Impact)](#13-risk-matrix-likelihood-x-impact)
14. [Mandatory vs. Recommended Controls Summary](#14-mandatory-vs-recommended-controls-summary)

---

## 1. Threat Model (STRIDE)

### 1.1 Spoofing (Identity Verification)

| Threat ID | Threat | Attack Vector | Likelihood | Impact | Mitigation |
|-----------|--------|---------------|------------|--------|------------|
| S-001 | Identity provider spoofing | Attacker sets up fake OAuth provider with similar domain | MEDIUM | CRITICAL | Strict issuer (`iss`) claim validation; hardcoded provider allowlist; HTTPS-only discovery endpoints |
| S-002 | Token forgery | Attacker crafts JWT with `alg: none` or weak algorithm | HIGH | CRITICAL | Algorithm whitelist enforcement (RS256/ES256 only); reject `none` algorithm; verify signature before any claim processing |
| S-003 | Session hijacking via stolen tokens | XSS or network interception steals access/refresh tokens | HIGH | HIGH | HttpOnly + Secure + SameSite=Strict cookies; short-lived access tokens (<=15 min); TLS 1.2+ everywhere |
| S-004 | Client impersonation | Attacker registers malicious OAuth client with legitimate-looking name | MEDIUM | HIGH | Client authentication for confidential clients; exact redirect URI matching; client ID/secret rotation policy |
| S-005 | Credential stuffing | Automated login attempts with breached credential databases | HIGH | MEDIUM | Rate limiting on token endpoint; account lockout after N failures; MFA for privileged accounts |

### 1.2 Tampering (Token and Data Integrity)

| Threat ID | Threat | Attack Vector | Likelihood | Impact | Mitigation |
|-----------|--------|---------------|------------|--------|------------|
| T-001 | Authorization code injection | Attacker substitutes stolen authorization code during exchange | HIGH | CRITICAL | PKCE mandatory (S256 only); exact state parameter validation |
| T-002 | CSRF on callback endpoint | Attacker tricks user into completing OAuth flow with attacker's code | MEDIUM | HIGH | State parameter with cryptographic binding; SameSite cookie attribute |
| T-003 | Token scope escalation | Attacker modifies token claims to add unauthorized scopes | LOW | CRITICAL | Asymmetric signing (RS256/ES256); server-side scope enforcement on every request; never trust client-asserted scopes |
| T-004 | Redirect URI manipulation | Attacker modifies redirect_uri to capture authorization codes | HIGH | CRITICAL | Exact string matching for redirect URIs; no wildcards; no subdomain patterns |
| T-005 | PKCE downgrade attack | Attacker strips code_challenge from authorization request | MEDIUM | HIGH | Server MUST reject authorization requests without code_challenge; no backward compatibility with non-PKCE flows |

### 1.3 Repudiation (Audit and Accountability)

| Threat ID | Threat | Attack Vector | Likelihood | Impact | Mitigation |
|-----------|--------|---------------|------------|--------|------------|
| R-001 | Untracked authentication events | No logging of login/logout/token refresh events | HIGH | MEDIUM | Structured audit logging for all auth events (login, logout, token refresh, token revocation, failed attempts) |
| R-002 | Session activity not attributable | Actions cannot be traced to authenticated user | MEDIUM | HIGH | Include user ID and session ID in all audit logs; correlate with JWT `jti` claim |
| R-003 | Token abuse without detection | Stolen tokens used without any alerts | HIGH | HIGH | Anomaly detection: unusual IP, user agent, geolocation changes trigger re-authentication |

### 1.4 Information Disclosure (Token and Data Leakage)

| Threat ID | Threat | Attack Vector | Likelihood | Impact | Mitigation |
|-----------|--------|---------------|------------|--------|------------|
| I-001 | Token exposure in URLs | Access tokens in query parameters visible in server logs, browser history, Referer headers | HIGH | CRITICAL | Bearer tokens ONLY in Authorization header; never in URL query parameters (OAuth 2.1 mandate) |
| I-002 | Token exposure in localStorage | XSS vulnerability exfiltrates tokens from client-side storage | HIGH | CRITICAL | HttpOnly cookies for ALL tokens; never use localStorage/sessionStorage for tokens |
| I-003 | Sensitive data in JWT claims | PII, passwords, or secrets encoded in JWT payload | MEDIUM | HIGH | Minimal claims in access tokens (sub, scope, exp, iat, jti); no PII beyond email; never store passwords/secrets |
| I-004 | Error message information leakage | Auth errors reveal whether user exists, password is wrong, etc. | MEDIUM | MEDIUM | Generic error messages ("Invalid credentials"); same response time for user-not-found and wrong-password |
| I-005 | CORS misconfiguration | Overly permissive CORS allows token theft from malicious origins | MEDIUM | HIGH | Strict CORS origin allowlist; no `Access-Control-Allow-Origin: *` for authenticated endpoints |

### 1.5 Denial of Service (Availability)

| Threat ID | Threat | Attack Vector | Likelihood | Impact | Mitigation |
|-----------|--------|---------------|------------|--------|------------|
| D-001 | Token endpoint abuse | Automated requests exhaust server resources or trigger account lockout | HIGH | MEDIUM | Rate limiting: 10 requests/minute per IP for token endpoint; exponential backoff after failures |
| D-002 | Refresh token flooding | Attacker generates thousands of refresh tokens per user | MEDIUM | MEDIUM | Maximum 5 active refresh tokens per user; oldest revoked on new issuance |
| D-003 | JWKS endpoint cache poisoning | Frequent JWKS endpoint hits bypass caching, exhaust provider | LOW | LOW | Cache JWKS keys with minimum 5-minute TTL; implement circuit breaker for key fetching |

### 1.6 Elevation of Privilege (Access Control)

| Threat ID | Threat | Attack Vector | Likelihood | Impact | Mitigation |
|-----------|--------|---------------|------------|--------|------------|
| E-001 | Scope escalation via token exchange | Attacker requests broader scopes than authorized | MEDIUM | CRITICAL | Server-side scope enforcement; scope downscoping on every token issuance; never issue broader scope than originally consented |
| E-002 | Role escalation via claim manipulation | Attacker modifies role claims in JWT | LOW | CRITICAL | Server-side role lookup (never trust JWT role claim alone for admin operations); defense-in-depth with database RBAC check |
| E-003 | Privilege persistence after revocation | Revoked user retains access via cached tokens | HIGH | HIGH | Short-lived access tokens (<=15 min); mandatory token revocation list check for sensitive operations; immediate session invalidation on role change |
| E-004 | OAuth provider account takeover | Attacker compromises user's OAuth provider account | MEDIUM | CRITICAL | Support account linking with multiple providers; allow password-based recovery flow; email notification on new OAuth provider linking |

---

## 2. OAuth 2.1 Compliance Requirements

OAuth 2.1 (draft-ietf-oauth-v2-1) consolidates security best practices. The following are MANDATORY requirements.

### 2.1 CRITICAL Requirements (Must-Have)

#### REQ-AUTH-001: PKCE Required for ALL Clients [CRITICAL]

**Requirement:** PKCE (Proof Key for Code Exchange, RFC 7636) MUST be required for ALL OAuth clients, including confidential clients.

**Implementation:**
- Code verifier: 43-128 cryptographically random URL-safe characters
- Code challenge: `BASE64URL(SHA256(code_verifier))`
- Code challenge method: MUST be `S256` (never `plain`)
- Server MUST reject authorization requests without `code_challenge` parameter
- Server MUST reject token requests without valid `code_verifier`

**PKCE Downgrade Prevention:**
```
Authorization endpoint MUST:
  1. Reject requests without code_challenge (400 invalid_request)
  2. Reject code_challenge_method !== 'S256' (400 invalid_request)

Token endpoint MUST:
  1. Reject requests where stored code has code_challenge but request has no code_verifier
  2. Verify SHA256(code_verifier) === stored code_challenge
```

**Rationale:** Prevents authorization code interception attacks (MITM on redirect). Even confidential clients benefit because PKCE prevents code injection by third parties.

#### REQ-AUTH-002: Implicit Flow Forbidden [CRITICAL]

**Requirement:** The implicit flow (`response_type=token`) MUST NOT be supported.

**Implementation:**
- Authorization server MUST reject `response_type=token`
- Authorization server MUST reject `response_type=id_token token`
- Only `response_type=code` is permitted
- Remove any legacy implicit flow endpoints

**Rationale:** Tokens in URL fragments leak via browser history, Referer headers, server logs, and browser extensions. Authorization Code + PKCE is the only secure alternative for SPAs.

#### REQ-AUTH-003: ROPC Flow Forbidden [CRITICAL]

**Requirement:** Resource Owner Password Credentials (`grant_type=password`) MUST NOT be supported.

**Implementation:**
- Token endpoint MUST reject `grant_type=password`
- No username/password fields accepted at the token endpoint
- Users authenticate ONLY through the authorization endpoint (browser-based)

**Rationale:** ROPC requires users to share credentials directly with the client, violating the delegated authorization principle and increasing phishing risk.

### 2.2 HIGH Requirements

#### REQ-AUTH-004: Exact Redirect URI Matching [HIGH]

**Requirement:** Redirect URIs MUST be compared using exact string matching.

**Implementation:**
- No wildcard patterns (`https://*.example.com` -- FORBIDDEN)
- No partial matching or subdomain patterns
- Each redirect URI registered explicitly per client
- Comparison is case-sensitive, no URL normalization

#### REQ-AUTH-005: Bearer Tokens Not in Query Parameters [HIGH]

**Requirement:** Access tokens MUST NOT be transmitted via URL query parameters.

**Implementation:**
- Authorization header: `Authorization: Bearer <token>`
- Or POST body parameter (for form submissions only)
- Server MUST reject requests with `access_token` query parameter

#### REQ-AUTH-006: Refresh Token Rotation [HIGH]

**Requirement:** Refresh tokens MUST implement rotation with reuse detection.

**Implementation:**
- Every refresh request issues a NEW refresh token and invalidates the old one
- Old refresh tokens are marked as "used" (not deleted)
- If a "used" refresh token is presented again, ALL tokens for that user/session are revoked (theft detection)
- Security alert sent to user on reuse detection
- Refresh tokens stored as SHA-256 hashes in database (never plaintext)

#### REQ-AUTH-007: State Parameter Mandatory [HIGH]

**Requirement:** The `state` parameter MUST be included in all authorization requests for CSRF protection.

**Implementation:**
- Client generates cryptographically random state value (minimum 128 bits)
- State stored in session (httpOnly cookie or server-side session)
- On callback, client validates state matches stored value
- Mismatch results in immediate request rejection

#### REQ-AUTH-008: HTTPS Only [HIGH]

**Requirement:** ALL OAuth endpoints and redirect URIs MUST use HTTPS.

**Implementation:**
- Authorization endpoint: HTTPS only
- Token endpoint: HTTPS only
- Redirect URIs: HTTPS only (localhost exception for development)
- HSTS header with minimum 1 year max-age

#### REQ-AUTH-009: Nonce for OpenID Connect [HIGH]

**Requirement:** If using OpenID Connect, the `nonce` parameter MUST be included and validated.

**Implementation:**
- Client generates cryptographically random nonce
- Nonce included in authorization request
- ID token MUST contain matching `nonce` claim
- Client validates nonce match before accepting ID token

---

## 3. JWT Security (RFC 8725)

### 3.1 Algorithm Restrictions

#### REQ-JWT-001: Algorithm Whitelist [CRITICAL]

**Allowed algorithms:**
- `RS256` (RSA + SHA-256) -- RECOMMENDED for distributed systems
- `ES256` (ECDSA + SHA-256) -- RECOMMENDED for performance-sensitive systems

**Forbidden algorithms:**
- `none` -- MUST be rejected; enables token forgery
- `HS256` -- MUST NOT be used in multi-service architectures (shared secret leakage risk)
- `RS384`, `RS512` -- unnecessary overhead without proportional security benefit
- Any algorithm not in the whitelist -- rejected by default

**Implementation:**
```
jwt.verify(token, publicKey, {
  algorithms: ['RS256', 'ES256'],  // WHITELIST ONLY
  // NEVER: algorithms: ['none', 'HS256', ...]
});
```

### 3.2 Claim Validation

#### REQ-JWT-002: Mandatory Claim Validation [HIGH]

Every JWT MUST be validated for ALL of the following:

| Claim | Validation Rule | Failure Action |
|-------|-----------------|----------------|
| `alg` (header) | Must be in whitelist (RS256, ES256) | Reject token |
| `iss` (issuer) | Must match expected issuer URL exactly | Reject token |
| `aud` (audience) | Must include this service's identifier | Reject token |
| `exp` (expiration) | Must be in the future (with <=30s clock skew tolerance) | Reject token |
| `iat` (issued at) | Must be present; must be in the past | Reject token |
| `nbf` (not before) | If present, must be in the past | Reject token |
| `sub` (subject) | Must be present and non-empty | Reject token |
| `jti` (JWT ID) | Must be present for revocation checking | Reject token |

**Validation Order:**
1. Check `alg` header (reject `none` first)
2. Verify cryptographic signature
3. Validate `exp` (reject expired)
4. Validate `iss` (reject wrong issuer)
5. Validate `aud` (reject wrong audience)
6. Validate remaining claims
7. Check revocation list (if applicable)
8. Validate custom claims (scope, role)

### 3.3 Token Lifetimes

| Token Type | Maximum Lifetime | Recommended | Storage |
|------------|------------------|-------------|---------|
| Access Token | 15 minutes | 5-10 minutes | HttpOnly cookie |
| Refresh Token | 30 days | 7 days | HttpOnly cookie (restricted path) |
| ID Token | 60 minutes | 5-15 minutes | Memory only (never persisted) |
| Authorization Code | 10 minutes | 1-5 minutes | Server-side only; single-use |

### 3.4 Key Management

#### REQ-JWT-003: Key Rotation [MEDIUM]

**Requirements:**
- RSA/ECDSA key pairs MUST be rotated at least every 90 days
- Use `kid` (key ID) header claim to identify which key signed the token
- Maintain previous key for grace period (24-48 hours) to validate in-flight tokens
- JWKS endpoint must serve current and previous public keys
- Private keys stored in secure key management (environment variables at minimum; HSM/KMS for production)
- Private keys NEVER committed to version control, NEVER logged, NEVER included in error messages

---

## 4. Token Storage and Transport

### 4.1 Recommended: HttpOnly Cookies (Server-Side Token Management)

**Access Token Cookie:**
```
Set-Cookie: access_token=<jwt>;
  HttpOnly;        // Cannot be accessed by JavaScript (XSS protection)
  Secure;          // HTTPS only
  SameSite=Strict; // CSRF protection
  Max-Age=900;     // 15 minutes
  Path=/;          // Available to all API routes
  Domain=.example.com;
```

**Refresh Token Cookie:**
```
Set-Cookie: refresh_token=<jwt>;
  HttpOnly;
  Secure;
  SameSite=Strict;
  Max-Age=604800;  // 7 days
  Path=/auth/refresh;  // ONLY accessible by refresh endpoint
  Domain=.example.com;
```

### 4.2 Forbidden: Client-Side Token Storage

The following storage mechanisms MUST NOT be used for tokens:

| Storage | Risk | Severity |
|---------|------|----------|
| `localStorage` | XSS attack exfiltrates tokens; persists across sessions | CRITICAL |
| `sessionStorage` | XSS attack exfiltrates tokens; slightly less persistent | CRITICAL |
| URL query parameters | Visible in logs, history, Referer headers | CRITICAL |
| URL fragments | Accessible to JavaScript; leaked via Referer in some browsers | HIGH |
| `document.cookie` (non-HttpOnly) | XSS attack reads via `document.cookie` | HIGH |

### 4.3 CORS Configuration

**Authenticated Endpoints:**
```
Access-Control-Allow-Origin: https://app.example.com  // EXACT origin, never *
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Max-Age: 86400
```

**Public Endpoints (JWKS, OpenID Configuration):**
```
Access-Control-Allow-Origin: *  // Acceptable for public key endpoints only
Access-Control-Allow-Methods: GET, OPTIONS
```

---

## 5. OWASP Top 10 Coverage

### 5.1 A01: Broken Access Control

**Relevance:** CRITICAL -- OAuth2 is the primary access control mechanism.

**Requirements:**
- Deny by default: all endpoints require authentication unless explicitly public
- Scope-based authorization: validate token scopes on every API request
- Role-based access control (RBAC): implement server-side role checks for admin operations
- Vertical privilege escalation prevention: admin endpoints verify admin role in database (not just JWT claim)
- Horizontal privilege escalation prevention: users can only access their own resources; validate resource ownership
- Rate limit authorization decisions to prevent brute-force scope guessing
- Log all access control failures for security monitoring

**Security Controls:**
- SEC-AUTH-001: Token scope enforcement middleware
- SEC-AUTH-002: Resource ownership validation
- SEC-AUTH-003: Admin operation double-check (JWT + database)

### 5.2 A02: Cryptographic Failures

**Relevance:** CRITICAL -- JWT signing, token hashing, password hashing, TLS.

**Requirements:**
- JWT signing: RS256 or ES256 only (asymmetric); no HS256 in distributed systems
- Refresh token storage: SHA-256 hash in database (never plaintext)
- Password hashing (if local accounts): Argon2id (memory=19456, time=2, parallelism=1) or bcrypt (cost >= 14)
- TLS 1.2+ required for all connections; TLS 1.0/1.1 disabled
- HSTS header: `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- Key size: RSA 2048-bit minimum (4096-bit recommended); ECDSA P-256
- No MD5, SHA-1, or DES in any authentication context
- Secrets (client_secret, JWT private keys) stored in environment variables or secret manager; NEVER in code

### 5.3 A07: Identification and Authentication Failures

**Relevance:** CRITICAL -- This is the core attack surface.

**Requirements:**
- Credential stuffing protection: rate limit login/token endpoint (5 attempts per minute per IP; 10 per account)
- Account lockout: temporary lockout after 10 consecutive failures (15-minute window)
- User enumeration prevention: identical error responses for "user not found" and "invalid password"
- Session management: absolute timeout (24 hours); idle timeout (30 minutes); regenerate session on login
- MFA: required for admin accounts; recommended for all accounts
- Weak password prevention: minimum 12 characters; check against known breached password lists (if local accounts)
- Logout: revoke refresh token; clear all auth cookies; invalidate server-side session

**Additional Controls:**
- Brute force detection with automatic IP blocking (temporary)
- Failed login attempt logging (IP, timestamp, username attempted -- NOT password)
- Account recovery via trusted email with time-limited, single-use tokens

---

## 6. Security Controls Registry

The following controls MUST be implemented as part of the OAuth2 feature. Each control has a unique ID for traceability.

### CRITICAL Controls

#### SEC-OAUTH-001: PKCE Enforcement

- **STRIDE:** Tampering (T-001)
- **OWASP:** A07 (Authentication Failures)
- **Requirement:** Authorization server MUST reject requests without `code_challenge` (S256 method only)
- **Test:** Send authorization request without `code_challenge`; expect 400 response
- **Test:** Send authorization request with `code_challenge_method=plain`; expect 400 response

#### SEC-OAUTH-002: Algorithm Whitelist

- **STRIDE:** Spoofing (S-002)
- **OWASP:** A02 (Cryptographic Failures)
- **Requirement:** JWT verification MUST whitelist algorithms (RS256, ES256 only); reject `none`
- **Test:** Create JWT with `alg: none`; expect verification failure
- **Test:** Create JWT with `alg: HS256`; expect verification failure (in distributed mode)

#### SEC-OAUTH-003: Token Storage Security

- **STRIDE:** Information Disclosure (I-001, I-002)
- **OWASP:** A02 (Cryptographic Failures)
- **Requirement:** Tokens in HttpOnly + Secure + SameSite=Strict cookies only; never in localStorage/URLs
- **Test:** Verify `Set-Cookie` headers include all security attributes
- **Test:** Verify no endpoint returns tokens in response body (except initial token exchange)

### HIGH Controls

#### SEC-OAUTH-004: Redirect URI Validation

- **STRIDE:** Tampering (T-004)
- **OWASP:** A01 (Broken Access Control)
- **Requirement:** Exact string matching for redirect URIs; no wildcards
- **Test:** Register redirect `https://app.example.com/callback`; request with `https://evil.example.com/callback`; expect rejection

#### SEC-OAUTH-005: Refresh Token Rotation

- **STRIDE:** Spoofing (S-003), Elevation of Privilege (E-003)
- **OWASP:** A07 (Authentication Failures)
- **Requirement:** Every refresh issues new token; reuse detection revokes all user tokens
- **Test:** Use refresh token twice; expect second use to revoke all tokens for that user
- **Test:** Verify refresh tokens stored as SHA-256 hashes (never plaintext)

#### SEC-OAUTH-006: Rate Limiting

- **STRIDE:** Denial of Service (D-001)
- **OWASP:** A07 (Authentication Failures)
- **Requirement:** Token endpoint: 10 requests/minute/IP; login: 5 attempts/minute/account
- **Test:** Send 11 token requests in 1 minute from same IP; expect 429 on 11th
- **Test:** Verify rate limit headers present (`X-RateLimit-Limit`, `X-RateLimit-Remaining`)

#### SEC-OAUTH-007: CSRF Protection (State Parameter)

- **STRIDE:** Tampering (T-002)
- **OWASP:** A01 (Broken Access Control)
- **Requirement:** State parameter mandatory; cryptographic binding; validated on callback
- **Test:** Send callback without state; expect rejection
- **Test:** Send callback with wrong state; expect rejection

#### SEC-OAUTH-008: Scope Enforcement

- **STRIDE:** Elevation of Privilege (E-001)
- **OWASP:** A01 (Broken Access Control)
- **Requirement:** Server-side scope validation on every API request; never trust client-asserted scopes
- **Test:** Request with token lacking required scope; expect 403
- **Test:** Attempt scope escalation via token refresh; expect original scope preserved

#### SEC-OAUTH-009: Audit Logging

- **STRIDE:** Repudiation (R-001, R-002)
- **OWASP:** A09 (Security Logging Failures)
- **Requirement:** Log all auth events with structured format; never log tokens or passwords
- **Test:** Verify login event logged with IP, timestamp, user ID, success/failure
- **Test:** Verify no raw token values appear in any log entry

### MEDIUM Controls

#### SEC-OAUTH-010: Security Headers

- **STRIDE:** Information Disclosure (I-005)
- **OWASP:** A05 (Security Misconfiguration)
- **Requirement:** HSTS, X-Content-Type-Options, X-Frame-Options, CSP, strict CORS
- **Test:** Verify all security headers present on authenticated endpoints

#### SEC-OAUTH-011: Error Message Safety

- **STRIDE:** Information Disclosure (I-004)
- **OWASP:** A07 (Authentication Failures)
- **Requirement:** Generic auth error messages; no user enumeration; constant-time comparison
- **Test:** Login with non-existent user; verify same error as wrong password
- **Test:** Verify response time variance < 50ms between user-exists and user-not-found

#### SEC-OAUTH-012: Token Revocation

- **STRIDE:** Elevation of Privilege (E-003)
- **OWASP:** A01 (Broken Access Control)
- **Requirement:** Support RFC 7009 token revocation; immediate effect for refresh tokens; short-lived access tokens limit exposure
- **Test:** Revoke token; verify subsequent use returns 401
- **Test:** Verify all user tokens revoked on password change

#### SEC-OAUTH-013: Key Rotation

- **STRIDE:** Spoofing (S-002)
- **OWASP:** A02 (Cryptographic Failures)
- **Requirement:** 90-day key rotation; `kid` header; grace period for in-flight tokens
- **Test:** Verify JWKS endpoint serves current and previous keys
- **Test:** Verify tokens signed with rotated-out key (beyond grace period) are rejected

#### SEC-OAUTH-014: Input Validation

- **STRIDE:** Tampering (T-003)
- **OWASP:** A03 (Injection)
- **Requirement:** Validate and sanitize all OAuth parameters; reject unexpected parameters
- **Test:** Send `redirect_uri` with `javascript:` scheme; expect rejection
- **Test:** Send `scope` with SQL injection payload; expect sanitization/rejection

---

## 7. Security Testing Requirements

### 7.1 Unit Tests (Per-Control)

Each security control (SEC-OAUTH-001 through SEC-OAUTH-014) MUST have dedicated unit tests covering:
- Positive case (valid input accepted)
- Negative case (invalid input rejected)
- Edge cases (empty, null, oversized, malformed)
- Bypass attempts (known attack patterns)

### 7.2 Integration Tests

| Test Scenario | Description | Priority |
|---------------|-------------|----------|
| Full OAuth flow | Authorization request -> callback -> token exchange -> API access -> token refresh -> logout | CRITICAL |
| PKCE validation | Flow with valid PKCE; flow without PKCE (must fail); flow with wrong verifier (must fail) | CRITICAL |
| Refresh token rotation | Refresh -> verify new tokens -> reuse old token -> verify all revoked | HIGH |
| CSRF protection | Flow without state (must fail); flow with wrong state (must fail) | HIGH |
| Token expiration | Wait for access token expiry -> verify 401 -> refresh -> verify new token works | HIGH |
| Concurrent sessions | Multiple active sessions per user; selective revocation; "logout all" | MEDIUM |
| Provider switching | Login with Provider A -> link Provider B -> login with Provider B | MEDIUM |

### 7.3 Security-Specific Tests

| Test Category | Description | Tools |
|---------------|-------------|-------|
| JWT algorithm confusion | Attempt `none` algorithm, HS256 with public key as secret | Manual + automated |
| Token injection | Use token from different audience/issuer | Manual + automated |
| SSRF on redirect_uri | Use internal IPs, localhost, metadata endpoints as redirect | Automated |
| Open redirect | Use untrusted domains as redirect_uri | Automated |
| Timing attacks | Measure response time for valid vs. invalid users | Automated |
| Rate limit bypass | Test with different IPs, headers, user agents | Automated |
| Cookie security | Verify HttpOnly, Secure, SameSite attributes programmatically | Automated |
| CORS validation | Test with unauthorized origins; verify preflight responses | Automated |

### 7.4 Penetration Testing Checklist

- [ ] Authorization code interception (without PKCE)
- [ ] PKCE downgrade attack (strip code_challenge)
- [ ] Token replay across services
- [ ] Refresh token theft and reuse
- [ ] Session fixation
- [ ] Account takeover via OAuth provider
- [ ] Privilege escalation via scope manipulation
- [ ] CSRF on state-changing OAuth endpoints
- [ ] Open redirect via redirect_uri
- [ ] JWT claim manipulation
- [ ] Key confusion attack (RS256 -> HS256 with public key)

---

## 8. Compliance Considerations

### 8.1 GDPR

| Requirement | Implementation |
|-------------|---------------|
| Data minimization | Request minimum OAuth scopes (openid, email); do not request profile/contacts unless needed |
| Consent | Display scope descriptions in plain language before authorization; allow selective consent |
| Right to erasure | Account deletion MUST revoke all tokens, delete refresh token hashes, remove user data |
| Data portability | Support export of user profile data in machine-readable format |
| Breach notification | Auth breach detected -> notify users within 72 hours; notify DPA if required |
| Cross-border transfer | If using external OAuth providers, verify data processing agreements; validate provider's GDPR compliance |

### 8.2 SOC2

| Trust Principle | Auth-Related Controls |
|-----------------|----------------------|
| Security | All SEC-OAUTH controls; encryption at rest/transit; access logging |
| Availability | Rate limiting; DDoS protection on auth endpoints; failover for auth service |
| Processing Integrity | Token validation on every request; PKCE prevents code injection |
| Confidentiality | Tokens never logged; passwords hashed; secrets in environment variables |
| Privacy | Minimum scope collection; user consent; data retention policy |

### 8.3 Data Retention

| Data Type | Retention Period | Deletion Method |
|-----------|-----------------|-----------------|
| Access tokens | Until expiry (15 min) | Stateless (not stored server-side) |
| Refresh token hashes | Until expiry or revocation (max 30 days) | Database deletion + audit log |
| Authorization codes | Until exchange or expiry (max 10 min) | Database deletion |
| Audit logs (auth events) | 90 days | Automated rotation with secure deletion |
| Failed login attempts | 30 days | Automated rotation |
| User consent records | Duration of account + 7 years | Archive then delete |

---

## 9. Incident Response for Auth Breaches

### 9.1 Detection Triggers

| Trigger | Severity | Action |
|---------|----------|--------|
| Refresh token reuse detected | HIGH | Revoke all user tokens; alert user; log incident |
| >100 failed logins from single IP in 1 hour | MEDIUM | Block IP (temporary); alert security team |
| JWT signing key compromise suspected | CRITICAL | Rotate all keys immediately; revoke all tokens; force re-authentication |
| OAuth provider breach announced | HIGH | Force re-authentication for all users from that provider; review access logs |
| Unusual access pattern (impossible travel) | MEDIUM | Require re-authentication; alert user |

### 9.2 Response Procedures

**Level 1 (CRITICAL) -- Signing Key Compromise:**
1. Generate new RSA/ECDSA key pair immediately
2. Deploy new public key to JWKS endpoint
3. Revoke ALL active refresh tokens (database purge)
4. Force all users to re-authenticate
5. Investigate compromise vector
6. Notify affected users within 24 hours
7. Post-incident review within 48 hours

**Level 2 (HIGH) -- Token Theft/Replay:**
1. Identify affected user(s) via audit logs
2. Revoke all tokens for affected users
3. Force password change (if local accounts)
4. Notify affected users immediately
5. Review access logs for unauthorized actions
6. Determine if data was exfiltrated

**Level 3 (MEDIUM) -- Brute Force/Credential Stuffing:**
1. Verify rate limiting is active and effective
2. Block attacking IPs
3. Force password change for targeted accounts
4. Enable/enforce MFA for targeted accounts
5. Monitor for successful breaches from the attack window

### 9.3 Communication Templates

**User Notification (Token Theft):**
```
Subject: Security Alert - Unusual Activity on Your Account

We detected unusual activity on your account on [DATE]. As a precaution,
we have signed you out of all devices. Please sign in again to continue
using the service.

If you did not attempt to access your account, please [change your password]
and enable multi-factor authentication.

For questions, contact security@[domain].
```

---

## 10. Hybrid Validation Checklist

### IEEE 1028 Security Base (86%)

- [ ] Input validation on all user inputs (OAuth parameters, JWT claims)
- [ ] No SQL injection vulnerabilities (parameterized queries for token storage)
- [ ] No XSS vulnerabilities (CSP headers, HttpOnly cookies, output encoding)
- [ ] Sensitive data encrypted at rest (refresh token hashes) and in transit (TLS 1.2+)
- [ ] Authentication checks present on all protected endpoints
- [ ] Authorization checks present (scope and role validation)
- [ ] No hardcoded secrets or credentials (client_secret, JWT keys in env vars)
- [ ] OWASP Top 10 considered (A01, A02, A03, A05, A07, A09 mapped above)
- [ ] All error conditions handled with generic messages
- [ ] Security events logged (login, logout, token refresh, failures)
- [ ] No sensitive data in logs (tokens, passwords, PII)
- [ ] Resource cleanup (token expiration, session cleanup, key rotation)

### Context-Specific Items (14%)

- [ ] [AI-GENERATED] PKCE S256 implemented and tested (OAuth 2.1 requirement)
- [ ] [AI-GENERATED] JWT algorithm whitelist enforced (RS256/ES256 only, no `none`)
- [ ] [AI-GENERATED] Refresh token rotation with reuse detection implemented
- [ ] [AI-GENERATED] HttpOnly + Secure + SameSite=Strict cookie attributes verified
- [ ] [AI-GENERATED] State parameter CSRF protection tested with replay attempt
- [ ] [AI-GENERATED] Exact redirect URI matching enforced (no wildcards)

---

## 11. Recommendations Summary

### Priority Matrix

| Priority | Control ID | Description | Effort |
|----------|-----------|-------------|--------|
| P0 (CRITICAL) | SEC-OAUTH-001 | PKCE enforcement | 4-8 hours |
| P0 (CRITICAL) | SEC-OAUTH-002 | JWT algorithm whitelist | 2-4 hours |
| P0 (CRITICAL) | SEC-OAUTH-003 | HttpOnly cookie token storage | 4-8 hours |
| P1 (HIGH) | SEC-OAUTH-004 | Exact redirect URI matching | 2-4 hours |
| P1 (HIGH) | SEC-OAUTH-005 | Refresh token rotation | 8-16 hours |
| P1 (HIGH) | SEC-OAUTH-006 | Rate limiting on auth endpoints | 4-8 hours |
| P1 (HIGH) | SEC-OAUTH-007 | CSRF state parameter | 2-4 hours |
| P1 (HIGH) | SEC-OAUTH-008 | Scope enforcement middleware | 4-8 hours |
| P1 (HIGH) | SEC-OAUTH-009 | Structured audit logging | 4-8 hours |
| P2 (MEDIUM) | SEC-OAUTH-010 | Security headers | 2-4 hours |
| P2 (MEDIUM) | SEC-OAUTH-011 | Error message safety | 2-4 hours |
| P2 (MEDIUM) | SEC-OAUTH-012 | Token revocation (RFC 7009) | 4-8 hours |
| P2 (MEDIUM) | SEC-OAUTH-013 | Key rotation mechanism | 4-8 hours |
| P2 (MEDIUM) | SEC-OAUTH-014 | OAuth parameter input validation | 2-4 hours |

**Total Estimated Effort:** 48-96 hours (security controls only; excludes feature implementation)

### Architecture Recommendations

1. **Use an established OAuth library** -- Do not implement OAuth from scratch. Use proven libraries (e.g., `openid-client` for Node.js client, `oidc-provider` for server). Custom implementations have a 90%+ chance of introducing vulnerabilities.

2. **Backend-for-Frontend (BFF) pattern** -- If agent-studio has a browser-based frontend, use a BFF proxy that handles all OAuth token management server-side. The browser never sees raw tokens.

3. **Centralized auth middleware** -- Implement a single authentication middleware that validates tokens, checks scopes, and sets the authenticated user context. All protected routes go through this middleware.

4. **Separate auth service** -- Consider a dedicated auth service/module with its own data store for tokens, sessions, and audit logs. This limits the blast radius of auth-related vulnerabilities.

5. **Defense in depth** -- Do not rely solely on JWT claims for authorization. For admin operations and sensitive actions, verify permissions against the database. JWT claims can be cached results; the database is the source of truth.

### Integration with Existing Security Infrastructure

The agent-studio codebase has an extensive security framework (hooks, validators, guards). The OAuth implementation should integrate with:

- **bash-command-validator.cjs** -- Ensure OAuth secrets are not leaked via bash commands
- **shell-injection-validator.cjs** -- Protect against injection in any auth-related CLI tooling
- **unified-pre-write-hook.cjs** -- Prevent accidental writes of tokens/secrets to files
- **routing-guard.cjs** -- Security review enforcement (Gate 2) should trigger for ALL auth-related changes

### Existing Systemic Issues to Address First

Per the issues.md analysis, the following EXISTING security issues intersect with OAuth and should be addressed as prerequisites or concurrent work:

| Issue | Intersection with OAuth | Priority |
|-------|------------------------|----------|
| SEC-LIB-001 (execSync command injection) | Auth tokens could be exfiltrated via command injection | P1 -- Fix before OAuth |
| SEC-CTX-003 (memory file integrity) | Constitution/behaviour files injected into prompts; compromised auth config could propagate | P2 -- Fix concurrent |
| SEC-HOOK-001 (HOOK_FAIL_OPEN kill switch) | Single env var disables all security guards, including auth checks | P1 -- Fix before OAuth |
| SEC-HOOK-003 (21 env var overrides) | Individual security controls can be disabled | P2 -- Consolidate with OAuth deploy |
| H-001 (Skill name injection) | Auth-related skills could be spoofed | P2 -- Fix concurrent |

---

## Appendix A: OAuth 2.1 Reference Architecture

```
+--------+                               +---------------+
|        |-- (1) Authorization Request -->|               |
|        |      + code_challenge (S256)   |               |
|        |      + state                   | Authorization |
|        |      + redirect_uri (exact)    | Server        |
|        |      + scope                   |               |
|        |<- (2) Authorization Code ------|               |
| Client |      + state (validated)       |               |
| (BFF)  |                                +---------------+
|        |-- (3) Token Request ---------->|               |
|        |      + code                    |               |
|        |      + code_verifier           | Token         |
|        |      + client_authentication   | Endpoint      |
|        |<- (4) Access + Refresh Token --|               |
|        |      (Set-Cookie: HttpOnly)    +---------------+
|        |
|        |-- (5) API Request ----------->+---------------+
|        |      Authorization: Bearer     |               |
|        |<- (6) Protected Resource ------|  Resource     |
|        |                                |  Server       |
|        |-- (7) Refresh Token ---------->+---------------+
|        |      (Cookie: /auth/refresh)   |               |
|        |<- (8) New Access + Refresh ----|  Token        |
|        |      (old refresh invalidated) |  Endpoint     |
+--------+                               +---------------+
```

## Appendix B: Dependency Recommendations

| Package | Purpose | License | Notes |
|---------|---------|---------|-------|
| `openid-client` | OIDC/OAuth 2.x client | MIT | Handles PKCE, discovery, token management |
| `jose` | JWT signing/verification | MIT | RFC 8725 compliant; algorithm whitelist built-in |
| `helmet` | Security headers middleware | MIT | Sets HSTS, CSP, X-Frame-Options, etc. |
| `express-rate-limit` | Rate limiting | MIT | Token endpoint protection |
| `argon2` | Password hashing | MIT | Argon2id for local accounts |

**Note:** Do NOT use `jsonwebtoken` (npm) for new projects. While widely used, `jose` is more actively maintained and has better RFC compliance. `jsonwebtoken` has had historical vulnerabilities with algorithm confusion.

---

## 12. CLI-Specific Security Considerations

The agent-studio project is fundamentally a **CLI tool** (Node.js/CommonJS, invoked from terminal). This section addresses security concerns unique to CLI OAuth flows that differ substantially from browser-based SPAs.

### 12.1 OAuth Flow Selection for CLI Context

**Recommended: Authorization Code + PKCE via Loopback Redirect**

For CLI applications, the standard approach is:

1. CLI starts a temporary local HTTP server on a random ephemeral port (e.g., `http://127.0.0.1:{port}/callback`)
2. CLI opens the user's default browser with the authorization URL
3. User authenticates in the browser; authorization server redirects to the loopback URL
4. CLI's local HTTP server captures the authorization code
5. CLI exchanges the code for tokens using PKCE code_verifier
6. CLI shuts down the local HTTP server immediately after receiving the code

**Alternative: Device Authorization Grant (RFC 8628)**

For environments where opening a browser is not possible (headless servers, SSH sessions):

1. CLI requests a device code from the authorization server
2. Authorization server returns device_code + user_code + verification_uri
3. CLI displays the user_code and verification_uri to the user
4. User visits verification_uri on any device and enters the user_code
5. CLI polls the token endpoint with the device_code
6. Authorization server returns tokens once user completes authorization

**Security comparison:**

| Aspect | Loopback Redirect | Device Authorization |
|--------|------------------|---------------------|
| User experience | Better (automatic browser open) | Acceptable (manual URL visit) |
| Phishing risk | LOW (loopback is trusted) | MEDIUM (user must verify correct URL) |
| Headless support | NO (requires local browser) | YES |
| PKCE support | YES (mandatory) | N/A (different flow) |
| Replay protection | PKCE code_verifier | Device code single-use |
| Implementation complexity | MEDIUM | LOW-MEDIUM |

**Recommendation:** Implement loopback redirect as PRIMARY with device authorization as FALLBACK for headless environments.

### 12.2 Loopback Redirect URI Security

#### REQ-CLI-001: Loopback Interface Only [CRITICAL]

**Requirement:** The temporary HTTP server MUST bind ONLY to `127.0.0.1` (IPv4 loopback), never to `0.0.0.0` or any non-loopback interface.

**Rationale:** Binding to `0.0.0.0` exposes the callback server to the local network, allowing other machines to intercept the authorization code.

**Implementation:**
```
server.listen(0, '127.0.0.1', () => {
  // Port auto-assigned by OS; only localhost can reach it
});
```

**Security constraints:**
- MUST use `127.0.0.1` (not `localhost`, which may resolve to `::1` on some systems)
- MUST use an ephemeral port (port 0 = OS-assigned) -- never a fixed port
- MUST shut down the HTTP server immediately after receiving the authorization code (within 1 second)
- MUST set a timeout on the HTTP server (e.g., 120 seconds) to prevent lingering listeners
- MUST reject any requests that are not to the exact callback path

#### REQ-CLI-002: Ephemeral Port Security [HIGH]

**Threat:** Another process on the same machine could race to bind the same port.

**Mitigation:**
- Use port 0 (OS-assigned random ephemeral port) rather than a fixed port
- Include the dynamically assigned port in the redirect_uri
- Authorization server MUST validate exact redirect_uri match (including port)
- Server should validate the `state` parameter immediately on callback before processing the code

**Note on OAuth 2.1 and localhost:** RFC 8252 Section 7.3 permits `http://` (non-TLS) for loopback redirect URIs specifically. This is the one exception to the HTTPS-only requirement, because loopback traffic never leaves the machine.

#### REQ-CLI-003: Authorization Code Capture Window [MEDIUM]

**Requirement:** The CLI MUST minimize the window during which the local HTTP server accepts connections.

**Implementation:**
```
const CALLBACK_TIMEOUT_MS = 120000; // 2 minutes max
const server = http.createServer(handleCallback);
server.listen(0, '127.0.0.1');

const timeout = setTimeout(() => {
  server.close();
  reject(new Error('Authorization timeout -- user did not complete login'));
}, CALLBACK_TIMEOUT_MS);

function handleCallback(req, res) {
  clearTimeout(timeout);
  // Validate state, extract code
  // Respond with success page
  res.end('<html><body>Authentication successful. You may close this tab.</body></html>');
  server.close(); // Immediately shut down
}
```

### 12.3 CLI Token Storage

CLI applications cannot use HttpOnly cookies. Tokens must be stored on the filesystem. This section addresses secure storage options ranked by security strength.

#### Storage Option Comparison

| Option | Security | Cross-Platform | User Transparency | Recommended |
|--------|----------|----------------|-------------------|-------------|
| OS Keychain (via `keytar`) | HIGHEST | Windows/macOS/Linux | Token encrypted by OS | YES (primary) |
| Encrypted file (`~/.agent-studio/auth.enc`) | HIGH | All platforms | Token encrypted with derived key | YES (fallback) |
| Environment variable | MEDIUM | All platforms | Token visible to child processes | NO (only for CI/CD) |
| Plaintext file (`~/.agent-studio/auth.json`) | LOW | All platforms | Token readable by any process as user | NO |

#### REQ-CLI-004: OS Keychain Integration [HIGH]

**Primary storage:** Use the OS credential manager via `keytar` (or equivalent):
- **Windows:** Windows Credential Manager (DPAPI encryption)
- **macOS:** Keychain (hardware-backed on Apple Silicon)
- **Linux:** libsecret (GNOME Keyring / KWallet)

**Implementation:**
```
const keytar = require('keytar');

// Store tokens
await keytar.setPassword('agent-studio', 'refresh_token', encryptedRefreshToken);
await keytar.setPassword('agent-studio', 'access_token', accessToken);

// Retrieve tokens
const refreshToken = await keytar.getPassword('agent-studio', 'refresh_token');

// Delete tokens (logout)
await keytar.deletePassword('agent-studio', 'refresh_token');
await keytar.deletePassword('agent-studio', 'access_token');
```

**Graceful degradation:** If keytar is not available (headless Linux without libsecret), fall back to encrypted file storage with a warning to the user.

#### REQ-CLI-005: Encrypted File Storage (Fallback) [HIGH]

**When keytar is unavailable**, tokens MUST be stored in an encrypted file:

1. Derive encryption key from machine-specific entropy:
   - Machine ID (`/etc/machine-id` on Linux, `wmic csproduct get uuid` on Windows, `ioreg` on macOS)
   - Combined with a hardcoded salt (not secret, but adds entropy)
   - Key derivation: `PBKDF2(machine_entropy, salt, 100000, 32, 'sha256')`

2. Encrypt tokens with AES-256-GCM (authenticated encryption):
   - Random 12-byte IV per encryption
   - Store as: `{iv}:{authTag}:{ciphertext}` (base64-encoded)

3. File permissions:
   - POSIX: `chmod 600` (owner read/write only)
   - Windows: ACL restricted to current user

4. File location: `~/.agent-studio/auth.enc` (not inside the project directory)

**Important:** This is NOT a strong security boundary -- any process running as the same user can derive the same key. It primarily protects against casual exposure (e.g., if the file is accidentally shared).

#### REQ-CLI-006: Token Security in Memory [MEDIUM]

**Requirement:** Tokens MUST be handled carefully in process memory:

- Never log token values (use `[REDACTED]` placeholders)
- Clear token variables after use (set to `null`; V8 GC will reclaim)
- Do not pass tokens as command-line arguments (visible in process list via `ps aux`)
- Do not store tokens in environment variables that are inherited by child processes (use `process.env` carefully; unset after reading)
- Tokens in spawn prompts: NEVER include raw tokens in agent spawn prompts

### 12.4 Device Authorization Grant Security

#### REQ-CLI-007: Device Flow Polling Security [MEDIUM]

**Requirements for device authorization grant (RFC 8628):**

- Poll interval: respect `interval` parameter from authorization server (default 5 seconds)
- Handle `authorization_pending` status gracefully (continue polling)
- Handle `slow_down` status (increase interval by 5 seconds)
- Handle `expired_token` status (device code expired; restart flow)
- Handle `access_denied` status (user denied authorization)
- Device code MUST have short lifetime (typically 15-30 minutes)
- Display clear instructions: "Visit {url} and enter code: {user_code}"

**Phishing mitigation:**
- Display the verification URI prominently and WARN users to verify the domain
- Consider displaying a QR code for the verification URL (reduces typo risk)
- The user_code should be short and human-readable (8 characters, hyphenated: `ABCD-1234`)

### 12.5 CLI Session Management

#### REQ-CLI-008: Token Refresh on CLI Invocation [HIGH]

**Requirement:** The CLI MUST check token freshness on every invocation:

1. Read stored access token
2. Check expiration (with 30-second buffer)
3. If expired, attempt refresh using stored refresh token
4. If refresh fails (token revoked/expired), initiate new authorization flow
5. If refresh succeeds, store new tokens and proceed

**Implementation pattern:**
```
async function getValidAccessToken() {
  const accessToken = await tokenStore.getAccessToken();

  if (accessToken && !isExpired(accessToken, 30)) {
    return accessToken;
  }

  const refreshToken = await tokenStore.getRefreshToken();

  if (refreshToken) {
    try {
      const { access_token, refresh_token } = await refreshTokens(refreshToken);
      await tokenStore.setAccessToken(access_token);
      if (refresh_token) {
        await tokenStore.setRefreshToken(refresh_token); // Rotation
      }
      return access_token;
    } catch (err) {
      // Refresh failed -- initiate new login
      await tokenStore.clearAll();
      return await initiateLogin();
    }
  }

  // No tokens stored -- initiate new login
  return await initiateLogin();
}
```

#### REQ-CLI-009: CLI Logout [MEDIUM]

**Requirement:** `agent-studio logout` MUST:

1. Revoke refresh token at the authorization server (RFC 7009)
2. Delete all stored tokens (keychain + encrypted file)
3. Clear any in-memory token state
4. Display confirmation to user

---

## 13. Risk Matrix (Likelihood x Impact)

### Summary Risk Heat Map

```
                    Impact
                    LOW    MEDIUM   HIGH     CRITICAL
Likelihood  HIGH   D-003  D-001    S-003    T-001
                          D-002    E-003    I-001
                          R-001    S-005    I-002
                                            REQ-CLI-001

            MEDIUM        I-004    T-002    S-001
                          S-005    I-003    T-004
                                   I-005    E-001
                                   E-004    E-002
                                   R-002    T-005
                                   R-003

            LOW                    T-003    S-002

```

### Risk Categories

| Risk Level | Count | Action |
|------------|-------|--------|
| CRITICAL (High Likelihood x Critical Impact) | 4 | MUST fix before deployment; blocks release |
| HIGH (combination of High/Critical) | 10 | MUST fix before production; may not block beta |
| MEDIUM | 8 | SHOULD fix before production; scheduled for remediation |
| LOW | 3 | Nice-to-have; track for future improvement |

### Top 5 Risks (Prioritized)

1. **T-001 + REQ-AUTH-001: Authorization code interception without PKCE** -- CRITICAL. Mitigated by mandatory PKCE S256. This is the single most important security control.

2. **I-001 + I-002: Token exposure via storage/URLs** -- CRITICAL. Mitigated by OS keychain storage (CLI) and HttpOnly cookies (web). localStorage/URL parameters are absolutely forbidden.

3. **S-003 + E-003: Token theft leading to persistent access** -- HIGH. Mitigated by short-lived access tokens (<=15 min) and refresh token rotation with reuse detection.

4. **T-004 + REQ-AUTH-004: Redirect URI manipulation** -- CRITICAL. Mitigated by exact string matching. For CLI loopback, port is included in the match.

5. **REQ-CLI-001: Loopback server binding to non-local interface** -- CRITICAL for CLI. If the callback server binds to `0.0.0.0`, any machine on the local network can intercept the authorization code.

---

## 14. Mandatory vs. Recommended Controls Summary

### Mandatory (BLOCKING -- Must implement before any deployment)

| Control | Priority | OWASP | Description |
|---------|----------|-------|-------------|
| SEC-OAUTH-001 | P0 | A07 | PKCE enforcement (S256, no downgrade) |
| SEC-OAUTH-002 | P0 | A02 | JWT algorithm whitelist (RS256/ES256 only) |
| SEC-OAUTH-003 | P0 | A02 | Secure token storage (keychain + encrypted file for CLI) |
| SEC-OAUTH-004 | P1 | A01 | Exact redirect URI matching |
| SEC-OAUTH-005 | P1 | A07 | Refresh token rotation with reuse detection |
| SEC-OAUTH-006 | P1 | A07 | Rate limiting on auth endpoints |
| SEC-OAUTH-007 | P1 | A01 | CSRF state parameter |
| SEC-OAUTH-008 | P1 | A01 | Server-side scope enforcement |
| REQ-CLI-001 | P0 | A05 | Loopback-only callback server (127.0.0.1) |
| REQ-CLI-004 | P1 | A02 | OS keychain for token storage |

### Recommended (SHOULD-HAVE -- Implement before production)

| Control | Priority | OWASP | Description |
|---------|----------|-------|-------------|
| SEC-OAUTH-009 | P1 | A09 | Structured audit logging |
| SEC-OAUTH-010 | P2 | A05 | Security headers (HSTS, CSP) |
| SEC-OAUTH-011 | P2 | A07 | Error message safety (no user enumeration) |
| SEC-OAUTH-012 | P2 | A01 | Token revocation endpoint (RFC 7009) |
| SEC-OAUTH-013 | P2 | A02 | Key rotation (90-day cycle) |
| SEC-OAUTH-014 | P2 | A03 | OAuth parameter input validation |
| REQ-CLI-005 | P2 | A02 | Encrypted file fallback storage |
| REQ-CLI-007 | P2 | A07 | Device flow polling security |
| REQ-CLI-008 | P1 | A07 | Token refresh on CLI invocation |
| REQ-CLI-009 | P2 | A01 | Secure CLI logout with token revocation |

---

**End of Security Review**

**Next Steps:**
1. Implementation team incorporates all SEC-OAUTH and REQ-CLI controls as acceptance criteria
2. Security architect reviews implementation before merge (Gate 2 enforcement)
3. Penetration testing after implementation (Section 7.4 checklist)
4. Compliance review before production deployment (Section 8)
5. CLI-specific testing: loopback binding verification, keychain integration smoke tests, encrypted file permissions validation
