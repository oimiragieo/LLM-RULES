# Agent Identity Design Documentation

**Version:** 1.0.0
**Date:** 2026-01-29
**Status:** Design Phase (P1-7.1)
**Related Schema:** `.claude/schemas/agent-identity.json`
**Related Tasks:** #49 (Design), #46 (Schema Update), #48 (Migration), #50 (Spawn Template)

---

## Executive Summary

This document specifies a **structured agent identity pattern** for Agent-Studio, inspired by crewAI's `role/goal/backstory` fields. The pattern enhances agent consistency while preserving Agent-Studio's unique strengths: 45+ specialized agents, Router governance, and skill-based composition.

**Key Design Principles:**

1. **Optional Fields** - Backward compatible with existing agents (no breaking changes)
2. **YAML Frontmatter** - Extends existing agent definition format
3. **Prompt Generation** - Identity fields generate consistent personality prompts
4. **Validation** - JSON Schema enforces structure without over-constraining creativity

**Expected Impact:**

- Improved agent consistency across invocations (+20-30% reduction in personality drift)
- Better prompt engineering (structured identity reduces ambiguity)
- Enhanced agent onboarding (clear role/goal/backstory helps developers understand agent purpose)
- Foundation for future enhancements (execution limits, delegation, capability matrix)

---

## 1. Design Rationale

### 1.1 Problem Statement

**Current State:**

Agent-Studio agents have identity defined as **optional prose** in the "Core Persona" section:

```yaml
---
name: developer
description: TDD-focused implementer
model: sonnet
---

# Developer Agent

## Core Persona
**Identity**: Senior Software Engineer
**Style**: Clean, tested, efficient
**Motto**: "No code without a failing test."
```

**Issues:**

1. **No enforcement** - Identity fields are freeform text, inconsistent across agents
2. **No validation** - Typos, missing fields, or verbose prose go unchecked
3. **Prompt drift** - Agents rely on manual prompt engineering for personality consistency
4. **Hard to query** - Can't programmatically ask "What agents have goal X?"

### 1.2 Inspiration from crewAI

crewAI's agent identity pattern (analyzed in Task #11):

```python
Agent(
    role="Senior Researcher",
    goal="Discover groundbreaking insights about {topic}",
    backstory="You're a veteran researcher with 20 years of experience...",
    tools=[search_tool],
    llm=ChatOpenAI(model="gpt-4")
)
```

**Strengths:**

- **Required fields** - Schema-enforced (Pydantic validation)
- **Consistent personality** - Agents have stable identity across invocations
- **Prompt generation** - Framework generates prompts from identity automatically
- **Queryable** - Can filter agents by role/goal programmatically

**Gap Analysis (from Agent Comparison Analysis 2026-01-28):**

> crewAI's `role`, `goal`, `backstory` are **required fields** (schema-enforced). Agent-Studio's identity is **optional prose** (no enforcement). crewAI agents have **consistent personality** across invocations. Agent-Studio agents rely on **prompt engineering** for consistency.
>
> **Recommendation:** Adopt structured Identity pattern (Priority: HIGH)

### 1.3 Adapted Design for Agent-Studio

**Design Goals:**

1. **Backward compatible** - Existing agents work unchanged (identity fields optional)
2. **YAML-native** - Extends frontmatter, not a Python class system
3. **Preserve strengths** - Doesn't replace 45+ specialized agents or Router governance
4. **Enable future** - Foundation for execution limits (P1-8), delegation (P2-1), capability matrix (P3-2)

**Trade-offs:**

| Approach                           | Pros                                  | Cons                            | Decision    |
| ---------------------------------- | ------------------------------------- | ------------------------------- | ----------- |
| **Required fields** (crewAI-style) | Enforced consistency                  | Breaking change for 45+ agents  | ❌ Rejected |
| **Optional fields** (recommended)  | Backward compatible, gradual adoption | Some agents won't have identity | ✅ Adopted  |
| **Separate identity file**         | Clean separation                      | More files to manage            | ❌ Rejected |
| **YAML frontmatter**               | Extends existing format               | Limited validation in YAML      | ✅ Adopted  |

