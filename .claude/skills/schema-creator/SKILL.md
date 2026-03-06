---
name: schema-creator
description: Creates JSON Schema validation files for skills, agents, hooks, workflows, and data structures. Ensures type safety and input validation across the framework.
version: 2.3.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit, Bash, Glob, Grep]
# Phase 1 Integration: Schemas validate tools against .claude/config/tool-manifest.json
# Agent/skill schemas reference available tools from the manifest
# Single source of truth: .claude/config/tool-manifest.json
best_practices:
  - Use JSON Schema draft-07 or later
  - Include descriptions for all properties
  - Define required vs optional clearly
  - Add examples in schema
  - Use $ref for reusable definitions
  - Validate schemas before saving
error_handling: graceful
streaming: supported
output_location: .claude/schemas/
verified: true
lastVerifiedAt: '2026-02-28'
dependencies: [research-synthesis]
---

# Schema Creator Skill

> **WARNING: DO NOT WRITE DIRECTLY TO .claude/schemas/**
>
> Schema files are protected by `unified-creator-guard.cjs` (Gate 4 in CLAUDE.md).
> Direct writes bypass post-creation steps (catalog updates, consumer assignment, integration verification).
> Always use the `schema-creator` skill workflow for creating schemas.
> Direct writes create "invisible artifacts" that no validator or agent can discover.

Creates JSON Schema validation files for the Claude Code Enterprise Framework. Schemas enforce type safety, input validation, and structural consistency across skills, agents, hooks, workflows, and custom data structures.

## SYSTEM IMPACT ANALYSIS (CRITICAL - DO NOT SKIP)

**After creating ANY schema, you MUST:**

1. Register in appropriate location (global vs skill-local)
2. Update related validators to use the new schema
3. Add schema reference to CLAUDE.md if globally significant

**Verification:**

```bash
# Verify schema is valid JSON
node -e "JSON.parse(require('fs').readFileSync('.claude/schemas/<schema-name>.json'))"

# Check schema exists
ls .claude/schemas/<schema-name>.json || ls .claude/skills/<skill>/schemas/<schema-name>.json
```

**WHY**: Invalid schemas cause silent validation failures. Unregistered schemas are never used.

---

## Purpose

Schemas provide structured validation for:

1. **Skill Inputs/Outputs** - Validate data passed to and from skills
2. **Agent Definitions** - Validate agent YAML frontmatter and structure
3. **Hook Definitions** - Validate hook configuration and registration
4. **Workflow Definitions** - Validate workflow steps and configuration
5. **Custom Data Structures** - Validate project-specific data formats

## Schema Types

| Type                | Location                                           | Purpose                          |
| ------------------- | -------------------------------------------------- | -------------------------------- |
| Skill Input         | `.claude/skills/{name}/schemas/input.schema.json`  | Validate skill invocation inputs |
| Skill Output        | `.claude/skills/{name}/schemas/output.schema.json` | Validate skill execution outputs |
| Agent Definition    | `.claude/schemas/agent-definition.schema.json`     | Validate agent YAML frontmatter  |
| Skill Definition    | `.claude/schemas/skill-definition.schema.json`     | Validate skill YAML frontmatter  |
| Hook Definition     | `.claude/schemas/hook-definition.schema.json`      | Validate hook configuration      |
| Workflow Definition | `.claude/schemas/workflow-definition.schema.json`  | Validate workflow structure      |
| Custom              | `.claude/schemas/{name}.schema.json`               | Project-specific validation      |

### Reference Schema

**Use `.claude/schemas/agent-definition.schema.json` as the canonical reference schema.**

Before finalizing any schema, compare against reference:

- [ ] Follows JSON Schema draft-07 or later (draft-2020-12 preferred)
- [ ] Has $schema, $id, title, description, type fields
- [ ] Required fields are documented in "required" array
- [ ] All properties have description fields
- [ ] Includes examples where helpful
- [ ] Uses proper patterns (kebab-case names, semver versions)

### CLAUDE.md Registration (MANDATORY)

After creating a schema, update CLAUDE.md if the schema enables new capabilities:

1. **New artifact type schema** - Add to relevant section (Section 3 for agents, Section 8.5 for skills)
2. **Agent/skill/workflow validation schema** - Document in Section 4 (Self-Evolution)
3. **Framework-wide schema** - Add to Existing Schemas Reference table in this skill

**Verification:**

```bash
grep "schema-name" .claude/CLAUDE.md || echo "WARNING: Schema not registered in CLAUDE.md"
```

**BLOCKING**: Schema without documentation may not be discovered by other agents.

## Workflow

### Step 0: Research Synthesis (MANDATORY - ALWAYS FIRST)

**BEFORE creating ANY schema, invoke research-synthesis:**

```javascript
Skill({ skill: 'research-synthesis' });
```

**Research Requirements:**

- Minimum 3 Exa searches for JSON Schema best practices
- Review existing schemas in `.claude/schemas/` for patterns
- Check schema catalog at `.claude/context/artifacts/catalogs/schema-catalog.md`
- Identify similar schemas that can be used as references
- Document research findings before proceeding

**Why:** Research-synthesis ensures schemas follow industry best practices and maintain consistency with existing framework schemas.

---

### Step 1: Existence Check and Updater Delegation (MANDATORY - SECOND STEP)

**BEFORE creating any schema file, check if it already exists:**

1. **Check if schema already exists:**

   ```bash
   test -f .claude/schemas/<schema-name>.json && echo "EXISTS" || echo "NEW"
   ```

2. **If schema EXISTS:**
   - **DO NOT proceed with creation**
   - **Invoke artifact-updater workflow instead:**

     ```javascript
     Skill({
       skill: 'artifact-updater',
       args: {
         name: '<schema-name>',
         changes: '<description of requested changes>',
         justification: 'Update requested via schema-creator',
       },
     });
     ```

   - **Return updater result and STOP**

3. **If schema is NEW:**
   - Continue with Step 1.1 below

---

### Step 1.1: Smart Duplicate Detection (MANDATORY)

Before proceeding with creation, run the 3-layer duplicate check:

```javascript
const { checkDuplicate } = require('.claude/lib/creation/duplicate-detector.cjs');
const result = checkDuplicate({
  artifactType: 'schema',
  name: proposedName,
  description: proposedDescription,
  keywords: proposedKeywords || [],
});
```

**Handle results:**

- **`EXACT_MATCH`**: Stop creation. Route to `schema-updater` skill instead: `Skill({ skill: 'schema-updater' })`
- **`REGISTRY_MATCH`**: Warn user — artifact is registered but file may be missing. Investigate before creating. Ask user to confirm.
- **`SIMILAR_FOUND`**: Display candidates with scores. Ask user: "Similar artifact(s) exist. Continue with new creation or update existing?"
- **`NO_MATCH`**: Proceed to next step.

**Override**: If user explicitly passes `--force`, skip this check entirely.

---

### Step 1.5: Companion Check

Before proceeding with creation, run the ecosystem companion check:

1. Use `companion-check.cjs` from `.claude/lib/creators/companion-check.cjs`
2. Call `checkCompanions("schema", "{schema-name}")` to identify companion artifacts
3. Review the companion checklist — note which required/recommended companions are missing
4. Plan to create or verify missing companions after this artifact is complete
5. Include companion findings in post-creation integration notes

This step is **informational** (does not block creation) but ensures the full artifact ecosystem is considered.

---

### Step 2: Gather Schema Requirements

Before creating a schema, understand:

```
1. WHAT data structure are you validating?
   - Skill input/output
   - Agent/skill/hook/workflow definition
   - Custom data format

2. WHERE should the schema live?
   - Global: .claude/schemas/ (framework-wide)
   - Local: .claude/skills/{skill}/schemas/ (skill-specific)

3. WHAT are the required vs optional fields?
   - Required: Must be present for valid data
   - Optional: Enhance but not required

4. WHAT are the validation rules?
   - Types (string, number, boolean, object, array)
   - Patterns (regex for strings)
   - Ranges (min/max for numbers)
   - Enums (allowed values)
   - Lengths (min/max for strings/arrays)
```

### Step 3: Determine Schema Type and Location

| Creating For       | Schema Location                                     | Example                    |
| ------------------ | --------------------------------------------------- | -------------------------- |
| New skill inputs   | `.claude/skills/{skill}/schemas/input.schema.json`  | `tdd` skill parameters     |
| New skill outputs  | `.claude/skills/{skill}/schemas/output.schema.json` | `tdd` skill results        |
| Global definition  | `.claude/schemas/{name}.schema.json`                | `test-results.schema.json` |
| Reusable component | `.claude/schemas/components/{name}.schema.json`     | `task-status.schema.json`  |

### Step 4: Analyze Data Structure

Examine existing data or specify expected structure:

```javascript
// Example: Analyzing skill output structure
const exampleOutput = {
  success: true,
  result: {
    filesCreated: ['src/test.ts'],
    testsGenerated: 5,
    coverage: 85.2,
  },
  metadata: {
    duration: 1234,
    skill: 'test-generator',
  },
};

// Extract schema from example:
// - success: boolean (required)
// - result: object (optional)
// - metadata: object (optional)
```

### Step 5: Generate JSON Schema

Use the schema template and customize:

```json
{
  "$schema": "https://json-schema.org/draft-07/schema#",
  "$id": "https://claude.ai/schemas/{schema-name}",
  "title": "{Schema Title}",
  "description": "{What this schema validates}",
  "type": "object",
  "required": ["field1", "field2"],
  "properties": {
    "field1": {
      "type": "string",
      "description": "Description of field1",
      "minLength": 1,
      "maxLength": 100
    },
    "field2": {
      "type": "number",
      "description": "Description of field2",
      "minimum": 0,
      "maximum": 100
    },
    "optionalField": {
      "type": "boolean",
      "description": "Optional boolean field",
      "default": false
    }
  },
  "additionalProperties": false
}
```

### Step 6: Add Descriptions and Examples

**Every property MUST have a description:**

```json
{
  "properties": {
    "name": {
      "type": "string",
      "description": "The unique identifier for the resource in lowercase-with-hyphens format",
      "pattern": "^[a-z][a-z0-9-]*$",
      "examples": ["my-skill", "test-generator", "code-reviewer"]
    }
  }
}
```

**Add top-level examples:**

```json
{
  "examples": [
    {
      "name": "example-skill",
      "description": "An example skill for demonstration",
      "version": "1.0.0"
    }
  ]
}
```

### Step 7: Create Validation Test

Write a simple test to verify the schema works:

```javascript
// validate-schema-test.cjs
const Ajv = require('ajv');
const schema = require('./.claude/schemas/my-schema.schema.json');

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

// Test valid data
const validData = {
  /* valid example */
};
console.log('Valid:', validate(validData));

