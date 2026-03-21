## ADR-2026-03-21: Monolith-to-Microservices Migration Architecture Decisions (2026-03-21)

**Status:** Proposed
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

---

## ADR-2026-03-13-067: Root-Level Slop Files Are QA Responsibility (2026-03-13)

**Status:** ACCEPTED
**Date:** 2026-03-13
**Trigger:** 19 untracked files accumulated in the project root during the MEGA EPIC session (dump-test.cjs, test-out.txt, errors.json, eslint.json, rename_agent.cjs, revert_rename.cjs, update_frequencies.cjs, update_skill_loops.cjs, update_skill_rigidity.cjs, etc.). The router failed to detect these. User had to manually confront the router about cleanup.

**Decision:** QA agent MUST run `git status -s | grep "^??" | grep -v ".claude/"` as part of its final pipeline check. Any `??` files in the project root (excluding `.claude/` paths) should be flagged as a QA finding. QA must:

1. List all untracked root-level files
2. Categorize them: temp scripts, test outputs, migration scripts, debug files
3. ASK USER before deleting (per file-deletion-safety iron law)
4. Report them as a "workspace hygiene" finding if QA cannot confirm their purpose

**Root Cause:** Developers created temp scripts and test artifacts in project root without cleaning up. QA passed without checking workspace hygiene.

**Consequences:** Adds a "workspace hygiene" check to QA's proactive-audit. QA must NEVER delete untracked files silently — it must list them and report, then ask user. This is distinct from the file-deletion-safety rule which prevents deletion; this ADR mandates QA to _detect_ and _surface_ the problem.

---

## ADR-2026-03-13-066: Router Self-Accountability — Failure Must Be Logged, Not Deflected (2026-03-13)

**Status:** ACCEPTED
**Date:** 2026-03-13
**Trigger:** Router observed devops agent failing to commit ~50% of the time this session. Instead of logging this as a router routing failure (chose wrong agent) or escalating, the router noted "systemic devops issue" in comments and continued. User confronted the router about 19 root-level slop files and router initially deflected blame to subagents.

**Decision:** When the Router observes a routing failure (wrong agent chosen, agent produces wrong output, agent fails its task), the Router MUST:

1. Log a gap-log entry with `type: "routing_failure"` (not just `cleanup_finding`)
2. Self-reflect: was the agent choice wrong? Should a different agent have been used?
3. For devops commit failures specifically: immediately switch to `nodejs-pro` (confirmed reliable) rather than retrying devops or blaming the agent
4. When surfacing cleanup issues to the user, own the routing decision — do not blame only the subagent

**Pattern established:** `nodejs-pro` with `git add -u && git commit` is the reliable commit pattern when devops fails. Router must use this as the fallback immediately (not after user intervention).

**Consequences:** Router's gap-log entries must include `routerDecision` field explaining what the router chose and why. Reflection-agent must score routing quality as a dimension.

---

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
