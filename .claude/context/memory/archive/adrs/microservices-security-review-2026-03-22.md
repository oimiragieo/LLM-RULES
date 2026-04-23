<!-- Agent: security-architect | Task: #task-2 | Session: 2026-03-22 -->

# Security Architecture Review: Monolith-to-Microservices Migration

**Version:** 2.0.0
**Date:** 2026-03-22
**Status:** Security Architecture Review
**Author:** Security Architect Agent (Claude Opus 4.6)
**Classification:** Internal -- Architecture Decision Support
**Frameworks Applied:** STRIDE, OWASP Top 10 2025, OWASP Agentic AI Top 10, OAuth 2.1, NIST SP 800-204

---

## Table of Contents

1. [Authentication and Authorization](#1-authentication-and-authorization)
2. [Network Security](#2-network-security)
3. [Data Security](#3-data-security)
4. [API Security](#4-api-security)
5. [Observability and Incident Response](#5-observability-and-incident-response)
6. [Supply Chain and Container Security](#6-supply-chain-and-container-security)
7. [Threat Model (STRIDE)](#7-threat-model-stride)

---

## 1. Authentication and Authorization

### 1.1 Centralized vs Distributed Auth

In a monolith, authentication and authorization are a single concern handled in one middleware stack. Microservices force a fundamental decision: centralize auth at the gateway or distribute it across services.

**Recommended Architecture: Centralized Authentication, Distributed Authorization**

```
                          +-------------------+
  Client --> [TLS] -->    | API Gateway       |   <-- AuthN happens HERE
                          | (OAuth 2.1 + PKCE)|
                          +--------+----------+
                                   |
                          JWT (signed, short-lived)
                                   |
            +----------+-----------+-----------+----------+
            |          |           |           |          |
         Service A  Service B  Service C  Service D  Service E
         (RBAC)    (ABAC)     (RBAC)     (ABAC)    (RBAC)
            |          |           |           |          |
         AuthZ is LOCAL to each service (owns its policies)
```

**Why this split:**

- **Authentication (AuthN)** is identity verification -- it answers "who are you?" There is exactly one source of truth for identity. Centralizing it at the gateway avoids N implementations of the same login flow, each with its own bugs and drift.
- **Authorization (AuthZ)** is access control -- it answers "are you allowed to do this?" Each service owns its domain data and therefore must own its access policies. Centralizing AuthZ creates a bottleneck and couples every service to a single policy engine's availability.

**Centralized AuthN implementation:**

| Component               | Technology                       | Purpose                                          |
| ----------------------- | -------------------------------- | ------------------------------------------------ |
| Identity Provider (IdP) | Keycloak, Auth0, Okta, or custom | User directory, MFA, session management          |
| Authorization Server    | Same IdP or dedicated (Hydra)    | OAuth 2.1 token issuance, PKCE enforcement       |
| API Gateway             | Kong, Envoy, AWS API Gateway     | Token validation, rate limiting, TLS termination |
| Token Format            | JWT (RS256 or ES256)             | Stateless, verifiable, carries claims            |

**OAuth 2.1 Compliance (MANDATORY -- see RFC draft-ietf-oauth-v2-1):**

- PKCE is REQUIRED for ALL clients (public and confidential). No exceptions.
- Implicit grant (`response_type=token`) is REMOVED. Do not implement.
- Resource Owner Password Credentials (ROPC) is REMOVED. Do not implement.
- Bearer tokens in URI query parameters are FORBIDDEN. Use `Authorization: Bearer` header only.
- Exact redirect URI matching is REQUIRED. No wildcards, no partial matches.
- Refresh token rotation with reuse detection is REQUIRED.

### 1.2 Service-to-Service Authentication (East-West Traffic)

In a monolith, services communicate via in-process function calls. No authentication is needed because there is no network boundary. Microservices introduce N\*(N-1)/2 potential network paths, each requiring authentication.

**Pattern A: Mutual TLS (mTLS) -- RECOMMENDED BASELINE**

Each service holds a unique X.509 certificate issued by an internal PKI. Both sides of every connection verify the peer's certificate. This provides authentication, encryption, and integrity in a single mechanism at the transport layer.

```
Service A                          Service B
+--------+                        +--------+
| App    |  <-- mTLS handshake --> | App    |
| Envoy  |  (verify cert chain)   | Envoy  |
| Sidecar|                        | Sidecar|
+--------+                        +--------+
    |                                  |
    +-- SPIFFE SVID (short-lived) -----+
    |   rotated every ~1 hour          |
    +-- Issued by SPIRE Server --------+
```

- Pros: Network-layer enforcement (zero application code changes), tamper-proof identity, works with any protocol (HTTP, gRPC, TCP)
- Cons: Certificate lifecycle management overhead, requires PKI infrastructure (SPIFFE/SPIRE or Istio CA)
- When: Default choice for ALL east-west traffic. Non-negotiable for zero-trust.

**Pattern B: JWT Token Propagation**

The API gateway validates the user's JWT and forwards it (or a derived internal token) to downstream services. Each service validates the JWT signature independently.

- Pros: Carries user identity and claims through the call chain, enables user-context-aware authorization
- Cons: Does not authenticate the _calling service_ (only the user), token lifetime must be short (<=15 minutes), vulnerable to token replay between services
- When: Layered ON TOP of mTLS when downstream services need user context for authorization decisions

**Pattern C: SPIFFE/SPIRE (Recommended for Kubernetes)**

Provides workload identity via SVIDs (SPIFFE Verifiable Identity Documents). Each workload receives a cryptographic identity based on its runtime attestation, not static credentials.

- Pros: Short-lived automatic certificates (~1 hour), identity independent of network topology, integrates with Istio/Envoy
- Cons: Requires SPIRE server infrastructure, adds operational complexity
- When: Kubernetes-native deployments, zero-trust mandates, regulated industries

**Recommendation:** Use mTLS via service mesh (Istio/Linkerd) as the baseline. Layer JWT propagation on top for user-context-aware authorization. Use SPIFFE/SPIRE for workload attestation in Kubernetes.

### 1.3 API Gateway as Auth Enforcement Point

The API gateway is the ONLY ingress from external clients. It MUST enforce:

| Control          | Implementation                                                  | Priority       |
| ---------------- | --------------------------------------------------------------- | -------------- |
| Token validation | Verify JWT signature (RS256/ES256), expiry, audience, issuer    | P0 -- CRITICAL |
| PKCE enforcement | Reject authorization requests without `code_challenge`          | P0 -- CRITICAL |
| Rate limiting    | Per-client, per-endpoint, sliding window                        | P0 -- CRITICAL |
| TLS termination  | TLS 1.3 preferred, TLS 1.2 minimum, HSTS enabled                | P0 -- CRITICAL |
| Input validation | Request size limits, content-type validation, schema validation | P1 -- HIGH     |
| CORS enforcement | Explicit origin allowlist, no wildcards                         | P1 -- HIGH     |
| Request logging  | Structured audit log of all auth decisions                      | P1 -- HIGH     |
| IP allowlisting  | For admin/internal endpoints                                    | P2 -- MEDIUM   |
| WAF integration  | OWASP CRS ruleset                                               | P2 -- MEDIUM   |

**Anti-pattern:** Services behind the gateway that accept requests directly (bypassing the gateway). Every service MUST reject traffic that does not originate from the mesh or gateway. Enforce this with network policies.

### 1.4 Fine-Grained Authorization (RBAC/ABAC per Service)

Each service owns its authorization policies. Two models:

**RBAC (Role-Based Access Control):**

- Roles assigned to users/service accounts: `admin`, `editor`, `viewer`, `service:billing`
- Permissions mapped to roles: `billing:read`, `billing:write`, `billing:admin`
- Simple, auditable, sufficient for most services
- JWT carries role claims; service enforces locally

**ABAC (Attribute-Based Access Control):**

- Policies evaluate attributes: user department, resource owner, time of day, IP range
- More expressive than RBAC; supports context-dependent authorization
- Use for services with complex access rules (multi-tenant data, regulatory constraints)
- Policy engine: Open Policy Agent (OPA) or Cedar (AWS)

**Recommended pattern:**

```
JWT claims:
{
  "sub": "user_12345",
  "roles": ["editor"],
  "tenant_id": "acme_corp",
  "scope": "read:orders write:orders"
}

Service-level enforcement:
1. Validate JWT signature (already done at gateway, belt-and-suspenders)
2. Extract roles/scopes from claims
3. Evaluate against LOCAL policy (OPA sidecar or in-process)
4. Deny by default -- explicit allow only
```

**Authorization architecture decision:**

| Service Type           | Model | Engine                | Rationale                                             |
| ---------------------- | ----- | --------------------- | ----------------------------------------------------- |
| CRUD services          | RBAC  | In-process middleware | Simple role checks, low latency                       |
| Multi-tenant           | ABAC  | OPA sidecar           | Tenant isolation requires attribute evaluation        |
| Regulatory (PCI/HIPAA) | ABAC  | OPA + audit log       | Compliance requires fine-grained, auditable decisions |
| Internal tooling       | RBAC  | JWT scope claims      | Low complexity, internal users only                   |

---

## 2. Network Security

### 2.1 Zero-Trust Networking Between Services

**Core principle:** Never trust, always verify. Every service-to-service call must be authenticated and authorized, regardless of network location.

In a monolith, the network perimeter is the security boundary. Microservices eliminate the concept of a trusted internal network.

**Zero-trust implementation layers:**

| Layer         | Control                                     | Implementation                           |
| ------------- | ------------------------------------------- | ---------------------------------------- |
| Identity      | Every workload has a cryptographic identity | SPIFFE/SPIRE SVIDs                       |
| Transport     | All traffic encrypted and authenticated     | mTLS via service mesh                    |
| Authorization | Every request checked against policy        | OPA/Envoy authorization filter           |
| Observability | All traffic logged and traced               | Distributed tracing (Jaeger/Tempo)       |
| Network       | Micro-segmentation, deny-by-default         | Kubernetes NetworkPolicy + Calico/Cilium |

**Zero-trust checklist:**

- [ ] No service trusts another service based on network location alone
- [ ] All service-to-service communication uses mTLS
- [ ] Authorization policies are evaluated on every request (not cached for session duration)
- [ ] Network policies deny all ingress/egress by default; explicit allow rules per service pair
- [ ] Workload identities are short-lived and automatically rotated
- [ ] Lateral movement is detectable via anomaly detection on east-west traffic patterns

### 2.2 Service Mesh Security (mTLS, Network Policies)

**Service mesh (Istio/Linkerd) provides:**

1. **Automatic mTLS:** Sidecar proxies handle certificate issuance, rotation, and mTLS handshake. Zero application code changes.
2. **Traffic policies:** Define which services can communicate with which (`AuthorizationPolicy` in Istio).
3. **Observability:** Automatic metrics, traces, and access logs for all mesh traffic.
4. **Retry/timeout/circuit-breaker:** Resilience patterns enforced at the proxy layer.

**Istio security configuration (example):**

```yaml
# Enforce mTLS mesh-wide
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system
spec:
  mtls:
    mode: STRICT # NEVER use PERMISSIVE in production

---
# Authorization: billing can only be called by order-service
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: billing-access
  namespace: production
spec:
  selector:
    matchLabels:
      app: billing-service
  rules:
    - from:
        - source:
            principals: ['cluster.local/ns/production/sa/order-service']
      to:
        - operation:
            methods: ['POST']
            paths: ['/api/v1/charges']
```

**CRITICAL:** Never use `PERMISSIVE` mTLS mode in production. It allows plaintext fallback, defeating the purpose of mTLS entirely.

### 2.3 Ingress/Egress Controls

**Ingress (North-South, external to cluster):**

- Single ingress point: API Gateway (Kong, Envoy, AWS ALB)
- TLS termination at gateway; re-encryption into mesh (TLS 1.3)
- WAF in front of gateway (AWS WAF, Cloudflare, ModSecurity)
- DDoS protection (cloud-native: AWS Shield, Cloudflare)
- Geographic IP filtering for admin endpoints

**Egress (Cluster to external):**

- Deny all egress by default (Kubernetes NetworkPolicy)
- Explicit allowlist for required external services (payment gateways, email providers, etc.)
- Egress proxy (Envoy or Squid) for logging and auditing outbound traffic
- DNS-based filtering to prevent data exfiltration via DNS tunneling
- TLS verification on all outbound connections (no `rejectUnauthorized: false`)

```yaml
# Kubernetes NetworkPolicy: deny all egress by default
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all-egress
  namespace: production
spec:
  podSelector: {}
  policyTypes:
    - Egress
  egress: [] # No egress allowed

---
# Allow specific egress for payment-service
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: payment-egress
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: payment-service
  policyTypes:
    - Egress
  egress:
    - to:
        - ipBlock:
            cidr: 54.230.0.0/16 # Stripe API IP range
      ports:
        - protocol: TCP
          port: 443
```

### 2.4 Network Segmentation Strategy

**Segmentation tiers:**

| Tier        | Purpose             | Services                           | Network Boundary                                          |
| ----------- | ------------------- | ---------------------------------- | --------------------------------------------------------- |
| DMZ         | Public-facing       | API Gateway, CDN origin            | Separate VPC/subnet, WAF                                  |
| Application | Business logic      | Order, User, Product, Billing      | Private subnet, no direct internet                        |
| Data        | Persistent stores   | PostgreSQL, Redis, Elasticsearch   | Isolated subnet, no ingress except from Application tier  |
| Management  | Platform services   | Kubernetes API, CI/CD, monitoring  | Separate VPC, VPN-only access                             |
| Sensitive   | PCI/HIPAA workloads | Payment processing, health records | Dedicated namespace, additional encryption, audit logging |

**Cross-tier rules:**

- DMZ to Application: allowed (via gateway only)
- Application to Data: allowed (service-specific credentials)
- Application to Application: allowed (within same tier, via mesh)
- Data to anything: DENIED (databases never initiate connections)
- Management to all: allowed (via bastion/VPN only)
- Sensitive to Application: allowed (mTLS + additional authorization)

---

## 3. Data Security

### 3.1 Data-in-Transit Encryption

**Requirement:** TLS EVERYWHERE. No exceptions. No plaintext traffic, not even between services in the same Kubernetes namespace.

| Path                     | Encryption                   | Minimum Version | Certificate Source                    |
| ------------------------ | ---------------------------- | --------------- | ------------------------------------- |
| Client to Gateway        | TLS 1.3 (preferred), TLS 1.2 | TLS 1.2         | Public CA (Let's Encrypt, commercial) |
| Gateway to Service       | mTLS                         | TLS 1.2         | Internal CA (SPIRE, Istio CA)         |
| Service to Service       | mTLS                         | TLS 1.2         | Internal CA (SPIRE, Istio CA)         |
| Service to Database      | TLS (server-verified)        | TLS 1.2         | Internal CA                           |
| Service to Cache         | TLS                          | TLS 1.2         | Internal CA or cloud-managed          |
| Service to Message Queue | TLS                          | TLS 1.2         | Internal CA or cloud-managed          |

**Cipher suite restrictions:**

- Allow: TLS_AES_128_GCM_SHA256, TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256
- Deny: All CBC-mode ciphers, RC4, 3DES, NULL ciphers, export ciphers
- HSTS: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`

### 3.2 Data-at-Rest Encryption per Service Database

Each microservice owns its database. Each database MUST encrypt data at rest independently.

| Database Type       | Encryption Method                                                            | Key Management                              |
| ------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- |
| PostgreSQL          | TDE (Transparent Data Encryption) or volume-level (LUKS, AWS EBS encryption) | Cloud KMS (AWS KMS, GCP Cloud KMS)          |
| MongoDB             | Encrypted Storage Engine (WiredTiger)                                        | Key vault integration                       |
| Redis               | Not natively encrypted -- use volume encryption + TLS for transport          | Cloud-managed Redis with encryption enabled |
| Elasticsearch       | Encrypted-at-rest via searchable encryption or volume encryption             | Cloud KMS                                   |
| Object Storage (S3) | SSE-S3 or SSE-KMS (server-side encryption)                                   | AWS KMS with CMK                            |

**Envelope encryption pattern:**

```
1. Data Encryption Key (DEK) -- generated per record or per partition
2. DEK encrypts the data (AES-256-GCM)
3. Key Encryption Key (KEK) -- stored in KMS, never leaves KMS boundary
4. KEK encrypts the DEK
5. Encrypted DEK stored alongside encrypted data
6. Decryption: KMS decrypts DEK, DEK decrypts data
```

**Backup encryption:** All database backups MUST be encrypted with a separate key from the production data key. Backup keys must be stored in a different KMS region or account.

### 3.3 Secrets Management

**Requirement:** No service stores secrets in environment variables, config files, or container images. All secrets are fetched at runtime from a centralized secrets manager.

**Architecture:**

```
+-------------------+         +------------------+
|  HashiCorp Vault  |  <----> | Cloud KMS        |
|  (secrets engine) |         | (unsealing, root |
|                   |         |  key protection) |
+--------+----------+         +------------------+
         |
   Vault Agent Sidecar (injected into each pod)
         |
   +-----+------+------+------+------+
   |     |      |      |      |      |
  Svc A Svc B  Svc C  Svc D  Svc E  Svc F
  (DB   (API   (JWT   (SMTP  (S3    (Encryption
   pwd)  key)   secret) creds) creds) key)
```

**Secrets lifecycle:**

| Phase      | Control                                                       | Frequency        |
| ---------- | ------------------------------------------------------------- | ---------------- |
| Generation | Cryptographically random, minimum 256 bits                    | On creation      |
| Storage    | Encrypted in Vault, ACL-protected per service                 | Persistent       |
| Delivery   | Vault Agent sidecar, Kubernetes CSI driver, or init container | On pod startup   |
| Rotation   | Automatic rotation, zero-downtime (dual-read period)          | Every 30-90 days |
| Revocation | Immediate revocation via Vault lease system                   | On incident      |
| Audit      | All access logged to SIEM                                     | Continuous       |

**Anti-patterns (NEVER):**

- Secrets in environment variables (visible in process listings, crash dumps)
- Secrets in Docker image layers (extractable from image history)
- Secrets in git (even if later deleted -- still in history)
- Shared secrets across services (compromise of one compromises all)
- Long-lived secrets without rotation (increases window of exploitation)

### 3.4 PII Handling Across Service Boundaries

**Data classification:**

| Classification | Examples                                  | Handling Requirements                                                       |
| -------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| PUBLIC         | Product names, prices, categories         | No restrictions on transit or storage                                       |
| INTERNAL       | Order IDs, employee names                 | Encrypted in transit, access-controlled                                     |
| CONFIDENTIAL   | Email addresses, phone numbers, addresses | Encrypted at rest and in transit, access-logged, minimized                  |
| RESTRICTED     | SSN, credit card numbers, health records  | Encrypted everywhere, tokenized, access requires justification, audit trail |

**Cross-service PII rules:**

1. **Data minimization:** Services request only the PII fields they need. The User Service does not send full profiles to the Billing Service -- only `user_id` and `billing_address`.
2. **Tokenization:** RESTRICTED data (credit cards, SSN) is tokenized. Services work with tokens; only the tokenization service can resolve tokens to values.
3. **Right to deletion (GDPR Art. 17):** Each service must implement a `deleteUserData(userId)` endpoint. An orchestrator calls all services on erasure request.
4. **Data residency:** PII for EU users stored in EU region. Service-level routing based on user metadata.
5. **Logging sanitization:** PII NEVER appears in logs. Use `user_id` for correlation, never email/name/address.

### 3.5 Data Access Controls

**Per-service database isolation:**

- Each service has its own database credentials (no shared database accounts)
- Credentials have minimum required permissions (SELECT only for read services, no DDL permissions for application accounts)
- Connection pools use TLS with server certificate verification
- Database audit logging enabled for all DML operations on sensitive tables

---

## 4. API Security

### 4.1 API Gateway Security

The API Gateway is the single enforcement point for all external API traffic.

**Required controls:**

| Control                  | Configuration                                      | Rationale                                            |
| ------------------------ | -------------------------------------------------- | ---------------------------------------------------- |
| Rate limiting            | 100 req/min per client (configurable per endpoint) | Prevent abuse, protect backend services              |
| Request size limit       | 1 MB default, 10 MB for file uploads               | Prevent resource exhaustion                          |
| Timeout enforcement      | 30s gateway timeout, 15s upstream timeout          | Prevent slow-loris and connection exhaustion         |
| Input validation         | JSON schema validation at gateway                  | Reject malformed requests before they reach services |
| Content-type enforcement | Reject requests with unexpected Content-Type       | Prevent content-type confusion attacks               |
| CORS policy              | Explicit origin allowlist, no wildcards            | Prevent cross-origin attacks                         |
| WAF                      | OWASP Core Rule Set (CRS) v4                       | Block known attack patterns (SQLi, XSS, LFI)         |
| Bot detection            | Challenge-response for suspicious traffic patterns | Prevent automated abuse                              |
| Request ID injection     | X-Request-ID header for distributed tracing        | Forensic correlation                                 |

### 4.2 OWASP API Security Top 10 Mitigations

| #     | Risk                                            | Mitigation                                                                                                 |
| ----- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| API1  | Broken Object Level Authorization               | Validate resource ownership on EVERY request. Never rely on client-supplied IDs without ownership check.   |
| API2  | Broken Authentication                           | OAuth 2.1 + PKCE, short-lived tokens (<=15 min), MFA for sensitive operations                              |
| API3  | Broken Object Property Level Authorization      | Response filtering -- never return fields the caller is not authorized to see. Use DTOs, not raw entities. |
| API4  | Unrestricted Resource Consumption               | Rate limiting, pagination limits, query complexity limits, request size limits                             |
| API5  | Broken Function Level Authorization             | Role-based endpoint access; admin endpoints on separate path with additional auth                          |
| API6  | Unrestricted Access to Sensitive Business Flows | Business logic rate limiting (e.g., max 3 password reset requests per hour)                                |
| API7  | Server Side Request Forgery (SSRF)              | Validate/sanitize all URLs; use allowlists for outbound requests; block internal IP ranges                 |
| API8  | Security Misconfiguration                       | Automated security headers, remove default credentials, disable unnecessary HTTP methods                   |
| API9  | Improper Inventory Management                   | API registry/catalog, deprecation policy, version sunset enforcement                                       |
| API10 | Unsafe Consumption of APIs                      | Validate responses from third-party APIs; treat external data as untrusted input                           |

### 4.3 API Versioning and Deprecation Security

**Versioning strategy:**

- URL path versioning: `/api/v1/`, `/api/v2/` (recommended for simplicity and cacheability)
- Version lifecycle: Active (fully supported) -> Deprecated (security patches only, 6-month notice) -> Sunset (returns 410 Gone)
- Security patches backported to all active versions

**Deprecation security risks:**

- Old API versions may lack security controls added to newer versions
- Clients stuck on deprecated versions are vulnerable to known issues
- Sunset enforcement prevents indefinite exposure of legacy attack surface

**Policy:**

| State      | Security Updates       | New Features | Timeline                          |
| ---------- | ---------------------- | ------------ | --------------------------------- |
| Active     | YES                    | YES          | Current                           |
| Deprecated | Security-critical only | NO           | 6 months after deprecation notice |
| Sunset     | NO                     | NO           | Hard removal, 410 response        |

### 4.4 GraphQL/gRPC Security Considerations

**GraphQL:**

| Risk                        | Mitigation                                                          |
| --------------------------- | ------------------------------------------------------------------- |
| Query depth attacks         | Enforce maximum query depth (e.g., 10 levels)                       |
| Query complexity abuse      | Assign cost to each field; reject queries exceeding cost budget     |
| Introspection in production | DISABLE introspection in production (`introspection: false`)        |
| Batching attacks            | Limit batch size; rate-limit by query count, not HTTP request count |
| Authorization bypass        | Field-level authorization, not just type-level                      |
| Injection via variables     | Validate all variable inputs against expected types                 |

**gRPC:**

| Risk                     | Mitigation                                                       |
| ------------------------ | ---------------------------------------------------------------- |
| Message size attacks     | Set `MaxRecvMsgSize` and `MaxSendMsgSize` (default 4 MB)         |
| Stream abuse             | Limit concurrent streams per connection; enforce keepalive       |
| Reflection in production | Disable gRPC reflection service in production                    |
| Missing TLS              | Always use gRPC with TLS (`grpc.WithTransportCredentials`)       |
| Proto definition leaks   | Do not expose .proto files publicly                              |
| Interceptor bypass       | Apply auth interceptors to ALL services, including health checks |

---

## 5. Observability and Incident Response

### 5.1 Security Logging and Audit Trails

**Logging architecture for microservices:**

```
Service A ---|                          +--------------------+
Service B ---|--- Structured Logs ----->| Log Aggregator     |---> SIEM
Service C ---|   (JSON, OpenTelemetry)  | (Loki, ELK, Splunk)|     (Sentinel,
Service D ---|                          +--------------------+      Elastic SIEM)
                                               |
                                        +------+------+
                                        | Alert Rules |
                                        | (Prometheus |
                                        |  Alertmanager)|
                                        +-------------+
```

**Security events that MUST be logged:**

| Event Category | Examples                                                            | Severity    |
| -------------- | ------------------------------------------------------------------- | ----------- |
| Authentication | Login success/failure, token issuance, token refresh, MFA challenge | HIGH        |
| Authorization  | Access denied, role change, permission escalation                   | HIGH        |
| Data access    | PII read/write, bulk export, sensitive field access                 | MEDIUM-HIGH |
| Configuration  | Secret rotation, policy change, certificate renewal                 | MEDIUM      |
| Error          | Unhandled exception, circuit breaker open, timeout                  | MEDIUM      |
| Network        | Blocked connection, mTLS failure, unexpected source IP              | HIGH        |

**Log format (structured JSON, OpenTelemetry-compatible):**

```json
{
  "timestamp": "2026-03-22T10:30:00.000Z",
  "level": "warn",
  "service": "order-service",
  "version": "2.3.1",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "event": "authorization_denied",
  "user_id": "usr_456def",
  "resource": "/api/v1/orders/ord_789",
  "action": "DELETE",
  "reason": "insufficient_role",
  "required_role": "admin",
  "actual_role": "viewer",
  "source_ip": "10.0.3.45",
  "request_id": "req_abc123"
}
```

**Log integrity:**

- Logs shipped to immutable storage (append-only, write-once-read-many)
- Log tampering detection via hash chains or cryptographic signatures
- Retention: 90 days hot, 1 year warm, 7 years cold (compliance-dependent)

### 5.2 Distributed Tracing for Security Forensics

**Why tracing matters for security:** In a monolith, a single stack trace tells you the full request path. In microservices, a single request may traverse 5-15 services. Without distributed tracing, reconstructing an attack path is impossible.

**Implementation:**

- OpenTelemetry SDK in every service (auto-instrumentation preferred)
- W3C TraceContext headers propagated through all service calls
- Trace collector: Jaeger, Tempo, or cloud-native (AWS X-Ray, GCP Cloud Trace)
- Sampling: 100% for error/security events, 10-20% for normal traffic

**Security-specific trace enrichment:**

```
Span attributes for security events:
  security.event_type: "auth_failure" | "authz_denied" | "rate_limited" | "input_validation_failed"
  security.severity: "critical" | "high" | "medium" | "low"
  security.user_id: "usr_12345"
  security.source_service: "api-gateway"
  security.target_resource: "/api/v1/admin/users"
  security.policy_name: "admin-only-access"
```

**Forensic workflow:**

1. Alert triggers on anomalous pattern (e.g., 50 auth failures from one IP in 5 minutes)
2. Extract `trace_id` from alert context
3. Query trace backend for full request chain
4. Identify which services were touched, what data was accessed, what succeeded/failed
5. Correlate with log aggregator for detailed event context
6. Determine blast radius and containment actions

### 5.3 Anomaly Detection in Inter-Service Communication

**Baseline establishment:**

- Normal traffic patterns: which services call which, at what rate, with what latency
- Build baseline over 2-4 weeks of production traffic
- Use service mesh telemetry (Istio metrics) as data source

**Anomaly indicators:**

| Indicator                           | Detection Method                                   | Response                |
| ----------------------------------- | -------------------------------------------------- | ----------------------- |
| Unexpected service-to-service call  | Service mesh policy violation (denied connections) | Alert + block           |
| Traffic volume spike (10x baseline) | Prometheus alert on rate metric                    | Alert + investigate     |
| New source IP for internal traffic  | Istio access log analysis                          | Alert + investigate     |
| Elevated error rate (>5% 5xx)       | SLO burn-rate alert                                | Alert + circuit breaker |
| Unusual data access pattern         | Database audit log correlation                     | Alert + flag for review |
| Certificate validation failure      | mTLS handshake failure metrics                     | Alert + block           |
| Lateral movement pattern            | Graph analysis of service call chains              | Alert + isolate         |

### 5.4 Incident Response in a Microservices Environment

**Microservices-specific IR challenges:**

1. **Blast radius assessment** is harder -- an attacker in one service may pivot to others via the mesh
2. **Containment** requires service-level isolation, not just network-level blocking
3. **Evidence collection** spans multiple services, databases, and log streams
4. **Recovery** may require coordinated rollback across services with different release cycles

**IR playbook outline:**

| Phase             | Actions                                                                           | Tools                                 |
| ----------------- | --------------------------------------------------------------------------------- | ------------------------------------- |
| **Detection**     | Alert fires from SIEM/anomaly detection                                           | Prometheus, Alertmanager, SIEM        |
| **Triage**        | Determine affected services via trace analysis; classify severity                 | Jaeger/Tempo, service mesh dashboard  |
| **Containment**   | Isolate compromised service (NetworkPolicy block, scale to 0, or circuit breaker) | kubectl, Istio AuthorizationPolicy    |
| **Eradication**   | Rotate compromised credentials, patch vulnerability, rebuild container image      | Vault, CI/CD pipeline, image registry |
| **Recovery**      | Redeploy clean image, verify mTLS, restore data from encrypted backup             | ArgoCD/Flux, Vault, database restore  |
| **Post-incident** | Blameless post-mortem, update runbooks, improve detection rules                   | Confluence/Notion, Prometheus rules   |

**Containment patterns:**

```yaml
# Emergency: isolate a compromised service from all traffic
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: emergency-isolate-billing
  namespace: production
spec:
  selector:
    matchLabels:
      app: billing-service
  action: DENY
  rules:
    - {} # Deny ALL traffic to this service
```

---

## 6. Supply Chain and Container Security

### 6.1 Container Image Scanning and Signing

**Image lifecycle security:**

```
Developer --> Dockerfile --> Build --> Scan --> Sign --> Registry --> Deploy
                               |         |        |         |
                           Lint check  Trivy/   Cosign/   Harbor/
                           (hadolint)  Grype    Notation  ECR/GCR
                                       |
                                  Block on:
                                  - Critical CVEs
                                  - High CVEs > 30 days
                                  - Known malware
                                  - Non-root user missing
```

**Scanning requirements:**

| Check                       | Tool                 | Blocking Threshold                |
| --------------------------- | -------------------- | --------------------------------- |
| OS-level CVEs               | Trivy, Grype         | Block on CRITICAL; warn on HIGH   |
| Application dependency CVEs | Trivy, Snyk          | Block on CRITICAL; warn on HIGH   |
| Dockerfile best practices   | Hadolint             | Block on DL3000-level errors      |
| Secrets in image layers     | TruffleHog, gitleaks | Block on any detection            |
| Base image currency         | Custom policy        | Block if base image > 30 days old |
| Non-root user enforcement   | Hadolint, OPA        | Block if `USER` directive missing |
| Image size sanity           | Custom check         | Warn if > 500 MB                  |

**Image signing (Cosign/Sigstore):**

```bash
# Sign image after successful scan
cosign sign --key cosign.key ghcr.io/myorg/order-service:v1.2.3

# Verify signature before deployment (admission controller)
cosign verify --key cosign.pub ghcr.io/myorg/order-service:v1.2.3
```

**Admission controller (Kyverno or OPA Gatekeeper):**

- Reject unsigned images
- Reject images from untrusted registries
- Reject images with known critical CVEs
- Enforce image tag immutability (no `:latest` in production)

### 6.2 Runtime Security

**Runtime protection layers:**

| Layer              | Tool                    | Purpose                                                                |
| ------------------ | ----------------------- | ---------------------------------------------------------------------- |
| Syscall filtering  | Falco, Seccomp profiles | Detect/block unexpected system calls                                   |
| File integrity     | Falco, AIDE             | Alert on unexpected file modifications in running containers           |
| Network monitoring | Cilium (eBPF), Falco    | Detect unexpected network connections                                  |
| Process monitoring | Falco                   | Alert on unexpected process execution (e.g., shell in a web container) |
| Memory protection  | gVisor, Kata Containers | Kernel-level isolation for high-risk workloads                         |

**Falco rules (examples):**

```yaml
- rule: Shell spawned in container
  desc: A shell was spawned inside a container that should not have shell access
  condition: >
    container and
    spawned_process and
    proc.name in (bash, sh, zsh, csh, dash) and
    not container.image.repository in (allowed_debug_images)
  output: 'Shell spawned in container (user=%user.name container=%container.name image=%container.image.repository)'
  priority: WARNING

- rule: Unexpected outbound connection
  desc: Container made an outbound connection to an unexpected destination
  condition: >
    container and
    outbound and
    not fd.sip.name in (expected_external_hosts) and
    not fd.sport in (53, 443)
  output: 'Unexpected outbound connection (container=%container.name dest=%fd.sip.name:%fd.sport)'
  priority: CRITICAL
```

### 6.3 Dependency Vulnerability Management Per Service

**Each microservice has its own dependency tree.** This means N services have N sets of dependencies to manage.

**Management strategy:**

| Activity           | Frequency                                    | Tool                                        | Owner               |
| ------------------ | -------------------------------------------- | ------------------------------------------- | ------------------- |
| Dependency audit   | Every CI build                               | `npm audit`, `pnpm audit`, Snyk, Socket.dev | CI pipeline         |
| CVE alerting       | Continuous                                   | Dependabot, Snyk                            | Security team       |
| Patch SLA          | Critical: 24h, High: 7 days, Medium: 30 days | Jira/Linear integration                     | Service team        |
| License compliance | Weekly scan                                  | FOSSA, Licensee                             | Legal + Engineering |
| SBOM generation    | Every release                                | Syft, CycloneDX                             | CI pipeline         |

**Dependency confusion defense:**

- All internal packages scoped under `@orgname/` namespace
- Private registry (Artifactory, npm Enterprise) configured as primary
- `publishConfig` set in all internal packages
- Lockfile committed and verified in CI (`npm ci`, not `npm install`)

### 6.4 CI/CD Pipeline Security (SLSA Framework)

**SLSA (Supply-chain Levels for Software Artifacts) compliance targets:**

| SLSA Level | Requirements                                        | Target                             |
| ---------- | --------------------------------------------------- | ---------------------------------- |
| L1         | Build process exists, documented                    | Baseline                           |
| L2         | Version-controlled build, authenticated provenance  | Minimum for production             |
| L3         | Hardened build platform, non-falsifiable provenance | Target for all services            |
| L4         | Two-party review, hermetic builds                   | Aspirational for critical services |

**Pipeline security controls:**

```
Developer --> PR --> Code Review (2 approvers) --> Merge to main
                           |
                     Static Analysis (SAST)
                     Secret Scanning
                     Dependency Audit
                           |
                     Build (hermetic, reproducible)
                           |
                     Container Image Build
                     Image Scan (Trivy)
                     Image Sign (Cosign)
                           |
                     Integration Tests (isolated env)
                     Security Tests (DAST)
                           |
                     Staging Deploy
                     Smoke Tests
                           |
                     Production Deploy (canary/blue-green)
                     Runtime Monitoring
```

**Pipeline hardening:**

- Pin GitHub Action versions by commit SHA (not floating tags)
- Restrict pipeline secrets to minimum scope per job
- Use OIDC federation instead of long-lived cloud credentials
- Enforce branch protection rules (2 reviewers, required status checks)
- Audit all pipeline modifications via change log
- Separate build and deploy permissions (no single actor: write + deploy)

---

## 7. Threat Model (STRIDE)

### 7.1 STRIDE Analysis for Microservices Architecture

#### Spoofing

| Threat                     | Attack Vector                                             | Affected Component                | Severity | Mitigation                                                                                                                  |
| -------------------------- | --------------------------------------------------------- | --------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| S1: Service impersonation  | Compromised container assumes identity of another service | Service mesh, inter-service calls | CRITICAL | mTLS with SPIFFE/SPIRE; every workload gets unique, short-lived identity certificate                                        |
| S2: User identity spoofing | Stolen or forged JWT                                      | API Gateway, all services         | CRITICAL | RS256/ES256 signatures (never HS256 with shared secret); short expiry (15 min); refresh token rotation with reuse detection |
| S3: API gateway bypass     | Direct access to service ports                            | Network layer                     | HIGH     | Kubernetes NetworkPolicy denying all ingress except from mesh; service mesh `PeerAuthentication: STRICT`                    |
| S4: Token replay           | Intercepted JWT reused on different service               | Inter-service communication       | HIGH     | DPoP (Demonstrating Proof-of-Possession) for sender-constrained tokens; mTLS binding                                        |

#### Tampering

| Threat                        | Attack Vector                               | Affected Component                | Severity | Mitigation                                                               |
| ----------------------------- | ------------------------------------------- | --------------------------------- | -------- | ------------------------------------------------------------------------ |
| T1: Request modification      | Man-in-the-middle on east-west traffic      | Inter-service communication       | CRITICAL | mTLS provides integrity; all traffic encrypted and authenticated         |
| T2: Data tampering in transit | Modified messages between services          | Message queues, event bus         | HIGH     | Message-level signing (JWS) for events; TLS for queue connections        |
| T3: Configuration tampering   | Unauthorized modification of service config | ConfigMaps, environment variables | HIGH     | Immutable ConfigMaps; GitOps with signed commits; OPA admission policies |
| T4: Log tampering             | Attacker modifies logs to cover tracks      | Log pipeline                      | MEDIUM   | Append-only log storage; hash chain verification; ship to immutable SIEM |

#### Repudiation

| Threat                     | Attack Vector                                            | Affected Component | Severity | Mitigation                                                                                                                     |
| -------------------------- | -------------------------------------------------------- | ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| R1: Unattributed actions   | Actions without user context in service-to-service calls | All services       | HIGH     | Propagate user context (JWT claims) through entire call chain; log user_id + trace_id on every action                          |
| R2: Missing audit trail    | Security events not logged                               | All services       | HIGH     | Mandatory audit logging for auth, authz, data access, config changes; log integrity verification                               |
| R3: Timestamp manipulation | Clock skew across services                               | Distributed system | MEDIUM   | NTP synchronization required; include service-local timestamp AND gateway timestamp; tolerate 30s clock skew in JWT validation |

#### Information Disclosure

| Threat                         | Attack Vector                                            | Affected Component | Severity | Mitigation                                                                                                        |
| ------------------------------ | -------------------------------------------------------- | ------------------ | -------- | ----------------------------------------------------------------------------------------------------------------- |
| I1: Secrets in container image | Hard-coded credentials in Dockerfile or image layers     | Container registry | CRITICAL | Secret scanning in CI; Vault for runtime secret delivery; never bake secrets into images                          |
| I2: Error message leakage      | Stack traces or internal details in API responses        | API responses      | HIGH     | Generic error messages to clients; detailed errors to logs only; custom error handler middleware                  |
| I3: PII in logs                | Personal data appearing in log output                    | Log pipeline       | HIGH     | Structured logging with PII sanitization; log review automation; never log request/response bodies containing PII |
| I4: Side-channel data leak     | Timing attacks on authorization checks                   | Auth middleware    | MEDIUM   | Constant-time comparison for secrets; avoid early returns that leak existence of resources                        |
| I5: Database exposure          | Unencrypted database accessible from compromised service | Data tier          | CRITICAL | Encryption at rest; per-service database credentials with minimum privileges; network segmentation                |

#### Denial of Service

| Threat                  | Attack Vector                                         | Affected Component               | Severity | Mitigation                                                                                                        |
| ----------------------- | ----------------------------------------------------- | -------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| D1: Cascading failure   | One service failure cascades through dependency chain | All services                     | CRITICAL | Circuit breakers (Istio/Envoy); bulkhead pattern (resource isolation); retry budgets (not unbounded retries)      |
| D2: Resource exhaustion | Malicious or buggy client sends excessive requests    | API Gateway, individual services | HIGH     | Rate limiting at gateway; per-service resource limits (CPU, memory, connection pool); request timeout enforcement |
| D3: Slow loris attack   | Slow HTTP connections exhaust connection pool         | API Gateway                      | HIGH     | Connection timeout at gateway; minimum data rate enforcement; HTTP/2 with stream limits                           |
| D4: Queue flooding      | Burst of messages overwhelms consumer                 | Message queue                    | MEDIUM   | Queue depth limits; dead letter queues; consumer auto-scaling with backpressure                                   |

#### Elevation of Privilege

| Threat                                       | Attack Vector                                       | Affected Component | Severity | Mitigation                                                                                                                                  |
| -------------------------------------------- | --------------------------------------------------- | ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| E1: Container escape                         | Exploit kernel vulnerability to escape container    | Container runtime  | CRITICAL | Minimal base images (distroless); no root user; read-only filesystem; Seccomp profiles; consider gVisor for high-risk workloads             |
| E2: RBAC misconfiguration                    | Overly permissive Kubernetes RBAC                   | Kubernetes API     | CRITICAL | Least-privilege RBAC; no cluster-admin for applications; regular RBAC audit; OPA Gatekeeper policies                                        |
| E3: Privilege escalation via service account | Service account token used to access Kubernetes API | Kubernetes         | HIGH     | Disable service account token automounting; use bound service account tokens; restrict API server access via RBAC                           |
| E4: Cross-tenant data access                 | Multi-tenant service returns data from wrong tenant | Application layer  | CRITICAL | Tenant ID in JWT claims; tenant filter applied at database query layer (not just application logic); integration tests for tenant isolation |

### 7.2 Attack Surface Comparison: Monolith vs Microservices

| Dimension                       | Monolith                             | Microservices                              | Risk Direction                                                                   |
| ------------------------------- | ------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------- |
| **Network endpoints**           | 1 external endpoint                  | 1 external + N internal endpoints          | INCREASED -- each internal endpoint is an attack surface                         |
| **Credential sets**             | 1 DB password, 1 cache password      | N DB passwords, N API keys, N certificates | INCREASED -- more secrets to manage and rotate                                   |
| **Container images**            | 1 image                              | N images, each with own dependency tree    | INCREASED -- N supply chains to monitor                                          |
| **Inter-process communication** | In-memory function calls (0 network) | N\*(N-1)/2 potential network paths         | INCREASED -- network-level attacks now possible between components               |
| **Authentication surface**      | Session cookie at one boundary       | JWT + mTLS at N boundaries                 | INCREASED -- more auth mechanisms to implement correctly                         |
| **Authorization complexity**    | Single middleware stack              | N authorization implementations            | INCREASED -- consistency and completeness harder to verify                       |
| **Configuration surface**       | 1 config file                        | N ConfigMaps, N env vars, N secrets        | INCREASED -- more misconfiguration opportunities                                 |
| **Observability**               | Single log stream                    | N log streams requiring aggregation        | INCREASED -- forensics requires distributed tracing                              |
| **Deployment surface**          | 1 deployment artifact                | N deployment artifacts, N pipelines        | INCREASED -- more CI/CD pipelines to secure                                      |
| **Blast radius**                | Full application                     | Single service (if properly isolated)      | DECREASED -- proper segmentation limits blast radius                             |
| **Horizontal scaling**          | Entire application scales            | Individual service scales                  | NEUTRAL -- security-irrelevant but operationally relevant                        |
| **Technology diversity**        | Single stack                         | Multiple stacks possible                   | MIXED -- polyglot brings diverse vulnerabilities but limits single-exploit blast |

**Key insight:** Microservices dramatically INCREASE the attack surface but also ENABLE fine-grained containment. The security benefit of microservices is NOT a smaller attack surface -- it is a smaller blast radius per compromise, IF the segmentation and isolation controls are properly implemented.

### 7.3 Top 5 Risks Specific to the Migration Transition Period

The transition period -- when some functionality runs in the monolith and some in microservices -- introduces unique risks that exist only during migration.

#### Risk 1: Dual Authentication Bypass (CRITICAL)

**Description:** During migration, the monolith and new services may use different authentication mechanisms (e.g., session cookies in the monolith, JWT in services). If the gateway routes requests to both backends, an attacker may exploit inconsistencies between the two auth systems.

**Attack scenario:** Monolith session is valid but JWT is expired (or vice versa). Depending on routing, the request may be accepted by one backend but should have been rejected by the other.

**Mitigation:**

- Single source of truth for authentication (IdP issues both session tokens and JWTs during transition)
- Gateway validates BOTH mechanisms during dual-run period
- Audit logging compares auth decisions between old and new paths
- Feature flags to route traffic to old or new path, not both simultaneously

#### Risk 2: Data Consistency During Strangler Pattern (HIGH)

**Description:** The strangler fig pattern routes requests gradually from monolith to services. During this period, data may be written to the monolith's database AND the new service's database. Inconsistencies create authorization bypass opportunities (e.g., role change in new service not reflected in monolith).

**Attack scenario:** User role revoked in new service, but monolith's cached role data still grants access.

**Mitigation:**

- Single source of truth for authorization data during transition
- Event-driven synchronization with conflict detection
- Read-your-writes consistency for authorization-critical data
- Automated consistency checks with alerting on divergence

#### Risk 3: Expanded Attack Surface Without Full Controls (HIGH)

**Description:** New services are deployed before the full security stack (mTLS, WAF, anomaly detection, SIEM integration) is operational. Services run with reduced security posture during the "security tooling catch-up" phase.

**Attack scenario:** New service deployed to production with TLS but without mTLS, without rate limiting, without audit logging. Attacker exploits the gap.

**Mitigation:**

- Security baseline checklist gated in CI/CD (no deploy without minimum controls)
- Service mesh with STRICT mTLS deployed BEFORE first microservice
- Minimum Viable Security (MVS): mTLS, auth, rate limit, logging required before any service goes live
- Security readiness review as a deployment gate

#### Risk 4: Orphaned Monolith Code with Stale Dependencies (MEDIUM)

**Description:** As functionality moves to services, the monolith shrinks. Teams focus on new services and neglect the monolith. Monolith dependencies stop receiving security patches. The monolith becomes a liability.

**Attack scenario:** Known CVE in monolith's framework is exploited because no one patched it -- attention is on the new services.

**Mitigation:**

- Monolith dependency updates included in sprint planning until full decommission
- Automated vulnerability scanning on monolith CI pipeline (same standards as services)
- Defined decommission timeline with accountability
- Feature flags to disable monolith code paths as functionality migrates

#### Risk 5: Secret Sprawl During Migration (MEDIUM)

**Description:** The monolith uses one set of secrets (database credentials, API keys). Each new microservice introduces its own secrets. During migration, the total number of secrets multiplies rapidly without a centralized management strategy, increasing the risk of secret leakage.

**Attack scenario:** New service deployed with database password in environment variable (monolith pattern) instead of Vault (new pattern). Password exposed via crash dump or process listing.

**Mitigation:**

- Vault or cloud KMS deployed BEFORE first microservice
- Migration playbook includes "secrets migration" as a mandatory step
- Automated scanning for secrets in environment variables, ConfigMaps, and image layers
- Zero-trust: no service deployed without Vault integration, enforced by admission controller

---

## Appendix A: Security Controls Summary

| Control ID  | Control                                  | Priority | OWASP      | STRIDE     |
| ----------- | ---------------------------------------- | -------- | ---------- | ---------- |
| SEC-AUTH-01 | OAuth 2.1 + PKCE at API Gateway          | P0       | A07        | S1, S2     |
| SEC-AUTH-02 | mTLS for all east-west traffic           | P0       | --         | S1, S3, T1 |
| SEC-AUTH-03 | JWT RS256/ES256, max 15 min lifetime     | P0       | A07        | S2, S4     |
| SEC-AUTH-04 | Per-service RBAC/ABAC authorization      | P0       | API1, API5 | E4         |
| SEC-NET-01  | NetworkPolicy deny-all default           | P0       | --         | S3, E2     |
| SEC-NET-02  | Service mesh with STRICT mTLS            | P0       | --         | S1, T1     |
| SEC-NET-03  | Egress allowlist (deny-all default)      | P1       | --         | I5         |
| SEC-NET-04  | WAF with OWASP CRS v4                    | P1       | A05        | T1         |
| SEC-DATA-01 | TLS 1.2+ everywhere (no plaintext)       | P0       | A04        | I4, I5, T1 |
| SEC-DATA-02 | Encryption at rest per service database  | P0       | A04        | I5         |
| SEC-DATA-03 | Vault for all secrets management         | P0       | A02        | I1, I5     |
| SEC-DATA-04 | PII tokenization for RESTRICTED data     | P1       | A01        | I3         |
| SEC-DATA-05 | GDPR right-to-deletion per service       | P1       | --         | R1         |
| SEC-API-01  | Rate limiting at gateway                 | P0       | API4       | D2         |
| SEC-API-02  | Input validation (schema) at gateway     | P1       | A05        | T1         |
| SEC-API-03  | GraphQL query depth/complexity limits    | P1       | API4       | D2         |
| SEC-OBS-01  | Structured audit logging (all services)  | P0       | A09        | R1, R2     |
| SEC-OBS-02  | Distributed tracing (OpenTelemetry)      | P1       | A09        | R1         |
| SEC-OBS-03  | Anomaly detection on east-west traffic   | P2       | --         | S1, E2     |
| SEC-SC-01   | Container image scanning in CI           | P0       | A03        | I1, E1     |
| SEC-SC-02   | Image signing (Cosign/Sigstore)          | P1       | A03, A08   | T3         |
| SEC-SC-03   | SBOM generation per release              | P1       | A03        | --         |
| SEC-SC-04   | Runtime security (Falco/eBPF)            | P2       | --         | E1         |
| SEC-SC-05   | SLSA L3 pipeline hardening               | P2       | A08        | T3         |
| SEC-SC-06   | Admission controller for unsigned images | P1       | A03        | T3         |

---

## Appendix B: Migration Security Checklist

### Pre-Migration (Before First Microservice)

- [ ] Identity Provider (IdP) deployed and configured for OAuth 2.1
- [ ] Vault or cloud KMS operational for secrets management
- [ ] Service mesh installed with STRICT mTLS enforcement
- [ ] Kubernetes NetworkPolicy default-deny deployed
- [ ] Container image scanning integrated into CI pipeline
- [ ] Image signing infrastructure (Cosign) operational
- [ ] Centralized log aggregation operational
- [ ] Distributed tracing infrastructure operational
- [ ] Incident response playbook updated for microservices
- [ ] Security baseline checklist created for new services

### Per-Service Deployment Gate

- [ ] mTLS verified with service mesh
- [ ] Secrets fetched from Vault (not env vars or ConfigMaps)
- [ ] Database credentials per-service (no shared accounts)
- [ ] Rate limiting configured at gateway for service endpoints
- [ ] Structured audit logging implemented
- [ ] OpenTelemetry tracing integrated
- [ ] Container image scanned and signed
- [ ] RBAC/ABAC policies defined and tested
- [ ] Input validation for all external-facing endpoints
- [ ] Error handling returns generic messages (no stack traces)
- [ ] Health check endpoint does NOT require auth interceptor bypass
- [ ] SBOM generated and published

### Post-Migration (After Monolith Decommission)

- [ ] Monolith fully decommissioned (no residual endpoints)
- [ ] All monolith secrets revoked
- [ ] Monolith database access removed from all service accounts
- [ ] DNS records cleaned up (no stale routes to monolith)
- [ ] Full penetration test of microservices architecture
- [ ] STRIDE threat model reviewed with final architecture
- [ ] Security runbooks validated with tabletop exercise
- [ ] OWASP API Security Top 10 assessment completed

---

## Appendix C: Compliance Mapping

| Requirement              | SOC 2     | GDPR         | HIPAA             | PCI-DSS   | Control IDs    |
| ------------------------ | --------- | ------------ | ----------------- | --------- | -------------- |
| Encryption in transit    | CC6.1     | Art. 32      | 164.312(e)        | Req 4     | SEC-DATA-01    |
| Encryption at rest       | CC6.1     | Art. 32      | 164.312(a)(2)(iv) | Req 3     | SEC-DATA-02    |
| Access control           | CC6.1-6.3 | Art. 5(1)(f) | 164.312(a)(1)     | Req 7     | SEC-AUTH-01-04 |
| Audit logging            | CC7.1-7.2 | Art. 30      | 164.312(b)        | Req 10    | SEC-OBS-01-02  |
| Secrets management       | CC6.1     | Art. 32      | 164.312(a)(2)(iv) | Req 6     | SEC-DATA-03    |
| Vulnerability management | CC7.1     | Art. 32      | 164.308(a)(5)     | Req 6, 11 | SEC-SC-01-03   |
| Incident response        | CC7.3-7.5 | Art. 33-34   | 164.308(a)(6)     | Req 12    | SEC-OBS-03     |
| Data minimization        | --        | Art. 5(1)(c) | 164.502(b)        | Req 3     | SEC-DATA-04-05 |

---

## References

- NIST SP 800-204: Security Strategies for Microservices-based Application Systems
- NIST SP 800-204A: Building Secure Microservices-based Applications Using Service-Mesh Architecture
- OWASP Top 10 2025 (updated ranking)
- OWASP API Security Top 10 2023
- OAuth 2.1 (draft-ietf-oauth-v2-1)
- RFC 9449: OAuth 2.0 Demonstrating Proof of Possession (DPoP)
- SLSA Framework (slsa.dev)
- SPIFFE/SPIRE (spiffe.io)
- CNCF Security Whitepaper (tag-security)
