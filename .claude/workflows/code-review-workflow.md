<!-- Agent: developer | Task: #44 | Session: 2026-02-06 -->

---

name: code-review-workflow
description: Two-pass code review process for systematic quality validation.
triggers:

- pull request created
- code review requested
- PHASE_3_REVIEW in enterprise workflow
  agents:
- code-reviewer

---

# Code Review Workflow

Two-pass code review process ensuring spec compliance, logic correctness, security, and code quality. Used by the code-reviewer agent during PHASE_3_REVIEW of enterprise workflows.

## Overview

Code review uses a two-pass approach:

1. **Pass 1 (Blocking):** Spec compliance, logic correctness, edge cases, security
2. **Pass 2 (Non-blocking):** Code quality, style, DRY, naming, documentation

Pass 1 findings block merge. Pass 2 findings generate recommendations.

## Pass 1: Correctness Review (Blocking)

### 1.1 Specification Compliance

**Check:**

- [ ] All acceptance criteria from implementation plan met
- [ ] API contracts match design spec
- [ ] Data models match schema definitions
- [ ] Performance requirements achieved
- [ ] Security requirements implemented

**Process:**

1. Read implementation plan: `.claude/context/plans/impl-{feature}-{YYYY-MM-DD}.md`
2. Read technical spec: `.claude/context/artifacts/specs/{feature}-spec.md`
3. Compare implementation against each requirement
4. Create checklist of missing requirements

**Output format:**

```markdown
### Specification Compliance

**Status:** ❌ BLOCKING ISSUES FOUND

**Missing Requirements:**

1. Acceptance Criterion #3: "User can reset password via email"
   - Location: No password reset endpoint found
   - Fix: Implement POST /api/auth/reset-password

2. Performance Requirement: "API response time < 200ms"
   - Current: 450ms average (measured via load test)
   - Fix: Add caching layer or optimize database queries
```

### 1.2 Logic Correctness

**Check:**

- [ ] Algorithm implementations correct
- [ ] Business logic matches requirements
- [ ] State transitions valid
- [ ] Calculations accurate
- [ ] Conditionals cover all paths

**Common Logic Errors:**

- Off-by-one errors in loops
- Incorrect comparison operators (>= vs >)
- Missing null/undefined checks
- Race conditions in async code
- Integer overflow/underflow

**Output format:**

```markdown
### Logic Correctness

**Status:** ❌ BLOCKING ISSUES FOUND

**Logic Errors:**

1. **Off-by-one error in pagination**
   - File: `src/api/users.ts:45`
   - Code: `for (let i = 0; i < items.length; i++)`
   - Issue: Should be `i <= items.length` to include last item
   - Fix: Adjust loop condition

2. **Race condition in async handler**
   - File: `src/handlers/payment.ts:78`
   - Code: `await updateBalance(); await logTransaction();`
   - Issue: Balance update can succeed while logging fails, causing inconsistency
   - Fix: Wrap in transaction or use saga pattern
```

### 1.3 Edge Case Handling

**Check:**

- [ ] Empty input handling (empty arrays, empty strings)
- [ ] Null/undefined handling
- [ ] Boundary values (min, max, zero, negative)
- [ ] Concurrency and race conditions
- [ ] Network failures and timeouts
- [ ] Database constraint violations

**Edge Case Categories:**

| Category        | Examples                                        |
| --------------- | ----------------------------------------------- |
| **Input**       | Empty, null, undefined, whitespace-only         |
| **Numeric**     | Zero, negative, MAX_INT, MIN_INT                |
| **Collections** | Empty array, single item, large dataset (10k+)  |
| **Async**       | Timeout, network failure, concurrent requests   |
| **Database**    | Constraint violation, deadlock, connection loss |

**Output format:**

```markdown
### Edge Case Handling

**Status:** ⚠️ WARNING - Non-critical gaps

**Missing Edge Cases:**

1. **Empty input not handled**
   - File: `src/utils/validator.ts:23`
   - Function: `validateEmail(email: string)`
   - Missing: Check for empty string before regex test
   - Impact: Throws error instead of returning false
   - Fix: Add `if (!email?.trim()) return false;`

2. **Concurrent request race condition**
   - File: `src/api/cart.ts:56`
   - Function: `addToCart(userId, itemId)`
   - Missing: Lock or optimistic concurrency control
   - Impact: Duplicate items added if user clicks twice quickly
   - Fix: Use database-level unique constraint or optimistic locking
```

