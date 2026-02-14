## ADR-122: AST-Based Console Migration over Regex (2026-02-13)

**Status:** Proposed
**Decision:** Use jscodeshift AST-based codemod for 646 console.\* calls migration with explicit skip rules for hook protocol output.

---

## ADR-121: Module Size Budget (500 Lines) (2026-02-13)

**Status:** Proposed
**Decision:** Enforce 500-line max via ESLint max-lines rule. 6 modules need refactoring or ADR exceptions.

---

## ADR-120: Manual DI over Awilix for Circular Dependencies (2026-02-13)

**Status:** Proposed
**Decision:** Manual factory pattern for 23 circular dependencies across memory/routing/workflow subsystems. No new runtime dependency.

---

## ADR-103: Interwoven Creator Ecosystem (2026-02-08)

**Status:** PROPOSED (design complete, pending implementation)
**Decision:** Add companionMatrix to ecosystem-impact-graph.json, companion-check.cjs library module, Step 0.5 to all 9 creator skills, enhance artifact-integrator with companion analysis.

---

## ADR-100: Cross-Artifact Integration System (2026-02-08)

**Status:** ACCEPTED & FULLY IMPLEMENTED (15 tasks complete, Phase 6 DevOps wiring verified, 95% deployment ready)
**Summary:** Complete end-to-end integration framework with 5 integration points fully wired, 65 integration tests (100% pass rate), non-blocking operational pattern.

---

## ADR-103: Test-Driven Integration Boundary Verification (2026-02-08)

**Status:** Proposed
**Decision:** Extend TDD with Integration Verification Phase after unit tests pass. Test real modules together without mocks. Document contracts explicitly.

---

## ADR-105: Router Enforcement Hardening Pipeline (2026-02-08)

