<!-- Agent: architect | Task: #17 | Session: 2026-02-09 -->

# Architecture Review: Skill-Centric Universal Expansion

**Date:** 2026-02-09
**Reviewer:** Architect Agent (Opus 4.6)
**Scope:** ~299 new files (90 schemas, 105 rules, 104 commands) across ~90 skills in 5 tiers
**Architecture Health Score:** C+ (Adequate with significant structural issues)

---

## Executive Summary

The skill-centric universal expansion successfully achieves its stated goal of providing every skill with a complete "ecosystem triad" of schema, rules, and command files. However, the execution reveals a classic **breadth-over-depth anti-pattern**: the expansion prioritized completeness of coverage (every skill gets artifacts) over quality of individual artifacts. The result is a system where approximately 40% of the new schemas are hollow stubs, rules quality varies by 10x between tiers, and 104 commands are byte-for-byte identical in structure. The expansion added significant maintenance surface area without proportional value.

---

## 1. Schema Architecture Assessment

### 1.1 Findings

**Total skill output schemas:** 90 files
**Actually consumed at runtime:** 2 (repo-rag, diagram-generator) -- 2.2% utilization
**Schemas with meaningful output modeling:** ~35 (39%)
**Schemas that are hollow stubs (status + empty output):** ~55 (61%)

### 1.2 Schema Quality Tiers (Observed)

**Tier A -- Domain-Specific, Meaningful (35 schemas, ~39%)**

Examples: `skill-tdd-output`, `skill-debugging-output`, `skill-ripgrep-output`, `skill-security-architect-output`, `skill-docker-compose-output`

These schemas model actual skill outputs accurately:

- Required fields match the skill's real output structure
- Meaningful constraints (enums, minLength, minimum/maximum)
- Domain-specific sub-schemas (e.g., STRIDE categories in security-architect, Red-Green-Refactor phases in TDD)
- `additionalProperties: false` enforced (strict validation)

**Tier B -- Minimal but Typed (0 schemas observed in this tier)**

No schemas occupied this middle ground -- they are either Tier A or Tier C.

**Tier C -- Hollow Stubs (55 schemas, ~61%)**

Examples: `skill-swarm-coordination-output`, `skill-memory-forensics-output`, `skill-scientific-skills-output`, `skill-consensus-voting-output`, `skill-binary-analysis-patterns-output`, `skill-ai-ml-expert-output`

These schemas contain only:

```json
{
  "required": ["status", "output"],
  "properties": {
    "status": { "enum": ["success", "partial", "failed"] },
    "output": { "type": "object", "description": "Skill-specific output data" }
  }
}
```

This validates nothing meaningful -- any object with a status string passes.

### 1.3 Structural Inconsistencies

| Property                 | Tier A Schemas                          | Tier C Stubs        |
| ------------------------ | --------------------------------------- | ------------------- |
| `$id` domain             | `claude-code.anthropic.com`             | `agent-studio.dev`  |
| Required top-level       | `skillName, version, timestamp, output` | `status, output`    |
| `additionalProperties`   | `false` (strict)                        | absent (permissive) |
| Output `required` fields | Domain-specific                         | None                |
| `timestamp` field        | Present                                 | Absent              |
| `skillName` with `const` | Yes                                     | No                  |

**Critical Finding:** There are two incompatible schema archetypes sharing the same naming convention. The Tier A schemas require `{skillName, version, timestamp, output}` while the Tier C stubs require `{status, output}`. These are structurally incompatible -- a valid Tier A instance would fail Tier C validation and vice versa.

### 1.4 Missing Abstractions

No base schema exists that skill output schemas extend. This should be:

```json
{
  "$id": "skill-output-base.schema.json",
  "type": "object",
  "required": ["skillName", "version", "timestamp", "output"],
  "properties": {
    "skillName": { "type": "string" },
    "version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "timestamp": { "type": "string", "format": "date-time" },
    "output": { "type": "object" }
  }
}
```

Individual skill schemas would then use `$ref` or `allOf` to extend this base.

### 1.5 Consumer Analysis

The 90 skill output schemas have **zero runtime consumers**:

- `SCHEMA_MAP` in `creator-commons.cjs` maps artifact types (skill, agent, hook) to definition schemas, NOT to skill output schemas
- `unified-creator-guard.cjs` similarly validates artifact definitions, not skill outputs
- Only 2 tool scripts reference their own skill output schemas (repo-rag, diagram-generator)
- No hook, library, or runtime code validates skill output against these schemas

