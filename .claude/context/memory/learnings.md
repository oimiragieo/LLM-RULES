## Reflection Gate: Phase 0 Data Sufficiency Enforcement (2026-02-22)

When reflection-agent cannot access task summary metadata (filesModified, outputArtifacts), Phase 0 gate MUST block scoring with WITHHELD rather than FABRICATED.

- Withheld scores enable root-cause investigation (tasks missing metadata evidence)
- Fabricated scores hide quality gaps and prevent audit trail closure
- Phase 0 check: Is summary non-fallback? Are filesModified/outputArtifacts provided? If 2+ missing → INSUFFICIENT_DATA
- Pattern applies to all reflection scenarios where task context is unavailable
- Reflection report should indicate which metadata was missing and why it matters for subsequent phases
- Source: Reflection tasks 21, 22, 14 (2026-02-22) — all three lacked accessible metadata, triggering Phase 0 failure

---

## Pattern: Router Gap Observation Reliability Matrix (2026-02-22)

**Context**: Reflection processing of 3 router-observed gap entries (session-gap-log.jsonl) revealed differential reliability

**Findings**:

| Gap Type               | Reliability | False Positive Rate      | Validation Method                               | Recommendation                            |
| ---------------------- | ----------- | ------------------------ | ----------------------------------------------- | ----------------------------------------- |
| **integration_gap**    | HIGH        | LOW (rare)               | File existence checks (catalog, artifact-graph) | TRUST and act on immediately              |
| **missing_metadata**   | HIGH        | LOW (rare)               | Task metadata inspection (summary check)        | TRUST and escalate as blocker             |
| **placeholder_output** | LOW         | HIGH (100% this session) | File metadata only (size/time)                  | VERIFY by reading content before trusting |
| **retry**              | MEDIUM      | MEDIUM                   | Agent completion status + output inspection     | Review actual work, not just retry count  |
| **hook_warning**       | MEDIUM      | MEDIUM                   | Parse hook stderr/stdout                        | Validate hook code matches warning        |

**Implication**: Reflection-agent should apply skepticism filter to placeholder_output gaps — require content verification, not metadata-only assessment.

**Source**: Task completion reflections (2026-02-22) — placeholder_output gap on task-27-research was 100% false positive (actual file had complete 200+ line report)

---

## LEARNING: Post-skill-creation integration checklist (2026-02-21)

After skill-creator completes, ALWAYS do these 4 steps immediately (not after audit):

1. Add skill to CLAUDE.md §8.5 bullet list
2. Add row to skill-catalog.md in correct category section
3. Add skill name to each target agent's `skills:` frontmatter list
4. Verify with Grep that all insertions landed

artifact-integrator is NOT reliable for this wiring work. Use developer agent with exact Edit specs.

evolution-orchestrator needs explicit phase separation — "Phase 1: research" and "Phase 2: create" must be in separate Task() spawns if the orchestrator stalls after Phase 1.

Source: post-session audit 2026-02-21 — 6 skills (enhance-prompt, next-upgrade, vercel-deploy, shadcn-ui, web-perf, next-cache-components) created without any auto-wiring.

---

## Systemic Learning: Router Gap Observation Validation (2026-02-22)

When Router appends gaps to session-gap-log.jsonl, **three categories have different validation maturity**:

1. **Integration gaps** (integration_gap type) — Reliable
   - Examples: missing catalog entry, unwired artifact, missing agent assignment
   - Validation: Direct file checks (catalog exists, artifact-graph shows edges)
   - False positive rate: LOW

2. **Placeholder output** (placeholder_output type) — UNRELIABLE without content validation
   - Example: router flagged task-27-research as "TEST_STUB" based on file metadata
   - Reality: File contained 200+ lines of complete research report
   - Root cause: Router checked file size/existence, not content
   - Fix: Reflection-agent MUST read file content when evaluating placeholder claims
   - False positive rate: HIGH (observable rate: 100% on this session)

3. **Missing metadata** (missing_metadata type) — Reliable
   - Examples: TaskUpdate failed (tool unavailable), task summary is fallback string
   - Validation: Direct task metadata checks
   - False positive rate: LOW

**Practical Implication**: Reflection-agent should treat placeholder_output gaps with skepticism — verify by reading actual file content before accepting the classification.

---

## Pattern: Dual-Layer Drift Detection for Skill Registration (2026-02-21)

**Context**: 14-microtask skill-wiring initiative (M14 final reflection, task-20)

