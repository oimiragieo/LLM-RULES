<!-- Agent: planner | Task: #auth-patterns | Session: 2026-01-28 -->

# Authentication Patterns Report (Canonical)

## Scope
Authentication and authorization architecture patterns for Agent Studio with emphasis on OAuth 2.1, token safety, and agent integration.

## Baseline Recommendation
- OAuth 2.1 Authorization Code + PKCE as default interactive flow
- Refresh token rotation with reuse detection
- Backend-for-Frontend token handling for browser-based clients
- Short-lived access tokens with explicit audience/resource indicators

## Core Security Controls
- Exact redirect URI matching
- PKCE S256 only
- Sender-constrained or rotated refresh tokens
- Secure server-side token storage and encryption at rest
- Audit logging without token/PII leakage

## Agent Integration Pattern
- Agents receive scoped access through secure token provider interfaces
- Do not embed raw provider tokens in agent prompts or logs
- Use least-privilege scopes and explicit expiry handling

## Implementation Notes
Reference detailed implementation and source-backed findings in:
- `.claude/context/artifacts/research-reports/oauth2-auth-research-2026-02-08.md`

## Decision Summary
Adopt OAuth 2.1-first architecture for all new auth integrations and phase out legacy patterns that rely on implicit or ROPC grants.