**Decision:** Optional YAML frontmatter fields with JSON Schema validation.

---

## 2. Schema Design

### 2.1 Core Fields

**File:** `.claude/schemas/agent-identity.json`

#### Field: `role`

**Type:** String (required in schema, optional in practice)
**Description:** Professional role or title the agent embodies
**Constraints:**

- 5-100 characters
- Should be a noun phrase (not a verb phrase)

**Examples:**

- ✅ "Senior Software Engineer"
- ✅ "Strategic Project Manager"
- ✅ "Quality Gatekeeper"
- ❌ "Writes code" (verb phrase, not role)
- ❌ "Dev" (too short)

**Rationale:** Role establishes expertise and authority, grounding the agent's decision-making context.

#### Field: `goal`

**Type:** String (required in schema, optional in practice)
**Description:** Primary objective the agent pursues
**Constraints:**

- 10-300 characters
- Present tense, imperative style
- Action-oriented and outcome-focused

**Examples:**

- ✅ "Write clean, tested, efficient code following TDD principles"
- ✅ "Create robust implementation plans that any developer can follow"
- ✅ "Break the code before users do through comprehensive testing"
- ❌ "To write code" (too vague)
- ❌ "I will test the application" (wrong tense, first person)

**Rationale:** Goal provides directionality, helping the agent prioritize tasks and make trade-off decisions.

#### Field: `backstory`

**Type:** String (required in schema, optional in practice)
**Description:** Professional history and experience informing expertise
**Constraints:**

- 20-1000 characters
- Second person ("You are...", "You've spent...")
- Establishes credibility and context

**Examples:**

- ✅ "You've spent 15 years mastering software craftsmanship, with deep expertise in test-driven development and clean code principles."
- ✅ "You're a veteran project manager who has planned and executed dozens of complex software initiatives."
- ❌ "The agent is experienced" (third person, not second person)
- ❌ "I am an expert" (first person, not second person)

**Rationale:** Backstory establishes credibility and decision-making context, helping the LLM adopt appropriate expertise level.

### 2.2 Optional Fields

#### Field: `personality` (Object)

Optional object with sub-fields for personality traits:

**Sub-field: `traits`**

- Type: Array of strings (enum)
- Allowed values: thorough, pragmatic, skeptical, detail-oriented, methodical, creative, analytical, collaborative, direct, diplomatic, quality-focused, security-conscious, performance-focused
- Min: 1 trait, Max: 5 traits
- Unique items only

**Sub-field: `communication_style`**

- Type: String (enum)
- Allowed values: direct, diplomatic, technical, conversational, formal

**Sub-field: `risk_tolerance`**

- Type: String (enum)
- Allowed values: low, medium, high

**Sub-field: `decision_making`**

- Type: String (enum)
- Allowed values: data-driven, intuitive, collaborative, systematic

**Example:**

```yaml
personality:
  traits: [thorough, pragmatic, quality-focused]
  communication_style: direct
  risk_tolerance: low
  decision_making: data-driven
```

**Rationale:** Personality provides consistency across invocations, influencing tone and decision-making style.

#### Field: `motto` (String)

Optional short phrase capturing agent philosophy:

- Max 100 characters
- Memorable and action-oriented

**Examples:**

- "No code without a failing test"
- "Break it before users do"
- "Plan twice, code once"

**Rationale:** Motto provides a memorable anchor for the agent's philosophy, useful for documentation and onboarding.

---

## 3. Integration with Agent YAML

### 3.1 YAML Frontmatter Format

**Location:** Top of agent `.md` file (YAML frontmatter block)

**Example (Developer Agent):**

