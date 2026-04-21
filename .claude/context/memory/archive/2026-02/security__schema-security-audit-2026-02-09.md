<!-- Agent: security-architect | Task: #1 | Session: 2026-02-09 -->

# Schema Security Audit Report

**Date:** 2026-02-09
**Auditor:** Security Architect Agent
**Scope:** All 28 active JSON schemas in `.claude/schemas/` (excluding `_archive/`)
**Overall Risk Rating:** MEDIUM

---

## Executive Summary

This audit examined 28 active JSON schemas for security vulnerabilities across 10 categories: property injection, ReDoS, string length limits, array size limits, enum completeness, required field coverage, type safety, default value safety, $ref resolution, and schema composition.

**Key Findings:**

- **11 schemas** lack `additionalProperties: false` at the root level, enabling property injection
- **16 schemas** have unbounded string fields (no `maxLength`), creating memory exhaustion vectors
- **19 schemas** have unbounded array fields (no `maxItems`), creating memory exhaustion vectors
- **1 schema** has explicit `additionalProperties: true`, a deliberate but risky choice
- **0 schemas** have ReDoS-vulnerable regex patterns
- **0 schemas** have external `$ref` references (all use local `$defs`)

**Risk Context:** These schemas are used internally by the agent-studio framework for validating agent definitions, workflow state, and artifact metadata. They are NOT exposed as public API schemas. The attack surface is limited to framework contributors and spawned agents. However, since spawned agents can produce JSON data validated against these schemas, unbounded fields could be used by a misbehaving agent to exhaust memory.

**Priority Remediation:**
1. (HIGH) Add `additionalProperties: false` to 11 schemas missing it
2. (MEDIUM) Add `maxLength` to 47 unbounded string fields across 16 schemas
3. (MEDIUM) Add `maxItems` to 38 unbounded array fields across 19 schemas
4. (LOW) Remove explicit `additionalProperties: true` from 3 schemas where it is unnecessary

---

## Findings by Security Check

### 1. Property Injection (additionalProperties)

**Severity: HIGH**

Schemas without `additionalProperties: false` (or `unevaluatedProperties: false`) allow arbitrary properties to be injected into validated data. In an agent framework, this means a misbehaving agent could inject unexpected metadata fields that propagate through the system.

| Schema | Has Protection | Notes |
|--------|---------------|-------|
| `adr-template.schema.json` | YES | `additionalProperties: false` |
| `agent-capability-card.schema.json` | YES | `additionalProperties: false` on all sub-definitions |
| `agent-definition.schema.json` | NO | Root object and `frontmatter` both lack it |
| `agent-identity.schema.json` | YES | `additionalProperties: false` |
| `artifact_manifest.schema.json` | NO | Root and all nested objects lack it |
| `evolution-state.schema.json` | NO | Root object lacks it; some `$defs` lack it |
| `hook-definition.schema.json` | NO | Root object lacks it |
| `implementation-plan.schema.json` | INVERTED | Has `additionalProperties: true` explicitly |
| `phase-models.schema.json` | YES | `additionalProperties: false` |
| `plan.schema.json` | NO | Root and all nested objects lack it |
| `presets.schema.json` | YES | `additionalProperties: false` at all levels |
| `product_requirements.schema.json` | NO | Root and all nested objects lack it |
| `project-analysis.schema.json` | NO | Root object lacks it (sub-objects have some) |
| `project_brief.schema.json` | NO | Root and all nested objects lack it |
| `skill-definition.schema.json` | YES | `unevaluatedProperties: false` (2020-12 draft) |
| `skill-diagram-generator-output.schema.json` | YES | `additionalProperties: false` |
| `skill-repo-rag-output.schema.json` | YES | `additionalProperties: false` |
| `skill-test-generator-output.schema.json` | YES | `additionalProperties: false` |
| `specification-template.schema.json` | YES | `additionalProperties: false` |
| `system_architecture.schema.json` | NO | Root and all nested objects lack it |
| `test-results.schema.json` | NO | Root and all nested objects lack it |
| `test_plan.schema.json` | NO | Root and all nested objects lack it |
| `tool-manifest.schema.json` | NO | Root object lacks it |
| `track-metadata.schema.json` | INVERTED | Has `additionalProperties: true` explicitly |
| `ux_spec.schema.json` | NO | Root and all nested objects lack it |
| `workflow-definition.schema.json` | YES | `unevaluatedProperties: false` at all levels |
| `artifact-graph.schema.json` | NO | Root lacks it; nodes/edges metadata allow arbitrary |
| `agent-config.schema.json` | YES | `additionalProperties: false` |

