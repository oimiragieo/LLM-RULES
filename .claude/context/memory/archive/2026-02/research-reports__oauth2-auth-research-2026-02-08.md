<!-- Agent: planner | Task: #oauth2-auth-plan | Session: 2026-02-08 -->

# Research Report: OAuth 2.1 Authentication for Agent Studio

## Research Queries Executed

1. "OAuth 2.1 best practices 2026 PKCE authorization code flow"
2. "Node.js OAuth2 implementation 2026 secure token management"
3. "OAuth 2.1 specification RFC changes 2025 2026"
4. "OAuth2 refresh token rotation secure storage backend for frontend pattern 2026"
5. "MCP Model Context Protocol OAuth 2.1 authorization agent authentication 2026"

## Sources Consulted (10)

1. **IETF OAuth 2.1 Specification (draft-14)** -- https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/
   - Status: Internet-Draft, expires April 2026
   - Mandates PKCE for ALL clients, removes implicit flow, removes ROPC
   - Requires exact redirect URI matching
   - Refresh tokens must be sender-constrained or rotated (public clients)

2. **Auth0: Authorization Code Flow with PKCE** -- https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce
   - Reference implementation for PKCE in JavaScript/Node.js
   - code_verifier: 43-128 chars, unreserved characters
   - code_challenge: Base64URL(SHA256(code_verifier))

3. **MCP Authorization Specification** -- https://modelcontextprotocol.io/specification/draft/basic/authorization
   - MCP servers as OAuth 2.1 resource servers
   - MCP clients as OAuth 2.1 clients
   - Requires RFC 8707 Resource Indicators
   - Dynamic client registration (RFC 7591)

4. **OAuth 2.1 Features for 2026** -- https://rgutierrez2004.medium.com/oauth-2-1-features-you-cant-ignore-in-2026-a15f852cb723
   - OAuth 2.1 consolidates decade of security best practices
   - DPoP (Demonstrating Proof-of-Possession) gaining adoption
   - PKCE downgrade attacks make OAuth 2.0 without PKCE vulnerable

5. **PKCE Downgrade Attacks** -- https://medium.com/@instatunnel/pkce-downgrade-attacks-why-oauth-2-1-is-no-longer-optional-887731326f24
   - Attackers can force OAuth 2.0 servers to skip PKCE
   - OAuth 2.1 makes PKCE non-optional, closing this vector
   - S256 method required (plain method is insecure)

6. **RFC 9700: OAuth 2.0 Security Best Current Practice** -- Published January 2025
   - Consolidates security recommendations since RFC 6749
   - Requires PKCE for authorization code grants
   - Recommends token binding mechanisms

7. **MCP OAuth 2.1 and PKCE for AI Authorization** -- https://aembit.io/blog/mcp-oauth-2-1-pkce-and-the-future-of-ai-authorization/
   - AI agents need authorization without human presence
   - MCP standardizes OAuth 2.1 for agent authentication
   - Context-aware authorization approach needed

8. **Backend-for-Frontend Token Security** -- https://www.devoteam.com/expert-view/every-frontend-needs-its-backend/
   - SPAs as public OAuth clients cannot keep secrets
   - BFF pattern: browser uses HttpOnly cookies, backend holds tokens
   - Eliminates entire class of token theft attacks

9. **Auth0: Refresh Token Rotation** -- https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/
   - Token rotation: new refresh token on every use
   - Reuse detection: if old token reused, revoke entire family
   - Family-based tracking enables efficient revocation

10. **Stytch: OAuth 2.1 vs 2.0** -- https://stytch.com/blog/oauth-2-1-vs-2-0/
    - OAuth 2.1 removes: implicit flow, ROPC grant
    - Adds: mandatory PKCE, exact redirect URI matching
    - Tightens: refresh token requirements for public clients

## Key Findings

### OAuth 2.1 Mandates (Non-Negotiable)

1. **PKCE required for ALL clients** (not just public clients)
2. **Implicit flow removed** (response_type=token is invalid)
3. **ROPC grant removed** (no username/password token exchange)
4. **Exact redirect URI matching** (no wildcards, no pattern matching)
5. **Refresh tokens**: sender-constrained (DPoP/mTLS) OR rotated with reuse detection

### MCP-Specific Requirements

1. MCP servers act as OAuth 2.1 resource servers
2. MCP clients act as OAuth 2.1 clients
3. RFC 8707 Resource Indicators required (identify target MCP server)
4. Dynamic client registration (RFC 7591) for agent registration
5. Token endpoint must support authorization_code and refresh_token grants

### Security Best Practices (2026)

1. **BFF Pattern**: Browser never stores tokens; server-side token management
2. **Token Rotation**: New refresh token on every use; family-based reuse detection
3. **jose library**: Replaces jsonwebtoken (has known CVEs); standards-compliant
4. **Argon2id**: OWASP-recommended password hashing (replaces bcrypt)
5. **CSRF**: Double-submit cookie pattern with SameSite=Lax
6. **Audit Logging**: OWASP A09 compliance; never log tokens or PII

### Node.js Library Selection

| Library        | Purpose               | Why Chosen                                                              |
| -------------- | --------------------- | ----------------------------------------------------------------------- |
| `oauth4webapi` | OIDC/OAuth 2.1 client | RFC-compliant, actively maintained, supports PKCE/DPoP                  |
| `jose`         | JWT/JWE/JWS           | Standards-compliant, no CVEs (unlike jsonwebtoken), maintained by auth0 |
| `argon2`       | Password hashing      | OWASP 2024 recommendation, memory-hard, Node.js native binding          |
| `express@5`    | HTTP framework        | Stable, async middleware support, massive ecosystem                     |
| `helmet`       | Security headers      | CSP, HSTS, X-Frame-Options out of the box                               |

### Alternatives Considered and Rejected

| Alternative                | Reason for Rejection                                                       |
| -------------------------- | -------------------------------------------------------------------------- |
| Session-only (no OAuth)    | Cannot integrate with external providers; agents need provider tokens      |
| JWT-only (stateless)       | Cannot revoke tokens server-side; token theft is permanent until expiry    |
| OAuth 2.0 (not 2.1)        | PKCE downgrade attacks; implicit flow still valid; weaker security         |
| Passport.js                | Heavy abstraction; many deprecated strategies; prefer direct oauth4webapi  |
| Fastify instead of Express | Express 5 has async support; larger middleware ecosystem; team familiarity |
| PostgreSQL for auth DB     | Overkill for single-node framework; SQLite consistent with existing infra  |

## Unknowns Resolved

| Unknown                       | Resolution                                                  |
| ----------------------------- | ----------------------------------------------------------- |
| Which OAuth flow?             | Authorization Code + PKCE (OAuth 2.1 mandate)               |
| Where to store tokens?        | Server-side only (BFF pattern); encrypted at rest in SQLite |
| How to handle MCP auth?       | OAuth 2.1 resource server per MCP spec                      |
| Which JWT library?            | jose (not jsonwebtoken -- CVE history)                      |
| Which password hasher?        | argon2id (OWASP 2024 recommendation)                        |
| How to pass tokens to agents? | Secure token provider module (NOT in spawn prompts)         |