- CLI tool (validate-skill-agent-consistency.mjs) catches accumulated drift at CI gate (before merge)
- Reflection-agent Step 4.7 catches fresh drift immediately post-creation (runtime)
- Neither layer alone is sufficient — together they cover the full lifecycle
- CLI tool proven functional: detected 177 errors + 1242 warnings in live codebase (M12 QA gate)
- Pattern is reusable for any artifact type requiring consistency across multiple authoritative sources (catalog, index, agent-file)
- Source: `.claude/context/reports/reflections/skill-wiring-initiative-2026-02-21.md`

---

## Gotcha: Skill Index Generation Indirection (ADR-2026-02-21-003) (2026-02-21)

**Context**: smart-debug agentPrimary drift diagnosis

- `generate-skill-index.cjs` sources `agentPrimary` from `agent-skill-matrix.json` (lookup table), NOT from SKILL.md frontmatter
- Updating SKILL.md `agents:` frontmatter field alone produces NO change in skill-index.json
- Resolution chain (MANDATORY after frontmatter updates):
  1. Update `agent-skill-matrix.json` to add new agent → skill mappings
  2. Run `node .claude/tools/cli/generate-skill-index.cjs`
  3. Verify: `node -e "const idx=require('./.claude/config/skill-index.json'); console.log(idx.skills['<skill-name>'].agentPrimary)"`
- Applies to ALL skills with multi-agent assignments; critical when assigning non-developer agents
- Source: ADR-2026-02-21-003, `.claude/context/reports/reflections/skill-wiring-initiative-2026-02-21.md`

---

## Pattern: Validation Tool Proven by Live Codebase Detection (2026-02-21)

**Context**: M12 QA gate for validate-skill-agent-consistency.mjs

- A validation tool's value is proven when it finds real errors in the live codebase, not just synthetic tests
- 177 errors + 1242 warnings found in real codebase = strong functional validation signal
- Pattern: always run a new consistency/validation tool against the full live codebase before marking implementation complete
- Source: M12 QA gate outcome, `.claude/context/reports/reflections/skill-wiring-initiative-2026-02-21.md`

---

## Skill Updated: smart-debug HITL opt-in (2026-02-20)

- `SMART_DEBUG_HITL` env var added (default: `false`) — agent auto-reproduces by default via tests/scripts; HITL only if env var is `true` or auto-reproduction fails.
- Configuration section added near top of SKILL.md (before Iron Law, after Context section).
- Step 6 renamed from "HUMAN-IN-THE-LOOP REPRODUCTION GATE (MANDATORY STOP)" to "REPRODUCTION GATE (SMART_DEBUG_HITL-conditional)" with two code paths.
- `best_practices` frontmatter updated to reflect auto-reproduction default.
- Risk level: LOW (wording + workflow step only; no script/schema/hook changes).
- lint:fix and format: 0 errors, 0 changes. Skill index regenerated.

---

## Skill Updated: smart-debug (2026-02-20)

