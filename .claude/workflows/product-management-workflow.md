<!-- Agent: developer | Task: #44 | Session: 2026-02-06 -->

---
name: product-management-workflow
description: Sprint and backlog management using INVEST criteria and stakeholder communication.
triggers:
  - sprint planning
  - backlog refinement
  - roadmap prioritization
agents:
  - general-purpose (with PM context)
---

# Product Management Workflow

Sprint planning, backlog refinement, and prioritization using INVEST criteria for user stories. Supports PM agent for stakeholder communication and metrics tracking.

## Overview

This workflow provides a structured approach to product management activities:

1. **Sprint Planning:** Select and size user stories for upcoming sprint
2. **Backlog Refinement:** Groom backlog using INVEST criteria
3. **Prioritization:** Rank features by value, effort, and risk
4. **Stakeholder Communication:** Regular updates to stakeholders
5. **Metrics Tracking:** Velocity, burndown, cycle time

## INVEST Criteria for User Stories

### INVEST Checklist

Every user story MUST satisfy INVEST criteria:

| Criterion        | Description                                      | How to Verify |
| ---------------- | ------------------------------------------------ | ------------- |
| **Independent**  | Can be implemented without dependencies          | Check for no blocking dependencies in backlog |
| **Negotiable**   | Details are negotiable with stakeholders         | Story describes outcome, not implementation |
| **Valuable**     | Delivers value to user or business               | Clear "so that" clause with user benefit |
| **Estimable**    | Team can estimate size                           | Story has enough detail for sizing |
| **Small**        | Fits in one sprint (≤1 week)                     | Story completable in 1-5 days |
| **Testable**     | Has clear acceptance criteria                    | Acceptance criteria are verifiable |

### User Story Template

```markdown
**As a** [user role]
**I want** [feature/capability]
**So that** [business value/user benefit]

**Acceptance Criteria:**

1. [Specific, testable criterion]
2. [Specific, testable criterion]
3. [Specific, testable criterion]

**Definition of Done:**

- [ ] Code implemented
- [ ] Unit tests pass (≥80% coverage)
- [ ] Integration tests pass
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] Deployed to staging
- [ ] Accepted by Product Owner
```

### INVEST Validation Examples

#### Good Story (Passes INVEST)

```markdown
**As a** logged-in user
**I want** to reset my password via email
**So that** I can regain access if I forget my password

**Acceptance Criteria:**

1. User receives reset email within 30 seconds
2. Reset link expires after 1 hour
3. User can set new password meeting security requirements
4. Old password is invalidated after reset

**Estimate:** 3 story points (2 days)
```

**INVEST Check:**

- ✅ **Independent:** No dependencies on other stories
- ✅ **Negotiable:** Implementation details (email service, token storage) not specified
- ✅ **Valuable:** Clear user benefit (regain access)
- ✅ **Estimable:** Team can estimate (3 points)
- ✅ **Small:** Fits in 2 days (< 1 sprint)
- ✅ **Testable:** Clear acceptance criteria

#### Bad Story (Fails INVEST)

```markdown
**As a** developer
**I want** to refactor the authentication system
**So that** the code is cleaner

**Estimate:** Unknown
```

**INVEST Check:**

- ❌ **Independent:** May have dependencies on database schema
- ❌ **Negotiable:** Specifies implementation (refactor)
- ❌ **Valuable:** No clear user/business value (developer task, not user story)
- ❌ **Estimable:** "Unknown" estimate
- ❌ **Small:** Unclear scope (could be weeks)
- ❌ **Testable:** No acceptance criteria

**How to Fix:**

```markdown
**As a** user
**I want** authentication to complete in under 1 second
**So that** I can access the app quickly

**Acceptance Criteria:**

1. Login completes in <1s (p95)
2. Token validation in <100ms
3. Session creation in <200ms

**Technical Approach (Optional):**
Refactor authentication to use caching

**Estimate:** 5 story points
```

## Sprint Planning

### Phase 1: Capacity Planning

1. **Calculate team capacity:**
   - Total person-days available
   - Subtract holidays, meetings, support rotation
   - Apply focus factor (typically 70-80%)

**Formula:**

```
Sprint Capacity = (Team Size × Sprint Days × Focus Factor)
```

**Example:**

```
Team Size: 5 developers
Sprint Days: 10 days (2 weeks)
Focus Factor: 0.75 (75% - accounts for meetings, support)
Capacity = 5 × 10 × 0.75 = 37.5 person-days
```

### Phase 2: Story Selection

1. **Read product backlog:**
   - `.claude/context/artifacts/product/backlog.md`

2. **Select top-priority stories:**
   - Stories at top of backlog (prioritized by value)
   - Verify INVEST criteria met
   - Total story points ≤ team velocity

3. **Create sprint backlog:**
   - `.claude/context/artifacts/product/sprint-{number}-{YYYY-MM-DD}.md`

