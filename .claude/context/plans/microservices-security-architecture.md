<!-- Agent: security-architect | Task: #task-2 | Session: 2026-03-21 -->

# Microservices Security Architecture Supplement

**Scope**: Security review for monolith-to-microservices migration
**Date**: 2026-03-21
**Classification**: Architecture Security Review
**Methodology**: STRIDE threat modeling, OWASP Top 10 2025, Zero Trust principles

---

## Table of Contents

1. [Authentication and Authorization](#1-authentication--authorization-in-microservices)
2. [Network Security](#2-network-security)
3. [Data Security](#3-data-security)
4. [Supply Chain and Runtime Security](#4-supply-chain--runtime-security)
5. [Migration-Specific Risks](#5-migration-specific-risks)
6. [STRIDE Threat Model Summary](#6-stride-threat-model-summary)
7. [Security Controls Checklist](#7-security-controls-checklist)

---

## 1. Authentication and Authorization in Microservices

### 1.1 Centralized Auth Service vs. Distributed Token Validation

**Recommendation**: Centralized issuance, distributed validation.

A dedicated **Auth Service** (identity provider) handles all credential verification, token issuance, and token refresh. Individual services validate tokens locally using the Auth Service's public key, without making a network call on every request.

```
                     +-------------------+
                     |   Auth Service    |
                     | (Token Issuance)  |
                     | (Key Management)  |
                     | (User Directory)  |
                     +--------+----------+
                              |
              Public Key Distribution (JWKS endpoint)
                              |
         +--------------------+--------------------+
         |                    |                    |
  +------v------+     +------v------+     +------v------+
  | Service A   |     | Service B   |     | Service C   |
  | (Local JWT  |     | (Local JWT  |     | (Local JWT  |
  |  Validation)|     |  Validation)|     |  Validation)|
  +-------------+     +-------------+     +-------------+
```

**Security rationale**:

- Single point of credential management reduces credential sprawl.
- Asymmetric signing (RS256 or ES256) means services hold only the public key; compromise of a downstream service does not leak signing capability.
- JWKS endpoint with key rotation enables zero-downtime key changes.
- Token revocation handled via short-lived access tokens (<=15 min) plus a lightweight revocation list for emergency invalidation.

**STRIDE mapping**: Addresses **Spoofing** (centralized identity verification) and **Elevation of Privilege** (token scope enforcement at issuance).

### 1.2 OAuth 2.1 / OIDC for Service-to-Service Auth

All service-to-service communication MUST use OAuth 2.1 Client Credentials flow. The legacy OAuth 2.0 implicit grant and ROPC grant are permanently removed per the OAuth 2.1 specification (mandatory Q2 2026).

**Service-to-service pattern**:

```
Service A                    Auth Service                    Service B
    |                            |                              |
    |-- Client Credentials ----->|                              |
    |   (client_id + secret)     |                              |
    |<-- Access Token (scoped) --|                              |
    |                            |                              |
    |-- Request + Bearer Token -------------------------------->|
    |                            |                              |
    |                            |   Service B validates JWT    |
    |                            |   locally (JWKS public key)  |
    |<-- Response ----------------------------------------------|
```

**Requirements**:

- Each service has a unique `client_id` and `client_secret` (managed via secrets vault).
- Access tokens are scoped to the minimum permissions needed (e.g., `orders:read`, `users:write`).
- Token lifetime: 5-15 minutes maximum. No refresh tokens for service-to-service flows.
- PKCE is not applicable to Client Credentials flow but IS mandatory for all user-facing flows.

**For user-facing flows**:

- Authorization Code + PKCE (S256 method only) is the sole permitted flow.
- Implicit grant (`response_type=token`) is forbidden.
- Exact redirect URI matching is required; no wildcards.
- Tokens stored in HttpOnly, Secure, SameSite=Strict cookies only. Never in localStorage.

### 1.3 mTLS for Inter-Service Communication

Mutual TLS (mTLS) provides both encryption and mutual authentication at the transport layer. Each service presents a client certificate that the receiving service verifies against a trusted CA.

**Implementation approach**:

- Deploy a private PKI or use a service mesh CA (e.g., Istio Citadel, Linkerd identity).
- Certificates are short-lived (24-72 hours) and auto-rotated by the mesh sidecar or cert-manager.
- Certificate Subject Alternative Names (SANs) must match the service's SPIFFE identity: `spiffe://cluster.local/ns/<namespace>/sa/<service-account>`.

**mTLS provides defense-in-depth alongside JWT**:

| Layer | Mechanism | Protects Against |
|-------|-----------|-----------------|
| Transport | mTLS | Eavesdropping, MITM, unauthorized network access |
| Application | JWT | Identity spoofing, privilege escalation, scope abuse |

Both layers are required. mTLS alone does not carry authorization claims; JWT alone does not encrypt the channel.

### 1.4 API Gateway as Auth Enforcement Point

The API Gateway serves as the single entry point for external traffic and the primary auth enforcement boundary.

**Gateway responsibilities**:

1. **TLS termination** for external clients.
2. **Token validation**: Verify JWT signature, expiry, audience, and issuer before forwarding to backend services.
3. **Rate limiting**: Per-client, per-endpoint rate limits to prevent brute force and DoS.
4. **Request sanitization**: Strip unexpected headers; validate Content-Type.
5. **CORS enforcement**: Strict origin allowlisting; no `Access-Control-Allow-Origin: *` in production.
6. **Token exchange**: Optionally exchange external tokens for internal tokens with narrower scope.

**What the gateway does NOT do**:

- Fine-grained authorization (that belongs to each service, which has domain context).
- Business logic or data transformation.

```
External Client
      |
      | HTTPS
      v
+------------------+
|   API Gateway    |  <-- TLS termination, JWT validation, rate limiting
+--------+---------+
         |
         | mTLS (internal)
         v
+--------+---------+
|   Service Mesh   |  <-- mTLS enforcement, traffic policies
+--------+---------+
         |
    +----+----+
    |         |
 Svc A     Svc B
```

### 1.5 JWT Propagation Patterns and Token Scope

**Pattern: Token Downscoping**

When Service A calls Service B on behalf of a user, propagate a downscoped token rather than the original user token. This limits blast radius if Service B is compromised.

```
User Token:  { sub: "user_123", scope: "orders:read orders:write users:read" }
                              |
                    Token Exchange at Gateway
                              |
                              v
Service B Token: { sub: "user_123", scope: "orders:read", aud: "service-b" }
```

**Rules for JWT propagation**:

1. Never propagate tokens with broader scope than the downstream service requires.
2. Always set the `aud` (audience) claim to the target service identifier.
3. Access tokens must have `exp` <= 15 minutes.
4. Include `jti` (JWT ID) for revocation tracking.
5. Never store sensitive data (PII, passwords) in JWT claims. JWTs are base64-encoded, not encrypted.
6. Algorithm whitelist: RS256 or ES256 only. HS256 forbidden for multi-service architectures. `alg: none` is permanently forbidden.

**JWT validation checklist (every service)**:

- [ ] Verify signature against JWKS public key
- [ ] Verify `exp` (expiry) with <= 30s clock tolerance
- [ ] Verify `iss` (issuer) matches expected Auth Service URL
- [ ] Verify `aud` (audience) matches this service's identifier
- [ ] Verify `scope` includes required permissions for the requested operation
- [ ] Reject `alg: none` unconditionally
- [ ] Check revocation list for `jti` if emergency revocation is enabled

---

## 2. Network Security

### 2.1 Zero-Trust Networking Between Services

**Principle**: Never trust network location. Every request is authenticated, authorized, and encrypted regardless of whether it originates from inside or outside the cluster.

**Implementation**:

1. **Identity-based access**: Services authenticate by cryptographic identity (mTLS certificate / SPIFFE ID), not by IP address or network segment.
2. **Deny-by-default**: All inter-service traffic is denied unless explicitly permitted by policy.
3. **No implicit trust zones**: Internal network segments do not confer trust. A compromised service in the same subnet cannot access other services without valid credentials.
4. **Continuous verification**: Token and certificate validity is checked on every request, not just at connection establishment.

### 2.2 Service Mesh Security Features

A service mesh (Istio, Linkerd, Cilium) provides security primitives at the infrastructure layer, transparent to application code.

**mTLS (Mutual TLS)**:

- Automatic certificate provisioning and rotation for all meshed services.
- Strict mode: reject all plaintext traffic within the mesh.
- Permissive mode only during migration (see Section 5).

**RBAC (Role-Based Access Control) at mesh level**:

```yaml
# Istio AuthorizationPolicy example
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: order-service-policy
  namespace: production
spec:
  selector:
    matchLabels:
      app: order-service
  rules:
  - from:
    - source:
        principals: ["cluster.local/ns/production/sa/api-gateway"]
        principals: ["cluster.local/ns/production/sa/payment-service"]
    to:
    - operation:
        methods: ["GET", "POST"]
        paths: ["/api/v1/orders/*"]
  action: ALLOW
```

**Traffic policies**:

- Circuit breakers to prevent cascading failures.
- Retry budgets with exponential backoff (prevent retry storms).
- Request timeouts per service pair.
- Outlier detection to eject unhealthy instances.

### 2.3 Network Policies in Kubernetes

Kubernetes NetworkPolicies provide L3/L4 network segmentation as a defense-in-depth layer beneath the service mesh.

```yaml
# Deny all ingress by default
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: production
spec:
  podSelector: {}
  policyTypes:
  - Ingress

---
# Allow specific ingress
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-order-service-ingress
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: order-service
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: api-gateway
    - podSelector:
        matchLabels:
          app: payment-service
    ports:
    - protocol: TCP
      port: 8080
```

**Layered defense**:

| Layer | Mechanism | Granularity |
|-------|-----------|-------------|
| L3/L4 | Kubernetes NetworkPolicy | Pod-to-pod, port-level |
| L4/L7 | Service Mesh (mTLS + AuthorizationPolicy) | Service identity, HTTP method/path |
| L7 | Application (JWT validation) | User identity, permission scope |

All three layers are required. No single layer is sufficient.

### 2.4 East-West Traffic Encryption

All traffic between services (east-west) must be encrypted in transit via mTLS. This is non-negotiable even within a private network.

**Why internal encryption matters**:

- Compromised nodes can sniff plaintext traffic on the pod network.
- Kubernetes pod networks are flat by default; any pod can see traffic to any other pod without NetworkPolicies.
- Compliance frameworks (SOC2, PCI-DSS, HIPAA) require encryption in transit regardless of network boundary.

**Implementation**:

- Service mesh strict mTLS mode for all production namespaces.
- Permissive mode only in designated migration namespaces with a defined sunset date.
- TLS 1.2 as minimum; TLS 1.3 preferred.
- Certificate rotation every 24-72 hours (automated by mesh CA).

---

## 3. Data Security

### 3.1 Data Isolation Between Services (No Shared Databases)

**Iron rule**: Each microservice owns its data store exclusively. No other service may read from or write to another service's database directly.

```
MONOLITH (before):                 MICROSERVICES (after):

+------------------+               +----------+  +----------+  +----------+
|  Shared Database |               | Users DB |  | Orders DB|  | Payment  |
|  (all tables)    |               | (Svc A)  |  | (Svc B)  |  | DB (C)   |
+------------------+               +----------+  +----------+  +----------+
                                        |              |              |
                                   +----v----+   +----v----+   +----v----+
                                   | User    |   | Order   |   | Payment |
                                   | Service |   | Service |   | Service |
                                   +---------+   +---------+   +---------+
```

**Security rationale**:

- A compromised service can only access its own data, not the entire organization's data.
- Prevents unauthorized data access via SQL joins across domain boundaries.
- Enables per-service encryption keys and access policies.
- Simplifies compliance auditing (each service's data has a clear owner and access control).

**Data access between services**:

- Via authenticated API calls only (OAuth 2.1 Client Credentials + JWT).
- Event-driven data propagation via message broker (with schema validation and encryption).
- Never via shared database connections, database links, or shared read replicas.

### 3.2 Encryption at Rest and in Transit Per Service

**At rest**:

- Each service's database uses its own encryption key (envelope encryption).
- Key hierarchy: Master Key (HSM/KMS) -> Data Encryption Key (per-service) -> Data.
- Key rotation: Master keys every 90 days; data encryption keys every 30 days.
- Database engine-level encryption (e.g., AES-256-GCM for PostgreSQL, MongoDB encrypted storage engine).
- Backup encryption with separate keys stored in a different KMS region.

**In transit**:

- mTLS for all service-to-service communication (see Section 2.4).
- TLS 1.2+ for all database connections (no plaintext database connections, even on private networks).
- Message broker connections encrypted (TLS for Kafka, RabbitMQ, NATS).
- Event payloads containing PII encrypted at the application layer before publishing.

### 3.3 PII Handling Across Service Boundaries

When PII must flow between services, apply these controls:

1. **Minimize PII in transit**: Pass user IDs and references, not full PII records. Let the owning service resolve PII as needed.
2. **Tokenization**: Replace sensitive fields (email, SSN, credit card) with opaque tokens. Only the tokenization service can reverse the mapping.
3. **Field-level encryption**: If PII must be included in event payloads, encrypt individual fields at the application layer before publishing to the message broker.
4. **Data classification labels**: Tag all API responses and events with data classification (PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED). Downstream services enforce handling rules based on classification.
5. **Audit logging**: Log every cross-service PII access with: requesting service identity, user whose PII was accessed, fields accessed, timestamp, and justification.

```
Order Service                         User Service
     |                                     |
     |-- GET /users/123 (Bearer JWT) ----->|
     |   scope: users:read:basic           |
     |                                     |
     |<-- { id: 123, name: "J. Doe",  ----|
     |      email: REDACTED,               |  (email redacted because
     |      phone: REDACTED }              |   scope lacks users:read:pii)
```

### 3.4 GDPR/Compliance Implications of Data Distribution

Distributing data across services creates compliance challenges:

**Data Subject Access Requests (DSAR)**:

- Each service must be able to enumerate all PII it holds for a given user.
- Implement a centralized DSAR coordinator service that queries all services and aggregates results.
- Response deadline: 30 days (GDPR). Budget for cross-service query latency.

**Right to Erasure (Right to be Forgotten)**:

- Deletion must propagate to all services holding the user's data.
- Use a choreography pattern: publish a `UserDeletionRequested` event; each service subscribes and deletes its records.
- Verify deletion across all services before confirming to the user.
- Retain audit logs of the deletion itself (legal basis: legitimate interest in compliance auditing).

**Data Processing Agreements**:

- Each service team is a "data processor" for the PII it handles.
- Document the legal basis for processing in each service.
- Maintain a Record of Processing Activities (ROPA) per service.

**Cross-border data transfer**:

- If services are deployed across regions, ensure data residency requirements are met.
- PII must not leave the designated region without appropriate transfer mechanisms (SCCs, adequacy decisions).

**PCI-DSS (if handling payment data)**:

- Payment data must be isolated in a PCI-compliant service with its own network segment.
- No payment data in logs, event payloads, or non-PCI services.
- Quarterly vulnerability scans and annual penetration tests for the payment service.

---

## 4. Supply Chain and Runtime Security

### 4.1 Container Image Scanning and Signing

**Image scanning**:

- Scan all container images for known CVEs before deployment (Trivy, Grype, or Snyk Container).
- Block deployment of images with CRITICAL or HIGH CVEs without an approved exception.
- Scan both base images and application layers.
- Integrate scanning into CI/CD pipeline as a mandatory gate.

**Image signing**:

- Sign all production images with Cosign (Sigstore) or Notary v2.
- Kubernetes admission controller (Kyverno or OPA Gatekeeper) rejects unsigned images.
- Maintain a trust policy that maps image registries to required signing keys.

```yaml
# Kyverno policy: require signed images
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-signed-images
spec:
  validationFailureAction: Enforce
  rules:
  - name: check-image-signature
    match:
      resources:
        kinds:
        - Pod
    verifyImages:
    - imageReferences:
      - "registry.example.com/*"
      attestors:
      - entries:
        - keys:
            publicKeys: |-
              -----BEGIN PUBLIC KEY-----
              ...
              -----END PUBLIC KEY-----
```

**Base image hygiene**:

- Use distroless or Alpine-based images to minimize attack surface.
- Pin base image versions to specific digests, not floating tags.
- Rebuild images weekly to incorporate OS-level security patches.
- Never run containers as root (see Docker standards).

### 4.2 Secrets Management

**Centralized secrets management** via HashiCorp Vault, AWS Secrets Manager, or Azure Key Vault.

**Principles**:

1. No secrets in environment variables at rest (inject at runtime via sidecar or init container).
2. No secrets in container images or Dockerfiles.
3. No secrets in source code or git history (enforce with pre-commit hooks: gitleaks, truffleHog).
4. Short-lived dynamic secrets where possible (e.g., dynamic database credentials from Vault).
5. Automatic rotation on a defined schedule.

**Kubernetes integration**:

```yaml
# Vault Agent Injector pattern
apiVersion: v1
kind: Pod
metadata:
  annotations:
    vault.hashicorp.com/agent-inject: "true"
    vault.hashicorp.com/agent-inject-secret-db-creds: "database/creds/order-service"
    vault.hashicorp.com/role: "order-service"
```

**Sealed Secrets** (for GitOps):

- Encrypt secrets at rest in git using Sealed Secrets or SOPS.
- Only the cluster controller can decrypt.
- Rotate the sealing key quarterly.

### 4.3 Runtime Security Monitoring

**Falco** (runtime threat detection):

- Deploy as DaemonSet on all cluster nodes.
- Detect: unexpected shell spawning in containers, file access outside expected paths, network connections to unusual destinations, privilege escalation attempts.
- Alert on: container escape attempts, crypto mining indicators, reverse shell patterns.

**OPA/Gatekeeper** (policy enforcement):

- Enforce: no privileged containers, no host networking, required resource limits, required security contexts, image registry allowlisting.
- Audit mode first, then enforce mode after validation.

**Runtime monitoring stack**:

| Tool | Purpose | Layer |
|------|---------|-------|
| Falco | Syscall-level threat detection | Container runtime |
| OPA Gatekeeper | Admission control policies | Kubernetes API |
| Network policies | L3/L4 segmentation | Pod networking |
| Service mesh | L7 authorization | Application traffic |
| SIEM integration | Centralized alerting | Observability |

### 4.4 Dependency Scanning Per Service

Each microservice maintains its own dependency tree and must be scanned independently.

**Requirements**:

- Run `npm audit` / `pnpm audit` / `pip audit` in CI for every service on every PR.
- Fail the build on CRITICAL or HIGH vulnerabilities without an approved exception.
- Generate SBOM (Software Bill of Materials) per service using CycloneDX or SPDX format.
- Monitor SBOMs continuously for newly disclosed CVEs (Dependabot, Snyk, Socket.dev).
- Pin all dependencies to exact versions; verify lockfile integrity in CI.
- Block exotic transitive dependencies (git URLs, tarball URLs) in production builds.

**Supply chain attack mitigations** (OWASP A03:2025):

- Private registry scoping to prevent dependency confusion.
- Minimum release age policy (24h delay on new versions) to allow malware detection.
- Audit `postinstall` scripts; disable or allowlist explicitly.

---

## 5. Migration-Specific Risks

### 5.1 Increased Attack Surface During Transition

During the migration, both the monolith and new microservices run simultaneously. This creates a dual attack surface.

**Risk**: The monolith's internal function calls become network calls to microservices. Each new network boundary is a potential attack vector.

**Mitigations**:

1. **Strangler Fig pattern with security gates**: As each domain is extracted, apply full security controls (mTLS, JWT validation, network policies) from day one. Never "add security later."
2. **Anti-corruption layer**: Place a security boundary between the monolith and new services. The monolith communicates with microservices through authenticated API calls, not direct database access to the new service's data store.
3. **Dual-write monitoring**: If the monolith and a new service both write to the same data store during migration, implement audit logging to detect inconsistencies and unauthorized writes.
4. **Incremental mTLS rollout**: Start with permissive mode (allow plaintext fallback) only in the migration namespace. Set a firm deadline for strict mode enforcement (no more than 30 days per service extraction).
5. **Feature flags for security controls**: Use feature flags to enable security enforcement per-service, allowing rollback if a security control breaks functionality during migration.

### 5.2 Credential Sprawl as Services Multiply

The monolith has one set of credentials. Twenty microservices need twenty sets of credentials, each with different scopes.

**Risk**: Manual credential management leads to long-lived credentials, shared credentials between services, credentials in environment variables or config files, and forgotten credentials that are never rotated.

**Mitigations**:

1. **Centralized secrets management from day one** (Vault/AWS Secrets Manager). Never start with environment variables "temporarily."
2. **Dynamic credentials**: Use Vault's database secrets engine to generate short-lived, per-request database credentials. No static database passwords.
3. **Service identity via Kubernetes service accounts**: Each service has a unique K8s service account mapped to a Vault role. No shared credentials.
4. **Credential inventory**: Maintain a registry of all credentials, their owners, rotation schedules, and expiry dates. Audit monthly.
5. **Automated rotation**: All credentials must rotate automatically. Manual rotation is a security incident waiting to happen.
6. **Scope minimization**: Each credential grants the minimum permissions required. A service that only reads from a database gets read-only credentials.

### 5.3 Logging and Audit Trail Continuity

When the monolith handled everything, a single log stream captured the full request lifecycle. In microservices, a single user request may span 5-10 services.

**Risk**: Fragmented logs make incident investigation, compliance auditing, and forensics significantly harder.

**Mitigations**:

1. **Distributed tracing** (OpenTelemetry): Propagate trace IDs (W3C TraceContext) across all service boundaries. Every log line includes `trace_id` and `span_id`.
2. **Structured logging**: All services use JSON-structured logs with consistent fields: `timestamp`, `level`, `service`, `trace_id`, `span_id`, `user_id` (when applicable), `action`, `outcome`.
3. **Centralized log aggregation**: Ship all logs to a centralized system (Loki, Elasticsearch, CloudWatch Logs). Retain for compliance-required duration (typically 1-7 years depending on regulation).
4. **Security event logging**: Log all security-relevant events across all services:
   - Authentication successes and failures
   - Authorization denials
   - Token validation failures
   - Rate limit triggers
   - Input validation failures
   - Admin/privileged operations
5. **Audit log immutability**: Security audit logs must be written to append-only storage. No service should be able to delete or modify its own audit logs.
6. **Migration continuity**: During the transition period, ensure the monolith's existing audit trail is preserved and accessible. New microservice logs must be queryable alongside legacy logs.

---

## 6. STRIDE Threat Model Summary

| Threat | Microservices-Specific Vector | Primary Control | Defense-in-Depth |
|--------|-------------------------------|-----------------|------------------|
| **Spoofing** | Forged service identity on internal network | mTLS with SPIFFE IDs | JWT validation at application layer |
| **Tampering** | Man-in-the-middle on east-west traffic | mTLS encryption | Message signing for event payloads |
| **Repudiation** | Distributed logs make attribution difficult | Centralized logging with trace IDs | Immutable audit log storage |
| **Info Disclosure** | PII leaked via over-fetched API responses | Field-level access control, token scoping | Tokenization of sensitive fields |
| **Denial of Service** | Cascading failure across service chain | Circuit breakers, rate limiting | Bulkhead isolation per service |
| **Elevation of Privilege** | Compromised service uses broad token scope | Token downscoping, least privilege | Network policies limiting blast radius |

---

## 7. Security Controls Checklist

### Pre-Migration (Must be in place before extracting the first service)

- [ ] Centralized Auth Service deployed with JWKS endpoint
- [ ] Private PKI or service mesh CA operational
- [ ] Secrets management platform (Vault) deployed and configured
- [ ] Container image scanning integrated into CI/CD
- [ ] Centralized logging and distributed tracing operational
- [ ] Kubernetes NetworkPolicies set to deny-by-default in production namespace
- [ ] OPA Gatekeeper / Kyverno admission policies enforced
- [ ] SBOM generation pipeline configured

### Per-Service Extraction

- [ ] Service has unique client_id and client_secret in Vault
- [ ] Service validates JWTs locally (signature, exp, iss, aud, scope)
- [ ] Service's database is isolated (no shared access)
- [ ] Service's database connection uses TLS and dynamic credentials
- [ ] mTLS enabled for all inbound and outbound traffic
- [ ] NetworkPolicy restricts ingress to known callers only
- [ ] Container runs as non-root with read-only filesystem
- [ ] Dependency scan passes with no CRITICAL/HIGH CVEs
- [ ] Container image is signed and verified by admission controller
- [ ] Structured logging with trace_id propagation
- [ ] Security events (auth failures, authz denials) logged
- [ ] API documentation includes security requirements (auth, scopes, rate limits)
- [ ] PII fields identified and handling documented (GDPR ROPA entry)

### Post-Migration Steady State

- [ ] Monolith decommissioned; no dual-write paths remain
- [ ] All services in strict mTLS mode (permissive mode disabled)
- [ ] Credential rotation automated for all services
- [ ] DSAR coordinator service operational
- [ ] User deletion event propagation tested end-to-end
- [ ] Incident response runbook updated for microservices architecture
- [ ] Penetration test completed against the new architecture
- [ ] Compliance audit (SOC2/HIPAA/GDPR/PCI-DSS) passed

---

## Appendix A: Technology Recommendations

| Concern | Recommended | Alternatives |
|---------|------------|--------------|
| Service Mesh | Istio (mature mTLS + AuthzPolicy) | Linkerd (lighter), Cilium (eBPF) |
| Secrets | HashiCorp Vault | AWS Secrets Manager, Azure Key Vault |
| Image Scanning | Trivy (OSS) | Grype, Snyk Container |
| Image Signing | Cosign (Sigstore) | Notary v2 |
| Admission Control | Kyverno | OPA Gatekeeper |
| Runtime Detection | Falco | Sysdig Secure |
| Tracing | OpenTelemetry | Jaeger, Tempo |
| Logging | Loki + Grafana | Elasticsearch, CloudWatch |
| SBOM | CycloneDX | SPDX |
| Dependency Scanning | Socket.dev + npm audit | Snyk, Dependabot |

## Appendix B: Compliance Mapping

| Requirement | GDPR | SOC2 | PCI-DSS | HIPAA | Section |
|-------------|------|------|---------|-------|---------|
| Encryption in transit | Art. 32 | CC6.1 | Req 4 | 164.312(e) | 2.4 |
| Encryption at rest | Art. 32 | CC6.1 | Req 3 | 164.312(a) | 3.2 |
| Access control | Art. 25 | CC6.3 | Req 7 | 164.312(a) | 1.1-1.5 |
| Audit logging | Art. 30 | CC7.2 | Req 10 | 164.312(b) | 5.3 |
| Data minimization | Art. 5(1)(c) | -- | Req 3.4 | 164.502(b) | 3.3 |
| Incident response | Art. 33 | CC7.4 | Req 12 | 164.308(a)(6) | 5.3 |
| Vulnerability mgmt | -- | CC7.1 | Req 6 | 164.308(a)(1) | 4.1, 4.4 |

---

*End of security architecture supplement. This document should be reviewed alongside the microservices-architect's migration plan and updated as architectural decisions evolve.*