### 1.4 Security Review

**Check (OWASP Top 10):**

- [ ] **A01: Broken Access Control** - Authorization on all endpoints
- [ ] **A02: Cryptographic Failures** - Strong algorithms, no plaintext secrets
- [ ] **A03: Injection** - Parameterized queries, input validation
- [ ] **A04: Insecure Design** - Secure patterns, threat modeling
- [ ] **A05: Security Misconfiguration** - Hardened defaults
- [ ] **A06: Vulnerable Components** - Dependencies updated
- [ ] **A07: Authentication Failures** - MFA, secure sessions
- [ ] **A08: Data Integrity** - Verify dependencies, protect CI/CD
- [ ] **A09: Logging Failures** - Security events logged
- [ ] **A10: SSRF** - URL validation, allowlists

**Integration with security-architect:**

For security-sensitive changes (auth, payment, PII), escalate to security-architect agent for deep security review.

**Output format:**

```markdown
### Security Review

**Status:** 🔴 CRITICAL ISSUES FOUND

**Security Findings:**

1. **A03: SQL Injection Vulnerability (CRITICAL)**
   - File: `src/db/queries.ts:34`
   - Code: `db.query('SELECT * FROM users WHERE id = ' + userId)` (BAD - example only)
   - Issue: User input concatenated directly into query
   - Fix: Use parameterized query: `db.query('SELECT * FROM users WHERE id = $1', [userId])`
   - CVSS Score: 9.8 (Critical)

2. **A02: Hardcoded Secret (HIGH)**
   - File: `src/config/api.ts:12`
   - Code: `const API_KEY = "YOUR_API_KEY_HERE";`
   - Issue: Secret committed to repository
   - Fix: Move to environment variable, rotate key
   - CVSS Score: 7.5 (High)
```

### Pass 1 Summary Template

```markdown
## Pass 1: Correctness Review

**Overall Status:** ❌ BLOCKING / ✅ APPROVED / ⚠️ WARNINGS ONLY

### Summary

- **Specification Compliance:** X issues found
- **Logic Correctness:** X issues found
- **Edge Case Handling:** X issues found
- **Security Review:** X issues found

**Total Blocking Issues:** X

### Blocking Issues (Must Fix Before Merge)

1. [Issue description with file/line, fix required]
2. ...

### Non-blocking Warnings (Recommend Fix)

1. [Issue description with file/line, optional fix]
2. ...

### Next Steps

- [ ] Developer fixes blocking issues
- [ ] Developer re-requests review
- [ ] Proceed to Pass 2 (Code Quality)
```

## Pass 2: Code Quality Review (Non-blocking)

Pass 2 only runs after Pass 1 is approved (0 blocking issues).

### 2.1 Code Quality and Structure

**Check:**

- [ ] Functions ≤ 50 lines
- [ ] Cyclomatic complexity ≤ 10
- [ ] Single Responsibility Principle (SRP) followed
- [ ] No nested callbacks (max depth 2)
- [ ] Clear separation of concerns

**Invoke code-analyzer skill:**

```javascript
Skill({ skill: 'code-analyzer' });
```

**Output format:**

```markdown
### Code Quality

**Status:** ⚠️ RECOMMENDATIONS

**Quality Findings:**

1. **Function too long**
   - File: `src/api/users.ts:handleCreateUser()`
   - Current: 78 lines
   - Recommendation: Extract validation, database logic, response formatting into separate functions
   - Target: ≤50 lines per function

2. **High cyclomatic complexity**
   - File: `src/utils/validator.ts:validateInput()`
   - Current: Complexity 15
   - Recommendation: Use strategy pattern or early returns to reduce branching
   - Target: ≤10 complexity
```

### 2.2 Style Consistency

**Check:**

