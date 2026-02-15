# skill-updater Implementation Template

## Objective

- Target skill: `<skill-name>`
- Trigger: `<manual|reflection|evolve>`
- Problem statement: `<stale guidance / failures / missing coverage>`

## Research Notes

- Exa sources: `<links>`
- arXiv/canonical source: `<links>`
- Internal parity checks: `<pnpm search/ripgrep/semantic>`

## Gap Checklist Results

- [ ] SKILL.md logic current and trigger-safe
- [ ] scripts/main.cjs contract updated
- [ ] schemas updated
- [ ] hooks updated
- [ ] command surfaces updated
- [ ] workflow doc updated
- [ ] catalog/CLAUDE/agents wired

## TDD Plan

### RED

- `<failing tests>`

### GREEN

- `<minimal code/doc changes>`

### REFACTOR

- `<wording/structure tightening>`

### VERIFY

- `node .claude/tools/cli/validate-integration.cjs .claude/skills/<skill-name>/SKILL.md`
- `node .claude/tools/cli/generate-skill-index.cjs`
- `node .claude/tools/cli/generate-agent-registry.cjs` (if needed)
- `<targeted tests>`

## Memory Writes

- learnings: `<entry>`
- decisions: `<entry>`
- issues: `<entry>`
