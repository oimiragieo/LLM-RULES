<!-- Agent: architect | Task: #3 | Session: 2026-02-13 -->

# Structural Audit Report — agent-studio

**Date:** 2026-02-13
**Scope:** Deep structural audit (excludes prior findings: oversized modules, circular deps, memory sanitizer bug, console.log instances)

---

## Executive Summary

The agent-studio framework has grown to 59 agents, 155 skills, 133 schemas, 105 hooks, 61 tools, and 31 workflows. While the core orchestration works, structural debt has accumulated across every subsystem. The most critical issues are: 83% of schemas are unreferenced, 89% of environment variables are undocumented, memory files exceed budgets by 3-4x, 10 active hooks are unregistered, and CLAUDE.md contains 6 stale file references. None of these are show-stoppers individually, but collectively they erode discoverability, increase onboarding friction, and create silent failures.

**Severity Distribution:**

- CRITICAL (P0): 2 findings (memory budget overflow, env var documentation gap)
- HIGH (P1): 3 findings (unused schemas, unregistered hooks, stale CLAUDE.md references)
- MEDIUM (P2): 3 findings (tool inventory drift, skill catalog staleness, workflow registry gaps)

---

## 1. Dead / Orphaned Artifacts

### 1.1 Schemas (CRITICAL gap)

**Finding:** 111 out of 133 schemas (83%) are never referenced in any source code.

Only ~20 schemas are actually loaded or validated against in runtime code. The remaining 111 exist as documentation-only artifacts with no enforcement mechanism. This means the vast majority of schemas provide a false sense of structural validation.

**Actively referenced schemas** (sample):

- `agent-frontmatter.schema.json` — used by agent validation
- `skill-frontmatter.schema.json` — used by skill validation
- `hook-registration.schema.json` — used by settings validation
- `config.schema.json` — used by config loader
- `spawn-log-entry.schema.json` — used by spawn logger

**Never-referenced schemas** (111 total, sample):

- Most `*-workflow.schema.json` files
- Most `*-report.schema.json` files
- Most `*-catalog.schema.json` files
- Domain-specific schemas (e.g., `api-pagination-standard.schema.json`)

**Impact:** Schema sprawl creates maintenance burden without validation benefit. New contributors may assume schemas are enforced when they are not.

**Recommendation:** Either wire schemas into validation hooks (preferred) or archive the 111 unused schemas with a clear "documentation-only" label.

### 1.2 Skills

**Finding:** 155 skill directories exist, 152 contain a SKILL.md file. 3 skill directories are empty or missing their primary file.

The skill catalog lists skills but cross-referencing with agent assignments reveals many skills are assigned to agents that never invoke them. This is a softer form of orphaning — the skill exists and is cataloged but has no active consumer.

### 1.3 Tools

**Finding:** 61 tools exist in `.claude/tools/`. 25 deprecated tools were archived to `_archive/` in a prior cleanup. The remaining 61 are cataloged in `tool-catalog.md`, but the catalog may not reflect recent additions or removals.

---

## 2. Dependency Graph Issues

### 2.1 Hook Registration Gaps

**Finding:** 105 hook files exist on disk. Only 30 are registered in `.claude/settings.json`. After excluding `_archive/` contents, **10 active hooks are unregistered:**

| Hook File                       | Location      | Purpose                               |
| ------------------------------- | ------------- | ------------------------------------- |
| `bash-command-validator.cjs`    | `safety/`     | Blocks dangerous shell commands       |
| `shell-injection-validator.cjs` | `safety/`     | Blocks shell injection patterns       |
| `windows-null-sanitizer.cjs`    | `safety/`     | Prevents Windows reserved name issues |
| `user-prompt-unified.cjs`       | `routing/`    | User prompt preprocessing             |
| `error-tracker.cjs`             | `monitoring/` | Error tracking                        |
| `metrics-collector.cjs`         | `monitoring/` | Metrics collection                    |
| `error-summary-extractor.cjs`   | `reflection/` | Error summary extraction              |
| `force-step0-execution.cjs`     | `reflection/` | Forces step 0 reflection              |
| `drift-detector.cjs`            | `session/`    | Session drift detection               |
| `state-reset.cjs`               | `session/`    | Session state reset                   |

**Note:** Some of these (bash-command-validator, shell-injection-validator, windows-null-sanitizer) are referenced in the CLAUDE.md enforcement hooks table, suggesting they ARE expected to be active. Their absence from settings.json may mean they are wired through a different mechanism (e.g., hardcoded in the Claude Code client) or they were accidentally dropped during the 2026-02-08 hook consolidation.

**Impact:** If these hooks are not registered, their safety checks (command validation, injection prevention, Windows compatibility) are not executing. This is especially concerning for the three safety hooks.

**Recommendation:** Verify whether bash-command-validator, shell-injection-validator, and windows-null-sanitizer are wired through an alternative mechanism. If not, register them immediately. For the remaining 7, decide: register or archive.