// Test invalid data
const invalidData = {
  /* invalid example */
};
console.log('Invalid:', validate(invalidData));
console.log('Errors:', validate.errors);
```

### Step 8: Post-Creation Schema Registration (Phase 1 Integration)

**This step is CRITICAL.** After creating the schema artifact, you MUST register it in the schema discovery system.

**Phase 1 Context:** Phase 1 is responsible for discovering and cataloging schemas for validation. Schemas created without registration are invisible to validators and other systems that need them for data validation.

After schema file is written and validated:

1. **Create/Update Schema Registry Entry** in appropriate location:

   If registry doesn't exist, create `.claude/context/artifacts/schema-catalog.md`:

   ```json
   {
     "schemas": [
       {
         "name": "{schema-name}",
         "id": "{schema-name}",
         "$id": "https://claude.ai/schemas/{schema-name}",
         "type": "{input|output|definition|global|component}",
         "description": "{What this schema validates}",
         "version": "1.0.0",
         "filePath": ".claude/schemas/{schema-name}.schema.json",
         "validatesFor": ["{artifact-type-1}", "{artifact-type-2}"],
         "relatedSchemas": [],
         "usedBy": ["{validator-hook}", "{creator-skill}"]
       }
     ]
   }
   ```

2. **Register with Validators:**

   Update any validation hooks that should use this schema:
   - Check `.claude/hooks/validation/` for relevant validators
   - Add schema to schemaMap in validators that need it

   Example:

   ```javascript
   const schemaMap = {
     '.claude/agents/': '.claude/schemas/agent-definition.schema.json',
     '.claude/schemas/{schema-name}.schema.json': require('./.claude/schemas/{schema-name}.schema.json'),
   };
   ```

3. **Document in `.claude/context/artifacts/catalogs/schema-catalog.md`:**

   Add entry to the schema catalog:

   ````markdown
   ### {Schema Title} (`{schema-name}.schema.json`)

   **$id:** `https://claude.ai/schemas/{schema-name}`

   **Purpose:** {Detailed description of what this schema validates}

   **Used by:**

   - {Validator/hook 1}
   - {Creator skill 1}

   **Root properties:**

   - {property-1}: {description}
   - {property-2}: {description}

   **Example valid data:**

   ```json
   {
     "example": "value"
   }
   ```
   ````

   **Required fields:** {List required fields}

   **Validation:** When data matches this schema, {describe what is validated}

   ```

   ```