**Verdict:** 88 of 90 schemas are purely documentary artifacts with no validation path.

---

## 2. Rules Architecture Assessment

### 2.1 Findings

**Total rules files:** 105
**Framework rules (pre-expansion):** 11
**Skill-specific rules (new):** 94

### 2.2 Quality Tiers (Observed)

**Tier A -- Actionable and Enforceable (Framework + Core Skills)**

Examples: `tdd.md` (126 lines), `testing.md`, `security.md`, `code-standards.md`

Characteristics:

- Iron Laws with enforcement mechanisms
- Verification checklists with checkboxes
- Common Rationalizations tables (anti-pattern prevention)
- Cross-references to SKILL.md, related rules, and related references
- Pre-completion blocking requirements
- Consistent sections: Core Rules, When to Use, Red Flags, Verification Checklist, Related Skills, Related References

**Tier B -- Informative and Structured (Domain Expert Rules)**

Examples: `go-expert.md` (62 lines), `docker-compose.md` (58 lines), `research-synthesis.md` (59 lines)

Characteristics:

- Core Principles section with actionable guidelines
- Integration Points section (which agents/skills use this)
- Anti-Patterns section
- Memory Protocol (mandatory) section
- Missing: Verification checklists, Iron Laws, enforcement mechanisms

**Tier C -- Thin Pointers (Tier 5 Specialized Rules)**

Examples: `memory-forensics.md` (18 lines), `scientific-skills.md` (18 lines)

Characteristics:

- One-sentence description
- "When to Use" with a single generic sentence
- Usage code block
- Related References link to SKILL.md
- No actual rules, best practices, anti-patterns, or actionable content

### 2.3 Structural Analysis

| Metric                  | Framework Rules   | Tier A Skill Rules | Tier B Skill Rules | Tier C Skill Rules |
| ----------------------- | ----------------- | ------------------ | ------------------ | ------------------ |
| Avg. lines              | 130               | 120                | 55                 | 18                 |
| Has Iron Law            | Sometimes         | Yes                | No                 | No                 |
| Has Checklist           | Sometimes         | Yes                | No                 | No                 |
| Has Anti-Patterns       | Sometimes         | Yes                | Yes                | No                 |
| Has Integration         | Sometimes         | Yes                | Yes                | No                 |
| Has Memory Protocol     | No                | Sometimes          | Yes                | No                 |
| Enforceable             | Partially (hooks) | By convention      | By convention      | Not at all         |
| Value-add over SKILL.md | High              | Medium             | Low                | Zero               |

### 2.4 Redundancy Analysis

**Framework rules vs skill rules overlap:**

- `testing.md` (framework) overlaps significantly with `tdd.md` (skill rule) -- both cover TDD, test organization, test execution
- `security.md` (framework) overlaps with `security-architect.md` (skill rule) and `auth-security-expert.md` (skill rule)
- `code-standards.md` (framework) overlaps with `code-quality-expert.md`, `code-style-validator.md`, `best-practices-guidelines.md`

**Cross-skill rules overlap:**

- `code-quality-expert.md`, `code-style-validator.md`, `best-practices-guidelines.md` all cover code quality from slightly different angles
- `verification-before-completion.md` overlaps with `tdd.md` on completion verification

### 2.5 Enforceability Assessment

Rules are only enforceable if:

1. A hook checks them (very few do), or
2. An agent reads them as context (most do via `.claude/rules/` auto-loading), or
3. A human reads them (unlikely at 105 files)

The `.claude/rules/` directory is auto-loaded by Claude Code as project instructions. With 105 files, this creates a massive context injection. Claude Code loads ALL rules files into context on every prompt. At 18 lines average for Tier C and 55 for Tier B, this adds approximately:

- 11 framework rules x 130 lines = 1,430 lines
- ~25 Tier A rules x 120 lines = 3,000 lines
- ~45 Tier B rules x 55 lines = 2,475 lines
- ~24 Tier C rules x 18 lines = 432 lines
- **Total: ~7,337 lines of rules loaded on every prompt**

This approaches the "attention degradation" threshold documented in the performance rules. Context quality will degrade as the model must process 105 rules files on every interaction.

---

## 3. Command Architecture Assessment

### 3.1 Findings

**Total commands:** 97 (plus a few pre-existing)
**All use thin delegation pattern:** Yes (100%)
**Commands with additional metadata:** ~12 (pre-existing, e.g., `tdd.md` has description field)

