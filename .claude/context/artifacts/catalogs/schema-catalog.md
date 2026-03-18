<!-- Agent: developer | Task: #7 | Session: 2026-02-09 -->

# Schema Catalog

**Last Updated:** 2026-02-26
**Total Active Schemas:** 297
**Archived Schemas:** 37 (see `.claude/schemas/_archive/README.md` + 12 hollow stubs deleted in Phase 1)

This catalog documents all active JSON schemas in the agent-studio framework with their wiring status, consumers, and validation categories.

**Phase 2 Standardization Complete (2026-02-09):**

- All 103 schemas use JSON Schema Draft-07 (`$schema: http://json-schema.org/draft-07/schema#`)
- All 78 skill schemas use canonical `$id: https://agent-studio.dev/schemas/{filename}`
- All schemas have `additionalProperties: false` for security (SEC-SCHEMA-001)
- 12 hollow stub schemas deleted (swarm-coordination, consensus-voting, binary-analysis-patterns, memory-forensics, protocol-reverse-engineering, ai-ml-expert, scientific-skills, writing-skills, git-expert, doc-generator, readme, summarize-changes)

---

## Wiring Status Summary

| Status           | Count | Description                                   |
| ---------------- | ----- | --------------------------------------------- |
| **WIRED (Ajv)**  | 8     | Actively validated via Ajv at runtime         |
| **SOFT-WIRED**   | 3     | Path referenced in code, validation optional  |
| **DOCS ONLY**    | 286   | Referenced in documentation or templates only |
| **Total Active** | 297   | All schemas in `.claude/schemas/`             |

## Schema Categories

| Category     | Count | Pattern                      |
| ------------ | ----- | ---------------------------- |
| **Agent**    | 5     | `agent-*.schema.json`        |
| **Skill**    | 254   | `skill-*-output.schema.json` |
| **Hook**     | 1     | `hook-*.schema.json`         |
| **Workflow** | 2     | `workflow-*.schema.json`     |
| **Other**    | 35    | Various                      |

---

## 1. Agent Schemas (4 schemas)

### agent-capability-card.schema.json

| Field             | Value                                                |
| ----------------- | ---------------------------------------------------- |
| **Path**          | `.claude/schemas/agent-capability-card.schema.json`  |
| **Category**      | Agent                                                |
| **Wiring Status** | WIRED (Ajv)                                          |
| **Consumer**      | `.claude/scripts/generate-agent-registry.cjs`        |
| **Validation**    | Advisory (validates agent capability card structure) |
| **$schema**       | http://json-schema.org/draft-07/schema#              |

**Purpose:** Validates agent capability card structure used by agent registry generator.

---

### agent-config.schema.json

| Field             | Value                                        |
| ----------------- | -------------------------------------------- |
| **Path**          | `.claude/schemas/agent-config.schema.json`   |
| **Category**      | Agent                                        |
| **Wiring Status** | WIRED (Ajv)                                  |
| **Consumer**      | `.claude/lib/agents/agent-config.cjs`        |
| **Validation**    | Advisory via `validateConfig()`              |
| **$schema**       | https://json-schema.org/draft/2020-12/schema |

**Purpose:** Validates agent configuration (tools, thinking defaults, phase assignments, model selection).

---

### agent-definition.schema.json

| Field             | Value                                          |
| ----------------- | ---------------------------------------------- |
| **Path**          | `.claude/schemas/agent-definition.schema.json` |
| **Category**      | Agent                                          |
| **Wiring Status** | WIRED (Ajv)                                    |
| **Consumer**      | `.claude/lib/agents/agent-parser.cjs`          |
| **Validation**    | Advisory via `validateDefinition()`            |
| **$schema**       | https://json-schema.org/draft/2020-12/schema   |

**Purpose:** Validates agent definition markdown frontmatter (name, description, capabilities, tools).

---

### agent-identity.schema.json

| Field             | Value                                        |
| ----------------- | -------------------------------------------- |
| **Path**          | `.claude/schemas/agent-identity.schema.json` |
| **Category**      | Agent                                        |
| **Wiring Status** | WIRED (Ajv)                                  |
| **Consumer**      | `.claude/lib/agents/agent-parser.cjs`        |
| **Validation**    | Ajv validated (pre-existing integration)     |
| **$schema**       | http://json-schema.org/draft-07/schema#      |

