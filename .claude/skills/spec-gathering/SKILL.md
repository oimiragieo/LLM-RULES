---
name: spec-gathering
description: 'Requirements gathering workflow for specification creation. Use when starting a new feature, task, or project that needs structured requirements.'
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, AskUserQuestion]
best_practices:
  - Ask smart questions, produce structured output
  - Confirm understanding before proceeding
  - Identify services and dependencies early
error_handling: graceful
streaming: supported
source: auto-claude
verified: true
lastVerifiedAt: 2026-02-22T00:00:00.000Z
---

# Requirements Gathering Skill

## Overview

Gather user requirements through structured questioning and produce a validated requirements document. This skill transforms vague task descriptions into actionable, structured requirements.

**Core principle:** Ask smart questions, produce valid structured output. Nothing else.

## When to Use

**Always:**

- Starting a new feature or project
- Clarifying ambiguous task descriptions
- When user provides high-level goals without specifics
- Before spec writing begins

**Exceptions:**

- Simple bug fixes with clear reproduction steps
- Single-file changes with obvious scope
- User explicitly provides complete requirements

## The Iron Law

```
NO SPEC WRITING WITHOUT VALIDATED REQUIREMENTS FIRST
```

Requirements must be confirmed by the user before proceeding to spec creation.

## Workflow

### Phase 1: Load Project Context

Understand the project structure before engaging the user.

**Steps:**

1. Read project structure files if they exist
2. Identify services, tech stack, and ports
3. Understand existing patterns and conventions

```bash
# Read project structure
cat .claude/context/product.md 2>/dev/null || echo "No product context"
cat .claude/context/tech-stack.md 2>/dev/null || echo "No tech stack"
```

### Phase 2: Understand the Task

If a task description was provided, confirm it:

> "I understand you want to: [task description]. Is that correct? Any clarifications?"

If no task was provided, ask:

> "What would you like to build or fix? Please describe the feature, bug, or change you need."

**Wait for user response.**

### Phase 3: Determine Workflow Type

Based on the task, determine the workflow type:

| If task sounds like...              | Workflow Type   |
| ----------------------------------- | --------------- |
| "Add feature X", "Build Y"          | `feature`       |
| "Migrate from X to Y", "Refactor Z" | `refactor`      |
| "Fix bug where X", "Debug Y"        | `investigation` |
| "Migrate data from X"               | `migration`     |
| Single service, small change        | `simple`        |

Ask to confirm:

> "This sounds like a **[workflow_type]** task. Does that seem right?"

### Phase 4: Identify Services and Scope

Based on the project context and task, suggest affected areas:

> "Based on your task and project structure, I think this involves:
>
> - **[service1]** (primary) - [why]
> - **[service2]** (integration) - [why]
>
> Any other services or areas involved?"

Wait for confirmation or correction.

### Phase 4.5: Invoke Progressive-Disclosure (ECLAIR Pattern)

Before gathering requirements manually, use the progressive-disclosure skill to optimize the clarification process:

```javascript
Skill({
  skill: 'progressive-disclosure',
  context: {
    taskDescription: taskDescription,
    projectContext: projectContext,
    services: identifiedServices,
  },
});
```

**Progressive-Disclosure performs:**

1. **E: Examine** - Analyze ambiguities in the task description
2. **C: Categorize** - Prioritize by CRITICAL, HIGH, MEDIUM, LOW
3. **L: Limit** - Apply 3-5 clarification cap
4. **A: Assume** - Apply smart defaults from project patterns
5. **I: Infer** - Use existing code patterns and tech stack
6. **R: Record** - Document all assumptions with [ASSUMES: X]

**Returns:**

- Prioritized clarification questions (max 5)
- Smart defaults with [ASSUMES:] notation
- Updated understanding of requirements

### Phase 5: Gather Detailed Requirements (with Progressive-Disclosure)

Ask only the critical clarification questions identified by progressive-disclosure:

**Budget:** 3-5 clarification questions maximum

**Process:**

1. Ask CRITICAL priority questions first (security, data loss, breaking changes)
   - Example: "Does the system need role-based access control?"
   - Example: "Should users be able to delete data? Is this reversible?"

2. Ask HIGH priority questions if budget remains (UX, architecture, scalability)
   - Example: "What's the expected user load?"
   - Example: "Should this support offline mode?"

3. For MEDIUM/LOW priorities, use [ASSUMES:] notation with defaults
   - Example: "[ASSUMES: JWT tokens with 1-hour expiry]"
   - Example: "[ASSUMES: REST API following existing /api/v1/ pattern]"

**Collect answers and document all assumptions.**

### Phase 6: Confirm and Output (with Assumptions)

Summarize what you understood, including clarified requirements and assumptions:

> "Let me confirm I understand:
>
> **Task**: [summary]
> **Type**: [workflow_type]
> **Scope**: [list of affected areas]
>
> **Clarified Requirements** (questions asked):
>
> 1. ✅ [Question] → [Answer]
> 2. ✅ [Question] → [Answer]
> 3. ✅ [Question] → [Answer]
>
> **Smart Defaults Applied** (not asked due to budget or clarity):
>
> [ASSUMES: X]
> [ASSUMES: Y]
> [ASSUMES: Z]
>
> **Success Criteria**:
>
> 1. [criterion 1]
> 2. [criterion 2]
>
> Is this correct?"

Wait for confirmation. If user objects to any assumption, allow them to override or request adjustment.

### Phase 7: Map Requirements to Template Tokens (with Assumptions)

After confirming requirements and assumptions with user, map gathered data to template tokens:

```javascript
const tokens = {
  // Required tokens
  FEATURE_NAME: gatheredRequirements.taskName,
  VERSION: '1.0.0',
  AUTHOR: 'Claude',
  DATE: new Date().toISOString().split('T')[0],
  STATUS: 'draft',

  // Required: Acceptance criteria (minimum 1, maximum 50)
  ACCEPTANCE_CRITERIA_1: gatheredRequirements.criteria[0] || '[Define acceptance criterion 1]',
  ACCEPTANCE_CRITERIA_2: gatheredRequirements.criteria[1] || '[Define acceptance criterion 2]',
  ACCEPTANCE_CRITERIA_3: gatheredRequirements.criteria[2] || '[Define acceptance criterion 3]',

  // Optional tokens (can be empty strings if not gathered)
  TERM_1: gatheredRequirements.terms?.[0] || '',
  TERM_2: gatheredRequirements.terms?.[1] || '',
  TERM_3: gatheredRequirements.terms?.[2] || '',

  HTTP_METHOD: gatheredRequirements.httpMethod || '',
  ENDPOINT_PATH: gatheredRequirements.endpointPath || '',
  PROJECT_NAME: gatheredRequirements.projectName || 'Agent Studio',

  // Assumptions from progressive-disclosure (optional but recommended)
  ASSUMPTIONS_MADE: gatheredRequirements.assumptions.map(a => `- ${a}`).join('\n') || '',
  CLARIFICATIONS_ASKED: gatheredRequirements.clarifications || 0,
};
```

**Validation Before Rendering:**

- Check all required tokens are populated (FEATURE_NAME, VERSION, AUTHOR, DATE, STATUS)
- Check at least one ACCEPTANCE*CRITERIA*\* token is meaningful (not placeholder)
- Verify all assumptions are documented with [ASSUMES:] notation
- If missing required data, prompt user for missing information
- If clarifications > 5, warn user about potential requirement incompleteness

### Phase 8: Render Specification via Template

Invoke the `template-renderer` skill to create the specification:

```javascript
Skill({
  skill: 'template-renderer',
  args: {
    templateName: 'specification-template',
    outputPath: `.claude/context/artifacts/specifications/${featureNameSlug}-spec.md`,
    tokens: tokens,
  },
});
```

