<!-- Agent: code-reviewer | Task: #3 | Session: 2026-03-05 -->

# Memory System Usage Audit — 2026-03-05

**Audit Scope:** 5 areas of the memory system pipeline
**Auditor:** code-reviewer (task-3)
**Status:** COMPLETE

---

## Area 1: spawn-prompt-assembler.memory.cjs — Injection Pipeline

**File:** `.claude/hooks/routing/spawn-prompt-assembler.memory.cjs`

### 1.1 INJECTION_PATTERNS

**PASS** — 9 regex patterns defined at lines 18-28.

| # | Pattern | Purpose |
|---|---------|---------|
| 1 | `ignore\s+(?:all\s+)?(?:previous\|above)\s+instructions` | Prompt hijack |
| 2 | `ignore\s+all\s+instructions` | Prompt hijack |
| 3 | `disregard\s+(?:all\s+)?instructions` | Prompt hijack |
| 4 | `system\s+prompt\s+(?:leak\|reveal\|show\|dump\|expose\|ignore\|bypass)` | System prompt exfil |
| 5 | `bypass\|ignore\|override\s+(?:your\s+)?instructions` | Instruction override |
| 6 | `override\s+(?:system\|safety\|security\|content\|ai\|model\|assistant)` | Safety override |
| 7 | `you\s+are\s+now` | Identity hijack |
| 8 | `forget\s+everything` | Memory wipe attack |
| 9 | `new\s+instructions` | Instruction injection |

**Assessment:** Coverage is solid for top OWASP injection patterns. No gaps identified for the memory injection use case.

### 1.2 MEMORY_INJECTION_MAX_CHARS

**PASS** — `MEMORY_INJECTION_MAX_CHARS = parseInt(process.env.MEMORY_INJECTION_MAX_CHARS || '3600', 10)` at line 36.

- Default: **3600 chars** (~900 tokens). Env-configurable.
- NaN guard: uses `parseInt` with radix 10; if env var is non-numeric, result is NaN and downstream truncation will still trigger (non-finite, treated as 0). **MINOR:** No `Number.isFinite()` guard on the parsed result. If `MEMORY_INJECTION_MAX_CHARS=abc`, `parseInt` returns NaN, `text.length <= NaN` evaluates to false, `text.slice(0, NaN - 3)` returns empty string — effectively truncating all injection content silently. Recommend adding `Number.isFinite(max) || fallback` guard (see capTierBSection pattern at line 282 which does this correctly).

### 1.3 Semantic Match Cap

**PASS** — `appendSemanticMatches` (line 73) caps at 3 results via `results.slice(0, 3)` at line 82.

- Max semantic context injected per prompt: 3 matches × capped at MEMORY_INJECTION_MAX_CHARS total.

### 1.4 capTierBSection Truncation Behavior

**PASS** — Defined in `spawn-prompt-assembler.core.cjs` at lines 286-291.

```javascript
function capTierBSection(sectionMarkdown) {
  const text = String(sectionMarkdown || '');
  const maxChars = getTierBTokenBudget() * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 3)) + '...';
}
```

- Default token budget: `DEFAULT_TIER_B_MAX_TOKENS = 400` (line 27) → `400 × 4 = 1600 chars`.
- Env override: `MEMORY_TIER_B_MAX_TOKENS` with `Number.isFinite` guard (line 282) — this IS guarded correctly.
- Called at lines 104 and 151 in `.memory.cjs` to cap semantic and query sections respectively.
- **Ellipsis appended** on truncation — agents can detect truncation and request more context.
- `Math.max(0, maxChars - 3)` prevents negative slice on very small budgets.

**Assessment:** Tier B truncation is implemented correctly with proper NaN guard. The MEMORY_INJECTION_MAX_CHARS parsed at `.memory.cjs:36` lacks the same NaN guard that capTierBSection has — minor inconsistency.

### 1.5 Query Memory Cap

**PASS** — `appendQueryMemories` (line 120) caps at 5 results via `results.slice(0, 5)` at line 129.

---

## Area 2: universal-agent-spawn.md — MemoryRecord Presence

**File:** `.claude/templates/spawn/universal-agent-spawn.md`

### 2.1 MemoryRecord in allowed_tools

**PASS** — `MemoryRecord` is present in the allowed_tools array at line 68 within the Task() example block.

```javascript
allowed_tools: [
  'Read',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
  'TaskOutput',
  'Skill',
  'MemoryRecord',   // line 68 — PRESENT
],
```

