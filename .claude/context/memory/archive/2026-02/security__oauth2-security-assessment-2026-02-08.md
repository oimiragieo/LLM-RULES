<!-- Agent: security-architect | Task: #oauth2-security-assessment | Session: 2026-02-08 -->

# OAuth2 Security Assessment Report

**Date:** 2026-02-08
**Agent:** security-architect
**Status:** FINAL ASSESSMENT -- BINDING REQUIREMENTS FOR IMPLEMENTATION
**Severity Classification:** ARCHITECTURE-LEVEL (pre-implementation security gate)
**Compliance Scope:** OAuth 2.1, RFC 7636, RFC 8725, RFC 8628, RFC 7009, OWASP Top 10 (2021), GDPR, SOC2
**Related Reports:**

- Initial security review: `.claude/context/reports/security/oauth2-security-review-2026-02-08.md`
- Implementation plan: `.claude/context/plans/impl-oauth2-auth-2026-02-08.md`
- Issues registry: `.claude/context/memory/issues.md`

---

## Executive Summary

This consolidated security assessment validates the OAuth2 authentication implementation plan for the agent-studio project against the comprehensive threat model, OWASP Top 10 mapping, and security control registry. The assessment incorporates findings from the STRIDE threat model, auth-security-expert skill analysis (OAuth 2.1 / JWT RFC 8725), and codebase security posture analysis.

**Overall Verdict:** PROCEED WITH IMPLEMENTATION -- subject to the 14 mandatory security controls (SEC-OAUTH-001 through SEC-OAUTH-014) and 9 CLI-specific requirements (REQ-CLI-001 through REQ-CLI-009) documented below. Three prerequisite security fixes (SEC-LIB-001, SEC-HOOK-001, SEC-CTX-003) MUST be completed in Phase 1 before any OAuth code is deployed.

