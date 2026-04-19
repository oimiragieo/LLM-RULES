## ADR: F7 skill-auto-creator archived (2026-04-19)

Decision: Moved to \_archive/ with disabled stub. Rationale per LLM consult — GATE 4 IRON LAW violation (direct SKILL.md writes bypass unified-creator-guard). Roadmap: proposer-only refactor routing through skill-creator as effector.

## ADR-2026-04-07: Dead Code Remediation — Individual Updater Skills Over Generic Updater (2026-04-07)

**Status:** Approved
**Date:** 2026-04-07
**Source:** Architect agent, dead code audit remediation planning

**Decision:** Create 4 individual updater skills (hook-updater, schema-updater, template-updater, tool-updater) following established {type}-updater pattern, rather than a single generic artifact-updater.

**Rationale:** Consistency with existing skill-updater/agent-updater/workflow-updater naming; domain specialization (hooks need settings.json registration, schemas need Draft-07 validation, etc.); routing clarity (no disambiguation needed); low incremental cost via skill-creator scaffolding.

**Alternative rejected:** Generic `artifact-updater` — would be a God Object, breaks established symmetry, requires routing disambiguation.

**ADR-2026-04-07b:** Feature flag pattern for orphaned module integration — reuse env var pattern from commit 85f8f8ef8 (default OFF, try-catch wrapper, graceful degradation). 9 clusters of 70+ modules gated behind individual env vars.

**Plan artifact:** `.claude/context/plans/dead-code-remediation-plan-2026-04-07.md`

---

## ADR-2026-03-22: Monolith-to-Microservices v4.0 Architecture Update (2026-03-22)

**Status:** Proposed
**Date:** 2026-03-22
**Source:** Architect agent, general-purpose migration blueprint v4.0

**New in v4.0 (supersedes v3.0.0 from 2026-03-21):**