4. **Update `.claude/CLAUDE.md` if Schema Enables New Capabilities:**

   If this schema supports new artifact types or validation:
   - Add to relevant section (Section 4.1 for creator schemas, Section 9.7 for schemas directory)
   - Add to "Existing Schemas Reference" table in Step 7 of this skill

   Example entry:

   ```markdown
   | `{schema-name}` | `.claude/schemas/` | {Purpose} |
   ```

5. **Update Memory:**

   Append to `.claude/context/memory/learnings.md`:

   ```markdown
   ## Schema: {schema-name}

   - **Type:** {input|output|definition|global|component}
   - **Validates:** {What artifact/data type}
   - **Purpose:** {Detailed purpose}
   - **$id:** https://claude.ai/schemas/{schema-name}
   - **Validators:** {Which hooks/validators use it}
   - **Related Schemas:** {Any $ref references}
   ```

**Why this matters:** Without schema registration:

- Validators cannot discover and use schemas
- Data validation doesn't occur system-wide
- Invalid artifacts are created without detection
- "Invisible artifact" pattern emerges

**Phase 1 Integration:** Schema registry is the discovery mechanism for Phase 1, enabling validators to find and apply schemas consistently across the system.

### Step 9: System Impact Analysis (MANDATORY)

**Before marking schema creation complete, verify ALL items:**

