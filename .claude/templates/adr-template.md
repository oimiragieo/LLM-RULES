---
# [REQUIRED] ADR identifier in format ADR-XXX where XXX is a number
# Example: "ADR-042"
adr_number: '{{ADR_NUMBER}}'

# [REQUIRED] Clear, concise decision title (5-200 chars)
# Example: "Use Redis for Distributed Caching"
title: '{{TITLE}}'

# [REQUIRED] Decision date in YYYY-MM-DD format
# Example: "2026-01-28"
date: '{{DATE}}'

# [REQUIRED] Current decision lifecycle status
# Options: proposed, accepted, deprecated, superseded
status: '{{STATUS}}'

# [OPTIONAL] ADR number that this decision supersedes
# Format: ADR-XXX
# Example: "ADR-015"
supersedes: ''

# [OPTIONAL] ADR number that supersedes this decision
# Format: ADR-XXX
# Example: "ADR-050"
superseded_by: ''

# [OPTIONAL] List of decision makers who approved this ADR (MADR field)
# Example: ["Tech Lead", "Architect", "Engineering Manager"]
deciders: []

# [OPTIONAL] List of stakeholders involved in or affected by this decision
# Example: ["Engineering Team", "Product Manager", "DevOps"]
stakeholders: []

# [OPTIONAL] Categorization tags for organizing ADRs
# Format: lowercase-with-hyphens
# Example: ["caching", "performance", "infrastructure"]
tags: []
---

# {{ADR_NUMBER}}: {{TITLE}}

**Date**: {{DATE}}
**Status**: {{STATUS}}

## Context

{{CONTEXT}}

## Decision

{{DECISION}}

## Consequences

{{CONSEQUENCES}}

## Alternatives Considered

{{ALTERNATIVES}}

---

## Template Usage

This ADR template uses the following tokens:

### Required Tokens

- `{{ADR_NUMBER}}` - ADR identifier (format: ADR-XXX)
- `{{TITLE}}` - Clear, concise decision title
- `{{DATE}}` - Decision date (YYYY-MM-DD)
- `{{STATUS}}` - Lifecycle status (proposed, accepted, deprecated, superseded)
- `{{CONTEXT}}` - Background and problem statement
- `{{DECISION}}` - The decision made and its rationale
- `{{CONSEQUENCES}}` - Trade-offs and implications

### Optional Tokens

- `{{ALTERNATIVES}}` - Other options considered and why rejected

### Usage Example

```javascript
// Using template-renderer skill
Skill({
  skill: 'template-renderer',
  args: JSON.stringify({
    templatePath: '.claude/templates/adr-template.md',
    tokens: {
      ADR_NUMBER: 'ADR-047',
      TITLE: 'Template Catalog Structure',
      DATE: '2026-01-28',
      STATUS: 'accepted',
      CONTEXT:
        'We need a standardized way to discover and track template usage across the framework.',
      DECISION:
        'Use file-based markdown catalog with YAML frontmatter for metadata and discovery mechanisms.',
      CONSEQUENCES:
        'Positive: Simple, version-controlled, human-readable. Negative: Manual updates required until hooks automate.',
      ALTERNATIVES:
        'Database-backed catalog was considered but rejected due to added complexity and deployment requirements.',
    },
  }),
});
```

### Integration with decisions.md

ADRs created with this template should be appended to `.claude/context/memory/decisions.md`:

```bash
# Append rendered ADR to decisions.md
cat rendered-adr.md >> .claude/context/memory/decisions.md
```

### Schema Validation

Before rendering, validate tokens against `adr-template.schema.json`:

```bash
node .claude/schemas/adr-template.test.cjs
```

All required fields must be provided and match the schema constraints (date format, status enum, ADR number pattern, length limits).

## ADR Best Practices

1. **Write ADRs when**: Making significant architectural decisions with long-term consequences
2. **Keep it focused**: One decision per ADR
3. **Be specific**: Avoid vague language; provide concrete details
4. **Document trade-offs**: Include both positive and negative consequences
5. **Explain alternatives**: Show what options were considered and why rejected
6. **Update status**: Mark as deprecated/superseded when decision changes

## Related Templates

- **specification-template.md** - For feature specifications
- **plan-template.md** - For implementation plans
- **tasks-template.md** - For task breakdowns

## Security Controls

This template enforces:

- **SEC-CATALOG-001**: All file paths validated within `.claude/templates/` (path traversal protection)
- **SEC-CATALOG-002**: Token whitelist validation (injection protection)
- **SEC-SPEC-003**: Input sanitization on all tokens (XSS protection)

See `.claude/context/artifacts/security-controls-catalog.md` for details.
