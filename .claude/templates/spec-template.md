# SPEC: [Feature Name]

**Status**: Draft
**Created**: YYYY-MM-DD
**Type**: feature | bug | chore | refactor | docs

**Input**: User description or feature request.

## Execution Flow (main)

1. Parse user description from Input
   → If empty: ERROR "No feature description provided"
2. Extract key concepts from description
   → Identify: actors, actions, data, constraints
3. For each unclear aspect:
   → Mark with [NEEDS CLARIFICATION: specific question]
4. Fill User Scenarios and acceptance criteria (Section 1)
   → If no clear user flow: ERROR "Cannot determine user scenarios"
5. Generate functional requirements (Section 3)
   → Each requirement must be testable
   → Mark ambiguous requirements
6. Identify key entities if data is involved
7. Run review checklist
   → If any [NEEDS CLARIFICATION]: WARN "Spec has uncertainties"
   → If implementation details found: ERROR "Remove tech details"
8. Return: SUCCESS (spec ready for planning)

## 1. Overview

**Objective** (one sentence):
What will this feature/fix accomplish?

**User Story**:
"As a [user type], I want [capability], so that [benefit]"

**Acceptance Criteria**:

- [ ] [Specific, testable criterion]
- [ ] [Specific, testable criterion]
- [ ] [Specific, testable criterion]

## 2. Problem Statement

**Current State**:
How do things work now?

**Pain Points**:

- [Issue 1]
- [Issue 2]

**Impact**:

- Who is affected?
- What's the cost of inaction?
- What's the opportunity?

## 3. Proposed Solution

**Approach**:
High-level description of how we'll solve this.

**Key Features**:

- [Feature 1]
- [Feature 2]

**Out of Scope**:
What are we explicitly NOT doing?

## 4. Implementation Approach

**Phase 1 - Design** (X days):

- Research/spike if needed
- Design architecture
- Get design approval

**Phase 2 - Implementation** (Y days):

- Build core features
- Write tests (TDD)
- Follow style guide

**Phase 3 - Testing** (Z days):

- Integration tests
- Performance testing
- Security review

**Phase 4 - Documentation** (W days):

- User docs
- API documentation
- Examples

## 5. Success Metrics

**Quantitative**:

- [Measurable outcome 1]
- [Measurable outcome 2]

**Qualitative**:

- [User satisfaction measure]
- [Team feedback]

**Timeline**:

- Target completion date
- Key milestones

## 6. Effort Estimate

| Phase          | Effort     | Notes                   |
| -------------- | ---------- | ----------------------- |
| Design         | 1 day      | Include spike if needed |
| Implementation | 3 days     | TDD approach            |
| Testing        | 2 days     | Unit + integration      |
| Documentation  | 1 day      | API + user docs         |
| **Total**      | **7 days** | With 2-3 person team    |

## 7. Dependencies

**Must Complete First**:

- [Blocking dependency 1]
- [Blocking dependency 2]

**Should Complete First**:

- [Preferred dependency 1]

**Risks**:

- [Risk 1] → Mitigation: [Plan]
- [Risk 2] → Mitigation: [Plan]

## 8. Acceptance Criteria Checklist

- [ ] All acceptance criteria met
- [ ] All tests passing (100%)
- [ ] Code coverage >80%
- [ ] No security vulnerabilities
- [ ] Documentation complete
- [ ] Follows style guide
- [ ] Performance targets met
- [ ] Zero breaking changes
- [ ] Stakeholder approval
- [ ] Ready for next phase

---

**Next Steps**:

- [ ] Get spec approval
- [ ] Generate implementation plan
- [ ] Assign developers
- [ ] Begin Phase 1 (Design)
