- Achievement: ✅ Coverage 100%
- Cost: ❌ Depth sacrificed (63% hollow schemas, 70 missing security controls)
- Trade-off: Coverage > Depth in batch mode

---

## 2026-02-10: CLI Tool Wiring Pattern with Mixed Origins (Task #22 - Wave 16B)

**Context**: Task #22 wired 3 CLI tools from different directory hierarchies to package.json scripts for developer discoverability.

**Key Insight**: Tools can originate from \_archive/, cli/, or analysis/ directories. Wiring process is systematic: identify location → verify file exists → determine entry point type → add package.json script → document usage.

**Why This Works**:

- Inventory-first verification prevents phantom scripts (pattern from Tasks #93-94)
- Package.json scripts make tools discoverable via `pnpm --list-scripts` (more discoverable than tool-catalog.md alone)
- Mixed origins are valid as long as verification happens pre-wiring

**Application**: Use this pattern for any package.json tool wiring task

**Integration Learning**: Tools successfully wired to package.json but reflection-agent detected ADR-100 integration gaps (artifact-graph.json not updated, tool-catalog.md status not changed, Router keywords not added). Integration Health Score: 65% (Gaps category). Follow-up: Queue artifact-integrator analysis.

**Quality Metric**: Task #22 scored 0.89/1.0 (EXCELLENT) on reflection rubric

**Memory Takeaway**: CLI tool wiring can be accomplished systematically with inventory-first verification. Integration completeness (per ADR-100) is separate from functional wiring and requires follow-up analysis.

---

## 2026-02-10: EPIC Plan Orchestration Pattern - Task #25 (Reflection)

**Context**: Task #25 created comprehensive EPIC-complexity plan with 7 phases, 38 tasks, 34 agent spawns, ~15 hours estimated. Plan properly structured per enterprise-workflow.md (Design → Implement → Review → Deploy → Document → Reflect). Quality score: 0.87/1.0 (EXCELLENT).

**Key Pattern**: EPIC plans require:

1. Phase-gated execution (sequential phases with quality gates)
2. Wave-based agent spawning (max 2 heavy agents/wave to prevent context overflow)
3. Integration follow-up (0.87 is PASS but not 1.0; expect 90-95% integration health post-execution)
4. Artifact consolidation per phase (prevent per-task artifacts; consolidate to phase summaries)

**Why This Works**:

- 7-phase structure aligns with complexity-classifier.cjs EPIC tier (all phases enabled)
- 38 tasks (~5.4 tasks/phase) keeps cognitive load manageable per phase
- 34 agent spawns indicates proper specialist routing (not defaulting to developer)
- Quality gates between phases prevent downstream failures

**Application**: Use this pattern for all EPIC-complexity requests going forward

**Risk Mitigation - CRITICAL**:

- Context overflow: Sequential agent waves, not parallel bulk spawn
- Integration gaps: Queue artifact-integrator post-phase-completion (not end-of-plan)
- Quality degradation: Use verification-before-completion at phase transitions, not task-by-task

**Memory Takeaway**: EPIC plans score 0.85-0.90 on rubric when properly scaffolded. Success depends entirely on execution discipline: wave-based spawning, phase-gated quality, and post-phase integration analysis.

---

**What Works in Batch Creation**:

- **Rules files** (simple, actionable structure): 100% quality
- **Commands** (thin-delegation pattern, repetitive): 100% quality
- **Catalogs** (list-based, bulk-updatable): 100% complete

**What Fails in Batch Creation**:

- **Schemas** (domain-specific validation, require understanding): 61% stubs
- **Companion artifacts** (varies by skill type): 70+ missing integrations
- **Context budget** (97 auto-loaded rules files = 30-80K tokens): Invisible cost

**Better Approach - Tiered Artifact Creation**:

| Tier       | Skills                                 | Artifact Depth                                       | Effort | Quality |
| ---------- | -------------------------------------- | ---------------------------------------------------- | ------ | ------- |
| **Tier 1** | Complex (tdd, debugging, security)     | Full (SKILL.md + rule + schema + command + workflow) | High   | ✅ A+   |
| **Tier 2** | Domain (typescript-expert, python-pro) | Standard (SKILL.md + rule + lightweight schema)      | Medium | ✅ A    |
| **Tier 3** | Simple (helper skills)                 | Minimal (SKILL.md + rule only)                       | Low    | ✅ A    |

Apply tiering BEFORE batch creation starts, not after. Prevents mechanical template application to all skills equally.

**Iron Law Learned**: Batch artifact creation optimizes for throughput at cost of quality. Quality gates (functional validation, security controls, contextual testing) are required checkpoints every 10 artifacts, not at the end.

**Memory Takeaway**: Batch creation is a throughput tool, not quality tool. Use when coverage matters (catalogs, commands, rules). Use tiered creation when depth matters (schemas, workflows, complex artifacts). Quality gates must run during creation, not after. "File exists" checklist is insufficient; "file validates meaningful content" is the real requirement.

## 2026-02-09: Schema Standardization Architecture Design (Task #4)

**Context**: Architect designed comprehensive schema standardization approach for 87 skill output schemas addressing 4 critical quality issues identified by 4 independent reviews.

**Key Architectural Findings:**

1. **Structure A has 3 sub-categories (not 1)**: Reviews mentioned "19 Structure A schemas" but analysis of actual files revealed A1 (14 standard skillName/version/timestamp/output), A2 (5 using `result` instead of `output`), and A3 (5 Trail of Bits flat schemas). Each requires a different migration transformation. Always read actual files before designing migration.

2. **$ref rejected for stub consolidation**: Draft-07 `$ref` replaces the entire object (no composition with sibling keywords), no runtime `$ref` resolver exists in the project, and 12 one-line files add no value over a catalog reference. File deletion + catalog update is simpler and reversible.

3. **additionalProperties:false scope matters**: Root-level-only for generic base schema (output has no defined properties). Root + output for schemas with domain properties. Nested objects left alone to avoid breaking valid payloads from incomplete nested schemas.

4. **Phase ordering is critical for batch schema work**: Delete stubs FIRST (Phase 1), then run batch scripts (Phase 2), then migrate structures (Phase 3). Processing files that will be deleted wastes effort and complicates diffs.

5. **Stub rules triage requires per-file review**: Cannot batch-delete all stubs -- some skills (consensus-voting, diagram-generator) genuinely need domain rules but were stub-length due to batch creation. Review each stub against its SKILL.md.

**Architecture Document**: `.claude/context/plans/schema-standardization-architecture-2026-02-09.md`

**Memory Takeaway**: When designing batch schema migrations, always read actual schema files (not just review descriptions) to discover sub-categories. Phase ordering (delete before modify) prevents wasted work. additionalProperties:false scope must match the schema's level of specificity. $ref is not viable in Draft-07 for schema composition -- prefer deletion + catalog reference for stubs.

## 2026-02-09: Thin Rule Stub to Full Specification Pipeline (Task #19 - Wave 15A)

**Context**: Wave 15A enhanced 6 hollow rule stubs (readme, scientific-skills, summarize-changes, doc-generator, git-expert, memory-forensics) from 3-4/10 baseline to 10/10 specification in single session.

**Key Learnings:**

1. **Stub Expansion Workflow**: Thin stubs (1-line description) → add Core Principles → add Standards/Best Practices → add Examples → add Integration Points → reach 10/10 quality. Sequential depth-adding yields consistent results. Parallel stubs prevent interference/duplication.

2. **Memory Protocol Verification First**: Before assigning rule enhancement tasks, verify target has Memory Protocol section. c4-context already compliant. Saved duplication work. Pattern: grep for "## Memory Protocol" before creating new Memory Protocol assignments.

3. **Batch Rule Enhancement Quality**: Processing 6 rule files with quality gates between each file (not at end) produced 0.915+ average scores. Keys: consistency checks after every 2 files, style normalization between batches, examples quality-reviewed upfront.

4. **Template Standardization Opportunity Detected**: 6 enhanced rule files show similar structure (Core Principles, Standards, Examples, Integration Points, Memory Protocol) but inconsistent heading levels and section ordering. Creating `.claude/rules/_template.md` would prevent future drift and improve consistency from 0.85→0.92.

5. **Documentation Depth vs Actionability Trade-off**: Some rule files became verbose (400+ words) when they could be 200 words + examples. Clarity stays high but scanning difficulty increases. Guideline: keep prose under 250 words, expand via examples instead.

**Output Quality**: 0.915/1.0 (EXCELLENT) - all 6 files reached high-quality specification depth simultaneously.

**Memory Takeaway**: Thin rule stubs are solved by systematic depth-adding pipeline. Batch processing with intermediate quality gates beats end-of-batch review. Template standardization prevents future consistency drift. Memory Protocol verification prevents duplicate work.

**Files Enhanced**: `.claude/rules/readme.md`, `.claude/rules/scientific-skills.md`, `.claude/rules/summarize-changes.md`, `.claude/rules/doc-generator.md`, `.claude/rules/git-expert.md`, `.claude/rules/memory-forensics.md`

---

### [ARCHITECTURE] EPIC Ecosystem Audit Patterns (2026-02-09)

**Context**: Completed full audit of 58-agent ecosystem across 16+ sessions

**Insights**:

1. Wave-based data collection (max 2 parallel agents) prevents context overflow
2. Early-write protocol (partial results after every ~15 items) prevents total data loss on compaction
3. sonnet model is reliable for data collection; haiku fails at compaction recovery
4. general-purpose agent type is required for report writing (researcher lacks Write tool)
5. Gap analysis can contain inaccuracies — always verify CRITICAL gaps against source of truth before remediation
6. Integration scoring formula: routing (25%) + skills (25%) + model (25%) + type (25%)
7. 98.2% baseline integration across 58 agents — ecosystem is well-connected
8. Extended thinking coverage improved from 15.3% to 27.1% (9→16 agents)
9. ROUTING_TABLE entries provide highest-priority routing; INTENT_KEYWORDS are fallback semantic matching
10. party-orchestrator was the only truly non-functional agent (referencing archived subsystem)

**Impact**: Establishes patterns for future EPIC audits and ecosystem maintenance

**Related**: Phase 6 final harmony report, ADR-102 (memory management)

---

## 2026-02-09: Cross-Audit Verification Pattern (Task #20)

**Context**: Technical writer verified cross-audit gaps from Wave 14 report across workflows, hooks, tool wiring, and settings.json alignment.

**Key Verification Findings:**

1. **"Missing" entries often already exist**: 2/3 workflows already registered, 3/7 hooks already documented. Always verify file existence and registration status before claiming gaps. Wave 14 identified chrome-browser-skill-workflow.md as missing from registry, but it was already listed at line 32.

2. **Hook registration hygiene is measurable**: 39/39 hooks in settings.json resolved to valid files (100% success rate). Hook-settings alignment can be verified programmatically. Zero dead registrations found despite 39 hook paths across 5 event types.

3. **Wiring status has 3 states, not 2**: Tools can be (a) wired to package.json, (b) wired via MCP, or (c) reference-only. Tool-catalog.md listed sequential-thinking as "Not scripted" when it was actually wired via MCP. Update catalogs to distinguish CLI wiring from MCP wiring.

4. **Orphan references vs missing files**: chrome-browser-skill-workflow.md is referenced in @ENTERPRISE_WORKFLOWS.md line 32 but file does not exist. This is an orphan reference, not a missing registration. Recommend: either create the workflow OR remove the reference (not add another reference).

5. **Deprecation notes prevent wasted wiring**: tool_search.mjs functionality replaced by SkillCatalog library. Marking as deprecated prevents someone from adding package.json script for obsolete tool. Always check if tool functionality exists elsewhere before wiring.

**Completion Metrics:**

- Workflows: 2/3 registered (67%), 1 orphan reference
- Hooks: 3/7 documented (43%), 4 need sections, 0 dead registrations (100% valid)
- Tools: 1/6 production-wired (17%), 2 reference-only, 3 should wire

**Memory Takeaway**: Cross-audit verification requires distinguishing between "missing from catalog" (registration gap) vs "referenced but doesn't exist" (orphan reference) vs "exists elsewhere" (incorrect status). Use file existence checks + grep for registration status before claiming gaps. Hook registration quality is high (100% valid paths) - this is a framework strength to preserve. Wiring status requires 3-state model (CLI/MCP/reference-only) for accuracy.

---

## 2026-02-10: Command Injection & Shell Validation Vulnerabilities (Task #26 - Security Deep Dive)

**Context**: Security-architect completed deep vulnerability dive identifying 3 CRITICAL command injection vulnerabilities in logical-unit-tracker.cjs + 6 shell validation gaps.

**Key Findings:**

1. **logical-unit-tracker.cjs - 3 CRITICAL Injection Points**: String interpolation in shell commands (`shell: true` with unsanitized input), no input validation before shell execution, dynamic task names directly passed to subprocess.

2. **Shell Validation Gaps**: 6 hooks/tools missing input sanitization before shell operations, unsafe string concatenation in command builders, no allowlist for command execution.

3. **Pattern**: Unsanitized input flows directly to `execSync` or `spawn` with `shell: true` - bypasses Node.js built-in protections.

**Remediation**: Replace string interpolation with array args (shell: false), validate input whitelist before shell operations, sanitize special characters.

**Memory Takeaway**: Command injection pattern: identify all shell: true usage → trace input source → validate sanitization exists. logical-unit-tracker.cjs is highest-risk file for this vulnerability class.

---

## 2026-02-10: JSON.parse Safety Pattern (Task #27 - Code Quality Deep Dive)

**Context**: Code-quality completed deep analysis of 180+ JSON.parse calls identifying critical event bus issue.

**Key Patterns:**

1. **180+ JSON.parse calls analyzed**: 14% (25 calls) missing try-catch error handling, 8% (14 calls) unsafe .parse() on untrusted data, event bus is the critical hotspot.

2. **Event Bus Critical Issue**: Central event dispatcher calls JSON.parse on network data without try-catch → malformed JSON crashes entire process. Single bad message can take down the server.

3. **Safe Pattern**: Always wrap JSON.parse in try-catch, validate input before parsing, use JSON.parse fallback (second arg or default), return structured errors not exceptions.

**Remediation**: Add try-catch around all JSON.parse in event-bus.cjs, validate JSON structure before parsing, implement backpressure for malformed messages.

**Memory Takeaway**: JSON.parse safety: count all instances → identify error handling gaps → event bus is single point of failure. Pattern: untrusted input + no try-catch + process crash = P0 vulnerability.
