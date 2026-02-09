# Spec Init Rules

## Core Principles

- Type detection before questioning (feature/bug/chore/refactor/docs)
- Adaptive questioning using progressive disclosure v2 (5-7 questions, not 10-12)
- Context accumulation through Q&A
- Optimal stopping detection (don't over-question)
- Auto-populate spec template from gathered context

## Input Requirements

- User description of what they're building
- Willingness to answer 5-7 clarifying questions
- Clear understanding of problem being solved

## Output Standards

- Generated spec saved to `.claude/context/artifacts/specs/`
- Naming: `{feature-name}-spec-{YYYY-MM-DD}.md`
- Must include: Overview, Problem Statement, Proposed Solution, Implementation Approach, Success Metrics, Effort Estimate, Dependencies, Acceptance Criteria
- Track metadata: trackId, type, status, created_at

## Workflow

1. **Type Detection**: Classify intent (feature/bug/chore/refactor/docs)
2. **Progressive Disclosure v2**: Ask 5-7 adaptive questions using ContextAccumulator
3. **Template Generation**: Auto-populate spec sections from answers
4. **Validation**: Check completeness (all required sections present, 3+ acceptance criteria)
5. **Storage**: Save spec and track metadata
6. **Plan Suggestion**: Offer planner next step

## Anti-Patterns

- Asking fixed 10-12 questions regardless of context
- Not detecting when enough information gathered
- Skipping type detection
- Generating spec without validation
- Missing track metadata

## Integration Points

- Uses `progressive-disclosure` for adaptive questioning
- Uses `spec-validator` for completeness checks
- Feeds into `plan-generator` for implementation plans
- Integrates with track-metadata schema