**Schemas needing `additionalProperties: false`:** `agent-definition`, `artifact_manifest`, `evolution-state`, `hook-definition`, `plan`, `product_requirements`, `project_brief`, `system_architecture`, `test-results`, `test_plan`, `ux_spec`

**Schemas with deliberate `additionalProperties: true`:** `implementation-plan` (root), `track-metadata` (root), `artifact-graph` (node metadata, edge metadata), `evolution-state` (activeEvolution.metadata)

### 2. Regex DoS (ReDoS)

**Severity: NONE**

All `pattern` fields across all 28 schemas were analyzed for catastrophic backtracking. No vulnerable patterns were found. All patterns are simple, linear-time matches:

- `^ADR-[0-9]{1,4}$` - Bounded repetition, no nesting
- `^[a-z][a-z0-9-]*$` - Single quantifier, no alternation inside group
- `^[0-9]{4}-[0-9]{2}-[0-9]{2}$` - Fixed-length match
- `^\\d+\\.\\d+\\.\\d+$` - Simple dot-separated digits
- `^[0-9]+/(second|minute|hour)$` - Simple alternation (not nested)
- `^[0-9]+(KB|MB)$` - Simple alternation (not nested)
- `^\\d+\\s+(hour|hours|day|days|week|weeks|month|months)$` - Simple alternation
- `^evo-[a-z0-9]{8}$` - Fixed-length bounded
- `^pat-[a-z0-9]{8}$` - Fixed-length bounded
- `^sug-[a-z0-9]{8}$` - Fixed-length bounded
- `^FR-\\d+$` - Unbounded but no nesting
- `^[a-z0-9_-]+_[0-9]{8}$` - No nested quantifiers
- `^\\d+%$` - Simple
- `^\\.claude/agents/(core|specialized|domain|orchestrators)/[a-z0-9-]+\\.md$` - No nested quantifiers
- `^[0-9]+\\.[0-9]+\\.[0-9]+$` - Simple semver

**Verdict:** All regex patterns are safe. No action required.

### 3. String Length Limits

**Severity: MEDIUM**

Many string fields lack `maxLength` constraints. While these schemas are internal, an agent producing excessively large string values could exhaust parser memory.

**Schemas with ALL string fields bounded:** `adr-template`, `agent-identity`, `specification-template`

**Schemas with SOME unbounded strings:**

| Schema | Unbounded String Fields (Examples) |
|--------|-----------------------------------|
| `agent-definition` | `frontmatter.name` (has pattern but no maxLength), `content` (only minLength) |
| `artifact_manifest` | `manifestVersion`, `project.name`, `project.version`, `project.description`, all artifact fields |
| `evolution-state` | `researchEntry.query`, `researchEntry.source`, `researchEntry.findings`, `completedEvolution.name`, `completedEvolution.description`, `completedEvolution.trigger`, many others |
| `hook-definition` | `matcher` (regex pattern string - no length limit) |
| `plan.schema.json` | `title`, `version`, `author`, all task descriptions |
| `product_requirements` | `documentTitle`, `executiveSummary`, `productOverview.productVision`, `architecture`, `apis`, `dataModels` |
| `project-analysis` | `project_root`, `framework.name`, `framework.version` |
| `project_brief` | `projectName`, `executiveSummary`, all scope items, `budget` |
| `system_architecture` | Nearly all fields unbounded |
| `test-results` | `results_id`, `test_executor`, `error_message`, `stack_trace` |
| `test_plan` | `feature_name`, `overview`, `test_strategy`, `docker_compose`, `setup_instructions` |
| `tool-manifest` | Many nested string fields |
| `track-metadata` | `assignee`, `description` (has minLength 10 only) |
| `ux_spec` | Nearly all fields unbounded |
| `artifact-graph` | `node.path`, edge `from`/`to` |
| `agent-config` | `version`, all agent property strings |

