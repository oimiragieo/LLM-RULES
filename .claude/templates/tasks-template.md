---
# [REQUIRED] Feature or Epic name - high-level feature description
feature: '{{FEATURE_NAME}}'

# [REQUIRED] Version of the feature being implemented
version: '{{VERSION}}'

# [REQUIRED] Author or team responsible for this feature
author: '{{AUTHOR}}'

# [REQUIRED] Date when tasks were created (YYYY-MM-DD format)
date: '{{DATE}}'

# [OPTIONAL] Current status of the feature. Default: draft
# Options: draft, in_progress, complete, on_hold
status: '{{STATUS:draft}}'

# [OPTIONAL] Priority level for the feature. Default: medium
# Options: low, medium, high, critical
priority: '{{PRIORITY:medium}}'

# [OPTIONAL] Estimated effort for entire feature (human-readable)
# Format: "N hours|days|weeks|months"
# Example: "2 weeks", "40 hours", "3 months"
estimated_effort: '{{ESTIMATED_EFFORT}}'

# [OPTIONAL] Related specifications or documentation
# Example: ["spec-authentication.md", "api-design-doc.md"]
related_specs: '{{RELATED_SPECS}}'

# [OPTIONAL] External or internal dependencies
# Example: ["OAuth2 provider setup", "Database migration completed"]
dependencies: '{{DEPENDENCIES}}'
---

# {{FEATURE_DISPLAY_NAME}} - Task Breakdown

**Status**: {{STATUS:draft}}
**Priority**: {{PRIORITY:medium}}
**Version**: {{VERSION}}
**Author**: {{AUTHOR}}
**Date**: {{DATE}}

---

## POST-CREATION CHECKLIST (BLOCKING - DO NOT SKIP)

After creating this task breakdown:

- [ ] All `{{PLACEHOLDER}}` values replaced with concrete values
- [ ] All enabler tasks identified and marked with `[ENABLER]`
- [ ] User stories prioritized (P1 = MVP, P2 = Nice-to-Have, P3 = Polish)
- [ ] Task dependencies documented (blockedBy references)
- [ ] Acceptance criteria defined for each user story
- [ ] Task IDs assigned for tracking
- [ ] Added to project tracking system (TaskCreate calls)

**Verification:**

```bash
# Check no unresolved placeholders remain
grep "{{" tasks-{{FEATURE_NAME}}.md && echo "ERROR: Unresolved placeholders!"

# Verify all P1 stories have acceptance criteria
grep -A 5 "## User Story.*\[P1\]" tasks-{{FEATURE_NAME}}.md | grep "Acceptance Criteria" || echo "WARNING: P1 missing acceptance criteria"
```

---

**Input**: Design documents from feature directory (e.g. `.claude/context/plans/` or `specs/[feature]/`).
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/ (if applicable).

## Execution Flow (main)

1. Load plan.md from feature directory
   → If not found: ERROR "No implementation plan found"
   → Extract: tech stack, libraries, structure
2. Load optional design documents:
   → data-model.md: Extract entities → model tasks
   → contracts/: Each file → contract test task
   → research.md: Extract decisions → setup tasks
3. Generate tasks by category:
   → Setup: project init, dependencies, linting
   → Tests: contract tests, integration tests
   → Core: models, services, CLI commands
   → Integration: DB, middleware, logging
   → Polish: unit tests, performance, docs
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph
7. Create parallel execution examples where applicable
8. Validate task completeness:
   → All contracts have tests?
   → All entities have model tasks?
   → All endpoints implemented?
9. Return: SUCCESS (tasks ready for execution)

## Overview

**Feature Description**: {{FEATURE_DESCRIPTION}}

**Business Value**: {{BUSINESS_VALUE}}

**User Impact**: {{USER_IMPACT}}

---

## Epic Level

**Epic Name**: {{EPIC_NAME}}

**Epic Goal**: {{EPIC_GOAL}}

**Success Criteria**:
{{SUCCESS_CRITERIA}}

<!-- Example:
- [ ] Users can authenticate via OAuth2 and email/password
- [ ] Authentication response time < 200ms (p95)
- [ ] Zero security vulnerabilities in authentication flow
- [ ] 100% test coverage for authentication logic
-->

---

## Foundational Phase (Enablers)

> **CRITICAL**: Enabler tasks provide shared infrastructure and MUST complete before user stories begin.
> These tasks are not directly visible to end users but enable all user-facing features.

