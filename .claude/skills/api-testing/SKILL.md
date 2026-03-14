---
name: api-testing
description: API security testing and validation for REST/GraphQL/gRPC endpoints, contract testing, load testing, fuzzing, and Postman/Bruno/Hurl workflows
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Bash, Glob, Grep]
agents: [developer, qa, security-architect]
category: 'Validation & Quality'
tags: [api-testing, security, postman, contract-testing, load-testing, fuzzing, rest, graphql, grpc]
best_practices:
  - Test authentication and authorization on every endpoint
  - Use contract tests to catch breaking changes before deployment
  - Run load tests against staging, never production
  - Fuzz boundary conditions (empty strings, max integers, unicode)
error_handling: graceful
---

# API Testing

## Purpose

Comprehensive API testing and security validation skill covering REST, GraphQL, and gRPC endpoints. Provides structured workflows for functional testing, contract testing, load testing, fuzzing, and OWASP API Top 10 security checks using Bruno, Hurl, k6, Postman, and httpie.

## When to Invoke

```javascript
Skill({ skill: 'api-testing' });
```

Invoke when:

- Validating a new or modified REST/GraphQL/gRPC API
- Running contract tests before a deployment
- Performing an OWASP API Top 10 security audit
- Setting up load or soak tests for an endpoint
- Fuzzing request parameters and headers for edge-case bugs

---

## Toolchain

| Tool       | Purpose                          | Install                     |
| ---------- | -------------------------------- | --------------------------- |
| **Bruno**  | Git-native API collection runner | `npm i -g @usebruno/cli`    |
| **Hurl**   | Plain-text HTTP test runner      | `cargo install hurl` or pkg |
| **k6**     | JavaScript-based load testing    | `brew install k6`           |
| **httpie** | Human-friendly curl replacement  | `pip install httpie`        |
| **Zap**    | OWASP automated security scanner | Docker or standalone binary |
| **Nuclei** | Template-driven vuln scanner     | `go install nuclei`         |

---

## Workflow

### Step 1: Gather API Specification

**Command:**

```bash
# Try OpenAPI spec first
curl -s http://localhost:3000/openapi.json | jq '.info.title, .paths | keys'

# Or check for AsyncAPI / GraphQL introspection
curl -s -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __schema { types { name } } }"}' | jq '.data.__schema.types[].name'
```

**Expected output:** List of API paths or type names confirming the spec is reachable.
**Verify:** Exit code 0, valid JSON returned.

### Step 2: Functional Testing with Hurl

Write a `.hurl` file per endpoint group. Each file tests success, error, and boundary cases.

**Example — `tests/api/users.hurl`:**

```hurl
# Create user — success path
POST http://localhost:3000/api/users
Content-Type: application/json
{
  "name": "Alice",
  "email": "alice@example.com"
}
HTTP 201
[Asserts]
header "Content-Type" contains "application/json"
jsonpath "$.id" isInteger
jsonpath "$.email" == "alice@example.com"

# Missing required field — error path
POST http://localhost:3000/api/users
Content-Type: application/json
{}
HTTP 422
[Asserts]
jsonpath "$.errors[0].field" == "email"

# Boundary: extremely long name
POST http://localhost:3000/api/users
Content-Type: application/json
{
  "name": "A",
  "email": "b@c.io"
}
HTTP 422
```

**Run:**

```bash
hurl --test tests/api/users.hurl --variable base_url=http://localhost:3000
```

**Expected output:** `users.hurl: Success (3 tests, 3 assertions)`
**Verify:** Exit code 0, all assertions pass.

### Step 3: Contract Testing with Pact

Define consumer-driven contracts to catch breaking changes.

**Consumer test (Jest + Pact):**

```javascript
// tests/contract/user-api.consumer.test.js
const { Pact } = require('@pact-foundation/pact');
const { getUserById } = require('../../src/api/users');

const provider = new Pact({
  consumer: 'frontend-app',
  provider: 'user-api',
  port: 4000,
});

describe('User API contract', () => {
  beforeAll(() => provider.setup());
  afterAll(() => provider.finalize());

  it('returns a user by ID', async () => {
    await provider.addInteraction({
      state: 'user 42 exists',
      uponReceiving: 'GET /users/42',
      withRequest: { method: 'GET', path: '/users/42' },
      willRespondWith: {
        status: 200,
        body: { id: 42, name: 'Alice', email: 'alice@example.com' },
      },
    });
    const user = await getUserById(42);
    expect(user.id).toBe(42);
    await provider.verify();
  });
});
```

**Run:**

```bash
npx jest tests/contract/ --forceExit
```

**Expected output:** All contract tests pass; pact file written to `./pacts/`.

### Step 4: OWASP API Top 10 Checklist

Run this checklist against every new API surface. Document PASS / FAIL for each item.

| #     | Risk                                            | Test Command                                                                                |
| ----- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| API1  | Broken Object Level Auth                        | `hurl tests/security/bola.hurl` — access resource with wrong user token                     |
| API2  | Broken Auth                                     | `hurl tests/security/auth.hurl` — expired token, no token, invalid signature                |
| API3  | Broken Object Property Auth                     | `hurl tests/security/mass-assignment.hurl` — send admin fields in POST body                 |
| API4  | Unrestricted Resource Consumption               | `k6 run tests/load/burst.js` — spike to 1000 RPS and verify rate limiting returns 429       |
| API5  | Broken Function Level Auth                      | `hurl tests/security/flauth.hurl` — call admin endpoints as regular user                    |
| API6  | Unrestricted Access to Sensitive Business Flows | `hurl tests/security/business-flow.hurl` — replay/race critical operations                  |
| API7  | Server Side Request Forgery                     | `hurl tests/security/ssrf.hurl` — supply internal URLs as callback parameters               |
| API8  | Security Misconfiguration                       | Check response headers: `curl -I http://localhost:3000/api/health`                          |
| API9  | Improper Inventory Management                   | Compare OpenAPI spec endpoints vs. live server: `npx @stoplight/spectral lint openapi.json` |
| API10 | Unsafe Consumption of APIs                      | Review all third-party API calls for input validation and response schema checks            |

