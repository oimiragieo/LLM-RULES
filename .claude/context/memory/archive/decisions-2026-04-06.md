# decisions Archive (2026-04-06)

## ADR-2026-03-12-065: Multi-Model Review Must Run in Fresh Session (2026-03-12)

**Status:** ACCEPTED (pattern)
**Date:** 2026-03-12
**Trigger:** Task 5 Phase 3 multi-model review (Gemini/Codex) blocked by 24 context-length-exceeded errors after long Phases 1 and 2.
**Decision:** Multi-model review phases that follow heavy analysis+implementation sequences MUST run as the first phase of a fresh session. The EPIC pipeline plan template must include an explicit "Fresh Session Gate" checkpoint before multi-model review steps. "Start review in fresh session" must appear in the handoff note of the preceding implementation task.
**Consequences:** Adds an explicit session boundary in EPIC pipelines. Slightly extends wall-clock time but prevents review phase from being silently dropped due to context overflow.

---

## ADR-2026-03-12-064: Security Audit Confirms shell:false Compliance Baseline (2026-03-12)

**Status:** ACCEPTED (observation)
**Date:** 2026-03-12
**Trigger:** Security audit of all active `.claude/hooks/` files (65 files scanned).
**Decision:** All 65 production hook files are shell:false compliant. The one `shell:true` instance in `tools/cron-runner/queue-drain.cjs` is documented-intentional (non-hook tool, trusted internal command). This establishes a verified compliance baseline as of 2026-03-11. Track any new hook additions against this baseline via CI.
**Consequences:** shell:false baseline confirmed. Future hook authors must not use `shell:true` in production hook code. The cron-runner exception must be unit-tested to assert `writebackCmd` is assembled from hardcoded parts only.

---

## ADR-2026-03-13-068: QA Must Verify Rule-Index Count After Rule Creation (2026-03-13)

**Status:** ACCEPTED
**Date:** 2026-03-13
**Trigger:** Session task #14 created 7 rule files (lancedb, supabase, playwright, astro, solidjs, cleanup-always, documentation-always) but `pnpm index-rules` was never run by subagents. Gap-log entry confirmed: "rule-index count discrepancy 114→126". The QA agent passed without detecting this gap.

**Decision:** QA agent MUST proactively check rule-index count whenever any session involved rule creation. Specifically:

1. Run `pnpm index-rules 2>/dev/null | tail -1` and capture count
2. Count `.claude/rules/*.md` files in the directory
3. Assert that indexed count matches file count (or that the count increased by the number of rules created)
4. FAIL QA if discrepancy exists

**Verification command QA must run:**

```bash
node scripts/index-rules.cjs 2>/dev/null; cat .claude/config/rule-index.json | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write('Indexed rules: ' + Object.keys(d.rules||d).length + '\n')"
```

**Root Cause:** rule-creator Step 4 (run `pnpm index-rules`) is mandatory per the skill's workflow, but subagents skipped it. QA did not check index health as part of its final validation sweep.

**Consequences:** QA must add a "framework index integrity" check to its proactive-audit checklist. This check verifies: rule-index count, skill-index count (if skills created), and agent-registry count (if agents created) all match the actual file counts.
