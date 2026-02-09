# Advanced Elicitation

Use when you want to improve response quality through meta-cognitive reasoning. Applies 15+ reasoning methods to reconsider and refine initial outputs.

## When to Use

**Use when:**

- Making important decisions (architecture, security, major features)
- Solving complex problems (multiple stakeholders, unclear requirements)
- Producing critical outputs (specs, plans, designs)
- Quality matters more than speed

**Don't use when:**

- Simple queries ("What is X?")
- Routine tasks (formatting, simple refactoring)
- Time-sensitive (emergency fixes)
- Budget-constrained (2x LLM cost)

## Available Methods

| Method                 | Use Case                                   |
| ---------------------- | ------------------------------------------ |
| **First Principles**   | Complex system design, architecture        |
| **Pre-Mortem**         | Planning major changes, risk mitigation    |
| **Socratic**           | Requirements analysis, specification       |
| **Red Team/Blue Team** | Security reviews, adversarial testing      |
| **Inversion**          | Risk identification, avoiding pitfalls     |
| **Second-Order**       | Strategic decisions, long-term planning    |
| **SWOT**               | Strategic planning, competitive analysis   |
| **Opportunity Cost**   | Prioritization, resource allocation        |
| **Analogical**         | Innovation, learning from history          |
| **Constraint**         | Innovation, breaking assumptions           |
| **FMEA**               | Engineering design, safety-critical        |
| **Bias Check**         | Decision-making, self-critique             |
| **Base Rate**          | Estimation, reality-checking optimism      |
| **Steelmanning**       | Proposal review, intellectual honesty      |
| **Time Horizon Shift** | Long-term planning, trade-off analysis     |

## Usage

```javascript
// Single method (quick)
Skill({ skill: 'advanced-elicitation', args: 'first-principles' });

// Multiple methods (thorough)
Skill({ skill: 'advanced-elicitation', args: 'first-principles,pre-mortem,red-team-blue-team' });

// Auto-select (recommended)
Skill({ skill: 'advanced-elicitation', args: 'auto' });
```

## Cost Control

- **Opt-in only**: Never applied automatically
- **Budget**: 2x LLM cost vs regular responses
- **Budget limit**: Configurable via ELICITATION_BUDGET_LIMIT
- **Cost tracking**: Integrates with cost-tracking hook

## Security Controls

- **SEC-AE-001**: Max 5 methods per invocation
- **SEC-AE-002**: Cost budget enforcement
- **SEC-AE-003**: Max 10 elicitations per session (rate limiting)

## Related Skills

- `spec-critique` - Specification validation (can invoke elicitation)
- `security-architect` - Security reviews (can use elicitation methods)
- `verification-before-completion` - Pre-completion checks

## Related References

- `.claude/skills/advanced-elicitation/SKILL.md` - Complete method catalog
- `ADR-053` - Advanced elicitation cost control
