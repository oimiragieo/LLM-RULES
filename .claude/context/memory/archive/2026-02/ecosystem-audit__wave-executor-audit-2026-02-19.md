<!-- Agent: developer | Task: #1 | Session: 2026-02-19 -->

# Wave Executor Skill — Registration Completeness Audit

**Date:** 2026-02-19
**Auditor:** developer agent
**Status:** PARTIAL

---

## Executive Summary

The `wave-executor` skill is substantially complete and better-integrated than most skills in the framework. The core SKILL.md is well-structured, the CLI tool exists and exports tested pure functions, companion artifacts (hooks, schemas, rules, templates, references, command) are present, and the skill is listed in both the skill-catalog and skill-index. Key gaps are: (1) the skill-index incorrectly classifies it under `Other/developer` instead of `Planning & Architecture/router+master-orchestrator+planner`, (2) no canonical framework-level schema exists in `.claude/schemas/` (only local schemas in the skill directory), and (3) no CLAUDE.md routing reference cross-links wave-executor in the routing section narrative.

---

## 1. File Inventory

All files present under `.claude/skills/wave-executor/`:

| File | Present | Notes |
|------|---------|-------|
| `SKILL.md` | YES | Complete, well-structured |
| `scripts/main.cjs` | YES | CLI dispatcher; uses `shell: false` |
| `hooks/pre-execute.cjs` | YES | Validates plan + SDK availability |
| `hooks/post-execute.cjs` | YES | Appends run summary to learnings.md |
| `schemas/input.schema.json` | YES | JSON Schema 2020-12, `additionalProperties: false` |
| `schemas/output.schema.json` | YES | JSON Schema 2020-12, `additionalProperties: false` |
| `commands/wave-executor.md` | YES | Thin delegator with `disable-model-invocation: true` |
| `rules/wave-executor.md` | YES | When-to-use and anti-patterns |
| `templates/implementation-template.md` | YES | Wave plan template with guidelines |
| `references/research-requirements.md` | YES | Root cause citations and design decisions |

CLI tool: `.claude/tools/cli/wave-executor.mjs` — Present and exports testable pure functions (`parseWaveArgs`, `readPlanFile`, `readInventory`, `updateInventory`, `buildWavePrompt`).

Test file: `tests/tools/cli/wave-executor.test.cjs` — Present, 9 test cases covering arg parsing, plan validation, inventory management, and prompt building. SDK `query()` calls are explicitly excluded (correct — they require a live session).

---

## 2. Skill-Catalog Registration

**File:** `.claude/context/artifacts/catalogs/skill-catalog.md`

**Status: PASS (with minor classification issue)**

The skill is listed in the catalog under the **Planning & Architecture** category (line 87):

```markdown
| `wave-executor` | Fresh-process orchestration for EPIC-tier batch pipelines (SDK-based Ralph loop) | router, master-orchestrator, planner |
```

This is correct — the catalog entry accurately describes the skill and lists the right primary agents. The description matches the SKILL.md frontmatter.

---

## 3. Skill-Index Registration

**File:** `.claude/config/skill-index.json`

**Status: PARTIAL — Classification mismatch**

The skill is indexed (line 7607):

```json
"wave-executor": {
  "name": "wave-executor",
  "displayName": "Wave Executor",
  "category": "Other",
  "domain": "other",
  "agentPrimary": ["developer"],
  "agentSupporting": [],
  "tags": ["other", "wave-executor"],
  "priority": 3
}
```

**Gaps found:**
- `category` is `"Other"` but should be `"Planning & Architecture"` (matches skill-catalog)
- `domain` is `"other"` but should be `"planning"` or `"architecture"`
- `agentPrimary` is `["developer"]` but should be `["router", "master-orchestrator", "planner"]` (matches SKILL.md frontmatter and skill-catalog)
- `agentSupporting` is empty but could include `["planner"]` as a secondary consumer
- `tags` only has `["other", "wave-executor"]` — should include `["batch", "orchestration", "epic-tier", "planning"]`
- `priority` is `3` (reasonable for a specialized tool, acceptable)

---

## 4. Agent Registry Registration

**File:** `.claude/context/agent-registry.json`

**Status: NOT CHECKED (file too large) — cross-referenced via agent files**

Wave-executor is referenced in the `skills:` array of three agent files:

| Agent File | Reference | Correct? |
|------------|-----------|----------|
| `.claude/agents/core/router.md` | `wave-executor` | YES — router is primary consumer |
| `.claude/agents/core/planner.md` | `wave-executor` | YES — planner creates wave plans |
| `.claude/agents/orchestrators/master-orchestrator.md` | `wave-executor` | YES — orchestrator invokes for EPIC work |

No other agent files reference it, which is appropriate (it is a specialized skill for EPIC-tier work).

---

## 5. Hook Registration

**File:** `.claude/settings.json`

**Status: NOT REGISTERED — by design**

The skill's hooks (`pre-execute.cjs`, `post-execute.cjs`) are **not** registered in `settings.json`. This is the expected pattern for skill-local hooks that are called programmatically by the skill's `scripts/main.cjs`, not triggered by the framework's hook system. The hooks are invoked by the skill entry point, not by Claude Code's PreToolUse/PostToolUse pipeline.

**Verdict:** No gap — skill-local hooks are not expected to be in `settings.json`.

---

## 6. SKILL.md Structure Validation

Checked against skill-creator schema requirements:

| Required Element | Present | Quality |
|-----------------|---------|---------|
| Frontmatter: `name` | YES | Correct |
| Frontmatter: `description` | YES | Clear and specific |
| Frontmatter: `version` | YES (`1.0`) | Present |
| Frontmatter: `model` | YES (`sonnet`) | Appropriate |
| Frontmatter: `invoked_by` | YES (`both`) | Correct |
| Frontmatter: `user_invocable` | YES (`true`) | Correct — has slash command |
| Frontmatter: `tools` | YES | `[Read, Write, Bash, Glob, Grep]` |
| Frontmatter: `aliases` | YES | `[batch-executor, ralph-loop]` |
| Frontmatter: `best_practices` | YES | 5 clear directives |
| Frontmatter: `error_handling` | YES (`strict`) | Present |
| Frontmatter: `streaming` | YES (`supported`) | Present |
| **Missing**: `agents` | NO | Should list `[router, master-orchestrator, planner]` |
| **Missing**: `category` | NO | Should be `planning-architecture` |
| **Missing**: `tags` | NO | Tags missing from frontmatter |
| Section: Overview | YES | Clear, explains Ralph pattern + bug context |
| Section: When to Use | YES | EPIC-tier criteria clearly defined |
| Section: How It Works | YES | Diagram + key invariant |
| Section: Invocation | YES | Bash and slash command forms |
| Section: Plan File Format | YES | JSON example with all fields |
| Section: Inventory Tracking | YES | Resume, monitoring, cost tracking |
| Section: Integration with Router | YES | 4-step flow |
| Section: Memory Protocol | YES | Before/after instructions |

**Key gap:** The frontmatter lacks the `agents` field that skill-creator standards require for agent assignment. The `tags` and `category` fields are also missing from frontmatter (they are inferred by skill-index but not declared in the file itself).

---

## 7. Canonical Framework Schema

**Expected path:** `.claude/schemas/skill-wave-executor-output.schema.json`

**Status: MISSING**

Most skills with output schemas have a corresponding schema file in `.claude/schemas/` (e.g., `skill-typescript-expert-output.schema.json`, `skill-verification-before-completion-output.schema.json`). The wave-executor has local schemas under `.claude/skills/wave-executor/schemas/` but no framework-level schema file.

The local schemas are well-formed (JSON Schema 2020-12, `additionalProperties: false`, required fields defined), so this is a registration gap rather than a quality gap.

---

## 8. Test Coverage

**Status: PASS**

File: `tests/tools/cli/wave-executor.test.cjs`

- 9 tests covering all exported pure functions
- Uses `node:test` runner (consistent with project conventions)
- Excludes live SDK calls (appropriate)
- Temporary directory cleanup in `afterEach`
- Tests edge cases: missing plan, empty waves, nonexistent file, inventory accumulation

No tests exist for the skill's `scripts/main.cjs` dispatcher, but that is a thin wrapper and the core logic is tested via the CLI tool's exports.

---

## 9. Compliant Items Summary

The following are fully correct and require no action:

1. SKILL.md content quality — accurate, self-contained, clear when-to-use criteria
2. CLI tool at `.claude/tools/cli/wave-executor.mjs` — functional, exports testable units
3. Test coverage in `tests/tools/cli/wave-executor.test.cjs` — 9 passing tests
4. Skill-catalog entry — correct placement, correct primary agents listed
5. Agent assignment — referenced in router, planner, master-orchestrator skill lists
6. Command file at `skills/wave-executor/commands/wave-executor.md` — thin delegator pattern
7. Rules file with anti-patterns and routing guidance
8. Templates file with plan format and execution examples
9. References file with cited research and design decisions
10. Pre-execute hook validates plan file + SDK + CLI tool existence
11. Post-execute hook writes to learnings.md (best-effort, non-fatal)
12. Local schemas (input + output) are well-formed JSON Schema 2020-12
13. `scripts/main.cjs` uses `shell: false` (security compliant)
14. `verified: true` and `lastVerifiedAt` in SKILL.md frontmatter

---

## 10. Gaps Summary

| Gap | Severity | File to Fix |
|-----|----------|-------------|
| `skill-index.json`: `category` = `"Other"` instead of `"Planning & Architecture"` | MEDIUM | `.claude/config/skill-index.json` |
| `skill-index.json`: `domain` = `"other"` instead of `"planning"` | MEDIUM | `.claude/config/skill-index.json` |
| `skill-index.json`: `agentPrimary` = `["developer"]` instead of `["router", "master-orchestrator", "planner"]` | HIGH | `.claude/config/skill-index.json` |
| `skill-index.json`: missing tags `["batch", "orchestration", "epic-tier", "planning"]` | LOW | `.claude/config/skill-index.json` |
| `SKILL.md` frontmatter: missing `agents` field | MEDIUM | `.claude/skills/wave-executor/SKILL.md` |
| `SKILL.md` frontmatter: missing `category` and `tags` fields | LOW | `.claude/skills/wave-executor/SKILL.md` |
| No framework-level schema at `.claude/schemas/skill-wave-executor-output.schema.json` | LOW | New file needed |

---

## 11. Recommended Fixes

### Fix 1 (HIGH): Correct `skill-index.json` agent assignment

In `.claude/config/skill-index.json`, locate the `wave-executor` entry (around line 7607) and update:

```json
"wave-executor": {
  "name": "wave-executor",
  "displayName": "Wave Executor",
  "category": "Planning & Architecture",
  "domain": "planning",
  "description": "Fresh-process orchestration for EPIC-tier batch pipelines. Spawns a new Bun process per wave via the Claude Agent SDK, preventing GC-related crashes in long-running sessions.",
  "requiredTools": ["Read", "Write", "Bash", "Glob", "Grep"],
  "agentPrimary": ["router", "master-orchestrator", "planner"],
  "agentSupporting": ["developer"],
  "tags": ["batch", "orchestration", "epic-tier", "planning", "wave-executor"],
  "priority": 3,
  "aliasOf": null
}
```

### Fix 2 (MEDIUM): Add missing frontmatter fields to SKILL.md

In `.claude/skills/wave-executor/SKILL.md`, add these fields to the YAML frontmatter:

```yaml
agents: [router, master-orchestrator, planner]
category: planning-architecture
tags: [batch, orchestration, epic-tier, planning, wave-executor]
```

### Fix 3 (LOW): Create framework-level schema file

Create `.claude/schemas/skill-wave-executor-output.schema.json` by copying and referencing the local output schema at `.claude/skills/wave-executor/schemas/output.schema.json`. This makes the skill discoverable by schema-catalog tooling that scans `.claude/schemas/`.

### Fix 4 (INFORMATIONAL): Verify `@anthropic-ai/claude-agent-sdk` is installed

The pre-execute hook checks for `@anthropic-ai/claude-agent-sdk` at runtime. Verify it is present:

```bash
node -e "require.resolve('@anthropic-ai/claude-agent-sdk')" && echo "SDK present" || echo "SDK MISSING"
```

If missing, the skill will fail with an actionable error from the pre-execute hook (which is the correct behavior).

---

## 12. Overall Verdict

**PARTIAL** — The skill is production-ready in terms of content and tooling, but the `skill-index.json` metadata contains incorrect agent assignment (`developer` instead of `router/master-orchestrator/planner`) which would cause agent-discovery tools to misroute the skill. Fixes 1 and 2 are recommended before the skill is used in production EPIC-tier pipelines. Fix 3 is cosmetic but improves catalog coverage metrics.

---

*Report generated by developer agent | Task #1 | Session 2026-02-19*