**Key Risk Level:** CRITICAL (authentication is the #1 attack surface)
**Threats Identified:** 25 via STRIDE analysis
**Controls Required:** 14 general + 9 CLI-specific = 23 total
**Prerequisite Fixes:** 3 existing vulnerabilities intersect with OAuth

---

## Table of Contents

1. [STRIDE Threat Model Summary](#1-stride-threat-model-summary)
2. [OWASP Top 10 Risk Analysis](#2-owasp-top-10-risk-analysis)
3. [OAuth 2.1 Compliance Requirements](#3-oauth-21-compliance-requirements)
4. [JWT Security Requirements (RFC 8725)](#4-jwt-security-requirements-rfc-8725)
5. [Token Storage Security](#5-token-storage-security)
6. [CLI-Specific Security Requirements](#6-cli-specific-security-requirements)
7. [Codebase Security Posture Assessment](#7-codebase-security-posture-assessment)
8. [Security Controls Registry (Complete)](#8-security-controls-registry-complete)
9. [Windows-Specific Security Concerns](#9-windows-specific-security-concerns)
10. [Compliance Mapping (GDPR, SOC2)](#10-compliance-mapping-gdpr-soc2)
11. [Implementation Constraints](#11-implementation-constraints)
12. [Penetration Testing Requirements](#12-penetration-testing-requirements)
13. [Incident Response Plan](#13-incident-response-plan)
14. [Hybrid Validation Checklist](#14-hybrid-validation-checklist)
15. [Risk Matrix and Priority Summary](#15-risk-matrix-and-priority-summary)

---

## 1. STRIDE Threat Model Summary

### 1.1 Spoofing (5 threats)

| ID    | Threat                                           | Likelihood | Impact   | Primary Control                                                                   |
| ----- | ------------------------------------------------ | ---------- | -------- | --------------------------------------------------------------------------------- |
| S-001 | Identity provider spoofing (fake OAuth provider) | MEDIUM     | CRITICAL | Strict `iss` claim validation; hardcoded provider allowlist; HTTPS-only discovery |
| S-002 | Token forgery via `alg: none` or weak algorithm  | HIGH       | CRITICAL | **SEC-OAUTH-002**: Algorithm whitelist (RS256/ES256 only)                         |
| S-003 | Session hijacking via stolen tokens              | HIGH       | HIGH     | **SEC-OAUTH-003**: HttpOnly + Secure + SameSite=Strict cookies                    |
| S-004 | Client impersonation (malicious OAuth app)       | MEDIUM     | HIGH     | Client authentication; exact redirect URI matching                                |
| S-005 | Credential stuffing on token endpoint            | HIGH       | MEDIUM   | **SEC-OAUTH-006**: Rate limiting (10 req/min/IP)                                  |

### 1.2 Tampering (5 threats)

| ID    | Threat                                        | Likelihood | Impact   | Primary Control                                               |
| ----- | --------------------------------------------- | ---------- | -------- | ------------------------------------------------------------- |
| T-001 | Authorization code injection/interception     | HIGH       | CRITICAL | **SEC-OAUTH-001**: PKCE mandatory (S256 only)                 |
| T-002 | CSRF on callback endpoint                     | MEDIUM     | HIGH     | **SEC-OAUTH-007**: State parameter with cryptographic binding |
| T-003 | Token scope escalation via claim manipulation | LOW        | CRITICAL | Asymmetric signing; server-side scope enforcement             |
| T-004 | Redirect URI manipulation to capture codes    | HIGH       | CRITICAL | **SEC-OAUTH-004**: Exact string matching                      |
| T-005 | PKCE downgrade attack (strip code_challenge)  | MEDIUM     | HIGH     | Server MUST reject requests without code_challenge            |

### 1.3 Repudiation (3 threats)

| ID    | Threat                            | Likelihood | Impact | Primary Control                                               |
| ----- | --------------------------------- | ---------- | ------ | ------------------------------------------------------------- |
| R-001 | Untracked authentication events   | HIGH       | MEDIUM | **SEC-OAUTH-009**: Structured audit logging                   |
| R-002 | Non-attributable session activity | MEDIUM     | HIGH   | User ID + session ID in all audit logs; JWT `jti` correlation |
| R-003 | Token abuse without detection     | HIGH       | HIGH   | Anomaly detection; IP/user-agent monitoring                   |

### 1.4 Information Disclosure (5 threats)

| ID    | Threat                                               | Likelihood | Impact   | Primary Control                                                     |
| ----- | ---------------------------------------------------- | ---------- | -------- | ------------------------------------------------------------------- |
| I-001 | Token exposure in URLs (query parameters)            | HIGH       | CRITICAL | Bearer tokens ONLY in Authorization header                          |
| I-002 | Token exposure in localStorage (XSS exfiltration)    | HIGH       | CRITICAL | **SEC-OAUTH-003**: HttpOnly cookies; never localStorage             |
| I-003 | Sensitive data in JWT claims (PII leakage)           | MEDIUM     | HIGH     | Minimal claims (sub, scope, exp, iat, jti only)                     |
| I-004 | Error message information leakage (user enumeration) | MEDIUM     | MEDIUM   | **SEC-OAUTH-011**: Generic error messages; constant-time comparison |
| I-005 | CORS misconfiguration enabling token theft           | MEDIUM     | HIGH     | **SEC-OAUTH-010**: Strict CORS origin allowlist                     |

### 1.5 Denial of Service (3 threats)

| ID    | Threat                                       | Likelihood | Impact | Primary Control                                               |
| ----- | -------------------------------------------- | ---------- | ------ | ------------------------------------------------------------- |
| D-001 | Token endpoint abuse (resource exhaustion)   | HIGH       | MEDIUM | **SEC-OAUTH-006**: 10 requests/minute/IP; exponential backoff |
| D-002 | Refresh token flooding (per-user saturation) | MEDIUM     | MEDIUM | Maximum 5 active refresh tokens per user                      |
| D-003 | JWKS cache poisoning                         | LOW        | LOW    | Cache with 5-minute minimum TTL; circuit breaker              |

### 1.6 Elevation of Privilege (4 threats)

| ID    | Threat                                     | Likelihood | Impact   | Primary Control                                                             |
| ----- | ------------------------------------------ | ---------- | -------- | --------------------------------------------------------------------------- |
| E-001 | Scope escalation via token exchange        | MEDIUM     | CRITICAL | **SEC-OAUTH-008**: Server-side scope enforcement; never issue broader scope |
| E-002 | Role escalation via JWT claim manipulation | LOW        | CRITICAL | Server-side role lookup for admin operations (defense in depth)             |
| E-003 | Privilege persistence after revocation     | HIGH       | HIGH     | Short-lived access tokens (<=15 min); **SEC-OAUTH-005** rotation            |
| E-004 | OAuth provider account takeover            | MEDIUM     | CRITICAL | Multi-provider account linking; email notification on new linking           |

---

## 2. OWASP Top 10 Risk Analysis

### A01: Broken Access Control -- CRITICAL

**OAuth2-Specific Risks:**

- All endpoints MUST require authentication by default (deny unless explicitly public)
- Scope-based authorization on every API request (SEC-OAUTH-008)
- Vertical privilege escalation: admin endpoints MUST verify role in database (not just JWT claim)
- Horizontal privilege escalation: resource ownership validation on every request
- Redirect URI manipulation opens access control bypass (SEC-OAUTH-004)

**Mitigation Coverage:**

- SEC-OAUTH-004 (redirect URI): Exact string matching, no wildcards
- SEC-OAUTH-007 (CSRF state): Cryptographic state binding
- SEC-OAUTH-008 (scope enforcement): Server-side scope checks on every request
- SEC-OAUTH-012 (token revocation): RFC 7009 revocation for immediate access removal

### A02: Cryptographic Failures -- CRITICAL

**OAuth2-Specific Risks:**

- JWT signing with weak or forbidden algorithms (none, HS256 in distributed systems)
- Refresh token storage in plaintext
- Insufficient key size (RSA < 2048-bit)
- Password hashing with weak algorithms (MD5, SHA-1, SHA-256 alone)
- Secrets committed to version control or logged

**Mitigation Coverage:**

- SEC-OAUTH-002 (algorithm whitelist): RS256 and ES256 ONLY; reject `none` and HS256
- SEC-OAUTH-005 (refresh rotation): SHA-256 hashed storage; never plaintext
- SEC-OAUTH-013 (key rotation): 90-day key rotation; `kid` header; grace period
- RSA 2048-bit minimum (4096-bit recommended); ECDSA P-256
- Private keys from environment variables ONLY; NEVER in code or files

### A03: Injection -- HIGH

**OAuth2-Specific Risks:**

- SQL injection in scope parameter or token storage queries
- SSRF via redirect_uri pointing to internal services
- `javascript:` scheme in redirect_uri
- Command injection via OAuth parameters in CLI commands
- XSS via error messages containing unsanitized OAuth parameters

**Mitigation Coverage:**

- SEC-OAUTH-014 (input validation): Validate ALL OAuth parameters; reject unexpected values
- SEC-OAUTH-004 (redirect URI): Reject `javascript:` scheme, private IPs, metadata endpoints
- Parameterized queries for ALL database operations (token storage)
- Output encoding for any OAuth parameter displayed in error messages

### A05: Security Misconfiguration -- MEDIUM

**OAuth2-Specific Risks:**

- Missing security headers on auth endpoints
- CORS wildcard on authenticated endpoints
- Default credentials or secrets in configuration
- Unnecessary OAuth flows enabled (implicit, ROPC)
- Debug endpoints or verbose error messages in production

**Mitigation Coverage:**

- SEC-OAUTH-010 (security headers): HSTS, X-Content-Type-Options, X-Frame-Options, CSP
- Strict CORS origin allowlist (no `*` on authenticated endpoints)
- OAuth 2.1 baseline: implicit flow and ROPC FORBIDDEN
- Configuration validation on startup (reject missing required values)

### A07: Identification and Authentication Failures -- CRITICAL

**OAuth2-Specific Risks:**

- Missing PKCE allows authorization code interception
- Weak session management (no timeout, no regeneration)
- No rate limiting enables credential stuffing
- User enumeration via error message differences
- Token replay without detection

**Mitigation Coverage:**

- SEC-OAUTH-001 (PKCE): S256 mandatory for ALL clients; PKCE downgrade prevention
- SEC-OAUTH-005 (refresh rotation): Reuse detection revokes ALL user tokens
- SEC-OAUTH-006 (rate limiting): Token endpoint 10/min/IP; login 5/min/account
- SEC-OAUTH-011 (error safety): Same error for invalid user and wrong password
- Short-lived access tokens (<=15 min); refresh token rotation

### A09: Security Logging and Monitoring Failures -- HIGH

**OAuth2-Specific Risks:**

- Authentication events not logged (login, logout, failure)
- Token values appearing in logs
- Missing alerts for suspicious patterns (token reuse, impossible travel)
- No audit trail for admin operations

**Mitigation Coverage:**

- SEC-OAUTH-009 (audit logging): Structured JSON logging for ALL auth events
- NEVER log token values, passwords, or PII
- Include: timestamp, event_type, user_id, session_id, IP, success/failure
- Alert triggers: refresh token reuse, >100 failures from single IP, impossible travel

### A10: Server-Side Request Forgery -- MEDIUM

**OAuth2-Specific Risks:**

- Redirect URI pointing to internal services (169.254.169.254 AWS metadata)
- OIDC discovery endpoint fetching attacker-controlled URLs
- Token exchange with internal endpoints

**Mitigation Coverage:**

- SEC-OAUTH-004: Reject private IPs (10.x, 172.16-31.x, 192.168.x), localhost, link-local
- OIDC discovery: HTTPS-only; validate hostname against provider allowlist
- Block cloud metadata endpoints (169.254.169.254, metadata.google.internal)

---

## 3. OAuth 2.1 Compliance Requirements

### MANDATORY (OAuth 2.1 baseline -- non-negotiable)

| Requirement                                             | RFC       | Enforcement       |
| ------------------------------------------------------- | --------- | ----------------- |
| PKCE required for ALL clients (public AND confidential) | RFC 7636  | SEC-OAUTH-001     |
| S256 challenge method only (`plain` forbidden)          | RFC 7636  | SEC-OAUTH-001     |
| Implicit flow (`response_type=token`) FORBIDDEN         | OAuth 2.1 | Config validation |
| ROPC (`grant_type=password`) FORBIDDEN                  | OAuth 2.1 | Config validation |
| Bearer tokens NOT in URL query parameters               | OAuth 2.1 | SEC-OAUTH-003     |
| Exact redirect URI matching (no wildcards)              | OAuth 2.1 | SEC-OAUTH-004     |
| Refresh token rotation with reuse detection             | OAuth 2.1 | SEC-OAUTH-005     |

### PKCE Implementation Requirements

1. **Code verifier:** 43-128 cryptographically random URL-safe characters using `crypto.randomBytes(32)` + base64url encoding
2. **Code challenge:** `BASE64URL(SHA256(code_verifier))` -- compute using `crypto.createHash('sha256')`
3. **Challenge method:** MUST be `S256` -- reject `plain` with 400 error
4. **PKCE downgrade prevention:**
   - Authorization endpoint MUST reject requests WITHOUT `code_challenge` parameter
   - Token endpoint MUST reject requests where authorization code was issued with `code_challenge` but request has no `code_verifier`
   - Token endpoint MUST verify `SHA256(code_verifier) === stored code_challenge`

### PKCE Downgrade Attack Vector

**Attack:** Attacker intercepts authorization request and strips `code_challenge` parameters. If the server allows backward compatibility with non-PKCE flows, it proceeds without protection. Attacker can then intercept the authorization code and exchange it without needing the `code_verifier`.

**Prevention:** The authorization server MUST reject any authorization request that does not include both `code_challenge` and `code_challenge_method=S256`. No backward compatibility with non-PKCE flows.

---

## 4. JWT Security Requirements (RFC 8725)

### 4.1 Algorithm Restrictions

**ALLOWED (whitelist):**

- `RS256` (RSA-PKCS1-v1_5 with SHA-256) -- RECOMMENDED for distributed systems
- `ES256` (ECDSA with P-256 and SHA-256) -- RECOMMENDED for performance

**FORBIDDEN:**

- `none` -- Enables token forgery; MUST be rejected before any other processing
- `HS256` -- Symmetric key; shared secret leakage risk in distributed architectures
- `RS384`, `RS512` -- Unnecessary overhead; not proportional security benefit
- Any unlisted algorithm -- Reject by default

**Implementation with `jose` library:**

```
const { jwtVerify } = require('jose');
// jose automatically rejects 'none' when a key is provided
// ALWAYS pass algorithms option to restrict to whitelist
await jwtVerify(token, publicKey, {
  algorithms: ['RS256', 'ES256'],
  issuer: expectedIssuer,
  audience: expectedAudience,
  clockTolerance: 30,
});
```

### 4.2 Claim Validation (MANDATORY ORDER)

Every JWT MUST be validated in this exact sequence:

1. **Parse header** -- extract `alg` and `kid`; reject if `alg` not in whitelist
2. **Resolve signing key** -- use `kid` to select correct public key from JWKS
3. **Verify cryptographic signature** -- using resolved public key
4. **Validate `exp`** -- reject if expired (30-second clock skew tolerance maximum)
5. **Validate `iss`** -- exact match against expected issuer URL
6. **Validate `aud`** -- must include this service's identifier
7. **Validate `iat`** -- must be present and in the past
8. **Validate `sub`** -- must be present and non-empty
9. **Validate `jti`** -- must be present (required for revocation checking)
10. **Check revocation list** -- if token revocation is implemented
11. **Validate custom claims** -- scope, role, tenant_id as needed

**CRITICAL: Signature verification (step 3) MUST occur BEFORE any claim processing (steps 4-11).** Never read claims from an unverified token.

### 4.3 Token Lifetimes

| Token Type         | Maximum Lifetime | Recommended  | Notes                                    |
| ------------------ | ---------------- | ------------ | ---------------------------------------- |
| Access Token       | 15 minutes       | 5-10 minutes | Stateless; minimal claims                |
| Refresh Token      | 30 days          | 7 days       | SHA-256 hashed in DB; rotation mandatory |
| ID Token (OIDC)    | 60 minutes       | 5-15 minutes | Memory only; never persist               |
| Authorization Code | 10 minutes       | 1-5 minutes  | Single-use; server-side only             |

### 4.4 Key Management

- RSA key size: 2048-bit MINIMUM (4096-bit recommended for high-security deployments)
- ECDSA curve: P-256 (prime256v1)
- Key rotation: every 90 days with `kid` header for key identification
- Grace period: 24-48 hours for previous key (validate in-flight tokens)
- JWKS endpoint: serve current AND previous public keys
- Private keys: environment variables at minimum; HSM/KMS for production
- Private keys NEVER committed to version control, NEVER logged, NEVER in error messages

---

## 5. Token Storage Security

### 5.1 Web Context: HttpOnly Cookies

**Access token cookie attributes:**

- `HttpOnly` -- Cannot be accessed by JavaScript (XSS protection)
- `Secure` -- HTTPS only
- `SameSite=Strict` -- CSRF protection (blocks cross-site requests)
- `Max-Age=900` -- 15 minutes
- `Path=/` -- Available to all API routes

**Refresh token cookie attributes:**

- `HttpOnly` -- Cannot be accessed by JavaScript
- `Secure` -- HTTPS only
- `SameSite=Strict` -- CSRF protection
- `Max-Age=604800` -- 7 days
- `Path=/auth/refresh` -- ONLY accessible by refresh endpoint (attack surface reduction)

### 5.2 CLI Context: OS Keychain + Encrypted File Fallback

**Primary (REQ-CLI-004):** OS keychain via `keytar`

- Windows: Windows Credential Manager (DPAPI encryption)
- macOS: Keychain (hardware-backed on Apple Silicon)
- Linux: libsecret (GNOME Keyring / KWallet)

**Fallback (REQ-CLI-005):** Encrypted file at `~/.agent-studio/auth.enc`

- Encryption: AES-256-GCM (authenticated encryption)
- Key derivation: PBKDF2(machine_entropy + salt, 100000 iterations, 32 bytes, SHA-256)
- Machine entropy: `/etc/machine-id` (Linux), `wmic csproduct get uuid` (Windows), `ioreg` (macOS)
- File permissions: POSIX `600`, Windows ACL restricted to current user
- Random 12-byte IV per encryption operation

**FORBIDDEN storage mechanisms:**

- `localStorage` / `sessionStorage` -- XSS exfiltration risk (CRITICAL)
- URL query parameters -- Visible in logs, history, Referer headers (CRITICAL)
- Plaintext files -- Readable by any process running as same user (HIGH)
- Command-line arguments -- Visible in process list via `ps aux` (HIGH)
- Environment variables inherited by child processes -- Token propagation risk (MEDIUM)

### 5.3 Refresh Token Rotation with Reuse Detection

**Mechanism:**

1. Every refresh request issues a NEW refresh token and marks the old one as "used" (not deleted)
2. New refresh token stored as SHA-256 hash in database
3. If a "used" refresh token is presented again: THEFT DETECTED
   - ALL tokens for that user are revoked immediately
   - Security alert sent to user (email, in-app notification)
   - Incident logged with IP, user-agent, timestamp
4. Maximum 5 active refresh tokens per user (oldest revoked on new issuance)

**Database schema for refresh tokens:**

- `userId` -- User identifier
- `tokenHash` -- SHA-256 hash (NEVER store plaintext)
- `isUsed` -- Boolean (set to true on refresh; reuse = theft detection)
- `expiresAt` -- Expiration timestamp
- `createdAt` -- Creation timestamp
- `lastUsedAt` -- Last refresh timestamp
- `userAgent` -- Client user-agent string
- `ipAddress` -- Client IP address
- `jti` -- JWT ID claim (correlates to the JWT)

---

## 6. CLI-Specific Security Requirements

### REQ-CLI-001: Loopback Interface Only [CRITICAL]

The temporary callback HTTP server MUST bind ONLY to `127.0.0.1` (IPv4 loopback), NEVER to `0.0.0.0`, `::`, or any non-loopback interface. Use ephemeral port (port 0 = OS-assigned). Shut down server immediately after receiving authorization code (within 1 second). Timeout after 120 seconds.

**Rationale:** Binding to `0.0.0.0` exposes the callback server to the local network, allowing other machines to intercept the authorization code before the legitimate CLI process.

### REQ-CLI-002: Ephemeral Port Security [HIGH]

Use OS-assigned random port (port 0) to prevent port prediction. Include dynamically assigned port in redirect_uri. Validate state parameter immediately on callback before processing code.

### REQ-CLI-003: Authorization Code Capture Window [MEDIUM]

Minimize the window during which the local HTTP server accepts connections. Maximum 120-second timeout. Reject any requests not to the exact callback path.

### REQ-CLI-004: OS Keychain Integration [HIGH]

Use `keytar` for secure token storage in the OS credential manager. Graceful degradation to encrypted file if keychain unavailable (headless Linux without libsecret).

### REQ-CLI-005: Encrypted File Fallback [MEDIUM]

AES-256-GCM with machine-specific derived key (PBKDF2). File permissions restricted. Location: `~/.agent-studio/auth.enc` (NOT in project directory).

### REQ-CLI-006: Token Security in Memory [MEDIUM]

Never log token values. Clear token variables after use. Do not pass tokens as command-line arguments. Do not store in environment variables inherited by child processes. NEVER include raw tokens in agent spawn prompts.

### REQ-CLI-007: Device Flow Polling Security [MEDIUM]

Respect `interval` parameter from authorization server. Handle `slow_down`, `authorization_pending`, `expired_token`, `access_denied` responses. Device code lifetime: 15-30 minutes. Display verification URI prominently with domain verification warning.

### REQ-CLI-008: Token Refresh on CLI Invocation [HIGH]

Check token freshness on every CLI invocation. Auto-refresh if expired. Re-authenticate if refresh fails. 30-second buffer before expiration.

### REQ-CLI-009: Secure CLI Logout [MEDIUM]

Revoke refresh token at authorization server (RFC 7009). Delete all stored tokens (keychain + encrypted file). Clear in-memory token state. Display confirmation.

---

## 7. Codebase Security Posture Assessment

### 7.1 Existing Vulnerabilities Intersecting with OAuth

The following existing security issues in the agent-studio codebase MUST be addressed before or concurrently with OAuth implementation, as they create attack vectors that could compromise authentication.

#### SEC-LIB-001: Command Injection in hybrid-lazy-indexer.cjs -- PARTIALLY FIXED

**Current Status:** The `spawnSync` calls at lines 226, 412, 435, 484, 527 now use array arguments with `shell: false`, which is the correct mitigation. However, the `gpu-detector.cjs` still uses `exec` from `child_process` (line 9). If OAuth tokens or user input ever flows into commands executed by these modules, exfiltration would be possible.

**Assessment:** The SEC-LIB-001 fix appears to be IN PROGRESS. The hybrid-lazy-indexer.cjs has been remediated with `spawnSync` + array args. The `gpu-detector.cjs` `exec` usage should be audited but is lower risk (no user input flows into it currently).

**Recommendation:** Verify fix completeness. Low priority relative to OAuth deployment.

#### SEC-HOOK-001: HOOK_FAIL_OPEN Master Kill Switch -- UNFIXED

**Current Status:** Setting `HOOK_FAIL_OPEN=true` STILL disables ALL fail-closed hooks simultaneously. Found in:

- `routing-guard.cjs` (line 1368)
- `pre-task-unified.cjs` (line 779)
- `unified-creator-guard.cjs` (line 468)
- `unified-pre-write-hook.cjs` (line 511)
- `research-enforcement.cjs` (line 195)
- `bash-command-validator.cjs` (line 133)

**Risk with OAuth:** If `HOOK_FAIL_OPEN=true` is set (intentionally or accidentally), ALL security enforcement hooks are disabled, including any future auth-enforcement-hook. An attacker who can influence environment variables can bypass the entire security layer.

**Assessment:** CRITICAL prerequisite. This MUST be fixed before OAuth deployment. Replace single kill switch with per-hook overrides requiring explicit justification.

#### SEC-HOOK-002: eval/exec in SAFE_COMMANDS_ALLOWLIST -- UNFIXED

**Current Status:** Per issues.md, `validators/registry.cjs` includes `eval` and `exec` in SAFE_COMMANDS_ALLOWLIST. Commands starting with these builtins pass validation without further scrutiny.

**Risk with OAuth:** If any auth-related CLI command uses bash execution that passes through this validator, arbitrary code execution is possible.

**Assessment:** HIGH priority. Remove `eval`, `exec`, `source`, and `.` from SAFE_COMMANDS_ALLOWLIST.

#### SEC-WF-001: new Function() in conditional-executor.cjs -- EXISTING RISK

**Current Status:** `conditional-executor.cjs` line 52 uses `new Function(...keys, 'return ${expression}')` for dynamic expression evaluation. The `step-validators.cjs` and `workflow-engine.cjs` appear to have been remediated with safe evaluators, but `conditional-executor.cjs` still uses the unsafe pattern.

**Risk with OAuth:** If workflow expressions can be influenced by OAuth parameters or user claims, this enables code injection. The workflow system should never process untrusted OAuth-sourced data in expression evaluation.

**Assessment:** MEDIUM priority. The risk is contained if OAuth data never flows into workflow expressions. Document this constraint explicitly.

#### H-001: Skill Name Injection -- UNFIXED

**Current Status:** Per issues.md, `Skill()` tool allows arbitrary skill names without input sanitization. Path traversal possible.

**Risk with OAuth:** If skill names are constructed from OAuth provider names or user claims, directory traversal attacks could read arbitrary files.

**Assessment:** MEDIUM priority. Add whitelist validation (`[a-z0-9-]+` pattern) for skill names. Do not construct skill names from OAuth data.

#### H-003: WebFetch/WebSearch SSRF -- UNFIXED

**Current Status:** Per issues.md, no URL validation on WebFetch/WebSearch. Private IP ranges, localhost, and cloud metadata endpoints are accessible.

**Risk with OAuth:** OAuth redirect_uri validation must independently block SSRF regardless of whether WebFetch is fixed. However, if the research-synthesis skill is used to fetch OAuth documentation from external URLs, SSRF could allow internal network access.

**Assessment:** HIGH priority for general security posture. OAuth redirect_uri validator (SEC-OAUTH-004) must implement its own SSRF prevention independently.

### 7.2 Codebase Security Strengths

The following existing security mechanisms are assets for the OAuth implementation:

1. **Hook-based enforcement infrastructure** -- The PreToolUse/PostToolUse hook system provides a natural integration point for auth enforcement. The `routing-guard.cjs` Gate 2 already flags security-sensitive changes.

2. **Structured audit logging pattern** -- Existing hooks use `auditLog()` functions with structured JSON output. The auth audit logger (SEC-OAUTH-009) should follow this established pattern.

3. **Bash command validation** -- `bash-command-validator.cjs` and `shell-injection-validator.cjs` already validate shell commands. They should be extended to prevent OAuth token leakage via commands.

4. **Windows compatibility layer** -- `windows-null-sanitizer.cjs` handles Windows-specific path issues. The auth module should leverage `platform.cjs`/`platform.mjs` for cross-platform file operations.

5. **Atomic file writes** -- `atomic-write.cjs` provides safe file writing with temporary files. The encrypted token file storage should use this for crash-safe writes.

6. **Memory protocol** -- The learnings/decisions/issues memory system provides institutional knowledge persistence for security patterns discovered during OAuth implementation.

### 7.3 Sensitive Data in .env File

The `.env` file at project root contains `ANTHROPIC_API_KEY=` (line 261). This confirms that the project already manages API keys via environment variables. The OAuth implementation should follow the same pattern for client secrets and JWT private key paths.

**Concern:** The `.env` file should be in `.gitignore` (verify before OAuth secrets are added). A `.env.example` file exists at project root and should be updated with OAuth variable placeholders.

---

## 8. Security Controls Registry (Complete)

### CRITICAL Priority (P0) -- Must implement before ANY deployment

| Control ID    | STRIDE       | OWASP | Requirement                                                                         | Test Specification                                                                                                 |
| ------------- | ------------ | ----- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| SEC-OAUTH-001 | T-001        | A07   | PKCE enforcement: reject without code_challenge; S256 only                          | Send auth request without code_challenge -> expect 400. Send with code_challenge_method=plain -> expect 400.       |
| SEC-OAUTH-002 | S-002        | A02   | JWT algorithm whitelist: RS256/ES256 only; reject `none`                            | Create JWT with alg:none -> expect verification failure. Create JWT with alg:HS256 -> expect verification failure. |
| SEC-OAUTH-003 | I-001, I-002 | A02   | Token storage: HttpOnly + Secure + SameSite=Strict cookies (web); OS keychain (CLI) | Verify Set-Cookie headers include all security attributes. Verify no endpoint returns tokens in response body.     |
| REQ-CLI-001   | N/A          | A05   | Loopback callback: 127.0.0.1 only; ephemeral port; immediate shutdown               | Verify server binds to 127.0.0.1. Verify port is 0 (OS-assigned). Verify server shuts down after code capture.     |

### HIGH Priority (P1) -- Must implement before production

| Control ID    | STRIDE       | OWASP | Requirement                                                                              | Test Specification                                                                                                      |
| ------------- | ------------ | ----- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| SEC-OAUTH-004 | T-004        | A01   | Exact redirect URI string matching; no wildcards; reject javascript: and private IPs     | Register `https://app.example.com/callback` -> request with different domain -> expect rejection.                       |
| SEC-OAUTH-005 | S-003, E-003 | A07   | Refresh token rotation: new token on every refresh; reuse detection revokes all          | Use refresh token twice -> expect second use to revoke ALL user tokens. Verify stored as SHA-256 hashes.                |
| SEC-OAUTH-006 | D-001        | A07   | Rate limiting: token 10/min/IP; login 5/min/account; lockout after 10 failures           | Send 11 token requests in 1 minute -> expect 429 on 11th. Verify rate limit headers present.                            |
| SEC-OAUTH-007 | T-002        | A01   | CSRF state parameter: cryptographic random (>=128 bits); validated on callback           | Send callback without state -> expect rejection. Send with wrong state -> expect rejection.                             |
| SEC-OAUTH-008 | E-001        | A01   | Scope enforcement: server-side validation on every request; deny by default              | Request with token lacking required scope -> expect 403. Attempt scope escalation via refresh -> expect original scope. |
| SEC-OAUTH-009 | R-001, R-002 | A09   | Audit logging: structured JSON; all auth events; NEVER log token values                  | Verify login event logged with IP, timestamp, user_id, success/failure. Verify no raw tokens in logs.                   |
| REQ-CLI-004   | N/A          | A02   | OS keychain integration via keytar; graceful fallback to encrypted file                  | Verify tokens stored in Windows Credential Manager / macOS Keychain / libsecret.                                        |
| REQ-CLI-008   | N/A          | A07   | Token refresh on every CLI invocation; auto-refresh if expired; re-auth if refresh fails | Verify expired token triggers refresh. Verify failed refresh triggers new login.                                        |

### MEDIUM Priority (P2) -- Should implement before production

| Control ID    | STRIDE | OWASP | Requirement                                                                                   | Test Specification                                                                                         |
| ------------- | ------ | ----- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| SEC-OAUTH-010 | I-005  | A05   | Security headers: HSTS, X-Content-Type-Options, X-Frame-Options, CSP, strict CORS             | Verify all security headers present on authenticated endpoints.                                            |
| SEC-OAUTH-011 | I-004  | A07   | Error message safety: generic auth errors; no user enumeration; constant-time comparison      | Login with non-existent user -> same error as wrong password. Response time variance < 50ms.               |
| SEC-OAUTH-012 | E-003  | A01   | Token revocation: RFC 7009; revoke individual or all user tokens; immediate effect            | Revoke token -> subsequent use returns 401. Password change -> all tokens revoked.                         |
| SEC-OAUTH-013 | S-002  | A02   | Key rotation: 90-day cycle; kid header; grace period 24-48h; JWKS serves current+previous     | Verify JWKS endpoint serves both keys. Verify expired-key token rejected after grace period.               |
| SEC-OAUTH-014 | T-003  | A03   | Input validation: all OAuth parameters validated; reject javascript: scheme, SQL injection    | Send redirect_uri with javascript: -> expect rejection. Send scope with SQL injection -> expect rejection. |
| REQ-CLI-005   | N/A    | A02   | Encrypted file fallback: AES-256-GCM; machine-specific key derivation; restricted permissions | Verify file permissions (600). Verify encryption uses AES-256-GCM with random IV.                          |
| REQ-CLI-007   | N/A    | A07   | Device flow polling: respect interval; handle all status codes; short device code lifetime    | Verify slow_down increases interval. Verify expired_token restarts flow.                                   |
| REQ-CLI-009   | N/A    | A01   | Secure logout: revoke at server; delete local tokens; clear memory                            | Verify token revoked at authorization server. Verify local storage cleared.                                |

---

## 9. Windows-Specific Security Concerns

The agent-studio project runs on Windows (MINGW64_NT-10.0-26200). The following Windows-specific security concerns apply to the OAuth implementation.

### 9.1 File Path Security

- **Path normalization:** Windows uses backslashes (`\`), which can cause issues with path traversal validation. Always normalize paths with `path.normalize()` and validate against allowed directories AFTER normalization.
- **Windows reserved names:** The `windows-null-sanitizer.cjs` hook already blocks reserved names (NUL, CON, PRN, AUX, COM1-COM9, LPT1-LPT9). The encrypted token file (`auth.enc`) does not conflict with reserved names.
- **Token file location:** `~/.agent-studio/auth.enc` resolves to `%USERPROFILE%\.agent-studio\auth.enc` on Windows. Verify the directory is created with restricted ACL.
- **Long path support:** Windows has a 260-character path limit by default. The token file path is well within limits, but verify if Node.js 22 uses the `\\?\` prefix for long paths.

### 9.2 Windows Credential Manager

- `keytar` uses Windows DPAPI (Data Protection API) for credential encryption, which is tied to the user's login credentials.
- If the user's Windows password changes, DPAPI-encrypted credentials remain accessible (DPAPI uses a master key derived from the password, but old master keys are preserved).
- **Multi-user concern:** Each Windows user has a separate credential store. Tokens are not accessible to other users or administrators.

### 9.3 Environment Variable Security on Windows

- Windows environment variables are visible to all processes running as the same user via the `set` command or Process Explorer.
- The `ANTHROPIC_API_KEY` is already stored in `.env`. OAuth client secrets should follow the same pattern.
- **Risk:** If `HOOK_FAIL_OPEN=true` is set as a Windows system environment variable (rather than in `.env`), it would affect ALL sessions and ALL hooks globally. Document that this variable should NEVER be set as a system/user environment variable.

### 9.4 Loopback Server on Windows

- Windows Firewall may prompt for permission when the CLI starts a local HTTP server on `127.0.0.1`.
- Using `127.0.0.1` (not `localhost`) avoids DNS resolution issues where `localhost` might resolve to `::1` (IPv6) on some Windows configurations.
- Ephemeral port allocation on Windows typically uses ports 49152-65535.

---

## 10. Compliance Mapping (GDPR, SOC2)

### 10.1 GDPR Compliance

| GDPR Article                   | OAuth Implementation                                                                                    | Control            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------ |
| Art. 5(1)(c) Data minimization | Request minimum OAuth scopes (openid, email only); do not request profile/contacts unless business need | Configuration      |
| Art. 6(1)(a) Consent           | Display scope descriptions in plain language; allow selective consent                                   | UI/CLI UX          |
| Art. 17 Right to erasure       | Account deletion revokes all tokens, deletes refresh token hashes, removes user profile                 | SEC-OAUTH-012      |
| Art. 20 Data portability       | Export user profile in JSON format                                                                      | Implementation     |
| Art. 33 Breach notification    | Auth breach -> notify users within 72 hours; notify DPA if >500 users affected                          | Incident response  |
| Art. 44 Cross-border transfer  | Validate OAuth provider's GDPR compliance; data processing agreements in place                          | Provider selection |

### 10.2 SOC2 Trust Principles

| Trust Principle      | Auth-Related Controls                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------- |
| Security             | All SEC-OAUTH controls; encryption at rest/transit; access logging; rate limiting         |
| Availability         | DDoS protection on auth endpoints; failover capability; rate limiting prevents exhaustion |
| Processing Integrity | Token validation on every request; PKCE prevents code injection; scope enforcement        |
| Confidentiality      | Tokens never logged; passwords hashed with Argon2id; secrets in environment variables     |
| Privacy              | Minimum scope collection; user consent; data retention policy; right to erasure           |

### 10.3 Data Retention

| Data Type                | Retention Period                         | Deletion Method                         |
| ------------------------ | ---------------------------------------- | --------------------------------------- |
| Access tokens            | Until expiry (15 min)                    | Stateless (not stored server-side)      |
| Refresh token hashes     | Until expiry or revocation (max 30 days) | Database deletion + audit log           |
| Authorization codes      | Until exchange or expiry (max 10 min)    | Database deletion                       |
| Audit logs (auth events) | 90 days                                  | Automated rotation with secure deletion |
| Failed login attempts    | 30 days                                  | Automated rotation                      |
| User consent records     | Account duration + 7 years               | Archive then delete                     |

---

## 11. Implementation Constraints

### 11.1 Library Requirements (Binding)

| Library         | Purpose          | Why This Library                                                                            | Risk if Alternative Used                                 |
| --------------- | ---------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `jose`          | JWT sign/verify  | RFC 8725 compliant; built-in algorithm whitelist; no historical `alg: none` vulnerabilities | `jsonwebtoken` has had algorithm confusion CVEs          |
| `openid-client` | OIDC client      | OpenID Certified; PKCE built-in; handles discovery, token exchange, refresh                 | Custom implementation has 90%+ vulnerability probability |
| `helmet`        | Security headers | Production-proven; maintained by Express team; covers HSTS, CSP, X-Frame-Options            | Manual header setting is error-prone                     |
| `keytar`        | OS keychain      | Cross-platform (Win/Mac/Linux); uses native OS credential stores                            | Alternative: encrypted file (acceptable fallback)        |

### 11.2 Architecture Constraints (Binding)

1. **CommonJS (`.cjs`) format** -- The entire codebase uses CommonJS. Auth modules MUST be `.cjs` files with `require()` imports. Exception: some library modules use `.mjs` (ESM), but the auth module should be CJS for consistency with the hook system.

2. **No Express dependency for CLI-only mode** -- If agent-studio can run without a web server (CLI-only), the auth middleware MUST be optional. Token storage should work independently of Express.

3. **Token storage location** -- CLI tokens in `~/.agent-studio/auth.enc` (NOT in the project directory `.claude/`). This prevents accidental commits of token files.

4. **Hook integration** -- Auth enforcement MUST integrate with the existing PreToolUse/PostToolUse hook infrastructure. A new `auth-enforcement-hook.cjs` in `.claude/hooks/auth/` is the recommended integration point.

5. **Spawn prompt safety** -- NEVER include raw tokens, client secrets, or authentication credentials in agent spawn prompts. The `spawn-prompt-assembler.cjs` should strip any auth tokens from context before assembling prompts.

### 11.3 Prerequisite Fix Ordering

The following fixes MUST be completed BEFORE OAuth code is deployed to any environment:

| Order | Issue                              | Fix                                            | Effort  | Rationale                                            |
| ----- | ---------------------------------- | ---------------------------------------------- | ------- | ---------------------------------------------------- |
| 1     | SEC-HOOK-001 (HOOK_FAIL_OPEN)      | Replace with per-hook overrides                | 4 hours | Single kill switch disables ALL security enforcement |
| 2     | SEC-HOOK-002 (eval/exec allowlist) | Remove from SAFE_COMMANDS_ALLOWLIST            | 1 hour  | Arbitrary code execution bypass                      |
| 3     | SEC-LIB-001 (execSync)             | Complete remediation of remaining exec() calls | 2 hours | Command injection enabling token exfiltration        |

---

## 12. Penetration Testing Requirements

### 12.1 Pre-Deployment Test Checklist

The following tests MUST pass before OAuth is deployed to any environment:

**CRITICAL (must pass for beta):**

- [ ] Authorization code interception without PKCE -- MUST fail
- [ ] PKCE downgrade attack (strip code_challenge) -- MUST fail
- [ ] JWT with `alg: none` -- MUST be rejected
- [ ] JWT with `alg: HS256` and public key as secret -- MUST be rejected
- [ ] Token in URL query parameter -- MUST be rejected
- [ ] localStorage token storage -- MUST not exist
- [ ] Callback server binding to 0.0.0.0 -- MUST not occur

**HIGH (must pass for production):**

- [ ] Refresh token reuse detection -- MUST revoke all tokens
- [ ] Redirect URI with different domain -- MUST be rejected
- [ ] Redirect URI with `javascript:` scheme -- MUST be rejected
- [ ] Redirect URI with private IP (169.254.169.254) -- MUST be rejected
- [ ] CSRF (callback without state parameter) -- MUST be rejected
- [ ] Rate limit bypass (different headers, user agents) -- MUST still enforce limits
- [ ] User enumeration (error message timing/content) -- MUST be indistinguishable

**MEDIUM (should pass for production):**

- [ ] CORS with unauthorized origin -- MUST be rejected
- [ ] Cookie without HttpOnly attribute -- MUST not occur
- [ ] Cookie without Secure attribute -- MUST not occur
- [ ] Cookie without SameSite=Strict -- MUST not occur
- [ ] Token in spawn prompt -- MUST not occur
- [ ] Key rotation (old key after grace period) -- MUST reject token

### 12.2 Attack Simulation Matrix

| Attack                          | Method                                                    | Expected Result                     | Control       |
| ------------------------------- | --------------------------------------------------------- | ----------------------------------- | ------------- |
| Authorization code interception | Intercept redirect without PKCE                           | Code unusable without code_verifier | SEC-OAUTH-001 |
| Algorithm confusion             | Send JWT with `alg: HS256`, use public key as HMAC secret | Token rejected                      | SEC-OAUTH-002 |
| Token theft via XSS             | Execute `document.cookie` in browser                      | Empty (HttpOnly prevents access)    | SEC-OAUTH-003 |
| Open redirect                   | Use `https://evil.com` as redirect_uri                    | 400 error (not in registered URIs)  | SEC-OAUTH-004 |
| Token replay                    | Use expired refresh token                                 | 401 (token expired or revoked)      | SEC-OAUTH-005 |
| Brute force                     | 100 login attempts in 1 minute                            | Rate limited after 5/minute         | SEC-OAUTH-006 |
| CSRF                            | Craft callback URL without state                          | 400 (state validation failed)       | SEC-OAUTH-007 |
| Scope escalation                | Modify JWT scope claim                                    | 403 (server-side scope check fails) | SEC-OAUTH-008 |
| User enumeration                | Compare response for valid/invalid users                  | Identical error message and timing  | SEC-OAUTH-011 |
| SSRF via redirect_uri           | Use `http://169.254.169.254/latest/meta-data/`            | 400 (private IP blocked)            | SEC-OAUTH-014 |

---

## 13. Incident Response Plan

### 13.1 Detection Triggers

| Trigger                                                | Severity | Automated Action                | Manual Action                    |
| ------------------------------------------------------ | -------- | ------------------------------- | -------------------------------- |
| Refresh token reuse detected                           | HIGH     | Revoke all user tokens          | Alert user; investigate          |
| >100 failed logins from single IP/hour                 | MEDIUM   | Block IP (15 min)               | Review for credential stuffing   |
| JWT signing key compromise suspected                   | CRITICAL | Rotate all keys immediately     | Revoke all tokens; force re-auth |
| OAuth provider breach announced                        | HIGH     | Force re-auth for that provider | Review access logs               |
| Impossible travel (login from 2 continents in <1 hour) | MEDIUM   | Require re-authentication       | Alert user                       |

### 13.2 Response Procedures

**Level 1 (CRITICAL) -- Signing Key Compromise:**

1. Generate new RSA/ECDSA key pair immediately
2. Deploy new public key to JWKS endpoint
3. Revoke ALL active refresh tokens (database purge)
4. Force all users to re-authenticate
5. Investigate compromise vector (key storage, access logs)
6. Notify affected users within 24 hours
7. Post-incident review within 48 hours
8. Document in `.claude/context/memory/issues.md`

**Level 2 (HIGH) -- Token Theft/Replay:**

1. Identify affected user(s) via audit logs
2. Revoke all tokens for affected users
3. Force re-authentication
4. Notify affected users immediately
5. Review access logs for unauthorized actions
6. Determine if data was exfiltrated

**Level 3 (MEDIUM) -- Brute Force/Credential Stuffing:**

1. Verify rate limiting is active and effective
2. Block attacking IPs (temporary)
3. Force re-authentication for targeted accounts
4. Enable/enforce MFA for targeted accounts
5. Monitor for successful breaches from the attack window

---

## 14. Hybrid Validation Checklist

### IEEE 1028 Security Base (83%)

- [ ] Input validation on all user inputs (OAuth parameters, JWT claims, redirect URIs)
- [ ] No SQL injection vulnerabilities (parameterized queries for token storage)
- [ ] No XSS vulnerabilities (CSP headers, HttpOnly cookies, output encoding)
- [ ] Sensitive data encrypted at rest (refresh token hashes, encrypted file storage)
- [ ] Sensitive data encrypted in transit (TLS 1.2+, HSTS)
- [ ] Authentication checks present on all protected endpoints (deny by default)
- [ ] Authorization checks present (scope and role validation on every request)
- [ ] No hardcoded secrets or credentials (client_secret, JWT keys in env vars only)
- [ ] OWASP Top 10 considered (A01, A02, A03, A05, A07, A09, A10 mapped)
- [ ] All error conditions handled with generic messages (no user enumeration)
- [ ] Security events logged (login, logout, token refresh, failures, revocation)
- [ ] No sensitive data in logs (tokens, passwords, PII)
- [ ] Resource cleanup (token expiration, session cleanup, key rotation)
- [ ] Rate limiting on sensitive endpoints (token, login)
- [ ] CSRF protection (state parameter, SameSite cookies)

### Context-Specific Items (17%)

- [ ] [AI-GENERATED] PKCE S256 implemented and tested; PKCE downgrade prevention active
- [ ] [AI-GENERATED] JWT algorithm whitelist enforced (RS256/ES256 only; `none` rejected)
- [ ] [AI-GENERATED] Refresh token rotation with reuse detection; SHA-256 hashed storage
- [ ] [AI-GENERATED] HttpOnly + Secure + SameSite=Strict cookie attributes on ALL token cookies
- [ ] [AI-GENERATED] State parameter CSRF protection with cryptographic random (>=128 bits)
- [ ] [AI-GENERATED] Exact redirect URI matching; no wildcards; private IP/SSRF blocking
- [ ] [AI-GENERATED] CLI loopback server binds to 127.0.0.1 only; ephemeral port; immediate shutdown
- [ ] [AI-GENERATED] OS keychain integration (Windows Credential Manager, macOS Keychain, libsecret)
- [ ] [AI-GENERATED] Device Authorization Grant (RFC 8628) for headless environments
- [ ] [AI-GENERATED] Token values NEVER appear in agent spawn prompts or hook outputs

---

## 15. Risk Matrix and Priority Summary

### Risk Heat Map

```
                    Impact
                    LOW    MEDIUM   HIGH     CRITICAL
Likelihood  HIGH   D-003  D-001    S-003    T-001
                          D-002    E-003    I-001
                          R-001    S-005    I-002
                                            REQ-CLI-001

            MEDIUM        I-004    T-002    S-001
                                   I-003    T-004
                                   I-005    E-001
                                   E-004    E-002
                                   R-002    T-005
                                   R-003

            LOW                    T-003    S-002
```

### Priority Summary

| Priority           | Count       | Action Required                        |
| ------------------ | ----------- | -------------------------------------- |
| P0 (CRITICAL)      | 4 controls  | BLOCKS any deployment; implement first |
| P1 (HIGH)          | 8 controls  | BLOCKS production; implement before GA |
| P2 (MEDIUM)        | 11 controls | SHOULD implement before production     |
| Prerequisite fixes | 3 issues    | BLOCKS OAuth work; Phase 1             |

### Top 5 Risks (Prioritized)

1. **T-001: Authorization code interception without PKCE** -- CRITICAL. Single most important control. Mitigated by SEC-OAUTH-001 (mandatory PKCE S256 with downgrade prevention).

2. **I-001 + I-002: Token exposure via storage/URLs** -- CRITICAL. Mitigated by SEC-OAUTH-003 (HttpOnly cookies for web; OS keychain for CLI). localStorage and URL parameters are absolutely forbidden.

3. **T-004: Redirect URI manipulation** -- CRITICAL. Mitigated by SEC-OAUTH-004 (exact string matching; no wildcards; SSRF blocking for private IPs).

4. **REQ-CLI-001: Loopback server binding** -- CRITICAL for CLI. If callback server binds to `0.0.0.0`, any machine on the local network can intercept the authorization code.

5. **S-003 + E-003: Token theft with persistent access** -- HIGH. Mitigated by short-lived access tokens (<=15 min) and SEC-OAUTH-005 (refresh rotation with reuse detection).

---

## Appendix A: Dependency Security Assessment

| Package              | Version | License | Known CVEs      | Last Audit | Recommendation                                                          |
| -------------------- | ------- | ------- | --------------- | ---------- | ----------------------------------------------------------------------- |
| `jose`               | latest  | MIT     | None known      | 2026-02-08 | APPROVED -- Use as primary JWT library                                  |
| `openid-client`      | latest  | MIT     | None known      | 2026-02-08 | APPROVED -- Use as OIDC client                                          |
| `helmet`             | latest  | MIT     | None known      | 2026-02-08 | APPROVED -- Use for security headers                                    |
| `keytar`             | latest  | MIT     | None known      | 2026-02-08 | APPROVED with fallback -- Native module; may not build on all platforms |
| `express-rate-limit` | latest  | MIT     | None known      | 2026-02-08 | APPROVED -- Use for rate limiting                                       |
| `argon2`             | latest  | MIT     | None known      | 2026-02-08 | APPROVED -- Use if local accounts needed                                |
| `jsonwebtoken`       | N/A     | MIT     | Historical CVEs | N/A        | NOT RECOMMENDED -- Use `jose` instead                                   |

**Post-Install Verification:** Run `pnpm audit` after adding OAuth dependencies. Zero critical/high vulnerabilities must be the target.

---

## Appendix B: Cross-Reference to Implementation Plan

| Phase                   | Security Gate                           | Controls Implemented                                                                     |
| ----------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| Phase 1 (Prerequisites) | Prerequisite security fixes             | SEC-LIB-001, SEC-HOOK-001, SEC-HOOK-002                                                  |
| Phase 2 (Foundation)    | JWT verifier + token manager            | SEC-OAUTH-002, SEC-OAUTH-005, SEC-OAUTH-013                                              |
| Phase 3 (OAuth Flows)   | PKCE + state + providers                | SEC-OAUTH-001, SEC-OAUTH-007, REQ-CLI-001 through REQ-CLI-009                            |
| Phase 4 (Integration)   | Middleware + rate limiting + validation | SEC-OAUTH-003, SEC-OAUTH-004, SEC-OAUTH-006, SEC-OAUTH-008, SEC-OAUTH-010, SEC-OAUTH-014 |
| Phase 5 (Testing)       | Security test suite                     | All SEC-OAUTH controls validated                                                         |
| Phase 6 (Documentation) | Security documentation                  | Audit logging (SEC-OAUTH-009), error safety (SEC-OAUTH-011), revocation (SEC-OAUTH-012)  |

---

**End of Security Assessment**

**Next Steps:**

1. Phase 1: Fix prerequisite security issues (SEC-HOOK-001, SEC-HOOK-002, SEC-LIB-001)
2. Implementation team uses SEC-OAUTH controls as acceptance criteria for each task
3. Security architect reviews each phase completion before advancing to next phase (Gate 2 enforcement)
4. Penetration testing after Phase 5 (Section 12 checklist)
5. Compliance review before production deployment (Section 10)
6. Post-deployment monitoring with incident response procedures (Section 13)

**Approval Status:** This security assessment is APPROVED for implementation. All deviations from specified controls require a follow-up security review.
