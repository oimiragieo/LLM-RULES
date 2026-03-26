<!-- Agent: developer | Task: #44 | Session: 2026-02-06 -->

---

name: documentation-workflow
description: Diataxis framework for creating tutorials, how-to guides, reference docs, and explanations.
triggers:

- documentation request
- PHASE_5_DOCUMENT in enterprise workflow
- API documentation needed
  agents:
- technical-writer

---

# Documentation Workflow

Systematic documentation creation using the Diataxis framework: Tutorials, How-to Guides, Reference, and Explanation. Used by technical-writer agent during PHASE_5_DOCUMENT of enterprise workflows.

## Overview

The Diataxis framework organizes documentation into 4 types based on user intent:

| Type            | User Intent                 | Focus         | Example                       |
| --------------- | --------------------------- | ------------- | ----------------------------- |
| **Tutorial**    | Learning                    | Education     | "Getting Started with API"    |
| **How-to**      | Solving a specific problem  | Task          | "How to Reset User Password"  |
| **Reference**   | Finding precise information | Information   | "API Endpoint Reference"      |
| **Explanation** | Understanding concepts      | Understanding | "Authentication Architecture" |

## Diataxis Framework

### Documentation Type Decision Tree

```
START: What is the user trying to do?

├─ Learn the basics?
│  └─ TUTORIAL
│
├─ Solve a specific problem?
│  └─ HOW-TO GUIDE
│
├─ Look up detailed information?
│  └─ REFERENCE
│
└─ Understand why/how something works?
   └─ EXPLANATION
```

## Type 1: Tutorials

### Purpose

Teach users how to accomplish a goal through hands-on practice.

### Characteristics

- **Learning-oriented:** Focus on teaching, not reference
- **Hands-on:** User follows steps and sees results
- **Beginner-friendly:** Assumes minimal prior knowledge
- **Success-oriented:** User must succeed to build confidence

### Tutorial Template

````markdown
# {Tutorial Title}

**Goal:** By the end of this tutorial, you will {specific learning outcome}.

**Prerequisites:**

- {Prerequisite 1}
- {Prerequisite 2}

**Time to Complete:** ~{X} minutes

---

## What You'll Build

{One paragraph describing the end result}

{Screenshot or diagram of final result}

---

## Step 1: {Action Verb}

{Explanation of what this step accomplishes}

**Instructions:**

1. {Specific instruction}
2. {Specific instruction}

**Expected Output:**

```{language}
{Code or output user should see}
```
````

**Why this works:** {Brief explanation}

---

## Step 2: {Action Verb}

{Repeat structure}

---

## What You Learned

- {Key concept 1}
- {Key concept 2}

## Next Steps

- Try: {Extension activity}
- Read: {Link to related how-to or explanation}

````

### Tutorial Example: API Authentication

```markdown
# Getting Started with Authentication

**Goal:** By the end of this tutorial, you will authenticate with the API and make your first authenticated request.

**Prerequisites:**

- API key (get one at https://example.com/signup)
- curl or Postman installed

**Time to Complete:** ~10 minutes

---

## What You'll Build

You'll authenticate with the API, retrieve a token, and use that token to fetch your user profile.

---

## Step 1: Get Your API Key

Your API key is your secret credential. Keep it safe!

**Instructions:**

1. Log in to https://example.com/dashboard
2. Navigate to Settings → API Keys
3. Click "Generate New Key"
4. Copy the key (you'll only see it once)

**Expected Output:**

````

sk_live_abc123...

````

**Why this works:** API keys authenticate your application without requiring your password.

---

## Step 2: Exchange API Key for Token

**Instructions:**

1. Open your terminal
2. Run this command (replace `YOUR_API_KEY`):

```bash
curl -X POST https://api.example.com/auth/token \
  -H "Authorization: Bearer YOUR_API_KEY"
````

**Expected Output:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 3600
}
```

**Why this works:** Tokens are short-lived and safer to pass around than API keys.

---

## Step 3: Make Authenticated Request

**Instructions:**

1. Copy the token from Step 2
2. Run this command (replace `YOUR_TOKEN`):

```bash
curl https://api.example.com/user/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Output:**