- [ ] Naming conventions followed (camelCase, PascalCase, snake_case per language)
- [ ] Indentation consistent (2 or 4 spaces)
- [ ] Import organization (external, internal, relative)
- [ ] Linter passes with zero warnings

**Language-Specific Style:**

See domain-development-workflow.md Language Conventions Table for style guides per language.

**Output format:**

```markdown
### Style Consistency

**Status:** ⚠️ LINTER WARNINGS

**Style Findings:**

1. **Inconsistent naming**
   - File: `src/types/User.ts`
   - Issue: Variable `UserData` should be `userData` (camelCase for variables)
   - Fix: Rename to follow convention

2. **Linter warnings**
   - Run: `pnpm lint`
   - Output: 3 warnings (unused imports, missing semicolons)
   - Fix: Run `pnpm lint --fix` or manually address
```

### 2.3 DRY (Don't Repeat Yourself)

**Check:**

- [ ] No duplicated code blocks (>5 lines)
- [ ] Common logic extracted to helpers
- [ ] Repeated patterns abstracted
- [ ] Magic numbers replaced with constants

**Invoke code-analyzer skill:**

```javascript
Skill({ skill: 'code-analyzer' });
```

**Output format:**

```markdown
### DRY Violations

**Status:** ⚠️ RECOMMENDATIONS

**Duplication Findings:**

1. **Duplicated validation logic**
   - Files: `src/api/users.ts:45` and `src/api/posts.ts:67`
   - Code: Email validation regex repeated
   - Fix: Extract to `src/utils/validators.ts:validateEmail()`

2. **Magic numbers**
   - File: `src/config/rate-limit.ts:23`
   - Code: `if (attempts > 5)` and `if (attempts > 5)` in 3 places
   - Fix: Define `const MAX_LOGIN_ATTEMPTS = 5`
```

### 2.4 Naming and Readability

**Check:**

- [ ] Variable names describe purpose (not just type)
- [ ] Function names are verbs (actions)
- [ ] Boolean variables prefixed with is/has/can
- [ ] Class names are nouns
- [ ] Avoid abbreviations unless universally understood

**Good vs Bad Naming:**

| Bad         | Good                    |
| ----------- | ----------------------- |
| `data`      | `userProfile`           |
| `temp`      | `processedItems`        |
| `flag`      | `isAuthenticated`       |
| `doStuff()` | `validateAndSaveUser()` |
| `Manager`   | `UserAccountManager`    |

**Output format:**

```markdown
### Naming and Readability

**Status:** ⚠️ RECOMMENDATIONS

**Naming Findings:**

1. **Unclear variable name**
   - File: `src/api/auth.ts:34`
   - Code: `const data = await fetchUser();`
   - Issue: "data" is too generic
   - Fix: Rename to `userAccount` or `authenticatedUser`

2. **Function name doesn't describe action**
   - File: `src/handlers/payment.ts:56`
   - Code: `function handle(req, res)`
   - Fix: Rename to `processPaymentRequest(req, res)`
```

### 2.5 Documentation

**Check:**

- [ ] Public APIs have docstrings/JSDoc
- [ ] Complex logic has explanatory comments
- [ ] README updated if public interface changed
- [ ] API endpoints documented (OpenAPI/Swagger)
- [ ] Breaking changes noted in CHANGELOG

**Documentation Levels:**

| Level          | Required Documentation                     |
| -------------- | ------------------------------------------ |
| **Public API** | Full docstring (params, returns, examples) |
| **Internal**   | Brief comment explaining purpose           |
| **Complex**    | Comment explaining "why" (not "what")      |
| **Breaking**   | CHANGELOG entry with migration guide       |

**Output format:**

```markdown
### Documentation

**Status:** ⚠️ RECOMMENDATIONS

**Documentation Findings:**

1. **Missing docstring on public function**
   - File: `src/api/users.ts:createUser()`
   - Fix: Add JSDoc with param types, return type, example

2. **Complex logic undocumented**
   - File: `src/utils/crypto.ts:hashPassword()`
   - Code: Complex bcrypt salting logic
   - Fix: Add comment explaining bcrypt rounds and security trade-offs
```

### Pass 2 Summary Template

