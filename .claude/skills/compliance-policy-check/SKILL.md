---
name: compliance-policy-check
description: Validate planned changes against local framework rules and policy guardrails before implementation or creation.
version: 1.1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Glob, Grep, Skill]
agents: [planner, technical-program-manager, reflection-agent, evolution-orchestrator]
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: 2026-02-22T00:00:00.000Z
---

# Compliance Policy Check

## Overview

Evaluate a design/plan against framework policy and rule constraints before execution. Use this for regulated or high-risk changes.

## When to Use

- Before creator workflows for new artifacts
- Before HIGH/EPIC implementation phases
- During reflection when repeated policy violations are observed

## Iron Laws

1. **NEVER execute or modify code during compliance checks** — this skill assesses policy alignment only; any implementation must happen separately after compliance is confirmed.
2. **ALWAYS run compliance check before HIGH/EPIC implementation** — high-risk changes that bypass compliance checks create undetected policy drift that compounds over time into systemic violations.
3. **ALWAYS report findings with specific remediation tasks and owning agent** — vague "policy violation" reports without actionable remediation steps don't produce fixes; every FAIL and CONDITIONAL must include a concrete task.
4. **NEVER report PASS on partial compliance** — a plan that satisfies 80% of policies is a CONDITIONAL, not a PASS; partial compliance masks the remaining violations and gives false confidence.
5. **ALWAYS recheck after remediation, not just once** — a single compliance check before implementation is insufficient; verify again after major changes to confirm remediations are complete.

## Workflow

### Step 1: Gather Policy Context

- Read relevant files in `.claude/rules/`
- Read applicable workflow/agent constraints
- Read enforcement hook docs if needed

### Step 2: Evaluate Proposed Change

Assess against:

1. Creator guard and artifact lifecycle rules
2. Routing and specialist-first requirements
3. Security and quality gate requirements
4. Memory/search/token-saver policy expectations

### Step 3: Produce Decision

Return one policy decision:

- `PASS`: policy-aligned
- `CONDITIONAL`: allowed with required mitigations
- `FAIL`: not policy-compliant

Use this output shape:

```json
{
  "decision": "PASS|CONDITIONAL|FAIL",
  "policyFindings": ["..."],
  "requiredMitigations": [],
  "evidencePaths": ["..."],
  "recommendedNextStep": "..."
}
```

## Output Protocol

For `CONDITIONAL` and `FAIL`, include precise remediation tasks and ownership (agent type).

## Anti-Patterns

| Anti-Pattern                                | Why It Fails                                        | Correct Approach                                                |
| ------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| Implementing code during compliance check   | Conflates assessment with implementation            | Assess only; implementation happens separately after PASS       |
| Skipping compliance for "small" changes     | Small changes introduce policy violations silently  | Run compliance check proportionally for all HIGH/EPIC work      |
| Reporting PASS on partial compliance        | Masks unresolved violations; gives false confidence | Report CONDITIONAL with specific remediation required           |
| Vague violation reports without remediation | Violations aren't fixed without clear next steps    | Include agent, task, and target file for every FAIL/CONDITIONAL |
| Only checking once before implementation    | Post-change compliance drift goes undetected        | Recheck compliance after major implementation changes           |

## Memory Protocol

Record recurring policy drift patterns in `.claude/context/memory/issues.md` and stabilized controls in `.claude/context/memory/decisions.md`.