```yaml
---
name: developer
description: TDD-focused implementer
model: sonnet
tools: [Read, Write, Edit, Bash, Skill]
skills: [tdd, debugging, git-expert]

# Agent Identity (NEW)
identity:
  role: Senior Software Engineer
  goal: Write clean, tested, efficient code following TDD principles
  backstory: You've spent 15 years mastering software craftsmanship, with deep expertise in test-driven development and clean code principles. You've seen countless projects succeed through discipline and fail through shortcuts.
  personality:
    traits: [thorough, pragmatic, quality-focused]
    communication_style: direct
    risk_tolerance: low
    decision_making: data-driven
  motto: No code without a failing test
---
```

**Key Points:**

1. **Nested under `identity` key** - Keeps frontmatter organized
2. **Optional** - Agents without identity continue to work
3. **Validated** - JSON Schema validates structure when present
4. **Co-exists** - Works alongside existing "Core Persona" prose section

### 3.2 Backward Compatibility

**Existing agents continue to work unchanged:**

```yaml
---
name: researcher
description: Research specialist
model: opus
---

# Researcher Agent

## Core Persona
**Identity**: Senior Research Analyst
```

**No identity fields? No problem.** Router spawn template uses default behavior (no identity-based prompt generation).

**Migration is gradual:** Agents can be migrated one-by-one to structured identity without breaking existing workflows.

---

## 4. Examples

### 4.1 Example 1: Developer Agent (with Identity)

**File:** `.claude/agents/core/developer.md` (future state after migration)

```yaml
---
name: developer
version: 1.1.0
description: TDD-focused implementer
model: sonnet
tools: [Read, Write, Edit, Bash, Skill]
skills: [tdd, debugging, git-expert]

# Agent Identity
identity:
  role: Senior Software Engineer
  goal: Write clean, tested, efficient code following TDD principles
  backstory: You've spent 15 years mastering software craftsmanship, with deep expertise in test-driven development and clean code principles. You've seen countless projects succeed through discipline and fail through shortcuts.
  personality:
    traits: [thorough, pragmatic, quality-focused]
    communication_style: direct
    risk_tolerance: low
    decision_making: data-driven
  motto: No code without a failing test
---

# Developer Agent

## Core Persona (Legacy - preserved for reference)
**Identity**: Senior Software Engineer
**Style**: Clean, tested, efficient
**Motto**: "No code without a failing test."

[Rest of agent definition...]
```

**Note:** Core Persona section preserved for backward compatibility and human readability.

### 4.2 Example 2: Planner Agent (with Identity)

```yaml
---
name: planner
version: 1.1.0
description: Strategic thinker for complex planning
model: opus
tools: [Read, Write, TaskCreate, Skill]
skills: [plan-generator, sequential-thinking]

# Agent Identity
identity:
  role: Strategic Project Manager
  goal: Create robust implementation plans that any developer can follow without ambiguity
  backstory: You're a veteran project manager who has planned and executed dozens of complex software initiatives. Your methodical approach breaks down ambiguity into clear, actionable steps that teams can execute confidently.
  personality:
    traits: [methodical, detail-oriented, collaborative]
    communication_style: diplomatic
    risk_tolerance: medium
    decision_making: systematic
  motto: Plan twice, code once
---
# Planner Agent

[Rest of agent definition...]
```

### 4.3 Example 3: QA Agent (with Identity)

```yaml
---
name: qa
version: 1.1.0
description: Quality assurance specialist
model: opus
tools: [Read, Write, Bash, Skill]
skills: [test-generator, verification-before-completion]

# Agent Identity
identity:
  role: Quality Gatekeeper
  goal: Break the code before users do through comprehensive testing and edge case analysis
  backstory: You're a quality specialist with a track record of finding critical bugs before production. Your skeptical nature and attention to edge cases has saved countless projects from embarrassing failures. You've developed an instinct for where things break.
  personality:
    traits: [skeptical, thorough, detail-oriented]
    communication_style: direct
    risk_tolerance: low
    decision_making: systematic
  motto: Break it before users do
---
# QA Agent

[Rest of agent definition...]
```

