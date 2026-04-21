<!-- Agent: security-architect | Task: #microservices-security-arch | Session: 2026-02-08 -->

# Microservices Security Architecture

**Date:** 2026-02-08
**Agent:** security-architect
**Status:** COMPREHENSIVE DESIGN -- Monolith-to-Microservices Migration Security Architecture
**Severity Classification:** ARCHITECTURE-LEVEL (pre-migration design)
**Compliance Scope:** OAuth 2.1, OWASP Top 10 (2021), GDPR, SOC2, PCI-DSS, Zero Trust Architecture (NIST SP 800-207)

---

## Executive Summary

This document defines the security architecture for migrating from a monolithic application to a microservices-based architecture. The migration fundamentally changes the trust model: a monolith operates within a single process boundary with implicit trust between components, while microservices communicate across network boundaries where every request is untrusted by default.

**Key Architectural Principles:**

1. **Zero Trust**: No implicit trust between services. Every request is authenticated, authorized, and encrypted regardless of network location.
2. **Defense in Depth**: Multiple security layers (network, transport, application, data) so that compromise of one layer does not compromise the system.
3. **Least Privilege**: Each service has the minimum permissions required for its function. No shared database credentials, no broad network access.
4. **Shift Left**: Security controls are designed into the architecture, not bolted on after deployment.
5. **Observability First**: Security events are first-class citizens in the observability stack. You cannot secure what you cannot see.

**Critical Migration Risks:**

- Attack surface increases from 1 process boundary to N service boundaries
- Lateral movement becomes possible if inter-service authentication is weak
- Data classification becomes harder when PII flows across service boundaries
- Secrets management complexity grows linearly with service count
- Distributed logging gaps create audit trail blind spots

---

## Table of Contents

