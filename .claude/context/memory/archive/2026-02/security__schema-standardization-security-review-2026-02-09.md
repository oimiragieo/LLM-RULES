<!-- Agent: security-architect | Task: #5 | Session: 2026-02-09 -->

# Security Review: Schema Standardization and Rules Cleanup

**Date**: 2026-02-09
**Reviewer**: security-architect agent
**Scope**: Security implications of planned schema standardization across ~299 artifacts (87 schemas, 97 rules, 92 commands)
**Input Documents**:
- `.claude/context/plans/skill-expansion-fix-requirements-2026-02-09.md` (PM requirements)
- `.claude/context/plans/skill-expansion-fix-priorities-2026-02-09.md` (Consolidated fix priorities)
- `.claude/context/reports/architecture/code-review-skill-expansion-artifacts-2026-02-09.md` (Code review)

**Schemas Examined** (10 files spanning all 4 quality tiers):
- Tier 1: `skill-tdd-output.schema.json`, `skill-plan-generator-output.schema.json`
- Tier 2: `skill-frontend-expert-output.schema.json`
- Tier 4 (Hollow Stub): `skill-swarm-coordination-output.schema.json`
- Trail of Bits Security: `skill-differential-review-output.schema.json`, `skill-insecure-defaults-output.schema.json`, `skill-static-analysis-output.schema.json`, `skill-variant-analysis-output.schema.json`, `skill-semgrep-rule-creator-output.schema.json`

---

## Executive Summary

The planned schema standardization effort addresses real security gaps. The most critical finding is that **70/87 schemas (80%) lack `additionalProperties: false`**, creating a systemic mass-assignment-style vulnerability where any JSON passes validation. The proposed fixes are **security-positive** overall. This review identifies 2 HIGH, 3 MEDIUM, and 3 LOW findings, with specific recommendations for each.

**Verdict: CONDITIONAL APPROVAL** -- proceed with implementation, incorporating the security recommendations below.

---

## STRIDE Threat Analysis of Proposed Schema Changes

### S -- Spoofing

| Change | Threat | Assessment |
|--------|--------|------------|
| Add `additionalProperties: false` | Prevents injection of unauthorized properties into validated output | **POSITIVE** -- reduces spoofing of skill output identity |
| Consolidate hollow stubs to default schema | No spoofing impact | NEUTRAL |
| Standardize envelope (status/output) | Prevents confusion between skill output structures | **POSITIVE** -- consistent envelope prevents one skill's output from being interpreted as another's |

**Risk Level**: LOW. Schema changes do not affect authentication or identity systems.

### T -- Tampering

| Change | Threat | Assessment |
|--------|--------|------------|
| Add `additionalProperties: false` | **POSITIVE** -- prevents injection of arbitrary properties that could alter validated data interpretation | HIGH security improvement |
| Delete 55 hollow stub schemas | Removes files that accept arbitrary JSON without constraint | **POSITIVE** -- eliminates 55 paths of unchecked data |
| Standardize `$id` domain | Domain confusion could cause schema resolution to fetch from wrong source | **MEDIUM** -- migration must be atomic |
| Delete stub rules | Reduces available content that could be confused for authoritative guidance | **POSITIVE** |

**Risk Level**: MEDIUM before fix, LOW after fix. The `additionalProperties: false` addition is the single highest-impact security improvement.

### R -- Repudiation

| Change | Threat | Assessment |
|--------|--------|------------|
| Add provenance headers | **POSITIVE** -- improves audit trail for artifact origin | Direct security benefit |
| Schema changes without ADR | Could create undocumented breaking changes | Recommendation: Document all changes in ADR |

**Risk Level**: LOW. Recommendation to add ADR addresses repudiation concerns.

### I -- Information Disclosure

| Change | Threat | Assessment |
|--------|--------|------------|
| Schema `$id` domain change | If `$id` URLs are ever fetched, domain misconfiguration could leak internal schema structure to external DNS | LOW risk -- `$id` is typically used for identification, not fetching |
| Hollow stubs accepting any JSON | Output marked "valid" could contain sensitive data leaking through unchecked properties | **MEDIUM** -- `additionalProperties: false` prevents unexpected data fields |

