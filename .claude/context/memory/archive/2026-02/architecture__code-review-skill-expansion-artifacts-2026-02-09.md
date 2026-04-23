<!-- Agent: code-reviewer | Task: #2 | Session: 2026-02-09 -->

# Code Review: Skill Expansion Artifacts

**Date**: 2026-02-09
**Reviewer**: code-reviewer agent
**Scope**: ~299 new files (116 schemas, 100 rules, 95 commands, 5 skill dirs, catalogs)
**Prior Reviews**: Architecture C+ (61% hollow stubs), Security B (70/89 schemas lack additionalProperties:false)

---

## Stage 1: Spec Compliance

**Requirements Met:** Partial

**Reference Spec**: Skill expansion batch creation (Batches 3-4, framework modernization)

**Deviations:**

1. **Schema quality inconsistency**: Schema-creator rules mandate Draft 2020-12, but all 116 schemas use Draft-07. The schema-creator post-creation checklist requires properties with descriptions and unique dollar-id values, yet 12 schemas are hollow stubs with zero domain properties.

2. **Two incompatible root envelopes**: Pre-existing schemas (tdd, debugging, plan-generator, code-analyzer) use a rich envelope (skillName, version, timestamp, output with additionalProperties:false). New batch schemas use a minimal envelope (status enum + output object). No ADR documents this divergence.

3. **Stub rules pattern**: 15 rules files are 18-line stubs with only name, one-line description, usage snippet, and reference link -- providing zero actionable guidance. The skill-creator checklist requires rules with integration points and best practices.

**Verdict**: Stage 1 passes with conditions. The deviations are structural debt, not functional blockers. Proceeding to Stage 2.

---

## Stage 2: Code Quality

### Strengths

**S1. Command Pattern Compliance (100%)**
All 95 commands follow the identical thin-delegation pattern:

- YAML frontmatter with disable-model-invocation: true
- Single instruction line: Invoke the {skill-name} skill and follow it exactly as presented to you
- Zero deviation across all 95 files. This is exemplary consistency.

**S2. Trail of Bits Security Skills (Exceptional Quality)**
Five new security skills sourced from Trail of Bits (CC-BY-SA-4.0):

- differential-review: File priority classification (P0-P3), verdict criteria, OWASP references
- insecure-defaults: Credential detection, fail-open prevention, crypto defaults
- semgrep-rule-creator: Pattern writing, taint mode, testing standards, OWASP coverage
- static-analysis: CodeQL/Semgrep best practices, SARIF output, CI/CD integration
- variant-analysis: Seed vulnerability analysis, pattern generalization, cross-repo scanning

These are the highest-quality additions in the entire expansion. Each has both a rich SKILL.md and a comprehensive rules file.

**S3. Tier-1 Schemas Are Gold Standard**
Several schemas demonstrate excellent validation design:

- skill-tdd-output.schema.json (102 lines): redGreenRefactorCycle with phase enums, coverage with min/max constraints, additionalProperties:false at both root and output levels
- skill-plan-generator-output.schema.json (210 lines): maxItems:7 enforcement matching the Iron Law, regex patterns for task IDs
- skill-debugging-output.schema.json (141 lines): investigation model with evidence type system, phase enums
- skill-code-analyzer-output.schema.json (136 lines): LOC breakdown, complexity hotspots with file/function/line references

**S4. Domain-Expert Rules Quality**
Many rules files provide genuinely actionable guidance:

- tdd.md: Iron Laws, Red-Green-Refactor cycle, common rationalizations table, pre-completion gates
- debugging.md: Four-phase methodology, human partner signals, red flags
- security-architect.md: STRIDE table, OWASP Top 10 with specific checks, severity SLA table
- auth-security-expert.md: OAuth 2.1 requirements table, JWT security table, 4 Iron Laws, token rotation strategy
- plan-generator.md: Anti-pattern table, quality checklist, Iron Laws with specific constraints

**S5. Catalog Updates**
skill-catalog.md updated with all 100 skills across 19 categories. Commands catalog present. Schema catalog present.

### Issues

#### Critical (Must Fix)

None. No security vulnerabilities, data loss risks, or broken functionality detected.

#### Important (Should Fix)

**I-1. Hollow Stub Schemas (12 files)**
Files: skill-swarm-coordination-output.schema.json, skill-consensus-voting-output.schema.json, skill-binary-analysis-patterns-output.schema.json, skill-memory-forensics-output.schema.json, skill-protocol-reverse-engineering-output.schema.json, skill-ai-ml-expert-output.schema.json, skill-scientific-skills-output.schema.json, skill-writing-skills-output.schema.json, skill-git-expert-output.schema.json, skill-doc-generator-output.schema.json, skill-readme-output.schema.json, skill-summarize-changes-output.schema.json

Pattern: Each is 25 lines with only status enum + output:{type:object} accepting any JSON.

Why it matters: These schemas validate nothing. Any JSON object passes validation. They exist only to satisfy the companion-check requirement that every skill has a schema, creating a false sense of completeness.

Fix: Either (a) add domain-specific properties to each schema, or (b) create a shared generic-skill-output.schema.json referenced by all stubs, making the intentional genericity explicit rather than appearing like incomplete work.

