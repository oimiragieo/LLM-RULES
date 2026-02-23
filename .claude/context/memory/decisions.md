## ADR-2026-02-23-062: stale-module-pruner and proactive-audit skill-updater pass (2026-02-23)

**Status:** ACCEPTED
**Date:** 2026-02-23
**Trigger:** User requested skill-updater on stale-module-pruner and proactive-audit.

**Decision:** (1) stale-module-pruner: rewrote stub SKILL.md to v1.0.0 with real workflow (ripgrep-based dead code crawl, dry-run gate, prune report), 5 Iron Laws, 5 Anti-Patterns, Memory Protocol, 6 mandatory skills. Fixed catalog: added to Quick Reference Core Development row (16→17) since parseMarkdownTable() only reads first table. Added developer to agent assignments. (2) proactive-audit: upgraded v1.1.0→v1.2.0, added Mandatory Skills table (6 skills), updated lastVerifiedAt. Both pass validate-integration.

---

## ADR-2026-02-22-061: ecosystem-integrity-scanner skill wired into framework (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Manual skill creation by user; skill-updater workflow applied.

**Decision:** (1) Debugged validate-ecosystem-integrity.cjs from 53 false-positive errors to 0 errors via: walk() \_archive skip, checkArchiveRefs() scoped to .claude/ only, DYNAMIC_SCRIPT_GENERATORS set, test require() filter, agent-registry.json catalog.agents path fix. (2) Archived 3 test files requiring dead modules (metrics-collector, memory-utils, response-aggregator). (3) Wrote SKILL.md v1.1.0 with 5 Iron Laws, 5 Anti-Patterns, Memory Protocol, 6 mandatory skills, proper trigger taxonomy. (4) Created 9 enterprise bundle stubs via scaffolder; updated scripts/main.cjs to wrap the validator with --json mode. (5) Added catalog entry in Validation & Quality section (11→12 skills). (6) Assigned to qa, developer, architect agent frontmatter.

---

## ADR-2026-02-22-060: Batch 49 Skill Updates — web-perf, webmcp-browser-tools, writing-skills (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Production-readiness sweep batch 49 (FINAL BATCH).

**Decision:** (1) web-perf: v1.0.0 verified, Iron Laws (always field data before optimizing, never lab-only metrics, always LCP/INP/CLS targets, never ship without before/after measurement, always critical rendering path first) + Anti-Patterns + Memory Protocol added at end (no prior Memory Protocol). (2) webmcp-browser-tools: v1.1.0 already passing, added verified+lastVerifiedAt, Iron Laws (always feature detection, never for external fetching, always schema-first, never backend-equivalent tools, always polyfill until stable) + Anti-Patterns before Memory Protocol. (3) writing-skills: v1.1→v1.1.0 semver fix, verified, Check 8 fix (TodoWrite→TaskCreate, todos→tasks), Iron Laws (always TDD RED baseline, never impl details in description, always REFACTOR phase, never publish without validator, always active voice) + Anti-Patterns before Memory Protocol.

---

## ADR-2026-02-22-059: Batch 48 Skill Updates — verification-before-completion, vue-expert, wave-executor (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Production-readiness sweep batch 48.

**Decision:** (1) verification-before-completion: v1.0→v1.0.0 semver fix, verified, Iron Laws (never claim completion without fresh verification, always read full output, never hedging language, always red-green-refactor, never commit without all gates passing) + Anti-Patterns before Memory Protocol. (2) vue-expert: v1.0.0 already passing, added verified+lastVerifiedAt, Iron Laws (always Composition API with script setup, never Options API, always Pinia, never mutate store outside actions, always typed defineProps/defineEmits) + Anti-Patterns before Memory Protocol. (3) wave-executor: v1.0→v1.0.0 semver fix, verified, lastVerifiedAt updated, Iron Laws (always fresh Bun process per wave, never exceed MAX_PARALLEL_WAVES, always await completion, never proceed with failed agents, always log wave metadata) + Anti-Patterns before Memory Protocol.

---

## ADR-2026-02-22-058: Batch 47 Skill Updates — variant-analysis, vercel-ai-sdk-best-practices, vercel-deploy (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Production-readiness sweep batch 47.

**Decision:** (1) variant-analysis: v1.0.0 verified, Iron Laws (always start from confirmed seed, never broaden without seed verification, always test against known instance, never report without triage, always check related repos) + Anti-Patterns before Memory Protocol. (2) vercel-ai-sdk-best-practices: v1.0.0, added verified+lastVerifiedAt, Iron Laws (always streaming, never expose keys client-side, always error boundaries, never AI SDK in Client Components, always maxTokens/timeout) + Anti-Patterns before Memory Protocol. (3) vercel-deploy: v1.0.0 verified, Iron Laws (always local build test, never prod without preview, always check env vars, never secrets in commands, always check post-deploy logs) + Anti-Patterns + Memory Protocol added at end (no prior Memory Protocol).

---

## ADR-2026-02-22-057: Batch 46 Skill Updates — troubleshooting-regression, typescript-expert, using-git-worktrees (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Production-readiness sweep batch 46.

**Decision:** (1) troubleshooting-regression: v1.0.0 verified, Iron Laws (always collect evidence first, never change config without reproducing failure, always validate fix with test suite, never resolve without E2E validation, always document root cause) + Anti-Patterns before Memory Protocol. (2) typescript-expert: v1.1.0 verified, lastVerifiedAt updated, Iron Laws (always interfaces over types, never any types, always type guards, never enums, always functional patterns) + Anti-Patterns before Memory Protocol. (3) using-git-worktrees: v1.0.0 already passing, added verified+lastVerifiedAt, Iron Laws (always check .gitignore, never create on dirty tree, always project-local dirs, never delete with uncommitted changes, always prune after removing) + Anti-Patterns before Memory Protocol.

---

## ADR-2026-02-22-056: Batch 45 Skill Updates — thinking-tools, token-saver-context-compression, track-management (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Production-readiness sweep batch 45.

**Decision:** (1) thinking-tools: v1.0.0 verified, Check 8 fix (replaced "Any TODOs introduced?" with "Any open tasks introduced?" to avoid placeholder detection), Iron Laws (always run think-about-collected-information after research, never skip checkpoints when almost done, always answer honestly, never use as ceremony, always document failures) + Anti-Patterns before Memory Protocol. (2) token-saver-context-compression: v1.0.0 already passing, updated verified+lastVerifiedAt, Iron Laws (always hybrid search before compressing, never compress with open uncertainties, always persist via MemoryRecord, never discard contradicting evidence, always inject citations) + Anti-Patterns before Memory Protocol. (3) track-management: v1.0→v1.0.0 semver fix, verified, Iron Laws (always create spec.md before implementation, never implement without plan.md, always log progress.md, never mark [x] without commit SHA, always escalate blockers to [!]) + Anti-Patterns before Memory Protocol.

---

## ADR-2026-02-22-055: Batch 44 Skill Updates — terraform-infra, test-generator, text-to-sql (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Production-readiness sweep batch 44.

**Decision:** (1) terraform-infra: v1.0.0 verified, Iron Laws (always plan before apply, never hardcode credentials, always remote state with locking, never edit state directly, always pin provider versions) + Anti-Patterns before Memory Protocol. (2) test-generator: v1.0→v1.0.0 semver fix, verified, Iron Laws (always analyze existing patterns, never test implementation details, always include edge cases, never shared mutable state, always validate syntax) + Anti-Patterns before Memory Protocol. (3) text-to-sql: v1.0→v1.0.0 semver fix, verified, Iron Laws (always validate schema identifiers, never string interpolation for values, always LIMIT clause, never destructive SQL without confirmation, always explain query logic) + Anti-Patterns + Memory Protocol added at end (no prior Memory Protocol).

---

## ADR-2026-02-22-054: Batch 43 Skill Updates — swarm-coordination, task-management-protocol, tauri-native-api-integration (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Production-readiness sweep batch 43 (task-breakdown is archived, replaced with tauri-native-api-integration).

**Decision:** (1) swarm-coordination: v1.0→v1.0.0 semver fix, verified, Iron Laws (never sequential spawn, always failure detection, never cross-worker comms, always structured handoff, never >7 workers) + Anti-Patterns. (2) task-management-protocol: v1.0.0 verified, Iron Laws (never complete without metadata, always in_progress first, never skip TaskList after, always update discoveries live, never structured data in prose) + Anti-Patterns. (3) tauri-native-api-integration: v1.0.0 verified, Iron Laws (never all-commands exposed, always validate Rust-side, never sync I/O, always tauri-specta types, never large sync transfers) + Anti-Patterns.

---

## ADR-2026-02-22-053: Batch 42 Skill Updates — subagent-driven-development, summarize-changes, svelte-expert (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Production-readiness sweep batch 42.

**Decision:** (1) subagent-driven-development: v1.0.0 already passing, added verified+lastVerifiedAt, Iron Laws (never sparse spawn prompts, always two-stage review, never reuse agents, always verify TaskUpdate, never mark done before all stages pass) + Anti-Patterns. (2) summarize-changes: v1.0.0 verified, Iron Laws (never file list without context, always verification checklist, never omit breaking changes, always conventional commits, never skip summary) + Anti-Patterns. (3) svelte-expert: v1.0.0 verified, Iron Laws (never Svelte 4 syntax, always SvelteKit routing/load, never stores for local state, always error.svelte, never skip accessibility) + Anti-Patterns.

---

## ADR-2026-02-22-052: Batch 41 Skill Updates — starknet-react-rules, static-analysis, strict-user-requirements-adherence (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Production-readiness sweep batch 41.

**Decision:** (1) starknet-react-rules: v1.0.0 already passing, added verified+lastVerifiedAt, Iron Laws (never skip wallet/chain validation, always handle tx states, never hardcode addresses, always use ABI types, never skip wallet error handling) + Anti-Patterns before Memory Protocol. (2) static-analysis: v1.0.0 verified, Iron Laws (never deploy without Semgrep+CodeQL, always fresh database, never suppress without rationale, always block on CRITICAL/HIGH, never scan test dirs) + Anti-Patterns before Memory Protocol. (3) strict-user-requirements-adherence: v1.0.0 already passing, added verified+lastVerifiedAt, Iron Laws (never implement beyond spec, always validate acceptance criteria, never interpret ambiguity, always flag scope creep, never skip traceability) + Anti-Patterns before Memory Protocol.

