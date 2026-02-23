---
name: writing
version: 1.0.0
status: deprecated-alias
canonical: writing-skills
verified: true
lastVerifiedAt: "2026-02-22"
---

# writing

> **DEPRECATED ALIAS** — This skill name is deprecated. Use `writing-skills` instead.
>
> `Skill({ skill: "writing-skills" })` is the canonical invocation.

This entry exists so that agents referencing `writing` do not fail with a missing-skill error.
All execution is delegated to the `writing-skills` skill.

## Redirect

```javascript
// Preferred — use the canonical skill name
Skill({ skill: "writing-skills" });

// Legacy references to writing are automatically resolved here
```

## What This Skill Does

See `.claude/skills/writing-skills/SKILL.md` for the full skill specification.

`writing-skills` covers:
- TDD applied to documentation (create → verify → refine cycle)
- Structured doc generation from code and requirements
- Technical writing style and clarity patterns
- README, API docs, changelog, and guide templates

## Memory Protocol

Read `.claude/context/memory/learnings.md` before starting.
Write any documentation discoveries to `.claude/context/memory/learnings.md`.