**I-2. Missing additionalProperties:false (~70 schemas)**
Only ~30 of 116 schemas include additionalProperties:false. The remaining ~86 accept arbitrary extra properties without validation.

Why it matters: Without additionalProperties:false, typos in property names silently pass validation (e.g., stauts instead of status would be accepted). This undermines the purpose of schema validation. The security-focused schemas (differential-review, insecure-defaults, static-analysis, variant-analysis, semgrep-rule-creator) correctly include this constraint, proving it is feasible.

Fix: Add additionalProperties:false to all schemas at both root and output levels. Priority: schemas that are actually validated at runtime.

**I-3. Dollar-id Domain Inconsistency**
Pre-existing schemas use domain: claude-code.anthropic.com
New schemas use domain: agent-studio.dev
Some schemas have inconsistent dollar-id suffixes (missing .schema in path).

Why it matters: If schemas are ever resolved via dollar-id (JSON Schema dollar-ref resolution), mixed domains will cause resolution failures. This is a latent bug.

Fix: Standardize all dollar-id values to a single domain (agent-studio.dev recommended). Add .schema.json suffix consistently.

**I-4. Two Incompatible Root Envelope Structures**
Structure A (pre-existing, ~19 schemas): { skillName, version, timestamp, output, metadata? }
Structure B (new batch, ~97 schemas): { status, output }

Why it matters: Consumers cannot write generic schema validation logic -- they must know which envelope a given skill uses. This bifurcation will grow worse as more schemas are added.

Fix: Create an ADR documenting the canonical envelope structure. Migrate all schemas to a single standard (recommend Structure B with additionalProperties:false, as it is simpler and more widely used). Add a migration script for Structure A schemas.

**I-5. Stub Rules Files (15 files)**
Files: consensus-voting.md, swarm-coordination.md, scientific-skills.md, git-expert.md, doc-generator.md, readme.md, summarize-changes.md, binary-analysis-patterns.md, memory-forensics.md, protocol-reverse-engineering.md, sequential-thinking.md, diagram-generator.md, test-generator.md, insight-extraction.md, response-rater.md

Pattern: Each is an 18-line template with only name, description, usage, and reference link. No anti-patterns, no integration points, no best practices.

Why it matters: Rules files exist to provide actionable guidance when agents load them as context. An 18-line stub consumes context budget while providing zero value. Agents loading these rules learn nothing.

Fix: For skills that genuinely have no domain-specific rules (e.g., summarize-changes), delete the stub rules file -- the SKILL.md already serves as documentation. For skills that should have rules (e.g., consensus-voting, diagram-generator), add actual content.

#### Minor (Nice to Have)

**M-1. Schema Draft Version Mismatch**
All 116 schemas use http://json-schema.org/draft-07/schema# but schema-creator.md rules specify Draft 2020-12.

Why it matters: Draft-07 and 2020-12 have different keyword support (e.g., prefixItems vs items array form). Inconsistency between documented standard and practice.

Fix: Either update schema-creator rules to document draft-07 as the project standard, or migrate schemas to 2020-12.

**M-2. Command Description Frontmatter Inconsistency**
Only 12 of 95 commands include a description: field in frontmatter. The remaining 83 have only disable-model-invocation: true.

Why it matters: The description field could enable better command discovery and documentation generation. Its inconsistent presence suggests it was added to early commands but not propagated.

Fix: Either add description: to all commands, or remove it from the 12 that have it, to achieve consistency.