```
[ ] Schema file created in correct location
[ ] Schema is valid JSON (parseable)
[ ] Schema has $schema, $id, title, description
[ ] All required fields defined in "required" array
[ ] All properties have descriptions
[ ] Examples included for complex schemas
[ ] Schema registry entry created (Step 7)
[ ] Validators registered with schema (if applicable)
[ ] SCHEMA_CATALOG.md updated (Step 7)
[ ] Related documentation updated
```

**Verification Commands:**

```bash
# Validate JSON syntax
node -e "JSON.parse(require('fs').readFileSync('.claude/schemas/{name}.schema.json'))"

# Check required fields
node -e "const s = require('.claude/schemas/{name}.schema.json'); console.log('title:', s.title); console.log('description:', s.description);"

# Check schema registry
grep "{schema-name}" .claude/context/artifacts/schema-catalog.md

# List all schemas
ls -la .claude/schemas/*.schema.json
```

**BLOCKING**: If any item fails, schema creation is INCOMPLETE. All items must pass.

## System Impact Analysis (MANDATORY)

After creating a schema, complete ALL of the following:

### 1. CLAUDE.md Update

- Add to appropriate section if schema enables new capability
- Section 3 for agent-related schemas
- Section 4.1 for creator ecosystem schemas
- Section 8.5 for skill-related schemas

### 2. Validator Integration

- Check if hooks should validate against new schema
- Update `.claude/hooks/` if schema affects validation
- Add to `schemaMap` in relevant validators

### 3. Related Schemas

- Update related schemas if needed ($ref links)
- Check for circular dependencies
- Ensure $id values are unique

### 4. Documentation

- Update `.claude/docs/` if schema documents new pattern
- Add schema to Existing Schemas Reference table
- Update skill-catalog.md if schema is for a new skill

**Verification Checklist:**

```bash
# Check CLAUDE.md registration
grep "{schema-name}" .claude/CLAUDE.md

# Check for $ref usage in other schemas
grep -r "{schema-name}" .claude/schemas/

# Verify no duplicate $id
grep -h "\$id" .claude/schemas/*.json | sort | uniq -d
```

**BLOCKING**: Schema creation is NOT complete until all impact analysis items are verified.

## Schema Templates

### Basic Input Schema

```json
{
  "$schema": "https://json-schema.org/draft-07/schema#",
  "$id": "https://claude.ai/schemas/skill-name-input",
  "title": "Skill Name Input Schema",
  "description": "Input validation schema for skill-name skill",
  "type": "object",
  "required": [],
  "properties": {
    "target": {
      "type": "string",
      "description": "Target file or directory path"
    },
    "options": {
      "type": "object",
      "description": "Optional configuration",
      "properties": {
        "verbose": {
          "type": "boolean",
          "default": false
        }
      }
    }
  },
  "additionalProperties": false
}
```

### Basic Output Schema

```json
{
  "$schema": "https://json-schema.org/draft-07/schema#",
  "$id": "https://claude.ai/schemas/skill-name-output",
  "title": "Skill Name Output Schema",
  "description": "Output validation schema for skill-name skill",
  "type": "object",
  "required": ["success"],
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the skill executed successfully"
    },
    "result": {
      "type": "object",
      "description": "The skill execution result",
      "additionalProperties": true
    },
    "error": {
      "type": "string",
      "description": "Error message if execution failed"
    }
  },
  "additionalProperties": false
}
```

### Definition Schema (for agents, skills, hooks)

```json
{
  "$schema": "https://json-schema.org/draft-07/schema#",
  "$id": "https://claude.ai/schemas/entity-definition",
  "title": "Entity Definition Schema",
  "description": "Schema for validating entity definition files",
  "type": "object",
  "required": ["name", "description"],
  "properties": {
    "name": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9-]*$",
      "description": "Entity name in lowercase-with-hyphens format"
    },
    "description": {
      "type": "string",
      "minLength": 20,
      "maxLength": 500,
      "description": "Clear description of the entity purpose"
    },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+(\\.\\d+)?$",
      "default": "1.0.0",
      "description": "Semantic version number"
    }
  },
  "additionalProperties": true,
  "examples": [
    {
      "name": "my-entity",
      "description": "A sample entity for demonstration purposes",
      "version": "1.0.0"
    }
  ]
}
```

## Common JSON Schema Patterns

### String Patterns