```json
{
  "id": "user_123",
  "email": "you@example.com",
  "name": "Your Name"
}
```

---

## What You Learned

- How to get and use an API key
- How to exchange API key for a token
- How to make authenticated requests

## Next Steps

- Try: Make a POST request to create a resource
- Read: [API Reference](link) for all endpoints

````

## Type 2: How-to Guides

### Purpose

Provide step-by-step instructions to solve a specific problem.

### Characteristics

- **Goal-oriented:** User has a specific task to complete
- **Practical:** Focus on steps, not theory
- **Assumes knowledge:** User knows basics
- **Problem-solving:** Provides a solution, not education

### How-to Template

```markdown
# How to {Accomplish Specific Task}

**Problem:** {One sentence describing the problem}

**Solution:** {One sentence describing the approach}

**Prerequisites:**

- {What user needs before starting}

---

## Steps

### 1. {Action Verb}

{Instruction}

```{language}
{Code example}
````

### 2. {Action Verb}

{Instruction}

```{language}
{Code example}
```

---

## Verification

{How to verify the task succeeded}

---

## Troubleshooting

**Issue:** {Common problem}
**Fix:** {Solution}

**Issue:** {Common problem}
**Fix:** {Solution}

````

### How-to Example: Password Reset

```markdown
# How to Reset User Password

**Problem:** User forgot their password and needs to regain access.

**Solution:** Send a password reset email with a time-limited token.

**Prerequisites:**

- Email service configured (SendGrid, Mailgun, etc.)
- User database with email field

---

## Steps

### 1. Generate Reset Token

```javascript
const crypto = require('crypto');

const resetToken = crypto.randomBytes(32).toString('hex');
const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
const resetTokenExpiry = Date.now() + 3600000; // 1 hour

await db.users.update(userId, {
  resetToken: resetTokenHash,
  resetTokenExpiry,
});
````

### 2. Send Reset Email

```javascript
const resetUrl = `https://example.com/reset-password?token=${resetToken}`;

await emailService.send({
  to: user.email,
  subject: 'Password Reset Request',
  body: `Click here to reset your password: ${resetUrl}`,
});
```

### 3. Verify Token and Update Password

```javascript
const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

const user = await db.users.findOne({
  resetToken: resetTokenHash,
  resetTokenExpiry: { $gt: Date.now() },
});

if (!user) {
  throw new Error('Invalid or expired token');
}

const hashedPassword = await bcrypt.hash(newPassword, 12);

await db.users.update(user.id, {
  password: hashedPassword,
  resetToken: null,
  resetTokenExpiry: null,
});
```

---

## Verification

1. User receives email within 30 seconds
2. Clicking link opens password reset form
3. Submitting form updates password
4. User can log in with new password

---

## Troubleshooting

**Issue:** Email not received
**Fix:** Check spam folder, verify email service API key

**Issue:** Token expired
**Fix:** Request new reset email (tokens expire after 1 hour)

````

## Type 3: Reference Documentation

### Purpose

Provide precise, comprehensive information for lookup.

### Characteristics

- **Information-oriented:** Facts, not steps
- **Comprehensive:** Complete coverage
- **Structure-driven:** Organized for scanning
- **Accurate:** Source of truth

### Reference Template (API Endpoint)

```markdown
# {Endpoint Name}

**Method:** {GET|POST|PUT|DELETE}
**Path:** `{/api/path}`

## Description

{One paragraph describing what this endpoint does}

## Authentication

{Required authentication method}

## Request

### Path Parameters

| Parameter | Type   | Required | Description |
| --------- | ------ | -------- | ----------- |
| {name}    | {type} | {yes/no} | {desc}      |

### Query Parameters

| Parameter | Type   | Required | Default | Description |
| --------- | ------ | -------- | ------- | ----------- |
| {name}    | {type} | {yes/no} | {value} | {desc}      |

### Request Body

