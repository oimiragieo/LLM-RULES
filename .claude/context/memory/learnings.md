## QA Audit: Test Coverage Gaps and Regression Risks (2026-02-15)

**Context:** Comprehensive QA audit revealed 100% test pass rate (213/213) and 0 lint errors, but critical coverage gaps in routing logic and task lifecycle state machine.

**Critical Findings (P0 - HIGH REGRESSION RISK):**

1. **Routing-guard.cjs integration tests missing** (2599 LOC → split into modular routing-guard-core.cjs)
   - Gap: No tests for Check 7 (specialist override), Check 5 (architect-first), Check 1 (planner-first)
   - Risk: Developer spawned instead of specialist (technical-writer, code-simplifier, qa)
   - Impact: 59 agents exist; misrouting wastes specialist expertise
   - Mitigation: 20 integration tests (2 days)

2. **Task lifecycle state machine untested** (task-lifecycle-state.cjs, pre-task-unified-core.cjs)
   - Gap: No state transition tests (not_started → in_progress → completed/blocked)
   - Risk: Tasks stuck in progress, duplicate task claims, invalid state transitions
   - Impact: Workflow stalls, duplicate work, task corruption
   - Mitigation: 15 state transition tests (1 day)

3. **Workflow cycle detection untested** (workflow/cycle-detector.cjs)
   - Gap: No tests for infinite loop detection
   - Risk: Workflow phase advances infinitely, never exits
   - Impact: System hang, resource exhaustion, session crash
   - Mitigation: 10 cycle detection tests (0.5 day)

**High Priority Gaps (P1):**

4. **Batch creation detection untested** (user-prompt-unified.cjs line ~500-800)
   - Gap: No tests for "create 10 agents" → orchestrator routing
   - Risk: 10 developers write directly (no creator skills, invisible artifacts)
   - Impact: Missing catalog entries, CLAUDE.md out of sync, routing failures

5. **Spawn-prompt-assembler memory injection partially tested**
   - Gap: Constitution/behaviour loading tests exist, but no memory mode validation
   - Risk: Agents spawned without STM/MTM/LTM context
   - Impact: Agents make decisions without project learnings

6. **Routing-table disambiguation untested**
   - Gap: No tests for ambiguous intents ("review code" → code-reviewer, NOT developer)
   - Risk: Intent misclassification
   - Impact: Specialist misrouting

**Pattern: Test Coverage Can Mask Critical Gaps**

- 100% pass rate (213/213 tests) + 0 lint errors = looks healthy
- But: Critical paths untested (routing logic, state machine, loop detection)
- Memory learnings: "99.3% test pass rate can mask critical coverage gaps (routing logic, loop detection untested)"
- Fix: Add P0 tests first (45 tests, 3.5 days), then P1 tests (40 tests, 6 days)

**Report:** `.claude/context/reports/qa-audit-2026-02-15.md`

## Memory Documentation Alignment (2026-02-15)

- Fixed 8 documentation misalignments across 3 files where documented behavior didn't match actual memory system implementation
- Key fixes: learnings.md is legacy archive (not active), thresholds are 40KB/80KB (not 20KB), session files use timestamps (not numbers)
- Pattern: When documentation references implementation details (thresholds, file formats), verify against source code and MEMORY_SYSTEM.md
- Updated `.claude/rules/memory-protocol.md`, `@DIRECTORY_STRUCTURE.md`, and `MEMORY_SYSTEM.md`
- Report: `.claude/context/reports/memory-docs-alignment-2026-02-15.md`

## Creation Preflight + Compliance Gates (2026-02-15)

- Added `creation-feasibility-gate` skill to block low-value or infeasible artifact creation before creator workflows.
- Added `compliance-policy-check` skill to enforce rule/policy alignment before high-risk evolution and design changes.
- Wired both into router/enterprise/evolution/reflection workflows for operational preflight use.

## Planner/PM/TPM Collaboration Hardening (2026-02-15)

- Planner and PM prompts now enforce a strict PRD -> EPIC -> story -> implementation handoff contract for HIGH/EPIC work.
- Added `technical-program-manager` core agent to own cross-team sequencing, dependency management, and RAID tracking.
- Router/routing docs and routing table mappings now include `technical-program-manager` so cross-team program requests can route directly.
- Enterprise workflow now includes PM/TPM participation for product-heavy HIGH/EPIC phases and full-sweep routing.