**Purpose:** Validates agent identity fields (personality, tone, behavior patterns) for agents with identity frontmatter.

**Note:** Renamed from `agent-identity.json` to `agent-identity.schema.json` in Phase 2 for naming consistency.

---

---

## 2. Skill Schemas (99 schemas)

### skill-definition.schema.json

| Field             | Value                                            |
| ----------------- | ------------------------------------------------ |
| **Path**          | `.claude/schemas/skill-definition.schema.json`   |
| **Category**      | Skill                                            |
| **Wiring Status** | WIRED (schema-creator, rule-creator, validators) |
| **Consumer**      | validators, proactive-audit, schema-creator      |
| **Validation**    | Advisory — validates SKILL.md YAML frontmatter   |
| **$schema**       | http://json-schema.org/draft-07/schema#          |

**Purpose:** Validates SKILL.md YAML frontmatter fields (name, description, version, model, tools, verified, lastVerifiedAt, etc.).

---

### skill-output.schema.json

| Field             | Value                                                                        |
| ----------------- | ---------------------------------------------------------------------------- |
| **Path**          | `.claude/schemas/skill-output.schema.json`                                   |
| **Category**      | Skill                                                                        |
| **Wiring Status** | WIRED (Ajv)                                                                  |
| **Consumer**      | `.claude/skills/skill-creator/scripts/create-actions.cjs`, creator-commons   |
| **Validation**    | Advisory via `validateSkill()` — validates creator output `{status, output}` |
| **$schema**       | http://json-schema.org/draft-07/schema#                                      |

**Purpose:** Validates the skill creator output envelope `{status, output: {name, description, ...}}` returned by skill-creator.

---

### skill-diagram-generator-output.schema.json

| Field             | Value                                                                  |
| ----------------- | ---------------------------------------------------------------------- |
| **Path**          | `.claude/schemas/skill-diagram-generator-output.schema.json`           |
| **Category**      | Skill                                                                  |
| **Wiring Status** | SOFT-WIRED                                                             |
| **Consumer**      | `.claude/skills/diagram-generator/scripts/generate.mjs` (path defined) |
| **Validation**    | Optional/skipped                                                       |
| **$schema**       | http://json-schema.org/draft-07/schema#                                |

**Purpose:** Defines output structure for skill diagram generator (Mermaid diagrams).

---

### skill-repo-rag-output.schema.json

| Field             | Value                                                       |
| ----------------- | ----------------------------------------------------------- |
| **Path**          | `.claude/schemas/skill-repo-rag-output.schema.json`         |
| **Category**      | Skill                                                       |
| **Wiring Status** | SOFT-WIRED                                                  |
| **Consumer**      | `.claude/skills/repo-rag/scripts/search.mjs` (path defined) |
| **Validation**    | Optional/skipped                                            |
| **$schema**       | http://json-schema.org/draft-07/schema#                     |

**Purpose:** Defines RAG search result structure for repository knowledge retrieval.

---

### skill-test-generator-output.schema.json

| Field             | Value                                                               |
| ----------------- | ------------------------------------------------------------------- |
| **Path**          | `.claude/schemas/skill-test-generator-output.schema.json`           |
| **Category**      | Skill                                                               |
| **Wiring Status** | SOFT-WIRED                                                          |
| **Consumer**      | `.cursor/skills/test-generator/scripts/generate.mjs` (path defined) |
| **Validation**    | Optional/skipped                                                    |
| **$schema**       | http://json-schema.org/draft-07/schema#                             |

**Purpose:** Defines test generation output structure.

**Note:** Consumer is in `.cursor/` directory, not `.claude/`.

---

### Skill Output Schemas (95 schemas)

All skill output schemas follow the pattern: `skill-{name}-output.schema.json`