```json
{
  "field": "type (description)"
}
````

## Response

### Success Response (200 OK)

```json
{
  "field": "type (description)"
}
```

### Error Responses

**400 Bad Request**

```json
{
  "error": "Invalid input",
  "details": "..."
}
```

**401 Unauthorized**

```json
{
  "error": "Authentication required"
}
```

## Examples

### cURL

```bash
curl -X GET "https://api.example.com/endpoint?param=value" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### JavaScript

```javascript
const response = await fetch('https://api.example.com/endpoint?param=value', {
  headers: { Authorization: `Bearer ${token}` },
});
const data = await response.json();
```

## Rate Limits

- {X} requests per {time period}

````

### Reference Example: User API

```markdown
# Get User by ID

**Method:** GET
**Path:** `/api/users/:id`

## Description

Retrieves a single user by their unique ID.

## Authentication

Requires Bearer token in Authorization header.

## Request

### Path Parameters

| Parameter | Type   | Required | Description        |
| --------- | ------ | -------- | ------------------ |
| id        | string | yes      | User's unique ID   |

### Query Parameters

| Parameter | Type    | Required | Default | Description               |
| --------- | ------- | -------- | ------- | ------------------------- |
| include   | string  | no       | null    | Related data (posts,profile)|

## Response

### Success Response (200 OK)

```json
{
  "id": "user_123",
  "email": "user@example.com",
  "name": "John Doe",
  "created_at": "2026-01-01T00:00:00Z"
}
````

### Error Responses

**404 Not Found**

```json
{
  "error": "User not found",
  "user_id": "user_invalid"
}
```

**401 Unauthorized**

```json
{
  "error": "Authentication required"
}
```

## Examples

### cURL

```bash
curl -X GET "https://api.example.com/users/user_123" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### JavaScript

```javascript
const response = await fetch('https://api.example.com/users/user_123', {
  headers: { Authorization: `Bearer ${token}` },
});
const user = await response.json();
```

## Rate Limits

- 100 requests per minute per API key

````

## Type 4: Explanation Documentation

### Purpose

Clarify concepts, design decisions, and architecture.

### Characteristics

- **Understanding-oriented:** Why and how things work
- **Conceptual:** Ideas, not steps
- **Background:** Context and alternatives
- **Discussion:** Trade-offs and decisions

### Explanation Template

```markdown
# {Concept or Decision Title}

## Overview

{High-level description of what this explains}

## Context

{Why does this exist? What problem does it solve?}

## How It Works

{Explanation of the mechanism or concept}

{Diagrams highly recommended}

## Design Decisions

### Decision 1: {Choice}

**Options Considered:**

- Option A: {Description}
- Option B: {Description}

**Chosen:** {Option}

**Rationale:** {Why}

**Trade-offs:**

- Pros: {Benefits}
- Cons: {Drawbacks}

## Alternatives