**Risk Level**: LOW-MEDIUM. The `$id` domain change requires careful handling.

### D -- Denial of Service

| Change | Threat | Assessment |
|--------|--------|------------|
| Consolidate 55 stubs to 1 default schema | Fewer files to validate | **POSITIVE** -- reduces disk I/O and catalog scan time |
| Delete 8 stub rules | Reduces context loading by ~2,100 tokens | **POSITIVE** -- reduces context saturation that degrades agent performance |
| Schema validation with strict constraints | Slightly more processing per validation | NEGLIGIBLE -- JSON Schema validation is sub-millisecond |

**Risk Level**: LOW. Changes are net-positive for performance.

### E -- Elevation of Privilege

| Change | Threat | Assessment |
|--------|--------|------------|
| Missing `additionalProperties: false` | An attacker or misconfigured agent could inject properties like `"isAdmin": true` or `"role": "superuser"` into validated output that passes schema validation | **HIGH** -- this is the primary security concern |
| Hollow stubs | Any JSON passes validation, meaning a compromised skill could output anything and pass all checks | **HIGH** -- stubs provide false assurance |
| Envelope migration | If consumers check for `output` key but schema uses `result`, authorization checks on output structure could be bypassed | **MEDIUM** during migration window |

**Risk Level**: HIGH before fix, LOW after fix.

---

## Security Findings

### Finding SEC-SCHEMA-001: Missing `additionalProperties: false` (HIGH)

**Severity**: HIGH
**OWASP Category**: A04 (Insecure Design), A08 (Software and Data Integrity Failures)
**CWE**: CWE-20 (Improper Input Validation)
**Affected**: 70/87 schemas (80%)

**Description**: 70 of 87 schemas lack `additionalProperties: false` at root and/or output levels. This means any JSON object with the minimum required properties will pass validation, regardless of what additional properties it contains. This is functionally equivalent to a mass assignment vulnerability in API contexts.

**Evidence from examined schemas**:
- `skill-swarm-coordination-output.schema.json`: NO `additionalProperties: false` at any level. Output accepts `{type: "object"}` with zero property constraints.
- `skill-plan-generator-output.schema.json` (210 lines, Tier 1): Missing `additionalProperties: false` at ROOT level despite having detailed output properties. An attacker could add arbitrary root properties.
- `skill-frontend-expert-output.schema.json`: NO `additionalProperties: false` at any level.

**Contrast with secure schemas**:
- All 5 Trail of Bits security schemas have `additionalProperties: false` at EVERY nested level.
- `skill-tdd-output.schema.json` has `additionalProperties: false` at both root and output levels.

**Impact**: Without this constraint, a compromised or misconfigured skill could inject arbitrary properties into its output that would pass validation. Downstream consumers trusting "validated" output could process injected data without additional checks.

**Recommendation**: Add `additionalProperties: false` at root and output levels to ALL 70 affected schemas. Prioritize schemas consumed at runtime over those used only for documentation. This is the single highest-priority security fix.

**Remediation Priority**: IMMEDIATE (Phase 1)

---

### Finding SEC-SCHEMA-002: Hollow Stub Schemas Provide False Validation Assurance (HIGH)

**Severity**: HIGH
**OWASP Category**: A04 (Insecure Design)
**CWE**: CWE-183 (Permissive List of Allowed Inputs)
**Affected**: 55/87 schemas (63%)

**Description**: 55 schemas are byte-for-byte identical hollow stubs that validate only the presence of `status` (enum) and `output` (any object). These schemas accept ANY JSON object as valid output, providing zero actual validation while appearing in catalogs as "schemas exist."

**Evidence**: `skill-swarm-coordination-output.schema.json` (25 lines):
```json
{
  "output": {
    "type": "object",
    "description": "Skill-specific output data"
  }
}
```
This validates nothing. Any `{"status": "success", "output": {"arbitrary": "data"}}` passes.

