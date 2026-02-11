---
# [REQUIRED] Clear, concise specification title (10-200 chars)
# Example: "User Authentication System Specification"
title: '{{FEATURE_NAME}} Specification'

# [REQUIRED] Semantic version number (format: MAJOR.MINOR.PATCH)
# Example: "1.0.0" for initial spec, "1.1.0" for minor updates
version: '{{VERSION}}'

# [REQUIRED] Specification author or team (2-100 chars)
# Example: "Claude", "Engineering Team", "Product Manager"
author: '{{AUTHOR}}'

# [REQUIRED] Current lifecycle status
# Options: draft, review, approved, deprecated
status: 'draft'

# [REQUIRED] Date of creation or last update (format: YYYY-MM-DD)
# Example: "2026-01-28"
date: '{{DATE}}'

# [OPTIONAL] Categorization tags for organizing specifications
# Format: lowercase-with-hyphens
# Example: ["authentication", "security", "backend"]
tags: []

# [OPTIONAL] Priority level for implementation planning
# Options: low, medium, high, critical
priority: 'medium'

# [OPTIONAL] Estimated effort for implementation (human-readable)
# Format: "<number> <unit>" where unit is: hour(s), day(s), week(s), month(s)
# Example: "2 weeks", "4 hours", "3 days"
estimated_effort: ''

# [REQUIRED] List of measurable acceptance criteria (1-50 items, 10-500 chars each)
# These define when the specification is successfully implemented
# Example:
#   - "User can log in with email and password"
#   - "Password must meet complexity requirements (12+ chars, mixed case, numbers, symbols)"
acceptance_criteria:
  - '{{ACCEPTANCE_CRITERIA_1}}'
  - '{{ACCEPTANCE_CRITERIA_2}}'
  - '{{ACCEPTANCE_CRITERIA_3}}'

# [OPTIONAL] Brief overview of what this specification covers (20-1000 chars)
# Detailed content goes in the Markdown body below
description: ''

# [OPTIONAL] List of stakeholders involved in or affected by this specification
# Example: ["Product Manager", "Engineering Team", "Security Team", "End Users"]
stakeholders: []

# [OPTIONAL] External or internal dependencies required for implementation
# Example: ["OAuth2 provider configuration", "User database schema"]
dependencies: []

# [OPTIONAL] References to related or dependent specifications
# Example: ["user-management-spec.md", "security-requirements-spec.md"]
related_specifications: []
---

# {{FEATURE_NAME}} Specification

<!--
POST-CREATION CHECKLIST (BLOCKING - DO NOT SKIP)

After creating this specification:
[ ] Replace ALL {{PLACEHOLDER}} tokens with actual values
[ ] Complete all sections marked [REQUIRED]
[ ] Fill in functional requirements (Section 2)
[ ] Define non-functional requirements (Section 3)
[ ] Document external interfaces (Section 5)
[ ] Review acceptance criteria match implementation
[ ] Validate against schema: .claude/schemas/specification-template.schema.json
[ ] Get stakeholder sign-off
[ ] Update related specifications if any

VERIFICATION COMMANDS:
grep "{{" <this-file> && echo "ERROR: Unresolved tokens found!" || echo "✓ All tokens resolved"
node -e "const yaml=require('js-yaml'); const fs=require('fs'); const content=fs.readFileSync('<this-file>','utf8'); const match=content.match(/^---\n([\s\S]*?)\n---/); if(match) yaml.load(match[1]);" && echo "✓ YAML valid" || echo "ERROR: Invalid YAML"
-->

## 1. Introduction

### 1.1 Purpose

<!-- [REQUIRED] Define the purpose of this specification document -->
<!-- What problem does this specification solve? -->
<!-- Who is the intended audience? -->

This specification defines the requirements for implementing {{FEATURE_NAME}}.

**Target Audience:**

- Development team responsible for implementation
- QA team for test planning
- Product management for requirements validation
- Stakeholders for feature approval

### 1.2 Scope

<!-- [REQUIRED] Define what is included and excluded from this specification -->
<!-- What features/capabilities are in scope? -->
<!-- What is explicitly out of scope? -->

**In Scope:**

- [List features/capabilities included]
- [Add item]
- [Add item]

**Out of Scope:**

- [List features/capabilities explicitly excluded]
- [Add item]
- [Add item]

### 1.3 Definitions

<!-- [OPTIONAL] Define domain-specific terms, acronyms, and abbreviations -->
<!-- Format: **Term**: Definition -->

- **{{TERM_1}}**: [Definition]
- **{{TERM_2}}**: [Definition]
- **{{TERM_3}}**: [Definition]

## 2. Functional Requirements

<!-- [REQUIRED] Document all functional requirements -->
<!-- Use format: FR-XXX for requirement IDs -->
<!-- Each requirement should include: Description, Input, Output, Validation -->