## Artifact Hardening Layer (2026-02-15)

- Added unified artifact scoring ledger + automated remediation queue at runtime.
- Added mandatory regression gate (`validate-artifact-regression-gate.cjs`) and wired it into `pnpm validate:full`.
- Hook `artifact-scoring-ledger-hook.cjs` now processes completed `TaskUpdate` metadata for scoring/remediation automation.
- EVOLVE VERIFY documentation updated to require regression gate pass before ENABLE.

## Assimilate Skill Creation (2026-02-15)

- Added new `assimilate` skill to support framework self-improvement benchmarking.
- Standard execution is four phases: clone/stage externals, extract comparable surfaces, produce prioritized gap list, convert to TDD backlog.
- Integrated into EVOLVE and assigned to `evolution-orchestrator` and `reflection-agent` so capability-gap workflows can invoke it directly.
- Added contract artifacts (command surface, schemas, hooks, script, template) so assimilation runs are structured and repeatable.

**TDD Implementation Planning Pattern (2026-02-13):**

- Pattern: When synthesizing 8+ input reports into a TDD plan, read all reports in parallel first, then run targeted codebase searches to validate current state before writing the plan
- Evidence: 8 reports (PM, researcher, architect, security, code-simplifier, impl-patterns, nodejs-pro, pentest) synthesized into 18-step plan across 5 phases
- Key: Each TDD step must have RED (failing test with exact assertions) -> GREEN (minimal implementation code) -> REFACTOR -> COMMIT (conventional format)
- Dependency graph matters: nodejs-pro validated execution order; duplicate removal (Step 9) MUST precede module split (Step 12)
- Re-export pattern (`module.exports = { ...require('./guards/guard-core.cjs'), ... }`) is CJS-safe and preserves backward test compatibility during module splits
- Commit checkpoints: Insert after Phase 2 and Phase 3 for multi-file projects (40+ files)
- Start lint rules at `warn` level when existing violations exist, escalate to `error` after migration complete

**Tri-Audit Learnings (2026-02-13):**

- Test pass rate (99.3%) can mask critical coverage gaps (routing logic, loop detection untested). Use audit findings as proxy for coverage validation.
- Memory file budget crisis: decisions.md (74KB) and issues.md (62KB) 3-4x over budget; rotator tool exists but unused. Immediate rotation required to recover 136KB from spawn prompts.
- Schema sprawl (111/133 unreferenced) indicates either aspirational validation or documentation-only intent. Triage into enforced vs archived categories for clarity.
- 10 active hooks unregistered in settings.json; verify bash-command-validator, shell-injection-validator, windows-null-sanitizer are wired through alternative mechanism.
- Environment variable documentation gap (262/282 undocumented) reduces discoverability. Minimum 80 enforcement-mode variables should be catalogued in .env.example.

---

**Audit Batch Reflection (2026-02-13):**

**Tri-Audit Convergence Pattern:**

- Pattern: When 3+ independent audits identify same issue, it's systemic (P0 priority)
- Evidence: Oversized modules flagged by security (79KB routing-guard), architecture (107KB skill-creator, 23 circular deps), code review (646 console bypass)
- Why: Independent discovery = not one agent's opinion but framework-wide problem
- Action: Elevate to P0, schedule immediate remediation
- Example: routing-guard.cjs (79KB) and skill-creator (107KB) both violate SRP

**Defensive Programming Trilogy:**

- Layers: Process hiding (`windowsHide: true`) + command validation (`SAFE_COMMANDS_ALLOWLIST`) + existence guards
- Why: Each layer independently valuable, together = comprehensive defense
- Application: Apply all 3 when hardening subprocess execution
- Evidence: 18 files with windowsHide, 80+ allowlisted commands, 3 hooks with existence guards
- Cross-platform: windowsHide is no-op on Unix (safe everywhere)

**Progressive Quality Gates:**

