<!-- Agent: researcher | Task: #2 | Session: 2026-02-09 -->

# JSON Schema Standardization Research Report

**Date**: 2026-02-09
**Researcher**: researcher agent
**Task**: Research JSON Schema best practices for standardizing 87 skill output schemas
**Scope**: Draft-07 vs 2020-12 migration, additionalProperties strategy, envelope patterns

## Executive Summary

After examining 116 existing schemas and researching current JSON Schema best practices, recommendations:

1. **Stay on Draft-07** - Migration to 2020-12 = 464 breaking edits, zero functional benefit
2. **Mandatory additionalProperties:false** on all schemas (security P0)
3. **Adopt Structure B (status/output)** as canonical envelope (84% already use it)
4. **Create generic-skill-output-base.schema.json** for 12 stub schemas ($ref pattern, 72% line reduction)
5. **Standardize $id domain** to agent-studio.dev

## Key Findings

### Draft-07 vs 2020-12: Stay on Draft-07

- Breaking changes: items→prefixItems, dependencies→dependentSchemas/dependentRequired, definitions→$defs
- Migration = 116 schemas × 4 changes = 464 edits with zero functional benefit
- None of project schemas use features requiring 2020-12

### additionalProperties:false: MANDATORY (P0 Security)

- ~70/116 schemas accept arbitrary extra properties
- Industry consensus: "Setting additionalProperties:false is a best practice for security"
- Prevents mass assignment vulnerabilities and typo bypass

### Envelope: Adopt Structure B

- Structure A (19 schemas): skillName/version/timestamp/output
- Structure B (97 schemas): status/output
- 84% already use B; simpler; easier for agents

### Hollow Stubs: Create Base Schema

- 12 identical 25-line stubs accept any JSON
- Create generic-skill-output-base.schema.json
- Stubs reference via $ref (300→85 lines, 72% reduction)

Sources: DeepDocs, Ajv, JSON Schema Spec, JSON:API, OpenAI Structured Outputs
Full report: 11KB with risk assessment, implementation roadmap, migration strategies