### Enabler 1: {{ENABLER_1_NAME}}

**Purpose**: {{ENABLER_1_PURPOSE}}
**Blocks**: All user stories (foundational)
**Estimated**: {{ENABLER_1_EFFORT}}

#### Tasks

1. **[ENABLER-1.1]** {{TASK_DESCRIPTION}}
   - **Description**: {{DETAILED_DESCRIPTION}}
   - **Estimated**: {{TASK_EFFORT}}
   - **Dependencies**: None
   - **Output**: {{OUTPUT_ARTIFACTS}}

2. **[ENABLER-1.2]** {{TASK_DESCRIPTION}}
   - **Description**: {{DETAILED_DESCRIPTION}}
   - **Estimated**: {{TASK_EFFORT}}
   - **Dependencies**: ENABLER-1.1
   - **Output**: {{OUTPUT_ARTIFACTS}}

<!-- Example:
### Enabler 1: Authentication Infrastructure

**Purpose**: Set up shared authentication middleware and database schema
**Blocks**: All user stories (foundational)
**Estimated**: 2 days

#### Tasks

1. **[ENABLER-1.1]** Create user database schema
   - **Description**: Design and implement users table with email, password_hash, created_at, last_login
   - **Estimated**: 4 hours
   - **Dependencies**: None
   - **Output**: migration file, schema documentation

2. **[ENABLER-1.2]** Implement JWT token service
   - **Description**: Create token generation, validation, and refresh logic
   - **Estimated**: 6 hours
   - **Dependencies**: ENABLER-1.1
   - **Output**: token-service.ts, tests
-->

### Enabler 2: {{ENABLER_2_NAME}}

**Purpose**: {{ENABLER_2_PURPOSE}}
**Blocks**: {{BLOCKED_STORIES}}
**Estimated**: {{ENABLER_2_EFFORT}}

#### Tasks

1. **[ENABLER-2.1]** {{TASK_DESCRIPTION}}
   - **Description**: {{DETAILED_DESCRIPTION}}
   - **Estimated**: {{TASK_EFFORT}}
   - **Dependencies**: {{DEPENDENCY_IDS}}
   - **Output**: {{OUTPUT_ARTIFACTS}}

---

## User Story Breakdown

> **Organization**: Stories are organized by priority (P1 = MVP, P2 = Nice-to-Have, P3 = Polish)
> Each story should be independently testable and deliverable.

---

### Priority 1 (MVP) - Must Have 🎯

These stories are CRITICAL for the minimum viable product. Must complete before P2/P3.

---

#### User Story 1.1: {{STORY_NAME}} [P1]

**As a** {{USER_ROLE}},
**I want** {{CAPABILITY}},
**So that** {{BUSINESS_VALUE}}.

**Acceptance Criteria**:

- [ ] {{CRITERION_1}}
- [ ] {{CRITERION_2}}
- [ ] {{CRITERION_3}}

**Estimated Effort**: {{STORY_EFFORT}}
**Dependencies**: {{ENABLER_IDS}}

##### Tasks

1. **[P1-1.1.1]** {{TASK_DESCRIPTION}}
   - **Description**: {{DETAILED_DESCRIPTION}}
   - **Estimated**: {{TASK_EFFORT}}
   - **Dependencies**: {{DEPENDENCY_IDS}}
   - **Output**: {{OUTPUT_ARTIFACTS}}
   - **Verification**: {{VERIFICATION_COMMANDS}}

2. **[P1-1.1.2]** {{TASK_DESCRIPTION}}
   - **Description**: {{DETAILED_DESCRIPTION}}
   - **Estimated**: {{TASK_EFFORT}}
   - **Dependencies**: P1-1.1.1
   - **Output**: {{OUTPUT_ARTIFACTS}}
   - **Verification**: {{VERIFICATION_COMMANDS}}

<!-- Example:
#### User Story 1.1: User Login with Email/Password [P1]

**As a** registered user,
**I want** to log in with my email and password,
**So that** I can access my account securely.

**Acceptance Criteria**:
- [ ] User can submit email and password via login form
- [ ] Valid credentials return JWT token and redirect to dashboard
- [ ] Invalid credentials show error message "Invalid email or password"
- [ ] Failed login attempts are logged for security audit
- [ ] Login response time < 200ms (p95)

