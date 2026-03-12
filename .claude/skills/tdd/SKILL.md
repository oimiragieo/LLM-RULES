---
verified: true
lastVerifiedAt: 2026-03-12T00:00:00.000Z
name: tdd
description: Canon TDD for humans and AI agents. Use for production code changes by writing tests first, proving RED, implementing minimal GREEN, and refactoring safely. 2026 edition adds TDP, flakiness gate, ralph-loop integration, and memory-search in Step 0.
version: 1.3.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Glob, Grep]
aliases: [testing-expert]
best_practices:
  - Keep a visible test scenario backlog and execute one scenario at a time
  - Prove RED before code changes and keep evidence in command output
  - Implement smallest GREEN patch that satisfies current failing test only
  - Use bounded repair loops and anti-test-hacking checks before completion
error_handling: strict
streaming: supported
---

# Test-Driven Development (TDD)

## Overview

This skill implements Canon TDD with AI-specific guardrails:

1. Build or update a scenario list.
2. Execute exactly one scenario as a runnable test.
3. Prove RED.
4. Implement minimum change for GREEN.
5. Optionally refactor.
6. Repeat until scenario list is empty.

## When to Use

Use for:

- New features
- Bug fixes
- Behavior changes
- Repository-scale patching driven by tests
- AI-assisted code generation where tests are executable specifications

Ask human approval before bypassing only for:

- Throwaway prototypes
- Purely declarative config edits with no execution path
- One-off migration scripts that will not be maintained

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

If code was written first, discard and restart from RED.

## Canon Loop

### Step 0: Create/refresh scenario backlog

Before building the backlog, query memory for past failure signatures and reusable test templates:

```javascript
Skill({ skill: 'memory-search' }); // query: "<feature-name> test failure signatures"
```

Read `.claude/context/memory/learnings.md` for recurring anti-patterns relevant to this task.

Then:

- Keep a short ordered list of test scenarios for this task.
- Prioritize by design signal and risk, not by implementation convenience.
- Add discovered scenarios during execution.
- Reuse templates from memory — do not repeat failure patterns already documented.

### Step 1: Pick exactly one scenario and write one runnable test

- One behavior per cycle.
- Use clear behavior names.
- Favor real collaborators; mock only external boundaries.

### Step 2: Prove RED

- Run the narrowest test command.
- Failure must be due to missing behavior, not syntax or setup errors.
- Record red evidence (test file and failing assertion message).

### Step 3: Implement minimum GREEN patch

- Implement only what current red test requires.
- No speculative APIs or unrelated cleanup.
- Keep patch bounded to current scenario.

### Step 4: Prove GREEN

- Re-run narrow test command.
- Run impacted suite (or package-level test set).
- Confirm no regressions.

**Flakiness Gate (mandatory for async, hook, or nondeterministic tests):**

For tests that involve async I/O, stop hooks, timers, or file system operations, a single pass is insufficient. Require 3 consecutive passes before declaring GREEN:

```bash
# Run 3 times — all 3 must pass
node --test tests/hooks/routing-guard.test.cjs && \
node --test tests/hooks/routing-guard.test.cjs && \
node --test tests/hooks/routing-guard.test.cjs
```

A test that passes once and fails on the second run is RED, not GREEN. Do not advance to Step 5 until 3 consecutive passes are confirmed.

### Step 5: Optional refactor

- Refactor only with green tests.
- Re-run the same test set after refactor.

### Step 6: Repeat until backlog empty

## AI-Assisted Guardrails

- Use tests as executable prompt context; keep prompts short and test-focused.
- Prefer deterministic tests (stable fixtures, no nondeterministic ordering).
- Use bounded repair loops: max 3 repair attempts per scenario before redesign.
- Run anti-test-hacking checks:
  - Verify changed assertions still express original requirement.
  - Add at least one negative test for bug-fix tasks.
- Ensure code does not branch on test-only artifacts.

## Memory Acceleration Layer

Use lightweight memory only to reduce repeated setup and triage:

- preferred repo-local test/lint/format commands
- recurring failure signatures and short fix summaries
- recurring anti-pattern reminders
- reusable scenario templates

Reference: `references/tdd-memory-profile.md`

Hard rules:

- memory never bypasses RED proof
- memory never changes Canon sequence
- keep profile bounded and low-noise

## Test-Driven Prompting (TDP) — 2026 Standard Pattern

TDP is the dominant 2026 pattern for multi-agent TDD: inject the **verbatim failing test output** into the developer agent spawn prompt. This eliminates interpretation errors — the developer sees exactly what the test runner sees.

### Pattern

Instead of describing the failure in prose, capture stdout/stderr and inject it directly:

```javascript
// Step 1: Run test and capture raw output
const { execSync } = require('child_process');
let testOutput = '';
try {
  execSync('node --test tests/hooks/routing-guard.test.cjs', { encoding: 'utf-8' });
} catch (e) {
  testOutput = e.stdout + e.stderr; // Verbatim failure output
}

// Step 2: Inject verbatim into developer spawn prompt (no paraphrasing)
Task({
  task_id: 'task-impl',
  subagent_type: 'developer',
  prompt: `## FAILING TEST (verbatim — do NOT modify the test file)\n\`\`\`\n${testOutput}\n\`\`\`\nImplement ONLY what is needed to make this pass.`,
});
```

### Why TDP Works

- Eliminates paraphrased failure descriptions (telephone game effect)
- Developer has the full assertion context: line number, actual vs expected values
- Forces minimal implementation — developer can only implement what the test demands
- Prevents specification drift between QA agent's test intent and developer's interpretation

### TDP + Multi-Agent TDD Decomposition

| Step | Agent              | Action                                                   |
| ---- | ------------------ | -------------------------------------------------------- |
| 1    | `qa`               | Write failing test, commit test-only, capture raw output |
| 2    | Router             | Extract test output, build TDP spawn prompt              |
| 3    | `developer`        | Implement to GREEN using verbatim test output as spec    |
| 4    | `reflection-agent` | Verify no test assertions were modified (git diff check) |

**Source:** Simon Willison (2026) — "Red/Green TDD for agents: failing test output IS the specification"; TDFlow arXiv:2510.23761.

## Autonomous TDD with ralph-loop (Session-Persistent Iteration)

For repository-scale TDD where sessions may be interrupted, wire ralph-loop (Mode 2 — router-managed) to maintain the TDD scenario backlog across interruptions:

### TDD State Schema

Maintain a TDD-specific state file at `.claude/context/runtime/tdd-state.json`:

```json
{
  "scenarios": [
    {
      "id": "sc-001",
      "description": "routing-guard blocks Write on creator paths",
      "status": "pending"
    },
    { "id": "sc-002", "description": "spawn-token-guard warns at 80K tokens", "status": "green" }
  ],
  "completedScenarios": [
    {
      "id": "sc-002",
      "evidenceCommand": "node --test tests/hooks/spawn-token-guard.test.cjs",
      "passedAt": "2026-03-12T10:00:00Z"
    }
  ],
  "currentScenario": "sc-001",
  "evidenceLog": [
    {
      "scenarioId": "sc-001",
      "phase": "red",
      "output": "AssertionError: expected exit code 2, got 0",
      "timestamp": "..."
    }
  ]
}
```

### Resume Pattern

At the start of each iteration, read the TDD state file:

```javascript
// Step 0 — before building/refreshing backlog
const state = JSON.parse(
  fs.readFileSync('.claude/context/runtime/tdd-state.json', 'utf-8') || '{}'
);
const completedIds = (state.completedScenarios || []).map(s => s.id);
const remaining = (state.scenarios || []).filter(s => !completedIds.includes(s.id));
// Pick next scenario from remaining — never re-run completed ones
```

### Integration with ralph-loop Mode 2

1. Router spawns `qa` agent with `{ task_id, subagent_type: 'qa', prompt: TDP_PROMPT + verbatim state }`
2. `qa` writes test → runs → captures output → updates `tdd-state.json` (phase: red)
3. Router spawns `developer` with TDP prompt (verbatim test output injected)
4. `developer` implements → updates `tdd-state.json` (phase: green)
5. Router checks `remaining.length === 0` → emit `RALPH_AUDIT_COMPLETE_NO_FINDINGS`
6. If remaining > 0 → loop back to step 1 with next scenario

**Anti-pattern:** Never re-run scenarios already marked `green` in state — this wastes iterations and may corrupt evidence logs.

## Repository-Scale and Class-Level Guidance

- For repository-scale work, decompose by failing test cluster and assign one cluster per loop.
- For class-level synthesis, derive a method dependency order and implement one method at a time with method-level public tests.
- Keep long-context pressure low by limiting each loop to one scenario and one patch objective.

## Verification Checklist

- [ ] Scenario backlog exists and was updated during work
- [ ] Every production change maps to at least one failing-then-passing test
- [ ] RED evidence captured (command + failure summary)
- [ ] GREEN evidence captured (command + pass summary)
- [ ] No unresolved failing tests in touched scope
- [ ] Lint/format/test commands completed or explicitly reported as blocked
- [ ] No detected test-hacking pattern

## Pre-Completion Commands (Project-Scoped)

Use the project's actual commands. Typical sequence:

```bash
# 1) targeted test
pnpm test <target>
# 2) impacted suite
pnpm test
# 3) lint
pnpm lint
# 4) format check
pnpm format:check
```

If the repo uses different scripts, replace these with local equivalents and report exactly what ran.

## Rationalization Countermeasures

- "I will add tests later" -> stop and write current red test.
- "This is too small to test" -> write one minimal behavior test.
- "I already manually tested" -> manual runs do not replace executable regression tests.
- "I spent too long to delete pre-test code" -> sunk cost; restart from RED.

## Related Files

- `references/research-requirements.md`
- `references/tdd-memory-profile.md`
- `testing-anti-patterns.md`
- `rules/tdd.md`
- `templates/implementation-template.md`

## Research Basis

This skill is aligned with:

- Martin Fowler TDD (Dec 11, 2023)
- Kent Beck Canon TDD (Dec 11, 2023)
- Rafique & Misic meta-analysis, IEEE TSE DOI:10.1109/TSE.2012.28
- LLM4TDD (arXiv:2312.04687)
- Test-Driven Development for Code Generation (arXiv:2402.13521)
- Tests as Prompt (arXiv:2505.09027)
- SWE-Flow (arXiv:2506.09003)
- TDFlow (arXiv:2510.23761)
- Scaling TDD from Functions to Classes (arXiv:2602.03557)

## Memory Protocol

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

Assume interruption: if it is not in memory, it did not happen.

## Agent-Studio TDD Extensions (2026)

### Hook Testing Pattern

Hooks use stdin/stdout JSON protocol:

```js
const proc = require('child_process').spawn('node', ['.claude/hooks/routing/routing-guard.cjs'], {
  shell: false,
});
proc.stdin.write(JSON.stringify({ tool_name: 'Write', tool_input: {} }));
proc.stdin.end();
// Exit 0=allow, 2=block
```

### Memory TDD

Mock MemoryRecord. Test confidence gate (threshold 0.7). Use atomic writes.

### Property-Based Testing

Use fast-check (and `@fast-check/vitest` for vitest integration) for any function with invariants — not just routing. fast-check 3.x (2025) adds improved unicode, date, and bigint arbitraries.

**Routing invariant (existing):**

```js
import fc from 'fast-check';
fc.assert(
  fc.property(fc.string(), intent => {
    return typeof routeIntent(intent) === 'string';
  })
);
```

**Memory serialization roundtrip (new):**

```js
// Property: serialize(deserialize(x)) === x for all JSON-serializable values
fc.assert(
  fc.property(fc.jsonValue(), value => {
    const serialized = serializeMemoryRecord(value);
    const deserialized = deserializeMemoryRecord(serialized);
    return JSON.stringify(deserialized) === JSON.stringify(value);
  })
);
```

**Hook validation invariant (new):**

```js
// Property: for any tool input, isValidInput(x) === !isBlocked(x)
// (validation and blocking must be inverses)
fc.assert(
  fc.property(fc.record({ tool_name: fc.string(), tool_input: fc.object() }), input => {
    const valid = isValidInput(input);
    const blocked = wouldBlock(input);
    return valid !== blocked || (!valid && blocked); // blocked implies invalid
  })
);
```

**Path normalization idempotency (new):**

```js
// Property: normalize(normalize(path)) === normalize(path) (idempotent)
fc.assert(
  fc.property(fc.string(), rawPath => {
    const once = normalizePath(rawPath);
    const twice = normalizePath(once);
    return once === twice;
  })
);
```

**Schema validation stability (new):**

```js
// Property: validate(schema, x) never throws uncaught exception for any input
fc.assert(
  fc.property(fc.anything(), input => {
    try {
      validateSchema(schema, input);
      return true;
    } catch (e) {
      return e instanceof ValidationError;
    } // Only ValidationError allowed
  })
);
```

### Contract Testing

Validate TaskUpdate metadata schemas (processedReflectionIds: string[]).

## Multi-Agent TDD Decomposition (2026 Standard)

Based on TDFlow (arXiv:2510.23761, 94.3% SWE-Bench Verified), monolithic TDD agents score 60–70%. Split into specialized sub-agents:

| Role        | Agent              | Responsibility                                 |
| ----------- | ------------------ | ---------------------------------------------- |
| Test Author | `qa`               | Write failing test, commit test-only           |
| Implementer | `developer`        | Implement to green — MUST NOT modify tests     |
| Verifier    | `reflection-agent` | Detect test-hacking, verify RED→GREEN evidence |

**Pattern:**

1. QA agent writes test → commits test file alone (no implementation)
2. Developer agent implements → runs tests → commits implementation
3. Reflection agent reviews diff: if test assertions changed → FAIL (test-hacking)

**Test-hacking detection:** reflection-agent checks `git diff HEAD~1 HEAD -- '*.test.*'` — any assertion changes after implementation commit = REJECT.

**When to use:** repository-scale TDD, complex features with multiple behaviors, any task where a single agent might rationalize test changes.

### TDAID Phase Mapping (Test-Driven AI-Assisted Development, 2025-2026)

TDAID extends classic TDD with explicit Planning and Validation gates:

| Phase | TDAID Label  | Agent-Studio Owner                                          | Description                                                                                            |
| ----- | ------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 0     | **Plan**     | `planner`                                                   | Thinking-model generates structured TDD plan with explicit test checkpoints before any code is written |
| 1     | **Red**      | `qa`                                                        | Write failing test expressing desired behavior; human verifies failure is expected                     |
| 2     | **Green**    | `developer`                                                 | Minimal implementation to pass test; MUST NOT modify test assertions                                   |
| 3     | **Refactor** | `developer`                                                 | Improve code quality with all tests green                                                              |
| 4     | **Validate** | `reflection-agent` + `verification-before-completion` skill | Detect specification gaming; confirm implementation matches plan; human gate                           |

**Key TDAID anti-patterns to detect in Validate phase:**

- Deleting test assertions to make tests pass
- Hardcoding expected values
- Mocking away the behavior being tested
- Making implementation superficially compliant without satisfying the specification intent

**Research basis:** TDAID (awesome-testing.com, 2025), TDAD agent-to-agent variant (arXiv:2603.08806, 2026), TDFlow (arXiv:2510.23761, 2025)

## LSP Pre-RED Type Verification

Before writing a failing test, verify the API contract exists to prevent "fails due to wrong API" rather than "fails due to missing behavior":

```bash
# Step 1: Find the target function's file + line
pnpm search:code "functionName"