**Impact**: Creates a false sense of security. Catalog shows "87 schemas" but only 32 provide meaningful validation. Agents or tools relying on "schema-validated output" as a trust signal are trusting unchecked data for 63% of skills.

**Recommendation**: The proposed consolidation to a single `skill-default-output.schema.json` is security-positive because it:
1. Makes the intentional lack of validation EXPLICIT (not hidden as a stub pretending to validate)
2. Allows consumers to distinguish between "validated output" and "generic output"
3. Reduces the 55-file attack surface to 1 well-documented file

**Security Conditions for Consolidation**:
- The default schema MUST include `additionalProperties: false` at root level
- The default schema MUST document in its description that output is intentionally generic
- Consumers MUST NOT treat default-schema-validated output with the same trust level as domain-validated output

**Remediation Priority**: IMMEDIATE (Phase 1)

---

### Finding SEC-SCHEMA-003: Three or More Envelope Structures Complicate Validation (MEDIUM)

**Severity**: MEDIUM
**OWASP Category**: A05 (Security Misconfiguration)
**CWE**: CWE-436 (Interpretation Conflict)
**Affected**: All 87 schemas

**Description**: The input documents identify two envelope structures, but examination of actual schemas reveals at least FOUR variants:

| Structure | Pattern | Count | Example |
|-----------|---------|-------|---------|
| A | `{skillName, version, timestamp, output}` | ~14 | `skill-tdd-output.schema.json` |
| B | `{status, output}` | ~55+ | `skill-swarm-coordination-output.schema.json` |
| C | Flat domain-specific (no wrapper) | 5 | `skill-differential-review-output.schema.json` (Trail of Bits) |
| A-variant | `{skillName, version, timestamp, result}` | ~3 | `skill-frontend-expert-output.schema.json` (uses `result` not `output`) |

The Trail of Bits security schemas (Structure C) use flat structures with `skill_name`, domain fields, and `timestamp` at root level -- no `output` or `status` wrapper. This is a THIRD pattern not captured in the planning documents.

**Impact**: A consumer expecting Structure B (`status`/`output`) that receives Structure C (flat) would fail to find the expected keys. During migration, if some schemas are updated but not others, validation code could silently accept invalid data or reject valid data, depending on which pattern it expects.

**Security Risk During Migration**: The transition period where BOTH old and new envelopes coexist is the highest-risk window. Consumers might:
- Use lenient validation (accept either) -- weakens security
- Use strict validation (accept only new) -- breaks existing consumers
- Have race conditions between schema update and consumer update

**Recommendation**:
1. Document ALL FOUR variants in the ADR (not just two)
2. The 5 Trail of Bits security schemas (Structure C) should be explicitly exempted from envelope migration or migrated with extreme care, since they are the highest-quality schemas
3. Address the `result` vs `output` inconsistency in Structure A-variant
4. Implement migration as atomic operation per schema (not partial updates)
5. Add a compatibility test suite that validates all consumers work with the new envelope before deploying

**Remediation Priority**: Phase 2 (requires careful planning)

---

### Finding SEC-SCHEMA-004: `$id` Domain Change Creates Resolution Risk (MEDIUM)

**Severity**: MEDIUM
**OWASP Category**: A05 (Security Misconfiguration)
**CWE**: CWE-346 (Origin Validation Error)
**Affected**: All 87 schemas with `$id` field

**Description**: Two domains coexist across schemas:
- `https://claude-code.anthropic.com/schemas/...` -- used by pre-existing schemas AND all 5 Trail of Bits security schemas
- `https://agent-studio.dev/schemas/...` -- used by new batch schemas
- `skill-plan-generator-output.schema.json` -- has NO `$id` at all

If JSON Schema `$ref` resolution is ever used (e.g., for schema composition, inheritance, or external validation tools), mixed domains would cause resolution failures or, worse, could be redirected if domain control is not maintained.