### 2.1 {{Functional Requirement Title}} (FR-001)

**Description**: [Clear description of what the system shall do]

**Input**:

- [Input parameter 1: type, format, constraints]
- [Input parameter 2: type, format, constraints]

**Output**:

- Success: [Expected output on success]
- Failure: [Expected output/error on failure]

**Validation**:

- [Validation rule 1]
- [Validation rule 2]
- [Rate limiting/security constraints]

### 2.2 {{Functional Requirement Title}} (FR-002)

**Description**: [Clear description of what the system shall do]

**Requirements**:

- [Requirement detail 1]
- [Requirement detail 2]
- [Requirement detail 3]

### 2.3 {{Functional Requirement Title}} (FR-003)

**Description**: [Clear description of what the system shall do]

**Details**:

- [Detail 1]
- [Detail 2]
- [Detail 3]

<!-- Add more functional requirements as needed (FR-004, FR-005, etc.) -->

## 3. Non-Functional Requirements

<!-- [REQUIRED] Document quality attributes and constraints -->
<!-- Use format: NFR-XXX for requirement IDs -->

### 3.1 Security (NFR-001)

<!-- Security requirements: authentication, authorization, data protection, compliance -->

- [Security requirement 1]
- [Security requirement 2]
- [Security requirement 3]

### 3.2 Performance (NFR-002)

<!-- Performance requirements: latency, throughput, response times -->

- [Performance metric 1: specific measurable target]
- [Performance metric 2: specific measurable target]
- [Performance metric 3: specific measurable target]

### 3.3 Availability (NFR-003)

<!-- Availability requirements: uptime, failover, disaster recovery -->

- [Availability requirement 1: SLA target]
- [Availability requirement 2: fault tolerance]
- [Availability requirement 3: recovery time]

### 3.4 Scalability (NFR-004)

<!-- Scalability requirements: horizontal/vertical scaling, load handling -->

- [Scalability requirement 1]
- [Scalability requirement 2]
- [Scalability requirement 3]

### 3.5 Usability (NFR-005)

<!-- Usability requirements: user experience, accessibility, internationalization -->

- [Usability requirement 1]
- [Usability requirement 2]
- [Usability requirement 3]

## 4. System Features

<!-- [OPTIONAL] High-level feature descriptions and flows -->
<!-- Use this section to document major features and their workflows -->

### 4.1 {{Feature Name}} Flow

```
1. [Step 1 description]
2. [Step 2 description]
3. [Step 3 description]
4. [Step 4 description]
5. [Step 5 description]
```

### 4.2 {{Feature Name}} Flow

```
1. [Step 1 description]
2. [Step 2 description]
3. [Step 3 description]
```

## 5. External Interface Requirements

<!-- [REQUIRED if interfaces exist] Document all external interfaces -->

### 5.1 API Endpoints

<!-- Document RESTful/GraphQL/RPC endpoints -->

**{{HTTP_METHOD}} {{ENDPOINT_PATH}}**

- Request: `{ "field": "value" }`
- Response: `{ "result": "value" }`
- Authentication: [Required/Optional, method]
- Rate Limit: [Requests per time period]

**{{HTTP_METHOD}} {{ENDPOINT_PATH}}**

- Request: `{ "field": "value" }`
- Response: `{ "result": "value" }`

### 5.2 Database Schema

<!-- Document database tables, columns, indexes, relationships -->

**{{table_name}} table**:

- {{column_1}} ({{type}}, {{constraints}})
- {{column_2}} ({{type}}, {{constraints}})
- {{column_3}} ({{type}}, {{constraints}})
- Indexes: [List indexes]
- Foreign Keys: [List relationships]

### 5.3 External Dependencies

<!-- Document third-party services, libraries, APIs -->

- **{{Dependency Name}}**: [Purpose and integration details]
- **{{Dependency Name}}**: [Purpose and integration details]
- **{{Dependency Name}}**: [Purpose and integration details]

### 5.4 Message Formats

<!-- [OPTIONAL] Document message/event formats for async communication -->

**{{Event Name}} Event**:

```json
{
  "event_type": "{{event_type}}",
  "payload": {
    "field1": "value",
    "field2": "value"
  },
  "timestamp": "2026-01-28T00:00:00Z"
}
```

## 6. Quality Attributes

<!-- [REQUIRED] Define quality expectations for the implementation -->

### 6.1 Testability

<!-- Testing requirements and coverage targets -->

- [Test type 1: coverage target]
- [Test type 2: coverage target]
- [Test type 3: coverage target]

### 6.2 Maintainability

<!-- Code quality and documentation requirements -->

- [Maintainability requirement 1]
- [Maintainability requirement 2]
- [Maintainability requirement 3]

### 6.3 Monitoring

<!-- Observability requirements: metrics, logs, alerts, dashboards -->