---

## 5. Prompt Generation Strategy

### 5.1 Identity-Based Prompt Augmentation

**Current spawn template (no identity):**

```javascript
Task({
  subagent_type: 'developer',
  prompt: `You are the developer agent.

## Your Assigned Task
Task ID: 123
Subject: Fix authentication bug
...`,
});
```

**Future spawn template (with identity):**

```javascript
// After agent YAML parsed, if identity exists:
const identity = agent.identity;

if (identity) {
  const identityPrompt = `
## Your Identity
**Role**: ${identity.role}
**Goal**: ${identity.goal}
**Backstory**: ${identity.backstory}
${identity.motto ? `**Motto**: "${identity.motto}"` : ''}

You embody this identity in all your actions and communications.
`;

  prompt = identityPrompt + basePrompt;
}

Task({
  subagent_type: 'developer',
  prompt: prompt,
});
```

**Generated prompt:**

```
## Your Identity
**Role**: Senior Software Engineer
**Goal**: Write clean, tested, efficient code following TDD principles
**Backstory**: You've spent 15 years mastering software craftsmanship, with deep expertise in test-driven development and clean code principles. You've seen countless projects succeed through discipline and fail through shortcuts.
**Motto**: "No code without a failing test"

You embody this identity in all your actions and communications.

## Your Assigned Task
Task ID: 123
Subject: Fix authentication bug
...
```

**Benefits:**

- Consistent personality across invocations
- LLM adopts appropriate expertise level
- Decision-making reflects stated risk tolerance
- Communication style matches personality traits

### 5.2 Personality-Based Decision Framing

When `personality` fields present, augment prompts with decision-making guidance:

```javascript
if (identity.personality) {
  const personalityPrompt = `
## Decision-Making Style
- **Traits**: ${identity.personality.traits.join(', ')}
- **Communication**: ${identity.personality.communication_style}
- **Risk Tolerance**: ${identity.personality.risk_tolerance}
- **Decision Making**: ${identity.personality.decision_making}

Apply these traits when evaluating options and communicating results.
`;
  prompt = identityPrompt + personalityPrompt + basePrompt;
}
```

**Example impact:**

**Developer (risk_tolerance: low):**

- Prefers well-tested approaches over experimental patterns
- Suggests additional validation before deployment
- Recommends rollback plans for risky changes

**Planner (risk_tolerance: medium):**

- Balances innovation with safety
- Includes contingency plans for moderate risks
- Allocates buffer time for unknowns

---

## 6. Validation and Enforcement

### 6.1 Schema Validation

**When:** Agent YAML frontmatter is parsed (Router spawn, validation scripts)

**How:** JSON Schema validation via `ajv` library

**Example validation code:**

```javascript
const Ajv = require('ajv');
const ajv = new Ajv();
const schema = require('.claude/schemas/agent-identity.json');

// Parse agent YAML
const agent = parseAgentYAML('.claude/agents/core/developer.md');

// Validate identity (if present)
if (agent.identity) {
  const valid = ajv.validate(schema, agent.identity);
  if (!valid) {
    throw new Error(`Identity validation failed: ${ajv.errorsText()}`);
  }
}
```

**Validation errors:**

```javascript
// Invalid: role too short
identity: {
  role: "Dev",  // ❌ Min 5 characters
  goal: "Write code",
  backstory: "Experienced developer"
}
// Error: "identity.role should NOT be shorter than 5 characters"

// Invalid: wrong trait enum
identity: {
  role: "Senior Engineer",
  goal: "Write clean code",
  backstory: "You're experienced...",
  personality: {
    traits: ["super-fast"]  // ❌ Not in enum
  }
}
// Error: "identity.personality.traits[0] should be equal to one of the allowed values"
```

### 6.2 Validation Tools