### 2.2 MANDATORY Language

**PASS** — "REQUIRED before TaskUpdate(completed)" language present at lines 31-47.

```
REQUIRED before TaskUpdate(completed): Call MemoryRecord at least once per task that
produces new findings. Zero MemoryRecord calls = invisible work to the learning system.
```

Additionally the TaskUpdate completion contract at lines 136-144 requires `memoriesRecorded` field in metadata.

**Assessment:** Template is fully compliant. Both the tool availability and the behavioral contract are enforced.

---

## Area 3: memory-search Skill Assignment — 3-Layer Cross-Reference

**Sources checked:**
- `agent-skill-matrix.json` (primary/always assignments)
- `skill-index.json` (agentPrimary list)
- `agent-registry.json` (runtime registry)

### 3.1 Per-Layer Verification

| Layer | Source | memory-search Status |
|-------|--------|----------------------|
| Matrix | `agent-skill-matrix.json` | 65+ agents in `primary` arrays |
| Index | `skill-index.json` | 65 agents in `agentPrimary` list |
| Registry | `agent-registry.json` | All checked agents have `memory-search: true` |

### 3.2 Agents Missing memory-search from Any Layer

**PASS — No agents found missing memory-search from any layer.**

All 6 "known gap" domain agents (aso-specialist, brand-guardian, compliance-checker, feedback-synthesizer, marketing-strategist, ux-researcher) confirmed to have memory-search assigned across all 3 layers. reflection-agent also confirmed in all 3 layers.

**Verification command used:**
```bash
node -e "const d=require('.claude/config/skill-index.json'); const entry=Object.entries(d).find(([k,v])=>v&&v.name==='memory-search'); console.log(entry[1].agentPrimary.length, 'agents in agentPrimary')"
# Output: 65 agents in agentPrimary
```

---

## Area 4: STM/MTM/LTM Pipeline — Existence and Registration

### 4.1 session-end-memory-promotion.cjs

**PASS — EXISTS and IS FUNCTIONAL.**

- **File:** `.claude/hooks/lifecycle/session-end-memory-promotion.cjs` (98 lines)
- **Registration:** `settings.json` at line 340 under `SessionEnd` matcher
- **Function:** Calls `consolidateSession(sessionId, PROJECT_ROOT)` at line 52 to promote STM → MTM
- **Security:** SE-01 compliant (Windows path normalization), SE-02 compliant (`safeParseJSON` used at line 38 instead of raw `JSON.parse`)
- **SE-03 compliant:** try/catch wrapping at line 91, exits 0 on all errors (fail-open advisory hook)

### 4.2 Background LanceDB Re-index Trigger

**PASS** — Hook triggers background `generate-embeddings.cjs --memory-only` at lines 63-76.

```javascript
const child = spawn(
  'node',
  [path.join(PROJECT_ROOT, '.claude', 'lib', 'code-indexing', 'generate-embeddings.cjs'), '--memory-only'],
  { stdio: 'ignore', detached: true, shell: false }  // shell: false = SE-01 compliant
);
child.unref();  // non-blocking, fire-and-forget
```

- Skips re-index when `LANCEDB_EMBEDDING_MODE=off` (line 61) — correct BM25-only mode handling.

### 4.3 generate-embeddings.cjs MTM/LTM Indexing

**PASS** — `.claude/lib/code-indexing/generate-embeddings.cjs` indexes both mtm/ and ltm/:

- `MTM_DIR = .claude/context/memory/mtm/` (line 51) — processes `session_*.json`
- `LTM_DIR = .claude/context/memory/ltm/` (line 52) — processes `summary_*.json`

**Assessment:** The full STM→MTM promotion + re-index pipeline is correctly wired. The "goldfish effect" (only STM indexed) reported in session 2 has been fixed.

---

## Area 5: Known Gaps Verification

### 5.1 Six Domain Agents Missing task-management-protocol in "always"

**CONFIRMED FINDING** — The following 6 domain agents have task-management-protocol absent from their `always` arrays in `agent-skill-matrix.json`:

| Agent | Matrix Location | "always" Array Contents |
|-------|----------------|-------------------------|
| aso-specialist | lines 628-638 | `["code-semantic-search","code-structural-search","memory-search","ripgrep","token-saver-context-compression","verification-before-completion"]` |
| brand-guardian | lines 639-650 | Same 6 skills — no task-management-protocol |
| compliance-checker | lines 651-662 | Same 6 skills — no task-management-protocol |
| feedback-synthesizer | lines 663-674 | Same 6 skills — no task-management-protocol |
| marketing-strategist | lines 675-686 | Same 6 skills — no task-management-protocol |
| ux-researcher | lines 790-801 | Same 6 skills — no task-management-protocol |

