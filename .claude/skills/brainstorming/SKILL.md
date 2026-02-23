---
name: brainstorming
description: Socratic design refinement before implementation — challenges assumptions, surfaces alternatives, identifies risks before code is written
version: 1.1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Bash]
agents: [developer, planner, architect]
category: 'Planning & Architecture'
tags: [brainstorming, design, planning, ideation, socratic]

verified: true
lastVerifiedAt: 2026-02-22T08:50:27.367Z
best_practices:
  - Ask one question at a time
  - Prefer multiple choice over open-ended
  - Enforce YAGNI
  - Explore 2-3 alternative approaches
error_handling: graceful
streaming: supported
---

# Brainstorming Ideas Into Designs

## Overview

Help turn ideas into fully formed designs and specs through natural collaborative dialogue.

Start by understanding the current project context, then ask questions one at a time to refine the idea. Once you understand what you're building, present the design in small sections (200-300 words), checking after each section whether it looks right so far.

## The Process

**Understanding the idea:**

- Check out the current project state first (files, docs, recent commits)
- Ask questions one at a time to refine the idea
- Prefer multiple choice questions when possible, but open-ended is fine too
- Only one question per message - if a topic needs more exploration, break it into multiple questions
- Focus on understanding: purpose, constraints, success criteria

**Exploring approaches:**

- Propose 2-3 different approaches with trade-offs
- Present options conversationally with your recommendation and reasoning
- Lead with your recommended option and explain why

**Presenting the design:**

- Once you believe you understand what you're building, present the design
- Break it into sections of 200-300 words
- Ask after each section whether it looks right so far
- Cover: architecture, components, data flow, error handling, testing
- Be ready to go back and clarify if something doesn't make sense

## After the Design

**Documentation:**

- Write the validated design to `docs/plans/YYYY-MM-DD-<topic>-design.md`
- Use context-compressor skill if available for efficient documentation
- Commit the design document to git

**Implementation (if continuing):**

- Ask: "Ready to set up for implementation?"
- Use writing-plans skill to create detailed implementation plan

## Key Principles

- **One question at a time** - Don't overwhelm with multiple questions
- **Multiple choice preferred** - Easier to answer than open-ended when possible
- **YAGNI ruthlessly** - Remove unnecessary features from all designs
- **Explore alternatives** - Always propose 2-3 approaches before settling
- **Incremental validation** - Present design in sections, validate each
- **Be flexible** - Go back and clarify when something doesn't make sense

## Iron Laws

1. **NEVER propose a single solution** — always surface 2–3 distinct approaches with trade-offs; a single solution forecloses exploration and anchors the user prematurely.
2. **ALWAYS apply YAGNI (You Ain't Gonna Need It)** — challenge every feature or complexity not directly required by the stated problem; unneeded features become permanent maintenance debt.
3. **NEVER ask multiple questions in one response** — one focused question at a time maintains dialogue flow; multiple questions cause partial answers and leave the most important question unanswered.
4. **ALWAYS prefer multiple-choice over open-ended questions** — specific options reduce cognitive load; open-ended questions require the user to invent answers rather than evaluate them.
5. **NEVER proceed to implementation details until design decisions are confirmed** — premature implementation locks in unvalidated assumptions; confirm the "what" and "why" before the "how".

## Anti-Patterns

| Anti-Pattern                            | Why It Fails                                       | Correct Approach                                        |
| --------------------------------------- | -------------------------------------------------- | ------------------------------------------------------- |
| Proposing only one solution             | Anchors user; forecloses better alternatives       | Always offer 2-3 approaches with explicit trade-offs    |
| Accepting first requirement as complete | First articulation rarely captures all constraints | Ask at least one clarifying question about scope        |
| Asking 3+ questions at once             | User answers the easy ones; skips the hard ones    | One question per response; wait for answer              |
| Jumping to implementation               | Design flaws found late are expensive to fix       | Confirm design decisions before writing code            |
| Skipping YAGNI challenge                | Unneeded features accumulate as tech debt          | Explicitly challenge each feature not strictly required |

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
