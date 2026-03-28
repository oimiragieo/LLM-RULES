### VAL-TC-001: Agent skill matrix covers all 119 registry agents

`agent-skill-matrix.json` must contain an entry for every agent present in `agent-registry.json`. The total agent count in the matrix must be **119** (not the legacy 88). Pass: `Object.keys(matrix.agents).length === 119` and every key in the registry's `agents` object has a corresponding key in the matrix. Fail: any agent missing or count ≠ 119.
Evidence: Run `node -e "const m=require('./.claude/context/config/agent-skill-matrix.json'); const r=require('./.claude/context/agent-registry.json'); const mk=Object.keys(m.agents||m); const rk=Object.keys(r.agents); console.log('matrix:',mk.length,'registry:',rk.length); const missing=rk.filter(k=>!mk.includes(k)); console.log('missing:',missing);"` — output must show `matrix: 119 registry: 119 missing: []`.

### VAL-TC-002: All 119 agents have token-saver-context-compression in their always array

Every agent entry in `agent-skill-matrix.json` must include `"token-saver-context-compression"` in its `always` array. Pass: 119/119 agents contain the skill. Fail: any agent missing the skill in its `always` array.
Evidence: Run `node -e "const m=require('./.claude/context/config/agent-skill-matrix.json'); const agents=Object.entries(m.agents||m); const missing=agents.filter(([k,v])=>!(v.always||[]).includes('token-saver-context-compression')); console.log(missing.length===0?'PASS':'FAIL',missing.map(([k])=>k));"` — output must be `PASS []`.

### VAL-TC-003: Read-safety hook accepts context-compressor as valid skill evidence

`pre-tool-unified.read-safety.cjs` must recognize `"context-compressor"` as a valid token-saver skill name. The `hasTokenSaverEvidence` function (or equivalent check) must return `true` when `skillNameRaw === 'context-compressor'`. Pass: the string comparison includes `context-compressor` as a valid value. Fail: `context-compressor` is not accepted.
Evidence: Inspect `.claude/hooks/routing/pre-tool-unified.read-safety.cjs` — the skill-name validation logic must contain `=== 'context-compressor'` (or equivalent case-insensitive match). Additionally, run read-safety unit tests (VAL-TC-005) which exercise this path.

### VAL-TC-004: Read-safety hook accepts token-saver-context-compression as valid skill evidence

`pre-tool-unified.read-safety.cjs` must recognize `"token-saver-context-compression"` as a valid token-saver skill name. Pass: the string comparison includes `token-saver-context-compression` as a valid value. Fail: `token-saver-context-compression` is not accepted.
Evidence: Inspect `.claude/hooks/routing/pre-tool-unified.read-safety.cjs` — the skill-name validation logic must contain `=== 'token-saver-context-compression'` (or equivalent case-insensitive match). Additionally, run read-safety unit tests (VAL-TC-005) which exercise this path.

### VAL-TC-005: Read safety test suite passes

`tests/hooks/pre-tool-unified-read-safety.test.cjs` must pass with 0 failures. All test cases including context-compressor acceptance, token-saver-context-compression acceptance, bypass logic, and windowing behavior must be green. Pass: exit code 0, 0 failures. Fail: any test failure or non-zero exit code.
Evidence: Run `node --test tests/hooks/pre-tool-unified-read-safety.test.cjs` — output must show all tests passing with 0 failures.

### VAL-TC-006: Agent count test updated and passes

The agent count assertion in `tests/audit/agent-search-compliance.test.cjs` (and any other test asserting agent count) must reflect the current registry total (119, not the legacy 110 or 88). Pass: the expected count constant matches the actual number of agents in the registry and all count-assertion tests pass. Fail: hardcoded count mismatch or test failure.
Evidence: Run `node --test tests/audit/agent-search-compliance.test.cjs` — the "should have expected total agent count" test must pass. Grep the file for the expected number to confirm it matches registry metadata.

### VAL-TC-007: Ghost agent tmp-routing-\* removed from routing table

`routing-table-intent-keywords-data.cjs` must not contain any entries with keys matching `tmp-routing-*`. These are ephemeral test artifacts that must be cleaned up. Pass: `grep 'tmp-routing-' .claude/lib/routing/routing-table-intent-keywords-data.cjs` returns no matches (excluding comments). Fail: any `tmp-routing-*` key present in the exported data structure.
Evidence: Run `rg "tmp-routing-" .claude/lib/routing/routing-table-intent-keywords-data.cjs` — must return zero results.

### VAL-TC-008: Intent keyword overlap resolved