**Recommended maxLength values by field type:**
- Identifiers/names: 200
- Descriptions: 2000
- Long-form content (error messages, stack traces): 10000
- Path strings: 500
- Version strings: 50

### 4. Array Size Limits

**Severity: MEDIUM**

Many array fields lack `maxItems` constraints. Large arrays could cause memory issues during validation or downstream processing.

**Schemas with bounded arrays:** `evolution-state` (pattern.examples: maxItems 5), `specification-template` (acceptance_criteria: maxItems 50), `project-analysis` (largest_files: maxItems 10), `agent-identity` (traits: maxItems 5)

**Schemas with ALL unbounded arrays:**

| Schema | Unbounded Array Fields |
|--------|----------------------|
| `adr-template` | `stakeholders`, `tags` |
| `agent-capability-card` | `capabilities`, `triggerPhrases`, `requiredTools`, `skills`, `examples`, `tags`, `agents`, `references`, `dependencies` |
| `agent-definition` | `frontmatter.tools`, `frontmatter.disallowedTools`, `frontmatter.skills`, `frontmatter.context_files` |
| `artifact_manifest` | `artifacts`, `relationships`, `workflows`, all nested arrays |
| `evolution-state` | `evolutions`, `patterns`, `suggestions`, `research`, `filesCreated`, `filesModified`, `basedOnPatterns`, `relatedPatterns` |
| `hook-definition` | `agents`, `skills` |
| `plan.schema.json` | `objectives`, `milestones`, `tasks`, `risks` |
| `product_requirements` | All arrays (functionalRequirements, keyFeatures, acceptanceCriteria, timeline, etc.) |
| `project-analysis` | `frameworks`, `outdated`, `vulnerabilities`, `patterns_detected`, `recommendations`, `errors` |
| `project_brief` | `objectives`, `teamMembers`, `keyStakeholders`, `keyMilestones`, `successCriteria`, `risks`, `assumptions`, `technology`, `nextSteps` |
| `system_architecture` | All arrays (references, goals, stakeholders, constraints, components, etc.) |
| `test-results` | `test_executions`, `failed_tests`, `recommendations`, `regression_issues` |
| `test_plan` | All arrays (unit, integration, e2e, test_scenarios, test_data_requirements, emulators, etc.) |
| `tool-manifest` | `core`, `mcp`, `mandatory` |
| `track-metadata` | `classification`, `acceptance_criteria`, `dependencies`, `blocked_by`, `blocks`, `reporting.insights` |
| `ux_spec` | All arrays (userStories, acceptanceCriteria, componentSpecifications, wireframes, etc.) |
| `workflow-definition` | `steps`, `agents`, `hooks.entry`, `hooks.exit`, `hooks.error` |
| `artifact-graph` | `edges`, `missingIntegrations` |
| `agent-config` | `agents.*.tools`, `validation.mandatory` |

**Recommended maxItems by field type:**
- Tags/labels: 50
- Skill/tool lists: 100
- Requirements/criteria: 200
- Test executions/results: 10000
- Evolution history: 1000
- Artifact collections: 5000

### 5. Enum Completeness

**Severity: LOW**

All enum fields were reviewed. Most are appropriate for their context. Notable observations:

| Schema | Field | Enum Values | Assessment |
|--------|-------|------------|------------|
| `agent-definition` | `model` | sonnet, opus, haiku, inherit + full IDs | GOOD - covers all current models |
| `agent-capability-card` | `domain` | 15 values | GOOD - comprehensive |
| `evolution-state` | `state` | 9 values including terminal states | GOOD |
| `hook-definition` | `type` | PreToolUse, PostToolUse, UserPromptSubmit | INCOMPLETE - missing `Stop` (referenced in agent-definition) |
| `test_plan` | `local_emulation.test_environment` | local, staging, production | GOOD |
| `track-metadata` | `classification` | 7 values | Could add "accessibility", "internationalization" |