```json
{
  "kebab-case": {
    "type": "string",
    "pattern": "^[a-z][a-z0-9-]*$"
  },
  "semver": {
    "type": "string",
    "pattern": "^\\d+\\.\\d+(\\.\\d+)?$"
  },
  "file-path": {
    "type": "string",
    "pattern": "^[\\w./-]+$"
  },
  "email": {
    "type": "string",
    "format": "email"
  },
  "url": {
    "type": "string",
    "format": "uri"
  }
}
```

### Enum Patterns

```json
{
  "model": {
    "type": "string",
    "enum": ["sonnet", "opus", "haiku", "inherit"]
  },
  "priority": {
    "type": "string",
    "enum": ["lowest", "low", "medium", "high", "highest"]
  },
  "status": {
    "type": "string",
    "enum": ["pending", "in_progress", "completed", "failed", "blocked"]
  }
}
```

### Array Patterns

```json
{
  "tools": {
    "type": "array",
    "items": { "type": "string" },
    "minItems": 1,
    "uniqueItems": true,
    "description": "List of available tools"
  },
  "skills": {
    "type": "array",
    "items": { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
    "description": "List of skill names"
  }
}
```

### Object Patterns

```json
{
  "config": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "enabled": { "type": "boolean", "default": true },
      "timeout": { "type": "integer", "minimum": 0 }
    }
  },
  "metadata": {
    "type": "object",
    "additionalProperties": true,
    "description": "Arbitrary metadata"
  }
}
```

### Conditional Patterns

```json
{
  "if": {
    "properties": {
      "type": { "const": "mcp" }
    }
  },
  "then": {
    "required": ["server", "command"]
  },
  "else": {
    "required": ["handler"]
  }
}
```

### Using $ref for Reusability

```json
{
  "$defs": {
    "namePattern": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9-]*$",
      "description": "Lowercase with hyphens"
    },
    "toolsList": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1
    }
  },
  "properties": {
    "name": { "$ref": "#/$defs/namePattern" },
    "tools": { "$ref": "#/$defs/toolsList" }
  }
}
```

## CLI Usage

### Create Schema from Template

```bash
# Create skill input schema
node .claude/skills/schema-creator/scripts/main.cjs \
  --type input \
  --skill my-skill

# Create skill output schema
node .claude/skills/schema-creator/scripts/main.cjs \
  --type output \
  --skill my-skill

# Create global schema
node .claude/skills/schema-creator/scripts/main.cjs \
  --type global \
  --name my-data-format

# Create definition schema
node .claude/skills/schema-creator/scripts/main.cjs \
  --type definition \
  --entity workflow
```

### Validate Schema

```bash
# Validate a schema file
node .claude/skills/schema-creator/scripts/main.cjs \
  --validate .claude/schemas/my-schema.schema.json

# Validate data against schema
node .claude/skills/schema-creator/scripts/main.cjs \
  --validate-data data.json \
  --schema .claude/schemas/my-schema.schema.json
```

### Generate Schema from Example

```bash
# Generate schema from JSON example
node .claude/skills/schema-creator/scripts/main.cjs \
  --from-example example.json \
  --output .claude/schemas/generated.schema.json
```

## Integration with Validators

### Using Ajv for Runtime Validation

```javascript
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

// Load and compile schema
const schema = require('./.claude/schemas/skill-definition.schema.json');
const validate = ajv.compile(schema);

// Validate data
function validateSkillDefinition(data) {
  const valid = validate(data);
  if (!valid) {
    return {
      valid: false,
      errors: validate.errors.map(e => `${e.instancePath} ${e.message}`),
    };
  }
  return { valid: true };
}
```

### Pre-commit Validation Hook

```javascript
// .claude/hooks/schema-validator.js
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const schemaMap = {
  '.claude/agents/': '.claude/schemas/agent-definition.schema.json',
  '.claude/skills/': '.claude/schemas/skill-definition.schema.json',
  '.claude/hooks/': '.claude/schemas/hook-definition.schema.json',
};

function validateFile(filePath) {
  // Find matching schema
  for (const [pattern, schemaPath] of Object.entries(schemaMap)) {
    if (filePath.includes(pattern)) {
      const schema = JSON.parse(fs.readFileSync(schemaPath));
      const ajv = new Ajv();
      const validate = ajv.compile(schema);

      // Parse and validate file
      // ...
    }
  }
}
```

## Workflow Integration

This skill is part of the unified artifact lifecycle. For complete multi-agent orchestration:

**Router Decision:** `.claude/workflows/core/router-decision.md`

- How the Router discovers and invokes this skill's artifacts

**Artifact Lifecycle:** `.claude/workflows/core/skill-lifecycle.md`

- Discovery, creation, update, deprecation phases
- Version management and registry updates
- CLAUDE.md integration requirements

**External Integration:** `.claude/workflows/core/external-integration.md`

