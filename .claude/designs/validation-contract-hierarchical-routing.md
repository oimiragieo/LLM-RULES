# Validation Contract: Hierarchical Routing (Milestone 2)

> **Status**: Draft  
> **Date**: 2026-03-27  
> **Scope**: Testable assertions for the hierarchical routing architecture  
> **Design Ref**: `.claude/designs/hierarchical-routing-architecture.md`

---

## Area 1 — Sub-Router Agent Creation

### VAL-HIER-001: Nine domain sub-router agent files exist

All 9 domain sub-router `.md` files are present in `.claude/agents/orchestrators/`.

**Pass condition**: The following files all exist and are non-empty:

- `domain-router-web-frontend.md`
- `domain-router-backend.md`
- `domain-router-mobile.md`
- `domain-router-ai-ml.md`
- `domain-router-infra.md`
- `domain-router-security.md`
- `domain-router-arch-data.md`
- `domain-router-product.md`
- `domain-router-niche.md`

**Fail condition**: Any file is missing, empty, or located in the wrong directory.

**Evidence**: `ls .claude/agents/orchestrators/domain-router-*.md` returns exactly 9 files.

---

### VAL-HIER-002: Sub-router agents have valid YAML frontmatter

Each sub-router agent `.md` file contains YAML frontmatter with required fields: `name`, `version`, `description`, `model`, `tools` (must include `Task` or `TaskCreate`).

**Pass condition**: All 9 sub-router files parse valid YAML frontmatter and include the required fields. The `tools` array contains at least `Task`.

**Fail condition**: Any sub-router file has missing/invalid frontmatter or lacks the `Task` tool.

**Evidence**: Parse each file's YAML block; assert `name` matches `domain-router-*` pattern, `tools` includes `Task`.

---

### VAL-HIER-003: Sub-router agents define their domain's complete agent roster

Each sub-router agent's markdown body contains a table or list that enumerates **every** agent assigned to its domain per the design document (Section 3.1).

**Pass condition**: Cross-reference the agent names in each sub-router against the design document's domain groupings. Every agent from the design appears in its sub-router's agent roster. Counts per domain:

- `web-frontend`: 5 agents
- `backend-languages`: 14 agents
- `mobile-desktop`: 5 agents
- `ai-ml`: 11 agents
- `infra-devops`: 10 agents
- `security-quality`: 8 agents
- `architecture-data`: 11 agents
- `product-business`: 15 agents
- `specialized-niche`: 7 agents

**Fail condition**: Any agent from the design is missing from its sub-router's roster, or an agent appears in the wrong sub-router.

**Evidence**: For each sub-router, grep for every expected agent name. All must be present.

---

### VAL-HIER-004: Sub-router agents declare a default gateway agent

Each sub-router agent explicitly identifies a default/fallback agent for ambiguous intra-domain requests.

**Pass condition**: Each sub-router body contains an explicit default agent designation (e.g., "Default: typescript-pro" or "Default gateway: frontend-pro") that matches the design document's specified defaults.

**Fail condition**: Any sub-router omits the default or specifies a different default than the design.

**Evidence**: Grep each sub-router for "default" or "fallback"; compare the named agent against the design's Section 3.1 tables.

---

### VAL-HIER-005: Sub-router agents contain disambiguation rules

Each sub-router includes disambiguation rules for overlapping intent within its domain (e.g., Python+Django → `django-developer`, not `python-pro`).

**Pass condition**: Sub-routers with overlapping agents (at minimum `backend-languages` and `ai-ml`) contain explicit disambiguation sections with framework-trumps-language rules.

**Fail condition**: Sub-routers with known agent overlap lack disambiguation guidance, creating ambiguous intra-domain routing.

**Evidence**: Inspect the markdown body for a "Disambiguation" or equivalent section containing conditional routing rules.

---

## Area 2 — Core Router Simplification

### VAL-HIER-010: Hierarchical routing table routes to ~12 targets

A new `routing-table-hierarchical.cjs` (or equivalent) exists that maps keywords to domain-level entries (`{ type: 'domain', domain, router }`) and direct entries (`{ type: 'direct', agent }`).