**Output Location**: `.claude/context/artifacts/specifications/[feature-name]-spec.md`

**Post-Rendering Verification:**

```bash
# Check file created
SPEC_FILE=".claude/context/artifacts/specifications/[feature-name]-spec.md"
test -f "$SPEC_FILE" && echo "✓ Spec created" || echo "✗ Spec creation failed"

# Check no unresolved tokens
grep -E '[{]{2}' "$SPEC_FILE" && echo "✗ Unresolved tokens found" || echo "✓ All tokens resolved"

# Check YAML frontmatter valid
YAML_COUNT=$(head -50 "$SPEC_FILE" | grep -E "^---$" | wc -l)
test "$YAML_COUNT" -eq 2 && echo "✓ YAML valid" || echo "✗ YAML invalid"
```

## Verification Checklist

Before completing requirements gathering:

- [ ] Task description confirmed with user
- [ ] Progressive-disclosure skill invoked (Phase 4.5)
- [ ] Clarification budget respected (3-5 questions maximum)
- [ ] CRITICAL priority questions asked and answered
- [ ] All assumptions documented with [ASSUMES:] notation
- [ ] Workflow type determined and confirmed
- [ ] Scope and affected areas identified
- [ ] Specific requirements captured
- [ ] Acceptance criteria defined (minimum 1, mapped to ACCEPTANCE_CRITERIA_1/2/3)
- [ ] Constraints documented
- [ ] User confirmed final summary (including assumptions)
- [ ] User allowed to override any assumptions before proceeding
- [ ] Token mapping complete (all required tokens populated, including ASSUMPTIONS_MADE)
- [ ] Template renderer invoked successfully
- [ ] Specification file created (no unresolved tokens)
- [ ] YAML frontmatter valid (2 delimiters, required fields present)
- [ ] [ASSUMES:] notation appears in specification output

## Common Mistakes

### Assuming Instead of Asking

**Why it's wrong:** Assumptions lead to building the wrong thing.

**Do this instead:** Ask clarifying questions. Confirm understanding.

### Skipping Confirmation

**Why it's wrong:** User may have misunderstood your summary.

**Do this instead:** Always summarize and wait for explicit confirmation.

### Vague Requirements

**Why it's wrong:** "Make it better" is not actionable.

**Do this instead:** Get specific: What behavior? What outcome? How to verify?

## Integration with Other Skills

This skill works well with:

- **progressive-disclosure**: Invoked in Phase 4.5 to optimize clarification process with ECLAIR pattern (3-5 limit, smart defaults, [ASSUMES:] notation)
- **template-renderer**: Used automatically after Phase 8 to render specification template with gathered requirements and assumptions
- **spec-critique**: Use to validate the generated specification
- **complexity-assessment**: Assess complexity after requirements are clear
- **brainstorming**: Use for creative exploration before requirements gathering

**Workflow Chain**:

```
spec-gathering (→ progressive-disclosure in Phase 4.5) → template-renderer → spec-critique → planner
```

**Progressive-Disclosure Integration Details**:

- **When**: Invoked at the start of Phase 5 (before manual questioning)
- **Why**: Limits clarifications to 3-5 questions (reduces cognitive load), applies smart defaults, documents all assumptions
- **Output**: Prioritized questions + default assumptions with [ASSUMES:] notation
- **Impact**: Specification includes documented assumptions that can be overridden during implementation

## Examples

### Example 1: Feature Request (End-to-End with Progressive-Disclosure & Template Rendering)

**Input:** "Add user authentication to the app"

**Process:**

1. Confirm task: "You want to add user authentication. Is this correct?"
   - User confirms

2. **Invoke progressive-disclosure (Phase 4.5):**

   ```javascript
   Skill({
     skill: 'progressive-disclosure',
     context: {
       taskDescription: "Add user authentication",
       projectContext: {...}
     }
   });
   ```