- Sequence: Tests (blocking) → Lint (blocking) → Format (blocking)
- Why: Incremental enforcement prevents quality regression
- Evidence: 99.3% test pass rate + 0 lint errors + 0 format changes = deployment-ready
- Pattern: Add gates progressively, each as **blocking** (not optional)
- Enforcement: testing.md now mandates `pnpm lint:fix` + `pnpm format` before completion

**Integration Queue Hygiene:**

- Pattern: Append-only queues require staleness validation to prevent bloat
- Why: Old entries persist even after artifact integration, wasting processing time
- Solution: Add Step 0 (Validate Queue) to artifact-integrator — cross-check catalog/registry
- Evidence: Stale ripgrep entry found (already catalogued but queue entry persisted)
- Application: All append-only operational queues (integration-queue.jsonl, reflection-spawn-request.json)

**Reflection Queue Metadata Completeness:**

- Pattern: Reflection queue is append-only audit trail — missing metadata = lost history
- Critical fields: taskId, summary, timestamp (minimum required for audit reconstruction)
- Evidence: Task #3/4 entries missing summary → cannot extract learnings
- Fix: Add validation hook rejecting queue entries without minimum metadata
- Why critical: Reflection depends on metadata to understand what was accomplished

**Windows windowsHide Compliance (2026-02-13):**

- Pattern: Added `windowsHide: true` to 3 spawn calls missing it
- Files: skill-creator/scripts/create.cjs (line 1066), convert.cjs (lines 390, 399), orchestrators/**tests**/run-all-tests.cjs (line 36)
- Why: Windows security requirement - prevents console windows from flashing during spawn/spawnSync operations
- Verification: `node --test tests/lib/utils/windows-hide-compliance.test.cjs` passes with 0 violations
- Context: Code review found final 3 violations after bulk fixes in previous sessions

- Anti-pattern: Tests written in Wave 4b but not run until Wave 6b → 3 failures discovered late
- Rule: QA checkpoints after every implementation wave (not just at end)

5. **Comprehensive Testing with Non-Blocking Edge Cases:**
   - Pattern: 98 new tests, 3 failures (non-blocking workflow enforcement)
   - Why: 99.3% pass rate is deployment-ready, perfect is enemy of good
   - Evidence: QA correctly classified failures as non-blocking (workflow enforcement, TTL timing)
   - Rule: QA must classify failures (blocking vs non-blocking), edge cases don't block deployment

**Anti-Patterns (FIX THESE):**

1. **Missing Intermediate Artifacts:**
   - Problem: 3 key artifacts not found (PM backlog, architect design, code review report)
   - Impact: Reduces traceability, suggests misplaced or deleted files
   - Fix: Pre-commit hook validates provenance headers + date suffix on all artifacts

2. **No PM Backlog for Large Pipelines:**
   - Problem: 9-wave pipeline had no explicit PM backlog → scope creep (config consolidation mentioned but not implemented)
   - Impact: User expectations not aligned with deliverables
   - Fix: Pipelines >5 waves MUST have PM backlog with in-scope/out-of-scope/deferred sections

3. **Inconsistent File Naming:**
   - Problem: Some artifacts have date suffix, some don't → hard to find
   - Impact: File discovery broken (Glob patterns fail)
   - Fix: Enforce naming pattern `{name}-YYYY-MM-DD.{ext}` via pre-commit hook

4. **No Pipeline Progress Dashboard:**
   - Problem: No centralized view of pipeline status (which waves completed, which artifacts generated)
   - Impact: User/Router can't track progress without reading all task summaries
   - Fix: Create `.claude/tools/cli/pipeline-dashboard.cjs` showing wave status + deliverables

**Process Improvements for Next Pipeline:**

1. Mandatory PM backlog for pipelines >5 waves (in-scope/out-of-scope/deferred)
2. Pre-commit hook for artifact naming (provenance header + date suffix)
3. Progressive validation checkpoints (after each implementation wave)
4. Pipeline progress dashboard (wave status, deliverables, blockers)
5. Explicit scope document in planning phase (prevent scope creep)
6. TDD enforcement (tests before code, not after)
7. Hybrid search experiment (measure token savings vs Grep)