| Schema Name                                                 | Skill                              | Category      |
| ----------------------------------------------------------- | ---------------------------------- | ------------- |
| skill-agent-creator-output.schema.json                      | agent-creator                      | Creator       |
| skill-android-expert-output.schema.json                     | android-expert                     | Mobile        |
| skill-api-development-expert-output.schema.json             | api-development-expert             | Development   |
| skill-architecture-review-output.schema.json                | architecture-review                | Architecture  |
| skill-artifact-integrator-output.schema.json                | artifact-integrator                | Creator       |
| skill-auth-security-expert-output.schema.json               | auth-security-expert               | Security      |
| skill-best-practices-guidelines-output.schema.json          | best-practices-guidelines          | Development   |
| skill-checklist-generator-output.schema.json                | checklist-generator                | Validation    |
| skill-code-analyzer-output.schema.json                      | code-analyzer                      | Development   |
| skill-code-quality-expert-output.schema.json                | code-quality-expert                | Development   |
| skill-code-semantic-search-output.schema.json               | code-semantic-search               | Search        |
| skill-code-structural-search-output.schema.json             | code-structural-search             | Search        |
| skill-code-style-validator-output.schema.json               | code-style-validator               | Development   |
| skill-complexity-assessment-output.schema.json              | complexity-assessment              | Planning      |
| skill-container-expert-output.schema.json                   | container-expert                   | DevOps        |
| skill-context-driven-development-output.schema.json         | context-driven-development         | Context       |
| skill-data-expert-output.schema.json                        | data-expert                        | Data          |
| skill-database-expert-output.schema.json                    | database-expert                    | Data          |
| skill-debugging-output.schema.json                          | debugging                          | Development   |
| skill-differential-review-output.schema.json                | differential-review                | Security      |
| skill-docker-compose-output.schema.json                     | docker-compose                     | DevOps        |
| skill-dry-principle-output.schema.json                      | dry-principle                      | Development   |
| skill-expo-framework-rule-output.schema.json                | expo-framework-rule                | Mobile        |
| skill-frontend-expert-output.schema.json                    | frontend-expert                    | Frontend      |
| skill-gamedev-expert-output.schema.json                     | gamedev-expert                     | Gaming        |
| skill-go-expert-output.schema.json                          | go-expert                          | Languages     |
| skill-graphql-expert-output.schema.json                     | graphql-expert                     | Frameworks    |
| skill-hook-creator-output.schema.json                       | hook-creator                       | Creator       |
| skill-incident-runbook-templates-output.schema.json         | incident-runbook-templates         | DevOps        |
| skill-insecure-defaults-output.schema.json                  | insecure-defaults                  | Security      |
| skill-insight-extraction-output.schema.json                 | insight-extraction                 | Context       |
| skill-interactive-requirements-gathering-output.schema.json | interactive-requirements-gathering | Planning      |
| skill-ios-expert-output.schema.json                         | ios-expert                         | Mobile        |
| skill-java-expert-output.schema.json                        | java-expert                        | Languages     |
| skill-k8s-manifest-generator-output.schema.json             | k8s-manifest-generator             | DevOps        |
| skill-mobile-first-design-rules-output.schema.json          | mobile-first-design-rules          | Mobile        |
| skill-nextjs-expert-output.schema.json                      | nextjs-expert                      | Frameworks    |
| skill-nodejs-expert-output.schema.json                      | nodejs-expert                      | Languages     |
| skill-php-expert-output.schema.json                         | php-expert                         | Languages     |
| skill-plan-generator-output.schema.json                     | plan-generator                     | Planning      |
| skill-planning-with-files-output.schema.json                | planning-with-files                | Planning      |
| skill-postmortem-writing-output.schema.json                 | postmortem-writing                 | DevOps        |
| skill-prd-generator-output.schema.json                      | prd-generator                      | Planning      |
| skill-project-onboarding-output.schema.json                 | project-onboarding                 | Integration   |
| skill-python-backend-expert-output.schema.json              | python-backend-expert              | Languages     |
| skill-react-expert-output.schema.json                       | react-expert                       | Frameworks    |
| skill-response-rater-output.schema.json                     | response-rater                     | Validation    |
| skill-ripgrep-output.schema.json                            | ripgrep                            | Search        |
| skill-schema-creator-output.schema.json                     | schema-creator                     | Creator       |
| skill-security-architect-output.schema.json                 | security-architect                 | Security      |
| skill-semgrep-rule-creator-output.schema.json               | semgrep-rule-creator               | Security      |
| skill-sentry-monitoring-output.schema.json                  | sentry-monitoring                  | DevOps        |
| skill-session-handoff-output.schema.json                    | session-handoff                    | Context       |
| skill-skill-creator-output.schema.json                      | skill-creator                      | Creator       |
| skill-spec-gathering-output.schema.json                     | spec-gathering                     | Planning      |
| skill-spec-init-output.schema.json                          | spec-init                          | Planning      |
| skill-static-analysis-output.schema.json                    | static-analysis                    | Security      |
| skill-svelte-expert-output.schema.json                      | svelte-expert                      | Frameworks    |
| skill-tauri-native-api-integration-output.schema.json       | tauri-native-api-integration       | Mobile        |
| skill-tdd-output.schema.json                                | tdd                                | Development   |
| skill-template-creator-output.schema.json                   | template-creator                   | Creator       |
| skill-terraform-infra-output.schema.json                    | terraform-infra                    | DevOps        |
| skill-text-to-sql-output.schema.json                        | text-to-sql                        | Data          |
| skill-thinking-tools-output.schema.json                     | thinking-tools                     | Patterns      |
| skill-typescript-expert-output.schema.json                  | typescript-expert                  | Languages     |
| skill-variant-analysis-output.schema.json                   | variant-analysis                   | Security      |
| skill-verification-before-completion-output.schema.json     | verification-before-completion     | Validation    |
| skill-web3-expert-output.schema.json                        | web3-expert                        | Languages     |
| skill-workflow-creator-output.schema.json                   | workflow-creator                   | Creator       |
| skill-accessibility-output.schema.json                      | accessibility                      | Frontend      |
| skill-advanced-elicitation-output.schema.json               | advanced-elicitation               | Patterns      |
| skill-ai-ml-expert-output.schema.json                       | ai-ml-expert                       | Specialist    |
| skill-binary-analysis-patterns-output.schema.json           | binary-analysis-patterns           | Security      |
| skill-consensus-voting-output.schema.json                   | consensus-voting                   | Patterns      |
| skill-context-compressor-output.schema.json                 | context-compressor                 | Context       |
| skill-database-architect-output.schema.json                 | database-architect                 | Data          |
| skill-doc-generator-output.schema.json                      | doc-generator                      | Documentation |
| skill-git-expert-output.schema.json                         | git-expert                         | Development   |
| skill-memory-forensics-output.schema.json                   | memory-forensics                   | Security      |
| skill-on-call-handoff-patterns-output.schema.json           | on-call-handoff-patterns           | DevOps        |
| skill-protocol-reverse-engineering-output.schema.json       | protocol-reverse-engineering       | Security      |
| skill-readme-output.schema.json                             | readme                             | Documentation |
| skill-research-synthesis-output.schema.json                 | research-synthesis                 | Research      |
| skill-scientific-skills-output.schema.json                  | scientific-skills                  | Research      |
| skill-sequential-thinking-output.schema.json                | sequential-thinking                | Patterns      |
| skill-sparc-methodology-output.schema.json                  | sparc-methodology                  | Patterns      |
| skill-summarize-changes-output.schema.json                  | summarize-changes                  | Development   |
| skill-swarm-coordination-output.schema.json                 | swarm-coordination                 | Patterns      |
| skill-task-management-protocol-output.schema.json           | task-management-protocol           | Patterns      |
| skill-context-compressor.json                  | context-compressor    | Context       |
| skill-track-management-output.schema.json                   | track-management                   | Development   |
| skill-workflow-patterns-output.schema.json                  | workflow-patterns                  | Patterns      |
| skill-writing-skills-output.schema.json                     | writing-skills                     | Documentation |