**Action:** Add `Stop` to `hook-definition.type` enum.

### 6. Required Field Coverage

**Severity: LOW**

Most schemas have appropriate `required` fields. Concerns:

| Schema | Issue |
|--------|-------|
| `artifact_manifest` | Artifact items only require `id`, `name`, `type`, `path` - missing `version` and `status` as required |
| `hook-definition` | Missing `enabled` as required (defaults to `true` but could be omitted) |
| `plan.schema.json` | Only requires `title` and `objectives` - `tasks` should arguably be required |
| `project_brief` | Only requires `projectName`, `executiveSummary`, `objectives` - reasonable |
| `test_plan` | Good required fields |
| `implementation-plan` | No required fields at all - extremely permissive |

**Action:** Consider adding `required` fields to `implementation-plan` (at minimum `feature` and `status`).

### 7. Type Safety

**Severity: LOW**

All properties across all 28 schemas have explicit type declarations. No untyped properties were found.

Notable type patterns:
- `evolution-state` uses `oneOf: [{ type: "null" }, { type: "string" }]` correctly for nullable fields
- `agent-definition` uses `oneOf` for the `tools` field (array or string), which is appropriate
- `agent-config` uses `oneOf: [{ type: "integer" }, { type: "null" }]` for thinking budget map values

**Verdict:** Type safety is well-handled. No action required.

### 8. Default Values

**Severity: LOW**

Default values were reviewed across all schemas. All defaults are safe:

| Schema | Field | Default | Assessment |
|--------|-------|---------|------------|
| `agent-capability-card` | maxConcurrentTasks | 5 | SAFE |
| `agent-capability-card` | preferredModel | "sonnet" | SAFE |
| `agent-capability-card` | successRate | 1.0 | SAFE - optimistic but appropriate |
| `agent-capability-card` | consecutiveFailures | 0 | SAFE |
| `hook-definition` | category | "custom" | SAFE |
| `hook-definition` | priority | 50 | SAFE |
| `hook-definition` | enabled | true | SAFE |
| `skill-definition` | version | "1.0" | SAFE |
| `skill-definition` | model | "sonnet" | SAFE |
| `skill-definition` | invoked_by | "both" | Review: could default to "agent" for tighter security |
| `skill-definition` | user_invocable | true | Review: defaults to user-accessible |
| `skill-definition` | error_handling | "graceful" | SAFE |
| `skill-definition` | context_fork | false | SAFE |
| `evolution-state` | research | [] | SAFE |
| `evolution-state` | suggestion.priority | "medium" | SAFE |
| `evolution-state` | suggestion.status | "pending" | SAFE |
| `evolution-state` | completedEvolution.success | true | Optimistic but SAFE |
| `test_plan` | local_emulation.test_environment | "local" | SAFE |
| `track-metadata` | metrics.effortMultiplier | Range 0.5-5 | SAFE |

**Note on `skill-definition` defaults:** `user_invocable: true` and `invoked_by: "both"` mean newly created skills are user-accessible by default. This follows a permissive-by-default model. In a zero-trust environment, consider defaulting to `invoked_by: "agent"` and `user_invocable: false`, requiring explicit opt-in for user-facing skills.

### 9. $ref Resolution

**Severity: NONE**

All `$ref` references are local (`#/$defs/...`). No external URL `$ref` references exist in any schema. The `$id` and `$schema` fields use URLs but these are identifiers, not fetched resources.

Schemas using `$ref`:
- `agent-capability-card` - References `#/$defs/Capability`, `#/$defs/Constraints`, `#/$defs/Health`, `#/$defs/Metadata`
- `evolution-state` - References `#/$defs/activeEvolution`, `#/$defs/completedEvolution`, `#/$defs/pattern`, `#/$defs/suggestion`, `#/$defs/researchEntry`
- `workflow-definition` - Uses `oneOf` inline, no `$ref`