- Safe integration of external artifacts
- Security review and validation phases

---

## Cross-Reference: Creator Ecosystem

This skill is part of the **Creator Ecosystem**. Use companion creators for related artifacts:

| Gap Discovered                           | Required Artifact | Creator to Invoke                      | When                              |
| ---------------------------------------- | ----------------- | -------------------------------------- | --------------------------------- |
| Domain knowledge needs a reusable skill  | skill             | `Skill({ skill: 'skill-creator' })`    | Gap is a full skill domain        |
| Existing skill has incomplete coverage   | skill update      | `Skill({ skill: 'skill-updater' })`    | Close skill exists but incomplete |
| Capability needs a dedicated agent       | agent             | `Skill({ skill: 'agent-creator' })`    | Agent to own the capability       |
| Existing agent needs capability update   | agent update      | `Skill({ skill: 'agent-updater' })`    | Close agent exists but incomplete |
| Domain needs code/project scaffolding    | template          | `Skill({ skill: 'template-creator' })` | Reusable code patterns needed     |
| Behavior needs pre/post execution guards | hook              | `Skill({ skill: 'hook-creator' })`     | Enforcement behavior required     |
| Process needs multi-phase orchestration  | workflow          | `Skill({ skill: 'workflow-creator' })` | Multi-step coordination needed    |
| Artifact needs structured I/O validation | schema            | `Skill({ skill: 'schema-creator' })`   | JSON schema for artifact I/O      |
| User interaction needs a slash command   | command           | `Skill({ skill: 'command-creator' })`  | User-facing shortcut needed       |
| Repeated logic needs a reusable CLI tool | tool              | `Skill({ skill: 'tool-creator' })`     | CLI utility needed                |
| Narrow/single-artifact capability only   | inline            | Document within this artifact only     | Too specific to generalize        |

### Integration Chain

```text
[SKILL-CREATOR] Creating new skill with validation...
  -> Calls schema-creator for input/output schemas
  -> Schemas created in .claude/skills/{skill}/schemas/

[AGENT-CREATOR] Creating agent with strict validation...
  -> Agent uses agent-definition.schema.json for self-validation
  -> Agent validates inputs using custom schemas

[WORKFLOW-CREATOR] Creating workflow with typed steps...
  -> Each step output validates against schema
  -> Workflow uses workflow-definition.schema.json
```

## Existing Schemas Reference

**Total Active Schemas:** 27 (25 archived - see `.claude/schemas/_archive/`)
**Actively Validated (Ajv):** 8 schemas with runtime validation
**Documentation Reference:** 16 schemas as structural templates
**Optional Validation:** 3 schemas with paths defined but validation skipped

**Complete catalog:** `.claude/context/artifacts/catalogs/schema-catalog.md`

### Active Schemas by Category

#### Agent Schemas (5)

| Schema                  | Wiring Status | Consumer                |
| ----------------------- | ------------- | ----------------------- |
| `agent-capability-card` | WIRED         | generate-agent-registry |
| `agent-config`          | WIRED         | agent-config.cjs        |
| `agent-definition`      | WIRED         | agent-parser.cjs        |
| `agent-identity`        | WIRED         | agent-parser.cjs        |
| `agent-spawn-params`    | DOCS ONLY     | Spawn prompt reference  |

#### Skill Schemas (4)

| Schema                           | Wiring Status | Consumer                 |
| -------------------------------- | ------------- | ------------------------ |
| `skill-definition`               | WIRED         | skill-creator/create.cjs |
| `skill-diagram-generator-output` | SOFT-WIRED    | diagram-generator skill  |
| `skill-repo-rag-output`          | SOFT-WIRED    | repo-rag skill           |
| `skill-test-generator-output`    | SOFT-WIRED    | test-generator skill     |

#### Workflow & Hook Schemas (2)

| Schema                | Wiring Status | Consumer                    |
| --------------------- | ------------- | --------------------------- |
| `workflow-definition` | DOCS ONLY     | No workflow-creator scripts |
| `hook-definition`     | DOCS ONLY     | No hook-creator scripts     |

#### Evolution & Project Schemas (2)

| Schema            | Wiring Status | Consumer                   |
| ----------------- | ------------- | -------------------------- |
| `evolution-state` | WIRED         | self-healing/validator.cjs |
| `track-metadata`  | DOCS ONLY     | TaskCreate metadata field  |

#### Tool & Template Schemas (3)

| Schema          | Wiring Status | Consumer                    |
| --------------- | ------------- | --------------------------- |
| `tool-manifest` | WIRED         | generate-tool-manifest.cjs  |
| `presets`       | WIRED         | spawn/prompt-assembler.cjs  |
| `adr-template`  | DOCS ONLY     | ADR documentation structure |

#### Planning Schemas (5)