```markdown
## Pass 2: Code Quality Review

**Overall Status:** ✅ APPROVED WITH RECOMMENDATIONS / ⚠️ MINOR IMPROVEMENTS NEEDED

### Summary

- **Code Quality:** X findings
- **Style Consistency:** X findings
- **DRY Violations:** X findings
- **Naming:** X findings
- **Documentation:** X findings

**Total Recommendations:** X (all non-blocking)

### Recommendations (Optional Improvements)

1. [Recommendation with file/line]
2. ...

### Approval

✅ **Code review APPROVED**

This PR is approved for merge. The recommendations above are optional improvements that can be addressed now or in a future PR.

**Reviewer:** code-reviewer
**Date:** {YYYY-MM-DD}
```

## Integration with Architecture Review

### When to Escalate to Architect

Escalate to architect agent for review if any of these apply:

- **New abstractions:** New design patterns, frameworks, libraries
- **Database schema changes:** Table creation, column addition, index changes
- **API contract changes:** New endpoints, breaking changes
- **Cross-cutting concerns:** Authentication, logging, caching changes
- **Architectural decisions:** Microservices, event-driven, CQRS patterns

**Escalation process:**

1. Code-reviewer identifies architectural concern
2. Create new task for architect review
3. Architect reviews design, provides recommendations
4. Developer implements architect recommendations
5. Code-reviewer re-reviews implementation

**Output format:**

```markdown
### Architecture Review Required

**Issue:** New authentication system introduces OAuth 2.0

**Recommendation:** Escalate to `architect` agent for design review

**Rationale:** OAuth 2.0 is a cross-cutting concern affecting:

- API endpoints (new /oauth routes)
- Database schema (tokens table)
- Security model (scopes, grants)
- Client SDKs (auth flow changes)

**Next Steps:**

1. Create task for architect review
2. Architect reviews OAuth 2.0 design
3. Developer updates implementation
4. Code-reviewer re-reviews
```

## Output Format for Review Findings

### Severity Levels

| Severity | Description                            | Action Required |
| -------- | -------------------------------------- | --------------- |
| CRITICAL | Security vulnerability, data loss risk | BLOCK merge     |
| HIGH     | Logic error, missing requirement       | BLOCK merge     |
| MEDIUM   | Edge case missing, code quality issue  | Recommend fix   |
| LOW      | Style inconsistency, minor improvement | Optional        |

### Finding Template

````markdown
### {Category} ({Severity})

**File:** {path/to/file.ts:line}

**Issue:** {Description of what's wrong}

**Impact:** {What happens if not fixed}

**Fix:** {Specific recommendation}

**Example (if applicable):**

```{language}
// BEFORE
{current code}

// AFTER
{recommended code}
```
````

```

## Success Criteria

### Pass 1 Success (Required for Pass 2)

- [ ] All specification requirements met
- [ ] No logic errors found
- [ ] Critical edge cases handled
- [ ] Zero security vulnerabilities (CRITICAL/HIGH)
- [ ] Zero blocking issues

### Pass 2 Success (Required for Approval)

- [ ] Code quality meets standards (complexity ≤10, functions ≤50 lines)
- [ ] Style consistent with project conventions
- [ ] No significant code duplication
- [ ] Clear naming throughout
- [ ] Public APIs documented

### Overall Success

- [ ] Pass 1 approved (0 blocking issues)
- [ ] Pass 2 completed (recommendations provided)
- [ ] Review findings report generated
- [ ] TaskUpdate(completed) with metadata

## Related Workflows

- **domain-development-workflow.md**: Development workflow that produces code for review
- **feature-development-workflow.md**: Enterprise workflow (this is PHASE_3_REVIEW)
- **architecture-review.md**: Escalation workflow for architectural concerns

## Related Skills

- `code-analyzer`: Static analysis and metrics
- `security-architect`: Deep security analysis
- `checklist-generator`: Quality checklist generation
- `verification-before-completion`: Pre-completion gates

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New review pattern → `.claude/context/memory/learnings.md`
- Common bug found → `.claude/context/memory/issues.md`
- Review decision rationale → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
```
