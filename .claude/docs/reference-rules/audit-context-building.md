# Audit Context Building

For security audits and deep code review, build context before making claims.

## Before Writing Findings

- Read every file in scope line-by-line — do not skim
- Document invariants and assumptions per function block
- Apply First Principles: why does this code exist? What does it assume?
- Apply 5 Whys before concluding root cause
- Apply 5 Hows to validate each finding is genuinely exploitable
- Map cross-function call flows before asserting data-flow vulnerabilities

## Anti-Patterns (NEVER)

- Never report a finding based on a single grep match without reading context
- Never assume a variable is tainted without tracing it to its source
- Never claim "no validation" without checking callers and type system

## When to invoke

`Skill({ skill: 'audit-context-building' })` — before any security audit or deep code review
