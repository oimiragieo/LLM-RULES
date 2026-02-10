# Response Rater Rules

## Core Principles

- Use consistent rubric dimensions for comparable content
- Score each dimension 1-10 with justification
- Calculate weighted overall score
- Apply minimum threshold for pass/fail (7/10 standard, 8/10 enterprise, 9/10 critical)
- Provide actionable recommendations prioritized by impact

## Input Requirements

- Content to rate (plan, response, document)
- Content type (determines rubric: plans vs responses)
- Task complexity level (standard/enterprise/critical)

## Output Standards

- Score report with dimension breakdown
- Overall weighted score
- Pass/fail decision with threshold
- Prioritized recommendations (High/Medium/Low)
- Specific improvement suggestions (not vague)

## Rubrics

**For Plans:**

- Completeness (20%) - All required sections present
- Feasibility (20%) - Plan is realistic and achievable
- Risk Mitigation (20%) - Risks identified with mitigations
- Agent Coverage (20%) - Appropriate agents assigned
- Integration (20%) - Fits with existing systems

**For Responses:**

- Correctness (25%) - Technically accurate
- Completeness (25%) - Addresses all requirements
- Clarity (25%) - Easy to understand
- Actionability (25%) - Provides clear next steps

## Workflow

1. **Define Rubric**: Select plan or response rubric
2. **Evaluate Dimensions**: Score 1-10 with justification for each
3. **Calculate Overall**: Weighted average
4. **Generate Recommendations**: Actionable improvements prioritized
5. **Pass/Fail Decision**: Compare to threshold

## Anti-Patterns

- Using different rubrics for comparable content
- Vague recommendations ("improve quality")
- Missing score justifications
- Not prioritizing recommendations
- Arbitrary pass/fail decisions

## Integration Points

- Used by `plan-generator` for plan validation
- Used by `consensus-voting` for multi-agent decisions
- Feeds into quality reports
- Used for response quality audits