**Estimated Effort**: 1 day
**Dependencies**: ENABLER-1.1, ENABLER-1.2

##### Tasks

1. **[P1-1.1.1]** Create login API endpoint
   - **Description**: POST /api/auth/login endpoint that validates credentials and returns JWT
   - **Estimated**: 3 hours
   - **Dependencies**: ENABLER-1.1, ENABLER-1.2
   - **Output**: src/routes/auth.ts, tests
   - **Verification**: curl -X POST http://localhost:3000/api/auth/login -d '{"email":"test@example.com","password":"test123"}'

2. **[P1-1.1.2]** Build login form UI
   - **Description**: React form component with email/password fields and validation
   - **Estimated**: 2 hours
   - **Dependencies**: P1-1.1.1
   - **Output**: LoginForm.tsx, LoginForm.test.tsx
   - **Verification**: npm test -- LoginForm
-->

---

#### User Story 1.2: {{STORY_NAME}} [P1]

**As a** {{USER_ROLE}},
**I want** {{CAPABILITY}},
**So that** {{BUSINESS_VALUE}}.

**Acceptance Criteria**:

- [ ] {{CRITERION_1}}
- [ ] {{CRITERION_2}}

**Estimated Effort**: {{STORY_EFFORT}}
**Dependencies**: {{DEPENDENCY_IDS}}

##### Tasks

1. **[P1-1.2.1]** {{TASK_DESCRIPTION}}
   - **Description**: {{DETAILED_DESCRIPTION}}
   - **Estimated**: {{TASK_EFFORT}}
   - **Dependencies**: {{DEPENDENCY_IDS}}
   - **Output**: {{OUTPUT_ARTIFACTS}}

---

### Priority 2 (Nice-to-Have) - Should Have

These stories add significant value but are not blocking MVP release.

---

#### User Story 2.1: {{STORY_NAME}} [P2]

**As a** {{USER_ROLE}},
**I want** {{CAPABILITY}},
**So that** {{BUSINESS_VALUE}}.

**Acceptance Criteria**:

- [ ] {{CRITERION_1}}
- [ ] {{CRITERION_2}}

**Estimated Effort**: {{STORY_EFFORT}}
**Dependencies**: {{P1_STORY_IDS}}

##### Tasks

1. **[P2-2.1.1]** {{TASK_DESCRIPTION}}
   - **Description**: {{DETAILED_DESCRIPTION}}
   - **Estimated**: {{TASK_EFFORT}}
   - **Dependencies**: {{DEPENDENCY_IDS}}
   - **Output**: {{OUTPUT_ARTIFACTS}}

<!-- Example:
#### User Story 2.1: Password Reset via Email [P2]

**As a** user who forgot their password,
**I want** to receive a password reset link via email,
**So that** I can regain access to my account.

**Acceptance Criteria**:
- [ ] User can request password reset via email address
- [ ] Reset link expires after 1 hour
- [ ] Reset link is single-use only
- [ ] Email delivery confirmed to user

**Estimated Effort**: 6 hours
**Dependencies**: P1-1.1.1 (auth infrastructure must exist)

##### Tasks

1. **[P2-2.1.1]** Implement password reset token generation
   - **Description**: Generate secure reset tokens with 1-hour expiry
   - **Estimated**: 2 hours
   - **Dependencies**: ENABLER-1.2
   - **Output**: reset-token-service.ts, tests
-->

---

### Priority 3 (Polish) - Could Have

These stories refine the user experience and add polish but are not essential.

---

#### User Story 3.1: {{STORY_NAME}} [P3]

**As a** {{USER_ROLE}},
**I want** {{CAPABILITY}},
**So that** {{BUSINESS_VALUE}}.

**Acceptance Criteria**:

- [ ] {{CRITERION_1}}

**Estimated Effort**: {{STORY_EFFORT}}
**Dependencies**: {{P1_OR_P2_STORY_IDS}}

##### Tasks

1. **[P3-3.1.1]** {{TASK_DESCRIPTION}}
   - **Description**: {{DETAILED_DESCRIPTION}}
   - **Estimated**: {{TASK_EFFORT}}
   - **Dependencies**: {{DEPENDENCY_IDS}}
   - **Output**: {{OUTPUT_ARTIFACTS}}

<!-- Example:
#### User Story 3.1: Remember Me Checkbox [P3]

**As a** frequent user,
**I want** a "Remember Me" option on login,
**So that** I don't have to re-enter credentials frequently.

