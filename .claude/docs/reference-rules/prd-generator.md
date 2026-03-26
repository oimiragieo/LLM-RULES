---
paths:
  - .claude/skills/prd-generator/**
---

# PRD Generator Rules

## Core Principles

- Problem-first before solution (evidence-backed hypothesis)
- MoSCoW prioritization to prevent scope creep (Must/Should/Could/Won't)
- Implementation Phases table for traceability
- Hypothesis-driven with measurable outcomes
- Decision log with alternatives considered

## Input Requirements

- Clear problem statement with evidence (data, user feedback, metrics)
- Measurable hypothesis (specific outcome criteria)
- User/stakeholder input for requirements
- Access to research/market context

## Output Standards

- PRD saved to `.claude/context/artifacts/specs/`
- Naming: `{feature-name}-prd-{YYYY-MM-DD}.md`
- Required sections: Problem Statement, Evidence, Key Hypothesis, Success Metrics, Core Capabilities (MoSCoW), Implementation Phases, Decisions Log, Users & Context, Risks, Open Questions
- Provenance header with agent, task ID, session date
- Implementation Phases table with dependencies mapped

## Workflow

1. **Gather Requirements**: Interactive (AskUserQuestion) or prompt-based. Use Progressive Disclosure for ambiguous features.
2. **Load Template**: Read `.claude/templates/prd-template.md`
3. **Fill Sections**: Problem → Evidence → Hypothesis → MoSCoW → Phases → Decisions
4. **Validate Completeness**: Check all required sections present, hypothesis measurable, MoSCoW has Must/Won't
5. **Write PRD**: Save with provenance header

## Anti-Patterns

- Jumping to solution without problem definition
- Vague success metrics ("make it better")
- Everything is "Must" priority
- Phases without dependency mapping
- Missing decision rationale (why not alternative X?)
- Letting PRD become stale (update as phases complete)

## Integration Points

- Uses `context-compressor` (progressive disclosure mode) for unclear requirements
- Feeds into `planner` via Implementation Phases table
- Developers read PRD for "why" context
- Updates phases table as work progresses