1. **ADR-007: Team Topology -- Stream-Aligned Teams by Bounded Context** -- Teams organized as stream-aligned (1-3 services each), with platform team and enabling teams (SRE, security). Functional teams rejected (violates Conway's Law).
2. **New Section 7: Organizational and Process Considerations** -- Team topology alignment, cognitive load management, migration milestones with phase gates, risk matrix with rollback flowchart, stakeholder communication plan.
3. **New Section 11: Success Metrics and KPIs** -- Technical KPIs (DORA metrics, SLO compliance), migration progress KPIs (monolith traffic %, services extracted), organizational KPIs (team autonomy score, developer satisfaction).
4. **Enhanced Anti-Patterns** -- Added nanoservices (10.2) and synchronous dependency chains (10.4) as explicit anti-patterns with prevention heuristics.
5. **Service boundary heuristics** -- 6 heuristics for validating whether a proposed boundary is correctly sized.
6. **Communication selection flowchart** -- Mermaid decision tree for choosing sync vs async, gRPC vs REST vs GraphQL vs events vs CDC.

**Artifact:** `.claude/context/artifacts/analysis/monolith-to-microservices-architecture-2026-03-22.md`

---

## ADR-2026-03-21: Monolith-to-Microservices Migration Architecture Decisions (2026-03-21)

**Status:** Superseded by v4.0 (2026-03-22)
**Date:** 2026-03-21
**Source:** Microservices Architect agent, general-purpose migration blueprint

**Decisions (6 ADRs documented in full at monolith-to-microservices-architecture-2026-03-21.md):**

1. **ADR-001: Strangler Fig as Primary Migration Strategy** -- Incremental extraction via API Gateway routing. Zero-downtime, per-service rollback. 12-18 month timeline trades speed for safety.
2. **ADR-002: Orchestrated Sagas for Order Fulfillment** -- Central saga coordinator in Order Service for 5+ step flows. Choreography reserved for simple 2-3 step notification/audit flows.
3. **ADR-003: Database-per-Service with CDC for Transition** -- Debezium CDC bridges monolith and new service databases during migration. Eliminates shared database anti-pattern.
4. **ADR-004: gRPC for Internal Sync, REST for External** -- Binary efficiency for service-to-service; REST for client-facing APIs via API Gateway.
5. **ADR-005: Event Sourcing for Order Management Only** -- Core domain gets full audit trail and temporal queries. Supporting/generic subdomains use standard CRUD + outbox pattern.
6. **ADR-006: Defer Service Mesh Until 8+ Services** -- Linkerd adopted when cross-cutting concern management becomes a bottleneck. Application-level mTLS/retries for early services.

**Artifact:** `.claude/context/artifacts/analysis/monolith-to-microservices-architecture-2026-03-21.md`

---

## SDR-2026-03-21: Microservices Security Architecture Decisions (2026-03-21)

**Status:** Proposed
**Date:** 2026-03-21
**Source:** Security Architect agent, microservices migration companion review

**Decisions (4 SDRs documented in full at microservices-security-architecture-2026-03-21.md):**

1. **SDR-001: mTLS via Service Mesh** -- Use Istio/Linkerd mesh mTLS over application-level TLS. Transparent enforcement, automatic cert rotation, ~1-2ms latency tradeoff.
2. **SDR-002: Token Exchange for PII Services** -- Use RFC 8693 Token Exchange (not propagation) for services handling PII/financial data. Limits blast radius of compromised tokens.
3. **SDR-003: OPA Sidecar Authorization** -- Deploy OPA as sidecar for fine-grained authz over application-level RBAC. Git-versioned Rego policies ensure consistency.
4. **SDR-004: Distroless Base Images** -- Default to Google Distroless for production. No shell, no pkg manager = minimal attack surface. Debug via kubectl debug.

**Artifact:** `.claude/context/artifacts/analysis/microservices-security-architecture-2026-03-21.md`

---

## ADR-2026-03-20-072: Path Traversal Defense Requires 6-Vector Validation (2026-03-20)

**Status:** Accepted (Multi-LLM consensus)
**Date:** 2026-03-20
**Source:** Codex + Claude dual consultation on security patterns

**Decision:** Path traversal attacks cannot be defended by simple `..` detection alone. Implement comprehensive 6-vector validation:

1. Symbolic link resolution (detect link escapes)
2. Case-sensitivity variations (Windows lowercase normalization)
3. Unicode normalization (detect obfuscated paths)
4. Null-byte injection prevention (`\0` filtering)
5. Double-encoding detection (multiple URL decode cycles)
6. Mount point escape detection (cross-filesystem boundaries)

**Where to apply:**

- File upload handlers
- Script loader for hooks and skills
- Template resolver in artifact system
- Artifact integrator path validation

**Implementation:** Canonicalize paths BEFORE any file operation check. Must be synchronous and deterministic.

**Anti-pattern:** Relying on client-side validation or post-operation checks. Defense must be at boundary entry points.

---

## ADR: Channel System Architecture (2026-03-24)

**Status:** Accepted
**Date:** 2026-03-24
**Source:** Channel system implementation session

**Decisions:**

1. **Native channels (`plugin:telegram`) is primary for Telegram integration** — use the Claude Code v2.1.80+ `--channels` flag with `plugin:telegram` as the preferred path. Produces cleaner session separation and avoids polling overhead.

2. **Custom `telegram-poll.cjs` retained as backup** — kept for environments where `--channels` support is unavailable or the native plugin cannot authenticate. Not to be used when native support is confirmed working.

3. **Channel session must be READ-ONLY** — channel sessions must not be granted `Write` or `Edit` tool access. Granting write access risks repo conflicts and unintended file mutations from notification traffic.

4. **`heartbeat-orchestrator` owns channel lifecycle management** — channel start, stop, and health monitoring are delegated to the heartbeat-orchestrator cron loop. No other agent should directly manage channel process state.

5. **`--dangerously-skip-permissions` REJECTED as default** — removed from `CHANNEL_PERMISSIONS` default after security review. Auto-approval for specific tool categories must be implemented via `PermissionRequest` hooks with explicit allowlists, not a blanket permission bypass.

---

## ADR-2026-03-20-071: Infrastructure-First Over Workarounds for Template System (2026-03-20)

**Status:** Accepted (Multi-LLM consensus)
**Date:** 2026-03-20
**Source:** Codex + Claude consultation on technical debt

**Decision:** When template system has issues, fix the infrastructure, not add workarounds:

- **Anti-pattern:** Permanent ENV var aliases that hide systemic problems
- **Pattern:** Invest in infrastructure (resolver improvements, schema validation, path handling)
- **Rationale:** Short-term workarounds become permanent; they block future ecosystem improvements

**Implementation principle:** Short-term workarounds (acceptable for 1-2 sprints) must have explicit sunset dates. Never let a workaround become permanent.

**Example:** Instead of `TEMPLATE_FIX_LEGACY=true`, improve the template resolver to handle legacy formats natively.

---

## ADR-2026-03-15-070: MEGA EVOLUTION v2 — Augmentation-First Strategy for Ecosystem Expansion (2026-03-15)

**Status:** Accepted & Implemented (commit b8c79f14)
**Date:** 2026-03-15
**Context:** Framework has 292 skills, 74→100 agents, 133 rules before this evolution. Analyzing 18+ repos.

**Decision:** Use augmentation-first strategy when performing large ecosystem evolutions:

- Map incoming repos to UPDATE (not CREATE) where functionality overlaps with existing artifacts
- Batch parallel research (Groups A, B+C, D+E+F) into 3 tasks rather than 6 individual tasks
- Wave-based execution: Wave 1 (skills) → Wave 2 (agents) → Wave 3 (rules) → Wave 4 (validation)
- Run validation gate (lint/format/validate/registry) as a dedicated final wave

**Evidence:** 39 files, 10,618 insertions in single commit. 9 skills updated, 3 skills created, 20 agents created, 3 rules created. lint 0 errors, format clean, validate passed.

**Rule:** For MEGA EVOLUTION tasks: parallel research → sequential waves → single validation wave. Never skip lint/format/validate/registry regeneration as final gate.

---

## ADR-2026-03-14-069: Devops Agent Required as Final Wave in All EPIC Pipelines (2026-03-14)

**Status:** Accepted
**Date:** 2026-03-14
**Trigger:** MEGA Wave 3 — Wave 5 QA agent did not complete git push. Final commit (47622327) required a separate devops task (#18).

**Decision:** Any EPIC pipeline (10+ artifacts, 5+ waves) MUST include a dedicated `devops` agent spawn as the final wave. QA agents are validation-focused and have a ~50% commit/push completion rate. Devops agents are purpose-built for git operations.

**Pattern:**

- Wave N-1: QA proactive audit (validate only, do not push)
- Wave N: Devops (commit, push, verify git log)

**Anti-pattern:** Expecting QA agents to handle both validation AND git push in the same task. They frequently stall at push.

**Enforcement:** Add to EPIC pipeline template; make devops final wave explicit in planning phase.

> ⚠️ Content archived to archive/decisions-2026-04-18.md on 2026-04-18