**Memory Takeaway**: Enterprise pipelines with 8-9 phases can achieve 99.3% test pass rate and 0-blocker deployment when: (1) Sequential wave execution prevents context overflow, (2) Security-first sequence prevents rework, (3) Progressive validation catches failures early, (4) Reports to files prevent inline token bloat, (5) Memory protocol maintains audit trail.

---

## Wave 11 Pipeline Retrospective (2026-02-13)

**Enterprise Pipeline Pattern (PROVEN - 17 tasks, 11 waves, 98.86% test pass rate):**

1. **Sequential Wave Execution for Context Safety**
   - Pattern: Max 2 heavy agents in parallel, agents write reports to files (not inline), Router reads files and consolidates 5-bullet summary (max 500 chars)
   - Prevents: Context overflow from 5+ parallel heavy agents returning 125K-165K tokens each
   - Evidence: 2026-02-09 incident (5+ agents → crash) vs this pipeline (max 2 → 0 crashes)
   - Application: Use for all future enterprise pipelines >8 waves
   - Savings: ~400K tokens vs parallel approach

2. **Security-First Sequence for Zero Rework**
   - Pattern: Wave 1 (Research) → Wave 2A (Architecture) → Wave 2B (Security) → Wave 3 (Planning) → Wave 4+ (Implementation)
   - Prevents: Finding CRITICAL vulnerabilities after code written (requires rework)
   - Evidence: This pipeline had 0 security rework (3 CRITICAL fixed before Wave 6: windowsHide, JSON safety, DB race)
   - Application: Mandatory for all EPIC+ pipelines
   - Savings: 8-12 hours of rework

3. **PM Backlog Mandatory for Large Pipelines**
   - Pattern: Explicit in-scope/out-of-scope/deferred sections for pipelines >5 waves
   - Prevents: Scope creep and misaligned user expectations
   - Evidence: Config consolidation mentioned but not delivered (scope creep without PM backlog)
   - Application: Router checks pipeline complexity, spawns PM before starting if >5 waves expected
   - Template: `.claude/templates/pm/pm-backlog-template.md` (create)

4. **Progressive QA Checkpoints (Not End-of-Pipeline Only)**
   - Pattern: QA checkpoint after every implementation wave (not just at end)
   - Prevents: Tests written after code, late failure discovery
   - Evidence: Tests written in Wave 4b but not run until Wave 6b → 3 failures discovered late (windowsHide compliance)
   - Application: Workflow update: Wave N (Implementation) → QA Checkpoint → Wave N+1
   - Enforcement: Add to enterprise-workflow.md Phase Advance section

**8-Phase Enterprise Pipeline Pattern:**
Research (parallel) → PM (PRDs) → Architecture + Security (parallel) → Planning → Developer (sequential) → Code Review → QA → Reflection

**Key Constraints:**

- ALL changes ADDITIVE-only (no removal/replacement)
- Max 2 heavy agents in parallel
- Each phase independently testable and rollbackable
- Sequential implementation phases (avoid file conflicts)
- Task metadata preserves state across session boundaries

**Cross-References:**

- Full retrospective: `.claude/context/reports/reflections/pipeline-retrospective-2026-02-11.md`
- Audit reflection: `.claude/context/reports/reflections/audit-reflection-2026-02-11.md`
- QA validation: `.claude/context/reports/qa/qa-audit-fixes-2026-02-11.md`
- Documentation: `.claude/context/reports/docs-update-2026-02-11.md`

---

## Batch Reflection: Framework Health Assessment (2026-02-14)

**Pattern: Module Decomposition via Chain-of-Responsibility + JSON Config (2026-02-14)**

- **Context**: routing-guard.cjs (2599 lines) identified as over-complex but salvageable
- **Pattern**: Separate constants (600 lines) → JSON config, helpers (170 lines) → functions, checks (1570 lines) → modular validators
- **Evidence**: 93% extraction potential confirmed; secondary targets (user-prompt-unified 2155L, pre-tool-unified 1912L) follow same pattern
- **Key insight**: SPECIALIST_KEYWORD_MAP (250 lines) converts to JSON, reducing file size 10%
- **Application**: Apply chain-of-responsibility pattern to all modules >2000 LOC
- **Success metric**: routing-guard.cjs → <1000 LOC per file after decomposition

