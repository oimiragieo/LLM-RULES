# Cross-Area Flow Validation Assertions

> **Scope**: Assertions that span multiple milestones (Router Bug Fixes, Hierarchical Routing, Creator System, System Verification).
> Each assertion defines a behavioral contract with clear pass/fail criteria.

---

## VAL-CROSS-001: Routing → Creator Skill Dispatch and Registration

**Milestones**: Router Bug Fixes + Creator System

**Behavioral description**: When a user prompt matches a creation intent (e.g., "create a new skill for X"), the unified routing pipeline (`user-prompt-unified.core.cjs` → `intent-classifier.cjs` → `routing-table-data.cjs`) must classify the intent as a creator path and dispatch to the appropriate creator skill (e.g., `skill-creator`). After the creator skill completes and `post-creation-integration.cjs` fires, the newly created artifact must be discoverable by the routing table so that future requests mentioning the new skill route correctly.

**Pass condition**:

1. A prompt containing "create a new skill for docker-compose linting" is classified by `classifyIntent()` as a creation intent.
2. `getPreferredAgent()` or the semantic router returns `skill-creator` (not `developer`).
3. After simulated skill creation, the artifact appears in the artifact graph (`artifact-graph.cjs`).
4. A subsequent routing query referencing the newly created skill name resolves to the correct agent/skill entry (either via `agent-registry-resolver.cjs` or updated routing-table patterns).

**Fail condition**: The prompt is misrouted to `developer` instead of `skill-creator`, OR the created skill is not discoverable by subsequent routing lookups.

**Evidence**:

- Unit test: feed creation-intent prompt through `classifyIntent()` + `getPreferredAgent()`, assert creator agent returned.
- Integration test: simulate `post-creation-integration.cjs` hook firing with a completed creator task, verify artifact graph updated and `integration-queue.jsonl` entry written.
- Routing re-query: after artifact registration, call routing pipeline with a prompt referencing the new skill, verify it resolves.

---

## VAL-CROSS-002: Routing → Memory Context Injection

**Milestones**: Router Bug Fixes + System Verification

**Behavioral description**: The spawn-prompt assembler (`spawn-prompt-assembler.memory.cjs`) injects sanitized memory content (from `learnings.md`, `decisions.md`, `patterns.json`) into agent spawn prompts. After routing bug fixes, the memory injection pipeline must still: (a) read memory files without error, (b) sanitize content through the `INJECTION_PATTERNS` blocklist, (c) respect the `MEMORY_INJECTION_MAX_CHARS` budget (default 3600), and (d) produce a spawn prompt that includes relevant memory context for the routed agent.

**Pass condition**:

1. `spawn-prompt-assembler.memory.cjs` loads memory files from `.claude/context/memory/` without throwing.
2. Content matching any `INJECTION_PATTERNS` regex is stripped (e.g., lines containing "ignore previous instructions" are removed).
3. Total injected memory content does not exceed `MEMORY_INJECTION_MAX_CHARS` (3600 chars by default, overridable via env var).
4. The assembled spawn prompt for a routed agent contains a `[Memory Context]` or equivalent section with non-empty, sanitized content.

**Fail condition**: Memory injection throws an error, injects unsanitized content, exceeds the character budget, or produces an empty memory section when memory files contain valid data.

**Evidence**:

- Unit test: call memory assembly function with mock memory files containing both valid and injection-attempt content; assert sanitization and budget adherence.
- Integration test: run `spawn-prompt-assembler.memory.cjs` end-to-end with real `.claude/context/memory/` files; verify output prompt structure.
- Regression: existing `tests/hooks/spawn-prompt-memory-mode.test.cjs` passes.

---

## VAL-CROSS-003: Hierarchical Routing → Creator Auto-Registration

**Milestones**: Hierarchical Routing + Creator System

**Behavioral description**: When hierarchical routing is enabled (`HIERARCHICAL_ROUTING=on`) and a new agent is created via `agent-creator`, the new agent must be automatically assigned to the correct domain sub-router (one of the ~12 domains defined in `hierarchical-routing-architecture.md`: web-frontend, backend-languages, mobile-desktop, ai-ml, infra-devops, security-quality, architecture-data, product-business, etc.). The domain classification for the new agent must be derivable from its metadata (frontmatter tags, capability declarations).

**Pass condition**:

1. With `HIERARCHICAL_ROUTING=on`, create a new agent via the creator system with domain-relevant metadata (e.g., tags: ["react", "frontend"]).
2. `classifyDomain()` (from `intent-classifier.cjs`) correctly maps the new agent's capabilities to the `web-frontend` domain.
3. The domain sub-router agent (e.g., `domain-router-web-frontend`) includes the new agent in its routing scope.
4. A user prompt that should route to the new agent reaches it through the two-hop path: core-router → domain-sub-router → new-agent.