| Schema                 | Wiring Status | Consumer                 |
| ---------------------- | ------------- | ------------------------ |
| `plan`                 | DOCS ONLY     | Planning phase reference |
| `implementation-plan`  | DOCS ONLY     | Implementation planning  |
| `phase-models`         | DOCS ONLY     | Phase planning reference |
| `product_requirements` | DOCS ONLY     | Requirements gathering   |
| `project_brief`        | DOCS ONLY     | Project initialization   |

#### Testing Schemas (2)

| Schema         | Wiring Status | Consumer                |
| -------------- | ------------- | ----------------------- |
| `test_plan`    | DOCS ONLY     | Test planning reference |
| `test-results` | DOCS ONLY     | Test execution output   |

#### Architecture Schemas (3)

| Schema                   | Wiring Status | Consumer                   |
| ------------------------ | ------------- | -------------------------- |
| `specification-template` | DOCS ONLY     | Specification documents    |
| `system_architecture`    | DOCS ONLY     | Architecture documentation |
| `ux_spec`                | DOCS ONLY     | UX specification documents |

#### Project Schemas (1)

| Schema             | Wiring Status | Consumer                |
| ------------------ | ------------- | ----------------------- |
| `project-analysis` | DOCS ONLY     | Project analyzer output |

**Note:** All schemas located at `.claude/schemas/` unless otherwise specified. See schema catalog for full details on consumers, validation methods, and integration status.

## File Placement & Standards

### Output Location Rules

This skill outputs to: `.claude/schemas/`

For skill-specific schemas: `.claude/skills/<skill-name>/schemas/`

Schema naming convention:

- Global schemas: `<name>.schema.json`
- Skill input: `input.schema.json`
- Skill output: `output.schema.json`
- Components: `components/<name>.schema.json`

### Mandatory References

- **File Placement**: See `.claude/docs/FILE_PLACEMENT_RULES.md`
- **Developer Workflow**: See `.claude/docs/DEVELOPER_WORKFLOW.md`
- **Artifact Naming**: See `.claude/docs/ARTIFACT_NAMING.md`
- **Workspace Conventions**: See `.claude/rules/workspace-conventions.md` (output placement, naming, provenance)

### Enforcement

File placement is enforced by `file-placement-guard.cjs` hook.
Invalid placements will be blocked in production mode.

---

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
cat .claude/context/memory/learnings.md
```

Check for:

- Previously created schemas
- Known validation issues
- Schema naming conventions

**After completing:**

- New schema created -> Append to `.claude/context/memory/learnings.md`
- Validation issue found -> Append to `.claude/context/memory/issues.md`
- Architecture decision -> Append to `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.

## Iron Laws of Schema Creation

These rules are INVIOLABLE. Breaking them causes validation failures.

```
1. NO SCHEMA WITHOUT $schema FIELD
   - Every schema MUST declare its JSON Schema version
   - Use draft-07 or later: "$schema": "https://json-schema.org/draft-07/schema#"

2. NO SCHEMA WITHOUT title AND description
   - Every schema MUST be self-documenting
   - title: Short name of what it validates
   - description: Detailed explanation of purpose

3. NO PROPERTY WITHOUT description
   - Every property MUST have a description
   - Readers should understand field purpose without external docs

4. NO REQUIRED FIELD WITHOUT DEFINITION
   - If field is in "required" array, it MUST be in "properties"
   - Undefined required fields cause silent validation failures

5. NO ADDITIONALPROPERTIES: true WITHOUT REASON
   - Default to additionalProperties: false for strict validation
   - Only allow additional properties when explicitly needed

6. NO SCHEMA WITHOUT VALIDATION TEST
   - Test schema with valid AND invalid examples
   - Schema that passes everything validates nothing

7. NO CREATION WITHOUT SYSTEM IMPACT ANALYSIS
   - Check if related validators need updating
   - Check if documentation needs updating
   - Check if related schemas need cross-references

8. NO SCHEMA WITHOUT CLAUDE.MD REGISTRATION
   - If schema enables new capabilities, update CLAUDE.md
   - Section 4 (Self-Evolution) for agent/skill/workflow schemas
   - Verify with: grep "schema-name" .claude/CLAUDE.md

9. IRON LAW II: TYPED TOOL CALLING (MODEL-AGNOSTIC INTERFACE)
   - Every tool-facing schema MUST include "description" on every property
   - This is Typed Tool Calling: the model resolves parameters from a typed
     JSON Schema contract instead of inferring from free-form markdown prose
   - Benefit: Reduces model hallucination by 40-60% vs. untyped instructions
   - Every required field must have: "type", "description", and where applicable "enum"
   - Use snake_case for property names for cross-framework compatibility
   - For schemas consumed by AI agents, add a Google Dork to your research:
     "$schema" "type": "object" "properties" filetype:json ("tool" OR "skill") [Domain]
   - additionalProperties MUST be false unless explicitly justified
```

