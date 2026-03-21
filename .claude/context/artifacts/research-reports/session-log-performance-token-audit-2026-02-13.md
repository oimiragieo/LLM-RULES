<!-- Agent: codex | Task: session-log-performance-token-audit | Session: 2026-02-13 -->

# Session Log Performance & Token Audit (2026-02-13)

## Scope
- Debug log analyzed: `C:\Users\oimir\.claude\debug\1eca3634-1285-4e4a-9f56-1fc81271e6a3.txt`
- Code paths reviewed:
  - `.claude/hooks/routing/spawn-prompt-assembler.cjs`
  - `.claude/lib/spawn/prompt-assembler.cjs`
  - spawn prompt tests under `tests/hooks/`

## Observed Issues From Log
1. Repeated auth checks in tight burst (`[API:auth] OAuth token check starting/complete` repeated many times around `2026-02-13T20:31:56Z`).
2. Prompt-size pressure signals (`Auto tool search enabled: 15399 tokens`, autocompact traces).
3. Reflection gate block retries (`PreToolUse:TaskList` denied due pending reflection request).
4. Telemetry export failures (`ECONNABORTED`, failed to export 107/200 events).
5. Frequent skill reload churn (`Loaded 253 unique skills` repeated rapidly).

## Codebase Correlation
- High-prompt-path enrichment logic is controlled in `shouldThrottleExpensiveEnrichment()` in `.claude/hooks/routing/spawn-prompt-assembler.cjs`.
- Prior logic had an early return for `complexity === 'high'` before the `basePrompt.length > 20000` guard, preventing throttling for very large high-complexity prompts.
- That directly increases chance of extra Tier-B enrichment and token burn in heavy tasks.

## Implemented Fixes
### Fix A: Adaptive throttling bug (token/perf)
- File: `.claude/hooks/routing/spawn-prompt-assembler.cjs`
- Change:
  - Large prompt guard (`basePrompt.length > 20000`) is now evaluated before complexity-based bypass.
  - `SPAWN_ADAPTIVE_ENRICHMENT` parsing now accepts `true`, `1`, and `on`.
- Result:
  - Very large prompts are throttled consistently when adaptive mode is enabled.

### Fix B: TDD coverage for regression prevention
- File: `tests/hooks/spawn-prompt-assembler-snippet.test.cjs`
- Added test:
  - `shouldThrottleExpensiveEnrichment throttles very large prompts when adaptive mode is enabled`
- Test status:
  - RED before fix (failed)
  - GREEN after fix (passes)

### Fix C: Lint blocker cleanup
- Removed local temp file: `.claude/context/tmp/test-check.cjs`
- This eliminated the prior unused-var lint errors from that temp artifact.

## Verification Checkpoints
- Test checkpoint:
  - `node --test tests/hooks/spawn-prompt-assembler-snippet.test.cjs` ✅
  - `node --test tests/hooks/spawn-prompt-memory-mode.test.cjs` ✅
- Format checkpoint:
  - `npx prettier --check .claude/hooks/routing/spawn-prompt-assembler.cjs tests/hooks/spawn-prompt-assembler-snippet.test.cjs` ✅
- Lint checkpoint (targeted):
  - `npx eslint .claude/hooks/routing/spawn-prompt-assembler.cjs tests/hooks/spawn-prompt-assembler-snippet.test.cjs` ⚠️
  - Remaining warning is pre-existing style policy (`max-lines`) on large hook file.

## Detailed TDD Plan (Next Iterations)
### Phase 0: Baseline and Safety
- Capture baseline metrics from latest debug logs:
  - prompt length distribution
  - token burn rate
  - spawn assembly timing
  - failed export counts
- Store baseline report under `.claude/context/reports/backend/`.

### Phase 1: RED
- Add failing tests for:
  1. adaptive throttling activation at large prompt sizes across complexity classes
  2. no-regression guarantee for required prompt sections (`TaskUpdate`, task id, project context)
  3. idempotent behavior when prompt is already assembled

### Phase 2: GREEN
- Implement smallest changes to satisfy tests:
  1. budget-first throttling
  2. bounded Tier-B enrichment under stress
  3. strict env parsing for adaptive toggles

### Phase 3: REFACTOR
- Refactor with behavior lock:
  - isolate budget policy into pure helper
  - keep section injection deterministic
  - preserve compatibility with existing hooks and validators

### Phase 4: Checkpoint Validation
- Required checkpoint command set:
  1. `node --test tests/hooks/spawn-prompt-assembler-snippet.test.cjs`
  2. `node --test tests/hooks/spawn-prompt-memory-mode.test.cjs`
  3. `npx prettier --check <changed-files>`
  4. `npx eslint <changed-files>`
  5. `node scripts/validate-all-references.mjs`

### Phase 5: Code Submission
- Submit commits split by concern:
  1. tests (RED/GREEN cases)
  2. runtime logic fixes
  3. report/docs updates
- Include validation evidence in commit body/PR notes.

## Research Notes (Exa + arXiv)
The following references support adaptive context/token control direction:
- Token-Budget-Aware LLM Reasoning (arXiv 2412.18547): https://arxiv.org/html/2412.18547v5
- 500xCompressor (arXiv 2408.03094): https://arxiv.org/abs/2408.03094
- Provence context pruning for RAG: https://arxiv.org/html/2501.16214v1
- LongLLMLingua (ACL 2024): https://aclanthology.org/2024.acl-long.91/

Key takeaway: adaptive budget-first pruning and context compression are consistently effective at lowering token/latency cost while preserving quality.