**Fail condition**: The new agent is orphaned (not assigned to any domain), assigned to the wrong domain, or only reachable via flat routing fallback when hierarchical mode is active.

**Evidence**:

- Unit test: call `classifyDomain()` with metadata tags from a newly created agent; assert correct domain returned.
- Integration test: simulate full creation + registration flow; verify sub-router agent definition includes the new agent.
- Routing test: with hierarchical mode on, route a prompt that targets the new agent's capabilities; verify two-hop dispatch.

---

## VAL-CROSS-004: Routing → Session Handoff State Preservation

**Milestones**: Router Bug Fixes + System Verification

**Behavioral description**: When the context window approaches the token budget threshold (compress at 80K, mandatory at 120K, RED LINE at 150K as defined in CLAUDE.md), the session handoff mechanism (`session-handoff.cjs`) must preserve routing-relevant state so the new session can resume without re-discovering context. This includes: active task IDs, last routed agent, pending `integration-queue.jsonl` entries, and `session-gap-log.jsonl` continuity.

**Pass condition**:

1. `session-handoff.cjs` with operation `create` persists a handoff entry to `session-handoffs.json` containing: `summary`, `filesModified`, `fromSession`, and `createdAt`.
2. The handoff summary includes routing-relevant state: which agents were active, any pending integration queue items, and in-progress task references.
3. In the new session, the routing hook (`user-prompt-unified.core.cjs`) can detect the unacknowledged handoff entry and incorporate it into its routing context.
4. `session-gap-log.jsonl` records the transition with enough detail to reconstruct the routing timeline.

**Fail condition**: Handoff entry is missing routing state, the new session starts with a blank routing context ignoring the handoff, or `session-gap-log.jsonl` has no record of the transition.

**Evidence**:

- Unit test: call `session-handoff.cjs` `create` operation with routing-state payload; verify `session-handoffs.json` contains the entry with all required fields.
- Integration test: simulate token-limit trigger → handoff create → new session startup; verify routing hook reads and acknowledges the handoff.
- File check: `session-gap-log.jsonl` contains a JSON line with `fromSession`, `toSession`, and routing context fields.

---

## VAL-CROSS-005: Creator → Memory Event Recording

**Milestones**: Creator System + System Verification

**Behavioral description**: After a creator skill (skill-creator, agent-creator, hook-creator, etc.) completes successfully, the creation event must be recorded in the memory system so it can be retrieved in future sessions. The `post-creation-integration.cjs` hook detects creator completions (via `isCreatorCompletion()`) and queues integration analysis. Additionally, the memory system (`learnings.md` or `decisions.md`) must contain a record of what was created, when, and why.

**Pass condition**:

1. `isCreatorCompletion()` returns `{ match: true, creatorType: 'skill' }` when given a TaskUpdate with `status: 'completed'` and `metadata.creatorType: 'skill'`.
2. `post-creation-integration.cjs` appends an entry to `integration-queue.jsonl` with the artifact ID and integration gaps.
3. After creation completes, `.claude/context/memory/learnings.md` or `.claude/context/memory/decisions.md` contains a datestamped entry referencing the created artifact.
4. In a subsequent session, querying memory files for the artifact name returns the creation record.

**Fail condition**: `isCreatorCompletion()` fails to detect the creator task, `integration-queue.jsonl` is not updated, or no memory record of the creation exists after completion.

**Evidence**:

- Unit test: call `isCreatorCompletion()` with various creator TaskUpdate payloads (metadata-based and pattern-based detection); assert correct `match` and `creatorType`.
- Hook test: run `post-creation-integration.cjs` with a simulated creator completion; verify `integration-queue.jsonl` entry written within the `MAX_QUEUE_ENTRY_BYTES` (10KB) limit.
- Memory test: after simulated creation, grep `.claude/context/memory/learnings.md` for the artifact name; assert presence with timestamp.
- Regression: `pnpm test:memory:ci` passes.

---

## VAL-CROSS-006: End-to-End Regression — Full Suite Green

**Milestones**: All (Router Bug Fixes + Hierarchical Routing + Creator System + System Verification)

**Behavioral description**: After all four milestones are complete, the entire existing test and validation infrastructure must pass without regressions. This is the final gate ensuring that cross-cutting changes have not broken existing functionality.

**Pass condition** (ALL must be green):