---

## ADR-2026-02-22-051: Batch 40 Skill Updates — spec-critique, spec-gathering, spec-init (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Production-readiness sweep batch 40.

**Decision:** (1) spec-critique: v1.0.0 already passing, updated lastVerifiedAt, Iron Laws (never approve contradictions, always surface assumptions, never skip scope creep, always validate edge cases, never critique implementation) + Anti-Patterns added. (2) spec-gathering: v1.0.0 verified, fixed Check 8 (replaced grep "{{" with grep -E '[{]{2}'), Iron Laws (never implement without spec, always capture NFRs, never accept vague criteria, always document out-of-scope, never skip confirmation) + Anti-Patterns added. (3) spec-init: v1.0.0 verified, Iron Laws (never exceed 7 questions, always detect intent type, never skip validation, always save to correct location, never skip track metadata) + Anti-Patterns added.

---

## ADR-2026-02-22-050: Batch 39 Skill Updates — smart-revert, solidjs-expert, sparc-methodology (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Production-readiness sweep batch 39.

**Decision:** (1) smart-revert: v1.0.0 already passing, verified, Iron Laws (never force-push without confirmation, always analyze impact, never exceed scope, always verify with tests, never skip confirmation gate) + Anti-Patterns added before Memory Protocol. (2) solidjs-expert: v1.0.0 already passing, verified, Iron Laws (never React patterns, always createStore, never destructure props, always use For/Show components, never DOM in render) + Anti-Patterns added before Memory Protocol. (3) sparc-methodology: v2.7.0 verified, fixed Check 8 (replaced TodoWrite/todos with TaskCreate/tasks), Iron Laws (never implement before Specification, always failing tests first, never skip phase gates, always map dependencies, never claim completion without evidence) + Anti-Patterns + Memory Protocol added at end.

---

## ADR-2026-02-22-049: Batch 38 Skill Updates — session-handoff, shadcn-ui, smart-debug (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Production-readiness sweep batch 38.

**Decision:** (1) session-handoff: v1.0.0 verified, Iron Laws (never vague next steps, always absolute paths, never assume prior context, always document rationale, never skip handoff at 150K) + Anti-Patterns added before Memory Protocol. (2) shadcn-ui: v1.0.0 verified, Iron Laws (never install as package, always cn() utility, never hardcode colors, always use shadcn abstraction, never nest interactives) + Anti-Patterns + Memory Protocol added at end. (3) smart-debug: v2.0→v2.0.0 semver fix, lastVerifiedAt updated, Iron Laws (never fix before evidence, always 3-5 hypotheses, never leave instrumentation, always reproduce first, never claim root cause without agreement) + Anti-Patterns added before Memory Protocol.

---

## ADR-2026-02-22-048: Batch 37 Skill Updates — security-architect, semgrep-rule-creator, sequential-thinking (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Production-readiness sweep batch 37.

**Decision:** (1) security-architect: v1.1→v1.1.0 semver fix, verified, replaced `## Rules` prose list with Iron Laws (never approve without review, always OWASP Top 10 2025 + ASI01-ASI10, always fail securely, never trust input, always prioritize by severity) + Anti-Patterns. (2) semgrep-rule-creator: v1.1.0 verified, added Iron Laws (never publish untested, always validate syntax, never HIGH without testing, always include remediation, never pattern-regex as primary) + Anti-Patterns before Memory Protocol. (3) sequential-thinking: v1.0.0→v1.1.0, verified, added Iron Laws (never terminate before hypothesis verified, always adjust totalThoughts, never first-approach-only, always mark revisions, never stop at estimate) + Anti-Patterns before Memory Protocol.

---

## ADR-2026-02-22-015: Batch 4 Skill Updates — artifact-integrator, artifact-lifecycle, artifact-updater (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Production-readiness sweep batch 4.

**Decision:** (1) artifact-integrator: v1.0.0→v1.1.0, verified, Iron Laws (integration queue, SEC-ICE-002, backward-propagation validation, mark processed, update graph) + Anti-Patterns. (2) artifact-lifecycle: v1.0.0→v1.1.0, verified, added agents field, Iron Laws (type-specific creators, decide before act, validate Phase 5, update catalog, no simple updates) + Anti-Patterns. (3) artifact-updater: deprecated skill, already passes validation — no changes needed.

---

## ADR-2026-02-22-014: Batch 3 Skill Updates — angular-expert, api-development-expert, architecture-review (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Production-readiness sweep batch 3.

**Decision:** (1) angular-expert: v1.0.0→v1.1.0, verified, added Iron Laws (standalone components, no input mutation, unsubscribe, OnPush, no any-type) + Anti-Patterns table (6 rows). (2) api-development-expert: v1.1.0→v1.2.0, added Iron Laws (versioning, HTTP status codes, OpenAPI, no sensitive errors, rate limiting) + Anti-Patterns table (6 rows). (3) architecture-review: v1.0→v1.1.0 (fixed semver), verified, added Iron Laws (review before implementation, no undocumented SPOF, NFRs, document trade-offs, no circular deps) + Anti-Patterns table (6 rows).

---

## ADR-2026-02-22-013: Batch 2 Skill Updates — agent-tool-design, ai-ml-expert, android-expert (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Production-readiness sweep batch 2.

**Decision:** (1) agent-tool-design: bumped to v1.1.0, verified=true, added 5 Iron Laws (named params, machine-readable errors, no mixed reads/writes, idempotency, partial failure). (2) ai-ml-expert: bumped to v2.1.0, added 5 Iron Laws (fix seeds, never fit on test, multiple metrics, no test-set tuning, establish baseline). (3) android-expert: bumped to v2.1.0, fixed false-positive TODO from toDomain(), added 5 Iron Laws (collectAsStateWithLifecycle, private mutable state, content descriptions, no runBlocking, LazyColumn stable keys). All now conform to production SKILL.md standard.

---

## ADR-2026-02-22-012: advanced-elicitation + agent-evaluation SKILL.md Updates (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Batch 1 of production-readiness skill-updater sweep. Both advanced-elicitation (v1.0.0) and agent-evaluation (v1.0.0) were missing Iron Laws section and Anti-Patterns table — mandatory components for production-grade skills.

**Decision:** (1) advanced-elicitation: bumped to v1.1.0, verified=true, added 5 Iron Laws (no auto-application, emit confidence, max 5 methods per SEC-AE-001, check budget, never replace evidence), added Anti-Patterns table (6 rows). (2) agent-evaluation: bumped to v1.1.0, expanded single "Iron Law" to full 5-law section, added Anti-Patterns table (6 rows). Both now conform to production SKILL.md standard.

**Rationale:** Skills without Iron Laws and Anti-Patterns tables lack enforcement clarity — agents don't know what failure modes to avoid. Production-ready skills require both.

---

## ADR-2026-02-22-011: accessibility SKILL.md Iron Laws Addition (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Batch 1 of production-readiness skill-updater sweep. accessibility (v2.1.0) had strong Anti-Patterns table but was missing Iron Laws section.

**Decision:** accessibility bumped to v2.2.0, added 5 Iron Laws: (1) always start with semantic HTML, (2) never remove focus indicators, (3) always test with real assistive tech, (4) never convey info by color alone, (5) always apply WCAG 2.2 AA criteria (2.4.11, 2.5.7, 2.5.8, 3.3.8).

**Rationale:** Iron Laws make enforcement explicit and machine-checkable. WCAG 2.2 specific criteria in Iron Law 5 ensures developers know the exact new success criteria added in WCAG 2.2.

---

## ADR-2026-02-22-010: memory-search Mandatory Skill + SKILL.md Rewrite (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** The memory-search skill was a manually created stub. Agent ecosystem requires all agents to dynamically query live memory to avoid stale-context errors across long sessions and multi-agent pipelines.

**Decision:** (1) memory-search is now a MANDATORY skill for ALL agents — added to agent-creator's default skills list and agent-updater's MANDATORY_SKILLS constant. (2) SKILL.md rewritten from generic template (v1.0.0) to full production documentation (v2.0.0) grounded in the real memory-search.cjs library implementation. (3) agent-updater/scripts/main.cjs now includes checkMandatorySkills() which reads agent frontmatter and reports missing mandatory skills in patch plan output.

**Mandatory Skills (all agents):** task-management-protocol, ripgrep, code-semantic-search, token-saver-context-compression, verification-before-completion, memory-search

**Rationale:** Without memory-search, agents operate from stale in-session context only — they can't query previously documented patterns, ADRs, or workarounds. This was causing inconsistent behavior across multi-agent sessions and session restarts.

---

## ADR-2026-02-22-009: Universal Gap Trigger + arXiv Mandatory Research — All _-creator and _-updater Skills (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Process gap analysis: the 11-row Universal Companion Artifact Gap Trigger table and mandatory arXiv research gate only existed in agent-creator and agent-updater. The other 12 creator/updater skills had partial (5-row) or missing tables, and treated arXiv as "fallback" rather than a first-class research step.

**Decision:** Propagate the Universal Gap Trigger table and mandatory arXiv gate to all 12 remaining _-creator and _-updater skills:

- skill-creator (v2.2.0→v2.3.0), skill-updater (v1.1.0→v1.2.0)
- hook-creator (v2.2.0→v2.3.0), workflow-creator (v2.1.0→v2.2.0), workflow-updater (v1.1.0→v1.2.0)
- template-creator (v2.1.0→v2.2.0), schema-creator (v2.2.0→v2.3.0)
- command-creator (v1.1.0→v1.2.0), tool-creator (v1.1.0→v1.2.0)
- rule-creator (v1.1.0→v1.2.0), semgrep-rule-creator (v1.0.0→v1.1.0)
- eval-harness-updater (v1.0.0→v1.1.0)