## Validation Checklist (Run After Every Creation)

```bash
# Verify schema is valid JSON
node -e "JSON.parse(require('fs').readFileSync('.claude/schemas/{name}.schema.json'))"

# Check required fields exist
node -e "const s = require('.claude/schemas/{name}.schema.json'); console.log('Has $schema:', !!s.\$schema); console.log('Has title:', !!s.title); console.log('Has description:', !!s.description);"

# Check all required properties are defined
node -e "const s = require('.claude/schemas/{name}.schema.json'); const r = s.required || []; const p = Object.keys(s.properties || {}); console.log('Missing:', r.filter(x => !p.includes(x)));"

# List all schemas
ls -la .claude/schemas/*.schema.json
```

**Completion Checklist** (all must be checked):

```
[ ] Schema file created with .schema.json extension
[ ] $schema field present (draft-07 or later)
[ ] title and description present
[ ] All properties have descriptions
[ ] required array matches defined properties
[ ] examples included for complex schemas
[ ] Schema validated with test data
[ ] System impact analysis completed
[ ] CLAUDE.md updated if schema enables new capabilities
[ ] Related schemas updated if needed ($ref links)
```

**BLOCKING**: If ANY item fails, schema creation is INCOMPLETE. All items must pass before proceeding.

---

## Ecosystem Alignment Contract (MANDATORY)

This creator skill is part of a coordinated creator ecosystem. Any schema created here must align with related creators:

- `agent-creator` for ownership and execution paths
- `skill-creator` for capability packaging and assignment
- `hook-creator` for enforcement and guardrails
- `workflow-creator` for orchestration and phase gating
- `template-creator` for standardized scaffolds
- `command-creator` for user/operator command UX
- `tool-creator` for executable automation surfaces

### Cross-Creator Handshake (Required)

Before completion, verify all relevant handshakes:

1. Artifact route exists in `.claude/CLAUDE.md` and related routing docs.
2. Discovery/registry entries are updated (catalog/index/registry as applicable).
3. Companion artifacts are created or explicitly waived with reason.
4. `validate-integration.cjs` passes for the created artifact.
5. Skill index is regenerated when skill metadata changes.

### Research Gate (Exa + arXiv — BOTH MANDATORY)

For new schema patterns, research is mandatory:

1. Use Exa for implementation and ecosystem patterns:
   - `mcp__Exa__web_search_exa({ query: '<topic> JSON Schema 2025 best practices' })`
   - `mcp__Exa__get_code_context_exa({ query: '<topic> schema validation examples' })`
2. Search arXiv for academic research (mandatory for AI/ML, agents, evaluation, orchestration, memory/RAG, security):
   - Via Exa: `mcp__Exa__web_search_exa({ query: 'site:arxiv.org <topic> 2024 2025' })`
   - Direct API: `WebFetch({ url: 'https://arxiv.org/search/?query=<topic>&searchtype=all&start=0' })`
3. Record decisions, constraints, and non-goals in artifact references/docs.
4. Keep schemas minimal and avoid over-specification.

**arXiv is mandatory (not fallback) when topic involves:** AI agents, LLM evaluation, orchestration, memory/RAG, security, or any emerging methodology.

### Regression-Safe Delivery

- Follow strict RED -> GREEN -> REFACTOR for behavior changes.
- Run targeted tests for changed modules.
- Run lint/format on changed files.
- Keep commits scoped by concern (logic/docs/generated artifacts).

---

## Post-Creation Integration

After creation completes, run the ecosystem integration checklist:

1. Call `runIntegrationChecklist(artifactType, artifactPath)` from `.claude/lib/creators/creator-commons.cjs`
2. Call `queueCrossCreatorReview(artifactType, artifactPath)` from `.claude/lib/creators/creator-commons.cjs`
3. Review the impact report — address all `mustHave` items before marking task complete
4. Log any `shouldHave` items as follow-up tasks

**Integration verification:**

- [ ] Schema added to schema-catalog.md
- [ ] Schema validator wired (if applicable)
- [ ] Schema referenced by consuming artifacts
- [ ] Schema has test data examples

## Evaluation Note

Schema artifacts are deterministic and structurally verifiable — the Step 7 validation tests in this skill's workflow (AJV compilation, `$id` uniqueness check, required-field coverage, test-data round-trip) serve as the primary quality gate and provide stronger signal than LLM-as-judge scoring. For schemas that feed agent or hook output contracts, also validate against `skill-evaluation-output.schema.json` to ensure downstream evaluators can parse the results. Full evaluation protocol and grader/analyzer agent usage is documented in `.claude/skills/skill-creator/EVAL_WORKFLOW.md`.
