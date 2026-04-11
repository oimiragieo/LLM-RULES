---
# Agent: developer | Task: #5 | Session: 2026-03-05
verified: true
lastVerifiedAt: 2026-03-05T00:00:00.000Z
name: doc-coauthoring
description: Collaborative document creation via a structured three-stage workflow. Use for writing specs, PRDs, design docs, proposals, RFCs, and any long-form document where quality and clarity matter. Brainstorms 5-20 options per section, builds iteratively, and tests with reader sub-agents.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Glob, Grep, Task]
agents: [technical-writer, developer]
category: writing
tags: [documentation, writing, collaboration, prd, spec, proposal, rfc, design-doc]
aliases: [collaborative-writing, doc-writing, document-creation]
best_practices:
  - Ask clarifying questions before writing a single word
  - Brainstorm 5-20 options per section then curate the best
  - Use str_replace for targeted edits — never reprint entire documents
  - Test with reader sub-agents before declaring complete
  - Scaffold the full document early with placeholders
  - Preserve authorial voice and preferences across sections
error_handling: strict
streaming: supported
---

# Doc Co-Authoring Workflow

> "Thoroughness here prevents confusion when actual stakeholders read the document."

## Overview

This skill guides collaborative document creation through three structured stages: context gathering, iterative section refinement, and reader testing. The goal is to transfer the author's full intent into a document that works for readers who lack that context.

## When to Invoke

Triggers for this skill:

- "Write a doc" / "Draft a proposal" / "Create a spec"
- Product Requirements Document (PRD)
- Design document / Technical spec
- RFC (Request for Comments)
- Project proposal / Business case
- Meeting agenda or summary doc
- Onboarding guide or runbook

**Do not use** for: short single-purpose outputs (emails, commit messages, code comments). Those are better handled inline.

## Three-Stage Workflow

### Stage 1: Context Gathering

Close knowledge gaps before writing anything.

**Ask clarifying questions:**

- What type of document is this? (PRD, design doc, proposal, RFC, runbook...)
- Who is the audience? (engineers, executives, customers, mixed...)
- What decisions should readers be able to make after reading this?
- What are the hard constraints? (length, format, deadline, approval process)
- What prior context does the author have that readers won't?

**Accept info-dumps:**
If the user provides a brain dump, meeting notes, or links to existing docs — absorb everything. Extract the key requirements, constraints, and decisions already made.

**Meta-context check:**

- Are there existing templates or style guides to follow?
- Is there a prior version of this document?
- Are there related documents readers will cross-reference?

**Stage 1 output:** A clear scope statement: "We are writing a [type] for [audience] that enables [decision/action]. The document is [scope]."

### Stage 2: Section-by-Section Refinement

Build the document iteratively, one section at a time.

**Scaffold first:**
Create a full document outline with placeholder sections immediately. This gives the author a map of where we're going and lets them see the overall structure before committing to any section.

```
# [Document Title]

## Overview
[placeholder — will cover: purpose, scope, key decisions]

## Background
[placeholder — will cover: context, motivation, prior art]

## Proposal
[placeholder — will cover: what we're building, why this approach]

## Alternatives Considered
[placeholder — will cover: what we ruled out and why]

## Implementation Plan
[placeholder — will cover: phases, timeline, dependencies]

## Open Questions
[placeholder — will cover: unresolved decisions needing input]
```

**Per-section workflow:**

1. **Brainstorm**: Generate 5-20 options for how to structure/frame this section
   - Present options as numbered choices with brief descriptions
   - Include at least one "safe/conventional" option and one "bold/direct" option
   - Let the author select or combine options

2. **Draft**: Write the selected approach fully

3. **Refine**: Make targeted edits based on feedback
   - Use `str_replace` to replace specific phrases or paragraphs
   - Never reprint the entire document for a small change
   - Preserve the author's voice in suggested edits

4. **Confirm**: Get explicit "this section is done" before moving to the next

**Option generation example (for an "Alternatives Considered" section):**

```
Here are 5 options for structuring "Alternatives Considered":

1. **Elimination table** — Each alternative as a row, columns for pros/cons/why-rejected. Fast to skim.
2. **Narrative paragraphs** — One paragraph per alternative with story arc of why we considered and rejected it. Good for complex tradeoffs.
3. **Decision log format** — Date + decision + rationale per item. Good when alternatives were explored over time.
4. **Comparative matrix** — All options including chosen approach on axes like complexity/risk/value. Visual.
5. **One-liner summary** — Brief acknowledgment that we considered X, Y, Z, with a single sentence each. Good when alternatives are obvious.

Which resonates, or should I blend elements?
```

### Stage 3: Reader Testing

Test whether the document works for readers who lack the author's context.

**Why this matters:** Authors know too much. Blind spots are invisible to them. A reader sub-agent with no conversation context surfaces exactly what real readers will struggle with.

**Spawn a reader sub-agent** with ONLY the document content (no prior conversation context):

```
You are reading this document for the first time with no prior context.

Read this document: [full document text]

Answer these questions:
1. What is this document trying to accomplish? (Should match author intent)
2. What questions does it leave unanswered that a reader would need answered to act?
3. Are there any sections where the reasoning is unclear or jumps without explanation?
4. What would a skeptical reader's strongest objection be?
5. Is there anything that only makes sense if you already know [the thing the author knows]?
```

**Integrate reader feedback:**

- For each gap the reader found: decide whether to address in the doc or treat as out-of-scope
- Targeted edits only — don't restructure unless essential
- Re-test reader if major sections were changed

**Completion criteria:**

- [ ] All placeholder sections filled
- [ ] Reader sub-agent can answer "what is this for?" correctly
- [ ] No critical unanswered questions identified by reader
- [ ] Author confirms document matches their intent
- [ ] Document is standalone — no external context required to understand

## Editing Mechanics

### Use `str_replace` for precision

When making edits, specify the exact text to replace:

```
REPLACE:
"The system will be fast."

WITH:
"The system targets p99 latency < 100ms under 1000 concurrent users."
```

Never reprint the entire document to show one changed sentence. This respects the author's time and makes it easy to see exactly what changed.

### Preserve authorial voice

If the author writes in a particular style (casual/formal, first-person/third-person, active/passive), match it in all additions. Note their stylistic choices explicitly:

- "I notice you're using first-person plural ('we'). I'll maintain that."
- "Your examples are concrete and code-focused. I'll keep examples technical."

## Document Type Templates

### PRD (Product Requirements Document)

Sections: Executive Summary, Problem Statement, Goals & Non-Goals, User Stories, Requirements, Success Metrics, Timeline, Open Questions

### Technical Design Doc

Sections: Summary, Background, Design, Implementation Details, Testing Plan, Rollout Plan, Alternatives Considered, Open Questions

### RFC (Request for Comments)

Sections: Abstract, Motivation, Detailed Design, Drawbacks, Alternatives, Unresolved Questions

### Project Proposal

Sections: Executive Summary, Problem, Proposed Solution, Business Case, Risks, Timeline, Resources Required, Next Steps

## Memory Protocol

Before starting a co-authoring session:

```bash
cat .claude/context/memory/learnings.md | grep -i "doc\|writing\|spec\|prd"
```

After completing a document, record patterns that worked:

- Effective section structures → `.claude/context/memory/learnings.md`
- Document types with special requirements → `.claude/context/memory/issues.md`

## Related Skills

- `technical-writer` agent — Documentation structure and style
- `brainstorming` — Extended brainstorming sessions for complex sections
- `spec-gathering` — Requirements gathering before doc creation
- `prd-generator` — Structured PRD generation workflow