- **Metrics**: [List key metrics to track]
- **Alerts**: [List critical alert conditions]
- **Dashboards**: [Dashboard requirements]

## 7. Constraints

<!-- [OPTIONAL] Document technical, schedule, or resource constraints -->

### 7.1 Technical Constraints

<!-- Technology stack, platform, compatibility requirements -->

- [Technical constraint 1]
- [Technical constraint 2]
- [Technical constraint 3]

### 7.2 Schedule Constraints

<!-- Timeline, milestones, delivery dates -->

- Phase 1: [Duration and deliverables]
- Phase 2: [Duration and deliverables]
- Phase 3: [Duration and deliverables]
- **Total**: [Total duration]

### 7.3 Resource Constraints

<!-- Team size, budget, infrastructure limitations -->

- [Resource constraint 1]
- [Resource constraint 2]
- [Resource constraint 3]

## 8. Assumptions and Dependencies

<!-- [REQUIRED] Document assumptions that underpin this specification -->

### 8.1 Assumptions

<!-- Critical assumptions that affect implementation -->

- [ASSUMES: Assumption 1]
- [ASSUMES: Assumption 2]
- [ASSUMES: Assumption 3]

### 8.2 Dependencies

<!-- Prerequisites that must be satisfied before implementation -->

- **{{Dependency Name}}**: [What must be completed/available]
- **{{Dependency Name}}**: [What must be completed/available]
- **{{Dependency Name}}**: [What must be completed/available]

## 9. Deployment

<!-- [REQUIRED for production features] Document deployment strategy and requirements -->

### 9.1 Deployment Strategy

<!-- Deployment approach: blue-green, canary, rolling, etc. -->

- **Strategy**: [Blue-Green | Canary | Rolling | Big Bang]
- **Rollout Plan**: [Step-by-step deployment plan]
- **Traffic Shifting**: [How traffic is gradually shifted to new version]

### 9.2 Environment Requirements

<!-- Infrastructure and environment requirements for deployment -->

**Production Environment:**

- [Infrastructure requirement 1]
- [Infrastructure requirement 2]
- [Infrastructure requirement 3]

**Staging Environment:**

- [Staging-specific requirements]

**Development Environment:**

- [Dev-specific requirements]

### 9.3 Rollback Plan

<!-- Detailed rollback procedure in case of deployment failure -->

**Rollback Triggers:**

- [Condition that triggers rollback 1]
- [Condition that triggers rollback 2]

**Rollback Steps:**

1. [Rollback step 1]
2. [Rollback step 2]
3. [Rollback step 3]

**Rollback Time:** [Expected time to complete rollback]

**Data Recovery:** [How to recover data if needed]

## 10. Future Enhancements

<!-- [OPTIONAL] Document features deferred to future versions -->

- [Future enhancement 1: brief description]
- [Future enhancement 2: brief description]
- [Future enhancement 3: brief description]

## 11. Acceptance Criteria (Summary)

<!-- [REQUIRED] Recap all acceptance criteria with checkboxes -->

✅ **AC-001**: [Acceptance criteria 1 from frontmatter]
✅ **AC-002**: [Acceptance criteria 2 from frontmatter]
✅ **AC-003**: [Acceptance criteria 3 from frontmatter]

## 12. Glossary

<!-- [OPTIONAL] Comprehensive glossary of technical terms -->

- **{{Term}}**: [Definition]
- **{{Term}}**: [Definition]
- **{{Term}}**: [Definition]

---

**Document Version**: {{VERSION}}
**Last Updated**: {{DATE}}
**Status**: {{STATUS}}
**Next Review**: [Review date, typically 2-4 weeks after approval]

---

## Appendix A: Token Replacement Guide

<!-- This section helps users understand token replacement -->

When instantiating this template, replace the following tokens:

| Token                       | Description                     | Example Value                               |
| --------------------------- | ------------------------------- | ------------------------------------------- |
| `{{PROJECT_NAME}}`          | Name of the project             | "Agent Studio", "Payment Gateway"           |
| `{{AUTHOR}}`                | Specification author            | "Claude", "Engineering Team"                |
| `{{DATE}}`                  | Current date (YYYY-MM-DD)       | "2026-01-28"                                |
| `{{VERSION}}`               | Semantic version                | "1.0.0", "2.1.0"                            |
| `{{FEATURE_NAME}}`          | Name of feature being specified | "User Authentication", "Payment Processing" |
| `{{ACCEPTANCE_CRITERIA_N}}` | Measurable acceptance criteria  | "User can log in with email and password"   |

**Validation:**
After replacing tokens, run:

```bash
# Check for unresolved tokens
grep "{{" specification.md && echo "ERROR: Unresolved tokens!" || echo "✓ All tokens resolved"

# Validate YAML frontmatter
head -50 specification.md | grep -E "^---$" | wc -l  # Should output: 2

# Validate against schema (if using JSON Schema validator)
# ajv validate -s .claude/schemas/specification-template.schema.json -d specification.md
```

## Appendix B: IEEE 830 Compliance

This template follows IEEE 830-1998 recommended practices for software requirements specifications:

- **Section 1 (Introduction)**: Purpose, Scope, Definitions
- **Section 2 (Functional Requirements)**: Detailed functional capabilities
- **Section 3 (Non-Functional Requirements)**: Quality attributes and constraints
- **Section 4 (System Features)**: High-level feature descriptions
- **Section 5 (External Interfaces)**: API, database, and integration interfaces
- **Section 6 (Quality Attributes)**: Testability, maintainability, monitoring
- **Section 7 (Constraints)**: Technical, schedule, resource limitations
- **Section 8 (Assumptions/Dependencies)**: Prerequisites and assumptions

**Key IEEE 830 Principles Applied:**

- ✅ Unambiguous requirements
- ✅ Complete coverage of all requirements
- ✅ Verifiable acceptance criteria
- ✅ Consistent terminology
- ✅ Traceable requirements (FR-XXX, NFR-XXX IDs)
- ✅ Modifiable structure (sections can be extended)

## Appendix C: ADR-044 Compliance

This template implements ADR-044 (YAML+MD Hybrid Specification Format):

**YAML Frontmatter (Machine-Readable Metadata)**:

- Structured metadata for tooling integration
- Schema validation support
- Token replacement patterns
- Version control friendly

**Markdown Body (Human-Readable Content)**:

- Rich formatting for readability
- Code blocks for technical examples
- Tables for structured data
- IEEE 830 section structure

**Benefits**:

- Tooling can parse YAML for automation
- Humans read Markdown for comprehension
- Git-friendly plain text format
- Schema validation prevents errors

## Memory Protocol (MANDATORY)

**Before starting implementation:**

1. Read `.claude/context/memory/learnings.md` for related patterns
2. Review `.claude/context/memory/decisions.md` for architectural decisions
3. Check `.claude/context/memory/issues.md` for known blockers

**After completing implementation:**

1. Record implementation patterns → `learnings.md`
2. Document architectural decisions → `decisions.md`
3. Log any blockers/workarounds → `issues.md`

**After specification approval:**

1. Archive specification in `.claude/context/artifacts/specifications/`
2. Create implementation tasks referencing this specification
3. Update related specifications if dependencies changed

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.

---

## Integration with Agent Studio Framework

### Workflow Integration

This specification template integrates with:

1. **spec-gathering skill**: Use to collect requirements before creating specification
2. **spec-writing skill**: Use to generate initial draft from gathered requirements
3. **spec-critique skill**: Use to review and validate completed specification
4. **planner agent**: Use to break down specification into implementation tasks
5. **architect agent**: Use to review non-functional requirements and constraints

### Invocation Pattern

```javascript
// Step 1: Gather requirements
Skill({ skill: 'spec-gathering' });

// Step 2: Write specification using this template
Skill({ skill: 'spec-writing', args: 'feature-name' });

// Step 3: Critique specification
Skill({ skill: 'spec-critique', args: 'specification-file.md' });

// Step 4: Plan implementation
Task({
  task_id: 'task-1',
  subagent_type: 'planner',
  prompt: 'Break down specification into tasks',
});
```

### Storage Location

Store completed specifications in:

- **Active specs**: `.claude/context/artifacts/specifications/active/`
- **Approved specs**: `.claude/context/artifacts/specifications/approved/`
- **Deprecated specs**: `.claude/context/artifacts/specifications/deprecated/`

---

## Specification Review Checklist

Before marking specification as "approved", verify:

**Completeness**:

- [ ] All required sections completed
- [ ] All functional requirements documented
- [ ] All non-functional requirements defined
- [ ] Acceptance criteria are measurable
- [ ] External interfaces documented

**Quality**:

- [ ] Requirements are unambiguous
- [ ] Requirements are testable/verifiable
- [ ] Consistent terminology throughout
- [ ] No contradictory requirements
- [ ] Realistic constraints and timelines

**Stakeholder Alignment**:

- [ ] Product stakeholder sign-off
- [ ] Engineering feasibility review
- [ ] Security review (if applicable)
- [ ] Dependency owners notified
- [ ] Related specifications updated

**Schema Validation**:

- [ ] YAML frontmatter validates against schema
- [ ] All required fields present
- [ ] Field types correct (string, array, enum)
- [ ] Version follows semver format
- [ ] Date follows ISO 8601 format

---

**Template Version**: 1.0.0
**Template Author**: Claude (Task #13)
**Last Updated**: 2026-01-28
**Schema**: `.claude/schemas/specification-template.schema.json`