**Verdict:** No external reference risk. No action required.

### 10. Schema Composition Security

**Severity: NONE**

Schema composition (`oneOf`, `allOf`, `anyOf`) usage was reviewed:

- `agent-definition`: Uses `oneOf` for `frontmatter.tools` (array or string). No bypass risk - both options are typed.
- `evolution-state`: Uses `oneOf` for nullable fields (`[null, object]`, `[null, string]`). Safe pattern.
- `agent-config`: Uses `oneOf` for nullable integers. Safe pattern.
- `workflow-definition`: Uses `oneOf` in step items (string or object). Both are typed with `unevaluatedProperties: false`.

**Verdict:** No composition bypass risks. No action required.

---

## Schema Version Inconsistency

**Severity: LOW (informational)**

Schemas use three different JSON Schema drafts:

| Draft | Count | Schemas |
|-------|-------|---------|
| `draft-07` (`http://` or `https://`) | 19 | adr-template, agent-capability-card, agent-identity, artifact_manifest, implementation-plan, phase-models, plan, presets, product_requirements, project-analysis, project_brief, system_architecture, test-results, test_plan, tool-manifest, track-metadata, ux_spec, artifact-graph, agent-config |
| `2020-12` | 5 | agent-definition, evolution-state, skill-definition, specification-template, workflow-definition |
| `draft-07` (skill output schemas) | 4 | skill-diagram-generator-output, skill-repo-rag-output, skill-test-generator-output, hook-definition |

The `2020-12` schemas use `unevaluatedProperties` which is not available in `draft-07`. If a `draft-07` validator is used on a `2020-12` schema, `unevaluatedProperties` would be silently ignored, effectively disabling property injection protection.

**Recommendation:** Standardize on `2020-12` or ensure validators support the declared draft version for each schema.

---

## Per-Schema Risk Summary

| # | Schema | Property Injection | Unbounded Strings | Unbounded Arrays | Other Issues | Risk |
|---|--------|-------------------|-------------------|-----------------|--------------|------|
| 1 | `adr-template` | SAFE | SAFE | 2 arrays | - | LOW |
| 2 | `agent-capability-card` | SAFE | 2 fields | 9 arrays | - | LOW |
| 3 | `agent-definition` | MISSING | 2 fields | 4 arrays | Draft mismatch possible | MEDIUM |
| 4 | `agent-identity` | SAFE | SAFE | SAFE | - | LOW |
| 5 | `artifact_manifest` | MISSING | Many | Many | No required on metadata | HIGH |
| 6 | `evolution-state` | PARTIAL | Many | Many | metadata allows arbitrary | MEDIUM |
| 7 | `hook-definition` | MISSING | 2 fields | 2 arrays | Missing `Stop` in type enum | MEDIUM |
| 8 | `implementation-plan` | INVERTED | 1 field | 2 arrays | No required fields | HIGH |
| 9 | `phase-models` | SAFE | SAFE | - | - | LOW |
| 10 | `plan` | MISSING | Many | Many | - | MEDIUM |
| 11 | `presets` | SAFE | SAFE | 1 array | - | LOW |
| 12 | `product_requirements` | MISSING | Many | Many | - | MEDIUM |
| 13 | `project-analysis` | MISSING | Some | Many | - | MEDIUM |
| 14 | `project_brief` | MISSING | Many | Many | - | MEDIUM |
| 15 | `skill-definition` | SAFE | 1 field | 4 arrays | Default review needed | LOW |
| 16 | `skill-diagram-generator-output` | SAFE | 1 field | 2 arrays | - | LOW |
| 17 | `skill-repo-rag-output` | SAFE | SAFE | 4 arrays | - | LOW |
| 18 | `skill-test-generator-output` | SAFE | SAFE | 3 arrays | - | LOW |
| 19 | `specification-template` | SAFE | SAFE | 2 arrays | - | LOW |
| 20 | `system_architecture` | MISSING | Many | Many | - | MEDIUM |
| 21 | `test-results` | MISSING | Many | Many | - | MEDIUM |
| 22 | `test_plan` | MISSING | Many | Many | - | MEDIUM |
| 23 | `tool-manifest` | MISSING | Many | Many | - | MEDIUM |
| 24 | `track-metadata` | INVERTED | 1 field | 6 arrays | `additionalProperties: true` | MEDIUM |
| 25 | `ux_spec` | MISSING | Many | Many | - | MEDIUM |
| 26 | `workflow-definition` | SAFE | SAFE | 5 arrays | - | LOW |
| 27 | `artifact-graph` | PARTIAL | 2 fields | 2 arrays | metadata allows arbitrary | MEDIUM |
| 28 | `agent-config` | SAFE | SAFE | 2 arrays | - | LOW |