# Step 2: Verify signature with LSP hover
lsp_hover({ filePath: "/abs/path/to/file.ts", line: 42, character: 10 })
# Returns: function signature, parameter types, return type

# Step 3: Write test using VERIFIED signature
# Now RED is guaranteed to fail due to missing behavior, not API mismatch
```

**Rule:** If `lsp_hover` returns empty (CJS file or LSP not active) → fall back to ripgrep `rg -n "functionName" --type ts` to read the actual signature.

**When NOT needed:** trivially new functions that don't exist yet (LSP has nothing to return).

## Contract Testing (Hook Boundaries — Expanded)

Hook contracts define the stdin/stdout JSON protocol. Test at the boundary:

```js
// Hook contract test pattern
const proc = spawn('node', ['.claude/hooks/routing/routing-guard.cjs'], { shell: false });
const input = JSON.stringify({
  tool_name: 'Edit',
  tool_input: { file_path: '.claude/agents/core/developer.md' },
});
proc.stdin.write(input);
proc.stdin.end();

// Assert: exit code 2 (block) for protected paths
// Assert: stdout JSON contains { allow: false, message: /Gate 4/ }
```

**TaskUpdate metadata contract:**

```js
// Validate processedReflectionIds schema
const schema = {
  type: 'object',
  required: ['processedReflectionIds'],
  properties: { processedReflectionIds: { type: 'array', items: { type: 'string' } } },
  additionalProperties: false,
};
```

**Agent-Studio hook contracts to test:**

- `routing-guard.cjs`: blocks Task without task_id (exit 2)
- `unified-creator-guard.cjs`: blocks Write to `.claude/skills/**/SKILL.md` (exit 2)
- `spawn-token-guard.cjs`: warns at 80K tokens (exit 0 + message)

## Test Runner Selection (node --test vs Vitest 4)

Agent Studio uses `node --test` (built-in Node.js test runner) as the **default** for all `.cjs` CommonJS files (hooks, lib, scripts). Vitest 4 is the recommended runner for ESM/TypeScript files.

| Runner        | Use When                                                            | Command                           |
| ------------- | ------------------------------------------------------------------- | --------------------------------- |
| `node --test` | `.cjs` hooks, lib, CommonJS scripts — current Agent Studio standard | `node --test tests/**/*.test.cjs` |
| `vitest`      | `.ts`, `.mts`, ESM `.js` files — use when migrating to TypeScript   | `pnpm vitest run`                 |

**Why `node --test` for `.cjs`:** Vitest requires Vite configuration and ESM-compatible modules. Agent Studio hooks use `require()` and CommonJS — `node --test` works without transpilation.

**Why Vitest 4 for `.ts`/ESM:** Boot time drops from ~8s (Jest) to ~1.2s (Vitest). First-class TypeScript + ESM support, Browser Mode (stable v4), and `jest`-compatible `describe`/`it`/`expect` API (migration = config change only).

**Anti-pattern:** Do NOT use Jest for new files. Vitest is the 2025-2026 standard for ESM/TypeScript.

```bash
# Current Agent Studio pattern (CJS hooks and lib)
node --test tests/lib/routing/routing-table.test.cjs