**Wiring Status:** DOCS ONLY (all skill output schemas are templates)
**$schema:** http://json-schema.org/draft-07/schema#
**Purpose:** Validate structured outputs from skill invocations

---

## 3. Artifact Definition Schemas (3 schemas)

### command-definition.schema.json

| Field             | Value                                                   |
| ----------------- | ------------------------------------------------------- |
| **Path**          | `.claude/schemas/command-definition.schema.json`        |
| **Category**      | Command                                                 |
| **Wiring Status** | WIRED (creator-commons, unified-creator-guard)          |
| **Consumer**      | command-creator, creator-commons, unified-creator-guard |
| **Validation**    | Advisory — validates command .md frontmatter            |
| **$schema**       | http://json-schema.org/draft-07/schema#                 |

**Purpose:** Validates slash command file YAML frontmatter (description, disable-model-invocation, skill, args, category).

---

### rule-definition.schema.json

| Field             | Value                                                |
| ----------------- | ---------------------------------------------------- |
| **Path**          | `.claude/schemas/rule-definition.schema.json`        |
| **Category**      | Rule                                                 |
| **Wiring Status** | WIRED (creator-commons, unified-creator-guard)       |
| **Consumer**      | rule-creator, creator-commons, unified-creator-guard |
| **Validation**    | Advisory — validates rule metadata                   |
| **$schema**       | http://json-schema.org/draft-07/schema#              |

