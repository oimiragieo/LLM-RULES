---
name: skill-install
description: Install a skill bundle from the marketplace with HMAC-SHA256 signature verification and trust-score gate.
usage: pnpm skill:install <url-or-path> [--dry-run] [--force]
---

# skill-install

v3.2.0 Skill Marketplace installer.

## What it does

- Fetches skill bundle from URL or local path
- Verifies HMAC-SHA256 signature against `SKILL_MARKETPLACE_HMAC_KEY` env
- Computes trust score (0-100) via trust-scorer
- Refuses install if score < `SKILL_MARKETPLACE_MIN_TRUST` (default 50) unless `--force`
- Always refuses if signature invalid (regardless of --force)

## Flags

- `--dry-run` — preview without installing
- `--force` — override trust-score gate (signature check still mandatory)

## Env

- SKILL_MARKETPLACE_HMAC_KEY — shared HMAC secret (required)
- SKILL_MARKETPLACE_MIN_TRUST — trust threshold (default 50)
- SKILL_MARKETPLACE_REGISTRY_URL — future central registry

## Related

- `.claude/lib/marketplace/signer.cjs`
- `.claude/lib/marketplace/trust-scorer.cjs`
