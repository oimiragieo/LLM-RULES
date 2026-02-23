---
name: testing-expert
description: Deprecated alias for tdd skill
version: 1.0.0
status: deprecated-alias
canonical: tdd
tools: []
verified: true
lastVerifiedAt: '2026-02-22'
---

# testing-expert

> **DEPRECATED ALIAS** — This skill name is deprecated. Use `tdd` instead.
>
> `Skill({ skill: "tdd" })` is the canonical invocation.

This entry exists so that agents referencing `testing-expert` do not fail with a missing-skill error.
All execution is delegated to the `tdd` skill.

## Redirect

```javascript
// Preferred — use the canonical skill name
Skill({ skill: 'tdd' });

// Legacy references to testing-expert are automatically resolved here
```

## What This Skill Does

See `.claude/skills/tdd/SKILL.md` for the full skill specification.

`tdd` covers:

- Canon Test-Driven Development (Red-Green-Refactor)
- Unit, integration, and e2e test patterns
- Test fixture design and mock strategies
- Coverage measurement and quality gates
- AI-agent TDD workflows

## Memory Protocol

Read `.claude/context/memory/learnings.md` before starting.
Write any testing discoveries to `.claude/context/memory/learnings.md`.