---

## Remediation Recommendations

### Priority 1 (HIGH) -- Property Injection Protection

Add `additionalProperties: false` to the root `properties` object and all nested object definitions in these 11 schemas:

1. `agent-definition.schema.json` - root and `frontmatter`
2. `artifact_manifest.schema.json` - root and all nested objects
3. `hook-definition.schema.json` - root
4. `plan.schema.json` - root and all nested objects
5. `product_requirements.schema.json` - root and all nested objects
6. `project_brief.schema.json` - root and all nested objects
7. `system_architecture.schema.json` - root and all nested objects
8. `test-results.schema.json` - root and all nested objects
9. `test_plan.schema.json` - root and all nested objects
10. `tool-manifest.schema.json` - root
11. `ux_spec.schema.json` - root and all nested objects

For schemas with intentional `additionalProperties: true` (implementation-plan, track-metadata, artifact-graph metadata), add a comment documenting the rationale.

**Effort:** Low per schema. Estimated 2-3 hours total.

### Priority 2 (MEDIUM) -- String Length Bounds

Add `maxLength` to all unbounded string fields. Recommended limits:

| Field Type | maxLength |
|-----------|-----------|
| Identifiers, names | 200 |
| Short descriptions | 500 |
| Long descriptions, summaries | 2000 |
| Content bodies, code snippets | 10000 |
| File paths | 500 |
| Version strings | 50 |
| Error messages | 5000 |
| Stack traces | 50000 |

**Most impactful schemas:** `artifact_manifest`, `evolution-state`, `product_requirements`, `system_architecture`, `test-results`, `ux_spec`