- Skill `smart-debug` updated to version 2.0 with Cursor Debug Mode methodology.
- **7 capability additions**: (1) Hypothesis generation with probability ranking as blocking gate before instrumentation; (2) Structured instrumentation phase with session-scoped log files (`debug-{sessionId}.log` in `.claude/context/tmp/`); (3) Human-in-the-loop reproduction gate — agent stops and waits for user to reproduce before proceeding to log analysis; (4) Log analysis before fix — root cause must be confirmed from log evidence, no speculation; (5) Instrumentation cleanup as mandatory final step with grep verification; (6) Write/Edit tools added to frontmatter (was blocking gap — skill couldn't instrument code); (7) `verified: true` set.
- **Pattern**: Cursor Debug Mode = hypothesis-first, instrument-then-wait, log-confirmed root cause, cleanup-mandatory. This prevents symptom-fixing and ensures evidence-backed debugging.
- **Worked example reference**: `.claude.archive/.tmp/DEBUG/cursor_structural_deadlock_in_task_proc.md` — shows the full methodology applied to a real deadlock (H1–H5 hypotheses, instrumentation at step0-guard + tasklist-first gate, reproduction gate, log analysis confirming H5, cleanup).
- **Skill index regenerated**: `generate-skill-index.cjs` run — smart-debug entry now shows `Write`/`Edit` in `requiredTools` and updated description.
- **Sequential skill update workflow** (reflection: Tasks 1-3, 2026-02-20): For major skill updates (v1.x → v2.0 with 5+ capabilities), use sequential phases: (1) Research (audit existing skill, identify gaps); (2) Implement (add capabilities, set verified: true, update tool/schema); (3) Integrate (catalog entry, agent assignment ≥3 agents, docs cross-ref). Each phase gates the next. Pattern is repeatable and more efficient than parallel when dependencies exist.

---

## 2026-02-20: External Skill Content Ingestion Threat Model

- **Supply chain attack surface**: 9 skills ingest external content via `gh api`, `WebFetch`, `git clone`. Most critical: skill-creator Step 2A, skill-updater Step 2A, skill-creator --install action.
- **Core gap**: Research Gate bypasses the 8-phase external-integration.md workflow. Content fetched and incorporated without security scanning.
- **STRIDE analysis**: 16 threats identified. Most critical: T-1 (prompt injection in SKILL.md, CRITICAL), T-2 (embedded Bash commands, CRITICAL), E-1 (tool escalation via frontmatter, CRITICAL).
- **Red Flag Checklist**: 35 patterns across 6 categories (shell/exec, prompt injection, tool invocation, exfiltration, obfuscation, privilege escalation).
- **Security Review Gate**: 20-line embeddable template with 7-step PASS/FAIL scan. Designed for direct insertion into creator/updater Research Gate steps.
- **New controls proposed**: SEC-EXT-001 (Trusted Source Allowlist), SEC-EXT-002 (Content Pattern Scanner), SEC-EXT-003 (Provenance Audit Log), SEC-EXT-004 (Exfiltration Detection), SEC-EXT-005 (Tool Allowlist Validation), SEC-EXT-006 (Content Size Limit), SEC-EXT-007 (External Content Guard Hook).
- **OWASP Agentic AI mapping**: ASI01 (Goal Hijacking), ASI02 (Tool Misuse), ASI04 (Supply Chain) are CRITICAL relevance.
- **Report**: `.claude/context/reports/security/external-skill-security-protocol-2026-02-20.md`

---

- Updated workflow: evolution-workflow (2026-02-19)

- Updated workflow: missing-workflow-xyz (2026-02-19)

## Integration Queue Batch — 2026-02-19 (skills: ai-ml-expert, rust-expert, android-expert)

- Processed 3 P1 queue entries from skill-updater-pipeline via post-creation-integration.cjs write-trigger.
- All 3 skills (ai-ml-expert, rust-expert, android-expert) had valid catalog entries and agent assignments — no P1 (blocking) gaps.
- **ai-ml-expert**: Catalog primary agent listed as `ai-ml-pro` but no such agent exists; actual consumer is `ai-ml-specialist`. P2 fix needed in skill-catalog.md.
- **rust-expert**: Missing `.claude/rules/rust-expert.md` rules file (ai-ml-expert and android-expert both have rules files). Catalog entry is in secondary "Restored Compatibility Skills" table, not primary "Languages" table. Two P2 tasks proposed.
- **android-expert**: Cleanest integration. One P3 documentation-only note: references non-existent `kotlin-expert` skill in Integration Points.
- Pattern: Skills restored/updated from "Restored Compatibility Skills" catalog section have lower discoverability than skills in primary category tables. Consider promoting Rust to the Languages primary table.
- Report: `.claude/context/reports/integration-analysis-2026-02-19.md`

## Skill Updated: git-expert (2026-02-19)

- Skill `git-expert` was reviewed and updated by the skill-updater pipeline.

## Skill Updated: debugging (2026-02-19)

- Skill `debugging` was reviewed and updated by the skill-updater pipeline.

## Skill Updated: accessibility (2026-02-19)

- Skill `accessibility` was reviewed and updated by the skill-updater pipeline.
- Updated from WCAG 2.1 to WCAG 2.2 (ISO/IEC 40500:2025, current legal standard)
- Added 6 new WCAG 2.2 AA success criteria: 2.4.11 (Focus Not Obscured), 2.5.7 (Dragging Movements), 2.5.8 (Target Size 24x24px), 3.2.6 (Consistent Help), 3.3.7 (Redundant Entry), 3.3.8 (Accessible Authentication)
- Added 2 AAA criteria for reference: 2.4.12 (Focus Not Obscured Enhanced), 2.4.13 (Focus Appearance), 3.3.9 (Accessible Authentication No Exception)
- Key implementation patterns added: scroll-margin-top for sticky headers, min-width/height 24px for targets, drag alternatives via Up/Down buttons, no onpaste blocking on password fields
- European Accessibility Act (EAA) came into law June 28, 2025 — WCAG 2.2 AA is now legally required in EU
- Updated version 2.0.0 → 2.1.0, description and identity updated to reference WCAG 2.2

- Created new agent: qa-guardian (2026-02-20)

- Created new agent: contract-check (2026-02-20)

- Created new agent: bool-action (2026-02-20)

## 2026-02-20: Supply Chain Security Gap Fixes Code Review

- external-content-guard.cjs GAP-A/B/C correctly implemented with safeParseJSON, path traversal validation in writeQuarantineFile, and env var enforcement mode.
- reflection-cleanup.cjs GAP-D correctly delegates to spawn-request-contract.cjs which exports removeStaleRequests() and maxAge option on readSpawnRequestsFile.
- BLOCKING gap: EXTERNAL_CONTENT_GUARD_MODE env var missing from .env.example — must be added to Section 6a before commit.
- Pattern: external-content-guard tests cleanup operates on real quarantine dir rather than temp dir — creates side-effect risk.
- safeParseJSON without schema name uses fallback path; acceptable for trusted-sources.json but worth documenting as conscious decision.
- Report: `.claude/context/reports/security/code-review-supply-chain-fixes-2026-02-20.md`

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-02-20)