### 3.2 Pattern Analysis

Every new command follows this exact pattern:

```yaml
---
disable-model-invocation: true
---
Invoke the {skill-name} skill and follow it exactly as presented to you
```

This is byte-for-byte identical except for the skill name. Some pre-existing commands add a `description` frontmatter field.

### 3.3 Assessment

**Strengths of thin delegation:**

- Zero code duplication
- Consistent behavior
- Easy to maintain
- Clear separation of concerns (commands route, skills execute)

**Weaknesses:**

- No parameter passing -- commands cannot accept arguments
- No validation -- commands cannot check preconditions before invoking the skill
- No composition -- commands cannot chain multiple skills
- Discoverability problem: 97 nearly identical commands in `/commands` means `/help` is overwhelming
- Some commands have questionable value: `/scientific-skills`, `/memory-forensics`, `/binary-analysis-patterns` -- these are niche skills unlikely to be invoked by users via slash commands

### 3.4 Naming Conflicts and Confusion

Several commands have similar names that could confuse users:

- `/debug` vs `/debugging` (both exist)
- `/security-review` vs `/security-architect` (overlap)
- `/analyze` vs `/code-analyzer` vs `/code-quality-expert` (three similar commands)
- `/verify` vs `/verification-before-completion` (overlap)
- `/code-semantic-search` vs `/code-structural-search` (technical distinction unclear to users)

### 3.5 Discovery Mechanism

Commands are auto-discovered by Claude Code via the `/commands` directory. With 97 commands, the slash command menu becomes unwieldy. There is no categorization, no priority ordering, and no way to mark commands as "advanced" or "common."

---

## 4. Integration Architecture Assessment

### 4.1 Catalog System (4 catalogs)

| Catalog         | Entries | Accuracy | Value                                          |
| --------------- | ------- | -------- | ---------------------------------------------- |
| Schema Catalog  | 98      | 100%     | Medium (88 schemas have no consumers)          |
| Command Catalog | 81+     | High     | Medium (discovery via directory already works) |
| Rules Catalog   | 86      | 100%     | High (new catalog, needed for organization)    |
| Skill Catalog   | 100     | 100%     | High (primary discovery mechanism)             |

The catalog system successfully tracks all artifacts, but tracking artifacts that provide no value (hollow schemas, thin pointer rules) creates a false sense of completeness.

### 4.2 Agent Wiring

- **30 orphan skills** (no agent assignments) -- identified in Task #15
- Agent assignments focus on Tier 1-2 skills; Tier 3-5 skills largely unassigned
- The expansion created artifacts for all skills uniformly, but agent wiring remains incomplete for specialized/niche skills

### 4.3 Schema-Rules-Command Triad Granularity

**Is creating all three artifacts for every skill the right granularity?**

The answer depends on skill tier:

| Tier                                          | Schema Value | Rules Value     | Command Value |
| --------------------------------------------- | ------------ | --------------- | ------------- |
| P0 Core (tdd, debugging, etc.)                | High         | High            | High          |
| P1 Security (static-analysis, etc.)           | High         | Medium          | Medium        |
| P2 Domain (go-expert, react-expert)           | Medium       | Medium          | Low           |
| P3 Infra (terraform, k8s, docker)             | Medium       | Medium          | Medium        |
| P4 Specialized (scientific, memory-forensics) | Zero (stubs) | Zero (pointers) | Low           |
| P5 Niche (binary-analysis, web3)              | Zero (stubs) | Zero (pointers) | Low           |

**Conclusion:** The triad is appropriate for Tiers P0-P3. For Tiers P4-P5, the expansion created hollow artifacts that add maintenance burden without value.

### 4.4 Scalability Assessment

**Current state:** ~90 skills, 90 schemas, 105 rules, 97 commands
**Projected at 200 skills:** 200 schemas, 200+ rules, 200 commands

**Will this scale?**

1. **Schemas:** If 61% remain stubs, 200 schemas means 122 hollow stubs. The schemas directory becomes noise. However, since no runtime consumer validates these, the cost is purely maintenance overhead and disk space -- manageable.

2. **Rules:** This is the critical scaling bottleneck. Claude Code loads ALL `.claude/rules/*.md` files into context. At 200 rules files, context injection would reach ~14,000 lines -- exceeding the reliable attention window. Performance degradation would be measurable and significant.

3. **Commands:** The slash command menu at 200 entries becomes unusable. Users will not browse 200 commands. Category-based discovery or search would be required.