**Sprint Backlog Template:**

```markdown
# Sprint {Number} - {Start Date} to {End Date}

**Sprint Goal:** [One sentence summary of sprint objective]

**Team Capacity:** {person-days}
**Planned Velocity:** {story points}

## Selected Stories

### Story 1: [Title] ({story points} points)

**As a** [role]
**I want** [feature]
**So that** [value]

**Acceptance Criteria:**

1. [Criterion]
2. [Criterion]

**Assigned To:** [Developer]

### Story 2: [Title] ({story points} points)

...

## Sprint Risks

- [Risk description and mitigation]

## Dependencies

- [External dependency and owner]
```

### Phase 3: Sprint Commitment

1. **Team reviews sprint backlog**
2. **Team commits to sprint goal**
3. **Sprint backlog locked**

## Backlog Refinement

### Weekly Refinement Session

**Frequency:** Weekly (1 hour)

**Goals:**

1. Review upcoming stories (next 2-3 sprints)
2. Ensure stories meet INVEST criteria
3. Estimate story size
4. Identify dependencies

### Estimation Techniques

#### Planning Poker (Recommended)

1. Each team member estimates independently
2. Reveal estimates simultaneously
3. Discuss outliers
4. Re-estimate until consensus

**Fibonacci Scale:**

| Story Points | Complexity  | Time Estimate |
| ------------ | ----------- | ------------- |
| 1            | Trivial     | <4 hours      |
| 2            | Simple      | 4-8 hours     |
| 3            | Medium      | 1-2 days      |
| 5            | Complex     | 2-3 days      |
| 8            | Very Complex| 3-5 days      |
| 13           | Epic        | >1 week (split)|

#### T-Shirt Sizing (Quick Estimates)

| Size | Story Points | Use Case |
| ---- | ------------ | -------- |
| XS   | 1            | Bug fix  |
| S    | 2-3          | Small feature |
| M    | 5            | Medium feature |
| L    | 8            | Large feature |
| XL   | 13+          | Epic (must split) |

### Backlog Health Metrics

**Healthy Backlog:**

- ✅ Top 10 stories meet INVEST criteria
- ✅ Next 2 sprints estimated
- ✅ 2-3 sprints worth of ready stories
- ✅ Dependencies identified and tracked
- ✅ Stories prioritized by value

**Unhealthy Backlog:**

- ❌ Vague stories ("Improve performance")
- ❌ Unestimated stories
- ❌ Large epics not split
- ❌ Unclear priorities
- ❌ Missing acceptance criteria

## Prioritization Framework

### Prioritization Matrix (Value vs Effort)

```
High Value, Low Effort    │  High Value, High Effort
(DO FIRST - Quick Wins)   │  (PLAN - Major Features)
──────────────────────────┼──────────────────────────
Low Value, Low Effort     │  Low Value, High Effort
(DO LATER - Fill-ins)     │  (AVOID - Thankless Tasks)
```

### RICE Scoring (Quantitative)

**RICE:** Reach × Impact × Confidence / Effort

| Factor       | Scale                  | Example |
| ------------ | ---------------------- | ------- |
| **Reach**    | Users affected per quarter | 10,000 users |
| **Impact**   | 0.25 (minimal) to 3 (massive) | 2 (high) |
| **Confidence**| 0% to 100%            | 80%     |
| **Effort**   | Person-months          | 2 months|

**Calculation:**

```
RICE = (10,000 × 2 × 0.8) / 2 = 8,000
```

Higher RICE score = higher priority.

### MoSCoW Method (Qualitative)

| Category        | Description                 | Action          |
| --------------- | --------------------------- | --------------- |
| **Must Have**   | Critical, non-negotiable    | Sprint 1        |
| **Should Have** | Important, not critical     | Sprint 2-3      |
| **Could Have**  | Nice-to-have                | Sprint 4+       |
| **Won't Have**  | Out of scope                | Backlog (later) |

## Stakeholder Communication

### Communication Templates

#### Sprint Review Email

```markdown
Subject: Sprint {Number} Review - {Product Name}

Hi {Stakeholder},

Sprint {Number} has concluded. Here's a summary:

**Sprint Goal:** {One sentence goal}

**Completed:**

- {Feature 1}: {One line description + link to demo/docs}
- {Feature 2}: {One line description + link to demo/docs}

**Metrics:**

- Velocity: {X} story points (vs {Y} planned)
- Bugs fixed: {Z}
- User satisfaction: {NPS or CSAT score}

**Next Sprint:**

- Focus: {Main theme}
- Key features: {Top 3 stories}

**Risks:**

- {Risk and mitigation}

**Demo:** {Link to recording or schedule live demo}

Questions? Reply to this email.

Thanks,
{PM Name}
```

#### Roadmap Update