### 2.2 Agent-Skill Wiring

All 59 agents in the registry have corresponding agent definition files. No filesystem/registry mismatch detected. However, skill assignments in agent definitions are aspirational in many cases — agents list skills they "should" use but the invocation is left to the agent's judgment at runtime.

---

## 3. Configuration Drift

### 3.1 Environment Variables (CRITICAL)

**Finding:** 282 unique environment variables are referenced across the codebase. Only 32 are documented in `.env.example`. That is **11% documentation coverage** — 262 env vars are completely undocumented.

**Categories of undocumented variables:**

- Enforcement mode toggles (e.g., `PLANNER_FIRST_ENFORCEMENT`, `CREATOR_GUARD`, `SPECIALIST_ROUTING_ENFORCEMENT`)
- Memory system controls (e.g., `MEMORY_MODE`, `OBSERVATIONAL_MEMORY_ENABLED`, `MEMORY_SUMMARY_BLOCK_MAX_TOKENS`)
- Feature flags (e.g., `LANCEDB_EMBEDDING_MODE`, `AUTO_COMPRESSION_PHASE_3`)
- Hook behavior controls (e.g., `REFLECTION_STEP0_ENFORCEMENT`, `SPAWN_PROMPT_VALIDATOR`)
- Internal paths and limits (e.g., `PROMPT_LENGTH_WARNING`, `MAX_PROMPT_LENGTH`)

**Impact:** New users or contributors cannot discover configurable behavior. Env vars documented only in CLAUDE.md prose are not discoverable via `.env.example`. Silent misconfiguration is likely.

**Recommendation:** Generate a comprehensive `.env.example` covering at least all enforcement-mode and feature-flag variables (estimated ~80 critical vars). Group by category with comments.

### 3.2 config.yaml vs Runtime Defaults

The `config.yaml` defines agent models for only 4 agents (planner, developer, qa, architect). The remaining 55 agents fall through to complexity-based defaults or the universal sonnet fallback. This is by design but underdocumented — users may expect all agents to be configurable via config.yaml.

---

## 4. Stale References

### 4.1 CLAUDE.md Broken File Paths

**Finding:** 6 file paths referenced in CLAUDE.md point to non-existent files:

| Referenced Path                                         | Context                      | Issue                                         |
| ------------------------------------------------------- | ---------------------------- | --------------------------------------------- |
| `.claude/agents/domain/python-expert.md`                | Example in violation section | File does not exist (actual: `python-pro.md`) |
| `.claude/context/runtime/integration-queue.json`        | Step 0.5 check               | Wrong extension (actual: `.jsonl`)            |
| `.claude/context/runtime/reflection-spawn-request.json` | Step 0 check                 | File does not exist on disk                   |
| `.claude/context/runtime/workflow-state.json`           | Enterprise workflow          | File does not exist on disk                   |
| `.claude/hooks/safety/api-rate-limiter.cjs`             | Gate 4 example               | File never created (example only)             |
| `.claude/workflows/enterprise/security-audit.md`        | Gate 4 example               | File never created (example only)             |

**Impact:** The last two are used as "wrong" examples in violation documentation, so their non-existence is arguably intentional. However, the first four are functional references that could cause runtime failures or confuse agents trying to read them.

**Recommendation:** Fix the 4 functional references. Add a comment to the 2 example-only references clarifying they are intentional non-existent paths.

### 4.2 Documentation Cross-References

Multiple `@` reference files in `.claude/docs/` cross-reference each other. Spot-checking found no broken cross-references among the 14 `@` files. The reference index in CLAUDE.md Section 10 is consistent with the files on disk.

---

## 5. Hook System Health

### 5.1 Registration Summary

| Category                    | Count |
| --------------------------- | ----- |
| Total hook files on disk    | 105   |
| Archived (`_archive/`)      | ~65   |
| Active (non-archive)        | ~40   |
| Registered in settings.json | 30    |
| Active but unregistered     | 10    |

### 5.2 Event Distribution (Registered Hooks)

| Event                | Hooks | Purpose                          |
| -------------------- | ----- | -------------------------------- |
| `PreToolUse`         | 14    | Tool validation, routing, safety |
| `PostToolUse`        | 5     | Metrics, indexing, integration   |
| `PostToolUseFailure` | 1     | Failure metrics                  |
| `UserPromptSubmit`   | 5     | Prompt preprocessing             |
| `Stop`               | 3     | Session cleanup                  |
| `SessionEnd`         | 2     | Session teardown                 |

### 5.3 Consolidation Status

The 2026-02-08 consolidation reduced 6 wildcard hooks to 2 unified hooks (`pre-tool-unified.cjs`, `post-tool-metrics-unified.cjs`). This was successful but left the 10 unregistered hooks in an ambiguous state.

### 5.4 Performance Concern

No hooks currently have performance monitoring beyond `post-tool-metrics-unified.cjs`. The 100ms performance budget defined in the hooks rule is not enforced — no hook is timed and no alert fires if a hook exceeds budget.

