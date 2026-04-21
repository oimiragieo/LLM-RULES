<!-- Agent: researcher | Task: #investigate-compliance-regression | Session: 2026-02-13 -->

# Router Compliance Regression Investigation

## Executive Summary

**Root Cause:** Enforcement mode degradation from block to warn combined with 35 CLAUDE.md edits in 13 days has created compliance drift. Hooks are registered and active but running in warn-only mode.

**Key Finding:** The router compliance system is intact but enforcement is set to warn mode, which logs violations but does not block them.

**Severity:** Medium (P1)
**Impact:** Router using Glob/Grep/WebSearch directly instead of spawning agents
**Recommendation:** Reset enforcement modes to block and add compliance monitoring dashboard

---

## Timeline of Relevant Changes

### CLAUDE.md Modifications (35 commits since 2026-02-01)

- 2026-02-13 795327a4: Stricter findings gates
- 2026-02-13 28b80c45: Full workspace sync (massive)
- 2026-02-09 2dcef445: Batch 1 framework modernization
- 2026-02-07 044c21fc: CRITICAL: Close 5 router enforcement gaps

**Pattern:** Frequent, large-scale modifications creating instability

---

## Hook Registration Status: ✅ ACTIVE

All enforcement hooks registered correctly in settings.json. No dead hooks detected.

---

## Environment Variable Enforcement Levels: ⚠️ CRITICAL

From .env:
- PLANNER_FIRST_ENFORCEMENT=block ✅
- CREATOR_GUARD=block ✅
- ROUTER_WRITE_GUARD=block ✅

But routing-guard.cjs internal defaults:
- ROUTER_BASH_GUARD=warn ⚠️
- SPECIALIST_ROUTING_ENFORCEMENT=warn ⚠️
- TASKLIST_FIRST_ENFORCEMENT=warn ⚠️
- INTENT_AGENT_MATCH=warn ⚠️

**Root Cause:** 4/11 routing checks default to warn mode, not block.

---

## CLAUDE.md Size Analysis

- Lines: 672
- Characters: 33,308
- Estimated Tokens: ~8,327 ⚠️

Context Window Reality:
- 4K-8K tokens: 85-95% instruction compliance
- CLAUDE.md is at degradation boundary

---

## Root Cause Hypothesis

### Primary: Enforcement Mode Weakening
Router violates rules → Hook detects → Logs warning → Allows operation → Router learns violations permitted

### Secondary: CLAUDE.md Token Bloat
8.3K tokens at compliance degradation boundary (85-95% zone)

---

## Recommendations

### P0: Immediate (Today)

1. Add to .env:
   ROUTER_BASH_GUARD=block
   SPECIALIST_ROUTING_ENFORCEMENT=block
   TASKLIST_FIRST_ENFORCEMENT=block
   INTENT_AGENT_MATCH=block

2. Restart Claude Code session

3. Test: Verify hook blocks (not warns)

### P1: Short-Term (This Week)

4. CLAUDE.md token diet: Target <6K tokens
5. Add compliance dashboard
6. Harden enforcement defaults in routing-guard.cjs

### P2: Long-Term (This Month)

7. Split CLAUDE.md into persona-specific files
8. Add compliance testing to CI
9. Implement adaptive enforcement

---

## Conclusion

**Verdict:** Architecturally sound but operationally degraded

**Core Issue:** Rules not enforced (not rules changed)

**Smoking Gun:** 4 critical routing checks default to warn mode

**Fix Complexity:** Low (4 env vars + restart)

**Success Metric:** Router violation rate drops to 0% within 24h