# Future ESM/TypeScript pattern
pnpm vitest run tests/lib/routing/routing-table.test.ts
```

## AI Output Evaluation Testing (Non-Deterministic Agents)

LLM/agent outputs are non-deterministic — binary pass/fail assertions are insufficient. Use score-based evaluation and tool-call sequence validation instead.

### Score-Based Assertion Pattern

```js
// Agent output evaluation — score dimensions 0.0-1.0
function evaluateAgentOutput(output, expectations) {
  const scores = {
    relevance: scoreRelevance(output, expectations.topic), // 0.0-1.0
    safety: scoreSafety(output), // 0.0-1.0
    faithfulness: scoreFaithfulness(output, expectations.facts), // 0.0-1.0
    format: scoreFormat(output, expectations.schema), // 0.0-1.0
  };
  const overall = Object.values(scores).reduce((a, b) => a + b) / Object.keys(scores).length;
  return { scores, overall, pass: overall >= 0.75 };
}

// Test: agent output meets quality threshold
test('researcher agent output is relevant and safe', () => {
  const result = evaluateAgentOutput(agentOutput, { topic: 'TDD patterns', facts: knownFacts });
  expect(result.scores.safety).toBeGreaterThanOrEqual(0.9); // Hard floor for safety
  expect(result.overall).toBeGreaterThanOrEqual(0.75); // 75% overall threshold
});
```

### Tool-Call Sequence Validation

For agent tests, validate the **sequence and count** of tool calls, not just the final output:

```js
// Spy on tool calls and assert ordering
const toolCallLog = [];
const mockTaskUpdate = jest.fn(args => {
  toolCallLog.push({ tool: 'TaskUpdate', args });
});
const mockBash = jest.fn(args => {
  toolCallLog.push({ tool: 'Bash', args });
});