**M-3. Provenance Headers Missing from Stub Files**
Workspace conventions require provenance headers (Agent: type | Task: #id | Session: date) on all agent-generated files. Most stub schemas and rules lack these headers.

Why it matters: Cannot trace which batch/task created which artifacts. Complicates audit.

Fix: Add provenance headers during next batch update.

**M-4. Security Skills Missing Companion Schemas**
The 5 Trail of Bits security skills have excellent SKILL.md and rules files, but their schemas (while present) use the minimal status/output envelope. Given the richness of their rules, they deserve schemas on par with tdd or plan-generator schemas.

Why it matters: These are the highest-value skills in the expansion. Their schema quality should match their rules quality to enable proper output validation.

Fix: Enhance the 5 security skill schemas with domain-specific properties extracted from their SKILL.md structure.

---

## Consistency Matrix

| Attribute                      | Schemas (116)                                | Rules (100)         | Commands (95)   |
| ------------------------------ | -------------------------------------------- | ------------------- | --------------- |
| Naming convention (kebab-case) | PASS                                         | PASS                | PASS            |
| File placement (correct dir)   | PASS                                         | PASS                | PASS            |
| Structural template followed   | PASS (2 templates)                           | PARTIAL (15 stubs)  | PASS (100%)     |
| Cross-references accurate      | PASS                                         | PASS                | PASS            |
| Provenance headers             | FAIL (~85% missing)                          | FAIL (~70% missing) | N/A (too small) |
| Domain consistency (dollar-id) | FAIL (mixed domains)                         | N/A                 | N/A             |
| Draft version consistency      | PARTIAL (all draft-07 but rules say 2020-12) | N/A                 | N/A             |
| additionalProperties:false     | FAIL (~70 missing)                           | N/A                 | N/A             |
| SKILL.md path references       | PASS                                         | PASS                | PASS            |
| Catalog registration           | PASS                                         | N/A (no catalog)    | PASS            |

---

## Tier Classification

| Tier                 | Description                                                        | Count                  | Examples                                                               |
| -------------------- | ------------------------------------------------------------------ | ---------------------- | ---------------------------------------------------------------------- |
| Tier 1 (Exemplary)   | Rich domain validation, additionalProperties:false, constraints    | ~19 schemas, ~25 rules | tdd, debugging, plan-generator, code-analyzer, security-architect      |
| Tier 2 (Adequate)    | Domain properties but no additionalProperties:false or constraints | ~50 schemas, ~60 rules | gamedev-expert, checklist-generator, frontend-expert, react-expert     |
| Tier 3 (Minimal)     | Basic structure, few domain properties                             | ~35 schemas            | architecture-review (schema only), complexity-assessment (schema only) |
| Tier 4 (Hollow Stub) | Accept any JSON / provide no guidance                              | ~12 schemas, ~15 rules | swarm-coordination, consensus-voting, binary-analysis-patterns         |

---

## Recommendations

### P1 (Immediate - Before Next Batch)

1. **Create ADR for canonical schema envelope**: Document whether Structure A or B is standard. Recommend Structure B (status/output) with mandatory additionalProperties:false.

2. **Add additionalProperties:false to all schemas**: Start with schemas that are validated at runtime. Use the security schemas as the reference pattern.

3. **Delete or enhance stub rules**: Rules that provide zero guidance waste agent context. Either add real content or remove the file.

### P2 (Short-Term - Next Sprint)

4. **Standardize dollar-id domain**: Pick agent-studio.dev, update all schemas.

5. **Enhance security skill schemas**: The 5 Trail of Bits skills deserve Tier-1 schemas matching their SKILL.md quality.

6. **Create shared base schema**: A common envelope schema that all skill outputs extend via allOf/dollar-ref.

### P3 (Medium-Term)

7. **Automated schema quality gate**: Add a CI check that rejects schemas without additionalProperties:false or with the hollow stub pattern.

8. **Rules quality audit tool**: Create a tool that flags rules files under 30 lines as potential stubs needing review.

9. **Schema migration to Draft 2020-12**: If the project wants to use modern JSON Schema features, migrate all schemas and update tooling.

---

## BACKWARD_PROPAGATION

**Pattern**: 12 identical hollow stub schemas following the exact same 25-line template with zero domain-specific validation.

**Proposed Artifact**: schema:generic-skill-output-base
**Affected Files**: [skill-swarm-coordination-output.schema.json, skill-consensus-voting-output.schema.json, skill-binary-analysis-patterns-output.schema.json, skill-memory-forensics-output.schema.json, skill-protocol-reverse-engineering-output.schema.json, skill-ai-ml-expert-output.schema.json, skill-scientific-skills-output.schema.json, skill-writing-skills-output.schema.json, skill-git-expert-output.schema.json, skill-doc-generator-output.schema.json, skill-readme-output.schema.json, skill-summarize-changes-output.schema.json]
**Rationale**: Rather than 12 copies of an identical template, create a single base schema that these skills explicitly reference. This makes the intentionally generic status explicit rather than appearing as incomplete work. When a skill later needs domain-specific validation, it overrides the base.
**Priority**: P1 (12 instances)

---

## Stage 3: Integration Verification

### Catalog Registration

- [x] All 116 schemas appear in schema-catalog.md
- [x] All 100 skills appear in skill-catalog.md
- [x] All 95 commands appear in command-catalog.md
- [x] SKILL.md path references are accurate in rules and commands

### Orphan Check

- [ ] 12 hollow stub schemas are registered but provide no validation value (functional orphans)
- [ ] 15 stub rules are registered but provide no guidance value (functional orphans)

### Broken Edge Check

- [x] No broken references detected (all SKILL.md paths resolve)
- [x] No deleted/renamed artifacts referenced

---

## Assessment

**Ready to merge?** Yes, with conditions.

**Conditions:**

1. (P1) Create ADR documenting canonical schema envelope structure
2. (P1) Add additionalProperties:false to at least the ~50 Tier-2 schemas
3. (P1) Delete or enhance the 15 stub rules files

**Reasoning:** The expansion successfully delivers 100 skills, 100 rules, 95 commands, and 116 schemas with correct naming, placement, catalog registration, and cross-references. Commands are 100% compliant. The 5 security skills are exceptional additions. However, 12 hollow stub schemas and 15 stub rules files represent structural debt that undermines validation quality. The missing additionalProperties:false on ~70 schemas is a systemic gap that should be addressed before the next batch expansion.

**Overall Grade: B-**

Improvement from prior review: The previous architecture review rated C+ (61% hollow stubs). With the security skill additions and catalog updates, quality has improved. The hollow stub count has been reduced from 61% to ~10% of schemas. The remaining debt is primarily additionalProperties:false coverage and the 15 stub rules files.