**Impact**:
- **Domain ownership**: `agent-studio.dev` must be owned and controlled by the project team. If it is not, an attacker could host malicious schemas at that domain.
- **Resolution ambiguity**: Tools that resolve `$id` could fetch from the wrong domain.
- **Missing `$id`**: `skill-plan-generator-output.schema.json` (a Tier 1 gold-standard schema, 210 lines) has no `$id`, making it unreferenceable.

**Recommendation**:
1. VERIFY ownership of `agent-studio.dev` domain before standardizing to it
2. If domain is not owned, use a controlled namespace (e.g., `urn:agent-studio:schemas:...`)
3. Add `$id` to `skill-plan-generator-output.schema.json` and any others missing it
4. Standardize to a single domain in a single atomic commit
5. Consider using URN-style `$id` instead of URL-style to avoid domain resolution concerns entirely

**Remediation Priority**: Phase 2 (Should-Have S-1)

---

### Finding SEC-SCHEMA-005: Rules Deletion Must Preserve Security-Relevant Guidance (MEDIUM)

**Severity**: MEDIUM
**OWASP Category**: A04 (Insecure Design)
**CWE**: CWE-1059 (Insufficient Technical Documentation)
**Affected**: 15 stub rules files proposed for deletion/enhancement

**Description**: The plan proposes deleting 8 truly-generic stub rules and enhancing 7 domain-specific stubs. The 15 stub rules identified are:

`consensus-voting.md, swarm-coordination.md, scientific-skills.md, git-expert.md, doc-generator.md, readme.md, summarize-changes.md, binary-analysis-patterns.md, memory-forensics.md, protocol-reverse-engineering.md, sequential-thinking.md, diagram-generator.md, test-generator.md, insight-extraction.md, response-rater.md`

**Security-Relevant Rules in the Deletion/Enhancement List**:
- `binary-analysis-patterns.md` -- relates to executable analysis (security domain)
- `memory-forensics.md` -- relates to incident response (security domain)
- `protocol-reverse-engineering.md` -- relates to network security (security domain)

These three are security-adjacent skills. While their current rules files are minimal stubs (18 lines each), the decision to delete vs. enhance them has security implications.

**Impact**: If these rules are deleted rather than enhanced, agents performing binary analysis, memory forensics, or protocol reverse engineering would have zero guidance beyond SKILL.md, potentially leading to:
- Unsafe handling of potentially malicious binary artifacts
- Missed forensic artifacts during incident response
- Incomplete protocol analysis missing security-relevant fields

**Recommendation**:
1. The three security-adjacent rules (`binary-analysis-patterns.md`, `memory-forensics.md`, `protocol-reverse-engineering.md`) MUST be enhanced, NOT deleted
2. Enhancement should include safety guidelines for handling potentially malicious content
3. Other truly generic stubs (e.g., `readme.md`, `summarize-changes.md`, `doc-generator.md`) are safe to delete
4. Document deletion rationale for each file in `decisions.md`

**Remediation Priority**: Phase 3

---

### Finding SEC-SCHEMA-006: Draft-07 vs Draft 2020-12 Mismatch (LOW)

**Severity**: LOW
**OWASP Category**: A05 (Security Misconfiguration)
**CWE**: CWE-1188 (Initialization with an Insecure Default)
**Affected**: All 116 schemas + schema-creator rules

**Description**: All 116 schemas use `http://json-schema.org/draft-07/schema#` in practice, but the `schema-creator.md` rules specify Draft 2020-12. This documentation-reality mismatch means:
- New schemas created following the rules would use Draft 2020-12
- Existing schemas use Draft-07
- Validation libraries configured for one draft may not correctly validate schemas written for the other

**Impact**: LOW. Both drafts support `additionalProperties: false` and the core validation features used here. The primary risk is confusion for schema authors.

**Recommendation**: Adopt Draft-07 as the project standard (matches reality). Update `schema-creator.md` rules to specify Draft-07. Document this decision in ADR.

**Remediation Priority**: Phase 2 (low urgency)

---

### Finding SEC-SCHEMA-007: Trail of Bits Security Schemas Are Exemplary (LOW -- Positive Finding)