**SEVERITY: IMPORTANT** — These agents lack the task-management-protocol skill in "always", meaning they won't reliably call TaskUpdate in_progress/completed. Per the task tracking iron law, this creates invisible work and potentially stuck tasks.

**Recommended fix:** Add `"task-management-protocol"` to the `always` array for each of these 6 agents in `agent-skill-matrix.json`, then regenerate the agent registry (`pnpm agents:registry`).

### 5.2 reflection-agent "always" Skills

**CONFIRMED FINDING** — reflection-agent has an **empty** `always` array in `agent-skill-matrix.json` (lines 187-197):

```json
"reflection-agent": {
  "always": []
}
```

**SEVERITY: NOTED (by design or oversight — needs clarification)** — reflection-agent is a specialized internal agent invoked for post-session reflection. The empty "always" array means it relies entirely on frontmatter skills and contextual assignments. Given that:
1. reflection-agent IS in the memory-search `agentPrimary` list (skill-index.json)
2. reflection-agent IS in agent-registry.json with memory-search: true
3. Reflection-agent's role involves analyzing session learnings (memory-search is critical for this)

The lack of `memory-search` in the matrix "always" array creates a gap: the registry correctly shows it, but the matrix-based "always" enforcement won't inject it. **Recommend** adding `["memory-search","task-management-protocol"]` to reflection-agent's "always" array.

---

## Summary of Findings

| # | Area | Status | Severity |
|---|------|--------|----------|
| 1.1 | INJECTION_PATTERNS — 9 patterns present | PASS | — |
| 1.2 | MEMORY_INJECTION_MAX_CHARS = 3600 default | PASS with NOTE | Minor: NaN not guarded |
| 1.3 | Semantic match cap = 3 | PASS | — |
| 1.4 | capTierBSection truncation | PASS | — |
| 1.5 | Query memory cap = 5 | PASS | — |
| 2.1 | MemoryRecord in allowed_tools | PASS | — |
| 2.2 | MANDATORY language in template | PASS | — |
| 3.x | memory-search in all 3 layers for all agents | PASS | — |
| 4.1 | session-end-memory-promotion.cjs exists + registered | PASS | — |
| 4.2 | Background LanceDB re-index trigger | PASS | — |
| 4.3 | generate-embeddings.cjs indexes mtm/ and ltm/ | PASS | — |
| 5.1 | 6 domain agents missing task-management-protocol | FAIL | Important |
| 5.2 | reflection-agent empty "always" array | FAIL | Important |

### Action Items

**IMPORTANT (Should Fix):**
1. Add `task-management-protocol` to `always` for 6 domain agents in `agent-skill-matrix.json`: aso-specialist, brand-guardian, compliance-checker, feedback-synthesizer, marketing-strategist, ux-researcher
2. Add `["memory-search","task-management-protocol"]` to `always` for reflection-agent in `agent-skill-matrix.json`
3. Run `pnpm agents:registry` after changes

**MINOR (Nice to Have):**
4. Add `Number.isFinite` guard to `MEMORY_INJECTION_MAX_CHARS` parsing in `spawn-prompt-assembler.memory.cjs:36` (pattern already exists in `capTierBSection` at `spawn-prompt-assembler.core.cjs:282`)

### BACKWARD_PROPAGATION

**Pattern**: `capTierBSection` in core.cjs uses `Number.isFinite()` guard but the analogous `parseInt` for `MEMORY_INJECTION_MAX_CHARS` in memory.cjs does not.
**Proposed Artifact**: shared utility function `parseSafeEnvInt(envVar, defaultVal)` that encapsulates `parseInt` + `Number.isFinite` fallback — already partially exists as a pattern in `getTierBTokenBudget()`
**Affected Files**: `.claude/hooks/routing/spawn-prompt-assembler.memory.cjs`, `.claude/hooks/routing/spawn-prompt-assembler.core.cjs`
**Rationale**: Centralizing env-var integer parsing eliminates the inconsistency and prevents silent zero-content injection on misconfigured env vars
**Priority**: P2 (low instance count, low risk)

---

*Report generated by code-reviewer agent | Task #3 | Session 2026-03-05*