4. **Catalogs:** All four catalogs would need updates for each new skill. At current sizes, the catalogs themselves become multi-hundred-line documents that are tedious to maintain.

---

## 5. Anti-Pattern Detection

### 5.1 Copy-Paste Pattern (CRITICAL)

**55 hollow schema stubs** contain identical content with only the skill name and title changed. This is textbook copy-paste anti-pattern. The 25-line stub template was replicated 55 times rather than being expressed as a shared base schema.

**~24 thin pointer rules** contain nearly identical content (18 lines) with only the skill name changed. Same pattern.

**97 commands** are byte-for-byte identical except for the skill name. While this is by design (thin delegation), it means 97 files could be replaced by a single dynamic command that takes the skill name as an argument.

### 5.2 Over-Engineering

**Schemas for skills that do not produce structured output:**

- `scientific-skills` -- a meta-skill wrapping 139 sub-skills. Its "output" is whatever the sub-skill produces.
- `memory-forensics` -- produces Volatility analysis reports, not structured JSON.
- `binary-analysis-patterns` -- produces analysis documentation, not structured data.
- `consensus-voting` -- produces vote tallies and decisions in prose.

These skills produce markdown/text output, not JSON. Creating JSON schemas for them is architecturally incorrect -- the schema cannot validate what the skill actually produces.

### 5.3 Missing Abstractions

1. **No base schema**: Every Tier A schema duplicates the `skillName/version/timestamp/output` envelope. A `$ref` to a base schema would eliminate ~1,400 lines of duplication across 35 schemas.

2. **No rules template**: Tier B and C rules could be generated from a template with skill metadata, rather than hand-authored as separate files.

3. **No dynamic command resolution**: A single command handler could resolve `/{skill-name}` dynamically from the skill catalog, eliminating 97 static command files.

### 5.4 Governance Gap (CRITICAL)

**Who maintains 299 new files?**

- No CODEOWNERS or ownership assignment for rules, schemas, or commands
- No automated freshness checks (do schema fields match SKILL.md output?)
- No automated consistency checks (do all schemas use the same envelope?)
- No lifecycle management (when a skill is archived, are its schema/rules/command archived?)
- The catalog update process is manual and documented only in learnings.md

At 299 files, manual governance will fail. Files will drift, become stale, and accumulate inconsistencies. This is already visible in the two incompatible schema archetypes.

### 5.5 Context Budget Pressure

The expansion significantly increases the context budget for every interaction:

- 105 rules files auto-loaded into Claude Code context (~7,337 lines)
- This competes with CLAUDE.md (~500 lines), agent files, skill files, and actual code
- The performance rules document warns about attention degradation past 32K tokens
- 105 rules files at ~40 tokens/line = ~293K tokens of rules context

This is likely exceeding the reliable context window and causing rules to be ignored rather than followed.

---

## Top 5 Structural Issues

### 1. Hollow Schema Stubs (61% of schemas provide zero validation value)

55 schemas contain only `{status, output}` with no output constraints. They are architecturally incompatible with the 35 meaningful schemas (different required fields, different structure). No runtime consumer validates against any of these schemas.

**Impact:** High. Creates false sense of coverage. Maintenance burden without value. Two incompatible schema archetypes create confusion about which pattern to follow.

**Recommendation:** Either (a) delete hollow stubs and create on-demand when skills are promoted to produce structured output, or (b) standardize on the Tier A envelope and add domain-specific output properties incrementally.

### 2. Context Overload from 105 Rules Files

All `.claude/rules/*.md` files are auto-loaded into context. 105 files exceeds the reliable attention window, causing rules to be ignored.

**Impact:** Critical. Directly degrades agent performance. More rules paradoxically means less compliance.

**Recommendation:** Move skill-specific rules out of `.claude/rules/` into skill directories (e.g., `.claude/skills/{name}/rules.md`). Keep `.claude/rules/` for the 11 framework-level rules that apply universally. Agents load skill-specific rules on-demand via `Skill()` invocation.

### 3. No Base Schema / No Schema Inheritance

35 Tier A schemas duplicate the same 4-field envelope. Changes to the envelope format require updating 35+ files.

**Impact:** Medium. DRY violation. Maintenance risk.

**Recommendation:** Create `skill-output-base.schema.json` and have all skill schemas use `allOf` to extend it.

### 4. Undifferentiated Command Surface (97 identical commands)