**Rationale:** Every creator/updater running research should be able to trigger ANY other creator. arXiv contains material on AI agents, evaluation methodology, orchestration patterns, and security that industry sources lag by 12-24 months. Making arXiv mandatory (not fallback) captures this early-signal value.

**arXiv gate pattern:** `mcp__Exa__web_search_exa({ query: 'site:arxiv.org <topic> 2024 2025' })` or `WebFetch({ url: 'https://arxiv.org/search/?query=<topic>&searchtype=all&start=0' })`

**Affected artifacts:** skill-creator, skill-updater, hook-creator, workflow-creator, workflow-updater, template-creator, schema-creator, command-creator, tool-creator, rule-creator, semgrep-rule-creator, eval-harness-updater

---

## ADR-2026-02-22-008: Bidirectional Gap Trigger Expansion — All Artifact Types (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Post-session analysis: kubernetes-specialist agent-creator run silently skipped skill-creator for net-new capability gaps (FinOps, capacity planning, vendor evaluation). agent-updater had no equivalent step at all.

**Decision:** Expand the Bidirectional Gap Trigger in agent-creator (v2.2.0→v2.3.0) and add a companion Step 6 to agent-updater (v1.1.0→v1.2.0). Both now trigger the correct creator for every gap type:

- Substantial reusable skill → skill-creator
- Existing skill missing coverage → skill-updater
- Code scaffolding patterns → template-creator
- Pre/post execution guards → hook-creator
- Multi-phase orchestration → workflow-creator
- Structured I/O validation → schema-creator
- Narrow agent-specific → inline documentation only

**Rationale:** The gap resolution table prevents "document inline what should be a real artifact." Every agent creation and update is now also an opportunity to close ecosystem-wide gaps across skills, templates, hooks, schemas, and workflows.

**Affected artifacts:** agent-creator/SKILL.md (v2.3.0), agent-updater/SKILL.md (v1.2.0)

---

## ADR-2026-02-22-007: agent-updater (advanced-debugging) — eBPF, AI-Agent Debugging, Routing Keyword Gaps (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** agent-updater validation run on advanced-debugging (v1.0.0 → v1.1.0)

**Decision:** Manual creation of advanced-debugging missed 2025/2026 tooling developments, SRE-adjacent capabilities, and routing keyword breadth. agent-updater is confirmed necessary for specialized agents too.

**Delta findings:** (1) AI-Agent Debugging absent — LangSmith, Arize, Langfuse, Maxim AI for non-deterministic LLM agent failures. (2) bpftrace by name and Inspektor Gadget K8s DaemonSet missing. (3) Grafana Tempo, Datadog Continuous Profiler, Pyroscope, LogRocket Galileo absent. (4) MTTR/runbook/toil analysis not covered. (5) 22 routing keywords missing: oomkill, segfault, flaky-test, bpftrace, goroutine-leak, ai-agent-debug, continuous-profiling, etc. (6) ChatDBG LLM+debugger integration pattern not mentioned.

**Related:** `.claude/context/artifacts/research-reports/agent-keywords-advanced-debugging.md`

---

## ADR-2026-02-22-006: Kubernetes Specialist v1.1.0 — Occupational Research Delta (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Step 2.3 + 2.5 occupational research pipeline validation run against kubernetes-specialist v1.0.0

**Decision:** BLS OOH (Computer Network Architects + Network/Systems Admins) + industry research consistently surfaces gaps in manually-created K8s agent. Key deltas applied as v1.1.0 improvements.

**Key deltas found:**

1. **IaC tooling (Terraform/Pulumi):** BLS Network Architects explicitly identifies cluster provisioning IaC. Manual creation covered Helm/Kustomize (app config) but missed cluster-level provisioning tools.

2. **eBPF + Tetragon:** Emerging security/networking paradigm not in manual creation. Cilium Tetragon, eBPF observability are now 2026 mainstream.

3. **FinOps/cost optimization:** BLS lists "analyze system performance to determine future upgrades" — maps to capacity planning and Kubecost/OpenCost tooling. Absent in manual version.

4. **KEDA:** Event-driven autoscaling widely deployed alongside HPA but absent from manual creation.

5. **cert-manager:** Universal in production K8s, missing from original agent.

6. **29 routing keywords missing:** flux, karpenter, eks, gke, aks, kyverno, cert-manager, keda, etcd, cilium, containerd, cni, networkpolicy, etc.

7. **IDP/Platform Engineering framing:** Backstage, Crossplane, vCluster, golden-path patterns not present.

8. **Control plane operations:** etcd backup/restore, kube-apiserver tuning per BLS Network Architects admin tasks.

9. **Problem Indicator Recognition section:** CrashLoopBackOff, OOMKilled, ArgoCD OutOfSync, etc. — surfaced by Step 2.5 keyword research.

**Files changed:** kubernetes-specialist.md (v1.1.0), routing-table-core-map.cjs (+29 keywords), research report created.

---

## ADR-2026-02-22-005: agent-updater Surfaces BLS and Routing Gaps Missed by Manual Creation (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** agent-updater validation run on pm-coordinator (v1.0.0 → v1.1.0)

**Decision:** The agent-updater workflow is confirmed necessary even for recently-created agents. Manual agent creation from persona descriptions alone misses occupational grounding and routing keyword breadth.

**What manual creation missed (delta findings):**

1. **BLS 13-1082 capability gaps**: Budget variance reporting, estimate-at-completion (EAC), vendor/consultant evaluation and selection, procurement planning, client point-of-contact function, produce/distribute project documents — none were in v1.0.0.
2. **PMO setup capability**: PMO charter, maturity model assessment, portfolio prioritization, stage-gate reviews — absent despite being a core PM function.
3. **AI-Driven PM Intelligence (2026 trend)**: Predictive delivery modeling, AI-assisted risk forecasting, real-time resource reallocation, natural language queries over project data — missing despite being a 2026 industry differentiator (Gartner: 80% of traditional PM tasks AI-assisted by 2030).
4. **Routing keyword breadth**: 21 keywords missing — `scrum`, `scrummaster`, `agile`, `agile-coach`, `delivery-manager`, `release-manager`, `pmo`, `kanban`, `wip`, `velocity`, `burndown`, `capacity-plan`, `release-train`, `agile-delivery`, `project-budget`, `vendor-selection`, `raid-log`, `project-portfolio`, `project-coordinator`, `program-coordinator` — all common user phrasings for pm-coordinator work.
5. **Title variant coverage**: Scrum Master, Agile Coach, Delivery Manager, Release Manager, PMO Lead, Project Coordinator, Program Coordinator — none mentioned in v1.0.0 description or routing.
6. **Retrospective keyword conflict**: `retrospective` routes to `reflection-agent` in the routing table, not `pm-coordinator` — this is correct (reflection-agent serves the framework retrospective, while pm-coordinator uses sprint-retro keyword) but worth noting as a non-obvious routing distinction.

**Pattern:** Manual agent creation optimizes for the "happy path" use case (sprint planning, Jira/Linear) but under-represents adjacent and escalated responsibilities found in occupational data.

**Resolution:** agent-updater should be run on all domain agents post-creation as standard practice.

**Related:**

- Research report: `.claude/context/artifacts/research-reports/agent-keywords-pm-coordinator.md`
- Agent: `.claude/agents/domain/pm-coordinator.md` v1.1.0

---

## ADR-2026-02-22-003: Proactive-Audit as Mandatory Final Pipeline Step (2026-02-22 REFLECTION)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Reflection of tasks #28-31 — proactive-audit skill created, CLAUDE.md Step 0.7 added

**Decision:** Whenever a pipeline session creates, modifies, or deletes framework artifacts (hooks, skills, agents, workflows, schemas, templates, CLAUDE.md, routing-table.cjs), the router MUST spawn a QA agent with `Skill({ skill: 'proactive-audit' })` as the final pipeline step before claiming completion.

**Rationale:**

- Framework artifacts have integration dependencies (catalog, index, settings.json, agent frontmatter) that are easy to miss
- No prior mechanism existed to detect broken hooks, missing skill registrations, or routing gaps post-pipeline
- Router Step 0.7 provides automatic invocation via CLAUDE.md enforcement

**Evidence:** Tasks #29 and #30 created skills that appear in catalog but not in skill-index.json — proactive-audit check S-05 would have caught this.

**Scope:** All pipelines touching `.claude/hooks/`, `.claude/skills/`, `.claude/agents/`, `.claude/workflows/`, `.claude/schemas/`, `.claude/CLAUDE.md`, `.claude/lib/routing/routing-table.cjs`

**Related:**

- CLAUDE.md Section 0.1 Step 0.7
- `.claude/skills/proactive-audit/SKILL.md`
- `.claude/context/plans/proactive-audit-design-2026-02-22.md`

---

## ADR-2026-02-22-004: skill-index.json Requires Manual Regeneration After SKILL.md Creation (2026-02-22)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Both webmcp-browser-tools and proactive-audit missing from skill-index.json despite SKILL.md files existing

**Decision:** skill-index.json is NOT auto-populated when SKILL.md files are created manually. The `generate-skill-index.cjs` script must be run explicitly as part of post-creation integration. This is now a mandatory step in skill-creator workflow.

**Command:** `node .claude/tools/cli/generate-skill-index.cjs`

**When to run:** After any new SKILL.md creation, OR after updating `agents:` field in existing SKILL.md frontmatter.

---

## ADR-2026-02-22-001: Post-Creation Integration Documentation Pattern (2026-02-22 REFLECTION)

**Status:** ACCEPTED
**Date:** 2026-02-22
**Trigger:** Meta-reflection of Task #12 (Task #13) — Task 12 documented skill-creator post-creation integration failures using a systematic template

**Decision:** When documenting creation-phase or post-creation workflow failures, use a six-step documentation structure that combines problem analysis with actionable solutions:

**Documentation Template**:

1. **Observed Behavior** — What happened (specific examples, counts, dates)
2. **Impact Assessment** — Why it matters (consequences, scope, affected users/systems)
3. **Root Cause** — Why it happened (mechanism, systemic factors)
4. **Workaround** — How to fix now (step-by-step checklist, agent selection guidance)
5. **Pattern** — How to prevent future (reusable process, applicable contexts)
6. **Agent Selection** — Which tool to use (explicit guidance on agents to use vs. avoid, with empirical evidence)

**Rationale**:

- Task 12 reflection used this template and achieved 0.90 rubric score (EXCELLENT)
- Structure balances diagnosis (steps 1-3) with action (steps 4-6)
- Empirical evidence in step 6 (artifact-integrator ran twice, zero changes) prevents theoretical assumptions
- Template is reusable for all future creator-workflow issues

**Implementation**:

- Document in `.claude/context/memory/learnings.md` as reusable pattern
- Train reflection-agent to use this template for all creation-phase issues
- Include examples: skill-creator gaps, agent-creator gaps, workflow issues

**Related**:

- Task #12 Reflection: Skill-Creator Post-Creation Integration Failures (exemplar)
- Reflection Report: `.claude/context/reports/reflections/reflection-task-13-meta-reflection-2026-02-22.md`

---

## ADR-2026-02-22-002: Reflection-Agent Spawning via Skill() Breaks Atomic Handshake (2026-02-22 REFLECTION)

**Status:** OPEN (BLOCKER)
**Date:** 2026-02-22
**Trigger:** Reflection-agent invoked for tasks 21, 22, 14; cannot call TaskUpdate for atomic completion

**Issue**: Reflection-agent needs TaskUpdate tool to complete atomic handshake (processedReflectionIds metadata). When spawned via Skill() instead of Task(), tool whitelist does not include TaskUpdate.

**Analysis**:

- Reflection-agent should be spawned as `Task()` with full task-lifecycle tool access
- Router Step 0 specifies: "reflection-agent MUST call TaskUpdate({ status: 'completed', metadata: { processedReflectionIds: [...] } })"
- If spawned as a skill instead of agent task, tool restrictions prevent handshake completion
- Results in orphaned reflection-spawn-request.json entries (marked processed: false forever)

**Decision**: Reflection-agent MUST always be spawned as `Task()`, never as `Skill()`.

**Evidence**:

- Error: "No such tool available: TaskUpdate" when reflection-agent calls TaskUpdate()
- Briefing requirement CLAUDE.md Section 0.1: "reflection-agent MUST call TaskUpdate"
- Atomic handshake pattern (MANDATORY): processedReflectionIds in metadata

**Related**:

- ISSUE: Reflection-Agent Cannot Complete Atomic Handshake (2026-02-22)
- `.claude/context/reports/reflections/reflection-tasks-21-22-14-insufficient-data-2026-02-22.md`

---

## ADR-2026-02-21-007: Validate:Skills CI Gate as Mandatory Post-Creation Check (2026-02-21 REFLECTION)

**Status:** ACCEPTED
**Date:** 2026-02-21
**Trigger:** Task #4 — validate:skills CI wiring discovered 177 registration drift errors on first run

**Decision:** `pnpm validate:skills` MUST be run after every skill/agent creation or update as a mandatory post-creation integration check. The script catches catalog/index/agent-file drift before it accumulates. With 177 errors found on first run, this tool surfaced latent ecosystem debt that other checks missed.

**Rationale:**

- 177 errors on first run demonstrates the scale of drift possible without systematic checking
- CI-gate-ready output means this can be wired into `pnpm metrics:ci` or `pnpm ci` script chains
- Complements reflection-agent Step 4.7 (post-creation check) with a repeatable CLI baseline

**Implementation:**