1. [Threat Model (STRIDE) for Microservices](#1-threat-model-stride-for-microservices)
2. [Authentication and Authorization](#2-authentication-and-authorization)
3. [Network Security](#3-network-security)
4. [Data Security](#4-data-security)
5. [Observability and Incident Response](#5-observability-and-incident-response)
6. [Compliance Considerations](#6-compliance-considerations)
7. [Security Controls Registry](#7-security-controls-registry)
8. [Migration Security Checklist](#8-migration-security-checklist)
9. [Hybrid Validation Checklist](#9-hybrid-validation-checklist)

---

## 1. Threat Model (STRIDE) for Microservices

### 1.1 Spoofing: Inter-Service Identity and Impersonation Risks

In a monolith, component identity is implicit (same process, same memory space). In microservices, any network endpoint can claim to be any service unless cryptographic identity is enforced.

| Threat ID | Threat | Attack Vector | Likelihood | Impact | Mitigation |
|-----------|--------|---------------|------------|--------|------------|
| MS-S-001 | Service impersonation | Attacker deploys rogue service on internal network, intercepts or initiates requests claiming to be a legitimate service | HIGH | CRITICAL | Mutual TLS (mTLS) with per-service certificates issued by an internal CA. Service mesh (Istio/Linkerd) enforces mTLS for all east-west traffic. Certificate pinning for critical service pairs. |
| MS-S-002 | JWT token forgery | Attacker crafts service-to-service JWT with fabricated claims (e.g., service identity, scopes) | HIGH | CRITICAL | Asymmetric signing only (RS256/ES256). Algorithm whitelist enforced at every service. JWKS endpoint for key distribution. Reject `alg: none`. Validate `iss`, `aud`, `sub` on every request. |
| MS-S-003 | Stolen service credentials | Compromised service leaks its mTLS certificate or JWT signing key, enabling impersonation | MEDIUM | CRITICAL | Short-lived certificates (24h max via SPIFFE/SPIRE). Automated certificate rotation. Hardware security modules (HSMs) for signing keys. Certificate revocation via OCSP or CRL. |
| MS-S-004 | DNS poisoning / service discovery spoofing | Attacker manipulates DNS or service registry (Consul, Kubernetes DNS) to redirect traffic to malicious endpoint | MEDIUM | HIGH | DNSSEC for DNS resolution. Kubernetes NetworkPolicy restricting DNS access. Service mesh identity verification independent of DNS. mTLS validates certificate CN/SAN against expected service identity. |
| MS-S-005 | API Gateway bypass | Attacker accesses backend services directly, bypassing gateway authentication | HIGH | HIGH | Kubernetes NetworkPolicy: backend services accept traffic ONLY from API Gateway and service mesh sidecar. No direct ingress to backend pods. Service mesh authorization policies as secondary enforcement. |

**Architecture Decision: Service Identity**

Every microservice MUST have a cryptographic identity. The recommended approach is SPIFFE (Secure Production Identity Framework for Everyone) with SPIRE as the identity provider:

```
+------------------+       +------------------+       +------------------+
|   Service A      |       |   Service B      |       |   Service C      |
|   SPIFFE ID:     | mTLS  |   SPIFFE ID:     | mTLS  |   SPIFFE ID:     |
| spiffe://cluster |<----->| spiffe://cluster |<----->| spiffe://cluster |
| /ns/prod/sa/svcA |       | /ns/prod/sa/svcB |       | /ns/prod/sa/svcC |
+------------------+       +------------------+       +------------------+
         |                          |                          |
         v                          v                          v
    +---------------------------------------------------------+
    |              SPIRE Server (Identity Provider)            |
    |   Issues short-lived X.509 SVIDs (24h TTL)              |
    |   Attests workload identity via node/workload attestors  |
    +---------------------------------------------------------+
```

### 1.2 Tampering: Message Integrity and Data in Transit

| Threat ID | Threat | Attack Vector | Likelihood | Impact | Mitigation |
|-----------|--------|---------------|------------|--------|------------|
| MS-T-001 | Message modification in transit | Man-in-the-middle alters request/response payloads between services | MEDIUM | CRITICAL | mTLS encrypts and authenticates all inter-service traffic. Service mesh sidecars handle TLS termination transparently. |
| MS-T-002 | Event/message queue tampering | Attacker modifies messages in async queues (Kafka, RabbitMQ, SQS) | MEDIUM | HIGH | Message signing with HMAC-SHA256 or digital signatures. Message-level encryption for sensitive payloads. Consumer validates signature before processing. Dead letter queue for failed validation. |
| MS-T-003 | Configuration tampering | Attacker modifies service configuration (environment variables, ConfigMaps) to alter behavior | MEDIUM | HIGH | Immutable container images. ConfigMap integrity verification via checksums. GitOps with signed commits for configuration changes. RBAC restricting ConfigMap/Secret modifications. |
| MS-T-004 | Database record tampering via shared storage | Service A modifies data owned by Service B through shared database access | HIGH | HIGH | Database-per-service pattern. No shared databases. Each service owns its data exclusively. Cross-service data access only via APIs. |
| MS-T-005 | Supply chain attack on container images | Attacker injects malicious code into base images or dependency layers | MEDIUM | CRITICAL | Image signing with Cosign/Sigstore. Admission controller (Kyverno/OPA Gatekeeper) rejects unsigned images. Base image scanning with Trivy/Grype in CI/CD. Pin image digests, not tags. |

**Architecture Decision: Message Integrity**

For synchronous communication (gRPC/HTTP), mTLS provides integrity. For asynchronous communication (event-driven), message-level security is required:

```
Producer Service                          Consumer Service
+------------------+                      +------------------+
| 1. Create message|                      | 4. Receive msg   |
| 2. Sign payload  | ---> Message Bus --> | 5. Verify sig    |
| 3. Encrypt (opt) |      (Kafka/SQS)    | 6. Decrypt (opt) |
| 4. Publish       |                      | 7. Process       |
+------------------+                      +------------------+

Message Envelope:
{
  "metadata": {
    "producer": "spiffe://cluster/ns/prod/sa/order-svc",
    "timestamp": "2026-02-08T10:00:00Z",
    "messageId": "uuid-v4",
    "signature": "HMAC-SHA256(payload, shared-key)",
    "contentEncryption": "AES-256-GCM" // optional
  },
  "payload": { ... }  // or encrypted blob
}
```

### 1.3 Repudiation: Audit Logging Across Services

| Threat ID | Threat | Attack Vector | Likelihood | Impact | Mitigation |
|-----------|--------|---------------|------------|--------|------------|
| MS-R-001 | Missing audit trail across services | Distributed request spans multiple services; no correlated log trail exists | HIGH | HIGH | Distributed tracing (OpenTelemetry) with mandatory trace/span IDs. Centralized log aggregation (ELK/Loki). Correlation ID propagated in all requests. |
| MS-R-002 | Log tampering or deletion | Attacker with compromised service deletes or modifies local logs to cover tracks | MEDIUM | HIGH | Logs shipped immediately to immutable external store (S3 with Object Lock, CloudWatch). Services have no write access to log aggregation. Append-only log streams. |
| MS-R-003 | Incomplete security event logging | Not all authentication/authorization decisions are logged | HIGH | MEDIUM | Mandatory structured logging for: auth success/failure, authorization denials, token refresh/revocation, rate limit triggers, anomalous access patterns. Log schema enforced by shared library. |
| MS-R-004 | Clock skew causing inaccurate audit timeline | Services with unsynchronized clocks produce misleading event ordering | MEDIUM | MEDIUM | NTP synchronization on all nodes. UTC timestamps only. Include logical clocks (Lamport timestamps or vector clocks) in distributed transactions. OpenTelemetry trace timestamps provide authoritative ordering. |

**Architecture Decision: Structured Audit Log Schema**

All services MUST emit security events in a standardized format:

```json
{
  "timestamp": "2026-02-08T10:30:00.000Z",
  "level": "SECURITY",
  "service": "order-service",
  "instance": "order-svc-7d9f8b-abc12",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "spanId": "00f067aa0ba902b7",
  "event": "AUTHZ_DENIED",
  "actor": {
    "userId": "user-12345",
    "serviceAccount": "spiffe://cluster/ns/prod/sa/order-svc",
    "ip": "10.0.1.42",
    "userAgent": "grpc-go/1.60.0"
  },
  "resource": {
    "type": "order",
    "id": "order-67890",
    "action": "DELETE"
  },
  "decision": {
    "allowed": false,
    "reason": "INSUFFICIENT_SCOPE",
    "requiredScope": "orders:delete",
    "actualScopes": ["orders:read", "orders:write"]
  },
  "metadata": {
    "policyVersion": "v2.3.1",
    "evaluationTimeMs": 2
  }
}
```

### 1.4 Information Disclosure: Data Exposure at Service Boundaries

| Threat ID | Threat | Attack Vector | Likelihood | Impact | Mitigation |
|-----------|--------|---------------|------------|--------|------------|
| MS-I-001 | Over-fetching via API responses | Service returns entire database records including PII fields not needed by caller | HIGH | HIGH | Response filtering: services return only fields requested. GraphQL field-level authorization. API contracts (OpenAPI) define minimum response schemas. |
| MS-I-002 | PII leakage in logs | Structured logs contain user PII (email, SSN, credit card) in request/response bodies | HIGH | CRITICAL | PII scrubbing in log pipeline. Deny-list for sensitive fields. Structured logging library automatically redacts fields matching PII patterns. Log review in CI/CD. |
| MS-I-003 | Service error messages expose internals | Stack traces, database queries, or internal service topology leaked in error responses | HIGH | MEDIUM | Generic error responses to external callers. Detailed errors only in internal logs. Error boundary middleware strips implementation details. Environment-specific error verbosity (dev vs. prod). |
| MS-I-004 | Secrets exposure in environment variables | Container environment variables containing secrets visible via `/proc` or Kubernetes API | MEDIUM | CRITICAL | Secrets injected via volume mounts (Vault Agent Injector), not env vars. Kubernetes Secrets encrypted at rest (EncryptionConfiguration). RBAC restricts Secret read access. |
| MS-I-005 | Cross-service data leakage via shared caches | Service A reads cached data belonging to Service B from shared Redis/Memcached | MEDIUM | HIGH | Cache namespace isolation per service. Authentication on cache access (Redis AUTH, ACL). Dedicated cache instances for services handling PII. |

### 1.5 Denial of Service: Service-Level Rate Limiting and Circuit Breakers

| Threat ID | Threat | Attack Vector | Likelihood | Impact | Mitigation |
|-----------|--------|---------------|------------|--------|------------|
| MS-D-001 | Cascading failure from unhealthy service | One service becomes slow, causing upstream services to exhaust connection pools and fail | HIGH | CRITICAL | Circuit breaker pattern (Istio/Resilience4j). Timeout budgets per service call. Bulkhead isolation (separate thread pools per downstream dependency). Health checks with automatic pod eviction. |
| MS-D-002 | Resource exhaustion via uncontrolled fanout | Single request triggers N downstream requests (e.g., N+1 query pattern across services) | MEDIUM | HIGH | Request budgets limiting downstream calls per request. Pagination and batch APIs. Service mesh rate limiting on east-west traffic. Distributed request tracing to identify fanout patterns. |
| MS-D-003 | External DDoS reaching backend services | Volumetric attack overwhelms API Gateway, propagating to backend services | HIGH | HIGH | CDN with DDoS protection (CloudFlare/AWS Shield). API Gateway rate limiting per client/IP/API key. WAF rules for known attack patterns. Auto-scaling with max replica limits. |
| MS-D-004 | Internal service abuse (noisy neighbor) | One team's service sends excessive requests to shared dependency, starving other consumers | MEDIUM | MEDIUM | Per-service rate limits at service mesh level. Request quotas per service identity. Priority queuing for critical services. Capacity planning with load testing. |
| MS-D-005 | Message queue flooding | Producer overwhelms message queue, causing consumer lag and memory exhaustion | MEDIUM | HIGH | Producer rate limiting. Queue depth monitoring with alerts. Consumer autoscaling based on lag. Dead letter queues for poison messages. Backpressure mechanisms (Kafka consumer groups, SQS visibility timeout). |

**Architecture Decision: Resilience Patterns**

```
                    Circuit Breaker States

    [CLOSED] ---(failure threshold)--> [OPEN]
       ^                                  |
       |                            (timeout)
       |                                  |
       +-------[HALF-OPEN]<--------------+
                  |
           (test request)
           success -> CLOSED
           failure -> OPEN

Configuration per downstream dependency:
- failure_threshold: 5 failures in 30s window
- open_timeout: 30s before half-open test
- half_open_requests: 3 test requests
- timeout_per_request: 3s (hard), 1s (soft/degraded)
- bulkhead_max_concurrent: 25 per downstream
```

### 1.6 Elevation of Privilege: Service-to-Service Authorization

| Threat ID | Threat | Attack Vector | Likelihood | Impact | Mitigation |
|-----------|--------|---------------|------------|--------|------------|
| MS-E-001 | Service acting beyond its scope | Compromised service uses its credentials to access resources outside its domain | HIGH | CRITICAL | Fine-grained authorization policies per service pair. Service mesh authorization (Istio AuthorizationPolicy). Services have scoped JWT tokens with minimal claims. Zero Trust: re-authorize at every hop. |
| MS-E-002 | Privilege escalation via token exchange | Service exchanges its low-privilege token for a higher-privilege token using a vulnerable token exchange endpoint | MEDIUM | CRITICAL | Token exchange (RFC 8693) with strict scope constraints: exchanged token scope <= original scope. Token exchange audit logging. Rate limiting on token exchange endpoints. |
| MS-E-003 | Admin API exposed internally | Administrative endpoints (health, metrics, config reload) accessible to any internal service | HIGH | HIGH | Separate admin port from service port. Admin endpoints protected by distinct authorization policy. Kubernetes NetworkPolicy restricting admin port access to operator namespace only. |
| MS-E-004 | Container breakout leading to node access | Attacker exploits container runtime vulnerability to access host, then other containers | LOW | CRITICAL | Pod Security Standards (restricted profile). No privileged containers. Read-only root filesystem. Seccomp profiles. AppArmor/SELinux policies. Minimal base images (distroless/scratch). Runtime security monitoring (Falco). |
| MS-E-005 | RBAC misconfiguration in Kubernetes | Overly permissive ClusterRoleBindings allow service to read Secrets or modify deployments | HIGH | CRITICAL | Least-privilege RBAC. No ClusterAdmin for application service accounts. Automated RBAC audit (rakkess, kubectl-who-can). Policy enforcement (OPA Gatekeeper/Kyverno). Regular RBAC review cadence. |

---

## 2. Authentication and Authorization

### 2.1 Service-to-Service Authentication (mTLS + JWT)

The migration introduces two complementary authentication mechanisms for inter-service communication:

**Layer 1: Transport Authentication (mTLS)**

mTLS provides transport-layer identity verification. Every service presents a client certificate during TLS handshake, and both sides verify the other's certificate against the internal CA.

```
Service A                                    Service B
+------------+                               +------------+
| Client Cert|----> TLS Handshake <----------|Server Cert |
|  signed by |     (both verify CA)          | signed by  |
| internal CA|                               |internal CA |
+------------+                               +------------+

Certificate Subject: spiffe://cluster.local/ns/{namespace}/sa/{service-account}
Certificate Lifetime: 24 hours (auto-rotated by SPIRE/cert-manager)
Key Algorithm: ECDSA P-256 (ES256)
```

**Layer 2: Application Authentication (JWT)**

JWT provides application-layer identity with claims (scopes, roles, tenant context) that mTLS cannot convey. Used for fine-grained authorization decisions.

```
Request Flow:
1. Service A obtains JWT from Auth Service (or token exchange)
2. Service A includes JWT in Authorization header
3. Service mesh sidecar verifies mTLS (transport)
4. Service B validates JWT (application):
   - Algorithm whitelist: RS256, ES256 only
   - Issuer validation: iss == "https://auth.internal.cluster.local"
   - Audience validation: aud contains Service B's identifier
   - Expiry check: exp > now (with 30s clock tolerance)
   - Scope check: required scopes present
5. Service B processes request if both layers pass
```

**JWT Claims for Service-to-Service:**

```json
{
  "iss": "https://auth.internal.cluster.local",
  "sub": "spiffe://cluster.local/ns/prod/sa/order-service",
  "aud": ["payment-service", "inventory-service"],
  "exp": 1738929600,
  "iat": 1738928700,
  "jti": "550e8400-e29b-41d4-a716-446655440000",
  "scope": "payments:create inventory:reserve",
  "tenant_id": "tenant-001",
  "request_id": "req-abc-123"
}
```

### 2.2 User Authentication Flow (OAuth 2.1 / OIDC)

User authentication follows OAuth 2.1 with OIDC, consistent with the existing OAuth2 security review (SEC-OAUTH-001 through SEC-OAUTH-014). The microservices architecture introduces additional considerations for token propagation.

```
                          User Authentication Flow

User Browser              API Gateway              Auth Service          Backend Services
    |                         |                         |                       |
    |--- GET /app ----------->|                         |                       |
    |<-- 302 /auth/login -----|                         |                       |
    |                         |                         |                       |
    |--- GET /auth/login ---->|--- Generate PKCE ------>|                       |
    |<-- 302 to IdP ----------|   code_challenge (S256) |                       |
    |                         |   state (CSRF)          |                       |
    |--- Authenticate at IdP  |   nonce (replay)        |                       |
    |<-- 302 /callback?code=  |                         |                       |
    |                         |                         |                       |
    |--- GET /callback ------>|--- POST /token -------->|                       |
    |                         |   code + code_verifier  |                       |
    |                         |<-- access_token --------|                       |
    |                         |    refresh_token        |                       |
    |                         |    id_token             |                       |
    |                         |                         |                       |
    |<-- Set-Cookie: ----------|                         |                       |
    |    access_token (HttpOnly, Secure, SameSite=Strict)|                       |
    |    refresh_token (HttpOnly, Secure, path=/refresh) |                       |
    |                         |                         |                       |
    |--- GET /api/orders ---->|--- Validate JWT ------->|                       |
    |                         |   (at gateway)          |                       |
    |                         |--- Forward + internal -->|--- process --------->|
    |                         |   JWT (scoped down)      |                       |
    |<-- 200 { orders } ------|<-- response ------------|<-- data --------------|
```

**OAuth 2.1 Compliance Requirements (from SEC-OAUTH review):**

| Requirement | Status | Detail |
|-------------|--------|--------|
| PKCE mandatory (S256) | REQUIRED | All clients, public and confidential |
| Implicit flow removed | REQUIRED | response_type=token forbidden |
| ROPC flow removed | REQUIRED | grant_type=password forbidden |
| Exact redirect URI matching | REQUIRED | No wildcards, no subdomain patterns |
| Bearer tokens not in URI | REQUIRED | Authorization header only |
| Refresh token rotation | REQUIRED | Rotation with reuse detection |
| Device Authorization Grant | REQUIRED | For CLI/headless environments (RFC 8628) |

### 2.3 API Gateway Auth Enforcement

The API Gateway is the single ingress point for external traffic. It MUST enforce authentication before any request reaches backend services.

```
                        API Gateway Security Stack

External Request --> [WAF] --> [Rate Limiter] --> [Auth Middleware] --> [Route Handler]
                      |              |                   |
                      v              v                   v
                 Block attack   429 Too Many       401 Unauthorized
                  patterns      Requests           403 Forbidden
                                                        |
                                                   [Token Valid?]
                                                     |       |
                                                   YES      NO
                                                     |       |
                                             [Scope Check]  [Reject]
                                                     |
                                            [Inject Internal JWT]
                                                     |
                                            [Forward to Service]
```

**Gateway Authentication Rules:**

```yaml
# API Gateway Auth Configuration
authentication:
  # Public endpoints (no auth required)
  public_paths:
    - /health
    - /ready
    - /auth/login
    - /auth/callback
    - /auth/device/authorize   # Device flow initiation
    - /.well-known/*

  # Authenticated endpoints
  default_policy: DENY  # Deny by default, allow explicitly

  # Token validation
  jwt:
    algorithms: ["RS256", "ES256"]
    issuer: "https://auth.example.com"
    audience: "api.example.com"
    clock_tolerance_seconds: 30
    jwks_uri: "https://auth.example.com/.well-known/jwks.json"
    jwks_cache_ttl_seconds: 3600

  # Rate limiting
  rate_limits:
    global: 10000/minute
    per_client: 1000/minute
    auth_endpoints: 20/minute  # Strict for auth
    token_endpoint: 10/minute  # Very strict
```

### 2.4 Zero Trust Architecture Principles

Zero Trust (NIST SP 800-207) means no implicit trust based on network location. Every request is verified as if it originated from an untrusted network.

**Zero Trust Pillars for Microservices:**

| Pillar | Monolith (Before) | Microservices (After) |
|--------|-------------------|----------------------|
| **Identity** | Single process identity | Per-service SPIFFE identity |
| **Device/Workload** | Single server trust | Per-pod attestation |
| **Network** | Perimeter defense | Microsegmentation + mTLS everywhere |
| **Application** | In-process auth checks | Per-service auth enforcement |
| **Data** | Single database ACLs | Per-service data ownership |
| **Monitoring** | Centralized logs | Distributed tracing + centralized aggregation |

**Implementation Principles:**

1. **Verify explicitly**: Authenticate and authorize every request, every time, regardless of source
2. **Least privilege access**: Scope tokens to minimum necessary permissions per service interaction
3. **Assume breach**: Design each service as if adjacent services are compromised
4. **Microsegment**: Network policies isolate services; only explicitly allowed communication paths exist
5. **Continuous verification**: Session/token validity checked continuously, not just at initial connection

### 2.5 Token Propagation Across Services

When a user request traverses multiple services, the user's identity context must be propagated securely.

**Pattern: Token Exchange (RFC 8693)**

```
User Request:
  User JWT (broad scope) --> API Gateway

API Gateway:
  1. Validate user JWT
  2. Exchange for scoped internal JWT:
     - Original user context (sub, tenant_id) preserved
     - Scope narrowed to downstream service needs
     - New audience set to downstream service
     - Short expiry (5 minutes)
  3. Forward internal JWT to backend service

Backend Service:
  1. Validate internal JWT
  2. If calling another service:
     a. Exchange token again with further scope reduction
     b. Set audience to next downstream service
  3. NEVER forward the original user JWT directly
```

**Token Propagation Rules:**

| Rule | Rationale |
|------|-----------|
| Never forward original user JWT to backend services | Prevents over-privileged access if backend service is compromised |
| Scope MUST decrease at each hop | Limits blast radius of token theft |
| Audience MUST be set to the next service | Prevents token reuse across unintended services |
| Expiry MUST be short (5 min max for internal tokens) | Limits temporal window of stolen tokens |
| Correlation ID propagated alongside token | Enables distributed tracing of the full request chain |
| Original user identity preserved in claims | Enables end-to-end audit trail |

---

## 3. Network Security

### 3.1 Service Mesh mTLS (Istio/Linkerd)

A service mesh provides transparent mTLS for all east-west (inter-service) traffic without application code changes.

**Recommended: Istio Service Mesh**

```yaml
# Istio PeerAuthentication: Enforce STRICT mTLS
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system  # Mesh-wide policy
spec:
  mtls:
    mode: STRICT  # Reject plaintext connections

---
# Per-namespace override (if needed for migration)
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: strict-mtls
  namespace: production
spec:
  mtls:
    mode: STRICT
```

**Migration Strategy for mTLS:**

```
Phase 1: PERMISSIVE mode (accept both plaintext and mTLS)
  - Deploy sidecar proxies to all services
  - Monitor mTLS adoption via Kiali dashboard
  - Target: 100% sidecar injection

Phase 2: STRICT mode per namespace
  - Enable STRICT in non-production first
  - Verify no plaintext connections remain
  - Monitor for connection failures

Phase 3: STRICT mode mesh-wide
  - Enable STRICT at istio-system level
  - All inter-service traffic encrypted and authenticated
  - Plaintext connections rejected cluster-wide
```

**Certificate Management:**

| Property | Value |
|----------|-------|
| CA | Istio CA (or external CA via cert-manager) |
| Certificate Lifetime | 24 hours (auto-rotated) |
| Key Algorithm | ECDSA P-256 |
| Root CA Rotation | Dual-root strategy for zero-downtime rotation |
| Certificate Format | X.509 v3 with SPIFFE SAN URI |

### 3.2 Network Policies (Kubernetes NetworkPolicy)

NetworkPolicy provides microsegmentation at the network layer. Each service declares which services it can communicate with.

```yaml
# Example: Order Service NetworkPolicy
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: order-service-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: order-service
  policyTypes:
    - Ingress
    - Egress

  # Ingress: Only accept traffic from API Gateway and specific services
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: gateway
          podSelector:
            matchLabels:
              app: api-gateway
      ports:
        - protocol: TCP
          port: 8080  # Service port
    - from:
        - podSelector:
            matchLabels:
              app: notification-service
      ports:
        - protocol: TCP
          port: 8080

  # Egress: Only allow connections to specific downstream services
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: payment-service
      ports:
        - protocol: TCP
          port: 8080
    - to:
        - podSelector:
            matchLabels:
              app: inventory-service
      ports:
        - protocol: TCP
          port: 8080
    # Allow DNS resolution
    - to:
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
    # Allow connection to database
    - to:
        - podSelector:
            matchLabels:
              app: order-db
      ports:
        - protocol: TCP
          port: 5432

---
# Default deny all policy for namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}  # Apply to all pods
  policyTypes:
    - Ingress
    - Egress
```

**Network Segmentation Strategy:**

```
+------------------+     +------------------+     +------------------+
|   DMZ Namespace  |     |  App Namespace   |     |  Data Namespace  |
|                  |     |                  |     |                  |
| - API Gateway    |---->| - Order Service  |---->| - Order DB       |
| - WAF            |     | - Payment Svc    |     | - Payment DB     |
| - Load Balancer  |     | - Inventory Svc  |     | - Inventory DB   |
|                  |     | - User Service   |     | - User DB        |
+------------------+     +------------------+     +------------------+
        |                        |                        |
   External Only           East-West Only           App Namespace Only
   (Ingress from          (mTLS required)          (No external access)
    internet)                                      (No cross-DB access)
```

### 3.3 Ingress/Egress Controls

**Ingress Controls:**

```yaml
# Ingress Gateway Configuration
apiVersion: networking.istio.io/v1beta1
kind: Gateway
metadata:
  name: main-gateway
  namespace: gateway
spec:
  selector:
    istio: ingressgateway
  servers:
    - port:
        number: 443
        name: https
        protocol: HTTPS
      tls:
        mode: SIMPLE
        credentialName: tls-cert  # From cert-manager
        minProtocolVersion: TLSV1_2
        cipherSuites:
          - ECDHE-ECDSA-AES256-GCM-SHA384
          - ECDHE-RSA-AES256-GCM-SHA384
          - ECDHE-ECDSA-AES128-GCM-SHA256
          - ECDHE-RSA-AES128-GCM-SHA256
      hosts:
        - "api.example.com"
    # HTTP redirect to HTTPS
    - port:
        number: 80
        name: http
        protocol: HTTP
      tls:
        httpsRedirect: true
      hosts:
        - "api.example.com"
```

**Egress Controls:**

```yaml
# Egress Policy: Default deny all external traffic
apiVersion: networking.istio.io/v1beta1
kind: Sidecar
metadata:
  name: default
  namespace: production
spec:
  outboundTrafficPolicy:
    mode: REGISTRY_ONLY  # Only allow registered external services

---
# Explicitly allow specific external services
apiVersion: networking.istio.io/v1beta1
kind: ServiceEntry
metadata:
  name: allowed-external-oauth
  namespace: production
spec:
  hosts:
    - "accounts.google.com"
    - "login.microsoftonline.com"
    - "github.com"
  ports:
    - number: 443
      name: https
      protocol: TLS
  resolution: DNS
  location: MESH_EXTERNAL
```

### 3.4 API Gateway Security (Rate Limiting, WAF)

**Rate Limiting Configuration:**

```yaml
# Istio EnvoyFilter for rate limiting
apiVersion: networking.istio.io/v1alpha3
kind: EnvoyFilter
metadata:
  name: rate-limit
  namespace: gateway
spec:
  configPatches:
    - applyTo: HTTP_FILTER
      match:
        context: GATEWAY
      patch:
        operation: INSERT_BEFORE
        value:
          name: envoy.filters.http.ratelimit
          typed_config:
            "@type": type.googleapis.com/envoy.extensions.filters.http.ratelimit.v3.RateLimit
            domain: api-gateway
            rate_limit_service:
              grpc_service:
                envoy_grpc:
                  cluster_name: rate_limit_cluster

# Rate limit descriptors
descriptors:
  # Global rate limit
  - key: generic_key
    value: default
    rate_limit:
      unit: minute
      requests_per_unit: 10000

  # Per-client rate limit
  - key: header_match
    value: x-client-id
    rate_limit:
      unit: minute
      requests_per_unit: 1000

  # Auth endpoint rate limit (stricter)
  - key: path
    value: /auth/*
    rate_limit:
      unit: minute
      requests_per_unit: 20

  # Token endpoint rate limit (strictest)
  - key: path
    value: /auth/token
    rate_limit:
      unit: minute
      requests_per_unit: 10
```

**WAF Rules (ModSecurity/AWS WAF):**

| Rule Category | Examples | Action |
|---------------|----------|--------|
| SQL Injection | `' OR 1=1`, `UNION SELECT`, `; DROP TABLE` | BLOCK |
| XSS | `<script>`, `onerror=`, `javascript:` | BLOCK |
| Path Traversal | `../`, `..\\`, `/etc/passwd` | BLOCK |
| Command Injection | `; ls`, `| cat`, `` `whoami` `` | BLOCK |
| Request Size | Body > 10MB | BLOCK |
| Protocol Enforcement | HTTP/1.0, missing Host header | BLOCK |
| Bot Detection | Known bad user agents, headless browsers | CHALLENGE |
| Geo-blocking | Traffic from embargoed countries | BLOCK |

---

## 4. Data Security

### 4.1 Encryption at Rest and in Transit

**In Transit:**

| Communication Path | Encryption | Protocol | Minimum Version |
|-------------------|------------|----------|-----------------|
| Client to API Gateway | TLS | HTTPS | TLS 1.2 |
| API Gateway to Service | mTLS | gRPC/HTTPS | TLS 1.3 preferred |
| Service to Service | mTLS | gRPC/HTTPS | TLS 1.3 preferred |
| Service to Database | TLS | PostgreSQL SSL | TLS 1.2 |
| Service to Cache | TLS | Redis TLS | TLS 1.2 |
| Service to Message Queue | TLS | AMQP/Kafka SSL | TLS 1.2 |

**At Rest:**

| Data Store | Encryption Method | Key Management |
|------------|-------------------|----------------|
| Kubernetes Secrets | AES-256-CBC (etcd encryption) | KMS envelope encryption |
| Databases | AES-256 (Transparent Data Encryption) | AWS KMS / GCP Cloud KMS / Azure Key Vault |
| Object Storage (S3) | AES-256-GCM (SSE-KMS) | KMS with automatic rotation |
| Message Queues | AES-256 (at-rest encryption) | Managed by cloud provider |
| Log Storage | AES-256 | Separate KMS key from application data |
| Backups | AES-256 | Backup-specific KMS key with restricted access |

**TLS Configuration Standards:**

```
Cipher Suites (ordered by preference):
  1. TLS_AES_256_GCM_SHA384         (TLS 1.3)
  2. TLS_CHACHA20_POLY1305_SHA256   (TLS 1.3)
  3. TLS_AES_128_GCM_SHA256         (TLS 1.3)
  4. ECDHE-ECDSA-AES256-GCM-SHA384  (TLS 1.2)
  5. ECDHE-RSA-AES256-GCM-SHA384    (TLS 1.2)

Forbidden:
  - RC4, 3DES, DES
  - CBC mode ciphers (BEAST/POODLE)
  - RSA key exchange (no forward secrecy)
  - TLS 1.0, TLS 1.1, SSL 3.0
```

### 4.2 Secrets Management

**Architecture: HashiCorp Vault (or AWS Secrets Manager)**

```
+------------------+     +------------------+     +------------------+
|   Vault Server   |     | Vault Agent      |     | Application      |
|   (HA Cluster)   |---->| (Sidecar/Init)   |---->| Container        |
|                  |     |                  |     |                  |
| - Seal/Unseal    |     | - Auto-auth via  |     | - Reads secrets  |
| - Audit log      |     |   K8s SA token   |     |   from volume    |
| - Policy engine  |     | - Template       |     |   mount or API   |
| - Secret engines |     |   rendering      |     | - Never stores   |
| - Dynamic creds  |     | - Lease renewal  |     |   secrets in env |
+------------------+     +------------------+     +------------------+
```

**Secrets Management Rules:**

| Rule | Rationale |
|------|-----------|
| No secrets in environment variables | Visible via /proc, Kubernetes API, crash dumps |
| No secrets in container images | Images are stored in registries, accessible to many |
| No secrets in source code | Repository access != secret access |
| No secrets in ConfigMaps | ConfigMaps are not encrypted by default |
| Dynamic database credentials (Vault) | Credentials auto-expire, unique per pod instance |
| Secret rotation without restart | Vault Agent sidecar handles rotation transparently |
| Audit log for all secret access | Every read/write to Vault is logged |

**Vault Policy Example:**

```hcl
# Order Service Vault Policy
path "database/creds/order-service-role" {
  capabilities = ["read"]
}

path "secret/data/order-service/*" {
  capabilities = ["read"]
}

# Deny access to other services' secrets
path "secret/data/payment-service/*" {
  capabilities = ["deny"]
}

path "database/creds/payment-service-role" {
  capabilities = ["deny"]
}
```

### 4.3 Data Classification Per Service

Each microservice owns a specific data domain. Data classification determines security controls applied to that domain.

| Service | Data Classification | PII Present | Encryption Required | Retention | Access Controls |
|---------|-------------------|-------------|--------------------|-----------|-----------------|
| User Service | CONFIDENTIAL | YES (email, name, phone) | At rest + in transit | 7 years (regulatory) | Role-based, MFA for admin |
| Payment Service | RESTRICTED | YES (payment methods, billing address) | At rest + in transit + field-level | PCI-DSS retention rules | PCI-DSS scope, isolated network segment |
| Order Service | INTERNAL | PARTIAL (shipping address) | At rest + in transit | 3 years | Service-level auth |
| Inventory Service | INTERNAL | NO | In transit (mTLS) | 1 year | Service-level auth |
| Notification Service | CONFIDENTIAL | YES (contact info passed through) | In transit (mTLS) | 30 days (logs only) | Write-only from other services |
| Analytics Service | INTERNAL | ANONYMIZED | In transit (mTLS) | 2 years | Read-only from data lake |
| Auth Service | RESTRICTED | YES (credentials, tokens, sessions) | At rest + in transit + field-level | Session: 30 days, Audit: 7 years | Highest privilege level, HSM for keys |

### 4.4 PII Handling Across Service Boundaries

**Principle: PII should not leave its owning service unnecessarily.**

```
WRONG: Order Service queries User Service for full profile,
       stores email/phone in order record "for convenience"

RIGHT: Order Service stores user_id reference only.
       When email is needed (e.g., order confirmation),
       Order Service calls Notification Service with order_id.
       Notification Service calls User Service for contact info.
       Email/phone never stored in Order Service database.
```

**PII Propagation Rules:**

| Rule | Implementation |
|------|---------------|
| Minimize PII in requests | Send user_id, not full user object |
| No PII in URLs | POST body or headers only |
| No PII in logs | Structured logging with PII redaction |
| No PII in traces | Sanitize span attributes before export |
| PII in transit encrypted | mTLS (handled by service mesh) |
| PII at rest encrypted | Field-level encryption for PII columns |
| PII access audited | Every PII read/write logged with actor identity |
| PII deletable (GDPR Art. 17) | Cascading delete across all services via saga pattern |

**PII Redaction in Logs:**

```javascript
// Shared logging library - automatic PII redaction
const PII_FIELDS = new Set([
  'email', 'phone', 'ssn', 'creditCard', 'password',
  'firstName', 'lastName', 'address', 'dateOfBirth',
  'ipAddress', 'userAgent'
]);

function redactPII(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (PII_FIELDS.has(key)) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      result[key] = redactPII(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
```

### 4.5 Database Credential Rotation

**Dynamic Credentials with Vault:**

```
+------------------+     +------------------+     +------------------+
| Vault Server     |     | Order Service    |     | Order Database   |
|                  |     | (Pod Instance)   |     | (PostgreSQL)     |
|                  |     |                  |     |                  |
| 1. Generate      |---->| 2. Receive creds |---->| 3. Authenticate  |
|    unique creds  |     |    via sidecar   |     |    with unique   |
|    per pod       |     |                  |     |    credentials   |
|                  |     |                  |     |                  |
| 4. Auto-revoke   |     | TTL: 1 hour     |     | Role: order_rw   |
|    after TTL     |     | Renewal: 30 min  |     | Permissions:     |
|                  |     |                  |     | SELECT, INSERT,  |
+------------------+     +------------------+     | UPDATE on orders |
                                                  +------------------+
```

**Vault Database Secret Engine Configuration:**

```hcl
# Configure PostgreSQL secret engine
resource "vault_database_secret_backend_connection" "order_db" {
  backend       = "database"
  name          = "order-db"
  allowed_roles = ["order-service-role"]

  postgresql {
    connection_url = "postgresql://{{username}}:{{password}}@order-db:5432/orders"
  }
}

# Define role with TTL and creation statement
resource "vault_database_secret_backend_role" "order_service" {
  backend = "database"
  name    = "order-service-role"
  db_name = "order-db"

  default_ttl = "3600"   # 1 hour
  max_ttl     = "86400"  # 24 hours

  creation_statements = [
    "CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';",
    "GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO \"{{name}}\";",
    "GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO \"{{name}}\";"
  ]

  revocation_statements = [
    "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM \"{{name}}\";",
    "DROP ROLE IF EXISTS \"{{name}}\";"
  ]
}
```

**Rotation Schedule:**

| Credential Type | Rotation Period | Method |
|----------------|-----------------|--------|
| Database credentials | 1 hour TTL (dynamic) | Vault database secret engine |
| Service JWT signing keys | 30 days | JWKS rotation with overlap period |
| mTLS certificates | 24 hours | SPIRE/cert-manager auto-rotation |
| API keys (external) | 90 days | Manual rotation with dual-key period |
| Encryption keys (KMS) | 365 days | Automatic rotation via cloud KMS |
| Root CA certificate | 5 years | Planned rotation with dual-root overlap |

---

## 5. Observability and Incident Response

### 5.1 Centralized Security Logging

**Architecture:**

```
+-------------+    +-------------+    +-------------+
| Service A   |    | Service B   |    | Service C   |
| (log agent) |    | (log agent) |    | (log agent) |
+------+------+    +------+------+    +------+------+
       |                  |                  |
       v                  v                  v
+--------------------------------------------------+
|          Log Aggregation Pipeline                 |
|  (Fluentd/Vector/OpenTelemetry Collector)         |
|                                                  |
|  Filters:                                        |
|  - PII redaction                                 |
|  - Severity classification                       |
|  - Security event extraction                     |
+--------------------------------------------------+
       |                  |                  |
       v                  v                  v
+-------------+    +-------------+    +-------------+
| Elasticsearch|    | S3 (Archive)|    | SIEM        |
| (Hot: 30d)  |    | Object Lock |    | (Alerts)    |
| (Warm: 90d) |    | (7 years)   |    |             |
+-------------+    +-------------+    +-------------+
```

**Security Events That MUST Be Logged:**

| Event Category | Events | Minimum Fields |
|---------------|--------|----------------|
| Authentication | Login success/failure, logout, token refresh, token revocation | timestamp, userId, ip, userAgent, result, reason |
| Authorization | Access granted/denied, scope check results | timestamp, userId, resource, action, decision, policy |
| Rate Limiting | Rate limit triggered, client throttled | timestamp, clientId, endpoint, limit, count |
| Anomaly | Unusual IP, geo mismatch, impossible travel | timestamp, userId, currentIp, previousIp, distance |
| Data Access | PII read/write, bulk export, admin operations | timestamp, userId, dataType, operation, recordCount |
| Configuration | Secret rotation, policy change, deployment | timestamp, actor, changeType, before, after |
| Infrastructure | Pod restart, OOM kill, certificate expiry | timestamp, service, event, details |

### 5.2 Distributed Tracing for Security Events

**OpenTelemetry Integration:**

```
User Request --> API Gateway --> Order Service --> Payment Service
                    |                |                   |
                    v                v                   v
              Span: gateway    Span: order         Span: payment
              trace_id: abc    trace_id: abc       trace_id: abc
              span_id: 001     span_id: 002        span_id: 003
              parent: null     parent: 001         parent: 002

              Attributes:      Attributes:         Attributes:
              auth.method:     auth.scope:         auth.scope:
                bearer_jwt       orders:read         payments:create
              auth.user_id:    authz.decision:     authz.decision:
                user-123         allowed              allowed
              security.waf:    db.statement:       payment.provider:
                passed           SELECT...            stripe
```

**Security-Specific Span Attributes:**

```javascript
// OpenTelemetry security attributes (added by middleware)
const securityAttributes = {
  // Authentication context
  'security.auth.method': 'bearer_jwt',
  'security.auth.user_id': 'user-123',  // from JWT sub claim
  'security.auth.token_jti': 'jti-456', // JWT ID for correlation
  'security.auth.issuer': 'https://auth.example.com',

  // Authorization context
  'security.authz.decision': 'allowed',
  'security.authz.required_scope': 'orders:read',
  'security.authz.policy_version': 'v2.3.1',

  // Network context
  'security.client.ip': '203.0.113.42',
  'security.client.geo': 'US',
  'security.tls.version': 'TLSv1.3',
  'security.mtls.peer': 'spiffe://cluster/ns/prod/sa/api-gateway',

  // Risk indicators
  'security.risk.score': 0.15,
  'security.risk.factors': 'none',
};
```

### 5.3 Anomaly Detection Patterns

**Detection Rules:**

| Pattern | Detection Method | Response |
|---------|-----------------|----------|
| Brute force | > 5 failed auth attempts in 5 minutes from same IP | Block IP for 15 minutes, alert security team |
| Credential stuffing | > 50 failed auth attempts in 1 minute across different usernames from same IP range | Block CIDR /24, trigger CAPTCHA |
| Impossible travel | Auth from geo location > 500km from previous auth within < 1 hour | Force re-authentication, alert user |
| Token abuse | Same token used from > 3 distinct IPs in 1 hour | Revoke token, alert user |
| Privilege escalation | Service requesting scopes outside its registered scope set | Block request, alert security team, trigger investigation |
| Data exfiltration | Single user/service reading > 10x normal record count in 1 hour | Rate limit, alert data team |
| Lateral movement | Service A calling Service C when no registered dependency exists | Block at service mesh level, alert security team |
| After-hours access | Admin operations outside business hours without on-call ticket | Require MFA re-verification, alert manager |

**Implementation: Policy Engine**

```yaml
# OPA (Open Policy Agent) anomaly detection policy
package security.anomaly

import rego.v1

# Detect impossible travel
impossible_travel if {
  current := input.auth_event
  previous := data.recent_auth[current.user_id]

  time_diff_hours := (current.timestamp - previous.timestamp) / 3600
  distance_km := geo_distance(current.geo, previous.geo)

  # Speed > 500 km/h is impossible
  distance_km / time_diff_hours > 500
}

# Detect lateral movement
unauthorized_service_call if {
  caller := input.source_service
  target := input.target_service

  # Check against registered service dependency graph
  not data.service_dependencies[caller][target]
}
```

### 5.4 Incident Response in Distributed Systems

**Incident Response Playbook: Authentication Breach**

```
PHASE 1: DETECTION (0-15 minutes)
  - SIEM alert triggered by anomaly pattern
  - On-call engineer receives PagerDuty notification
  - Engineer validates alert is not false positive via:
    - Distributed trace review (Jaeger/Tempo)
    - Log correlation (Elasticsearch/Loki)
    - Service mesh traffic analysis (Kiali)

PHASE 2: CONTAINMENT (15-60 minutes)
  - Revoke all active sessions for affected user(s)
  - Rotate compromised service credentials (Vault emergency rotation)
  - If service compromised:
    - Isolate service via NetworkPolicy update
    - Scale compromised service to 0 replicas
    - Redirect traffic to fallback/static response
  - Enable enhanced logging on affected services
  - Preserve forensic evidence (pod logs, network captures)

PHASE 3: ERADICATION (1-4 hours)
  - Identify root cause:
    - CVE exploitation? -> Patch vulnerability
    - Credential compromise? -> Rotate all related secrets
    - Configuration error? -> Fix and add policy guard
  - Deploy fix to staging, validate
  - Deploy fix to production with canary rollout
  - Verify fix via security tests

PHASE 4: RECOVERY (4-24 hours)
  - Restore normal service operation
  - Re-enable network access for isolated services
  - Verify all services healthy via health checks
  - Rotate ALL credentials in affected scope (precautionary)
  - Re-enable normal alerting thresholds

PHASE 5: POST-INCIDENT (24-72 hours)
  - Blameless post-mortem document
  - Timeline reconstruction from distributed traces
  - Root cause analysis (5 Whys)
  - Corrective actions with owners and deadlines
  - Update runbooks with lessons learned
  - Review and update anomaly detection rules
```

**Communication Matrix During Incident:**

| Severity | Notify | Channel | SLA |
|----------|--------|---------|-----|
| P1 (Data breach) | CISO, Legal, Engineering VP | War room + dedicated Slack | Immediate |
| P2 (Service compromise) | Security team, Service owner | Security Slack + PagerDuty | 15 minutes |
| P3 (Anomaly detected) | On-call engineer | PagerDuty | 30 minutes |
| P4 (Configuration drift) | Service owner | Jira ticket | Next business day |

---

## 6. Compliance Considerations

### 6.1 GDPR Data Residency in Microservices

**Challenge:** In a monolith, data residency is enforced at the database level. In microservices, user data may be processed by services in multiple regions.

**Architecture for GDPR Compliance:**

```
EU Users                                    US Users
    |                                           |
    v                                           v
+------------------+                  +------------------+
| EU API Gateway   |                  | US API Gateway   |
| (eu-west-1)      |                  | (us-east-1)      |
+------------------+                  +------------------+
    |                                           |
    v                                           v
+------------------+                  +------------------+
| EU Service Mesh  |                  | US Service Mesh  |
| - User Service   |   metadata only  | - User Service   |
| - Order Service  |<--------------->| - Order Service  |
| - Payment Svc    |   (no PII)       | - Payment Svc    |
| - EU Database    |                  | - US Database    |
+------------------+                  +------------------+
```

**GDPR Requirements Mapping:**

| GDPR Article | Requirement | Microservices Implementation |
|-------------|-------------|------------------------------|
| Art. 5(1)(f) | Integrity and confidentiality | mTLS, encryption at rest, field-level encryption for PII |
| Art. 17 | Right to erasure | Distributed delete saga: User Service coordinates cascading delete across all services storing user data |
| Art. 20 | Data portability | User Service exports all user data via standardized API endpoint |
| Art. 25 | Data protection by design | PII minimization at service boundaries, data classification per service |
| Art. 30 | Records of processing | Audit log of all PII processing activities per service |
| Art. 32 | Security of processing | mTLS, access controls, encryption, regular security testing |
| Art. 33 | Breach notification (72h) | Automated breach detection + incident response playbook |
| Art. 35 | DPIA | Data Protection Impact Assessment for each service handling PII |
| Art. 44-49 | Cross-border transfers | Regional deployment + data residency controls (no PII crosses regions) |

**Data Subject Request Handling (Saga Pattern):**

```
User requests data deletion (Art. 17):

1. User Service receives DELETE /users/me request
2. User Service initiates "deletion saga":
   a. Publish UserDeletionRequested event with correlation_id
   b. Order Service: anonymize orders (replace user_id with hash)
   c. Payment Service: delete payment methods, anonymize transactions
   d. Notification Service: delete contact preferences
   e. Analytics Service: delete or anonymize user data
   f. Auth Service: revoke all tokens, delete credentials
3. Each service publishes DeletionCompleted event
4. Saga coordinator verifies all services completed
5. User Service deletes user record
6. Publish UserDeleted event (audit trail)
7. Return 204 No Content to user

Compensating actions if any service fails:
   - Log failure with correlation_id
   - Retry with exponential backoff (3 attempts)
   - If still failing: alert data protection officer
   - Manual intervention within 30 days (regulatory requirement)
```

### 6.2 SOC2 Audit Trail Requirements

**SOC2 Trust Services Criteria Mapping:**

| Criteria | Category | Microservices Control |
|----------|----------|----------------------|
| CC6.1 | Logical and physical access | mTLS + RBAC + NetworkPolicy |
| CC6.2 | Access credentials | Vault dynamic credentials, short-lived tokens |
| CC6.3 | Access revocation | Token revocation, certificate revocation (CRL/OCSP) |
| CC6.6 | Boundary protection | API Gateway, WAF, Network segmentation |
| CC6.7 | Restriction of data transmission | Egress controls, TLS everywhere |
| CC6.8 | Detection of unauthorized activities | SIEM, anomaly detection, distributed tracing |
| CC7.1 | Detection of system changes | GitOps, immutable infrastructure, admission controllers |
| CC7.2 | Monitoring for anomalies | OpenTelemetry metrics, service mesh observability |
| CC7.3 | Security event evaluation | Incident response playbook, severity classification |
| CC8.1 | Change management | GitOps with PR approval, canary deployments |
| CC9.1 | Risk mitigation | Threat modeling (STRIDE), security controls registry |

**Audit Trail Architecture:**

```
Every service request generates an audit record:

{
  "auditId": "uuid-v4",
  "timestamp": "2026-02-08T10:30:00.000Z",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "actor": {
    "type": "user|service",
    "id": "user-123|spiffe://cluster/ns/prod/sa/order-svc",
    "ip": "203.0.113.42",
    "authenticated": true,
    "authMethod": "oauth2_jwt"
  },
  "action": {
    "type": "READ|CREATE|UPDATE|DELETE",
    "resource": "orders/order-67890",
    "service": "order-service",
    "endpoint": "GET /api/v1/orders/67890"
  },
  "result": {
    "status": "SUCCESS|DENIED|ERROR",
    "statusCode": 200,
    "reason": null
  },
  "context": {
    "environment": "production",
    "region": "us-east-1",
    "deploymentVersion": "v2.3.1"
  }
}

Storage requirements:
  - Hot storage: 90 days (Elasticsearch)
  - Warm storage: 1 year (S3 Standard-IA)
  - Cold storage: 7 years (S3 Glacier with Object Lock)
  - Immutability: Object Lock prevents deletion/modification
  - Access: Read-only for auditors, no service can delete audit records
```

### 6.3 PCI-DSS Scope Reduction Through Service Isolation

**Monolith PCI-DSS Scope:** The entire monolith is in PCI-DSS scope because payment processing code and cardholder data exist within the same application boundary.

**Microservices PCI-DSS Scope Reduction:**

```
+---------------------------------------------+
|           OUT OF PCI-DSS SCOPE              |
|                                             |
| +----------+  +----------+  +----------+   |
| | User Svc |  | Order Svc|  | Inventory|   |
| |          |  | (no CHD) |  | Service  |   |
| +----------+  +----------+  +----------+   |
|                     |                       |
+---------------------|-------  --------------+
                      |
          +-----------|----------+
          |   PCI-DSS SCOPE     |
          |  (isolated segment)  |
          |                     |
          | +------------------+|
          | | Payment Service  ||
          | | - Tokenizes cards||
          | | - Calls PSP API  ||
          | +------------------+|
          |         |           |
          | +------------------+|
          | | Payment Database ||
          | | - Stores tokens  ||
          | | - NOT card numbers||
          | +------------------+|
          +---------------------+

Key scope reduction:
  1. Payment Service is the ONLY service that touches card data
  2. Card numbers are tokenized by PSP (Stripe/Adyen) immediately
  3. Payment Service stores only PSP tokens, not card numbers
  4. Network segment isolation via Kubernetes NetworkPolicy
  5. Only Payment Service has egress to PSP API
  6. Other services interact with Payment Service via internal API
     (never see card numbers)
```

**PCI-DSS Controls for Payment Service:**

| PCI-DSS Req | Control | Implementation |
|-------------|---------|----------------|
| 1.x | Firewall / Network | Dedicated NetworkPolicy, separate namespace |
| 2.x | Vendor defaults | Hardened container image, CIS benchmark |
| 3.x | Protect stored data | PSP tokenization (no CHD stored), encrypted fields |
| 4.x | Encrypt transmission | mTLS to PSP API, TLS 1.2+ minimum |
| 6.x | Secure development | Separate CI/CD pipeline, security code review |
| 7.x | Restrict access | Dedicated RBAC, service-specific Vault policy |
| 8.x | Authentication | mTLS + JWT, no shared credentials |
| 10.x | Logging/monitoring | Dedicated audit log stream, SIEM alerts |
| 11.x | Regular testing | Quarterly ASV scan (only payment service scope) |
| 12.x | Security policy | Payment service-specific security procedures |

---

## 7. Security Controls Registry

Mapping of security controls to STRIDE threats, OWASP categories, and compliance requirements.

| Control ID | Control | STRIDE | OWASP | Compliance | Priority |
|-----------|---------|--------|-------|------------|----------|
| MS-SEC-001 | Mutual TLS for all inter-service communication | Spoofing, Tampering | A02, A07 | SOC2 CC6.7 | CRITICAL |
| MS-SEC-002 | SPIFFE/SPIRE service identity | Spoofing | A07 | SOC2 CC6.1 | CRITICAL |
| MS-SEC-003 | JWT algorithm whitelist (RS256/ES256 only) | Spoofing, Tampering | A02, A07 | SOC2 CC6.2 | CRITICAL |
| MS-SEC-004 | API Gateway auth enforcement (default deny) | Spoofing, EoP | A01, A07 | SOC2 CC6.6 | CRITICAL |
| MS-SEC-005 | Kubernetes NetworkPolicy (default deny) | Spoofing, EoP, DoS | A01, A05 | SOC2 CC6.6, PCI 1.x | HIGH |
| MS-SEC-006 | Vault dynamic database credentials | Info Disclosure | A02, A07 | SOC2 CC6.2, PCI 8.x | HIGH |
| MS-SEC-007 | Structured security audit logging | Repudiation | A09 | SOC2 CC6.8, CC7.2, GDPR Art. 30 | HIGH |
| MS-SEC-008 | Distributed tracing (OpenTelemetry) | Repudiation | A09 | SOC2 CC7.2 | HIGH |
| MS-SEC-009 | PII redaction in logs | Info Disclosure | A01, A03 | GDPR Art. 5, Art. 25 | HIGH |
| MS-SEC-010 | Circuit breaker pattern | DoS | A05 | SOC2 CC9.1 | HIGH |
| MS-SEC-011 | Rate limiting (per-client, per-endpoint) | DoS | A04 | SOC2 CC6.6 | HIGH |
| MS-SEC-012 | Container image signing (Cosign) | Tampering | A08 | SOC2 CC7.1 | HIGH |
| MS-SEC-013 | Pod Security Standards (restricted) | EoP | A05 | SOC2 CC6.1 | HIGH |
| MS-SEC-014 | WAF at API Gateway | Tampering, Info Disclosure | A03 | SOC2 CC6.6, PCI 6.x | HIGH |
| MS-SEC-015 | Token exchange with scope reduction | EoP | A01 | SOC2 CC6.1 | MEDIUM |
| MS-SEC-016 | Data classification per service | Info Disclosure | A01 | GDPR Art. 25, PCI 3.x | MEDIUM |
| MS-SEC-017 | Egress controls (REGISTRY_ONLY) | Info Disclosure, Tampering | A10 | SOC2 CC6.7 | MEDIUM |
| MS-SEC-018 | Database-per-service pattern | Tampering, EoP | A01, A04 | PCI 7.x | MEDIUM |
| MS-SEC-019 | Anomaly detection rules | Spoofing, EoP | A07 | SOC2 CC6.8 | MEDIUM |
| MS-SEC-020 | Incident response playbook | All | A09 | SOC2 CC7.3, GDPR Art. 33 | MEDIUM |
| MS-SEC-021 | GDPR data deletion saga | Info Disclosure | A01 | GDPR Art. 17 | MEDIUM |
| MS-SEC-022 | Immutable audit log storage (S3 Object Lock) | Repudiation | A09 | SOC2 CC6.8, PCI 10.x | MEDIUM |
| MS-SEC-023 | RBAC audit (automated) | EoP | A01, A05 | SOC2 CC6.3, PCI 7.x | LOW |
| MS-SEC-024 | NTP synchronization for audit timeline | Repudiation | A09 | SOC2 CC7.2 | LOW |

---

## 8. Migration Security Checklist

### Pre-Migration

- [ ] Threat model completed for each service boundary (STRIDE)
- [ ] Data classification defined for each service
- [ ] PII inventory complete (which services handle which PII)
- [ ] Service dependency graph documented
- [ ] NetworkPolicy templates created (default deny)
- [ ] Vault infrastructure provisioned
- [ ] Service mesh deployed with PERMISSIVE mTLS
- [ ] Centralized logging pipeline operational
- [ ] Incident response playbook updated for distributed system
- [ ] DPIA completed for services handling PII

### During Migration

- [ ] Each service deployed with mTLS sidecar
- [ ] Each service has unique Vault policy (least privilege)
- [ ] Each service has NetworkPolicy (explicit allow only)
- [ ] Each service emits structured audit logs
- [ ] Each service validates JWT on all endpoints
- [ ] No shared databases between services
- [ ] PII redaction verified in log pipeline
- [ ] Container images signed and verified
- [ ] Pod Security Standards enforced (restricted)
- [ ] Egress controls configured (REGISTRY_ONLY)

### Post-Migration

- [ ] mTLS mode set to STRICT (no plaintext)
- [ ] All anomaly detection rules active
- [ ] Penetration test completed on new architecture
- [ ] SOC2 audit trail verified (end-to-end)
- [ ] GDPR data deletion flow tested (saga pattern)
- [ ] PCI-DSS scope validation completed
- [ ] Disaster recovery tested for distributed system
- [ ] Runbooks updated for new incident response procedures
- [ ] Security training completed for engineering team
- [ ] Compliance documentation updated

---

## 9. Hybrid Validation Checklist

### IEEE 1028 Security Base (85%)

- [ ] Input validation on all service endpoints
- [ ] No SQL injection vulnerabilities (parameterized queries)
- [ ] No XSS vulnerabilities (output encoding)
- [ ] Sensitive data encrypted at rest and in transit
- [ ] Authentication checks present on all non-public endpoints
- [ ] Authorization checks present with least privilege
- [ ] No hardcoded secrets or credentials in code or images
- [ ] OWASP Top 10 considered for each service
- [ ] Error handling does not expose internals
- [ ] Security logging for all auth/authz decisions
- [ ] Dependencies scanned for known vulnerabilities
- [ ] Container images scanned before deployment
- [ ] TLS 1.2+ enforced for all connections
- [ ] Rate limiting on all external-facing endpoints
- [ ] CORS configured restrictively

### Context-Specific Items (15%)

- [ ] [AI-GENERATED] Service mesh mTLS mode set to STRICT in production
- [ ] [AI-GENERATED] SPIFFE identities verified for all services
- [ ] [AI-GENERATED] Kubernetes NetworkPolicy default-deny applied per namespace
- [ ] [AI-GENERATED] Vault dynamic credentials used (no static database passwords)
- [ ] [AI-GENERATED] Token exchange scope reduction enforced at each service hop
- [ ] [AI-GENERATED] PII redaction tested in centralized log pipeline
- [ ] [AI-GENERATED] Circuit breakers configured for all downstream dependencies
- [ ] [AI-GENERATED] Pod Security Standards (restricted profile) enforced via admission controller
- [ ] [AI-GENERATED] Egress traffic restricted to explicitly registered external services
- [ ] [AI-GENERATED] Distributed tracing includes security attributes for audit correlation

---

**Total Items**: 25
**IEEE Base**: 15 (60%)
**Contextual**: 10 (40%)

> Note: Context-specific percentage is elevated (40% vs typical 15-20%) because this is an architecture review with infrastructure-specific concerns, not a code review. The contextual items address Kubernetes, service mesh, and distributed systems security patterns that have no direct IEEE 1028 equivalent.

---

## References

- NIST SP 800-207: Zero Trust Architecture
- NIST SP 800-190: Application Container Security Guide
- OWASP Top 10 (2021)
- OAuth 2.1 (draft-ietf-oauth-v2-1)
- RFC 8725: JWT Best Current Practices
- RFC 8693: OAuth 2.0 Token Exchange
- RFC 8628: Device Authorization Grant
- PCI-DSS v4.0
- GDPR (Regulation EU 2016/679)
- SOC2 Trust Services Criteria (2017)
- CIS Kubernetes Benchmark v1.8
- SPIFFE/SPIRE Documentation

---

*This document is a living architecture artifact. It MUST be reviewed and updated when new services are added, service boundaries change, or compliance requirements evolve.*