1. `pnpm test` — all unit/integration tests pass (`node --test --test-concurrency=1 "tests/**/*.test.{mjs,cjs}"`).
2. `pnpm test:framework` — all framework-specific tests pass (hooks, lib, routing, memory, spawn, reflection, etc.).
3. `pnpm validate:full` — the complete validation suite passes, including: `validate-package-scripts`, `validate-env-budget`, `validate-no-silent-catch`, `validate-archived-tests`, `validate-intent-keyword-overlap`, `validate-tool-stub-policy`, `validate-workflow`, `validate-all-references`, `validate:docs:stale`, `validate:hooks:docs`, `validate:routing`, and all other sub-validators.
4. `pnpm integration:headless` — the headless integration test passes (`run-agent-framework-integration-headless.mjs`), confirming that the agent framework boots, core agents are discoverable, and denial tests succeed.

**Fail condition**: Any single test failure, validation error, or integration test regression in the above commands.

**Evidence**:

- CI output: all four commands exit with code 0.
- Test report: zero failures in `pnpm test` and `pnpm test:framework`.
- Validation report: `pnpm validate:full` completes all sub-validators without error.
- Integration report: `pnpm integration:headless:json` output shows `{ "pass": true }` with expected core agents present.

---

## VAL-CROSS-007: Feature Flag Rollback — Hierarchical → Flat Routing

**Milestones**: Hierarchical Routing + System Verification

**Behavioral description**: Setting the feature flag `HIERARCHICAL_ROUTING=off` (or unsetting it) must revert the routing system to flat routing behavior with zero errors. All 109+ agents must be directly routable from the core router without going through domain sub-routers. No sub-router agents should be spawned, and no domain classification should be attempted.

**Pass condition**:

1. With `HIERARCHICAL_ROUTING=off`, `classifyDomain()` is either not called or returns a no-op/bypass result.
2. The routing table used by `user-prompt-unified.core.cjs` is the flat `routing-table-core-map.cjs` (not the hierarchical variant).
3. All existing routing tests pass identically to pre-hierarchical baseline: `pnpm validate:routing` exits 0.
4. No error logs referencing missing sub-router agents, undefined domain classifications, or hierarchical routing components.
5. Direct agent routing works: `getPreferredAgent('bug-fix')` returns `developer` (not a domain sub-router).
6. `pnpm test:framework` passes with `HIERARCHICAL_ROUTING=off`.

**Fail condition**: Any error, warning, or behavioral change when the feature flag is off compared to the pre-hierarchical baseline. Sub-router agents being spawned when flat mode is active. Any test failure caused by residual hierarchical routing code paths.

**Evidence**:

- Environment test: run `pnpm validate:routing` with `HIERARCHICAL_ROUTING=off`; assert exit code 0.
- Unit test: call `getPreferredAgent()` for 10+ known intents with flag off; assert all return flat-routing agents (no sub-routers).
- Negative test: with flag off, grep stdout/stderr of `pnpm test:framework` for "domain-router" or "sub-router" agent spawns; assert zero matches.
- Regression: `pnpm test` and `pnpm validate:full` pass with `HIERARCHICAL_ROUTING=off`.

---

## Summary Matrix

| ID            | Flow                                       | Milestones Spanned          | Key Files                                                                                 |
| ------------- | ------------------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------- |
| VAL-CROSS-001 | Routing → Creator dispatch + registration  | Router Fixes + Creator      | `user-prompt-unified.core.cjs`, `post-creation-integration.cjs`, `routing-table-data.cjs` |
| VAL-CROSS-002 | Routing → Memory injection                 | Router Fixes + Verification | `spawn-prompt-assembler.memory.cjs`, `learnings.md`, `patterns.json`                      |
| VAL-CROSS-003 | Hierarchical routing → Creator auto-assign | Hierarchical + Creator      | `intent-classifier.cjs`, `hierarchical-routing-architecture.md`, domain sub-router agents |
| VAL-CROSS-004 | Routing → Session handoff                  | Router Fixes + Verification | `session-handoff.cjs`, `session-gap-log.jsonl`, `user-prompt-unified.core.cjs`            |
| VAL-CROSS-005 | Creator → Memory recording                 | Creator + Verification      | `post-creation-integration.cjs`, `integration-queue.jsonl`, `learnings.md`                |
| VAL-CROSS-006 | End-to-end regression                      | All 4 milestones            | `pnpm test`, `pnpm validate:full`, `pnpm integration:headless`                            |
| VAL-CROSS-007 | Feature flag rollback                      | Hierarchical + Verification | `routing-table-core-map.cjs`, `HIERARCHICAL_ROUTING` env var                              |