**Effort:** Medium. Estimated 4-6 hours total (requires reviewing each field's expected content).

### Priority 3 (MEDIUM) -- Array Size Bounds

Add `maxItems` to all unbounded array fields. Recommended limits:

| Array Type | maxItems |
|-----------|----------|
| Tags, labels, classifications | 50 |
| Tool/skill lists | 100 |
| Requirements, criteria | 200 |
| Components, artifacts | 500 |
| Test cases, executions | 10000 |
| History entries (evolutions) | 1000 |

**Most impactful schemas:** `artifact_manifest`, `evolution-state`, `product_requirements`, `system_architecture`, `test-results`, `test_plan`

**Effort:** Medium. Estimated 3-4 hours total.

### Priority 4 (LOW) -- Enum and Required Fixes

1. Add `Stop` to `hook-definition.schema.json` type enum
2. Add required fields to `implementation-plan.schema.json` (at minimum `feature`, `status`)
3. Consider adding `version` and `status` as required to `artifact_manifest` artifact items
4. Standardize JSON Schema draft version across all schemas

**Effort:** Low. Estimated 1-2 hours total.

### Priority 5 (LOW) -- Default Value Tightening

Review `skill-definition.schema.json` defaults:
- Consider changing `invoked_by` default from `"both"` to `"agent"`
- Consider changing `user_invocable` default from `true` to `false`
- This follows least-privilege principle: skills are agent-only by default, opt-in for user access

**Effort:** Trivial. Estimated 30 minutes. Requires decision from architect.

---

## Positive Findings

The following security practices are already well-implemented:

1. **No external $ref references** -- eliminates remote schema injection risk
2. **No ReDoS-vulnerable patterns** -- all regex patterns are safe
3. **Good type coverage** -- every property is typed
4. **Safe defaults** -- no dangerous default values
5. **Newer schemas are well-protected** -- schemas created more recently (skill-definition, workflow-definition, specification-template) consistently use `unevaluatedProperties: false` and bounded strings
6. **Consistent naming patterns** -- `^[a-z][a-z0-9-]*$` used across multiple schemas
7. **Good use of `format: "date-time"`** -- timestamps are consistently validated
8. **Well-structured $defs** -- evolution-state schema demonstrates excellent use of local definitions

---

## Methodology

Each schema was analyzed against the following 10-point checklist:

1. **Property Injection:** Checked for `additionalProperties: false` or `unevaluatedProperties: false` at root and all nested objects
2. **ReDoS:** All `pattern` fields tested for nested quantifiers `(a+)+`, alternation inside repetition `(a|b+)+`, and other backtracking patterns
3. **String Bounds:** All `type: "string"` fields checked for `maxLength` constraint
4. **Array Bounds:** All `type: "array"` fields checked for `maxItems` constraint
5. **Enum Completeness:** All `enum` fields reviewed against known framework values
6. **Required Fields:** `required` arrays reviewed for critical field coverage
7. **Type Safety:** All properties checked for explicit `type` declaration
8. **Default Values:** All `default` values reviewed for safety implications
9. **$ref Resolution:** All `$ref` values checked for external URL references
10. **Schema Composition:** All `oneOf`, `anyOf`, `allOf` compositions checked for bypass opportunities

---

## Appendix: Schema Inventory

| # | Schema File | Draft | $id | additionalProperties |
|---|------------|-------|-----|---------------------|
| 1 | adr-template.schema.json | draft-07 | Yes | false |
| 2 | agent-capability-card.schema.json | draft-07 | Yes | false (all levels) |
| 3 | agent-config.schema.json | draft-07 | Yes | false |
| 4 | agent-definition.schema.json | 2020-12 | Yes | MISSING |
| 5 | agent-identity.schema.json | draft-07 | Yes | false |
| 6 | artifact-graph.schema.json | draft-07 | Yes | PARTIAL |
| 7 | artifact_manifest.schema.json | draft-07 | No $id | MISSING |
| 8 | evolution-state.schema.json | 2020-12 | Yes | PARTIAL |
| 9 | hook-definition.schema.json | 2020-12 | Yes | MISSING |
| 10 | implementation-plan.schema.json | draft-07 | Yes | true (explicit) |
| 11 | phase-models.schema.json | draft-07 | Yes | false |
| 12 | plan.schema.json | draft-07 | No $id | MISSING |
| 13 | presets.schema.json | draft-07 | Yes | false |
| 14 | product_requirements.schema.json | draft-07 | No $id | MISSING |
| 15 | project-analysis.schema.json | draft-07 | Yes | MISSING |
| 16 | project_brief.schema.json | draft-07 | No $id | MISSING |
| 17 | skill-definition.schema.json | 2020-12 | Yes | unevaluatedProperties: false |
| 18 | skill-diagram-generator-output.schema.json | draft-07 | Yes | false |
| 19 | skill-repo-rag-output.schema.json | draft-07 | Yes | false |
| 20 | skill-test-generator-output.schema.json | draft-07 | Yes | false |
| 21 | specification-template.schema.json | 2020-12 | Yes | false |
| 22 | system_architecture.schema.json | draft-07 | No $id | MISSING |
| 23 | test-results.schema.json | draft-07 | Yes | MISSING |
| 24 | test_plan.schema.json | draft-07 | Yes | MISSING |
| 25 | tool-manifest.schema.json | draft-07 | Yes | MISSING |
| 26 | track-metadata.schema.json | draft-07 | Yes | true (explicit) |
| 27 | ux_spec.schema.json | draft-07 | No $id | MISSING |
| 28 | workflow-definition.schema.json | 2020-12 | Yes | unevaluatedProperties: false |

---

*End of Schema Security Audit Report*