**Acceptance Criteria**:
- [ ] Checkbox visible on login form
- [ ] Selecting checkbox extends token expiry to 30 days
- [ ] User remains logged in across browser sessions

**Estimated Effort**: 2 hours
**Dependencies**: P1-1.1.1, P1-1.1.2

##### Tasks

1. **[P3-3.1.1]** Add remember-me functionality to token service
   - **Description**: Support optional extended token expiry (30 days vs 1 hour)
   - **Estimated**: 1 hour
   - **Dependencies**: ENABLER-1.2
   - **Output**: Updated token-service.ts
-->

---

## Task Summary

### By Priority

| Priority          | User Stories          | Tasks                  | Estimated Effort     |
| ----------------- | --------------------- | ---------------------- | -------------------- |
| Enablers          | {{ENABLER_COUNT}}     | {{ENABLER_TASK_COUNT}} | {{ENABLER_EFFORT}}   |
| P1 (MVP)          | {{P1_STORY_COUNT}}    | {{P1_TASK_COUNT}}      | {{P1_EFFORT}}        |
| P2 (Nice-to-Have) | {{P2_STORY_COUNT}}    | {{P2_TASK_COUNT}}      | {{P2_EFFORT}}        |
| P3 (Polish)       | {{P3_STORY_COUNT}}    | {{P3_TASK_COUNT}}      | {{P3_EFFORT}}        |
| **TOTAL**         | **{{TOTAL_STORIES}}** | **{{TOTAL_TASKS}}**    | **{{TOTAL_EFFORT}}** |

### Dependency Graph

```
[Enablers] → [P1 Stories] → [P2 Stories] → [P3 Stories]
    ↓            ↓              ↓              ↓
  Tasks       Tasks          Tasks          Tasks
```

---

## Implementation Sequence

**Recommended order** (respects dependencies and priority):

1. **Phase 0: Foundational** - Complete all enabler tasks
2. **Phase 1: MVP (P1)** - Implement P1 stories in order
3. **Phase 2: Enhancement (P2)** - Add P2 features
4. **Phase 3: Polish (P3)** - Refine with P3 improvements

### Critical Path

The following tasks are on the critical path (longest dependency chain):

1. {{CRITICAL_TASK_1}}
2. {{CRITICAL_TASK_2}}
3. {{CRITICAL_TASK_3}}

---

## Quality Checklist

After completing each user story, verify:

- [ ] All acceptance criteria met
- [ ] Unit tests written and passing (>80% coverage)
- [ ] Integration tests for user story scenarios
- [ ] Code reviewed by at least one other developer
- [ ] Documentation updated (API docs, README)
- [ ] No security vulnerabilities (run security scan)
- [ ] Performance requirements met (load testing if applicable)
- [ ] Accessibility requirements met (WCAG 2.1 AA if UI)

---

## Risk Assessment

| Risk       | Likelihood     | Impact     | Mitigation     | Owner     |
| ---------- | -------------- | ---------- | -------------- | --------- |
| {{RISK_1}} | {{LIKELIHOOD}} | {{IMPACT}} | {{MITIGATION}} | {{OWNER}} |
| {{RISK_2}} | {{LIKELIHOOD}} | {{IMPACT}} | {{MITIGATION}} | {{OWNER}} |

<!-- Example:
| Risk | Likelihood | Impact | Mitigation | Owner |
|------|-----------|--------|------------|-------|
| OAuth2 provider downtime during launch | LOW | HIGH | Implement email/password fallback | Backend Team |
| Token expiry issues causing user logout | MEDIUM | MEDIUM | Implement token refresh logic | Security Team |
-->

---

## Token Replacement Guide

This template supports token replacement for easy instantiation. Replace these tokens:

| Token                       | Description                             | Example                                              |
| --------------------------- | --------------------------------------- | ---------------------------------------------------- |
| `{{FEATURE_NAME}}`          | Feature or epic name (lowercase-hyphen) | `user-authentication`                                |
| `{{VERSION}}`               | Semantic version                        | `1.0.0`                                              |
| `{{AUTHOR}}`                | Author or team                          | `Engineering Team`                                   |
| `{{DATE}}`                  | Creation date (YYYY-MM-DD)              | `2026-01-28`                                         |
| `{{FEATURE_DISPLAY_NAME}}`  | Human-readable feature name             | `User Authentication`                                |
| `{{FEATURE_DESCRIPTION}}`   | Brief feature overview                  | `Secure authentication system with JWT tokens`       |
| `{{BUSINESS_VALUE}}`        | Why this feature matters                | `Enables user account management and security`       |
| `{{USER_IMPACT}}`           | How users benefit                       | `Users can securely access personalized features`    |
| `{{EPIC_NAME}}`             | High-level epic name                    | `Authentication & Authorization`                     |
| `{{EPIC_GOAL}}`             | Epic objective                          | `Enable secure user access to the platform`          |
| `{{SUCCESS_CRITERIA}}`      | Epic-level success criteria             | `All P1 stories complete, zero auth vulnerabilities` |
| `{{ENABLER_X_NAME}}`        | Enabler task name                       | `Authentication Infrastructure`                      |
| `{{ENABLER_X_PURPOSE}}`     | Why enabler is needed                   | `Provides shared auth middleware for all features`   |
| `{{ENABLER_X_EFFORT}}`      | Estimated effort                        | `2 days`                                             |
| `{{STORY_NAME}}`            | User story name                         | `User Login with Email/Password`                     |
| `{{USER_ROLE}}`             | User persona                            | `registered user`, `admin`, `visitor`                |
| `{{CAPABILITY}}`            | What user wants to do                   | `log in with my email and password`                  |
| `{{BUSINESS_VALUE}}`        | Why user wants it                       | `I can access my account securely`                   |
| `{{CRITERION_X}}`           | Acceptance criterion                    | `Login response time < 200ms`                        |
| `{{STORY_EFFORT}}`          | Story effort estimate                   | `1 day`, `6 hours`                                   |
| `{{TASK_DESCRIPTION}}`      | Brief task title                        | `Create login API endpoint`                          |
| `{{DETAILED_DESCRIPTION}}`  | Full task description                   | `POST /api/auth/login that validates credentials`    |
| `{{TASK_EFFORT}}`           | Individual task effort                  | `3 hours`, `1 day`                                   |
| `{{DEPENDENCY_IDS}}`        | Task dependencies                       | `ENABLER-1.1, P1-1.1.1`                              |
| `{{OUTPUT_ARTIFACTS}}`      | Expected deliverables                   | `src/routes/auth.ts, tests`                          |
| `{{VERIFICATION_COMMANDS}}` | How to verify task complete             | `npm test -- auth.test.ts`                           |

---

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing each phase:**

- New pattern discovered → `.claude/context/memory/learnings.md`
- Issue encountered → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

**After completing feature:**

- Update learnings.md with implementation summary
- Document any architectural decisions in decisions.md
- Record any unresolved issues in issues.md

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.

---

## Notes

### SAFe / Azure DevOps Alignment

This template aligns with industry standards:

- **Epic → Story → Task** hierarchy (Jira, Azure DevOps, SAFe)
- **Enabler Stories** for shared infrastructure (SAFe pattern)
- **P1/P2/P3 prioritization** (MoSCoW method: Must/Should/Could have)
- **Acceptance criteria** for each story (Agile best practice)
- **Dependency tracking** (Critical Path Method)

### Task ID Conventions

- **Enabler tasks**: `ENABLER-X.Y` (e.g., `ENABLER-1.1`)
- **P1 tasks**: `P1-X.Y.Z` (e.g., `P1-1.1.1`)
- **P2 tasks**: `P2-X.Y.Z` (e.g., `P2-2.1.1`)
- **P3 tasks**: `P3-X.Y.Z` (e.g., `P3-3.1.1`)

Where:

- `X` = Story number within priority
- `Y` = Substory (if nested)
- `Z` = Task number within story

### Integration with Agent-Studio

To create TaskCreate calls from this template:

```javascript
// Enabler tasks
TaskCreate({
  subject: 'ENABLER-1.1: Create user database schema',
  description: 'Design and implement users table...',
  activeForm: 'Creating user database schema',
  metadata: { priority: 'enabler', blocksAll: true },
});

// P1 story tasks
TaskCreate({
  subject: 'P1-1.1.1: Create login API endpoint',
  description: 'POST /api/auth/login endpoint...',
  activeForm: 'Creating login API endpoint',
  metadata: { priority: 'p1', story: '1.1' },
});
```

---

**Template Version**: 1.0.0
**Last Updated**: 2026-01-28
**Maintained By**: template-creator skill
