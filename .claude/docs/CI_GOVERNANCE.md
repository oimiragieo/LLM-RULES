# CI Governance

## Status Checks Source of Truth

- Required branch protection checks are defined in `.claude/config/required-status-checks.json`.
- `.github/workflows/branch-protection-audit.yml` reads this file at runtime and validates branch rules against it.

## Validation Commands

- Local governance gate: `pnpm validate:status-check-governance`
- Agent template contract gate: `pnpm validate:agent-template-contract`
- Full package gate: `pnpm validate:full`
- One-time fleet backfill (manual): `pnpm agents:contract:backfill`

## Update Procedure

1. Edit `.claude/config/required-status-checks.json`.
2. Run `pnpm validate:status-check-governance`.
3. Run `pnpm skills:ecosystem:gate`.
4. Run `pnpm lint:fix` and `pnpm format`.

## CI Enforcement

- `.github/workflows/creator-ecosystem-validate.yml` runs `pnpm validate:status-check-governance` before package validation.
- Workflow tests verify config loading and CI wiring.