- Refreshed agent: .claude/agents/specialized/code-reviewer.md (2026-02-20)

## Task #31: Code-Reviewer Tool Expansion (2026-02-20)

- **Action**: Added Write tool to code-reviewer agent (code-reviewer.md tools array)
- **Motivation**: Enable code-reviewer to write report files directly instead of delegating I/O to developer
- **Corruption Reverted**: Removed malformed routing-table change that was introduced during earlier task
- **Quality Score**: 0.9075 (EXCELLENT)
- **Pattern**: Agent tool scope expansion requires verification that downstream code paths use the new capability. Recommend: After tool additions, grep for Write() calls in agent role definition to ensure new tool is being leveraged.
- **Gotcha**: Agent tool changes affect both tools array AND agent prompt usage. Refreshing tools without updating agent prompt to use them creates "phantom capability" (tool present but unused).
- **Integration Note**: code-reviewer can now write directly to `.claude/context/reports/` directories per workspace-conventions.md rules. Verify file paths are scoped correctly (no creator paths, temp dirs, or user home directories).

---

## Skill Registration Consistency Pattern (2026-02-21)

Three sources must agree for any skill: (1) skill-catalog.md Primary Agents column, (2) skill-index.json agentPrimary array, (3) actual agent .md files skills: frontmatter.
Tool: pnpm validate:skill-consistency
Lesson: Validate at creation time (creator skills) AND at review time (reflection-agent Step 4.7).

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-02-21)

- Created new agent: qa-guardian (2026-02-21)

- Updated workflow: evolution-workflow (2026-02-21)

- Updated workflow: missing-workflow-xyz (2026-02-21)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-02-21)

- Created new agent: contract-check (2026-02-21)

- Created new agent: bool-action (2026-02-21)

- Created new agent: repo-onboarder (2026-02-21)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-02-22)

- Created new agent: qa-guardian (2026-02-22)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-02-22)

- Created new agent: contract-check (2026-02-22)

- Created new agent: bool-action (2026-02-22)

- Updated workflow: evolution-workflow (2026-02-22)

- Updated workflow: missing-workflow-xyz (2026-02-22)

- Created new agent: repo-onboarder (2026-02-22)

- Created new agent: qa-guardian (2026-02-22)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-02-22)

- Created new agent: contract-check (2026-02-22)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-02-22)

- Created new agent: bool-action (2026-02-22)

- Created new agent: repo-onboarder (2026-02-22)

- Updated workflow: evolution-workflow (2026-02-22)

- Updated workflow: missing-workflow-xyz (2026-02-22)

## Gap Capture Pattern: Router → Session Gap Log → Reflection (2026-02-21)

The session gap log (`.claude/context/runtime/session-gap-log.jsonl`) bridges the router's cross-agent observations to the reflection learning system. Without it, retries, stalls, and integration gaps identified by the router are permanently invisible to memory.

**How it works:**

1. Router observes gap during pipeline → appends JSON line to `session-gap-log.jsonl` via Bash (per CLAUDE.md Gap Observation Protocol and router-decision.md Step 9.5)
2. `reflection-queue-processor.cjs` reads gap log → injects formatted entries into reflection spawn prompt automatically
3. Agents can report gaps via `TaskUpdate({ metadata: { gapLog: [{type, description, context}] } })`
4. `post-completion-chain.cjs` extracts agent gapLog entries → appends to session-gap-log.jsonl
5. Reflection agent Step 1.5 → classifies each entry → writes systemic patterns to learnings/issues

**Gap types:** `retry` | `placeholder_output` | `integration_gap` | `hook_warning` | `missing_metadata` | `stall` | `agent_reported`

**This pattern was motivated by a concrete failure (2026-02-21):** artifact-integrator was spawned twice producing placeholder reports, evolution-orchestrator stalled after Phase 1, 3 total agent retries needed to wire 9 files — none of this was captured in reflection because the router had no gap log mechanism.
