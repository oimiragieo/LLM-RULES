# Archived Tests Triage

Status: active triage baseline (PR14)

## Baseline

- Current archived test files (`*.archived`): `114`
- Enforcement: `scripts/validation/validate-archived-tests.mjs`
- CI gate: `pnpm validate:full` includes archived-test validation.

## Policy

- Do not add new `*.archived` files.
- When touching an archived area, prefer one of:
  1. Restore test to runnable `.test.cjs`/`.test.mjs`
  2. Delete obsolete archived test if feature is removed
  3. Keep archived only with a short rationale in commit/PR notes

## Next Reduction Batches

1. `tests/hooks/*.archived` high-value runtime guards
2. `tests/lib/memory/*.archived` memory subsystem history
3. `tests/integration/*.archived` cross-feature regressions