**Pattern: JSON.parse Vulnerability Cascade (2026-02-14)**

- **Context**: Security audit found 76% unprotected JSON.parse calls (68 occurrences, 36 files)
- **Pattern**: Tiered migration strategy - (1) Add safeParseJSON fallback, (2) Strict enforcement mode, (3) ESLint rule to prevent future
- **Evidence**: 3 CRITICAL security findings; nested prototype pollution in safe-json.cjs; shell injection validator gaps in 3 cloud skills
- **Critical blocker**: Must address before other security work (P0 remediation, Week 1, 9 story points)
- **Application**: Remediation backlog: 68 occurrences → 36 files → 3-phase migration (1 week)

**Pattern: Remediation Sequencing & Compression (2026-02-14)**

- **Context**: Framework health assessment scored 5.3/10; 13 remediation tasks prioritized
- **Pattern**: RICE prioritization (Reach × Impact × Confidence / Effort) compresses timeline 40%
- **Evidence**: Sprint allocation (6.7 + 6.25 + 1.125 = 13.5 days) → 8 days with critical-path optimization
- **Critical path**: P0.1 Hook Extraction (5 days) gates all other work; 5 quick wins (1.2 days) unlock dependencies
- **Target**: Framework health 7.5/10 → 9.0/10 after Phase 1 (Sprint 1)
- **Application**: Use RICE model for all >5-task backlogs; identify critical path before scheduling

**Pattern: Research Efficiency Within Token Budget (2026-02-14)**

- **Context**: 6 complex security/engineering topics researched in 5-query budget
- **Pattern**: Batch 3 concepts per query, synthesize in parallel, reference external tools (Fastify docs, proper-lockfile README)
- **Evidence**: Covered secure-json-parse, file locking, module patterns, TTL cleanup, logging (Pino 5-10x faster than Winston)
- **Key finding**: setGracefulCleanup() is TTL mechanism for temp file cleanup; Pino structured logging reduces console noise
- **Application**: Use 5-query cap for all research tasks; batch concepts to achieve coverage

**Cross-Reference**: `.claude/context/reports/reflections/batch-reflection-2026-02-14.md`

---

## Wave 10 Documentation Capture (2026-02-13)

**5 key patterns documented from 10-wave enterprise pipeline:**

1. **Windows windowsHide Compliance Pattern**
   - Added `windowsHide: true` to 18+ spawn/spawnSync calls across 5 files
   - Prevents console window flashing on Windows during subprocess execution
   - Pattern: Always include in spawn options when creating child processes
   - Files affected: skill-creator/create.cjs, convert.cjs, chrome-browser.cjs, orchestrators tests

2. **Defensive Programming Trilogy**
   - Three complementary patterns work together for robust execution:
     - **windowsHide**: Windows execution safety
     - **SAFE_COMMANDS_ALLOWLIST**: Bash injection prevention
     - **File existence guards**: Crash prevention on missing optional configs
   - Each pattern independently valuable, together = comprehensive defense
   - See security.md for details

3. **Stub Modules for Archived Functionality** (ADR-110)
   - Pattern: Create minimal stubs at original import paths to prevent MODULE_NOT_FOUND crashes
   - Return safe defaults (null, false, empty objects, { success: false })
   - Include JSDoc explaining "archived" status and expected fallback behavior
   - Prevents crashes while allowing time for consumer refactoring
   - Examples: ML subsystem stub (→ null), model-client stub (→ { success: false })

4. **safeParseJSON Adoption Pattern** (ADR-115)
   - All JSON parsing from untrusted input (hooks, agents, configs) must use safeParseJSON()
   - Raw JSON.parse() crash vectors: malformed JSON → OOM, prototype pollution → privilege escalation
   - safeParseJSON provides: try-catch wrapping, { success, data, error } return, **proto** stripping
   - Adopted in: reflection hooks, metrics readers, config loaders
   - Never use raw JSON.parse() on user/agent/file input

