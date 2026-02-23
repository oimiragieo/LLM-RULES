---
name: creation-feasibility-gate
description: Validate whether a proposed new artifact is feasible in the current stack before creator workflows run.
version: 1.1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Glob, Grep, Skill]
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: 2026-02-22T00:00:00.000Z
---

# Creation Feasibility Gate

## Overview

Run a fast preflight feasibility check before creating a new agent/skill/workflow/hook/template/schema. This prevents low-value or impossible creator runs.

## When to Use

- Phase 0.5 dynamic creation flow
- User asks for net-new capability
- Reflection/evolution recommends artifact creation

## Iron Laws

1. **NEVER** create artifacts inside this skill — return PASS/WARN/BLOCK with evidence only; all actual creation happens in the appropriate creator skill downstream.
2. **ALWAYS** run the existence/duplication check first — never proceed toward PASS if a functionally identical artifact already exists in any catalog or registry.
3. **ALWAYS** include concrete file-level evidence for every decision — a bare PASS or BLOCK without referencing specific paths or catalog entries is a spec violation.
4. **NEVER** let WARN silently become PASS — every WARN must list exact caveats that the calling agent must acknowledge before creation proceeds.
5. **ALWAYS** resolve BLOCK status with actionable next steps and recommended target agents — a BLOCK without remediation tasks is an incomplete gate decision.

## Anti-Patterns

| Anti-Pattern                                         | Why It Fails                                                                                      | Correct Approach                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Returning PASS without running the duplication check | Creates duplicate artifacts that split agent traffic and inflate catalogs                         | Always query catalog + registry + filesystem before PASS                 |
| Returning BLOCK without remediation tasks            | Calling agent stalls with no path forward                                                         | Include `nextActions` with specific agents/skills to unblock             |
| Skipping the security/creator boundary check         | Creator paths may be blocked by governance hooks; silently bypassing them causes runtime failures | Always verify creator skill chain is reachable before PASS               |
| Treating WARN as informational only                  | WARN caveats are not surfaced to the user; creation proceeds with unresolved risks                | WARN must be acknowledged explicitly by the caller in its task metadata  |
| Running creation steps inside the gate skill         | Violates separation of concerns; gate outputs can't be validated independently                    | Gate outputs only the decision JSON; delegate creation to creator skills |

## Workflow

### Step 1: Resolve Target

- Identify proposed artifact type and name
- Identify expected runtime/tool dependencies
- Identify expected owner agents

### Step 2: Preflight Checks

Run these checks with concrete evidence:

1. **Existence/duplication check**
   - Catalogs + registry + artifact paths
2. **Stack compatibility check**
   - Required tooling/runtime present in current project conventions
3. **Integration readiness check**
   - Can it be routed/discovered/assigned after creation?
4. **Security/creator boundary check**
   - Ensure creator path and governance can be satisfied

### Step 3: Decision

Return one status:

- `PASS`: creation is feasible now
- `WARN`: feasible with clear caveats
- `BLOCK`: not feasible; must resolve blockers first

Use this output shape:

```json
{
  "status": "PASS|WARN|BLOCK",
  "artifactType": "agent|skill|workflow|hook|template|schema",
  "artifactName": "example-name",
  "evidence": ["..."],
  "blockers": [],
  "nextActions": ["..."]
}
```

## Output Protocol

If `BLOCK`, include concrete remediation tasks and recommended target agents.
If `PASS` or `WARN`, include exact creator skill chain to run next.

## Memory Protocol

Record feasibility patterns and recurring blockers to `.claude/context/memory/learnings.md`.