**Verify API8 headers:**

```bash
curl -sI http://localhost:3000/api/health | grep -E "X-Content-Type|X-Frame|Strict-Transport|Content-Security"
```

**Expected:** All four security headers present.

### Step 5: Load Testing with k6

**File — `tests/load/baseline.js`:**

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 }, // ramp up
    { duration: '1m', target: 50 }, // steady state
    { duration: '15s', target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95th percentile < 500ms
    http_req_failed: ['rate<0.01'], // error rate < 1%
  },
};

export default function () {
  const res = http.get('http://localhost:3000/api/users', {
    headers: { Authorization: `Bearer ${__ENV.API_TOKEN}` },
  });
  check(res, {
    'status 200': r => r.status === 200,
    'response time OK': r => r.timings.duration < 500,
  });
  sleep(1);
}
```

**Run:**

```bash
API_TOKEN=test_token k6 run tests/load/baseline.js
```

**Expected output:** Summary table showing thresholds pass (green). Abort if thresholds fail (red).

### Step 6: GraphQL-Specific Testing

```bash
# Introspection enabled? (should be disabled in production)
curl -s -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __schema { queryType { name } } }"}' | jq '.data'

# Depth-limit bypass (send deeply nested query)
hurl tests/security/graphql-depth.hurl

# Batching abuse
curl -s -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '[{"query":"{ user(id:1) { name } }"},{"query":"{ user(id:2) { name } }"}]' | jq length
```

**Expected:** Introspection returns null or 403 in production. Batch query returns 400 if batching is disabled.

### Step 7: Fuzzing with Nuclei

```bash
# Run OWASP API template pack
nuclei -u http://localhost:3000 \
  -t nuclei-templates/http/vulnerabilities/ \
  -t nuclei-templates/http/misconfiguration/ \
  -severity medium,high,critical \
  -o .claude/context/reports/backend/api-fuzz-$(date +%Y-%m-%d).md
```

**Expected output:** Report written; review all `[medium]`+ findings before marking complete.

---

## Anti-Patterns

- Never run load tests against production — always target a staging environment with production-like data
- Never skip auth tests — every protected endpoint must have a test with an expired token, a missing token, and a token from a different user
- Never test only happy paths — every endpoint needs at least one 4xx and one boundary test
- Never hardcode tokens in test files — use environment variables (`--variable`, `__ENV`, `.env`)
- Never ignore rate-limit responses — a 429 in load tests means the limit is working; verify it actually blocks further requests

---

## gRPC-Specific Testing

```bash
# Use grpcurl for gRPC endpoint testing
grpcurl -plaintext localhost:50051 list                          # discover services
grpcurl -plaintext localhost:50051 describe mypackage.MyService  # inspect service
grpcurl -d '{"name":"Alice"}' localhost:50051 mypackage.MyService/GetUser

# mTLS enforcement check — verify both-way cert validation
grpcurl -cert client.crt -key client.key -cacert ca.crt \
  myservice.example.com:443 mypackage.MyService/GetUser

# Fuzz gRPC: send wrong field types, missing required fields
grpcurl -d '{"name": null}' localhost:50051 mypackage.MyService/GetUser
```

**Expected:** Server returns `NOT_FOUND` or `INVALID_ARGUMENT`, not `INTERNAL`. mTLS rejects requests without valid client cert.

---

## Related Skills

- `security-architect` — full STRIDE threat modeling and penetration test orchestration
- `tdd` — write failing tests before implementing endpoint changes
- `qa-workflow` — systematic QA validation with fix loops
- `k8s-security-policies` — network policy and pod security for API services

---

## Enforcement Hooks

Input validated against `schemas/input.schema.json` before execution (when run via script).
Output contract defined in `schemas/output.schema.json`.

---

## Search Protocol

Before starting any API testing task, search for existing test suites and known patterns:

```bash
pnpm search:code "hurl OR k6 OR nuclei OR pact"
pnpm search:code "api security test"
```

Use `Skill({ skill: 'ripgrep' })` for fast pattern matching across test files. Use `Skill({ skill: 'code-semantic-search' })` to find existing security test logic by intent.

---

## Memory Protocol (MANDATORY)

**Before starting any task, you must query semantic memory and read recent static memory:**

```bash
node .claude/lib/memory/memory-search.cjs "api security testing endpoint validation"
```

Read `.claude/context/memory/learnings.md`
Read `.claude/context/memory/decisions.md`

Check for previously discovered API security issues, known endpoint patterns, and tool version gotchas.

**After completing work, record findings:**

- New vulnerability pattern found -> Append to `.claude/context/memory/learnings.md`
- Recurring false-positive -> Append to `.claude/context/memory/issues.md`
- Architecture decision (e.g., "disable GraphQL introspection in prod") -> Update `.claude/context/memory/decisions.md`

**During long tasks:** Use `.claude/context/memory/active_context.md` as scratchpad.

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
