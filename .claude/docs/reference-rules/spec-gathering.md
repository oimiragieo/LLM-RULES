---
paths:
  - .claude/skills/spec-gathering/**
---

# Spec Gathering Rules

## Core Principles

- Requirements must be specific, measurable, and testable
- Capture both functional and non-functional requirements
- Identify edge cases and error scenarios early
- Get user confirmation on requirements before implementation
- Document assumptions explicitly

## Input Requirements

- User request or feature description
- Target use case or user story
- Business context (why this feature is needed)
- Constraints (time, budget, technology)

## Output Standards

### Required Specification Elements

1. **Feature Overview**: What the feature does (2-3 sentences)
2. **User Stories**: As [role], I want [goal], so that [benefit]
3. **Functional Requirements**: What the system must do
4. **Non-Functional Requirements**: Performance, security, scalability
5. **Acceptance Criteria**: Testable conditions for "done"
6. **Edge Cases**: Boundary conditions and error scenarios
7. **Assumptions**: Explicit statements about scope and constraints
8. **Out of Scope**: What this feature does NOT include

### User Story Format

```
As a [role/persona]
I want [goal/desire]
So that [benefit/value]

Acceptance Criteria:
- [ ] Given [context], when [action], then [outcome]
- [ ] Given [context], when [action], then [outcome]
```

### Requirement Types

| Type           | Focus                     | Examples                                     |
| -------------- | ------------------------- | -------------------------------------------- |
| Functional     | What system does          | "User can upload images", "API returns JSON" |
| Non-Functional | Quality attributes        | "Response time <100ms", "99.9% uptime"       |
| Performance    | Speed, throughput         | "Handles 1000 req/sec", "Loads in 2s"        |
| Security       | Auth, encryption, privacy | "OAuth 2.1", "Encrypt PII at rest"           |
| Usability      | User experience           | "3 clicks or less", "Mobile-responsive"      |
| Scalability    | Growth capacity           | "Scales to 10x users", "Horizontal scaling"  |

## Anti-Patterns

| Anti-Pattern                   | Problem                          | Fix                                         |
| ------------------------------ | -------------------------------- | ------------------------------------------- |
| Vague requirements             | "Make it fast" is not measurable | Specify: "Response time <100ms"             |
| No edge cases                  | Missing error handling           | Document: empty input, bad data, timeouts   |
| No NFRs                        | Quality attributes forgotten     | Add: performance, security, scalability     |
| Assumptions not documented     | Hidden constraints               | Explicitly list all assumptions             |
| No acceptance criteria         | Can't tell when done             | Add testable conditions                     |
| "Should" instead of "must"     | Ambiguous priority               | Use "must" for required, "may" for optional |
| Implementation details in spec | Spec tells HOW, not WHAT         | Focus on behavior, not implementation       |

## Integration Points

### Agents Using This Skill

- **planner** (after spec): Creates plan from specification
- **pm**: Gathers requirements from stakeholders
- **analyst**: Business requirement analysis
- **qa**: Derives test cases from acceptance criteria

### Related Skills

- **spec-init**: Interactive requirements gathering
- **context-compressor**: Progressive disclosure for requirements gathering
- **prd-generator**: Creates PRD from specification
- **complexity-assessment**: Determines complexity from spec
- **plan-generator**: Creates implementation plan from spec

### Workflows

- **feature-development-workflow.md**: Spec gathering in Triage phase
- **enterprise-workflow.md**: Requirements gathering before Design
- **sparc-methodology.md**: Specification as first SPARC phase

## Specification Checklist

Before finalizing specification, verify:

- [ ] Feature overview is clear (2-3 sentences)
- [ ] At least one user story per role/persona
- [ ] Functional requirements are testable
- [ ] Non-functional requirements quantified (numbers, not adjectives)
- [ ] Acceptance criteria use Given/When/Then format
- [ ] Edge cases documented (empty, null, invalid, timeout)
- [ ] Error scenarios handled (network failure, auth failure, data loss)
- [ ] Assumptions explicitly listed
- [ ] Out-of-scope explicitly listed
- [ ] Security requirements included (if handling auth/PII/external data)
- [ ] Performance requirements included (if user-facing)

## NFR Template

Use this template for non-functional requirements:

| Category     | Requirement           | Measurement              | Priority |
| ------------ | --------------------- | ------------------------ | -------- |
| Performance  | API response time     | 95th percentile <100ms   | Must     |
| Security     | Authentication        | OAuth 2.1 + JWT          | Must     |
| Scalability  | Concurrent users      | 1000 users               | Must     |
| Availability | Uptime                | 99.9% (8h downtime/year) | Must     |
| Usability    | Time to complete task | <2 minutes               | Should   |

## Iron Law

```
NO IMPLEMENTATION WITHOUT SPECIFICATION FOR STANDARD+ COMPLEXITY
```

STANDARD and higher complexity tasks must have a specification before implementation begins.

## Related References

- `.claude/skills/spec-gathering/SKILL.md` - Full skill documentation
- `spec-init` skill - Interactive spec creation
- `prd-generator` skill - PRD creation from spec
- `complexity-assessment` skill - Determines if spec is required