**Status:** ACCEPTED & FULLY IMPLEMENTED (Tasks #27-35, 7 phases, 124/124 tests passing, zero-blocker downstream pattern)
**Summary:** 5 CRITICAL enforcement gaps closed (Edit/Write/NotebookEdit registration, Check 8 TaskList-first, state-reset fields, staleness detection). 100% test pass rate.

---

## ADR-104: Unified Ecosystem Creation Protocol (2026-02-08)

**Status:** ACCEPTED & FULLY IMPLEMENTED (Tasks #14-21, 105/105 tests passing, 95% deployment ready)
**Summary:** creator-commons.cjs infrastructure, ecosystem-impact-graph.json, artifact-updater skill, 3 new creators (command/rule/tool), 3 CRITICAL security fixes.

---

## ADR-102: Memory Management System Rebuild (2026-02-08)

**Status:** Accepted (Architecture + Security designs complete)
**Decision:** 3-component system (memory-rotator.cjs section-based, smart-pruner.cjs Jaccard dedup, cold-storage.cjs 3-tier HOT/WARM/COLD). ~300 lines total, down from ~900.

---

## ADR-107: Pro-Workflow Adoption Strategy (2026-02-09)

**Status:** Accepted (Task #81 complete)
**Decision:** Adopt CONCEPTS from pro-workflow, rewrite all code from scratch using agent-studio patterns. 4 new session hooks operational, routing table 58% smaller (2,472 → 1,030 lines), 4 standalone hooks consolidated.

---

## ADR-110: Stub Modules for Archived Functionality (2026-02-09)

**Status:** ACCEPTED (proven by Tasks #1-9 audit remediation)
**Decision:** Create minimal stub modules at original import path that export same function names, return safe defaults, include JSDoc explaining archived status.

---

## ADR-106: Creator Guard File-Existence Enforcement (2026-02-09)

**Status:** Proposed
**Decision:** Replace state-file-only authorization with file-existence check. Edit always ALLOW, Write+file-exists ALLOW, Write+no-file REQUIRE creator token.

---

## ADR-108: Zero-Regression Enterprise Improvement Plan (2026-02-09)

**Status:** ACCEPTED & FULLY IMPLEMENTED (17 files, 30/30 QA checks PASS, 0 regressions, 9.5/10 code review, 0.91 pipeline score)
**Summary:** 4 improvement areas (context-compressor integration, hybrid search adoption, planner enhancement, PM PRD workflow) via 6-phase additive-only plan.

---

## ADR-109: Enterprise Improvement Pipeline Pattern (2026-02-09)

**Status:** ACCEPTED (proven by Pipeline #12, Tasks #9-16)
**Decision:** 8-phase pipeline pattern (Research → PM → Architect+Security → Planner → Developer → Code Review → QA → Reflection) with ADDITIVE-only constraint for enterprise improvements. Proven metrics: 17 files, 12 agents, 3 sessions, 0 regressions.

---

## ADR-M001-M007: Microservices Migration Architecture (2026-02-09)

**Status:** PROPOSED (all 7 ADRs)
**Decisions:** gRPC over REST, Event Sourcing for Memory, NATS over Kafka, Strangler Fig pattern (9 months, 4 phases), Policy-as-Data for hooks, PostgreSQL+Redis+LanceDB+TimescaleDB, Kubernetes with K3s dev.

---

## ADR-110: Ecosystem Audit Results and Remediation (2026-02-09)

**Status:** Accepted
**Decision:** Archive non-functional agents (party-orchestrator), add ROUTING_TABLE entries for pm/reflection-agent, enable extended_thinking for 7 analysis agents, quarterly audit cadence.

---

## ADR-111: Memory Facade Architecture (2026-02-11)

**Status:** Accepted & Implemented (Wave 5, Task #13)
**Decision:** Consolidate 15+ memory modules into 4 cohesive facade layers (storage, query, extraction, lifecycle). Public API via `.claude/lib/memory/core/index.cjs`. 73% cognitive load reduction.

---

## ADR-112: Agent Registry 3-File Split Strategy (2026-02-11)

**Status:** Accepted & Implemented (Wave 4a, Task #11)
**Decision:** Split agent-registry.json (2400+ lines) into 3 category files (core, domain, orchestrators) + index file. Loader provides unified API.

---

## ADR-113: Security Input Sanitization Hardening (2026-02-11)

**Status:** Accepted & Implemented (Wave 2b, Task #9)
**Decision:** 3-layer input sanitization (shell commands, spawn prompts, memory content). Blocks injection patterns, dangerous shell metacharacters, prompt override attempts.

---

## ADR-095: Canonical Skill Output Schema Standard (2026-02-09)

**Status:** Proposed (Architecture Design Complete)
**Decision:** Structure B (`{status: enum, output: object}`) as canonical envelope, Draft-07 JSON Schema, `https://agent-studio.dev/schemas/` $id domain, `additionalProperties: false` mandatory.

---

## ADR-114: Shell Execution Hardening - shell: false Standard (2026-02-13)

**Status:** ACCEPTED & IMPLEMENTED (Commits 1-4)
**Decision:** Standardize on `shell: false` with array arguments for ALL child process execution. 4 skill scripts fixed (sequential-thinking, git-expert, docker-compose, terraform-infra).

---

## ADR-115: safeParseJSON Utility Standard (2026-02-13)

**Status:** ACCEPTED & IMPLEMENTED (Commits 1-4)
**Decision:** Adopt safeParseJSON() utility for ALL JSON parsing in hooks. Provides try-catch wrapper, structured return, prototype pollution protection. 3 reflection hooks fixed.

---

## ADR-116: File-Based Locking for Concurrent Operations (2026-02-13)

**Status:** ACCEPTED & IMPLEMENTED (Commits 1-4)
**Decision:** Use file-based locking (proper-lockfile) to synchronize concurrent database initialization. Applied to sync-memory-index.cjs.

---

## ADR-201: Router Tool Restriction Absoluteness (2026-02-13)

**Status:** ACTIVE (CRITICAL)
**Decision:** Router tool restrictions are ABSOLUTE. No thresholds, no exceptions, no "just this once." Capability ≠ Authorization. New hook: router-tool-whitelist-gate.cjs enforces whitelist at PreToolUse.

---

## ADR-123: Complexity Audit Effort Estimation (2026-02-14)

**Status:** PROPOSED
**Decision:** Complexity audits MUST include post-analysis effort estimation phase. Use parametric model: base_effort × (LOC / 1000) × coupling_factor × test_complexity_factor. Sample 3 files per tier, extrapolate to full tier, document samples in appendix.
**Rationale:** Line count ≠ effort. routing-guard.cjs (2578L) could be 8-80 hours depending on coupling/tests. Without estimates, audit roadmap is unschedulable.
**Evidence:** Task #1 audit identified 6 critical files but could not answer "how long to refactor routing-guard?" This ambiguity prevents prioritization.

---

## ADR-124: Complexity Metrics Baseline Protocol (2026-02-14)

**Status:** PROPOSED
**Decision:** All quality improvement claims MUST define baseline metrics pre-refactor. For cognitive load reduction, track: avg cyclomatic complexity, max nesting depth, avg file LOC. Measure pre/post, report actual improvement.
**Rationale:** "40-60% cognitive load reduction" is unverifiable without metric definition. Post-refactoring, team reports subjective feelings, but no objective data supports the claim.
**Implementation:** Run baseline metrics (plato, ESLint with complexity plugin) before starting refactoring phase. Run again post-refactoring. Compare deltas.
**Example:** Baseline: avg_complexity=8.2, max_nesting=16, avg_LOC=650 → Target: 6.0, 5, 350 → Post-refactor: actually achieved 6.1, 4, 340 = "76% of projected improvement achieved."