1. Script: `.claude/tools/cli/validate-skill-agent-consistency.mjs` (already exists)
2. pnpm script: `validate:skills` (wired in Task #4)
3. tool-catalog.md entry: added (Task #4)
4. Trigger: Run after any creator skill completes OR manually before commits touching .claude/skills or .claude/agents

**Consequences:**

- **Positive**: Drift caught before accumulation; ecosystem health verifiable in CI
- **Negative**: 177 existing errors require remediation sprint before gate can be enforced in block mode

**Related:**

- Issues.md: 177 Skill/Agent Registration Drift Errors (2026-02-21)
- Task #4 (2026-02-21)

---

## ADR-2026-02-21-008: Dep Scan Command Canonicalization (SEC-ICE-002) (2026-02-21 REFLECTION)

**Status:** ACCEPTED
**Date:** 2026-02-21
**Trigger:** Task #6 — SEC-ICE-002 P1 paper control: canonical dep scan command documented

**Decision:** The canonical dependency vulnerability scan command for this project is `pnpm audit --audit-level=high`. This command is now referenced in `ecosystem-creation-workflow.md` post-creation-validation.md Item 7. All teams must use this exact command when performing dep scans to ensure consistent severity thresholds.

**Rationale:**

- Different audit-level settings produce inconsistent results (critical vs high vs moderate)
- Canonicalizing the command eliminates ambiguity in security reviews
- ecosystem-creation-workflow.md is the authoritative lifecycle doc; referencing Item 7 there ensures visibility

**Related:**

- SEC-ICE-002 P1 paper control (dependency scanning gap)
- Task #6 (2026-02-21)

---

## ADR-2026-02-21-006: CHANGELOG Pre-Commit Hook Enforcement Recommendation (2026-02-21 REFLECTION)

**Status:** PROPOSED
**Date:** 2026-02-21
**Trigger:** Batch reflection tasks #19-25 — Task #22 was a standalone CHANGELOG update task

**Observation:** When CHANGELOG update is a separate task (Task #22), it signals that developers do not update it inline with their commits. ADR-2026-02-21-004 mandates CHANGELOG for ALL, but no hook enforces this at commit time.

**Recommendation:** Add lightweight pre-commit hook check: verify CHANGELOG.md [Unreleased] section modified in any commit that includes non-trivial source code changes. If CHANGELOG not updated, emit warning (not block — to preserve developer velocity).

**Pattern evidence:** Task #22 existence proves the gap. A pre-commit warn mode would surface this gap in-flow without blocking.

**Related:** ADR-2026-02-21-004, Task #22 (2026-02-21)

---

## ADR-2026-02-21-004: Changelog-Mandatory-for-ALL Gate (2026-02-21 REFLECTION DECISION)

**Status:** ACCEPTED
**Date:** 2026-02-21
**Trigger:** Task #23 — enterprise-workflow.md Document phase update

**Decision:** CHANGELOG update is a blocking Quality Gate 5 requirement for ALL complexity levels. `changelogUpdated: true` is required in TaskUpdate metadata for all Document phase completions.

**Rationale:**

- Previously, CHANGELOG was listed as a Document phase step but was only explicitly blocking for HIGH/EPIC in practice
- Making it blocking for ALL prevents the "too small to document" skip pattern (same root logic as missing-taskupdate-metadata-recurring)
- `changelogUpdated: true` metadata field enables machine-verifiable completion by the reflection-agent

**Evidence:** enterprise-workflow.md Quality Gate 5, line 722: `CHANGELOG updated (Keep a Changelog) | ALL | YES`

**Related:** Task #23 (2026-02-21), batch reflection report: `.claude/context/reports/reflections/batch-reflection-tasks-20-23-2026-02-21.md`

---

## ADR-2026-02-21-005: Documentation-as-Contract Pattern (2026-02-21 REFLECTION DECISION)

**Status:** ACCEPTED
**Date:** 2026-02-21
**Trigger:** Cross-task analysis of Tasks #20 and #23

**Decision:** Workflow quality gate tables with explicit "Required For" and "Blocking?" columns function as machine-readable contracts. New phases MUST pair gate table conditions with corresponding TaskUpdate metadata fields to enable objective reflection scoring.

**Pattern:**

1. Workflow phase defines required outputs
2. Gate table specifies scope (ALL/MEDIUM+/HIGH+/EPIC) and blocking conditions
3. TaskUpdate metadata field provides verifiable completion signal
4. Reflection-agent checks metadata against gate requirements

**Examples:**

- Task #23: CHANGELOG → Quality Gate 5 (ALL, blocking) → `changelogUpdated: true`
- Existing: docs → Quality Gate 5 → `docsUpdated: [...]`

**Related:** Task #23 and Task #20 batch reflection (2026-02-21), `.claude/context/reports/reflections/batch-reflection-tasks-20-23-2026-02-21.md`

---

## ADR: smart-debug scope — domain developer agents (2026-02-21)

Decision: Add smart-debug to core developer.md only. Domain developer agents (python-pro, nodejs-pro, etc.) deferred to Phase 2 architect review to determine if they need it.
Rationale: Domain agents inherit from core developer patterns; architect should evaluate if the debugging upgrade is universal or role-specific.
Status: PENDING Phase 2 review

## ADR-2026-02-21-003: Skill-Index agentPrimary Must Be Verified After SKILL.md Frontmatter Updates (2026-02-21 REFLECTION DECISION)

**Status:** ACCEPTED
**Date:** 2026-02-21
**Trigger:** smart-debug audit reflection (Task #4)

**Decision:** When updating SKILL.md frontmatter `agents:` field (or skill-catalog.md primary agents), the skill-index.json MUST be regenerated AND verified. Frontmatter updates alone are insufficient because `generate-skill-index.cjs` sources `agentPrimary` from `agent-skill-matrix.json` lookup tables, not directly from SKILL.md frontmatter.

**Root Cause Observed:**

- smart-debug SKILL.md frontmatter: `agents: [developer, devops-troubleshooter, qa]`
- skill-catalog.md: `developer, devops-troubleshooter, qa`
- skill-index.json agentPrimary: `["developer"]` — only one agent, missing two

**Resolution Chain:**

1. Update SKILL.md frontmatter agents field
2. Update `agent-skill-matrix.json` to add explicit agent → skill mappings
3. Run `node .claude/tools/cli/generate-skill-index.cjs`
4. Verify with: `node -e "const idx=require('./.claude/config/skill-index.json'); console.log(idx.skills['smart-debug'].agentPrimary)"`

**Applicability:** All skills with multi-agent assignments. Especially critical for skills that should be invoked by non-developer agents (devops-troubleshooter, qa, architect, security-architect) as the index mismatch makes them invisible to those agents' skill discovery.

**Related:**

- Reflection report: `.claude/context/reports/reflections/reflection-smart-debug-lint-2026-02-21.md`
- Issues.md: smart-debug CLAUDE.md Reference Gap (2026-02-21)

---

## ADR-2026-02-21-001: Opt-in HITL Pattern for Debugging Skills (2026-02-21 REFLECTION DECISION)

**Status:** ACCEPTED
**Date:** 2026-02-21
**Trigger:** smart-debug v2.0 update (Tasks 4-5)

**Decision:** Debugging skills that include a human-in-the-loop reproduction gate MUST default to auto-reproduction (HITL=false) and provide HITL as opt-in via environment variable. Pattern: `SMART_DEBUG_HITL=false` (or unset) = auto-reproduce; `SMART_DEBUG_HITL=true` = pause for human reproduction.

**Rationale:**

- AI debugging agents can auto-reproduce most bugs (~80%) via existing tests/scripts
- Mandatory HITL blocks every debugging session waiting for human, even when unnecessary
- Opt-in HITL preserves escape hatch for UI-dependent bugs, hardware-specific conditions, race conditions requiring specific user timing
- Consistent with framework convention: features default to autonomous, humans opt-in

**Implementation:**

- SKILL.md frontmatter: document SMART_DEBUG_HITL env var in Configuration table
- .env: `SMART_DEBUG_HITL=false` in Section 2 (Feature Flags) with descriptive comment
- .env.example: same — ensures operators can discover and override

**Auto-reproduction fallback behavior:**

1. Run existing tests covering affected code path
2. Execute reproduction scripts if present
3. Trigger code path directly via CLI/API/unit invocation
4. If auto-reproduction succeeds: proceed to log analysis (no human pause)
5. If auto-reproduction fails: fall back to HITL — ask user to reproduce

**Applicability:** Any skill/agent that includes a human-gated step that could be automated. Default to autonomous; human-gate is opt-in.

**Related:**

- smart-debug SKILL.md v2.0: `.claude/skills/smart-debug/SKILL.md`
- Reflection report: `.claude/context/reports/reflections/reflection-smart-debug-v2-2026-02-21.md`

---

## ADR-2026-02-21-002: Hypothesis-Ranking Gate as Mandatory Debugging Pre-condition (2026-02-21 REFLECTION DECISION)

**Status:** ACCEPTED
**Date:** 2026-02-21
**Trigger:** smart-debug v2.0 Cursor Debug Mode implementation

**Decision:** Debugging skills MUST enforce a hypothesis-ranking gate before any code instrumentation. The gate is an Iron Law, not a guideline.

**Required hypothesis format:**

- Probability % (estimated likelihood)
- Supporting evidence (already observed)
- Falsification criteria (what would disprove it)
- Testing approach (how instrumentation confirms/denies)
- Expected symptoms (observable behavior if true)

**Minimum**: 3 hypotheses. Maximum: 5. Forces prioritization.

**Rationale:**

- Broad "exploratory logging" generates noise rather than signal
- Hypothesis-first constrains each log line to test a specific theory
- Probability ranking prevents spending instrumentation budget on low-probability causes first
- Falsification criteria enable definitive root cause confirmation (not just confirmation bias)

**Implementation (smart-debug v2.0 Iron Law):**

```
NO INSTRUMENTATION BEFORE RANKED HYPOTHESES.
NO FIX BEFORE LOG-CONFIRMED ROOT CAUSE.
NO COMPLETION BEFORE INSTRUMENTATION CLEANUP.
```

**Session-scoped instrumentation pattern:**

- Each log line must reference a hypothesis ID (H1, H2, etc.)
- Log to `debug-{sessionId}.log` in `.claude/context/tmp/`
- Cleanup: grep for session ID in source files, delete log file

**Applicability:** All debugging workflows where the root cause is not immediately obvious from static analysis.

**Related:**

- smart-debug SKILL.md v2.0: `.claude/skills/smart-debug/SKILL.md`
- Reflection report: `.claude/context/reports/reflections/reflection-smart-debug-v2-2026-02-21.md`

---

## ADR-2026-02-21-012: Gap Capture via Session Gap Log

**Status:** Accepted
**Date:** 2026-02-21

**Context:** The router regularly identifies gaps, failures, retries, and warnings during pipeline execution but had no mechanism to persist these observations. Reflection agents received "Task N completed without summary metadata" — completely blind to what the router observed. This caused learnings to be silently dropped.

**Decision:** Implement a session-scoped JSONL gap log at `.claude/context/runtime/session-gap-log.jsonl`. The router writes gap entries inline using Bash. `reflection-queue-processor.cjs` auto-injects gap context into every reflection spawn prompt. `post-completion-chain.cjs` extracts agent-reported gaps from `TaskUpdate` metadata. `reflection-agent.md` includes an explicit Step 1.5 to analyze gap entries.

**Approach A+B+D(partial):**

- **A (contract):** CLAUDE.md Gap Observation Protocol + router-decision.md Step 9.5 mandate router to write gap entries
- **B (automation):** `reflection-queue-processor.cjs` reads and injects gap log into every reflection prompt automatically
- **D partial:** `post-completion-chain.cjs` extracts `metadata.gapLog` arrays from agent TaskUpdate calls

**Files changed:** CLAUDE.md, router-decision.md, reflection-queue-processor.cjs, post-completion-chain.cjs, reflection-agent.md, session-gap-log-entry.schema.json, schema-catalog.md

**Consequences:**

- Reflection agents now receive full cross-agent pipeline context automatically
- Router observations (retries, stalls, integration gaps, placeholder outputs) are no longer silently lost
- `session-gap-log.jsonl` is session-scoped runtime file (not committed to git)
- Reflection prompts capped at 20 most recent gap entries to control prompt size
- Gap extraction in post-completion-chain.cjs is wrapped in try/catch — non-critical path

**Rejected approaches:**

- Approach C (capture-issue skill): Router cannot invoke Skill() per Tool Lockdown
- Approach D standalone: Only captures agent-reported gaps, not router-observed gaps

---

## Creator/Updater Alignment Pass — 2026-02-22

**Decision:** Align all creator and updater skills to match the integration standards established by agent-creator (v2.2.0) and skill-creator (v2.1.0).

**Changes applied:**

- `workflow-updater` (v1.0.0 → v1.1.0): Near-complete rewrite — added Alignment Contract, Protected Sections Manifest, Security Review Gate, Phase Agent Validation, Core Workflow Update Contract, Enterprise Acceptance Checklist with evolution-state.json step, Memory Protocol.
- `agent-updater` (v1.0.0 → v1.1.0): Added evolution-state.json and pnpm lint steps to Enterprise Acceptance Checklist.
- `skill-updater` (v1.0.0 → v1.1.0): Extended Step 7 cascade to trigger workflow-updater when skill's existing workflow is stale.
- `command-creator` (v1.0.0 → v1.1.0): Removed stale artifact-updater reference from Step 0 (artifact-updater is deprecated); updated Related Skills.
- `rule-creator` (v1.0.0 → v1.1.0): Same artifact-updater removal; updated Related Skills to reference hook-creator.
- `tool-creator` (v1.0.0 → v1.1.0): Same artifact-updater removal; updated Related Skills to reference hook-creator.

**Root cause of stale artifact-updater references:** command-creator, rule-creator, tool-creator were created before artifact-updater was deprecated. They pointed to a generic delegator that no longer has delegation targets for rules/commands/tools. Direct Read+Edit is now the correct approach for updating these thin-wrapper artifacts.

**Evolution-state tracking:** All 6 skills captured in a single batch evolution-state entry ("2026-02-22-creator-updater-alignment").

---

## Iron Laws Integration — 2026-02-22

**Decision:** Integrate Three Architectural Iron Laws and Typed Artifact Search into skill-creator, hook-creator, and schema-creator creator skills, and create a centralized observability tool.

**Changes applied:**

- `skill-creator` (v2.2.0): Added Step 5 "Typed Artifact Search" (A: schemas, B: scripts/commands, C: hooks) to Research Gate; added Iron Laws I/II/III enforcement items to Enterprise Acceptance Checklist; added "World-Class Iron Laws" section with AJV canonical hook pattern, send-event.cjs observability pattern, and Skill Maturity Model table.
- `hook-creator` (v2.2.0): Added Iron Law 9 (pre-tool AJV schema validation) and Iron Law 10 (post-tool observability event via send-event.cjs) to Iron Laws block.
- `schema-creator` (v2.2.0): Added Iron Law 9 (Typed Tool Calling — every property must have `type` + `description`, reduces hallucination 40-60%, `additionalProperties: false`) to Iron Laws block.
- `.claude/tools/observability/send-event.cjs` (NEW): Centralized observability emitter that appends structured JSONL to `.claude/context/runtime/tool-events.jsonl`. Fields: tool_name, agent_id, session_id, outcome, timestamp. CLI interface with `--tail N` for debugging.

**Iron Law summary:**

- Iron Law I: Every skill's `hooks/pre-execute.cjs` validates input against `schemas/input.schema.json` using AJV (exit 2 on failure).
- Iron Law II: Every `schemas/input.schema.json` property has `type` and `description` — enables Typed Tool Calling.
- Iron Law III: Every `hooks/post-execute.cjs` emits structured event via `send-event.cjs`.

**Evolution-state tracking:** All 3 skills captured in batch entry "2026-02-22-iron-laws-integration".

---

## Three New Agents — 2026-02-22

**Decision:** Create three new specialist agents that were approved in a previous session: kubernetes-specialist, pm-coordinator, and advanced-debugging.

**Agents created:**

- `kubernetes-specialist` (domain, opus): Expert K8s engineer — manifests, Helm/Kustomize, ArgoCD/Flux GitOps, networking, RBAC, operators, multi-cluster. Routing keywords: kubernetes, k8s, kubectl, helm, kustomize, argocd, gitops.
- `pm-coordinator` (domain, sonnet): Project manager — sprint planning, roadmaps, user stories, Jira/Linear, OKRs, dependency mapping, stakeholder communication. Routing keywords: project-management, sprint-planning, roadmap, backlog, jira, linear, okr.
- `advanced-debugging` (specialized, opus): Master debugger — multi-layer investigation, memory leaks, race conditions, distributed tracing, CPU/heap profiling, regression bisect. Routing keywords: memory-leak, race-condition, root-cause, heap-dump, flame-graph, profiling, deadlock.

**Post-creation integration:** routing-table-core-map.cjs updated with keywords, CLAUDE.md Quick Routing table updated, agent-registry.json regenerated (62 → 65 agents), evolution-state.json updated.

## ADR-2026-02-22-016: Batch 5 Skill Updates — arxiv-mcp, ask-questions-if-underspecified, assimilate (2026-02-22)

**Decision:** Apply production-readiness updates to batch 5 skills: arxiv-mcp, ask-questions-if-underspecified, and assimilate.

**Changes applied:**

- `arxiv-mcp` (v2.0.0→v2.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (enforce max_results=20 hard limit, never fetch full PDFs, use Exa for discovery + WebFetch for precision, always use field prefixes in queries, always cite arXiv IDs), added Anti-Patterns table (5 rows). Added to catalog Other row.
- `ask-questions-if-underspecified` (v1.0→v1.1.0): Fixed invalid semver (1.0→1.1.0), replaced generic stub execution steps with real implementation guidance (assess underspecification, triage questions, ask concisely with defaults), added 5 Iron Laws (max 3 questions, provide defaults, never ask implementation details, never block on nice-to-haves, read codebase first), added Anti-Patterns table (5 rows), added concrete usage examples. Added to catalog Other row.
- `assimilate` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, expanded single "The Iron Law" to full 5-law Iron Laws section (never implement directly without gap analysis, always use assimilate workspace, use shallow clones, never execute external scripts, score gaps before backlog), added Anti-Patterns table (5 rows). Already in catalog.

**Validation:** All 3 skills target 8/0/3 on validate-integration.cjs.

## ADR-2026-02-22-017: Batch 6 Skill Updates — astro-expert, async-operations, audit-context-building (2026-02-22)

**Decision:** Apply production-readiness updates to batch 6 skills.

**Changes applied:**

- `astro-expert` (v1.0.0→v1.1.0): Added verified=true, lastVerifiedAt, Iron Laws (5: Astro components for static content, Content Collections with Zod schemas, explicit island directives, use <Image> for optimization, getCollection() not glob()), Anti-Patterns table (5 rows). Already in Frameworks catalog row.
- `async-operations` (v1.0.0→v1.1.0): Added agents field, set verified=true, updated lastVerifiedAt, Iron Laws (5: async/await over .then(), onMount/useEffect for initialization, no forEach with async, explicit error handling, no mixing styles), Anti-Patterns table (5 rows). Added to Code Style & Linting catalog row.
- `audit-context-building` (v1.0.0→v1.1.0): Added agents field (security-architect, code-reviewer, developer), set verified=true, updated lastVerifiedAt (was null), expanded single Iron Law to 5-law section (line-by-line evidence, never trust comments, never skip error paths, map call flows first, record unverified assumptions), added Anti-Patterns table (5 rows). Added to Security catalog row.

## ADR-2026-02-22-018: Batch 7 Skill Updates — auth-security-expert, binary-analysis-patterns, brainstorming (2026-02-22)

**Decision:** Apply production-readiness updates to batch 7 skills.

**Changes applied:**

- `auth-security-expert` (v2.0.0→v2.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (no JWT in localStorage, always validate signature, no HS256 with client secret, no implicit grant, access token expiry ≤15min), added Anti-Patterns table (5 rows). Already in catalog.
- `binary-analysis-patterns` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (static before dynamic, never trust decompiler verbatim, never assume sequential execution, document architecture first, mark static inferences as unverified), added Anti-Patterns table (5 rows). Already in catalog.
- `brainstorming` (v1.0.0→v1.1.0): Added 5 Iron Laws (never propose single solution, YAGNI, one question at a time, prefer multiple-choice, confirm design before implementation), added Anti-Patterns table (5 rows). Already passes validation.

## ADR-2026-02-22-019: Batch 8 Skill Updates — checklist-generator, code-analyzer, code-quality-expert (2026-02-22)

**Decision:** Apply production-readiness updates to batch 8 skills.

**Changes applied:**

- `checklist-generator` (v1.0→v1.1.0): Fixed invalid semver, set verified=true, updated lastVerifiedAt, expanded single Iron Law to 5-law section (no completion without validation, analyze context first, max 50 items, AI-GENERATED prefix, only verifiable items), added Anti-Patterns table (5 rows). Already in catalog.
- `code-analyzer` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (project-wide first, high-complexity+high-churn focus, threshold ≤20, track over time, actionable next steps), added Anti-Patterns table (5 rows). Already in catalog.
- `code-quality-expert` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (leave code cleaner, no magic numbers, self-documenting code, single responsibility, no premature optimization), added Anti-Patterns table (5 rows). Already in catalog.

## ADR-2026-02-22-020: Batch 9 Skill Updates — code-semantic-search, code-structural-search, code-style-validator (2026-02-22)

**Decision:** Apply production-readiness updates to batch 9 skills.

**Changes applied:**

- `code-semantic-search` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (hybrid mode for general search, ripgrep first for keywords, natural-language queries, combine with structural search, don't ignore low-similarity results), added Anti-Patterns table (5 rows). Already in catalog.
- `code-structural-search` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always --lang flag, ripgrep first, never regex for structure, test pattern on known match, use $$$ not \*), added Anti-Patterns table (5 rows). Already in catalog.
- `code-style-validator` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (AST over regex, check existing rules first, warnings don't block CI, provide auto-fix, run in both hooks and CI), added Anti-Patterns table (5 rows). Already in catalog.

## ADR-2026-02-22-021: Batch 10 Skill Updates — commit-validator, complexity-assessment, compliance-policy-check (2026-02-22)

**Decision:** Apply production-readiness updates to batch 10 skills.

**Changes applied:**

- `commit-validator` (v1.0.0→v1.1.0): Added 5 Iron Laws (validate in both pre-commit and CI, require type prefix, enforce 72-char subject, don't block on optional body/footer, always show example in rejection), added Anti-Patterns table (5 rows). Already passes validation.
- `complexity-assessment` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, expanded single Iron Law to 5-law section (never plan without assessment, be conservative, count files, flag unknown tech, ignore casual language), added Anti-Patterns table (5 rows). Already in catalog.
- `compliance-policy-check` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, expanded single Iron Law to 5-law section (no code changes during check, run before HIGH/EPIC, report with remediation, no PASS on partial compliance, recheck after remediation), added Anti-Patterns table (5 rows). Already in catalog.

## ADR-2026-02-22-022: Batch 11 Skill Updates — consensus-voting, container-expert, content-security-scan (2026-02-22)

**Decision:** Apply production-readiness updates to batch 11 skills.

**Changes applied:**

- `consensus-voting` (v1.0→v1.1.0): Fixed invalid semver, set verified=true, updated lastVerifiedAt, added 5 Iron Laws (quorum required, weight by expertise, document dissent, deliberate before escalating, no abstentions on critical), added Anti-Patterns table (5 rows). Already in Specialized Patterns catalog row.
- `container-expert` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (never root, no secrets in images/env, always resource limits, always probes, use docker compose not docker-compose), added Anti-Patterns table (5 rows). Already in Other catalog row.
- `content-security-scan` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, expanded single Iron Law to 5-law section (no incorporation without PASS, scan in same turn, human sign-off for CONDITIONAL, check provenance, never skip for trusted sources), added Anti-Patterns table (5 rows). Already in Security catalog row.

## ADR-2026-02-22-023: Batch 12 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** context-degradation, context-driven-development, convex-development-general

**Changes applied:**

- `context-degradation` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (check every phase boundary, never continue past 100K in same agent, 2+ indicators = one zone higher, invoke compression at Yellow zone, write context summary before claiming complete), added Anti-Patterns table (5 rows). Added to Memory & Context catalog row (count 16→17).
- `context-driven-development` (v1.0→v1.1.0): Fixed invalid semver (1.0→1.1.0), added agents field, set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always read all context artifacts first, never create new artifact types that fit existing categories, update context atomically with code, never let files exceed 20KB, always flag stale context before implementation). Already in Memory & Context catalog row.
- `convex-development-general` (v1.0.0→v1.1.0): Version bumped, added 5 Iron Laws (always use v validators, never include \_id/\_creationTime in schema, always use v.id() for cross-doc references, never mutate from client, always paginate large queries), added Anti-Patterns table (5 rows). Already in External Integrations catalog row.

## ADR-2026-02-22-024: Batch 13 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** creation-feasibility-gate, database-architect, database-expert

**Changes applied:**

- `creation-feasibility-gate` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, expanded single Iron Law code block to 5-law section (never create artifacts inside gate, always run duplication check first, always include evidence, never let WARN silently pass, always include remediation for BLOCK), added Anti-Patterns table (5 rows). Already in Memory & Context catalog row.
- `database-architect` (v1.1.0→v1.1.1): Updated lastVerifiedAt, added 5 Iron Laws (never schema changes without migrations, always 3NF before denormalizing, always index by EXPLAIN ANALYZE, never migrate without production-like data, always use connection pooling), added Anti-Patterns table (5 rows). Already passes 8/0/3.
- `database-expert` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always parameterized queries, never expose DB to frontend, always RLS on multi-tenant tables, never unbounded queries, always transactions for atomicity), added Anti-Patterns table (5 rows). Already in Data & Database catalog row.

## ADR-2026-02-22-025: Batch 14 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** data-expert, debug-log-analysis, debugging

**Changes applied:**

- `data-expert` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always validate at boundaries, never load large data into memory, always sanitize, never regex-parse structured formats, always pure/idempotent transforms), added Anti-Patterns table (5 rows). Already in Data & Database catalog row.
- `debug-log-analysis` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always copy before analysis, never single-grep root cause, always reduce first, never skip structured report, always write to memory), added Anti-Patterns table (5 rows). Already in Core Development catalog row.
- `debugging` (v1.1.0→v1.1.1): Updated lastVerifiedAt, expanded single "The Iron Law" code block to 5-law section (never fix without root cause, always reproduce first, never multi-change per hypothesis, stop after 3 failures, never skip failing test), added Anti-Patterns table (5 rows). Already passes 8/0/3.

## ADR-2026-02-22-026: Batch 15 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** diagram-generator, differential-review, dispatching-parallel-agents

**Changes applied:**

- `diagram-generator` (v1.0→v1.1.0): Fixed invalid semver, set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always Mermaid, never >200 nodes, 1000-file hard limit, always write to artifacts/diagrams, always label connections), added Anti-Patterns table (5 rows). Already in Planning & Architecture catalog row.
- `differential-review` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always triage P0-P3 first, never treat security middleware removal as routine, always use -U10 context, never approve new endpoints without auth verification, always review deletions), added Anti-Patterns table (5 rows). Already in Security catalog row.
- `dispatching-parallel-agents` (v1.0.0→v1.1.0): Version bumped, added 5 Iron Laws (never parallelize shared state, always define owned_paths, always synthesize before acting, never force-parallelize related issues, always verify zero conflicts), added Anti-Patterns table (5 rows). Already passes 8/0/3.

## ADR-2026-02-22-027: Batch 16 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** docker-compose, doc-generator, dry-principle

**Changes applied:**

- `docker-compose` (v1.1→v1.2.0): Fixed invalid semver, added 5 Iron Laws (always V2 command, never hardcode secrets, always health checks, never expose unnecessary ports, always resource limits), added Anti-Patterns table (5 rows). Already in decisions.md and DevOps catalog row.
- `doc-generator` (v1.0→v1.1.0): Fixed invalid semver, set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always extract from code, never non-runnable examples, always progressive disclosure structure, never document internals, always regenerate on change), added Anti-Patterns table (5 rows). Already in Documentation catalog row.
- `dry-principle` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (Rule of Three before extracting, always single source for config, never couple unrelated concepts, prefer readability over DRY, never copy-paste as first resort), added Anti-Patterns table (5 rows). Already in Code Style & Linting catalog row.

## ADR-2026-02-22-036: Batch 25 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** large-data-with-dask, linear-pm, medusa

**Changes applied:**

- `large-data-with-dask` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always single compute() at end, never apply lambda, always explicit partition sizes, never len without compute, always distributed client for CPU-bound), added Anti-Patterns table (5 rows).
- `linear-pm` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always verify API key, never create without dup check, always use state IDs not names, never fetch all without filter, always cache metadata), added Anti-Patterns table (5 rows).
- `medusa` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always extend via module system, never direct DB access, always MedusaRequest/Response types, never store payment data in custom tables, always use workflow engine), added Anti-Patterns table (5 rows).