3. Progressive-disclosure returns:
   - **CRITICAL questions (3 asked of 5 budget):**
     1. "Should users be able to reset passwords via email?" → YES
     2. "Do we need role-based access control (RBAC)?" → YES (Admin, User, Guest)
     3. "Is single sign-on (SSO) required?" → NO

   - **Assumptions applied (with [ASSUMES:]):**
     - [ASSUMES: JWT tokens with 1-hour expiry]
     - [ASSUMES: bcrypt for password hashing, cost factor 12]
     - [ASSUMES: HTTPS required for all endpoints]

4. Identify scope: "This will touch the backend API, database, and frontend login page."
   - User confirms scope

5. Define success criteria based on clarifications and defaults

6. **Map to tokens:**

```javascript
{
  FEATURE_NAME: "User Authentication",
  VERSION: "1.0.0",
  AUTHOR: "Claude",
  DATE: "2026-01-28",
  STATUS: "draft",
  ACCEPTANCE_CRITERIA_1: "Users can sign up with email and password",
  ACCEPTANCE_CRITERIA_2: "Email verification required before login",
  ACCEPTANCE_CRITERIA_3: "Users can reset password via email link",
  ACCEPTANCE_CRITERIA_4: "Role-based access control working (Admin/User/Guest)",
  ASSUMPTIONS_MADE: "- JWT tokens with 1-hour expiry\n- bcrypt cost factor 12\n- HTTPS required",
  CLARIFICATIONS_ASKED: 3
}
```

7. **Invoke template-renderer:**

```javascript
Skill({
  skill: 'template-renderer',
  args: {
    templateName: 'specification-template',
    outputPath: '.claude/context/artifacts/specifications/user-authentication-spec.md',
    tokens: tokens,
  },
});
```

**Output:**

- Rendered specification at `.claude/context/artifacts/specifications/user-authentication-spec.md`
- All tokens resolved
- Assumptions clearly documented with [ASSUMES:] notation
- YAML frontmatter valid
- Ready for spec-critique review (user can challenge any assumption)

### Example 2: Bug Investigation

**Input:** "The page loads slowly"

**Process:**

1. Clarify: "Which page specifically? What do you consider slow?"
2. Context: "When did this start? Any recent changes?"
3. Metrics: "What load time would be acceptable?"

**Output:** Investigation requirements with specific pages, metrics, and success criteria.

## Troubleshooting

### Issue: User gives one-word answers

**Symptoms:** "Yes", "No", "That's fine" without detail.

**Solution:** Ask more specific questions. Provide options: "Would you prefer A, B, or C?"

### Issue: Scope keeps expanding

**Symptoms:** Every answer adds new features.

**Solution:** Document "Out of Scope" explicitly. Confirm: "Should we include this in this task or save for later?"

## Iron Laws

1. **NEVER** begin implementation before a validated specification exists for STANDARD+ complexity
2. **ALWAYS** capture non-functional requirements (performance, security, scalability) explicitly
3. **NEVER** accept vague success criteria — require measurable, testable numbers
4. **ALWAYS** document what is explicitly out of scope, not just what is in scope
5. **NEVER** hand off to planner without explicit user confirmation of requirements

## Anti-Patterns

| Anti-Pattern                        | Why It Fails                                           | Correct Approach                                                     |
| ----------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| Vague requirements ("make it fast") | Not measurable or testable                             | Specify exact metrics: "P95 response time <100ms"                    |
| Missing NFRs                        | Quality attributes forgotten until too late            | Always capture performance, security, scalability requirements       |
| No out-of-scope section             | Scope creep during implementation                      | Explicitly document what this task does NOT include                  |
| Skipping user confirmation          | Requirements misunderstood and implemented incorrectly | Confirm all requirements with the user before handoff                |
| No edge cases documented            | Error handling gaps discovered during QA               | Document empty input, bad data, timeout, and concurrent access cases |

## Memory Protocol

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