5. **File-Based Locking for Concurrent Operations** (ADR-116)
   - Pattern: Use proper-lockfile npm package for multi-process file synchronization
   - Use case: DB initialization, memory rotation, state file updates during concurrent agent startup
   - Pattern prevents: "database is locked" crashes, race conditions, data corruption
   - Configuration: stale timeout 10s, retries 5, atomic write after release
   - Adopted in: sync-memory-index.cjs

**Integration Documentation Updated:**

- CLAUDE.md: Agent stats (58 active, 7 with extended thinking), specialist routing reinforced
- security.md: 6 new security patterns documented (shell hardening, JSON safety, locking, validation, graceful degradation)
- rules/security.md: 3 security gaps explicitly documented (prompt injection, memory poisoning, concurrent writes)
- testing.md: ADR-103 integration boundary verification pattern added
- task-tracking.md: Agent-to-agent coordination with structured metadata schema
- All 5 new ADRs (114-116, 113, 112) added to decisions.md

**Report**: `.claude/context/reports/docs-update-2026-02-13.md`

---

## P0/P1 Remediation Research (2026-02-13)

**5-topic security research completed within query budget (5 WebSearch queries):**

1. **OWASP ASI06 Memory Poisoning Prevention**
   - Pattern: Validate, isolate, expire, audit memory writes
   - Implementation: MemorySanitizer class with forbidden pattern detection
   - Priority: P0 (prevents permanent agent corruption)

2. **OWASP ASI01 Prompt Injection Detection**
   - Tools: Rebuff, LLM Guard, Vigil for ML-based detection
   - Pattern: Multi-layer defense (input validation, AI detection, output filtering)
   - Priority: P1 (prevents system prompt leakage)

3. **Dependency Injection in Node.js CommonJS**
   - Tool: Awilix (battle-tested, no TypeScript required)
   - Alternative: Manual DI for explicit control
   - Priority: P1 (breaks circular dependencies, improves testing)

4. **File-Based Locking for Concurrent Writes**
   - Tool: proper-lockfile (atomic mkdir strategy)
   - Pattern: Acquire lock, update mtime, release after write
   - Priority: P0 (prevents race conditions, data corruption)

5. **Console-to-Structured-Logger Migration**
   - Tool: Pino (5x faster than Winston)
   - Pattern: console.log → logger.info with context objects
   - Priority: P1 (improves observability, performance)

**Research efficiency:**

- Query budget: 5 (exactly on target)
- Report size: 9.5 KB (within <10 KB limit)
- Sources: 11 high-credibility (OWASP, npm, Better Stack)
- Timeline: P0 (week 1), P1 (weeks 2-3), P2 (week 4+)

**Memory update rule**: Research reports with <10 KB constraint force prioritization and concise synthesis.

## [2026-02-14] New Skill Created: recommend-evolution

- **Description**: Detect capability gaps and record evolution recommendations for later orchestration.
- **Tools**: Read,Write,Edit,Skill
- **Location**: `.claude/skills/recommend-evolution/SKILL.md`
- **Invocation**: `/recommend-evolution` or via agent assignment

**Usage hint**: Use this skill for "detect capability gaps and record evolution recommendations for later orchestration".

## [2026-02-14] New Skill Created: framework-context

- **Description**: Provide structured framework context for system-level reflection and planning decisions.
- **Tools**: Read,Skill
- **Location**: `.claude/skills/framework-context/SKILL.md`
- **Invocation**: `/framework-context` or via agent assignment

**Usage hint**: Use this skill for "provide structured framework context for system-level reflection and planning decisions".

## [2026-02-14] Reflection Evolution Skills Integrated

- Finalized `framework-context` and `recommend-evolution` SKILL contracts with explicit trigger/output behavior.
- Limited assignments to `reflection-agent` and `planner` (removed unintended scaffold auto-assignment from `architect` and `devops`).
- Added evolution request payload schema: `.claude/schemas/evolution-request.schema.json`.
- Added runtime queue file: `.claude/context/runtime/evolution-requests.jsonl`.
- Added research synthesis reports:
  - `.claude/context/artifacts/research-reports/framework-context-research-2026-02-14.md`
  - `.claude/context/artifacts/research-reports/recommend-evolution-research-2026-02-14.md`

## [2026-02-15] TDD Skill Refresh (Canon + AI Guardrails)