97 slash commands with identical structure. No categorization, no priority, no parameter support. Users face a wall of 97+ commands with no guidance.

**Impact:** Medium. UX degradation. Discovery becomes harder as commands increase.

**Recommendation:** Implement dynamic command resolution or category-based command discovery. Remove commands for niche/specialized skills that users will never invoke via slash commands.

### 5. No Governance Automation

299 new files with no automated ownership, freshness checks, consistency validation, or lifecycle management. Manual governance has already produced two incompatible schema archetypes.

**Impact:** High (grows over time). Technical debt will compound as schemas drift from skill implementations.

**Recommendation:** Create automated validation scripts: (a) schema consistency checker (all schemas use same envelope), (b) rules quality scorer (flag sub-20-line rules as stubs), (c) lifecycle tracker (when skill is modified, check if schema/rules/command need updates).

---

## Top 5 Strengths

### 1. Consistent Thin Delegation Pattern for Commands

The decision to make all commands thin delegators to skills is architecturally sound. It creates a clean separation between user interface (commands) and behavior (skills). No logic duplication across layers.

### 2. Tier A Schema Quality is Excellent

The 35 well-crafted schemas (tdd, debugging, ripgrep, security-architect, docker-compose) demonstrate genuinely useful output modeling with appropriate constraints, enums, and domain-specific structures. These serve as excellent templates for future schema creation.

### 3. Tier A Rules Quality is Excellent

The core skill rules (tdd, debugging, verification-before-completion) are among the best-written files in the framework. Iron Laws, verification checklists, common rationalizations tables, and pre-completion requirements make them actionable and enforceable.

### 4. Catalog System Provides Complete Coverage

All four catalogs (schema, command, rules, skill) are 100% accurate after the expansion. Every new artifact has a catalog entry. This is a significant improvement over the pre-expansion state where new artifacts were frequently orphaned.

### 5. Provenance Headers Consistently Applied

All new artifacts include provenance headers (`<!-- Agent: {type} | Task: #{id} | Session: {date} -->`), enabling traceability of which agent created each artifact and when. This is essential for governance at scale.

---

## Recommendations

### Immediate (P0 -- Do Now)

1. **Move skill-specific rules out of `.claude/rules/`** into `.claude/skills/{name}/rules.md`. This is the single highest-impact change. It reduces context injection from ~7,337 lines to ~1,430 lines (framework rules only). Skills load their own rules via `Skill()` invocation.

2. **Standardize schema envelope.** Pick one: `{skillName, version, timestamp, output}` (Tier A) or `{status, output}` (Tier C). Create `skill-output-base.schema.json` as the canonical base.

### Short-Term (P1 -- This Week)

3. **Delete or consolidate hollow schema stubs.** Replace 55 stub schemas with a single `skill-output-generic.schema.json` that all unspecified skills reference. Create skill-specific schemas only when skills are promoted to produce structured output.

4. **Add dynamic command resolution.** Instead of 97 static command files, implement a dynamic resolver that maps `/{skill-name}` to `Skill({ skill: "{skill-name}" })` at runtime. Retain static commands only for the ~15 most commonly used skills.

5. **Resolve command naming conflicts.** Consolidate `/debug` and `/debugging`, `/verify` and `/verification-before-completion`, `/analyze` and `/code-analyzer`. Users should not need to know which is which.

### Medium-Term (P2 -- This Month)

6. **Create governance automation.**
   - Schema consistency checker (all schemas use base envelope)
   - Rules quality scorer (flag stubs, enforce minimum content)
   - Lifecycle tracker (modified skills trigger schema/rules/command review)

7. **Add command categories.** Group commands by domain (development, security, infrastructure, planning, documentation) to improve discoverability.

8. **Wire skill output validation into runtime.** Create a post-skill-execution hook that validates skill output against its schema (if one exists). Without this, schemas are purely documentary and will drift from actual output.

### Long-Term (P3 -- This Quarter)

9. **Implement schema generation from SKILL.md.** Parse SKILL.md output format sections to auto-generate schema output properties. This ensures schemas stay in sync with skill documentation.

10. **Audit and trim niche skills.** Some skills (scientific-skills with "139 sub-skills", binary-analysis-patterns, protocol-reverse-engineering) may not be appropriate for this framework. Evaluate usage and prune unused skills along with their artifacts.

---

## Scalability Assessment

