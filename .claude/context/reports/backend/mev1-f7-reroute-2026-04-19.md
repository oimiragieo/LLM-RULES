<!-- Agent: general-purpose | Task: epic-mev1-phase-0.5-2026-04-19 | Session: 2026-04-19 -->

# MEv1 M-F7 — F7 Effector Reroute Audit

**Date:** 2026-04-19
**Scope:** `worker-features-dispatcher.cjs` skill resolution paths post-F7 archive
**ADR:** decisions.md — F7 skill-auto-creator archived (2026-04-19)
**Verdict:** REROUTE COMPLETE — proposer-only pattern in effect

## 1. Background

ADR 2026-04-19 archived the F7 skill auto-creator effector for violating
GATE 4 (direct SKILL.md writes bypass `unified-creator-guard`). The roadmap
mandates a "proposer-only refactor routing through skill-creator as effector."
The mission engine's worker dispatcher previously did fs.existsSync probes on
`path.join(skillsPath, feature.skillName, 'SKILL.md')` and, when missing,
returned a hard `skill_not_found` error that left no recovery path.

## 2. Callsite Audit (post-Slice 1 / B3)

| Callsite | Behavior (before) | Behavior (after) |
| --- | --- | --- |
| `dispatchFeature` validateSkills block (L169-193) | Direct `path.join` + `fs.existsSync` probe; returned `skill_not_found` on miss | Routes through `resolveSkillViaCreator(skillName, {cwd})`; returns `skill_proposed` carrying a `proposerRequest` payload addressed to `skill-creator` |
| Direct SKILL.md path construction without sanitization | Yes — `path.join(sp, feature.skillName, 'SKILL.md')` | Removed; replaced with `path.basename(skillName)`-wrapped candidates inside `resolveSkillViaCreator` |
| Defense-in-depth | Single layer (existsSync) | Two layers: B3 (regex + allowlist pre-enqueue) + M-F7 (`path.basename` + proposer pattern) |

**Zero direct callsites of `skill-auto-creator` remain in `worker-features-dispatcher.cjs`** — verified by `grep -n skill-auto-creator` (test enforces this invariant).

## 3. Proposer Request Shape

When `validateSkills: true` and the resolved skill is missing, the dispatcher
returns:

```json
{
  "dispatched": false,
  "reason": "skill_proposed",
  "featureId": "<feature-id>",
  "skillName": "<allowlisted-name>",
  "proposerRequest": {
    "effector": "skill-creator",
    "targetSkill": "<basename-sanitized-name>",
    "reason": "skill_missing_at_dispatch_time",
    "adr": "2026-04-19/F7-archived",
    "candidatesChecked": ["...", "...", "..."]
  }
}
```

The orchestrator/router consumes `proposerRequest` and dispatches
`skill-creator` as the GATE 4-compliant effector. The dispatcher itself
NEVER writes SKILL.md.

## 4. Compatibility Notes

- B3 (SKILL_ALLOWLIST) is enforced BEFORE M-F7 — an unallowlisted name short-
  circuits with `skill_not_allowlisted`, never reaching the proposer path.
- `validateSkills` remains opt-in (default off) so existing call sites that
  pass mock skillNames keep working; production orchestrator is expected to
  pass `validateSkills: true`.
- `cwd` parameter added to `dispatchFeature` for testability — unset defaults
  to `process.cwd()` (no behavior change in production).

## 5. Acceptance Tests

`tests/security/mev1-f7-effector-reroute.test.cjs` covers:

1. Source-level invariant: zero `skill-auto-creator` references in dispatcher.
2. Static invariant: every `path.join(...skillName)` is wrapped in `path.basename`.
3. Functional: `resolveSkillViaCreator('tdd')` resolves the present skill.
4. Functional: `resolveSkillViaCreator('tdd', {cwd: tmp})` returns
   `proposerRequest` for missing skill.
5. End-to-end: `dispatchFeature` returns `skill_proposed` reason carrying
   `proposerRequest.effector === 'skill-creator'` for missing skills.

All five tests GREEN as of commit (post-Slice 2).

## 6. Residual Risk

None for the dispatcher path. The orchestrator-side consumer of
`proposerRequest` is out of MEv1 Phase 0.5 scope and tracked under Phase 2
(M2.1 mission-tick wiring). Until then, `skill_proposed` results are surfaced
to the caller as-is.