**Severity**: LOW (Informational -- POSITIVE)
**Affected**: 5 Trail of Bits security skill schemas

**Description**: All 5 Trail of Bits security schemas demonstrate best-in-class security validation:

| Schema | Lines | `additionalProperties: false` | Domain Properties | CWE/OWASP References |
|--------|-------|-------------------------------|-------------------|---------------------|
| differential-review | 128 | YES (all levels) | P0-P3 priority, verdict enum, findings with CWE | YES |
| insecure-defaults | 122 | YES (all levels) | scan_scope, severity breakdown, config audit | YES |
| static-analysis | 112 | YES (all levels) | tools_used, SARIF path, languages enum | YES |
| variant-analysis | 106 | YES (all levels) | seed vulnerability, confidence/similarity enums | YES |
| semgrep-rule-creator | 96 | YES (all levels) | rules with CWE/OWASP, pattern_type, testing | YES |

These schemas should serve as the REFERENCE STANDARD for all future schema development. They demonstrate:
1. `additionalProperties: false` at every nested object level
2. Meaningful enum constraints (not just string types)
3. Security-relevant metadata (CWE, OWASP references)
4. Appropriate required fields at each level

**Recommendation**:
1. Use these 5 schemas as the template for enhancing other domain schemas
2. During envelope migration, handle these schemas with EXTREME CARE -- they are the highest-value validation assets
3. If migrating to Structure B (`status`/`output`), the rich flat structure of these schemas must not lose validation depth
4. Consider keeping Structure C (flat) for security schemas and documenting it as an accepted variant

**Remediation Priority**: N/A (positive finding, preservation recommendation)

---

### Finding SEC-SCHEMA-008: Missing Provenance Creates Audit Gap (LOW)

**Severity**: LOW
**OWASP Category**: A09 (Security Logging and Monitoring Failures)
**CWE**: CWE-778 (Insufficient Logging)
**Affected**: ~85% of schemas, ~70% of rules

**Description**: Most stub schemas and rules lack provenance headers (`<!-- Agent: {type} | Task: #{id} | Session: {date} -->`). This means:
- Cannot trace which batch/task created which artifacts
- Cannot audit whether artifacts were created by authorized processes
- Cannot determine age or freshness of artifacts

**Impact**: LOW for current operational security, but creates compliance gaps for SOC2 audit trails.

**Recommendation**: Add provenance headers during batch update (Phase 4, Could-Have C-2). This is low priority but should not be skipped entirely.

**Remediation Priority**: Phase 4

---

## Security Recommendations Summary

### IMMEDIATE (Must complete before schema changes ship)

| # | Recommendation | Finding | Priority |
|---|---------------|---------|----------|
| R-1 | Add `additionalProperties: false` to ALL 70 affected schemas at root and output levels | SEC-SCHEMA-001 | P0 |
| R-2 | Ensure the new `skill-default-output.schema.json` includes `additionalProperties: false` | SEC-SCHEMA-002 | P0 |
| R-3 | Do NOT delete security-adjacent rules (`binary-analysis-patterns.md`, `memory-forensics.md`, `protocol-reverse-engineering.md`) -- enhance them instead | SEC-SCHEMA-005 | P0 |

### SHORT-TERM (Within same sprint as schema changes)

| # | Recommendation | Finding | Priority |
|---|---------------|---------|----------|
| R-4 | Document ALL FOUR envelope variants in ADR (not just two) | SEC-SCHEMA-003 | P1 |
| R-5 | Verify ownership of `agent-studio.dev` domain before standardizing `$id` | SEC-SCHEMA-004 | P1 |
| R-6 | Add missing `$id` to `skill-plan-generator-output.schema.json` | SEC-SCHEMA-004 | P1 |
| R-7 | Migrate envelope structures atomically (per-schema, not partial updates) | SEC-SCHEMA-003 | P1 |
| R-8 | Handle Trail of Bits security schemas (Structure C) as explicit variant or migrate with preservation of validation depth | SEC-SCHEMA-003, SEC-SCHEMA-007 | P1 |