---

## ADR-2026-02-22-035: Batch 24 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** jira-pm, k8s-manifest-generator, kafka-development-practices

**Changes applied:**

- `jira-pm` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always verify project key, never PUT for status change, always JQL for search, never create without dup check, always include required fields), added Anti-Patterns table (5 rows).
- `k8s-manifest-generator` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always resource limits, never run as root, always probes, never secrets in ConfigMaps, always PodDisruptionBudget), added Anti-Patterns table (5 rows).
- `kafka-development-practices` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always acks=all, never commit before processing, always idempotent consumers, never auto-offset-reset=earliest in prod, always set max.poll.interval.ms), added Anti-Patterns table (5 rows).

---

## ADR-2026-02-22-034: Batch 23 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** interactive-requirements-gathering, ios-expert, java-expert

**Changes applied:**

- `interactive-requirements-gathering` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always one question at a time, never use unselected options in output, always classify Additive/Exclusive, never skip confirmation, always include Type-your-own), added Anti-Patterns table (5 rows).
- `ios-expert` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always @MainActor for UI, never @State for shared data, always weak self in closures, never I/O on main thread, always struct views), added Anti-Patterns table (5 rows).
- `java-expert` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always constructor injection, never Optional.get() without check, always explicit @Transactional boundaries, never default @Async executor, always specific @ControllerAdvice), added Anti-Patterns table (5 rows).