**Purpose:** Validates rule file metadata (name, description, category, scope, enforcement, related_hooks).

---

### template-definition.schema.json

| Field             | Value                                                    |
| ----------------- | -------------------------------------------------------- |
| **Path**          | `.claude/schemas/template-definition.schema.json`        |
| **Category**      | Template                                                 |
| **Wiring Status** | WIRED (creator-commons, unified-creator-guard)           |
| **Consumer**      | template-creator, creator-commons, unified-creator-guard |
| **Validation**    | Advisory — validates template metadata and placeholders  |
| **$schema**       | http://json-schema.org/draft-07/schema#                  |

**Purpose:** Validates template file metadata (name, description, category, placeholders, output_type, consumer).

---

## 4. Workflow & Hook Schemas (2 schemas)

### workflow-definition.schema.json

| Field             | Value                                             |
| ----------------- | ------------------------------------------------- |
| **Path**          | `.claude/schemas/workflow-definition.schema.json` |
| **Category**      | Workflow                                          |
| **Wiring Status** | DOCS ONLY                                         |
| **Consumer**      | None (no workflow-creator scripts exist)          |
| **Validation**    | Not validated at runtime                          |
| **$schema**       | https://json-schema.org/draft/2020-12/schema      |

**Purpose:** Defines workflow markdown structure for workflow-creator (not yet implemented).

**Note:** Attempted wiring in Task #89 but no integration point found (no workflow-creator scripts).

---

### hook-definition.schema.json

| Field             | Value                                         |
| ----------------- | --------------------------------------------- |
| **Path**          | `.claude/schemas/hook-definition.schema.json` |
| **Category**      | Hook                                          |
| **Wiring Status** | DOCS ONLY                                     |
| **Consumer**      | None (no hook-creator scripts exist)          |
| **Validation**    | Not validated at runtime                      |
| **$schema**       | https://json-schema.org/draft/2020-12/schema  |

**Purpose:** Defines hook script structure for hook-creator (not yet implemented).

**Note:** Attempted wiring in Task #89 but no integration point found (no hook-creator scripts).

---

## 4. Evolution & Project Schemas (2 schemas)

### evolution-state.schema.json

| Field             | Value                                         |
| ----------------- | --------------------------------------------- |
| **Path**          | `.claude/schemas/evolution-state.schema.json` |
| **Category**      | Evolution                                     |
| **Wiring Status** | WIRED (Ajv)                                   |
| **Consumer**      | `.claude/lib/self-healing/validator.cjs`      |
| **Validation**    | Advisory via `validateStateWithSchema()`      |
| **$schema**       | https://json-schema.org/draft/2020-12/schema  |

**Purpose:** Validates evolution workflow state machine structure (EVOLVE phases).

---

### track-metadata.schema.json

| Field             | Value                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| **Path**          | `.claude/schemas/track-metadata.schema.json`                              |
| **Category**      | Project                                                                   |
| **Wiring Status** | DOCS ONLY                                                                 |
| **Consumer**      | `.claude/lib/conductor/conductor-gap-analyzer.cjs` (existence check only) |
| **Validation**    | Not validated at runtime                                                  |
| **$schema**       | http://json-schema.org/draft-07/schema#                                   |

**Purpose:** Defines track metadata structure for conductor workflow (path check only, not validated).

---

