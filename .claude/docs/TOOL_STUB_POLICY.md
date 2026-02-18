# Tool Stub Policy

Date: 2026-02-18  
Status: Active (PR16)

## Purpose

The repository currently includes many no-op tool wrappers used for scaffolding and compatibility. This policy prevents silent growth of undocumented stubs while remediation proceeds in chunked PRs.

## Policy Rules

1. A no-op tool stub is a tool file matching this signature:
   `process.stdout.write(JSON.stringify({ ok: true, tool: ... }) + "\n")`
2. No-op stubs are only allowed when explicitly listed in:
   `.claude/config/tool-stub-policy.json` under `allowlistedStubs`.
3. Any new no-op stub must fail validation until it is intentionally reviewed and allowlisted.
4. Removing or implementing a stub requires removing its path from the allowlist in the same PR.
5. This PR does not implement/remove stubs. It enforces policy + tracking only.

## Validator

- Command: `pnpm validate:tool-stubs`
- Script: `scripts/validation/validate-tool-stub-policy.cjs`
- CI wiring: included in `pnpm validate:full`

## Baseline Maintenance

- To intentionally refresh baseline:
  `node scripts/validation/validate-tool-stub-policy.cjs --write-baseline`
- Baseline updates must include a commit note explaining why.