---

## ADR-2026-02-22-033: Batch 22 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** incident-runbook-templates, insight-extraction, insecure-defaults

**Changes applied:**

- `incident-runbook-templates` (v1.0→v1.1.0): Fixed invalid semver, set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always write before incident, never assume knowledge, always include rollback, never skip updating after incident, always define explicit escalation triggers), added Anti-Patterns table (5 rows).
- `insight-extraction` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always extract immediately, never record activity only, always check for duplicates, never write vague insights, always tag with domain), added Anti-Patterns table (5 rows).
- `insecure-defaults` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always CRITICAL for hardcoded credentials, never TLS bypass, always scan config files, never manual-only scan, always verify fail-secure), added Anti-Patterns table (5 rows).

---

## ADR-2026-02-22-032: Batch 21 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** github-ops, go-expert, graphql-expert

**Changes applied:**

- `github-ops` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always Map→Identify→Fetch, never fetch without listing first, always use --jq, never unscoped search, always prefer gh api over direct file reads), added Anti-Patterns table (5 rows).
- `go-expert` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, fixed Check 8 false-positive by changing "todos" to "unresolved items", added 5 Iron Laws (always return errors explicitly, never share mutable state without sync, always propagate context, never ignore errors, always defer for resource release), added Anti-Patterns table (5 rows).
- `graphql-expert` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always depth/complexity limits, never introspection in production, always DataLoader for N+1, never auth only at schema level, always cursor-based pagination), added Anti-Patterns table (5 rows).

---

## ADR-2026-02-22-031: Batch 20 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** framework-context, gamedev-expert, git-expert

**Changes applied:**

- `framework-context` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, expanded single Iron Law code block to 5-law section (always load context first, never fabricate paths, always scope load, never write from this skill, always report missing sources), added Anti-Patterns table (5 rows).
- `gamedev-expert` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always object pooling, never logic in render tick, always state machines, never raw input in entities, always profile before optimizing), added Anti-Patterns table (5 rows).
- `git-expert` (v1.1.0→v1.2.0): Updated lastVerifiedAt, expanded Safety Rules section to 5 Iron Laws (never force-push shared branches, never commit secrets, always run tests before push, always rebase before merge, never rewrite pushed history), added Anti-Patterns table (5 rows).

---

## ADR-2026-02-22-030: Batch 19 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** fiber-routing-and-csrf-protection, finishing-a-development-branch, flutter-expert

**Changes applied:**

- `fiber-routing-and-csrf-protection` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always validate CSRF tokens on state-changing routes, never inline auth in handlers, always ctx.Locals for validated user data, never render unescaped user input, always group routes with shared middleware), added Anti-Patterns table (5 rows).
- `finishing-a-development-branch` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always run test suite first, never force-push without explicit request, always present exactly 4 options, never delete without typed confirmation, always clean worktree for options 1 and 4 only), added Anti-Patterns table (5 rows).
- `flutter-expert` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always const constructors, never async in build, always separate business logic from UI, never setState for shared state, always full null safety), added Anti-Patterns table (5 rows).

---

## ADR-2026-02-22-029: Batch 18 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** eval-harness-updater, expo-framework-rule, fiber-logging-and-project-structure

**Changes applied:**

- `eval-harness-updater` (v1.1.0→v1.1.1): Updated lastVerifiedAt, added Memory Protocol section, confirmed Iron Laws (always research gate first, never remove criteria without replacement, always check creator ecosystem, never update in isolation, always preserve backward compatibility) and Anti-Patterns table already present.
- `expo-framework-rule` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, fixed Check 8 false-positive by replacing inline JSX styles (`style={{ flex: 1 }}` → `style={styles.camera}`, `style={{ width: 200, height: 200 }}` → `style={styles.image}`), added 5 Iron Laws (always Expo Router, never eject early, always EAS Build, never expo-av for camera, always expo-image), added Anti-Patterns table (5 rows).
- `fiber-logging-and-project-structure` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, confirmed Iron Laws (always structured logging, never business logic in handlers, always ctx.Locals for request scope, never commit secrets, always cmd/internal/pkg structure) and Anti-Patterns table already present.

---

## ADR-2026-02-22-028: Batch 17 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** dynamic-api-integration, elixir-expert, enhance-prompt

**Changes applied:**

- `dynamic-api-integration` (v1.0.0→v1.1.0): Expanded single Iron Law code block to 5-law section (never hardcode API keys, always discover spec first, never skip pagination, always retry with backoff, never skip response validation), updated lastVerifiedAt. Already has Anti-Patterns table. Already in External Integrations catalog row.
- `elixir-expert` (v1.0.0→v1.1.0): Version bumped, added 5 Iron Laws (always pattern matching for control flow, never shared mutable state, always supervision trees, never Enum on large streams, always doctests for public functions), added Anti-Patterns table (5 rows). Already passes 8/0/3.
- `enhance-prompt` (v1.0.0→v1.1.0): Version bumped, updated lastVerifiedAt, added 5 Iron Laws (always analyze ambiguities first, never add unrequested requirements, always preserve original intent, never over-verbosify, always include success criteria). Already has Anti-Patterns section. Already passes 8/0/3.

## ADR-2026-02-22-037: Batch 26 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** medusa-security, memory-forensics, memory-quality-auditor

**Changes applied:**

- `medusa-security` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always verify installation, never AI-only mode as release gate, always --fail-on high in CI, never skip SARIF upload, always fix CRITICAL/HIGH before merge), added Anti-Patterns table (5 rows).
- `memory-forensics` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always hash dump immediately, never analyze on live suspect system, always verify OS profile, never trust single plugin, always work from forensic copy), added Anti-Patterns table (5 rows), normalized Memory Protocol paths from absolute Windows paths to relative paths.
- `memory-quality-auditor` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always establish baseline before auditing, never close finding without re-check, always include citation-groundedness checks, never audit STM only, always emit TDD-ready remediation items), added Anti-Patterns table (5 rows), added Memory Protocol section.