The intent-keyword-overlap validator (`scripts/validation/validate-intent-keyword-overlap.cjs`) must pass without detecting any unresolved keyword collisions between agents in the routing table. Pass: validator exits with code 0. Fail: validator reports overlapping keywords or exits non-zero.
Evidence: Run `node scripts/validation/validate-intent-keyword-overlap.cjs` — output must indicate no violations and exit code must be 0.

### VAL-TC-009: validate:full passes all validators

`pnpm validate:full` must complete successfully, executing all sub-validators (validate, validate-package-scripts, validate-env-budget, validate-no-silent-catch, validate-archived-tests, validate-intent-keyword-overlap, validate-tool-stub-policy, validate-workflow, validate-all-references, validate:docs:stale, validate:hooks:docs, validate:env:enforcement, validate:module-size, validate:windows-hide, validate:workflow-skill-contracts, validate:cujs, validate:index, index-rules, validate:schemas, validate:commands, validate:agent-skill-refs, validate:agent-template-contract, validate:artifact-regression, validate:status-check-governance, validate:agent-memory, validate:sync, validate:routing, validate:ci-gate). Pass: exit code 0 from the full pipeline. Fail: any sub-validator fails.
Evidence: Run `pnpm validate:full` — must exit with code 0 and show no ERROR lines.

### VAL-TC-010: metrics:ci passes

`pnpm metrics:ci` must pass all metric checks: runtime snapshot, spawn CI, routing CI, runtime CI, memory SLO CI, memory-cache CI, findings CI, and findings trend CI. `parseFailureRate` must be within configured thresholds and no critical findings must be flagged. Pass: exit code 0. Fail: any metric check fails or parseFailureRate exceeds threshold.
Evidence: Run `pnpm metrics:ci` — must exit with code 0 and all metric sub-commands must report within-threshold results.

### VAL-TC-011: pnpm test passes with 0 failures

`pnpm test` (the primary test suite) must complete with 0 test failures. This covers unit tests, audit tests, agent tests, skill tests, CLI tests, integration tests, and tool tests. Pass: exit code 0, 0 failures in output. Fail: any test failure or non-zero exit code.
Evidence: Run `pnpm test` — output must show 0 failing tests and exit code 0.

### VAL-TC-012: pnpm test:framework passes with 0 failures out of ~3250

`pnpm test:framework` must complete with 0 failures across all framework test files (hooks, lib/agents, lib/config, lib/qa, lib/plan, lib/memory, lib/monitoring, lib/routing, lib/spawn, lib/text-processing, lib/tools, lib/scheduler, lib/reflection). Pass: exit code 0, 0 failures, ~3250+ tests passing. Fail: any test failure or non-zero exit code.
Evidence: Run `pnpm test:framework` — output must report 0 failures and exit code 0.

### VAL-TC-013: pnpm integration:headless still passes (144/144)

`pnpm integration:headless` must pass all 144 integration test cases. No regressions may be introduced by M1 changes. Pass: 144/144 pass, exit code 0. Fail: any test failure or count < 144.
Evidence: Run `pnpm integration:headless` — output must report 144 passing and exit code 0.

### VAL-TC-014: validate:routing still passes (hierarchical on and off)

`pnpm validate:routing` (which runs `validate-routing-consistency.cjs`) must pass with both hierarchical routing enabled and disabled. Routing tables must be consistent and all agents must be reachable. Pass: exit code 0, no consistency violations. Fail: any routing inconsistency or non-zero exit code.
Evidence: Run `pnpm validate:routing` — must exit with code 0 and report no routing inconsistencies for both hierarchical modes.

### VAL-TC-015: Agent search skill compliance test passes

`tests/agents/search-compliance.test.cjs` and `tests/audit/agent-search-compliance.test.cjs` must pass. These tests verify that all agents in the registry have the required search skills wired and that agent counts match metadata. Pass: both test files exit with code 0, 0 failures. Fail: any test failure.
Evidence: Run `node --test tests/agents/search-compliance.test.cjs tests/audit/agent-search-compliance.test.cjs` — all tests must pass with 0 failures.

### VAL-TC-016: Agent frontmatter search skills test passes

`tests/agents/agent-frontmatter-search-skills.test.cjs` must pass. This test validates that every non-exempt agent's `.md` frontmatter includes the required search skills (agent-search, code-semantic-search, code-structural-search as applicable). Pass: exit code 0, 0 failures. Fail: any agent missing required search skills in frontmatter.
Evidence: Run `node --test tests/agents/agent-frontmatter-search-skills.test.cjs` — all tests must pass with 0 failures.