## 5. Tool & Template Schemas (3 schemas)

### tool-manifest.schema.json

| Field             | Value                                        |
| ----------------- | -------------------------------------------- |
| **Path**          | `.claude/schemas/tool-manifest.schema.json`  |
| **Category**      | Tool                                         |
| **Wiring Status** | WIRED (Ajv)                                  |
| **Consumer**      | `.claude/scripts/generate-tool-manifest.cjs` |
| **Validation**    | Advisory (pre-existing integration)          |
| **$schema**       | http://json-schema.org/draft-07/schema#      |

**Purpose:** Validates tool manifest structure for framework tool discovery.

**Note:** Already wired before Task #89 (pre-existing integration).

---

### presets.schema.json

| Field             | Value                                        |
| ----------------- | -------------------------------------------- |
| **Path**          | `.claude/schemas/presets.schema.json`        |
| **Category**      | Template                                     |
| **Wiring Status** | WIRED (Ajv)                                  |
| **Consumer**      | `.claude/lib/spawn/prompt-assembler.cjs`     |
| **Validation**    | Advisory via `validatePresets()`             |
| **$schema**       | https://json-schema.org/draft/2020-12/schema |

**Purpose:** Validates preset configuration structure for spawn prompt customization.

---

### adr-template.schema.json

| Field             | Value                                                         |
| ----------------- | ------------------------------------------------------------- |
| **Path**          | `.claude/schemas/adr-template.schema.json`                    |
| **Category**      | Template                                                      |
| **Wiring Status** | DOCS ONLY                                                     |
| **Consumer**      | `.claude/templates/adr-template.md` (documentation reference) |
| **Validation**    | Not validated at runtime                                      |
| **$schema**       | http://json-schema.org/draft-07/schema#                       |

**Purpose:** Defines ADR (Architecture Decision Record) template structure.

---

## 6. Planning & Testing Schemas (7 schemas)

### plan.schema.json

| Field             | Value                                   |
| ----------------- | --------------------------------------- |
| **Path**          | `.claude/schemas/plan.schema.json`      |
| **Category**      | Planning                                |
| **Wiring Status** | DOCS ONLY                               |
| **Consumer**      | Planner agent (documentation reference) |
| **Validation**    | Not validated at runtime                |
| **$schema**       | http://json-schema.org/draft-07/schema# |

**Purpose:** Defines plan document structure for planner agents.

---

### implementation-plan.schema.json

| Field             | Value                                              |
| ----------------- | -------------------------------------------------- |
| **Path**          | `.claude/schemas/implementation-plan.schema.json`  |
| **Category**      | Planning                                           |
| **Wiring Status** | DOCS ONLY                                          |
| **Consumer**      | Planner/developer agents (documentation reference) |
| **Validation**    | Not validated at runtime                           |
| **$schema**       | http://json-schema.org/draft-07/schema#            |

**Purpose:** Defines implementation plan structure with phases, tasks, and deliverables.

---

### phase-models.schema.json

| Field             | Value                                            |
| ----------------- | ------------------------------------------------ |
| **Path**          | `.claude/schemas/phase-models.schema.json`       |
| **Category**      | Planning                                         |
| **Wiring Status** | DOCS ONLY                                        |
| **Consumer**      | Workflow state machine (documentation reference) |
| **Validation**    | Not validated at runtime                         |
| **$schema**       | http://json-schema.org/draft-07/schema#          |

**Purpose:** Defines phase model structure for enterprise orchestration workflow.

---

### test-plan.schema.json

| Field             | Value                                   |
| ----------------- | --------------------------------------- |
| **Path**          | `.claude/schemas/test-plan.schema.json` |
| **Category**      | Testing                                 |
| **Wiring Status** | DOCS ONLY                               |
| **Consumer**      | QA agent (documentation reference)      |
| **Validation**    | Not validated at runtime                |
| **$schema**       | http://json-schema.org/draft-07/schema# |

**Purpose:** Defines test plan structure for QA workflows.

---

### test-results.schema.json