---

## 6. Schema Validation Gaps

### 6.1 Coverage Analysis

| Metric                   | Value |
| ------------------------ | ----- |
| Total schemas            | 133   |
| Referenced in code       | ~22   |
| Used in validation hooks | ~8    |
| Documentation-only       | ~111  |
| Schema coverage rate     | 17%   |

### 6.2 Notable Gaps

- **Agent definitions:** Validated against `agent-frontmatter.schema.json` (good)
- **Skill definitions:** Validated against `skill-frontmatter.schema.json` (good)
- **Spawn log entries:** Validated against `spawn-log-entry.schema.json` (good)
- **Workflow definitions:** No runtime validation (schema exists but unused)
- **Report output:** No runtime validation (schema exists but unused)
- **Memory entries:** No runtime validation (no schema exists)
- **Task metadata:** No runtime validation (no schema exists)

### 6.3 Recommendation

Prioritize wiring validation for the 8-10 schemas that govern critical paths (agent spawning, hook registration, workflow execution). Archive or clearly label the remaining ~111 as aspirational/documentation-only.

---

## 7. Tool Inventory

### 7.1 Current State

| Category       | Count |
| -------------- | ----- |
| Active tools   | 61    |
| Archived tools | 25    |
| npm scripts    | 131   |

### 7.2 Script Sprawl

131 npm scripts in `package.json` is excessive. Many are variations (e.g., `search:code`, `search:structure`, `search:file`, plus `metrics:*` variants). This creates discoverability issues — users cannot easily find the right script.

**Recommendation:** Group scripts with a `help` or `list` script that categorizes available commands. Consider consolidating metrics scripts behind a single `pnpm metrics` entry point.

---

## 8. Memory System

### 8.1 Budget Violations (CRITICAL)

| File           | Size                 | Budget | Overage       |
| -------------- | -------------------- | ------ | ------------- |
| `decisions.md` | 75,820 bytes (74 KB) | 20 KB  | **3.8x over** |
| `issues.md`    | 63,418 bytes (62 KB) | 20 KB  | **3.2x over** |
| `learnings.md` | 14,056 bytes (14 KB) | 20 KB  | Within budget |

**Impact:** Oversized memory files are injected into every agent spawn prompt. At 74KB + 62KB = 136KB just for decisions + issues, this consumes a massive portion of the 200K context window before the agent even starts working. Given the research finding that model performance degrades past 32K tokens, these files alone may be causing quality degradation.

**Recommendation:** Immediate rotation of decisions.md and issues.md to WARM tier. The `memory-rotator.cjs` tool exists but has clearly not been run recently. Consider automating rotation via a pre-session hook or CI job.

### 8.2 Memory Rotation

The memory rotation system (`memory-rotator.cjs`) exists in `.claude/lib/memory/` but shows no evidence of regular execution. The WARM tier (`archive/`) and COLD tier (`archive/YYYY/`) directories may or may not exist — the rotation has not been triggered despite files being 3-4x over budget.

### 8.3 Named Memory

The named memory system (`.claude/context/memory/named/`) is available but usage is unclear. No inventory of named memory keys was performed in this audit.

---

## Prioritized Remediation Plan

### P0 — Critical (This Week)

1. **Rotate memory files** — Run memory-rotator on decisions.md and issues.md immediately. Each spawn prompt is carrying 136KB of stale memory.
2. **Document critical env vars** — Add at least enforcement-mode and feature-flag variables to `.env.example` (~80 vars).

### P1 — High (This Sprint)

3. **Resolve unregistered hooks** — Verify the 3 safety hooks (bash-command-validator, shell-injection-validator, windows-null-sanitizer) are actually executing. Register or archive the remaining 7.
4. **Fix CLAUDE.md stale references** — Correct the 4 functional broken paths.
5. **Schema triage** — Categorize 133 schemas as "enforced" vs "aspirational". Wire validation for critical-path schemas.

### P2 — Medium (Next Sprint)

6. **Tool/script consolidation** — Reduce 131 npm scripts to categorized groups with help text.
7. **Skill audit** — Identify skills with zero active consumers and archive or reassign.
8. **Hook performance monitoring** — Add timing instrumentation to enforce the 100ms budget.

---

## Appendix: Artifact Inventory

| Artifact Type                   | Count | Registry/Catalog              |
| ------------------------------- | ----- | ----------------------------- |
| Agents                          | 59    | agent-registry.json (59)      |
| Skills (directories)            | 155   | skill-catalog.md              |
| Skills (with SKILL.md)          | 152   | —                             |
| Schemas                         | 133   | schema-catalog.md             |
| Hooks (total files)             | 105   | settings.json (30 registered) |
| Hooks (active, non-archive)     | ~40   | —                             |
| Tools                           | 61    | tool-catalog.md               |
| Workflows                       | 31    | workflow registry             |
| npm scripts                     | 131   | package.json                  |
| Environment variables (in code) | 282   | .env.example (32 documented)  |