| Dimension                 | Current (90 skills)                    | At 150 Skills | At 200 Skills                   | Verdict                        |
| ------------------------- | -------------------------------------- | ------------- | ------------------------------- | ------------------------------ |
| Schemas                   | Manageable (90 files)                  | Stretch       | Unmanageable without automation | Needs base schema + generation |
| Rules in `.claude/rules/` | CRITICAL (105 files, context overload) | BROKEN        | BROKEN                          | Must restructure immediately   |
| Commands                  | Usable but unwieldy                    | Barely usable | Broken (command menu unusable)  | Needs dynamic resolution       |
| Catalogs                  | Manageable                             | Tedious       | Needs automation                | Acceptable with tooling        |
| Agent wiring              | 31% orphan rate                        | Will worsen   | Will worsen                     | Needs policy + automation      |
| Governance                | Manual, already failing                | Unsustainable | Impossible                      | Needs full automation          |

**Bottom Line:** The current architecture works at 90 skills but will not scale to 200. The rules auto-loading mechanism is the most urgent bottleneck -- it is already degrading performance at 105 files. Schema and command patterns need restructuring before the next expansion.

---

## Architecture Health Score: C+

| Dimension            | Score | Weight | Weighted            |
| -------------------- | ----- | ------ | ------------------- |
| Schema Architecture  | C     | 20%    | 0.40                |
| Rules Architecture   | B-    | 25%    | 0.68                |
| Command Architecture | B     | 15%    | 0.45                |
| Integration          | B     | 20%    | 0.60                |
| Scalability          | D     | 20%    | 0.26                |
| **Overall**          |       | 100%   | **2.39 / 4.0 = C+** |

**Rationale:**

- Schemas scored low due to 61% stubs, no base schema, no runtime consumers, and incompatible archetypes
- Rules scored well for Tier A quality but lost points for context overload and thin pointer stubs
- Commands scored well for consistent pattern but lost points for no categorization and naming conflicts
- Integration scored well for catalog completeness but lost points for 31% orphan rate
- Scalability scored poorly because the architecture will break before reaching 200 skills

---

## Appendix: Files Sampled

### Schemas (8 sampled of 90)

- `skill-tdd-output.schema.json` (Tier A -- 102 lines, domain-specific)
- `skill-debugging-output.schema.json` (Tier A -- 140 lines, domain-specific)
- `skill-ripgrep-output.schema.json` (Tier A -- 110 lines, domain-specific)
- `skill-security-architect-output.schema.json` (Tier A -- 227 lines, comprehensive)
- `skill-docker-compose-output.schema.json` (Tier A -- 126 lines, domain-specific)
- `skill-go-expert-output.schema.json` (Tier A -- 74 lines, minimal but typed)
- `skill-swarm-coordination-output.schema.json` (Tier C -- 25 lines, hollow stub)
- `skill-memory-forensics-output.schema.json` (Tier C -- 25 lines, hollow stub)
- `skill-scientific-skills-output.schema.json` (Tier C -- 25 lines, hollow stub)
- `skill-consensus-voting-output.schema.json` (Tier C -- 25 lines, hollow stub)
- `skill-binary-analysis-patterns-output.schema.json` (Tier C -- 25 lines, hollow stub)
- `skill-ai-ml-expert-output.schema.json` (Tier C -- 25 lines, hollow stub)

### Rules (7 sampled of 105)

- `tdd.md` (Tier A -- 126 lines, excellent)
- `go-expert.md` (Tier B -- 62 lines, structured)
- `docker-compose.md` (Tier B -- 58 lines, structured)
- `research-synthesis.md` (Tier B -- 59 lines, structured)
- `memory-forensics.md` (Tier C -- 18 lines, thin pointer)
- `scientific-skills.md` (Tier C -- 18 lines, thin pointer)
- Framework rules: `security.md`, `testing.md`, `code-standards.md` (reference comparison)

### Commands (5 sampled of 97)

- `tdd.md` (pre-existing, has description frontmatter)
- `go-expert.md` (new, thin delegation)
- `docker-compose.md` (new, thin delegation)
- `memory-forensics.md` (new, thin delegation)
- `scientific-skills.md` (new, thin delegation)

### Integration Points Examined

- `creator-commons.cjs` SCHEMA_MAP (validates definitions, not outputs)
- `unified-creator-guard.cjs` SCHEMA_MAP (validates definitions, not outputs)
- Schema catalog (98 entries, 87 DOCS ONLY)
- Runtime grep for `skill-*-output.schema.json` consumers (2 found: repo-rag, diagram-generator)