**Pass condition**: The total number of **unique routing targets** (distinct `agent` values for direct + distinct `router` values for domain) is ≤ 25. The design specifies ~12 (10 direct core + 9 sub-routers + ~14 meta-orchestration = ~33 at most, but the core router's **scored candidate set** per prompt should be ≤ 25).

**Fail condition**: The hierarchical routing table still individually enumerates >30 unique agent targets, indicating it was not properly consolidated.

**Evidence**: Count unique values in the `DOMAIN_ROUTING_TABLE` export: `new Set(Object.values(table).map(e => e.agent || e.router)).size`.

---

### VAL-HIER-011: Domain keywords cover existing flat table coverage

Every keyword in the current `routing-table-core-map.cjs` (250+ entries) is either:
(a) present in the hierarchical routing table mapping to a domain, OR
(b) handled by a direct route, OR
(c) deliberately deprecated (documented in a migration note).

**Pass condition**: A diff of flat-table keywords vs hierarchical-table keywords produces zero uncovered entries (excluding documented deprecations).

**Fail condition**: Any keyword from the flat table has no corresponding entry in either the hierarchical table or a sub-router's internal matching logic.

**Evidence**: Extract `Object.keys()` from both tables; compute set difference; verify the difference set is empty or documented.

---

### VAL-HIER-012: Core router CLAUDE.md references domains, not individual agents

When `HIERARCHICAL_ROUTING=on`, the router's CLAUDE.md routing section references domain names and sub-router agents, not the full list of 109 individual agents.

**Pass condition**: The routing section of CLAUDE.md contains ≤ 30 agent references (direct routes + sub-routers + meta-orchestration) instead of the current ~109.

**Fail condition**: CLAUDE.md still enumerates all 109 agents in its routing hints.

**Evidence**: Count agent name occurrences in the routing-hints section of CLAUDE.md.

---

## Area 3 — Domain Sub-Router Agent Selection

### VAL-HIER-020: Sub-router selects correct agent for unambiguous domain prompt

Given a prompt with a clear single-domain signal (e.g., "Fix the Django ORM query"), the appropriate sub-router (`domain-router-backend`) selects the correct specialist (`django-developer`), not the domain default.

**Pass condition**: For a set of ≥ 20 canonical test prompts (covering all 9 domains), each sub-router selects the expected specialist agent per the design's disambiguation rules.

**Fail condition**: Any canonical test prompt is routed to the wrong specialist within the domain.

**Evidence**: Run each test prompt through the sub-router's selection logic (or simulate via the intent classifier with domain filtering); compare output agent to expected agent.

---

### VAL-HIER-021: Sub-router falls back to default gateway on ambiguous prompt

Given an ambiguous intra-domain prompt (e.g., "Help me with backend code"), the sub-router selects its declared default gateway agent.

**Pass condition**: Prompts with generic domain keywords but no framework/language specifics resolve to the sub-router's default agent.

**Fail condition**: Ambiguous prompts cause an error, no selection, or selection of a non-default agent.

**Evidence**: Test ≥ 9 ambiguous prompts (one per domain); verify each resolves to the default from VAL-HIER-004.

---

### VAL-HIER-022: Sub-router passes original prompt verbatim to selected agent

When a sub-router spawns a specialist via `Task()`, the `description` or `prompt` field contains the user's original prompt unmodified.

**Pass condition**: The Task call payload from sub-router → specialist includes the original user prompt text without truncation or summarization.

**Fail condition**: The sub-router rewrites, summarizes, or drops the original prompt.

**Evidence**: Instrument or log the Task call; compare the forwarded prompt against the original input.

---

## Area 4 — Feature Flag

### VAL-HIER-030: Feature flag `HIERARCHICAL_ROUTING=on` activates hierarchical path

When `HIERARCHICAL_ROUTING=on` is set (via `.env` or environment), the routing hooks use domain-level classification and sub-router dispatch.

**Pass condition**: With flag on, a domain-specific prompt (e.g., "Build a React component") triggers `classifyDomain()` returning `{ type: 'domain', domain: 'web-frontend', router: 'domain-router-web-frontend' }` and the hook output recommends spawning that sub-router.

**Fail condition**: With flag on, routing still iterates all 109 agents via the flat path.

**Evidence**: Set `HIERARCHICAL_ROUTING=on`; invoke `user-prompt-unified.core.cjs` with a domain prompt; inspect output for `routingType: 'hierarchical'` or sub-router recommendation.

---

### VAL-HIER-031: Feature flag `HIERARCHICAL_ROUTING=off` preserves flat routing

When `HIERARCHICAL_ROUTING=off` (or unset), routing behaves identically to the pre-hierarchical system: `routing-table-core-map.cjs` is used, all 109 agents are scored, no sub-routers are invoked.

**Pass condition**: With flag off, the same domain-specific prompt from VAL-HIER-030 routes directly to the individual agent (e.g., `frontend-pro`) via the flat table, with no sub-router involved.

**Fail condition**: With flag off, sub-routers are referenced or invoked.

**Evidence**: Set `HIERARCHICAL_ROUTING=off`; invoke the routing hook; verify output matches pre-existing behavior (agent name from flat table, no `routingType: 'hierarchical'`).

---

### VAL-HIER-032: Feature flag default is `off` (safe rollout)

When `HIERARCHICAL_ROUTING` is not set in the environment at all, the system defaults to flat routing.

**Pass condition**: With no `HIERARCHICAL_ROUTING` variable defined, `getEnforcementMode('HIERARCHICAL_ROUTING', 'off')` (or equivalent) returns `'off'`, and flat routing is used.

**Fail condition**: Missing env var defaults to `on`, breaking existing deployments.

**Evidence**: Delete/unset the env var; invoke routing; confirm flat path is taken.

---

## Area 5 — Routing Hook Validation of Sub-Router Dispatches

### VAL-HIER-040: `extractSpawnAgentType()` recognizes sub-router agent names

The function `extractSpawnAgentType()` in `routing-guard-core.policy.cjs` returns the correct name when `toolInput.subagent_type` is a sub-router name (e.g., `domain-router-backend`).

**Pass condition**: `extractSpawnAgentType({ subagent_type: 'domain-router-backend' })` returns `'domain-router-backend'`.

**Fail condition**: Returns empty string or throws, indicating the sub-router name is not recognized as a valid agent type.

**Evidence**: Unit test calling `extractSpawnAgentType` with each of the 9 sub-router names.

---

### VAL-HIER-041: `checkTaskPayloadContract()` passes for sub-router Task calls

The task payload contract checker in `routing-guard-core.checks-task.cjs` does not block Task calls that target sub-router agents.

**Pass condition**: Calling `checkTaskPayloadContract('Task', { subagent_type: 'domain-router-web-frontend', description: '...', prompt: '...' })` returns `{ pass: true }`.

**Fail condition**: The check returns a block/warning because sub-router agents are not in an allowlist.

**Evidence**: Unit test with Task payloads targeting each of the 9 sub-routers.

---

### VAL-HIER-042: Pre-task hooks allow sub-router → specialist chained dispatch

When a sub-router agent spawns a specialist agent via Task (creating a 2-hop chain: core-router → sub-router → specialist), the pre-task hooks (`pre-task-unified-core.cjs`) do not block the second hop as a depth violation.

**Pass condition**: A Task call from within a sub-router context (depth=2) to a specialist agent is permitted. The depth limit accommodates at least depth=3 (router → sub-router → specialist).

**Fail condition**: The second-hop Task is blocked by depth or loop-detection guards.

**Evidence**: Simulate or trace a 2-hop dispatch; confirm the pre-task hook returns `{ pass: true }` or equivalent for both hops. Check `getDepthLimit()` returns ≥ 3.

---

### VAL-HIER-043: Routing guard does not flag sub-router as "wrong agent"

The `routing-guard.cjs` and `routing-guard-core.checks-router.cjs` do not emit "wrong agent selected" warnings when the core router dispatches to a sub-router instead of an individual specialist.

**Pass condition**: When core router dispatches to `domain-router-backend` for a "python" prompt, the routing guard does not produce a "should have used python-pro" warning.

**Fail condition**: Routing guard flags a mismatch because its expected-agent logic doesn't understand hierarchical indirection.

**Evidence**: Run a domain-specific prompt through the routing pipeline with `HIERARCHICAL_ROUTING=on`; verify no routing-guard warnings about agent mismatch.

---

## Area 6 — Backward Compatibility

### VAL-HIER-050: Flat routing table remains loadable and functional

`routing-table-core-map.cjs` is not deleted or emptied. It remains importable and returns the full `ROUTING_TABLE` object with 250+ entries.

**Pass condition**: `require('.claude/lib/routing/routing-table-core-map.cjs').ROUTING_TABLE` returns an object with ≥ 200 keys, all mapping to valid agent names.

**Fail condition**: File is deleted, emptied, or exports are broken.

**Evidence**: `const t = require(...); assert(Object.keys(t.ROUTING_TABLE).length >= 200)`.

---

### VAL-HIER-051: `intent-classifier.cjs` still exports existing functions

The `classifyIntent`, `scoreAgents`, or equivalent functions exported by `intent-classifier.cjs` remain available and callable with their original signatures.

**Pass condition**: `require('.claude/lib/routing/intent-classifier.cjs')` exports the same function names as before the hierarchical changes. New functions (e.g., `classifyDomain`) are additive.

**Fail condition**: Existing exported function signatures are removed or changed in a breaking way.

**Evidence**: Compare exports before and after; confirm superset relationship.

---

### VAL-HIER-052: Direct-route agents behave identically in both modes

Core agents that are "direct routes" (developer, planner, architect, qa, etc.) are dispatched identically whether `HIERARCHICAL_ROUTING` is on or off.

**Pass condition**: For each of the 10 direct-route agents, a canonical prompt routes to the same agent regardless of the feature flag state.

**Fail condition**: A direct-route agent is routed differently (e.g., through a sub-router) when the flag is on.

**Evidence**: Run 10 canonical direct-route prompts with flag on and off; compare selected agents.

---

### VAL-HIER-053: Existing slash commands and skills are unaffected

Slash commands (in `.claude/commands/`) and skill invocations that trigger specific agents continue to work without modification.

**Pass condition**: Invoking a slash command (e.g., `/code-review`, `/tdd`) still routes to the expected agent regardless of hierarchical routing state.

**Fail condition**: Slash commands break or route to sub-routers instead of their intended agents.

**Evidence**: Test ≥ 5 slash commands with `HIERARCHICAL_ROUTING=on`; verify correct agent selection.

---

## Area 7 — Full Agent Reachability

### VAL-HIER-060: All 109 agents are reachable through the hierarchy

Every agent in the ecosystem (as listed in the agent registry) is reachable via at least one of: (a) direct route from core router, (b) domain sub-router, or (c) meta-orchestration direct route.

**Pass condition**: Build a union set of: direct-route agents + meta-orchestration agents + all agents listed in each sub-router's roster. This union covers all 109 agents in the agent registry. No agent is orphaned.

**Fail condition**: Any registered agent is absent from all routing paths (direct, domain, meta-orchestration).

**Evidence**: Load the agent registry; compute the reachability set from the hierarchical routing config; assert `registrySet ⊆ reachabilitySet`.

---

### VAL-HIER-061: No agent is duplicated across multiple sub-router domains

Each non-orchestration agent appears in exactly one sub-router's domain (no ambiguous dual-membership). Exception: `context-manager` is documented as a known duplicate.

**Pass condition**: The intersection of agent rosters across all 9 sub-routers is empty (excluding documented exceptions).

**Fail condition**: An agent appears in 2+ sub-routers, creating routing ambiguity.

**Evidence**: Compute pairwise intersections of sub-router agent lists; assert each is empty or contains only documented exceptions.

---

### VAL-HIER-062: Meta-orchestration agents remain directly routable

The 14 meta-orchestration agents (master-orchestrator, swarm-coordinator, party-orchestrator, etc.) are accessible as direct routes from the core router, not routed through any sub-router.

**Pass condition**: Each meta-orchestration agent has at least one keyword in the routing table with `type: 'direct'` pointing to it, or is listed in the core router's CLAUDE.md as a direct-route target.

**Fail condition**: A meta-orchestration agent is accessible only through a sub-router.

**Evidence**: For each of the 14 meta-orchestration agents, verify a direct-route entry exists in the hierarchical routing table.

---

### VAL-HIER-063: Explicit agent targeting bypasses hierarchical routing

When a user or system explicitly specifies an agent by name (e.g., `subagent_type: 'python-pro'`), the dispatch goes directly to that agent without routing through a sub-router.

**Pass condition**: A Task call with an explicit `subagent_type` matching a known agent name reaches that agent directly, even if `HIERARCHICAL_ROUTING=on`.

**Fail condition**: Explicit agent targeting is intercepted and redirected through a sub-router.

**Evidence**: Issue `Task({ subagent_type: 'python-pro', ... })` with hierarchical routing on; confirm `python-pro` is invoked directly.

---

## Area 8 — Routing Prototype Generation

### VAL-HIER-070: Routing prototypes file includes sub-router entries

The `routing-prototypes.json` (used by `semantic-router.cjs`) is updated to include embedding prototypes for the 9 sub-router agents.

**Pass condition**: `routing-prototypes.json` contains keys for all 9 `domain-router-*` agents, each with a valid embedding vector of the correct dimensionality (`parsed.dimensions`).

**Fail condition**: Sub-router agents are absent from the prototypes file, making semantic routing unable to classify them.

**Evidence**: Parse `routing-prototypes.json`; assert `domain-router-web-frontend` (and all 8 others) exist in `prototypes` with arrays of length `dimensions`.

---

### VAL-HIER-071: Semantic router returns sub-routers for domain prompts

When `semantic-router.predict()` is called with a domain-specific prompt and `HIERARCHICAL_ROUTING=on`, the results include the relevant sub-router agent among the top-K results.

**Pass condition**: For prompt "Build a React dashboard with Tailwind CSS", `predict()` returns `domain-router-web-frontend` in the top 3 results (when hierarchical prototypes are active).

**Fail condition**: Semantic router only returns individual agents (e.g., `frontend-pro`) and never surfaces sub-routers.

**Evidence**: Call `predict()` with ≥ 5 domain-specific prompts; verify sub-router appears in top-K for each.

---

### VAL-HIER-072: Prototype generation script supports hierarchical data

The prototype generation tooling (however invoked) can regenerate prototypes that include both individual agent embeddings and sub-router agent embeddings from the sub-router `.md` files.

**Pass condition**: Running the prototype generation produces a `routing-prototypes.json` with entries for all 109 original agents **plus** 9 sub-router agents (118 total, minus any documented exceptions).

**Fail condition**: The generation script ignores sub-router files in `agents/orchestrators/` or produces prototypes only for original agents.

**Evidence**: Run prototype generation; count keys in output JSON; verify ≥ 115 entries.

---

### VAL-HIER-073: Domain-level prototypes have distinguishable embeddings

Sub-router prototype embeddings are semantically distinct from each other (no two sub-routers have cosine similarity > 0.85), ensuring the semantic router can discriminate between domains.

**Pass condition**: Pairwise cosine similarity between any two sub-router prototype embeddings is < 0.85.

**Fail condition**: Two or more sub-router prototypes have similarity ≥ 0.85, indicating poor domain separation in embedding space.

**Evidence**: Compute 36 pairwise similarities (9 choose 2); assert all < 0.85.

---

## Summary

| Area                         | IDs                | Count  |
| ---------------------------- | ------------------ | ------ |
| Sub-Router Agent Creation    | VAL-HIER-001 – 005 | 5      |
| Core Router Simplification   | VAL-HIER-010 – 012 | 3      |
| Domain Sub-Router Selection  | VAL-HIER-020 – 022 | 3      |
| Feature Flag                 | VAL-HIER-030 – 032 | 3      |
| Routing Hook Validation      | VAL-HIER-040 – 043 | 4      |
| Backward Compatibility       | VAL-HIER-050 – 053 | 4      |
| Full Agent Reachability      | VAL-HIER-060 – 063 | 4      |
| Routing Prototype Generation | VAL-HIER-070 – 073 | 4      |
| **Total**                    |                    | **30** |