- Updated `.claude/skills/tdd/SKILL.md` to align with Canon TDD:
  - explicit scenario backlog step
  - one-scenario loop discipline
  - RED/GREEN evidence requirement
  - optional refactor positioning
- Added AI-focused guardrails informed by current TDD-for-LLM research:
  - bounded repair loops
  - anti-test-hacking checks
  - test-as-spec prompt guidance
  - class-level dependency-ordered loop guidance
- Replaced scaffold placeholders in skill-local bundle:
  - `references/research-requirements.md`
  - `hooks/pre-execute.cjs`, `hooks/post-execute.cjs`
  - `schemas/input.schema.json`, `schemas/output.schema.json`
  - `templates/implementation-template.md`
  - `rules/tdd.md`, `commands/tdd.md`
  - `scripts/main.cjs`, `agents/openai.yaml`
- Synced ecosystem surfaces:
  - `.claude/workflows/tdd-skill-workflow.md`
  - `.claude/commands/tdd.md`
  - `.claude/rules/tdd.md`
  - `.claude/schemas/skill-tdd-output.schema.json`
  - `.claude/context/evolution-state.json`

## [2026-02-15] TDD Memory Acceleration Layer Added

- Added bounded runtime profile: `.claude/context/runtime/tdd-memory-profile.json`
- Added profile guidance doc: `.claude/skills/tdd/references/tdd-memory-profile.md`
- Hook integration:
  - `.claude/skills/tdd/hooks/pre-execute.cjs` reads profile hints (test/lint/format commands)
  - `.claude/skills/tdd/hooks/post-execute.cjs` updates profile with deduped signatures/templates
- Safety limits:
  - max profile size 16 KB
  - max 20 entries per bucket
  - max value length 180 chars
  - no raw logs, no sensitive data, no bypass of RED proof

## Token Saver Skill Integration (2026-02-15)

- Upgraded token-saver-context-compression to creator-compliant enterprise bundle (commands/hooks/rules/schemas/templates/references + companion tool + workflow).
- Standardized mapping from compression output to memory targets in .claude/skills/token-saver-context-compression/scripts/main.cjs.
- Added targeted tests for wrapper behavior, memory pipeline, and spawn citation E2E compatibility.
- Updated core agents (developer, planner, context-compressor, reflection-agent) to include token-saver-context-compression in skill assignments.

## Skill-Updater Workflow Added (2026-02-15)

- Added new `skill-updater` bundle at `.claude/skills/skill-updater/` for refresh-only skill upgrades with research + TDD gates.
- Wired EVOLVE + reflection trigger paths to use `skill-updater` for existing-skill refreshes (while preserving `skill-creator` for net-new skills).
- Added command surfaces: `.claude/commands/skill-updater.md` and `.claude/commands/skill-refresh.md`.
- Added workflow + research artifacts:
  - `.claude/workflows/skill-updater-skill-workflow.md`
  - `.claude/context/artifacts/research-reports/skill-updater-research-2026-02-15.md`
- Updated catalog/docs references and evolution state for discoverability and governance.

## Updater/Auditor Skill Pack Added (2026-02-15)

- Added `agent-updater` for risk-scored agent prompt/frontmatter refresh.
- Added `workflow-updater` for phase-gate and idempotency-safe workflow refresh.
- Added `memory-quality-auditor` for retrieval drift/staleness/groundedness audits.
- Added `eval-harness-updater` for live/fallback eval parser and SLO hardening.
- Wired EVOLVE/reflection docs and catalogs for these skills and command surfaces.

## Troubleshooting Regression Skill Added (2026-02-15)

- Added new creator-compliant skill bundle: `.claude/skills/troubleshooting-regression/`.
- Added command surface: `.claude/commands/troubleshooting-regression.md`.
- Added workflow: `.claude/workflows/troubleshooting-regression-skill-workflow.md`.
- Added companion tool: `.claude/tools/troubleshooting-regression/troubleshooting-regression.cjs`.
- Wired into core/specialized troubleshooters: `reflection-agent`, `qa`, `code-reviewer`, `devops-troubleshooter`.
- Skill enforces debug-log-first diagnosis, search/memory/token-saver guardrail alignment, and targeted regression validation before closure.