---

## ADR-2026-02-22-038: Batch 27 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** mobile-first-design-rules, monorepo-and-tooling, nativewind-and-tailwind-css-compatibility

**Changes applied:**

- `mobile-first-design-rules` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always mobile-first Tailwind, never sub-44px touch targets, always relative units for typography, never omit viewport meta, always optimize images for mobile), added Anti-Patterns table (5 rows).
- `monorepo-and-tooling` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always packages/app split, never commit .env, always Taskfile.yml, never bypass workspace runner, always scope dep installs), added Anti-Patterns table (5 rows).
- `nativewind-and-tailwind-css-compatibility` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always pin exact versions, never upgrade without matrix check, always remove+reinstall together, never Tailwind v4 with NativeWind v2, always include nativewind/preset), added Anti-Patterns table (5 rows).

---

## ADR-2026-02-22-039: Batch 28 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** nativescript, next-cache-components, next-upgrade

**Changes applied:**

- `nativescript` (v1.0.0→v1.1.0): Added verified=true, lastVerifiedAt, added 5 Iron Laws (always platform-specific files, never direct visual tree manipulation, always retain delegates, never deeply nested layouts, always clean up timers/listeners), added Anti-Patterns table (5 rows).
- `next-cache-components` (v'1.0.0'→v'1.1.0'): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always explicit use cache, never cache auth-dependent, always cacheTag on mutable data, never cache mutations, always revalidateTag after mutation), replaced bullet Anti-Patterns with proper 3-column table (5 rows).
- `next-upgrade` (v'1.0.0'→v'1.1.0'): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always dedicated branch, never skip versions, always run codemods first, never undocumented --legacy-peer-deps, always full build+test), added Anti-Patterns table (5 rows).

---

## ADR-2026-02-22-040: Batch 29 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** nextjs-expert, nodejs-expert, on-call-handoff-patterns

**Changes applied:**

- `nextjs-expert` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always App Router, never use client by default, always await Request APIs, never omit error.tsx, always fill+sizes for fluid images), added Anti-Patterns table (5 rows).
- `nodejs-expert` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always validate DTOs, never use callbacks, always global exception filter, never block event loop, always connection pooling), added Anti-Patterns table (5 rows).
- `on-call-handoff-patterns` (v1.0→v1.1.0): Fixed semver, set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always write handoff doc, never skip sync call, always escalate within 30 min, never skip alerting verification, always document next steps), added Anti-Patterns table (5 rows).

---

## ADR-2026-02-22-041: Batch 30 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** php-expert, pipeline-reflection-ux, plan-generator

**Changes applied:**

- `php-expert` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always parameterized queries, never md5/sha1 passwords, always strict_types, never silent Exception catch, always validate at boundary), added Anti-Patterns table (5 rows).
- `pipeline-reflection-ux` (v'1.0.0'→v'1.1.0'): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always Step 0 narration, never batch reflection with dependents, always emit reflection outcome, never per-agent late notifications, always preserve block semantics), added Anti-Patterns table (5 rows), added Memory Protocol section.
- `plan-generator` (v1.1→v1.1.0 semver fix): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws section (always executable command, never 7+ tasks per phase, always verification gates, never plan without rollback, always coordinate specialists). Existing Anti-Patterns table preserved.

---

## ADR-2026-02-22-042: Batch 31 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** planning-with-files, postmortem-writing, prd-generator

**Changes applied:**

- `planning-with-files` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, removed HTML comment template markers from findings.md and progress.md templates (fixed Check 8), fixed `- ## Actions taken:` syntax, added 5 Iron Laws (always create 3 files first, always re-read plan before decisions, never retry with identical inputs, always write multimodal findings immediately, never mark complete without verifying deliverables), replaced 2-column Anti-Patterns with 3-column table (5 rows).
- `postmortem-writing` (v1.0→v1.1.0 semver fix): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always write within 48 hours, never blame individuals, always trace 3+ levels of why, always assign owner/priority/date to actions, never skip what went well), existing 3-column Anti-Patterns table preserved.
- `prd-generator` (v1.0→v1.1.0 semver fix): Set verified=true, updated lastVerifiedAt, replaced single prose Iron Law code block with proper 5 Iron Laws section (never solution before problem, always include Won't in MoSCoW, always measurable hypothesis, always map phase dependencies, never let PRD go stale), added Anti-Patterns table (5 rows).

---

## ADR-2026-02-22-043: Batch 32 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** proactive-audit, project-onboarding, pyqt6-ui-development-rules

**Changes applied:**

- `proactive-audit` (v1.0.0→v1.1.0): Set verified=true, added lastVerifiedAt, added 5 Iron Laws (always run all checks, never trust task metadata, never self-attest PASS, never ignore SE-02, always check hook syntax), replaced bullet Anti-Patterns with 3-column table (5 rows).
- `project-onboarding` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always check existing memories first, never assume conventions, always write to persistent memory, always verify commands, never skip memory updates), added Anti-Patterns table (5 rows) before Memory Protocol.
- `pyqt6-ui-development-rules` (v1.0.0→v1.1.0): Added verified=true, lastVerifiedAt, added 5 Iron Laws (always signal/slot, never block UI thread, always app-level QSS, never absolute pixels, always cross-platform testing), added Anti-Patterns table (5 rows). Note: progressive-disclosure skill directory not found — skipped.

---

## ADR-2026-02-22-044: Batch 33 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** python-backend-expert, qa-workflow, qwik-expert

**Changes applied:**

- `python-backend-expert` (v1.1.0, updated lastVerifiedAt to 2026-02-22): Added 5 Iron Laws (always lifespan context, never session.query in SA2.0+, always parameterized queries, never blocking I/O in async, always Pydantic v2 boundary validation), added Anti-Patterns table (5 rows). ADR+evolution state added.
- `qa-workflow` (v1.0.0→v1.1.0): Updated lastVerifiedAt, replaced single prose Iron Law code block with proper 5 Iron Laws section (never approve without all criteria, always exact file/line in reports, never sign off with failing tests, always full regression suite, never exceed 5 loop iterations), added Anti-Patterns table (5 rows).
- `qwik-expert` (v1.0.0→v1.1.0): Added verified=true, lastVerifiedAt, added 5 Iron Laws (always $ suffix, never browser APIs in body, always useSignal/useStore, never top-level large imports, always functional components), added Anti-Patterns table (5 rows).

---

## ADR-2026-02-22-045: Batch 34 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** react-expert, readme, receiving-code-review

**Changes applied:**

- `react-expert` (v1.1.0, updated lastVerifiedAt): Fixed Check 8 false positives — renamed TodoList/todos to ItemList/items to avoid case-insensitive 'todo' match; replaced `{{Name}}` template placeholders with concrete example names (Button, ContactForm, UserProfile, UserData). Added 5 Iron Laws (always functional components, never violate Rules of Hooks, always push state down, never side effects in render, always small client components), added Anti-Patterns table (5 rows).
- `readme` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt, added 5 Iron Laws (always lead with value, never Quick Start >10 lines, always working examples, never let README go stale, always test links), added Anti-Patterns table (5 rows). Existing Anti-Patterns table retained.
- `receiving-code-review` (v1.0.0→v1.1.0): Added verified=true, lastVerifiedAt, added 5 Iron Laws (never implement without verification, always clarify before implementing, never performative agreement, always one-at-a-time testing, never implement unused features), added Anti-Patterns table (5 rows).

---

## ADR-2026-02-22-046: Batch 35 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** recommend-evolution, requesting-code-review, research-synthesis

**Changes applied:**

- `recommend-evolution` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt. Replaced single-law prose code block with 5 Iron Laws (never spawn orchestrator directly, always validate trigger thresholds, never request evolution for integration gaps, always dual-record to JSONL+report, never proceed without evidence). Added Anti-Patterns table (5 rows).
- `requesting-code-review` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt. Added 5 Iron Laws (always capture SHAs first, never skip review, always fix Critical before proceeding, never argue without evidence, always review at mandatory checkpoints). Added Anti-Patterns table (5 rows).
- `research-synthesis` (v1.0.0→v1.1.0): Set verified=true, updated lastVerifiedAt. Replaced 6-law prose code block "Iron Laws of Research Synthesis" with proper 5 numbered Iron Laws (never create without research, never exceed 5 queries, never exceed 10 KB, always analyze existing codebase, always document decision sources). Added Anti-Patterns table (5 rows).

All three now pass 8/0/3 validation.

---

## ADR-2026-02-22-047: Batch 36 Skill-Updater Sweep

**Date:** 2026-02-22
**Status:** Accepted

**Skills updated:** response-rater, ripgrep, scientific-skills

**Changes applied:**

- `response-rater` (v2.0→v2.0.0 semver fix): Set verified=true, updated lastVerifiedAt. Replaced `## Rules` prose with 5 Iron Laws (always consistent rubric, never skip justification, always use defined thresholds, never vague recommendations, always prioritize by impact). Added Anti-Patterns table (5 rows).
- `ripgrep` (v1.1.0, updated lastVerifiedAt): Set verified=true. Fixed Check 8 false positive — removed `TODO` from `rg "TODO|FIXME|HACK|STUB"` grep example (replaced with `rg "FIXME|HACK|STUB"`). Added Iron Laws (always search:structure first, never hybrid search for audits, always rg -F before edits, never fzf in agent automation, always scope searches). Added Anti-Patterns table (5 rows).
- `scientific-skills` (v2.17.0, updated lastVerifiedAt): Set verified=true. Added 5 Iron Laws (always query databases first, never analyze without documenting, always chain skills, never report without statistical validation, always visualize intermediate results). Added Anti-Patterns table (5 rows). Added Memory Protocol section (was missing).

All three now pass 8/0/3 validation.

---