| Field             | Value                                      |
| ----------------- | ------------------------------------------ |
| **Path**          | `.claude/schemas/test-results.schema.json` |
| **Category**      | Testing                                    |
| **Wiring Status** | DOCS ONLY                                  |
| **Consumer**      | QA agent (documentation reference)         |
| **Validation**    | Not validated at runtime                   |
| **$schema**       | http://json-schema.org/draft-07/schema#    |

**Purpose:** Defines test execution results structure.

---

### product-requirements.schema.json

| Field             | Value                                              |
| ----------------- | -------------------------------------------------- |
| **Path**          | `.claude/schemas/product-requirements.schema.json` |
| **Category**      | Planning                                           |
| **Wiring Status** | DOCS ONLY                                          |
| **Consumer**      | Product manager agents (documentation reference)   |
| **Validation**    | Not validated at runtime                           |
| **$schema**       | http://json-schema.org/draft-07/schema#            |

**Purpose:** Defines product requirements document (PRD) structure.

---

### artifact-manifest.schema.json

| Field             | Value                                                   |
| ----------------- | ------------------------------------------------------- |
| **Path**          | `.claude/schemas/artifact-manifest.schema.json`         |
| **Category**      | Project                                                 |
| **Wiring Status** | DOCS ONLY                                               |
| **Consumer**      | Artifact lifecycle management (documentation reference) |
| **Validation**    | Not validated at runtime                                |
| **$schema**       | http://json-schema.org/draft-07/schema#                 |

**Purpose:** Defines artifact manifest structure for lifecycle tracking.

---

## 7. Architecture & Requirements Schemas (4 schemas)

### specification-template.schema.json

| Field             | Value                                                       |
| ----------------- | ----------------------------------------------------------- |
| **Path**          | `.claude/schemas/specification-template.schema.json`        |
| **Category**      | Architecture                                                |
| **Wiring Status** | DOCS ONLY                                                   |
| **Consumer**      | Architect/technical-writer agents (documentation reference) |
| **Validation**    | Not validated at runtime                                    |
| **$schema**       | http://json-schema.org/draft-07/schema#                     |

**Purpose:** Defines specification document template structure.

---

### system-architecture.schema.json

| Field             | Value                                             |
| ----------------- | ------------------------------------------------- |
| **Path**          | `.claude/schemas/system-architecture.schema.json` |
| **Category**      | Architecture                                      |
| **Wiring Status** | DOCS ONLY                                         |
| **Consumer**      | Architect agent (documentation reference)         |
| **Validation**    | Not validated at runtime                          |
| **$schema**       | http://json-schema.org/draft-07/schema#           |

**Purpose:** Defines system architecture document structure.

---

### project-brief.schema.json

| Field             | Value                                              |
| ----------------- | -------------------------------------------------- |
| **Path**          | `.claude/schemas/project-brief.schema.json`        |
| **Category**      | Planning                                           |
| **Wiring Status** | DOCS ONLY                                          |
| **Consumer**      | Planner/architect agents (documentation reference) |
| **Validation**    | Not validated at runtime                           |
| **$schema**       | http://json-schema.org/draft-07/schema#            |

**Purpose:** Defines project brief document structure.

---

### project-analysis.schema.json

| Field             | Value                                          |
| ----------------- | ---------------------------------------------- |
| **Path**          | `.claude/schemas/project-analysis.schema.json` |
| **Category**      | Project                                        |
| **Wiring Status** | DOCS ONLY                                      |
| **Consumer**      | Analyst agents (documentation reference)       |
| **Validation**    | Not validated at runtime                       |
| **$schema**       | http://json-schema.org/draft-07/schema#        |

**Purpose:** Defines project analysis report structure.

---

### ux-spec.schema.json

| Field             | Value                                      |
| ----------------- | ------------------------------------------ |
| **Path**          | `.claude/schemas/ux-spec.schema.json`      |
| **Category**      | Architecture                               |
| **Wiring Status** | DOCS ONLY                                  |
| **Consumer**      | UX/design agents (documentation reference) |
| **Validation**    | Not validated at runtime                   |
| **$schema**       | http://json-schema.org/draft-07/schema#    |

**Purpose:** Defines UX specification document structure.

---

## 8. Runtime & Observability Schemas (11 schemas)

Infrastructure schemas for routing, session tracking, reflection, and artifact observability.

