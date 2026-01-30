# Spec Initialization Guide

## What is spec-init?

Unified entry point for creating feature/bug specifications.

Guides users through:
1. Auto-detect work type (feature/bug/chore/etc)
2. Ask 5-7 targeted questions (progressive disclosure)
3. Generate spec from answers
4. Validate against schema
5. Offer plan generation

## When to Use

**Good for:**
- New features (start with spec-init)
- Bug fixes (document in spec)
- Refactoring (spec the approach)
- Chores (lightweight spec)

**Not ideal for:**
- Urgent hotfixes (skip spec, go straight to implementation)
- Trivial changes (fix typo → direct commit)

## Quick Start

### 1. Invoke Skill

```javascript
Skill({ skill: "spec-init" })
```

### 2. Answer Questions

Progressive disclosure asks 5-7 questions based on work type.

Typical time: 5-10 minutes

### 3. Review Generated Spec

Spec is auto-generated from your answers.

Review and adjust if needed.

### 4. Validate

spec-init validates against JSON Schema.

Ensures all required sections present.

### 5. Generate Plan

Once approved, offer plan generation:

```javascript
Skill({ skill: "plan-generator", args: { specPath: "path/to/spec.md" } })
```

## Example Workflow

**User Input:**
"I want to add support for dark mode in the UI"

**spec-init detects**: type = "feature"

**Asks:**
1. Problem solved: "Users want dark mode for accessibility/comfort"
2. Users: "End users"
3. Success metric: "80% of users enable dark mode"
4. Deadline: "2 weeks"
5. Have AC?: "No, help me define them"

**Generates Spec:**
```markdown
# SPEC: Dark Mode Support

## 1. Overview
**Objective**: Enable users to switch between light and dark themes

...
(auto-populated from answers)
...

## 8. Acceptance Criteria
- [ ] Light/dark toggle in settings
- [ ] Preference persisted to localStorage
- [ ] All components support both themes
- [ ] No accessibility issues
- [ ] <100ms theme switch time
```

**Next**: User reviews, adjusts if needed, then generates plan

## Best Practices

1. **Invest in good specs** - Saves rework later
2. **Answer thoughtfully** - Progressive disclosure works best with real answers
3. **Review generated spec** - Adjust auto-populated sections
4. **Get stakeholder feedback** - Share spec before implementation
5. **Keep specs updated** - Spec is source of truth during implementation

## Troubleshooting

### "I don't have time for a spec"

Spec-init is designed for speed (<10 min for most features).

If truly urgent: Skip spec, commit with label "NO_SPEC"

But expect more rework without spec.

### "Generated spec isn't right"

Edit the markdown directly.

Spec is just template - you own the final version.

### "I'm not sure about acceptance criteria"

Spec-init helps you think through this.

If still unsure after spec-init, mark as TODO and proceed.

## Next Steps After Spec

1. **Plan Generation**: `Skill({ skill: "plan-generator" })`
2. **Developer Assignment**: Assign to developer agent
3. **Implementation**: Follow plan using TDD approach
4. **Verification**: Ensure all AC met before completion

## Templates

Full spec template at: `.claude/templates/spec-template.md`

Use as reference when writing specs manually.

## Type Detection

Spec-init auto-detects work type from description keywords:

| Type       | Keywords                                      |
|------------|-----------------------------------------------|
| `feature`  | build, add, create, implement                 |
| `bug`      | fix, bug, issue, leak                         |
| `chore`    | update, upgrade, dependency                   |
| `refactor` | reorganize, refactor, restructure             |
| `docs`     | document, docs, readme                        |

Default: `feature` (if no keyword match)

## Progressive Disclosure Questions

Base questions (5 required):

1. **Problem**: What problem does this solve?
2. **Users**: Who are the users?
3. **Success**: How will you measure success?
4. **Deadline**: What's the deadline?
5. **Criteria**: Do you have acceptance criteria?

Type-specific questions (1-2 additional):

- **Bug**: Can you reproduce this consistently?

Total: 5-7 questions per spec

## Storage

Specs are saved to:
```
.claude/context/artifacts/specs/[feature-name]-spec-YYYYMMDD.md
```

Filename format:
- `[feature-name]`: Lowercase with underscores
- `spec`: Literal
- `YYYYMMDD`: Date (e.g., 20260129)
- `.md`: Markdown extension

Example: `dark-mode-spec-20260129.md`

## Metadata Generation

Track metadata JSON is generated for each spec:

```json
{
  "trackId": "dark_mode_12345678",
  "type": "feature",
  "status": "new",
  "created_at": "2026-01-29T12:00:00.000Z"
}
```

Fields:
- `trackId`: Auto-generated (feature name + random 8-digit ID)
- `type`: Detected type (feature/bug/chore/refactor/docs)
- `status`: Always "new" for fresh specs
- `created_at`: ISO 8601 timestamp

## Integration with Other Skills

### progressive-disclosure

Spec-init invokes progressive-disclosure for question asking.

Config:
```javascript
{
  header: "Feature Specification",
  questions: [/* 5-7 questions */]
}
```

### spec-validator

Spec-init validates generated specs for:
- Required sections (## 1. Overview, ## 2. Problem Statement, etc.)
- Type field present
- At least 3 acceptance criteria

### plan-generator

After spec completion, spec-init offers plan generation:
```javascript
Skill({ skill: "plan-generator", args: { specPath: "path/to/spec.md" } })
```

## Validation Rules

Minimum required sections:
1. `# SPEC: [Title]`
2. `**Type**: [type]`
3. `## 1. Overview`
4. `## 2. Problem Statement`

Full spec template includes 8 sections total:
1. Overview
2. Problem Statement
3. Proposed Solution
4. Implementation Approach
5. Success Metrics
6. Effort Estimate
7. Dependencies
8. Acceptance Criteria Checklist

Validation is lenient - only checks minimum required sections.

## Assigned Agents

This skill is assigned to:

- `planner` - Feature planning and spec creation
- `pm` - Product management and requirements gathering
- `developer` - Quick spec creation before implementation

## Related Skills

- `progressive-disclosure` - Interactive requirements gathering
- `spec-validator` - Schema validation
- `plan-generator` - Implementation planning from specs
- `track-management` - Track metadata management

## Memory Protocol

**Before starting:**
```bash
cat .claude/context/memory/learnings.md
```

**After completing:**
- New spec pattern → `.claude/context/memory/learnings.md`
- Issue with spec generation → `.claude/context/memory/issues.md`
- Spec-driven workflow decision → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