```markdown
# Product Roadmap - Q{Quarter} {Year}

**Vision:** {One sentence product vision}

## Q{Current Quarter} - {Theme}

**Status:** {On Track / At Risk / Behind}

**Key Features:**

- {Feature 1}: {Status} - {ETA}
- {Feature 2}: {Status} - {ETA}

**Metrics:**

- Monthly Active Users: {X} ({+/-Y%})
- Revenue: ${X}k ({+/-Y%})
- Churn: {X}% ({+/-Y%})

## Q{Next Quarter} - {Theme}

**Planned:**

- {Feature 1}
- {Feature 2}

## Risks

- {Risk}: {Mitigation}
```

#### Stakeholder Status Update

```markdown
Subject: {Product} Weekly Update - Week of {Date}

**Progress This Week:**

- {Achievement 1}
- {Achievement 2}

**Next Week:**

- {Plan 1}
- {Plan 2}

**Blockers:**

- {Blocker}: {Who can help}

**Metrics:**

- Velocity: {X} points/week
- Burndown: {X}% complete
```

## Metrics Tracking

### Key Metrics

#### Velocity (Story Points per Sprint)

**Purpose:** Forecast capacity for future sprints

**Calculation:**

```
Velocity = Total story points completed in sprint
```

**Tracking:**

- Record velocity after each sprint
- Calculate 3-sprint rolling average
- Use rolling average for planning

**Example:**

| Sprint | Completed | Velocity (3-sprint avg) |
| ------ | --------- | ----------------------- |
| 1      | 25        | N/A                     |
| 2      | 30        | N/A                     |
| 3      | 28        | 27.7                    |
| 4      | 32        | 30.0                    |

#### Burndown Chart

**Purpose:** Track progress toward sprint goal

**Axes:**

- X-axis: Sprint days
- Y-axis: Story points remaining

**Ideal Burndown:**

```
Points
  │
30│●
  │  ╲
20│    ╲
  │      ●
10│        ╲
  │          ●
 0│____________●_____ Days
   0  2  4  6  8  10
```

**Red Flags:**

- Flat line (no progress)
- Increasing line (scope creep)
- Large end-of-sprint drop (rushing)

#### Cycle Time (Days from Start to Done)

**Purpose:** Measure delivery speed

**Calculation:**

```
Cycle Time = Date story completed - Date story started
```

**Tracking:**

- Measure per story
- Calculate average per sprint
- Trend over time

**Target:**

- Small stories (1-2 points): 1-2 days
- Medium stories (3-5 points): 2-4 days
- Large stories (8+ points): Split into smaller stories

#### Cumulative Flow Diagram (CFD)

**Purpose:** Visualize work in progress (WIP)

**Bands:**

- Backlog
- In Progress
- In Review
- Done

**Healthy CFD:**

- Parallel bands (steady flow)
- Minimal bulges (no bottlenecks)

**Unhealthy CFD:**

- Widening "In Progress" (too much WIP)
- Flat "Done" (no throughput)

## Output Standards (Workspace Conventions)

### Product Artifacts

- **Product Backlog:** `.claude/context/artifacts/product/backlog.md`
- **Sprint Backlogs:** `.claude/context/artifacts/product/sprint-{number}-{YYYY-MM-DD}.md`
- **Roadmap:** `.claude/context/artifacts/product/roadmap-{quarter}-{YYYY}.md`

### Reports

- **Sprint Reviews:** `.claude/context/reports/product/sprint-{number}-review-{YYYY-MM-DD}.md`
- **Metrics:** `.claude/context/reports/product/metrics-{YYYY-MM-DD}.md`

### Provenance Headers

```markdown
<!-- Agent: general-purpose | Task: #{task-id} | Session: {YYYY-MM-DD} -->
```

## Success Criteria

### Sprint Planning Success

- [ ] Sprint goal defined (one sentence)
- [ ] All stories meet INVEST criteria
- [ ] Total story points ≤ team velocity
- [ ] Team commits to sprint backlog
- [ ] Risks and dependencies identified

### Backlog Health Success

- [ ] Top 10 stories meet INVEST criteria
- [ ] Next 2 sprints estimated
- [ ] Stories prioritized by value
- [ ] Dependencies tracked

### Communication Success

- [ ] Sprint review email sent
- [ ] Stakeholder questions answered
- [ ] Roadmap updated quarterly
- [ ] Metrics tracked weekly

## Related Workflows

- **feature-development-workflow.md**: Engineering execution of PM-defined features
- **post-completion-validation.md**: Verification that acceptance criteria met

## Related Skills

- `task-breakdown`: Splitting epics into user stories
- `verification-before-completion`: Ensuring acceptance criteria validated

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New prioritization insight → `.claude/context/memory/learnings.md`
- Stakeholder feedback pattern → `.claude/context/memory/issues.md`
- Roadmap decision rationale → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