| Schema                                  | Category     | Wiring Status | Purpose                                                          |
| --------------------------------------- | ------------ | ------------- | ---------------------------------------------------------------- |
| `artifact-graph.schema.json`            | Artifact     | DOCS ONLY     | Dependency graph nodes/edges for artifact relationships          |
| `artifact-score-entry.schema.json`      | Artifact     | DOCS ONLY     | Artifact quality score record written by artifact-quality-daemon |
| `database_architecture.schema.json`     | Architecture | DOCS ONLY     | Database architecture diagram output                             |
| `evolution-request.schema.json`         | Evolution    | DOCS ONLY     | Evolution request payload for evolution-orchestrator             |
| `generic-skill-output-base.schema.json` | Skill        | DOCS ONLY     | Base schema shared by all skill output schemas                   |
| `phase-advance.schema.json`             | Evolution    | DOCS ONLY     | Phase transition signal in conductor pattern                     |
| `reflection-spawn-request.schema.json`  | Reflection   | SOFT-WIRED    | Reflection session spawn request parameters                      |
| `remediation-queue-event.schema.json`   | Self-Healing | DOCS ONLY     | Remediation queue event for self-healing workflows               |
| `router-state.schema.json`              | Routing      | SOFT-WIRED    | Router state snapshot used by router-state.cjs                   |
| `session-gap-log-entry.schema.json`     | Session      | DOCS ONLY     | Session gap log entry written by drift-detector                  |
| `workflow-state.schema.json`            | Workflow     | SOFT-WIRED    | Workflow execution state for workflow-runner                     |

---

## 9. Archived Schemas

**Total Archived:** 25 schemas
**Archive Location:** `.claude/schemas/_archive/`
**Archive Method:** `git mv` (preserves full commit history)

See `.claude/schemas/_archive/README.md` for complete list and restoration instructions.

**Archive Categories:**

- Agile artifacts (12): epics, stories, backlogs, sprints, retrospectives (never implemented)
- Dead infrastructure (13): capability routing, event schema, skill manifest, context definition, etc.

---

## Usage Guidelines

### For Developers

**Adding a New Schema:**

1. Follow the creator workflow: invoke `Skill({ skill: "schema-creator" })` - **DO NOT** write schemas directly
2. Use `.schema.json` suffix (e.g., `my-schema.schema.json`)
3. Include `$schema` field (draft-07 or draft-2020-12)
4. Document purpose and consumer in schema description
5. Update this catalog after creation
6. Wire to Ajv validation if runtime validation is needed

**Wiring a Schema to Ajv:**

1. Use shared utility: `.claude/lib/utils/schema-validator.cjs`
2. Call `validateWithSchema(schemaPath, data)` for validation
3. Returns `{ valid, errors, skipped }` - never throws
4. Validation is advisory only (warnings, not blockers)

**Validation Best Practices:**

- Always gracefully degrade if schema is missing
- Never block operations on validation failures
- Log validation errors as warnings
- Advisory validation pattern: `if (!valid) { console.warn(...) }`

### For Agents

**Finding Schemas:**

- Search this catalog by category or purpose
- Check wiring status before assuming validation is active
- DOCS ONLY schemas are reference templates only
- WIRED schemas have actual runtime validation

**Schema Categories:**

- **Agent**: Agent definitions, configurations, capabilities
- **Skill**: Skill definitions and outputs
- **Workflow**: Workflow and hook definitions
- **Tool**: Tool manifests and configurations
- **Template**: Templates and presets
- **Planning**: Plans, requirements, briefs
- **Testing**: Test plans and results
- **Architecture**: System architecture, specifications
- **Evolution**: Evolution workflow state
- **Project**: Project metadata and analysis

---

## Related Documentation

- **Schema Creator Skill:** `.claude/skills/schema-creator/SKILL.md`
- **Schema Validator Utility:** `.claude/lib/utils/schema-validator.cjs`
- **Schema README:** `.claude/schemas/README.md`
- **Archive README:** `.claude/schemas/_archive/README.md`
- **Architecture Plan:** `.claude/context/plans/schemas-overhaul-architecture-2026-02-07.md`
- **ADR-088:** `.claude/context/memory/decisions.md` (Schemas System Overhaul decision)