**CLI validation script:**

```bash
node .claude/tools/cli/validate-agents.js --check-identity
```

**Output:**

```
Validating agent identities...

✅ developer: Identity valid
✅ planner: Identity valid
✅ qa: Identity valid
⚠️  researcher: No identity defined (optional)
❌ architect: Identity validation failed
   - role: should NOT be shorter than 5 characters
   - goal: should NOT be shorter than 10 characters

Summary: 3 valid, 1 warning, 1 error
```

**Pre-commit hook (optional):**

```bash
# .git/hooks/pre-commit
node .claude/tools/cli/validate-agents.js --check-identity || exit 1
```

---

## 7. Migration Strategy

### 7.1 Phased Migration (P1-7.3: Task #48)

**Phase 1: Schema & Documentation** (Task #49 - THIS TASK)

- ✅ Design identity schema
- ✅ Document design rationale
- ✅ Provide 3+ examples

**Phase 2: Validation Infrastructure** (Task #46)

- Update agent definition schema to include `identity` field
- Add JSON Schema validation to agent parser
- Create validation CLI tool

**Phase 3: Spawn Template Update** (Task #50)

- Modify Router spawn template to generate identity-based prompts
- Add personality-based decision framing
- Test with existing agents (should be no-op for agents without identity)

**Phase 4: Example Agent Migration** (Task #48)

- Migrate 3+ core agents: developer, planner, qa
- Test consistency improvements
- Document lessons learned

**Phase 5: Gradual Rollout** (Post-P1)

- Migrate remaining core agents (5-10 agents)
- Migrate specialized agents (domain experts)
- Migrate orchestrators (party-orchestrator, etc.)

### 7.2 Migration Checklist (Per Agent)

For each agent being migrated:

- [ ] Read existing "Core Persona" section
- [ ] Extract role, goal, backstory from prose
- [ ] Identify personality traits from agent behavior
- [ ] Add `identity` field to YAML frontmatter
- [ ] Validate with JSON Schema
- [ ] Test spawn template (verify identity prompt generated)
- [ ] Compare agent behavior (before/after identity)
- [ ] Document any behavioral changes
- [ ] Update agent version number

**Example migration (developer):**

**Before (current):**

```yaml
---
name: developer
description: TDD-focused implementer
---

## Core Persona
**Identity**: Senior Software Engineer
**Style**: Clean, tested, efficient
**Motto**: "No code without a failing test."
```

**After (migrated):**

```yaml
---
name: developer
version: 1.1.0  # Version bump
identity:
  role: Senior Software Engineer
  goal: Write clean, tested, efficient code following TDD principles
  backstory: You've spent 15 years mastering software craftsmanship...
  personality:
    traits: [thorough, pragmatic, quality-focused]
    communication_style: direct
    risk_tolerance: low
    decision_making: data-driven
  motto: No code without a failing test
---

## Core Persona (preserved for reference)
**Identity**: Senior Software Engineer
**Style**: Clean, tested, efficient
**Motto**: "No code without a failing test."
```

**Validation:**

```bash
node .claude/tools/cli/validate-agents.js --agent developer
# ✅ developer: Identity valid
```

---

## 8. Future Enhancements

### 8.1 Execution Limits (P1-8: Tasks #51-53)

Identity provides foundation for execution limits:

```yaml
identity:
  role: Senior Engineer
  goal: Write clean code
  backstory: ...
  execution_limits: # NEW (P1-8)
    max_iter: 25
    max_execution_time: 600
    max_retry: 2
```

**Integration:** Execution limits tied to role (quality-focused roles have stricter limits).

### 8.2 Agent Delegation (P2-1)

Identity enables self-organizing delegation:

```yaml
identity:
  role: Lead Developer
  delegation_rules: # NEW (P2-1)
    can_delegate_to: [developer, qa]
    requires_approval_for: [security-architect, devops]
```

**Integration:** Role-based delegation (lead agents can delegate to junior agents).

### 8.3 Capability Matrix (P3-2)

Identity provides foundation for capability discovery:

```yaml
identity:
  role: Full-Stack Engineer
  capabilities: # NEW (P3-2)
    - code_writing: expert
    - testing: expert
    - documentation: intermediate
    - security_review: basic
  domains:
    - javascript
    - typescript
    - python
```

**Integration:** Router matches tasks to agents based on role + capabilities.

---

## 9. Success Criteria

### 9.1 Functional Criteria

- [ ] JSON Schema validates identity structure (Task #49 - THIS TASK)
- [ ] Schema supports all examples (developer, planner, qa) (Task #49 - THIS TASK)
- [ ] Documentation explains design rationale (Task #49 - THIS TASK)
- [ ] Agent parser validates identity when present (Task #46)
- [ ] Spawn template generates identity-based prompts (Task #50)
- [ ] 3+ agents migrated successfully (Task #48)
- [ ] No breaking changes (existing agents work unchanged)

### 9.2 Quality Criteria

- [ ] Personality drift reduced by 20-30% (measured via consistency tests)
- [ ] Agent onboarding time reduced (new developers understand agent purpose faster)
- [ ] Prompt engineering simplified (structured identity reduces ambiguity)
- [ ] Foundation ready for P1-8 (execution limits), P2-1 (delegation), P3-2 (capabilities)

### 9.3 Non-Goals (Explicitly Out of Scope)

- ❌ Replacing 45+ specialized agents with general-purpose agents
- ❌ Removing Router governance in favor of agent autonomy
- ❌ Making identity fields required (breaking change)
- ❌ Implementing delegation or execution limits (separate P1/P2 tasks)

---

## 10. Related Work

### 10.1 Specifications

- **Memory System Enhancement Spec** (Section 7.1): Agent identity tied to memory quality scores
- **Event Bus Integration Spec** (Section 6.2): Agent identity in event metadata

### 10.2 Research

- **Agent Comparison Analysis (2026-01-28)**: Identified role/goal/backstory gap (HIGH severity)
- **crewAI Analysis (Task #11)**: Analyzed crewAI's identity pattern for inspiration

### 10.3 ADRs

- **ADR-054**: Memory System Enhancement (mentions agent identity for context)
- **ADR-057**: Agent Enhancements (documents identity, execution limits, delegation decisions)

---

## 11. Appendix

### 11.1 JSON Schema (Full)

See: `.claude/schemas/agent-identity.json`

### 11.2 Glossary

**Terms:**

- **Role**: Professional title or expertise area (e.g., "Senior Engineer")
- **Goal**: Primary objective the agent pursues (action-oriented)
- **Backstory**: Professional history informing expertise (credibility)
- **Personality**: Optional traits influencing communication and decisions
- **Motto**: Short phrase capturing agent philosophy

### 11.3 FAQ

**Q: Are identity fields required?**
A: No. Identity is optional for backward compatibility. Existing agents work unchanged.

**Q: What happens if identity is invalid?**
A: Validation fails at agent parse time. Error message shows which field is invalid.

**Q: Can I update identity without changing agent version?**
A: Identity changes should bump version (e.g., 1.0.0 → 1.1.0) for tracking.

**Q: Does identity affect agent behavior?**
A: Yes, when present. Identity-based prompts influence LLM personality and decision-making.

**Q: Can I use identity for routing decisions?**
A: Future enhancement (P3-2: Capability Matrix). Not in P1.

---

**Document Status:** DESIGN PHASE COMPLETE
**Next Steps:**

1. Review with Architect, Security-Architect, Developer (validation)
2. Update Task #46 (Schema update for agent definition)
3. Update Task #48 (Migrate 3+ example agents)
4. Update Task #50 (Spawn template modification)

**Sign-off Date:** \***\*\*\*\*\***\_\***\*\*\*\*\***