{What are other approaches? Why weren't they chosen?}

## Further Reading

- {Link to related explanation}
- {Link to reference docs}
````

### Explanation Example: JWT Authentication

```markdown
# JWT Authentication Architecture

## Overview

This system uses JSON Web Tokens (JWT) for stateless authentication, enabling horizontal scaling without shared session storage.

## Context

Traditional session-based authentication requires a shared session store (Redis, database), creating a bottleneck for distributed systems. JWT authentication eliminates this dependency by embedding user claims in signed tokens.

## How It Works

### Token Lifecycle
```

1. User logs in with credentials
   ↓
2. Server validates credentials
   ↓
3. Server generates JWT with claims (user ID, roles, expiry)
   ↓
4. Server signs JWT with secret key
   ↓
5. Server returns JWT to client
   ↓
6. Client stores JWT (localStorage, cookie)
   ↓
7. Client includes JWT in Authorization header
   ↓
8. Server verifies signature and claims
   ↓
9. Server grants access if valid

```

### Token Structure

```

Header.Payload.Signature

eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9. # Header (algorithm, type)
eyJzdWIiOiJ1c2VyXzEyMyIsImlhdCI6MTYxNjI0MjQwMH0. # Payload (claims)
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c # Signature (HMAC-SHA256)

```

## Design Decisions

### Decision 1: Stateless Tokens vs Session Store

**Options Considered:**

- **Stateless JWT:** Tokens contain all claims, no server-side storage
- **Session Store:** Tokens reference server-side session (Redis)

**Chosen:** Stateless JWT

**Rationale:**

- Horizontal scaling without coordination
- Lower latency (no Redis lookup)
- Simpler infrastructure

**Trade-offs:**

- Pros: Scalability, simplicity, performance
- Cons: Cannot revoke tokens (must wait for expiry), larger payload size

### Decision 2: Short Expiry + Refresh Tokens

**Options Considered:**

- Long-lived tokens (24 hours+)
- Short-lived tokens (1 hour) with refresh mechanism

**Chosen:** Short-lived access tokens (1 hour) + long-lived refresh tokens (30 days)

**Rationale:**

- Limits damage if access token stolen (expires quickly)
- Refresh token stored securely (httpOnly cookie)
- Can revoke refresh tokens server-side

**Trade-offs:**

- Pros: Better security, revocation possible
- Cons: Additional refresh endpoint, slight complexity

## Alternatives

### OAuth 2.0

**Why not chosen:** Overkill for single-application auth (OAuth designed for third-party delegation)

### Opaque Tokens + Session Store

**Why not chosen:** Requires shared session store (Redis), reducing scalability

## Further Reading

- [JWT Specification (RFC 7519)](https://datatracker.ietf.org/doc/html/rfc7519)
- [API Reference: /auth/token](link)
```

## Integration with Post-Creation Validation

After creating documentation, run post-creation validation workflow:

### Validation Checklist

- [ ] Correct Diataxis type chosen
- [ ] Template structure followed
- [ ] Code examples tested and working
- [ ] Links valid (no 404s)
- [ ] Grammar and spelling checked
- [ ] Provenance header added
- [ ] Output in correct workspace path

## Output Standards (Workspace Conventions)

### Documentation Paths

| Type            | Path                                          |
| --------------- | --------------------------------------------- |
| **Tutorials**   | `.claude/context/artifacts/docs/tutorials/`   |
| **How-tos**     | `.claude/context/artifacts/docs/how-to/`      |
| **Reference**   | `.claude/context/artifacts/docs/reference/`   |
| **Explanation** | `.claude/context/artifacts/docs/explanation/` |

### File Naming

- Lowercase kebab-case
- Descriptive names
- Date suffix for time-sensitive docs

**Examples:**

- `getting-started-with-api.md` (tutorial)
- `how-to-reset-password.md` (how-to)
- `api-endpoint-reference.md` (reference)
- `jwt-authentication-architecture.md` (explanation)

### Provenance Header

```markdown
<!-- Agent: technical-writer | Task: #{task-id} | Session: {YYYY-MM-DD} -->
```

## Success Criteria

### Per-Type Success

**Tutorial:**

- [ ] User can complete without prior knowledge
- [ ] All steps tested and work
- [ ] Learning outcomes clearly stated

**How-to:**

- [ ] Solves a specific problem
- [ ] Steps are actionable
- [ ] Troubleshooting section included

**Reference:**

- [ ] Complete information provided
- [ ] Easy to scan and search
- [ ] Examples for all major use cases

**Explanation:**

- [ ] Clarifies why/how something works
- [ ] Design decisions documented
- [ ] Alternatives discussed

### Overall Success

- [ ] Correct Diataxis type chosen
- [ ] Template followed
- [ ] Code examples tested
- [ ] Output in workspace-compliant path
- [ ] TaskUpdate(completed) with metadata

## Related Workflows

- **feature-development-workflow.md**: Enterprise workflow (this is PHASE_5_DOCUMENT)
- **post-creation-validation.md**: Validation after documentation creation

## Related Skills

- `verification-before-completion`: Pre-completion validation gates

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New documentation pattern → `.claude/context/memory/learnings.md`
- Common documentation issue → `.claude/context/memory/issues.md`
- Diataxis decision rationale → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
