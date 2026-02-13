---
name: chaos-testing-workflow
description: Safety-first chaos engineering workflow for controlled resilience experiments.
triggers:
  - resilience validation
  - failure-injection testing
  - pre-production hardening
agents:
  - chaos-engineer
---

# Chaos Testing Workflow

## Safety Gate (Mandatory)

- Stakeholder approval recorded
- Rollback plan tested
- Monitoring dashboards and alerts active
- Blast radius defined and minimal

## Phase 1: Hypothesis Definition

1. Define steady-state metrics and thresholds.
2. Define rollback triggers stricter than degradation thresholds.
3. Define expected system behavior under injected fault.

## Phase 2: Experiment Design

1. Choose failure type (latency, packet loss, dependency outage, resource pressure).
2. Start with lowest blast-radius environment.
3. Time-box experiment and set automatic abort conditions.

## Phase 3: Controlled Execution

1. Execute failure injection.
2. Monitor availability, latency, error rate, and business impact.
3. Abort immediately on hard-stop conditions.

## Phase 4: Analysis and Actions

1. Compare outcomes against hypothesis.
2. Document resilience gaps and root causes.
3. Create remediation backlog items and owners.

## Phase 5: Verification Loop

1. Implement resilience improvements.
2. Re-run experiment to validate fixes.
3. Promote to wider scope only after repeatable success.

## Outputs

- Experiment report: `.claude/context/reports/chaos/<name>-<date>.md`
- Artifacts: `.claude/context/artifacts/chaos/`
- Action plan with rollback and verification evidence