### MEDIUM-TERM (Next 2 sprints)

| # | Recommendation | Finding | Priority |
|---|---------------|---------|----------|
| R-9 | Adopt Draft-07 as project standard, update schema-creator rules | SEC-SCHEMA-006 | P2 |
| R-10 | Add provenance headers to all artifacts | SEC-SCHEMA-008 | P2 |
| R-11 | Create CI gate rejecting schemas without `additionalProperties: false` | SEC-SCHEMA-001 | P2 |
| R-12 | Consider URN-style `$id` to avoid domain resolution concerns | SEC-SCHEMA-004 | P2 |

---

## OWASP Top 10 Mapping

| OWASP ID | Category | Relevant Findings | Status |
|----------|----------|-------------------|--------|
| A01 | Broken Access Control | Not directly applicable to schemas | N/A |
| A02 | Cryptographic Failures | Not applicable | N/A |
| A03 | Injection | SEC-SCHEMA-001 (arbitrary property injection via missing additionalProperties) | FOUND |
| A04 | Insecure Design | SEC-SCHEMA-001, SEC-SCHEMA-002, SEC-SCHEMA-005 | FOUND |
| A05 | Security Misconfiguration | SEC-SCHEMA-003, SEC-SCHEMA-004, SEC-SCHEMA-006 | FOUND |
| A06 | Vulnerable Components | Not applicable (no dependency changes) | N/A |
| A07 | Authentication Failures | Not applicable | N/A |
| A08 | Software and Data Integrity | SEC-SCHEMA-001 (unchecked data passes validation) | FOUND |
| A09 | Logging Failures | SEC-SCHEMA-008 (missing provenance/audit trail) | FOUND |
| A10 | SSRF | Not applicable | N/A |

---

## Security Control Verification

| Control ID | Control | Status | Notes |
|------------|---------|--------|-------|
| SEC-001 | Token Whitelist | N/A | Not applicable to schema changes |
| SEC-002 | Path Validation | PASS | All schema files are in `.claude/schemas/` (correct path) |
| SEC-003 | Input Sanitization | PARTIAL | 70/87 schemas lack `additionalProperties: false` |
| SEC-004 | Transparency Markers | PARTIAL | ~85% of schemas lack provenance headers |

---

## Backward Compatibility Assessment

| Change | Breaking Risk | Mitigation |
|--------|--------------|------------|
| Add `additionalProperties: false` | MEDIUM -- any code passing extra properties will fail validation | Run validation against existing outputs before deploying; add properties to schema if needed |
| Delete 55 hollow stubs | LOW -- stubs validate nothing, so removing them changes no behavior | Update catalog references to default schema |
| Standardize envelope | HIGH during migration -- consumers expecting old structure will break | Atomic migration with compatibility testing |
| Change `$id` domain | LOW -- `$id` is not typically used for fetching | Single-commit change |
| Delete stub rules | LOW -- stubs provide no guidance, so deletion has no behavioral impact | Verify no rules are referenced by hardcoded paths |

**Critical Compatibility Note**: Adding `additionalProperties: false` is the change most likely to break existing consumers. If any skill currently outputs properties not defined in its schema, those outputs will become invalid after the change. A validation dry-run against current outputs is STRONGLY RECOMMENDED before deploying.

---

## Verdict

**CONDITIONAL APPROVAL**

The planned schema standardization is security-positive and addresses real vulnerabilities. The `additionalProperties: false` gap (SEC-SCHEMA-001) is the most significant security issue, and its remediation is the highest-value fix in the entire plan.

**Conditions for full approval**:
1. Implement R-1 (additionalProperties fix) before any other schema changes
2. Implement R-3 (preserve security-adjacent rules) during rules cleanup
3. Document all four envelope variants in ADR (R-4) before envelope migration
4. Verify domain ownership (R-5) before $id standardization
5. Run backward compatibility validation before deploying additionalProperties changes

**Proceed with implementation of Phases 1-4 as planned, incorporating the above conditions.**

---

*Security review completed by security-architect agent, 2026-02-09*