// Run agent under test with mocked tools
await runAgent({ TaskUpdate: mockTaskUpdate, Bash: mockBash });

// Assert: TaskUpdate(in_progress) called BEFORE TaskUpdate(completed)
const inProgressIdx = toolCallLog.findIndex(
  c => c.tool === 'TaskUpdate' && c.args.status === 'in_progress'
);
const completedIdx = toolCallLog.findIndex(
  c => c.tool === 'TaskUpdate' && c.args.status === 'completed'
);
expect(inProgressIdx).toBeLessThan(completedIdx); // Ordering enforced
expect(inProgressIdx).toBeGreaterThanOrEqual(0); // Must have been called
expect(completedIdx).toBeGreaterThanOrEqual(0); // Must have been called
```

**Rule:** Never test the text content of LLM-generated prose. Test structure, schema validity, tool-call sequences, and score thresholds.

**Reference:** Simon Willison (2025) — "Red/Green TDD for agents: write assertions on tool-call sequences and structured outputs."

## MSW v2 HTTP Mocking (API Boundary Testing)

Use MSW (Mock Service Worker) v2 to test skills and agents that make external HTTP calls. MSW intercepts at the network level — no monkey-patching of `fetch`, no code changes in production.

```bash
pnpm add -D msw@2
```

### Setup Pattern (Node.js / Vitest)

```js
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// Define handlers — these describe the expected API contract
const handlers = [
  http.get('https://api.example.com/search', ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json({
      results: [{ id: 1, title: `Result for: ${url.searchParams.get('q')}` }],
    });
  }),
];

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Test: researcher skill makes HTTP call and processes response
test('researcher skill fetches and parses search results', async () => {
  const results = await researcherSkill.search('TDD patterns 2026');
  expect(results).toHaveLength(1);
  expect(results[0].title).toContain('TDD patterns');
});
```

### Override Per-Test for Error Cases

```js
test('researcher skill handles 503 gracefully', async () => {
  server.use(
    http.get('https://api.example.com/search', () => HttpResponse.json({}, { status: 503 }))
  );
  const results = await researcherSkill.search('TDD patterns');
  expect(results).toEqual([]); // Graceful empty fallback
});
```

**Key benefits over manual mocking:**

- Tests exercise real HTTP client code paths (not mocked abstractions)
- `onUnhandledRequest: 'error'` catches unintentional external calls during tests
- Handlers define request/response contracts — doubles as documentation

**Agent-Studio targets for MSW boundary tests:**

- `researcher` skill → WebSearch/WebFetch HTTP calls
- `github-ops` skill → GitHub API calls
- Any agent using `mcp__Exa__web_search_exa` or `WebFetch`

## Mutation Testing (Stryker JS)

Mutation testing validates test QUALITY, not just coverage. Run after achieving 100% line coverage:

### Stryker + Vitest (2026 Standard — ESM/TypeScript projects)

```bash
# Install (once per project) — use vitest-runner for ESM/TypeScript
pnpm add -D @stryker-mutator/core @stryker-mutator/vitest-runner vitest
```

```javascript
// stryker.config.mjs — working configuration for Vitest projects
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts', // optional: path to your vitest config
    related: true, // default: run only tests related to mutated file
  },
  thresholds: { high: 80, low: 60, break: 50 },
  reporters: ['html', 'progress'],
};
```

```bash
# Run mutation tests (use incremental to speed up local loops)
pnpm stryker run --incremental

# Target threshold: >80% mutation score
# Score = (killed mutations / total mutations) × 100
```

**Vitest runner limitations (StrykerJS 7.x):**

- Browser Mode **not supported** — threads mode only
- Always uses `perTest` coverage analysis (ignores `coverageAnalysis` config)
- For `.cjs` files using `node --test`, use `@stryker-mutator/jest-runner` as fallback

### Stryker + node:test (CommonJS/.cjs projects)

```bash
pnpm add -D @stryker-mutator/core @stryker-mutator/jest-runner
```

**Interpret results:**

- **Killed** — test suite caught the mutation ✓
- **Survived** — test suite MISSED this code path (add assertion)
- **No coverage** — no test exercises this line at all (add test)

**When to run:** after completing a TDD cycle for security-critical code (hooks, validators, routing logic). Not required for all code — prioritize by risk.

**Agent-Studio priority targets for mutation testing:**

- `.claude/hooks/routing/routing-guard.cjs`
- `.claude/hooks/safety/unified-creator-guard.cjs`
- `.claude/lib/routing/routing-table.cjs`
